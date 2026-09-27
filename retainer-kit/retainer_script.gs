/**
 * Retainer & Recurring Revenue Kit — Google Apps Script
 * =====================================================
 * Paste this entire file into Extensions → Apps Script in Google Sheets.
 *
 * What it does:
 * - Keeps every monthly retainer on file: fee, included hours, overage rate, billing day
 * - One click bills every due retainer as a draft invoice, including overage hours
 * - Will not double-bill a month: the period is stamped on the retainer row
 * - Utilisation from a plain hours log: promised 20h, logged 31h → bill the 11h
 * - Daily email: what is due and unbilled, what is coming, which client has gone quiet
 * - MRR, unbilled value and revenue-at-risk on their own dashboard tab
 *
 * Tabs this expects: Retainers, Retainer Hours, Clients, Settings
 * Output tabs: Retainer Dashboard, Retainer Activities
 * It also writes to the "Invoices" tab so the Invoice Kit can PDF and chase them.
 *
 * Every internal helper is prefixed rr_ so this file can share an Apps Script
 * project with the CRM, Invoice Kit and Proposals Kit without name collisions.
 */

// ─── CONFIGURATION ──────────────────────────────────────────────────────────
const RR = {
  retainersSheet: 'Retainers',
  hoursSheet: 'Retainer Hours',
  activitiesSheet: 'Retainer Activities',
  dashboardSheet: 'Retainer Dashboard',
  clientsSheet: 'Clients',      // same schema as the Invoice Kit on purpose — shared tab
  settingsSheet: 'Settings',
  invoicesSheet: 'Invoices',
  // Column indexes on the Retainers tab, 0-based.
  col: {
    number: 0, client: 1, start: 2, end: 3, fee: 4, includedHours: 5, overageRate: 6,
    taxRate: 7, billingDay: 8, status: 9, lastBilled: 10, notes: 11
  },
  // Column indexes on the Retainer Hours tab, 0-based.
  hoursCol: { date: 0, client: 1, number: 2, hours: 3, note: 4 },
  clientCols: { name: 0, email: 1, address: 2, phone: 3, gstin: 4 },
  dayMs: 86400000
};

const RR_HEADERS = [
  'Retainer #', 'Client', 'Start', 'End (optional)', 'Monthly Fee', 'Included Hours',
  'Overage Rate / hr', 'Tax %', 'Billing Day', 'Status', 'Last Billed Period', 'Notes'
];

const RR_HOURS_HEADERS = ['Date', 'Client', 'Retainer #', 'Hours', 'Note'];

const RR_ACTIVITY_HEADERS = ['Date', 'Retainer #', 'Type', 'Detail'];

// Only these count as billable. Paused and Cancelled deliberately are not: a
// paused client is not going to pay, and reminding you daily about them is noise.
const RR_BILLABLE_STATUS = ['active'];

const RR_INVOICE_HEADERS = [
  'Invoice #', 'Client', 'Issue Date', 'Due Date', 'Line Items (one per line)',
  'Subtotal', 'Tax %', 'Tax', 'Total', 'Status', 'Paid Date', 'Currency', 'Notes'
];

// ─── SETUP — Creates tabs and headers ───────────────────────────────────────
function setupRetainers() {
  const book = rrSheet_();

  [RR.retainersSheet, RR.hoursSheet, RR.activitiesSheet, RR.dashboardSheet,
   RR.clientsSheet, RR.settingsSheet].forEach(name => {
    if (!book.getSheetByName(name)) book.insertSheet(name);
  });

  // Seed, never clear() and never overwrite: Settings is shared with the other
  // kits in bundle installs, and a filled cell belongs to the user or a kit
  // that ran Setup first.
  rrSeedSettings_({
    'Your Business Name': 'Your Business',
    'Your Email': Session.getActiveUser().getEmail(),
    'Default Currency': 'INR',
    'Default Tax Rate (%)': '18',
    'Payment Terms (days)': '7',
    'Silence Alert (days)': '21',
    'Renewal Length (months)': '3',
    // Defaults for 🆕 New Retainer. They live on the Settings tab rather than in
    // the code so "my retainers are all 20h billed on the 1st" is a typing job.
    'Default Included Hours': '20',
    'Default Overage Rate / hr': '0',
    'Default Billing Day': '1',
    'Retainer Number Prefix': 'RET-'
  });

  rrWriteHeaders_(book.getSheetByName(RR.retainersSheet), RR_HEADERS);
  rrWriteHeaders_(book.getSheetByName(RR.hoursSheet), RR_HOURS_HEADERS);
  rrWriteHeaders_(book.getSheetByName(RR.activitiesSheet), RR_ACTIVITY_HEADERS);

  const clients = book.getSheetByName(RR.clientsSheet);
  if (clients.getLastRow() === 0) {
    clients.getRange('A1:E1').setValues([[
      'Client Name', 'Email', 'Address', 'Phone', 'GSTIN / Tax ID'
    ]]).setFontWeight('bold');
  }
  // If the Invoice Kit tab already exists, make sure it has headers to write into.
  const invoices = book.getSheetByName(RR.invoicesSheet);
  if (invoices) rrWriteInvoiceHeaders_(invoices);

  rrRefreshDashboard();
  rrUi().alert(
    'Retainer Kit ready',
    'Add your retainers on the Retainers tab (or 🆕 New Retainer), log hours on Retainer Hours, ' +
    'then run 🧾 Bill Due Retainers on the 1st of each month.',
    'OK'
  );
}

// ─── HELPERS ────────────────────────────────────────────────────────────────
function rrSheet_() { return SpreadsheetApp.getActiveSpreadsheet(); }
function rrUi() { return SpreadsheetApp.getUi(); }

function rrSettings_() {
  const sheet = rrSheet_().getSheetByName(RR.settingsSheet);
  if (!sheet || sheet.getLastRow() < 2) return {};
  const out = {};
  // Whole-column scan: in bundle installs the other kits append their own rows.
  sheet.getDataRange().getValues().slice(1).forEach(r => {
    const key = String(r[0]).trim();
    if (key) out[key] = r[1];
  });
  return out;
}

function rrSeedSettings_(defaults) {
  const book = rrSheet_();
  let sheet = book.getSheetByName(RR.settingsSheet);
  if (!sheet) sheet = book.insertSheet(RR.settingsSheet);
  if (sheet.getLastRow() === 0) {
    sheet.getRange('A1:B1').setValues([['Setting', 'Value']]).setFontWeight('bold');
  }
  const at = {};
  const filled = {};
  sheet.getDataRange().getValues().slice(1).forEach((r, i) => {
    const key = String(r[0]).trim();
    if (!key) return;
    at[key] = i + 2;
    // A key that already holds something belongs to the user or to another kit.
    if (String(r[1] === null || r[1] === undefined ? '' : r[1]).trim() !== '') filled[key] = true;
  });
  // Seed, never overwrite: this tab is shared in bundle installs, so a second
  // kit's Setup used to blank the first one's GSTIN, address and email. A key
  // left empty is fair game — that is a placeholder waiting to be filled.
  Object.keys(defaults).forEach(key => {
    if (!at[key]) sheet.appendRow([key, defaults[key]]);
    else if (!filled[key]) sheet.getRange(at[key], 2).setValue(defaults[key]);
  });
}

function rrWriteHeaders_(sheet, headers) {
  if (String(sheet.getRange(1, 1).getValue()) === String(headers[0])) return;
  if (sheet.getLastRow() > 0) sheet.insertRowsBefore(1, 1);
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
}

function rrWriteInvoiceHeaders_(sheet) {
  rrWriteHeaders_(sheet, RR_INVOICE_HEADERS);
}

function rrRows_() {
  const sheet = rrSheet_().getSheetByName(RR.retainersSheet);
  if (!sheet) return [];
  const data = sheet.getDataRange().getValues();
  return data.slice(1)
    .map((r, i) => ({ row: i + 2, v: r }))
    .filter(o => String(o.v[RR.col.number] || '').trim() !== '' ||
                 String(o.v[RR.col.client] || '').trim() !== '');
}

function rrHourRows_() {
  const sheet = rrSheet_().getSheetByName(RR.hoursSheet);
  if (!sheet || sheet.getLastRow() < 2) return [];
  return sheet.getDataRange().getValues().slice(1)
    .map((r, i) => ({ row: i + 2, v: r }))
    // Keep a row whenever either of its two meaningful cells is filled in, even if
    // the date will not parse. Dropping unparseable rows here would hide them from
    // 🔎 Reconcile Hours Log too, and a silently-ignored entry is money nobody billed.
    .filter(o => String(o.v[RR.hoursCol.date] || '').trim() !== '' ||
                 String(o.v[RR.hoursCol.hours] || '').trim() !== '');
}

// Resolve the row the user selected, or null with a message if they selected
// blank space or the header line. Without this, "set status" on row 1 writes
// Cancelled over the Status header and the tab is quietly corrupted.
function rrSelected_() {
  const sheet = rrSheet_().getSheetByName(RR.retainersSheet);
  if (!sheet) { rrUi().alert('Run 📅 Retainers → ⚙️ Run Setup first.'); return null; }
  const rowIndex = sheet.getActiveRange().getRow();
  const found = rrRows_().filter(o => o.row === rowIndex)[0];
  if (!found) { rrUi().alert('Select a retainer row first.'); return null; }
  if (!String(found.v[RR.col.number] || '').trim()) {
    rrUi().alert('That row has no Retainer #.', 'Give it a number (or 🆕 New Retainer) first.', 'OK');
    return null;
  }
  return { sheet: sheet, row: found.row, v: found.v };
}

function rrDay_(value) {
  if (value instanceof Date) return isNaN(value.getTime()) ? null : value;
  const text = String(value === null || value === undefined ? '' : value).trim();
  if (!text) return null;
  const parsed = new Date(text);
  return isNaN(parsed.getTime()) ? null : parsed;
}

function rrMoney_(amount, currency) {
  const cur = currency || 'INR';
  const symbol = { INR: '₹', USD: '$', EUR: '€', GBP: '£' }[cur] || (cur + ' ');
  const n = Number(amount) || 0;
  return symbol + n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function rrPeriod_(date) {
  return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0');
}

function rrDaysBetween_(from, to) {
  const a = new Date(from.getFullYear(), from.getMonth(), from.getDate()).getTime();
  const b = new Date(to.getFullYear(), to.getMonth(), to.getDate()).getTime();
  return Math.round((b - a) / RR.dayMs);
}

function rrNumber_(n) {
  const value = Number(n);
  return isNaN(value) ? 0 : value;
}

// "2026-09" -> how many hours were logged in that month against this retainer.
function rrHoursInPeriod_(retainer, period) {
  let hours = 0;
  rrHourRows_().forEach(o => {
    const when = rrDay_(o.v[RR.hoursCol.date]);
    if (!when || rrPeriod_(when) !== period) return;
    if (rrHoursMatch_(retainer, o)) hours += rrNumber_(o.v[RR.hoursCol.hours]);
  });
  return Math.round(hours * 100) / 100;
}

// Most recent hours entry for this client/retainer, used by the silence check.
function rrLastLogged_(retainer) {
  let latest = null;
  rrHourRows_().forEach(o => {
    const when = rrDay_(o.v[RR.hoursCol.date]);
    if (!when || !rrHoursMatch_(retainer, o)) return;
    if (!latest || when > latest) latest = when;
  });
  return latest;
}

function rrLog_(number, type, detail) {
  const sheet = rrSheet_().getSheetByName(RR.activitiesSheet);
  if (!sheet) return;
  if (sheet.getLastRow() === 0) rrWriteHeaders_(sheet, RR_ACTIVITY_HEADERS);
  sheet.appendRow([new Date(), number, type, detail]);
}

function rrNextNumber_() {
  const prefix = String(rrSettings_()['Retainer Number Prefix'] || 'RET-');
  const used = rrRows_()
    .map(o => String(o.v[RR.col.number]))
    .filter(x => x.indexOf(prefix) === 0)
    .map(x => parseInt(x.slice(prefix.length), 10))
    .filter(n => !isNaN(n));
  const next = (used.length ? Math.max.apply(null, used) : 0) + 1;
  return prefix + String(next).padStart(3, '0');
}

// Hours rows are matched by retainer # when present, because a client can hold
// more than one retainer and a client-name match would bill the hours twice.
function rrHoursMatch_(r, o) {
  const number = String(o.v[RR.hoursCol.number] || '').trim();
  if (number) return number.toLowerCase() === String(r.number).trim().toLowerCase();
  const client = String(o.v[RR.hoursCol.client] || '').trim().toLowerCase();
  return client !== '' && client === String(r.client).trim().toLowerCase();
}

// ─── THE MONEY MATH ─────────────────────────────────────────────────────────
// Everything downstream (dashboard, email, billing, alerts) reads this one
// function, so "is it due" cannot mean different things in different places.
function rrShape_(v) {
  const today = new Date();
  const period = rrPeriod_(today);
  const fee = rrNumber_(v[RR.col.fee]);
  const includedHours = rrNumber_(v[RR.col.includedHours]);
  const overageRate = rrNumber_(v[RR.col.overageRate]);
  const taxRate = rrNumber_(v[RR.col.taxRate]);
  const status = String(v[RR.col.status] || '').trim() || 'Active';
  const lastBilled = String(v[RR.col.lastBilled] || '').trim();
  const start = rrDay_(v[RR.col.start]);
  const end = rrDay_(v[RR.col.end]);
  const number = String(v[RR.col.number] || '').trim();
  const client = String(v[RR.col.client] || '').trim();

  const logged = rrHoursInPeriod_({ number: number, client: client }, period);
  // Overage needs an agreed threshold. With no Included Hours on the row this is a
  // flat monthly fee, and billing every logged hour at the rate would invent a
  // surprise invoice the client never agreed to. Hours still log for history.
  const overageHours = includedHours > 0
    ? Math.max(0, Math.round((logged - includedHours) * 100) / 100) : 0;
  const overageValue = Math.round(overageHours * overageRate * 100) / 100;
  const subtotal = Math.round((fee + overageValue) * 100) / 100;
  // Same rounding rule as the Invoice Kit and Proposals Kit: paisa-accurate and
  // recomputable, so a recalculated invoice never disagrees with this number.
  const tax = Math.round(subtotal * taxRate) / 100;
  const total = Math.round((subtotal + tax) * 100) / 100;
  const utilisation = includedHours > 0 ? Math.round((logged / includedHours) * 1000) / 10 : 0;

  const active = RR_BILLABLE_STATUS.indexOf(status.toLowerCase()) >= 0;
  let billDay = rrNumber_(v[RR.col.billingDay]) || 1;
  if (billDay < 1) billDay = 1;
  if (billDay > 28) billDay = 28;
  // "In force" is narrower than "Active": work that has not started or has already
  // ended is a real retainer, but reporting on it as if it were live — a client
  // who has "gone quiet" when the engagement simply finished — is a false alarm.
  const ended = !!end && rrDaysBetween_(today, end) < 0;
  const started = !start || start <= today;
  const inForce = active && started && !ended;

  // Waiting for the billing day is its own state, not a string the email has to
  // parse: "due in 2 days" is the one thing a buyer checks this number against.
  let due = false, reason = '', waitingDays = null;
  if (!number) reason = 'no retainer number';
  else if (!active) reason = status.toLowerCase() + ', not billable';
  else if (lastBilled === period) reason = 'already billed for ' + period;
  else if (fee <= 0) reason = 'no monthly fee on the row';
  else if (!started) reason = 'starts ' + rrPeriod_(start) + ', not this month';
  else if (ended) reason = 'ended ' + rrPeriod_(end);
  else if (today.getDate() < billDay) {
    reason = 'not due until day ' + billDay;
    waitingDays = billDay - today.getDate();
  } else due = true;

  return {
    number: number, client: client, fee: fee, includedHours: includedHours,
    overageRate: overageRate, taxRate: taxRate, billingDay: billDay, status: status,
    lastBilled: lastBilled, start: start, end: end, period: period, logged: logged,
    overageHours: overageHours, overageValue: overageValue, subtotal: subtotal,
    tax: tax, total: total, utilisation: utilisation, due: due, reason: reason,
    waitingDays: waitingDays, active: active, ended: ended, started: started,
    inForce: inForce, v: v
  };
}

function recalcRetainerTotals() {
  const sel = rrSelected_();
  if (!sel) return null;
  const r = rrShape_(sel.v);
  const cur = String(rrSettings_()['Default Currency'] || 'INR');
  rrUi().alert(
    r.number + ' — ' + r.client,
    'Fee ' + rrMoney_(r.fee, cur) + ' · included ' + r.includedHours + 'h\n' +
    'Logged this period ' + r.logged + 'h · overage ' + r.overageHours + 'h\n' +
    'This month: ' + rrMoney_(r.subtotal, cur) + ' + ' + rrMoney_(r.tax, cur) +
    ' tax = ' + rrMoney_(r.total, cur) + '\n' +
    (r.due ? 'Due to bill now.' : 'Not billing: ' + r.reason + '.'),
    'OK'
  );
  return r;
}

// ─── NEW RETAINER ───────────────────────────────────────────────────────────
function createRetainer() {
  const sheet = rrSheet_().getSheetByName(RR.retainersSheet);
  if (!sheet) { rrUi().alert('Run 📅 Retainers → ⚙️ Run Setup first.'); return; }
  rrWriteHeaders_(sheet, RR_HEADERS);
  const s = rrSettings_();
  const today = new Date();
  const row = [
    rrNextNumber_(), '', today, '', 0,
    rrNumber_(s['Default Included Hours'] || 0), rrNumber_(s['Default Overage Rate / hr'] || 0),
    rrNumber_(s['Default Tax Rate (%)'] || 0), rrNumber_(s['Default Billing Day'] || 1),
    'Active', '', ''
  ];
  sheet.appendRow(row);
  sheet.setActiveRange(sheet.getRange(sheet.getLastRow(), RR.col.client + 1));
  rrUi().alert(
    'Draft ' + row[0] + ' created',
    'Fill in the client (must match the Clients tab), monthly fee and included hours.\n\n' +
    'Set a Billing Day and this retainer gets picked up automatically by 🧾 Bill Due Retainers.',
    'OK'
  );
}

// ─── HOURS LOG ──────────────────────────────────────────────────────────────
// The buyer types hours rows directly; this just seeds the date and client so the
// log stays consistent without a prompt dialog to misclick.
function addHoursRowForSelected() {
  const book = rrSheet_();
  const sel = rrSelected_();
  if (!sel) return null;
  let hours = book.getSheetByName(RR.hoursSheet);
  if (!hours) hours = book.insertSheet(RR.hoursSheet);
  rrWriteHeaders_(hours, RR_HOURS_HEADERS);
  const number = String(sel.v[RR.col.number] || '').trim();
  hours.appendRow([new Date(), String(sel.v[RR.col.client] || ''), number, '', '']);
  hours.setActiveRange(hours.getRange(hours.getLastRow(), RR.hoursCol.hours + 1));
  rrUi().alert('Row added', 'Type the hours against ' + number + ' on the Retainer Hours tab.', 'OK');
  return { row: hours.getLastRow(), number: number };
}

// Data hygiene on the hours log — bad rows silently move money, so check them.
function reconcileHours() {
  const book = rrSheet_();
  const hoursSheet = book.getSheetByName(RR.hoursSheet);
  const report = { unknownNumber: [], unknownClient: [], unattributed: [], badHours: [], badDates: [], ok: 0 };
  if (!hoursSheet || hoursSheet.getLastRow() < 2) {
    rrUi().alert('Nothing to check', 'The Retainer Hours tab has no entries yet.', 'OK');
    return report;
  }
  const numbers = {};
  const clients = {};
  rrRows_().forEach(o => {
    numbers[String(o.v[RR.col.number]).trim().toLowerCase()] = true;
    clients[String(o.v[RR.col.client]).trim().toLowerCase()] = true;
  });
  rrHourRows_().forEach(o => {
    const when = rrDay_(o.v[RR.hoursCol.date]);
    const raw = o.v[RR.hoursCol.date];
    const hours = rrNumber_(o.v[RR.hoursCol.hours]);
    const number = String(o.v[RR.hoursCol.number] || '').trim();
    const client = String(o.v[RR.hoursCol.client] || '').trim();
    const at = 'row ' + o.row;
    if (!when) {
      // Blank or unparseable: either way the entry cannot fall into a billing
      // period, so it is money that will never be invoiced. Name the entry, not
      // just the row — an undated row is exactly the one the log does not sort.
      const what = (client || number || 'entry') + ' · ' +
        (String(o.v[RR.hoursCol.hours] || '').trim() || '?') + 'h';
      report.badDates.push(String(raw || '').trim()
        ? at + ' (' + what + '): "' + raw + '" is not a date'
        : at + ' (' + what + '): no date, so these hours never land in a billing period');
    } else if (hours <= 0 || hours > 24) {
      report.badHours.push(at + ': ' + (String(o.v[RR.hoursCol.hours] || '').trim() || 'nothing') +
        ' — hours must be between 1 and 24');
    } else if (number && !numbers[number.toLowerCase()]) {
      report.unknownNumber.push(at + ': ' + number + ' is not on the Retainers tab');
    } else if (!number && client && !clients[client.toLowerCase()]) {
      report.unknownClient.push(at + ': ' + client + ' has no retainer');
    } else if (!number && !client) {
      // Valid date, valid hours, nobody it belongs to: this is the one row that
      // would otherwise be reported as clean while billing nothing.
      report.unattributed.push(at + ': ' + hours + 'h has no Retainer # and no client');
    } else {
      report.ok++;
    }
  });
  const problems = report.badDates.length + report.badHours.length +
    report.unknownNumber.length + report.unknownClient.length + report.unattributed.length;
  const lines = [];
  if (report.badDates.length) lines.push('UNPARSEABLE DATES\n' + report.badDates.join('\n'));
  if (report.badHours.length) lines.push('IMPOSSIBLE HOURS\n' + report.badHours.join('\n'));
  if (report.unknownNumber.length) lines.push('UNKNOWN RETAINER #\n' + report.unknownNumber.join('\n'));
  if (report.unknownClient.length) lines.push('HOURS FOR A CLIENT WITH NO RETAINER\n' + report.unknownClient.join('\n'));
  if (report.unattributed.length) lines.push('HOURS WITH NO OWNER\n' + report.unattributed.join('\n'));
  rrUi().alert(
    problems ? problems + ' row(s) need a fix' : 'Hours log is clean',
    (lines.join('\n\n') || report.ok + ' entries all reconcile to a retainer.') +
    '\n\nAnything unreconciled is missing from your overage billing.',
    'OK'
  );
  return report;
}

// ─── STATUS MOVES ───────────────────────────────────────────────────────────
function rrSetStatus_(status) {
  const sel = rrSelected_();
  if (!sel) return;
  const current = String(sel.v[RR.col.status] || '').trim() || 'Active';
  if (current === status) {
    rrUi().alert('Already ' + status + '.', sel.v[RR.col.number] + ' is where it is.', 'OK');
    return;
  }
  sel.sheet.getRange(sel.row, RR.col.status + 1).setValue(status);
  rrLog_(String(sel.v[RR.col.number]), 'Status', current + ' → ' + status);
  rrRefreshDashboard();
  rrUi().alert('Updated', sel.v[RR.col.number] + ': ' + current + ' → ' + status, 'OK');
}

function setRetainerActive() { rrSetStatus_('Active'); }
function setRetainerPaused() { rrSetStatus_('Paused'); }
function setRetainerCancelled() { rrSetStatus_('Cancelled'); }

function renewSelectedRetainer() {
  const sel = rrSelected_();
  if (!sel) return null;
  const months = rrNumber_(rrSettings_()['Renewal Length (months)']) || 3;
  const today = new Date();
  const current = rrDay_(sel.v[RR.col.end]);
  // Extend from whichever is later: a deal that lapsed two months ago should not
  // quietly buy back the time that already went by.
  const from = current && current > today ? current : today;
  const until = new Date(from.getTime());
  until.setMonth(until.getMonth() + months);
  sel.sheet.getRange(sel.row, RR.col.end + 1).setValue(until);
  if (String(sel.v[RR.col.status] || '').trim().toLowerCase() === 'expired') {
    sel.sheet.getRange(sel.row, RR.col.status + 1).setValue('Active');
  }
  rrLog_(String(sel.v[RR.col.number]), 'Renewal', 'End date extended to ' + rrPeriod_(until) + ' + ' + until.getDate() + ' (' + months + ' months)');
  rrRefreshDashboard();
  rrUi().alert(
    'Renewed', sel.v[RR.col.number] + ' now runs to ' +
    Utilities.formatDate(until, Session.getScriptTimeZone(), 'dd MMM yyyy') + '.',
    'OK'
  );
  return until;
}

// ─── MONTHLY BILLING RUN ────────────────────────────────────────────────────
// The product's whole reason to exist: one click, every due retainer becomes a
// correctly-priced draft invoice, and nothing gets billed twice.
function runMonthlyBilling() {
  const book = rrSheet_();
  const sheet = book.getSheetByName(RR.retainersSheet);
  if (!sheet) { rrUi().alert('Run ⚙️ Run Setup first.'); return null; }
  rrWriteHeaders_(sheet, RR_HEADERS);

  let invoices = book.getSheetByName(RR.invoicesSheet);
  if (!invoices) invoices = book.insertSheet(RR.invoicesSheet);
  rrWriteInvoiceHeaders_(invoices);

  const s = rrSettings_();
  const currency = String(s['Default Currency'] || 'INR');
  const terms = rrNumber_(s['Payment Terms (days)']) || 14;
  const today = new Date();
  const period = rrPeriod_(today);
  const created = [], skipped = [];

  rrRows_().forEach(o => {
    const r = rrShape_(o.v);
    if (!r.due) {
      if (r.number) skipped.push({ number: r.number, client: r.client, reason: r.reason });
      return;
    }
    let number = '';
    try {
      number = rrNextInvoiceNumber_(invoices);
    } catch (e) {
      skipped.push({ number: r.number, client: r.client, reason: 'could not allocate an invoice number' });
      return;
    }
    const lines = [r.fee > 0 ? 'Monthly retainer — ' + period + ' | 1 | ' + r.fee : ''];
    if (r.overageValue > 0) {
      lines.push('Overage: ' + r.overageHours + 'h beyond ' + r.includedHours + 'h | ' +
        r.overageHours + ' | ' + r.overageRate);
    }
    const items = lines.filter(Boolean).join('\n');
    const dueDate = new Date(today.getTime() + terms * RR.dayMs);

    invoices.appendRow([
      number, r.client, today, dueDate, items,
      r.subtotal, r.taxRate, r.tax, r.total, 'Draft', '', currency,
      'Retainer ' + r.number + ' — ' + period +
        (r.overageHours > 0 ? ' (includes ' + r.overageHours + 'h overage)' : '')
    ]);
    sheet.getRange(o.row, RR.col.lastBilled + 1).setValue(period);
    rrLog_(r.number, 'Invoice', 'Created draft ' + number + ' for ' + rrMoney_(r.total, currency));
    created.push({ number: r.number, client: r.client, invoice: number, total: r.total,
                   overageHours: r.overageHours, period: period });
  });

  if (created.length) rrRefreshDashboard();
  const billedValue = created.reduce((sum, c) => sum + c.total, 0);
  if (!created.length) {
    rrUi().alert(
      'Nothing billed',
      'No retainer is due for ' + period + '.\n\n' +
      (skipped.length ? 'Why each one was skipped:\n' +
        skipped.map(x => '  ' + x.number + ' — ' + x.reason).join('\n') : 'You have no retainers on file.'),
      'OK'
    );
    return { created: created, skipped: skipped, period: period, billed: 0 };
  }
  rrUi().alert(
    created.length + ' invoice draft(s) created',
    created.map(c => '  ' + c.invoice + ' · ' + c.client + ' · ' + rrMoney_(c.total, currency) +
      (c.overageHours > 0 ? ' (+' + c.overageHours + 'h overage)' : '')).join('\n') +
    '\n\nTotal ' + rrMoney_(billedValue, currency) + '\n\n' +
    'They are Drafts on the Invoices tab — check the line items, then send the PDFs.',
    'OK'
  );
  return { created: created, skipped: skipped, period: period, billed: billedValue };
}

function rrNextInvoiceNumber_(invoices) {
  const prefix = 'INV-';
  let used = [];
  try {
    const data = invoices.getDataRange().getValues();
    used = data.slice(1)
      .map(r => String(r[0] || '').trim())
      .filter(x => x.indexOf(prefix) === 0)
      .map(x => parseInt(x.slice(prefix.length), 10))
      .filter(n => !isNaN(n));
  } catch (e) { used = []; }
  const next = (used.length ? Math.max.apply(null, used) : 0) + 1;
  return prefix + String(next).padStart(4, '0');
}

// ─── DASHBOARD ──────────────────────────────────────────────────────────────
function rrRefreshDashboard() {
  const book = rrSheet_();
  const sheet = book.getSheetByName(RR.dashboardSheet);
  const today = new Date();
  const period = rrPeriod_(today);
  const s = rrSettings_();
  const currency = String(s['Default Currency'] || 'INR');
  const silenceAfter = rrNumber_(s['Silence Alert (days)']) || 21;

  const rows = rrRows_().map(o => rrShape_(o.v));
  const active = rows.filter(r => r.active);
  // MRR is work you are actually covering this month. An engagement that ended on
  // the 31st is not recurring revenue, and counting it inflates the one number a
  // solo business uses to decide whether it can breathe.
  const force = rows.filter(r => r.inForce);
  const mrr = force.reduce((sum, r) => sum + r.fee, 0);
  const billed = rows.filter(r => r.lastBilled === period);
  const unbilled = force.filter(r => r.due);
  const notDueYet = force.filter(r => r.waitingDays !== null);
  const unbilledValue = unbilled.reduce((sum, r) => sum + r.total, 0);
  const overageHours = force.reduce((sum, r) => sum + r.overageHours, 0);
  const overageValue = force.reduce((sum, r) => sum + r.overageValue, 0);
  const withHours = force.filter(r => r.includedHours > 0);
  const avgUtilisation = withHours.length
    ? Math.round((withHours.reduce((sum, r) => sum + r.utilisation, 0) / withHours.length) * 10) / 10
    : 0;
  // Still flagged Active although the end date has passed — the honest label for
  // these is "fix the status", not "at risk" and not "safe".
  const endedButActive = active.filter(r => r.ended);

  const endingSoon = [], quiet = [];
  rows.forEach(r => {
    if (r.end && !r.ended) {
      const left = rrDaysBetween_(today, r.end);
      if (left <= 30 && r.inForce) {
        endingSoon.push({ number: r.number, client: r.client, days: left, mrr: r.fee });
      }
    }
    // Only work that is genuinely running can "go quiet". An ended engagement
    // with no recent hours is not a churn signal — it is finished.
    if (r.inForce) {
      const last = rrLastLogged_({ number: r.number, client: r.client });
      const days = last ? rrDaysBetween_(last, today) : null;
      if (!last || days > silenceAfter) {
        quiet.push({ number: r.number, client: r.client, days: days, mrr: r.fee });
      }
    }
  });
  endingSoon.sort((a, b) => a.days - b.days);
  quiet.sort((a, b) => (b.days || 9999) - (a.days || 9999));

  // Billed-per-period trend, straight from the rows we stamp during billing.
  const trend = {};
  rows.forEach(r => {
    if (!r.lastBilled) return;
    const t = trend[r.lastBilled] || (trend[r.lastBilled] = { count: 0, value: 0 });
    t.count++; t.value += r.total;
  });
  const trendKeys = Object.keys(trend).sort();

  if (!sheet) return { period: period, mrr: mrr, activeCount: force.length, unbilled: unbilled,
                       overageHours: overageHours, overageValue: overageValue, endingSoon: endingSoon, quiet: quiet,
                       avgUtilisation: avgUtilisation, unbilledValue: unbilledValue,
                       billedCount: billed.length, currency: currency,
                       endedButActive: endedButActive, markedActive: active.length };

  sheet.clear();
  sheet.getRange(1, 1).setValue('Retainer Dashboard');
  sheet.getRange(1, 1).setFontWeight('bold');
  sheet.getRange(2, 1, 1, 3).setValues([['Updated', today, 'period ' + period]]);

  // Revenue at risk counts each retainer once: one that is both ending and quiet is
  // one problem, not two.
  const atRiskSeen = {};
  endingSoon.concat(quiet).forEach(x => { atRiskSeen[x.number] = true; });
  const atRiskValue = force
    .filter(r => atRiskSeen[r.number])
    .reduce((sum, r) => sum + r.fee, 0);

  const headline = [
    { label: 'Retainers In Force', value: force.length,
      note: active.length + ' marked Active' +
        (endedButActive.length ? ' — ' + endedButActive.length + ' past their end date' : '') },
    { label: 'Monthly Recurring', value: mrr, 'note': 'fees for work actually running, before tax' },
    { label: 'Billed This Period', value: billed.length, note: '' },
    { label: 'Unbilled & Due Now', value: unbilledValue,
      note: unbilled.length + ' retainer(s) — run 🧾 Bill Due Retainers' },
    { label: 'Overage Billable', value: overageValue,
      note: overageHours + 'h beyond included hours this month' },
    // The format travels next to the value it formats: a percentage written into
    // a plain-number row reads as "0" on the sheet.
    // Stored as a fraction so the 0% format renders it, and rounded because
    // 70.4 / 100 is 0.7040000000000001 in binary floating point — visible the
    // moment a buyer clicks the cell.
    { label: 'Average Utilisation', value: Math.round(avgUtilisation * 1000) / 100000,
      note: 'logged hours vs included hours', format: '0%' },
    { label: 'Revenue At Risk', value: atRiskValue,
      note: endingSoon.length + ' ending within 30 days, ' + quiet.length + ' with no recent hours' }
  ];
  const FIRST = 4;
  headline.forEach((h, i) => {
    sheet.getRange(FIRST + i, 1, 1, 3).setValues([[h.label, h.value, h.note]]);
    sheet.getRange(FIRST + i, 1).setFontWeight('bold');
    sheet.getRange(FIRST + i, 2).setNumberFormat(h.format || '#,##0');
  });

  const r = FIRST + headline.length + 1;
  const utilisation = force.slice().sort((a, b) => b.fee - a.fee);

  const section = (at, headers, body) => {
    sheet.getRange(at, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
    // An empty list still gets a row: a heading with nothing under it reads as
    // "the report is broken", not "there is nothing to report".
    const rows = body.length ? body : [headers.map((h, i) => (i === 0 ? '—' : ''))];
    sheet.getRange(at + 1, 1, rows.length, headers.length).setValues(rows);
    return at + 1 + rows.length;
  };

  const util = section(r, ['Client', 'Retainer', 'Fee', 'Included h', 'Logged h', 'Utilisation'],
    utilisation.map(x => [x.client, x.number, x.fee, x.includedHours, x.logged,
      // Same rounding rule as the headline: a percentage column should not show
      // the binary tail when the cell is clicked.
      x.includedHours > 0 ? Math.round(x.utilisation * 1000) / 100000 : '']));
  if (utilisation.length) {
    sheet.getRange(r + 1, 3, utilisation.length, 1).setNumberFormat('#,##0');
    sheet.getRange(r + 1, 6, utilisation.length, 1).setNumberFormat('0%');
  }

  const trendRows = trendKeys.map(k => [k, trend[k].count, Math.round(trend[k].value)]);
  const afterTrend = section(util + 2, ['Period', 'Retainers Billed', 'Value'], trendRows);

  const afterDue = section(afterTrend + 2, ['Due & Unbilled', 'Client', 'Amount', 'Action'],
    unbilled.map(x => [x.number, x.client, rrMoney_(x.total, currency), 'run 🧾 Bill Due Retainers']));

  const afterLater = section(afterDue + 2, ['Not Due Yet This Month', 'Client', 'Billing Day', ''],
    notDueYet.map(x => [x.number, x.client, 'due on day ' + x.billingDay, '']));

  const afterEnd = section(afterLater + 2, ['Ending Within 30 Days', 'Client', 'Ends', 'Fee / month'],
    endingSoon.map(x => [x.number, x.client, 'ends in ' + x.days + 'd', rrMoney_(x.mrr, currency)]));

  const afterQuiet = section(afterEnd + 2, ['No Hours Logged Recently', 'Client', 'Last Entry', 'Fee / month'],
    quiet.map(x => [x.number, x.client,
      x.days === null ? 'nothing logged yet' : x.days + 'd ago', rrMoney_(x.mrr, currency)]));

  section(afterQuiet + 2, ['Past End Date But Still Active', 'Client', 'Ended', 'Fee / month'],
    endedButActive.map(x => [x.number, x.client,
      x.end ? Utilities.formatDate(x.end, Session.getScriptTimeZone(), 'dd MMM yyyy') : '',
      rrMoney_(x.fee, currency)]));

  return { period: period, mrr: mrr, activeCount: force.length, unbilled: unbilled,
           overageHours: overageHours, overageValue: overageValue, endingSoon: endingSoon, quiet: quiet,
           avgUtilisation: avgUtilisation, unbilledValue: unbilledValue,
           billedCount: billed.length, currency: currency, revenueAtRisk: atRiskValue,
           endedButActive: endedButActive, markedActive: active.length, inForce: force.length };
}

function refreshRetainerDashboard() {
  const d = rrRefreshDashboard();
  rrUi().alert(
    'Dashboard updated',
    d.activeCount + ' active · ' + rrMoney_(d.mrr, d.currency) + ' a month\n' +
    rrMoney_(d.unbilledValue, d.currency) + ' due and unbilled (' + d.unbilled.length + ' retainers)\n' +
    rrMoney_(d.overageValue, d.currency) + ' in overage this month · utilisation ' +
    d.avgUtilisation + '%\n' + d.endingSoon.length + ' ending within 30 days, ' +
    d.quiet.length + ' gone quiet',
    'OK'
  );
}

// ─── DAILY EMAIL ────────────────────────────────────────────────────────────
function dailyRetainerCheck() {
  const s = rrSettings_();
  const to = String(s['Your Email'] || Session.getActiveUser().getEmail());
  const currency = String(s['Default Currency'] || 'INR');
  const d = rrRefreshDashboard();

  const due = d.unbilled;
  // "Coming due" is read from the structured field, not by parsing the skip
  // reason — otherwise a reworded reason would silently empty this email section.
  const comingSoon = rrRows_().map(o => rrShape_(o.v)).filter(r =>
    r.waitingDays !== null && r.waitingDays <= 3);
  const endings = d.endingSoon;
  const silence = d.quiet;
  // A client can be both ending and quiet. Counting them twice would inflate the
  // one number in the subject line, so the subject counts distinct retainers.
  const atRiskSeen = {};
  endings.concat(silence).forEach(x => { atRiskSeen[x.number] = true; });
  const atRisk = Object.keys(atRiskSeen).length;

  if (!due.length && !comingSoon.length && !endings.length && !silence.length) {
    MailApp.sendEmail({
      to: to,
      subject: 'Retainers: all billed, nothing at risk',
      body: 'Nothing is due and unbilled, nothing ends within 30 days, and every active client ' +
        'has logged hours recently. ' + rrMoney_(d.mrr, currency) + ' a month is holding.'
    });
    return { mailed: true, due: 0, comingSoon: 0, endings: 0, silence: 0 };
  }

  const block = (title, lines) => (lines.length ? title + '\n' + lines.join('\n') + '\n\n' : '');
  const body =
    block('DUE AND UNBILLED — run 🧾 Bill Due Retainers', due.map(r =>
      '  ' + r.number + ' · ' + r.client + ' · ' + rrMoney_(r.total, currency) +
      (r.overageHours > 0 ? ' (incl. ' + r.overageHours + 'h overage)' : ''))) +
    block('COMING DUE WITHIN 3 DAYS', comingSoon.map(r =>
      '  ' + r.number + ' · ' + r.client + ' · ' + rrMoney_(r.total, currency) +
      ' · due on day ' + r.billingDay)) +
    block('ENDING WITHIN 30 DAYS — RENEW OR LET GO', endings.map(x =>
      '  ' + x.number + ' · ' + x.client + ' · ends in ' + x.days + 'd · ' +
      rrMoney_(x.mrr, currency) + '/mo')) +
    block('NO RECENT HOURS — THE QUIET CHURN SIGNAL', silence.map(x =>
      '  ' + x.number + ' · ' + x.client + ' · ' +
      (x.days === null ? 'nothing logged yet' : x.days + 'd since the last entry') + ' · ' +
      rrMoney_(x.mrr, currency) + '/mo')) +
    'Retainer billing runs from the menu; the invoices it writes are Drafts you approve.';

  MailApp.sendEmail({
    to: to,
    subject: 'Retainers: ' + due.length + ' unbilled, ' + atRisk + ' at risk',
    body: body
  });
  return { mailed: true, due: due.length, comingSoon: comingSoon.length,
           endings: endings.length, silence: silence.length };
}

function markExpiredRetainers() {
  const sheet = rrSheet_().getSheetByName(RR.retainersSheet);
  if (!sheet) { rrUi().alert('Run ⚙️ Run Setup first.'); return 0; }
  const today = new Date();
  let n = 0;
  rrRows_().forEach(o => {
    const end = rrDay_(o.v[RR.col.end]);
    const status = String(o.v[RR.col.status] || '').trim();
    if (!end || status !== 'Active' || end >= today) return;
    sheet.getRange(o.row, RR.col.status + 1).setValue('Expired');
    rrLog_(String(o.v[RR.col.number]), 'Status', 'Active → Expired (auto, ended ' +
      Utilities.formatDate(end, Session.getScriptTimeZone(), 'dd MMM yyyy') + ')');
    n++;
  });
  rrRefreshDashboard();
  rrUi().alert('Done', n ? n + ' ended retainer(s) marked Expired.' : 'No active retainer had passed its end date.', 'OK');
  return n;
}

function installRetainerReminder() {
  const triggers = ScriptApp.getProjectTriggers();
  const has = triggers.some(t => t.getHandlerFunction() === 'dailyRetainerCheck');
  if (!has) {
    ScriptApp.newTrigger('dailyRetainerCheck').timeBased().everyDays(1).atHour(9).create();
  }
  rrUi().alert('Installed', 'A short retainer email lands at 9am every day.', 'OK');
}

// ─── MENU ───────────────────────────────────────────────────────────────────
function retainerKitMenu_() {
  const ui = rrUi();
  ui.createMenu('📅 Retainers')
    .addItem('🆕 New Retainer', 'createRetainer')
    .addItem('🧾 Bill Due Retainers', 'runMonthlyBilling')
    .addItem('🔄 Recalculate Selected Retainer', 'recalcRetainerTotals')
    .addSeparator()
    .addItem('➕ Add Hours Row For Selected', 'addHoursRowForSelected')
    .addItem('🔎 Reconcile Hours Log', 'reconcileHours')
    .addSeparator()
    .addSubMenu(ui.createMenu('📌 Set Selected Retainer Status')
      .addItem('Active', 'setRetainerActive')
      .addItem('Paused', 'setRetainerPaused')
      .addItem('Cancelled', 'setRetainerCancelled'))
    .addItem('🔁 Renew Selected Retainer', 'renewSelectedRetainer')
    .addItem('⏱ Mark Ended Retainers Expired', 'markExpiredRetainers')
    .addSeparator()
    .addItem('📊 Refresh Dashboard', 'refreshRetainerDashboard')
    .addItem('⏰ Install Daily Billing Email', 'installRetainerReminder')
    .addItem('⚙️ Run Setup (once)', 'setupRetainers')
    .addToUi();
}

// ─── MENU HOOK ──────────────────────────────────────────────────────────────
// Apps Script keeps only ONE onOpen per project, so this block is identical in
// every LeadStack script: whichever file loads last wins, and it builds every
// menu whose builder exists. Install one product or all four — the menus are
// correct either way.
function onOpen() {
  const ui = SpreadsheetApp.getUi();
  if (typeof crmMenu_ === 'function') crmMenu_(ui);
  if (typeof invoiceKitMenu_ === 'function') invoiceKitMenu_(ui);
  if (typeof proposalKitMenu_ === 'function') proposalKitMenu_(ui);
  if (typeof retainerKitMenu_ === 'function') retainerKitMenu_(ui);
}
