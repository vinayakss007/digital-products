/**
 * Proposals & Quotes Kit — Google Apps Script
 * ===========================================
 * Paste this entire file into Extensions → Apps Script in Google Sheets.
 *
 * What it does:
 * - Turns a scope into a priced, dated proposal PDF in one click
 * - Sequential proposal numbers, validity dates that expire themselves
 * - Weighted win-rate dashboard: what's out there, what's closing, what's dying
 * - "Convert to invoice" hands the accepted scope straight to the Invoice Kit
 * - Daily email for proposals about to expire with no reply
 *
 * Tabs this expects: Clients, Proposals, Stages, Activities, Dashboard, Settings
 * It also writes to an "Invoices" tab if the Invoice Kit is installed.
 *
 * Every internal helper is prefixed pr_ so this file can live in the same
 * Apps Script project as the CRM and Invoice Kit without name collisions.
 */

// ─── CONFIGURATION ──────────────────────────────────────────────────────────
const PR = {
  proposalsSheet: 'Proposals',
  clientsSheet: 'Clients',   // same schema as the Invoice Kit on purpose — shared tab
  stagesSheet: 'Proposal Stages',
  activitiesSheet: 'Proposal Activities',
  dashboardSheet: 'Proposal Dashboard',
  settingsSheet: 'Settings',
  invoicesSheet: 'Invoices',
  // Column indexes on the Proposals tab, 0-based.
  col: {
    number: 0, client: 1, date: 2, validUntil: 3, scope: 4,
    subtotal: 5, taxRate: 6, tax: 7, total: 8, depositPct: 9, deposit: 10,
    status: 11, sentDate: 12, wonDate: 13, notes: 14
  },
  clientCols: { name: 0, email: 1, address: 2, phone: 3, gstin: 4 },
  folderKey: 'PR_PDF_FOLDER_ID',
  dayMs: 86400000
};

const PR_HEADERS = [
  'Proposal #', 'Client', 'Date', 'Valid Until', 'Scope (one line per item)',
  'Subtotal', 'Tax %', 'Tax', 'Total', 'Deposit %', 'Deposit Amount',
  'Status', 'Sent Date', 'Accepted Date', 'Notes'
];

// Stages worth emailing about. Accepted/Draft are deliberately missing: an
// accepted deal needs an invoice, not a reminder, and a draft was never sent.
const PR_LIVE_STAGES = ['sent', 'follow-up', 'negotiating'];

const PR_STAGE_DEFAULTS = [
  ['Draft', 1, 0, 'Written, not sent yet'],
  ['Sent', 2, 15, 'With the client, waiting'],
  ['Follow-up', 3, 35, 'Nudged, no answer yet'],
  ['Negotiating', 4, 60, 'Talking price or scope'],
  ['Accepted', 5, 90, 'Yes — send the invoice'],
  ['Won', 6, 100, 'Deposit or first payment in'],
  ['Lost', 7, 0, 'No'],
  ['Expired', 8, 5, 'Validity lapsed, no reply']
];

// ─── SETUP — Creates tabs and headers ───────────────────────────────────────
function setupProposals() {
  const book = prSheet_();

  [PR.proposalsSheet, PR.clientsSheet, PR.stagesSheet, PR.activitiesSheet,
   PR.dashboardSheet, PR.settingsSheet].forEach(name => {
    if (!book.getSheetByName(name)) book.insertSheet(name);
  });

  // Seed, never clear() and never overwrite: the Settings tab is shared with
  // the CRM and the other kits in bundle installs, and a filled row belongs
  // to whoever wrote it.
  prSeedSettings_({
    'Your Business Name': 'Your Business',
    'Your Address': 'Street, City, State, PIN',
    'Your Email': Session.getActiveUser().getEmail(),
    'Your Phone': '+91-XXXXXXXXXX',
    'GSTIN / Tax ID': '',
    'Default Currency': 'INR',
    'Default Tax Rate (%)': '18',
    'Proposal Valid For (days)': '14',
    'Default Deposit (%)': '40',
    'Proposal Number Prefix': 'PROP-'
  });

  const proposals = book.getSheetByName(PR.proposalsSheet);
  prWriteHeaders_(proposals);

  const clients = book.getSheetByName(PR.clientsSheet);
  if (clients.getLastRow() === 0) {
    clients.getRange('A1:E1').setValues([[
      'Client Name', 'Email', 'Address', 'Phone', 'GSTIN / Tax ID'
    ]]).setFontWeight('bold');
  }

  const stages = book.getSheetByName(PR.stagesSheet);
  stages.clear();
  stages.getRange('A1:D1').setValues([['Stage', 'Order', 'Win Chance (%)', 'Notes']]).setFontWeight('bold');
  stages.getRange(2, 1, PR_STAGE_DEFAULTS.length, 4).setValues(PR_STAGE_DEFAULTS);

  const acts = book.getSheetByName(PR.activitiesSheet);
  if (acts.getLastRow() === 0) {
    acts.getRange('A1:D1').setValues([['Date', 'Proposal #', 'Type', 'Detail']]).setFontWeight('bold');
  }

  prUpsertHeaders_(book);

  prRefreshDashboard();
  prUi().alert(
    'Proposals Kit ready',
    'Fill in Settings, add Clients, then create a proposal. Everything runs from the 📄 Proposals menu.',
    'OK'
  );
}

// ─── HELPERS ────────────────────────────────────────────────────────────────
function prSheet_() { return SpreadsheetApp.getActiveSpreadsheet(); }
function prUi() { return SpreadsheetApp.getUi(); }

function prSettings_() {
  const sheet = prSheet_().getSheetByName(PR.settingsSheet);
  if (!sheet || sheet.getLastRow() < 2) return {};
  const out = {};
  // Scan the whole column so rows appended by the other kits don't hide ours.
  sheet.getDataRange().getValues().slice(1).forEach(r => {
    const key = String(r[0]).trim();
    if (key) out[key] = r[1];
  });
  return out;
}

// Stage -> win chance, read from the Stages tab so the buyer can tune the math.
function prWeights_() {
  const sheet = prSheet_().getSheetByName(PR.stagesSheet);
  const out = {};
  if (!sheet || sheet.getLastRow() < 2) {
    PR_STAGE_DEFAULTS.forEach(r => { out[String(r[0]).toLowerCase()] = Number(r[2]); });
    return out;
  }
  sheet.getDataRange().getValues().slice(1).forEach(r => {
    const stage = String(r[0] || '').trim();
    if (stage) out[stage.toLowerCase()] = Number(r[2]) || 0;
  });
  return out;
}

function prWriteHeaders_(sheet) {
  if (String(sheet.getRange(1, 1).getValue()) === 'Proposal #') return;
  if (sheet.getLastRow() > 0) sheet.insertRowsBefore(1, 1);
  sheet.getRange(1, 1, 1, PR_HEADERS.length).setValues([PR_HEADERS]).setFontWeight('bold');
}

// Give the shared Invoices/Clients tabs headers so either kit can be installed first.
function prUpsertHeaders_(book) {
  const clients = book.getSheetByName(PR.clientsSheet);
  if (clients && clients.getLastRow() === 0) {
    clients.getRange('A1:E1').setValues([[
      'Client Name', 'Email', 'Address', 'Phone', 'GSTIN / Tax ID'
    ]]).setFontWeight('bold');
  }
  const invoices = book.getSheetByName(PR.invoicesSheet);
  if (invoices) prWriteInvoiceHeaders_(invoices);
}

function prWriteInvoiceHeaders_(sheet) {
  if (String(sheet.getRange(1, 1).getValue()) === 'Invoice #') return;
  if (sheet.getLastRow() > 0) sheet.insertRowsBefore(1, 1);
  sheet.getRange(1, 1, 1, PR_INVOICE_HEADERS.length).setValues([PR_INVOICE_HEADERS]).setFontWeight('bold');
}

function prSeedSettings_(defaults) {
  const book = prSheet_();
  let sheet = book.getSheetByName(PR.settingsSheet);
  if (!sheet) sheet = book.insertSheet(PR.settingsSheet);
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

function prRows_() {
  const sheet = prSheet_().getSheetByName(PR.proposalsSheet);
  const data = sheet.getDataRange().getValues();
  return data.slice(1)
    .map((r, i) => ({ row: i + 2, v: r }))
    .filter(o => String(o.v[PR.col.number] || '').trim() !== '' ||
                 String(o.v[PR.col.client] || '').trim() !== '');
}

function prMoney_(amount, currency) {
  const cur = currency || 'INR';
  const symbol = { INR: '₹', USD: '$', EUR: '€', GBP: '£' }[cur] || (cur + ' ');
  const n = Number(amount) || 0;
  return symbol + n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function prItems_(text) {
  return String(text || '')
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => {
      // "Description | qty | unit price" — degrades gracefully if parts are missing.
      const parts = line.split('|').map(p => p.trim());
      const qty = Number(parts[1]) || 1;
      const rate = Number(parts[2]) || 0;
      return { desc: parts[0] || line, qty: qty, rate: rate, amount: qty * rate };
    });
}

function prClient_(name) {
  const sheet = prSheet_().getSheetByName(PR.clientsSheet);
  if (!sheet || sheet.getLastRow() === 0) {
    return { name: name, email: '', address: '', phone: '', taxId: '' };
  }
  const rows = sheet.getDataRange().getValues().slice(1);
  const hit = rows.find(r => String(r[0]).trim().toLowerCase() === String(name).trim().toLowerCase());
  return hit
    ? { name: hit[0], email: hit[1], address: hit[2], phone: hit[3], taxId: hit[4] }
    : { name: name, email: '', address: '', phone: '', taxId: '' };
}

// Cell content ends up inside HTML, so it must not be able to close a tag.
function prEsc_(value) {
  return String(value === null || value === undefined ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function prDay_(value) {
  if (value instanceof Date) return value;
  const parsed = new Date(value);
  return isNaN(parsed.getTime()) ? null : parsed;
}

function prDaysBetween_(from, to) {
  const a = new Date(from.getFullYear(), from.getMonth(), from.getDate()).getTime();
  const b = new Date(to.getFullYear(), to.getMonth(), to.getDate()).getTime();
  return Math.round((b - a) / PR.dayMs);
}

function prNextNumber_() {
  const prefix = String(prSettings_()['Proposal Number Prefix'] || 'PROP-');
  const used = prRows_()
    .map(o => String(o.v[PR.col.number]))
    .filter(x => x.indexOf(prefix) === 0)
    .map(x => parseInt(x.slice(prefix.length), 10))
    .filter(n => !isNaN(n));
  const next = (used.length ? Math.max.apply(null, used) : 0) + 1;
  return prefix + String(next).padStart(3, '0');
}

function prLog_(proposalNumber, type, detail) {
  const sheet = prSheet_().getSheetByName(PR.activitiesSheet);
  if (!sheet) return;
  if (sheet.getLastRow() === 0) {
    sheet.getRange('A1:D1').setValues([['Date', 'Proposal #', 'Type', 'Detail']]).setFontWeight('bold');
  }
  sheet.appendRow([new Date(), proposalNumber, type, detail]);
}

// ─── TOTALS ─────────────────────────────────────────────────────────────────
function prRecalc_(rowIndex) {
  const sheet = prSheet_().getSheetByName(PR.proposalsSheet);
  const v = sheet.getRange(rowIndex, 1, 1, PR_HEADERS.length).getValues()[0];
  const items = prItems_(v[PR.col.scope]);
  const subtotal = items.reduce((s, i) => s + i.amount, 0);
  const rate = Number(v[PR.col.taxRate]) || 0;
  const tax = Math.round(subtotal * rate) / 100;
  const total = subtotal + tax;
  const depositPct = Number(v[PR.col.depositPct]) || 0;
  const deposit = Math.round(total * depositPct) / 100;

  if (subtotal > 0) {
    sheet.getRange(rowIndex, PR.col.subtotal + 1).setValue(subtotal);
    sheet.getRange(rowIndex, PR.col.tax + 1).setValue(tax);
    sheet.getRange(rowIndex, PR.col.total + 1).setValue(total);
    sheet.getRange(rowIndex, PR.col.deposit + 1).setValue(deposit);
  }
  return { items: items, subtotal: subtotal, taxRate: rate, tax: tax, total: total,
           depositPct: depositPct, deposit: deposit, v: v };
}

function recalcProposalTotals() {
  const sheet = prSheet_().getSheetByName(PR.proposalsSheet);
  const rowIndex = sheet.getActiveRange().getRow();
  const r = prRecalc_(rowIndex);
  if (!r.items.length) {
    prUi().alert('No scope lines found. Use one per line:  Build the site | 40 | 1200');
    return;
  }
  const cur = String(prSettings_()['Default Currency'] || 'INR');
  prUi().alert(
    'Totals updated',
    r.items.length + ' line item(s)\nSubtotal ' + prMoney_(r.subtotal, cur) + '\n' +
    'Tax ' + prMoney_(r.tax, cur) + '\nTotal ' + prMoney_(r.total, cur) + '\n' +
    'Deposit (' + r.depositPct + '%) ' + prMoney_(r.deposit, cur),
    'OK'
  );
}

// ─── NEW DRAFT ──────────────────────────────────────────────────────────────
function createDraftProposal() {
  const sheet = prSheet_().getSheetByName(PR.proposalsSheet);
  if (!sheet) { prUi().alert('Run 📄 Proposals → ⚙️ Run Setup first.'); return; }
  prWriteHeaders_(sheet);
  const s = prSettings_();
  const today = new Date();
  const validDays = Number(s['Proposal Valid For (days)'] || 14);
  const row = [
    prNextNumber_(), '', today, new Date(today.getTime() + validDays * PR.dayMs), '',
    0, Number(s['Default Tax Rate (%)'] || 0), 0, 0,
    Number(s['Default Deposit (%)'] || 0), 0, 'Draft', '', '', ''
  ];
  sheet.appendRow(row);
  const last = sheet.getLastRow();
  sheet.setActiveRange(sheet.getRange(last, PR.col.client + 1));
  prUi().alert(
    'Draft ' + row[0] + ' created',
    'Type the client name (must match the Clients tab), then the scope as:\n\n' +
    '  Deliverable | quantity | unit price\n\nThen hit 🔄 Recalculate Totals.',
    'OK'
  );
}

// ─── STATUS MOVES ───────────────────────────────────────────────────────────
function prSetStage_(stage) {
  const sheet = prSheet_().getSheetByName(PR.proposalsSheet);
  const rowIndex = sheet.getActiveRange().getRow();
  const v = sheet.getRange(rowIndex, 1, 1, PR_HEADERS.length).getValues()[0];
  const number = String(v[PR.col.number] || '').trim();
  if (!number) { prUi().alert('Select a proposal row first.'); return; }
  const current = String(v[PR.col.status] || '').trim() || 'Draft';
  if (current === stage) { prUi().alert('Already ' + stage + '.', number + ' is where it is.', 'OK'); return; }

  const now = new Date();
  sheet.getRange(rowIndex, PR.col.status + 1).setValue(stage);
  if (stage === 'Sent' && !prDay_(v[PR.col.sentDate])) {
    sheet.getRange(rowIndex, PR.col.sentDate + 1).setValue(now);
  }
  if ((stage === 'Accepted' || stage === 'Won') && !prDay_(v[PR.col.wonDate])) {
    sheet.getRange(rowIndex, PR.col.wonDate + 1).setValue(now);
  }
  prLog_(number, 'Stage', current + ' → ' + stage);
  prRefreshDashboard();
  prUi().alert('Updated', number + ': ' + current + ' → ' + stage, 'OK');
}

function setProposalDraft() { prSetStage_('Draft'); }
function setProposalSent() { prSetStage_('Sent'); }
function setProposalFollowUp() { prSetStage_('Follow-up'); }
function setProposalNegotiating() { prSetStage_('Negotiating'); }
function setProposalAccepted() { prSetStage_('Accepted'); }
function setProposalWon() { prSetStage_('Won'); }
function setProposalLost() { prSetStage_('Lost'); }
function setProposalExpired() { prSetStage_('Expired'); }

function logProposalActivity() {
  const ui = prUi();
  const sheet = prSheet_().getSheetByName(PR.proposalsSheet);
  const rowIndex = sheet.getActiveRange().getRow();
  const number = String(sheet.getRange(rowIndex, PR.col.number + 1).getValue() || '').trim();
  if (!number) { ui.alert('Select a proposal row first.'); return; }
  const answer = ui.prompt('Log an activity for ' + number, 'What happened?', ui.ButtonSet.OK_CANCEL);
  if (answer.getSelectedButton() !== ui.Button.OK) return;
  const text = String(answer.getResponseText() || '').trim();
  if (!text) { ui.alert('Nothing to log.'); return; }
  prLog_(number, 'Note', text);
  prUi().alert('Logged', number + ': ' + text, 'OK');
}

// ─── PDF ────────────────────────────────────────────────────────────────────
function prProposalHtml_(rowIndex) {
  const s = prSettings_();
  const t = prRecalc_(rowIndex);
  const v = t.v;
  const currency = String(s['Default Currency'] || 'INR');
  const client = prClient_(v[PR.col.client]);
  const number = String(v[PR.col.number]);
  const date = prDay_(v[PR.col.date]);
  const valid = prDay_(v[PR.col.validUntil]);
  const fmt = d => d ? Utilities.formatDate(d, Session.getScriptTimeZone(), 'dd MMM yyyy') : '—';
  const rows = t.items.map(i =>
    '<tr><td>' + prEsc_(i.desc) + '</td>' +
    '<td class="num">' + prEsc_(i.qty) + '</td>' +
    '<td class="num">' + prMoney_(i.rate, currency) + '</td>' +
    '<td class="num">' + prMoney_(i.amount, currency) + '</td></tr>'
  ).join('');

  const html = '<!DOCTYPE html><html><head><meta charset="utf-8"><style>' +
    'body{font-family:Helvetica,Arial,sans-serif;color:#15171c;margin:0;padding:38px 44px;font-size:13px;line-height:1.5}'
    + 'h1{font-size:24px;margin:0 0 4px}'
    + '.top{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #15171c;padding-bottom:14px}'
    + '.muted{color:#6b7280;font-size:11px}'
    + '.grid{display:flex;gap:40px;margin:20px 0}'
    + '.grid>div{flex:1}'
    + 'table{width:100%;border-collapse:collapse;margin-top:10px}'
    + 'th{text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:.6px;color:#6b7280;border-bottom:1px solid #d5d9e0;padding:0 0 6px}'
    + 'td{padding:7px 0;border-bottom:1px solid #eceef2;vertical-align:top}'
    + '.num{text-align:right;white-space:nowrap}'
    + '.totals{width:52%;margin-left:auto;margin-top:14px}'
    + '.totals td{border:0;padding:5px 0}'
    + '.grand td{border-top:2px solid #15171c;font-weight:700;font-size:15px;padding-top:9px}'
    + '.dep{background:#f2f6ff;border-left:3px solid #2f6fed;padding:11px 14px;margin-top:18px}'
    + '.note{background:#f7f8fa;padding:11px 14px;margin-top:14px;font-size:12px}'
    + '.foot{margin-top:26px;padding-top:12px;border-top:1px solid #d5d9e0;font-size:11px;color:#6b7280}'
    + '</style></head><body>' +
    '<div class="top"><div>' +
      '<h1>Proposal ' + prEsc_(number) + '</h1>' +
      '<div class="muted">' + prEsc_(s['Your Business Name'] || '') + ' · ' + prEsc_(client.name) + '</div>' +
    '</div><div style="text-align:right">' +
      '<div>Issued ' + fmt(date) + '</div>' +
      '<div class="muted">Valid until ' + fmt(valid) + '</div>' +
    '</div></div>' +
    '<div class="grid">' +
      '<div><div class="muted">PREPARED FOR</div><strong>' + prEsc_(client.name) + '</strong><br>' +
        '<span class="muted">' + prEsc_(client.address).replace(/\n/g, '<br>') + '</span><br>' +
        prEsc_(client.email) + (client.phone ? ' · ' + prEsc_(client.phone) : '') +
        (client.taxId ? '<br><span class="muted">GSTIN ' + prEsc_(client.taxId) + '</span>' : '') +
      '</div>' +
      '<div><div class="muted">PREPARED BY</div><strong>' + prEsc_(s['Your Business Name'] || '') + '</strong><br>' +
        '<span class="muted">' + prEsc_(s['Your Address']).replace(/\n/g, '<br>') + '</span><br>' +
        prEsc_(s['Your Email']) + (s['Your Phone'] ? ' · ' + prEsc_(s['Your Phone']) : '') +
        (s['GSTIN / Tax ID'] ? '<br><span class="muted">GSTIN ' + prEsc_(s['GSTIN / Tax ID']) + '</span>' : '') +
      '</div>' +
    '</div>' +
    (v[PR.col.notes] ? '<div class="note">' + prEsc_(v[PR.col.notes]).replace(/\n/g, '<br>') + '</div>' : '') +
    '<table><tr><th>Scope of work</th><th class="num">Qty</th><th class="num">Rate</th><th class="num">Amount</th></tr>' +
    (rows || '<tr><td colspan="4" class="muted">No scope lines yet.</td></tr>') + '</table>' +
    '<table class="totals">' +
      '<tr><td>Subtotal</td><td class="num">' + prMoney_(t.subtotal, currency) + '</td></tr>' +
      '<tr><td>Tax (' + t.taxRate + '%)</td><td class="num">' + prMoney_(t.tax, currency) + '</td></tr>' +
      '<tr class="grand"><td>Total</td><td class="num">' + prMoney_(t.total, currency) + '</td></tr>' +
    '</table>' +
    (t.deposit > 0
      ? '<div class="dep"><strong>Deposit required: ' + prMoney_(t.deposit, currency) +
        '</strong> (' + t.depositPct + '% of total)<br><span class="muted">Balance billed on the first invoice, due before delivery is signed off.</span></div>'
      : '') +
    '<div class="foot">Prices hold until ' + fmt(valid) + '. Work starts when the deposit lands. ' +
      'Questions: ' + prEsc_(s['Your Email']) + '.</div>' +
    '</body></html>';

  // Numbers come from the recalc, never from the stored cells: a proposal can
  // be perfectly priced without anyone having pressed Recalculate Totals yet.
  return { html: html, number: number, client: client, currency: currency,
           items: t.items, subtotal: t.subtotal, taxRate: t.taxRate, tax: t.tax,
           total: t.total, depositPct: t.depositPct, deposit: t.deposit,
           validUntil: valid, sentDate: v[PR.col.sentDate], wonDate: v[PR.col.wonDate],
           scope: v[PR.col.scope], rowIndex: rowIndex, v: v };
}

function prFolder_() {
  const props = PropertiesService.getUserProperties();
  const existing = props.getProperty(PR.folderKey);
  if (existing) {
    try { return DriveApp.getFolderById(existing); } catch (e) { /* folder moved, recreate */ }
  }
  const folder = DriveApp.createFolder('Proposal PDFs');
  props.setProperty(PR.folderKey, folder.getId());
  return folder;
}

function makeProposalPdf() {
  const sheet = prSheet_().getSheetByName(PR.proposalsSheet);
  const rowIndex = sheet.getActiveRange().getRow();
  return prMakePdfFor_(rowIndex);
}

function prMakePdfFor_(rowIndex) {
  const built = prProposalHtml_(rowIndex);
  if (!built.number) { prUi().alert('Select a proposal row first.'); return null; }
  if (!built.client.email) {
    prUi().alert('No client email',
      'The Clients tab has no email for ' + built.client.name + '. The PDF is still saved.', 'OK');
  }
  const blob = Utilities.newBlob(built.html, 'text/html', 'Proposal-' + built.number + '.html')
    .getAs('application/pdf')
    .setName('Proposal-' + built.number + '.pdf');
  const file = prFolder_().createFile(blob);
  prLog_(built.number, 'PDF', 'Generated ' + file.getUrl());
  return { url: file.getUrl(), number: built.number, client: built.client,
           total: built.total, deposit: built.deposit, currency: built.currency, blob: blob };
}

function downloadProposalPdf() {
  const made = makeProposalPdf();
  if (!made) return;
  prUi().alert('Proposal PDF saved', made.number + ' → ' + made.url, 'OK');
}

// ─── SEND ───────────────────────────────────────────────────────────────────
function prEmailBody_(built, s) {
  const fmt = d => d ? Utilities.formatDate(d, Session.getScriptTimeZone(), 'dd MMM yyyy') : '';
  const valid = prDay_(built.validUntil);
  return 'Hi ' + (built.client.name || 'there') + ',\n\n' +
    'Thanks for the conversation — proposal ' + built.number + ' is attached.\n\n' +
    'Total: ' + prMoney_(built.total, built.currency) +
    (built.deposit ? ' (deposit ' + prMoney_(built.deposit, built.currency) + ' to start)' : '') + '\n' +
    (valid ? 'Priced as-is until ' + fmt(valid) + '.\n' : '') +
    '\nIf the scope needs to change, say so before the deposit — that is the cheapest moment to edit it.\n\n' +
    'Speak soon,\n' + (s['Your Business Name'] || '');
}

function emailProposalForSelected() {
  const sheet = prSheet_().getSheetByName(PR.proposalsSheet);
  const rowIndex = sheet.getActiveRange().getRow();
  const built = prProposalHtml_(rowIndex);
  if (!built.number) { prUi().alert('Select a proposal row first.'); return; }
  if (!built.client.email) {
    prUi().alert('Cannot email', 'Add an email for ' + built.client.name + ' on the Clients tab.', 'OK');
    return;
  }
  const ui = prUi();
  const reply = ui.confirm('Send proposal?',
    built.number + ' for ' + prMoney_(built.total, built.currency) +
    ' to ' + built.client.email + ', with the PDF attached?', ui.YES, ui.NO);
  if (reply !== ui.YES) return;

  const made = prMakePdfFor_(rowIndex);
  const s = prSettings_();
  MailApp.sendEmail({
    to: built.client.email,
    subject: 'Proposal ' + built.number + ' — ' + (s['Your Business Name'] || '') + ' × ' + built.client.name,
    body: prEmailBody_(built, s),
    name: s['Your Business Name'] || undefined,
    attachments: made && made.blob ? [made.blob] : undefined
  });

  const now = new Date();
  sheet.getRange(rowIndex, PR.col.status + 1).setValue('Sent');
  if (!prDay_(built.sentDate)) sheet.getRange(rowIndex, PR.col.sentDate + 1).setValue(now);
  prLog_(built.number, 'Email', 'Sent to ' + built.client.email);
  prRefreshDashboard();
  prUi().alert('Sent', built.number + ' emailed to ' + built.client.email + ' and marked Sent.', 'OK');
}

// ─── CONVERT TO INVOICE ─────────────────────────────────────────────────────
// The bridge to the Invoice Kit: accepted scope becomes a numbered draft invoice.
const PR_INVOICE_HEADERS = [
  'Invoice #', 'Client', 'Issue Date', 'Due Date', 'Line Items (one per line)',
  'Subtotal', 'Tax %', 'Tax', 'Total', 'Status', 'Paid Date', 'Currency', 'Notes'
];

function convertProposalToInvoice() {
  const book = prSheet_();
  const sheet = book.getSheetByName(PR.proposalsSheet);
  const rowIndex = sheet.getActiveRange().getRow();
  const built = prProposalHtml_(rowIndex);
  if (!built.number) { prUi().alert('Select a proposal row first.'); return null; }
  const v = built.v || sheet.getRange(rowIndex, 1, 1, PR_HEADERS.length).getValues()[0];

  let invoices = book.getSheetByName(PR.invoicesSheet);
  if (!invoices) invoices = book.insertSheet(PR.invoicesSheet);
  prWriteInvoiceHeaders_(invoices);

  const number = prNextInvoiceNumber_(invoices);
  const today = new Date();
  const terms = Number(prSettings_()['Payment Terms (days)'] ||
                        prSettings_()['Proposal Valid For (days)'] || 14);
  const currency = String(prSettings_()['Default Currency'] || 'INR');
  const fullSubtotal = built.subtotal;
  const fullTax = built.tax;
  const fullTotal = built.total;
  const depositAmount = built.deposit;

  // A deposit invoice is its own gross amount at 0% tax — the proposal already
  // accounted the tax on the full total, so re-taxing a deposit would be wrong.
  const depositOnly = depositAmount > 0 && depositAmount < fullTotal;
  const items = depositOnly
    ? 'Deposit against ' + built.number + ' (' + built.depositPct + '% of ' +
      prMoney_(fullTotal, currency) + ') | 1 | ' + depositAmount
    : String(built.scope || '');
  const taxRate = depositOnly ? 0 : built.taxRate;
  const subtotal = depositOnly ? depositAmount : fullSubtotal;
  const tax = depositOnly ? 0 : fullTax;
  const total = depositOnly ? depositAmount : fullTotal;

  invoices.appendRow([
    number, built.client.name, today, new Date(today.getTime() + terms * PR.dayMs), items,
    subtotal, taxRate, tax, total, 'Draft', '', currency,
    'From ' + built.number + ' — ' + (depositOnly ? 'deposit only, balance on completion' : 'full amount')
  ]);

  sheet.getRange(rowIndex, PR.col.status + 1).setValue('Accepted');
  if (!prDay_(v[PR.col.wonDate])) sheet.getRange(rowIndex, PR.col.wonDate + 1).setValue(today);
  prLog_(built.number, 'Invoice', 'Created draft ' + number + ' for ' + prMoney_(total, currency));
  prRefreshDashboard();
  prUi().alert(
    'Draft ' + number + ' created',
    'On the Invoices tab: check the line items, then generate the invoice PDF.\n\n' +
    'Amount billed now: ' + prMoney_(total, currency) +
    (depositOnly ? ' (deposit; the balance goes on the next invoice)' : ''),
    'OK'
  );
  return { number: number, amount: total, proposal: built.number, depositOnly: depositOnly };
}

function prNextInvoiceNumber_(invoices) {
  const prefix = 'INV-';
  let used = [];
  try {
    used = invoices.getDataRange().getValues().slice(1)
      .map(r => String(r[0]))
      .filter(x => x.indexOf(prefix) === 0)
      .map(x => parseInt(x.slice(prefix.length), 10))
      .filter(n => !isNaN(n));
  } catch (e) { used = []; }
  const next = (used.length ? Math.max.apply(null, used) : 0) + 1;
  return prefix + String(next).padStart(4, '0');
}

// ─── DASHBOARD ──────────────────────────────────────────────────────────────
function prRefreshDashboard() {
  const book = prSheet_();
  const sheet = book.getSheetByName(PR.dashboardSheet);
  if (!sheet) return { open: 0, openValue: 0, weighted: 0, winRate: 0 };

  const weights = prWeights_();
  const today = new Date();
  const rows = prRows_();
  const buckets = {};
  const months = {};
  let open = 0, openValue = 0, weighted = 0, won = 0, decided = 0, wonValue = 0;
  const expiring = [], expired = [];

  rows.forEach(o => {
    const v = o.v;
    const stage = String(v[PR.col.status] || 'Draft').trim() || 'Draft';
    const total = Number(v[PR.col.total]) || 0;
    buckets[stage] = (buckets[stage] || 0) + 1;

    const isOpen = !['won', 'lost', 'expired'].includes(stage.toLowerCase());
    if (isOpen) {
      open++;
      openValue += total;
      weighted += total * ((Number(weights[stage.toLowerCase()]) || 0) / 100);
      // Only chase-worthy stages appear in the expiry lists, matching the email.
      if (PR_LIVE_STAGES.includes(stage.toLowerCase())) {
        const valid = prDay_(v[PR.col.validUntil]);
        if (valid) {
          const left = prDaysBetween_(today, valid);
          if (left < 0) expired.push({ number: v[PR.col.number], client: v[PR.col.client], days: -left, total: total });
          else if (left <= 3) expiring.push({ number: v[PR.col.number], client: v[PR.col.client], days: left, total: total });
        }
      }
    }
    if (['accepted', 'won'].includes(stage.toLowerCase())) { won++; wonValue += total; decided++; }
    if (stage.toLowerCase() === 'lost') decided++;

    const sent = prDay_(v[PR.col.date]);
    if (sent) {
      const key = Utilities.formatDate(sent, Session.getScriptTimeZone(), 'yyyy-MM');
      const m = months[key] || (months[key] = { sent: 0, value: 0, won: 0 });
      m.sent++; m.value += total;
      if (['accepted', 'won'].includes(stage.toLowerCase())) m.won++;
    }
  });

  const winRate = decided ? Math.round((won / decided) * 1000) / 10 : 0;

  sheet.clear();
  sheet.getRange(1, 1).setValue('Proposals Dashboard');
  sheet.getRange(1, 1).setFontWeight('bold');
  sheet.getRange(2, 1, 1, 3).setValues([['Updated', today, '']]);
  sheet.getRange(4, 1, 5, 3).setValues([
    ['Open Proposals', open, ''],
    ['Open Value', openValue, ''],
    ['Weighted Pipeline', Math.round(weighted), 'each open total x its stage chance from the Stages tab'],
    ['Won Value', wonValue, ''],
    ['Win Rate', winRate / 100, 'accepted+won / (accepted+won+lost); Expired is excluded, a zombie is not a no']
  ]);
  sheet.getRange(4, 1, 5, 1).setFontWeight('bold');
  sheet.getRange(4, 2, 5, 1).setNumberFormat('#,##0');
  sheet.getRange(8, 2).setNumberFormat('0%');

  const stageOrder = Object.keys(buckets).sort();
  sheet.getRange(10, 1, 1, 3).setValues([['Stage', 'Count', '']]).setFontWeight('bold');
  if (stageOrder.length) {
    sheet.getRange(11, 1, stageOrder.length, 3).setValues(
      stageOrder.map(s => [s, buckets[s], ''])
    );
  }

  let r = 11 + Math.max(stageOrder.length, 1) + 1;
  sheet.getRange(r, 1, 1, 4).setValues([['Month', 'Sent', 'Value', 'Accepted']]).setFontWeight('bold');
  const keys = Object.keys(months).sort();
  if (keys.length) {
    sheet.getRange(r + 1, 1, keys.length, 4).setValues(
      keys.map(k => [k, months[k].sent, months[k].value, months[k].won])
    );
  }

  r = r + 1 + Math.max(keys.length, 1) + 1;
  sheet.getRange(r, 1, 1, 4).setValues([['Expiring Soon', '', '', '']]).setFontWeight('bold');
  const soonLines = expiring.length ? expiring : [{ number: '—', client: 'nothing expiring', days: 0, total: 0 }];
  sheet.getRange(r + 1, 1, soonLines.length, 4).setValues(
    soonLines.map(x => [x.number, x.client, 'expires in ' + x.days + 'd', x.total])
  );
  const deadLines = expired.length ? expired : [{ number: '—', client: 'nothing expired', days: 0, total: 0 }];
  sheet.getRange(r + 2 + soonLines.length, 1, deadLines.length, 4).setValues(
    deadLines.map(x => [x.number, x.client, 'lapsed ' + x.days + 'd ago', x.total])
  );

  return { open: open, openValue: openValue, weighted: Math.round(weighted), winRate: winRate,
           expiring: expiring, expired: expired };
}

function refreshProposalDashboard() {
  const d = prRefreshDashboard();
  prUi().alert(
    'Dashboard updated',
    d.open + ' open · ' + prMoney_(d.openValue, 'INR') + ' on the table\n' +
    'Weighted ' + prMoney_(d.weighted, 'INR') + ' · win rate ' + d.winRate + '%\n' +
    d.expiring.length + ' expiring within 3 days, ' + d.expired.length + ' already lapsed',
    'OK'
  );
}

// ─── CHASING & EXPIRY ───────────────────────────────────────────────────────
function chaseProposalForSelected() {
  const sheet = prSheet_().getSheetByName(PR.proposalsSheet);
  const rowIndex = sheet.getActiveRange().getRow();
  const built = prProposalHtml_(rowIndex);
  if (!built.number) { prUi().alert('Select a proposal row first.'); return; }
  if (!built.client.email) { prUi().alert('No client email on the Clients tab.', 'OK'); return; }
  const valid = prDay_(built.v ? built.v[PR.col.validUntil] : null);
  const s = prSettings_();
  const body = 'Hi ' + (built.client.name || 'there') + ',\n\n' +
    'Floating ' + built.number + ' back to the top — ' + prMoney_(built.total, built.currency) +
    (valid ? ', priced until ' + Utilities.formatDate(valid, Session.getScriptTimeZone(), 'dd MMM yyyy') : '') + '.\n\n' +
    'If the number is the problem, tell me and we will move scope rather than pretend. Two smaller phases usually beats one stalled project.\n\n' +
    (s['Your Business Name'] || '');
  MailApp.sendEmail({ to: built.client.email, subject: 'Re: Proposal ' + built.number, body: body });
  sheet.getRange(rowIndex, PR.col.status + 1).setValue('Follow-up');
  prLog_(built.number, 'Chase', 'Emailed ' + built.client.email);
  prRefreshDashboard();
  prUi().alert('Chased', built.number + ' is now Follow-up.', 'OK');
}

function prExpirySummary_() {
  const weights = prWeights_();
  const today = new Date();
  const lines = { expiring: [], lapsed: [] };
  let lapsedValue = 0;
  prRows_().forEach(o => {
    const v = o.v;
    const stage = String(v[PR.col.status] || 'Draft').trim() || 'Draft';
    // Shares the live-stage rule with the dashboard so the lists can't disagree.
    if (!PR_LIVE_STAGES.includes(stage.toLowerCase())) return;
    const valid = prDay_(v[PR.col.validUntil]);
    if (!valid) return;
    const left = prDaysBetween_(today, valid);
    const entry = { number: String(v[PR.col.number]), client: String(v[PR.col.client]),
                    days: left, total: Number(v[PR.col.total]) || 0, stage: stage,
                    weight: (Number(weights[stage.toLowerCase()]) || 0) };
    if (left < 0) { lines.lapsed.push(entry); lapsedValue += entry.total; }
    else if (left <= 3) lines.expiring.push(entry);
  });
  const sorter = (a, b) => a.days - b.days;
  lines.expiring.sort(sorter);
  lines.lapsed.sort(sorter);
  return { expiring: lines.expiring, lapsed: lines.lapsed, lapsedValue: lapsedValue,
           stale: lines.expiring.length + lines.lapsed.length > 0 };
}

function dailyProposalCheck() {
  const s = prSettings_();
  const to = String(s['Your Email'] || Session.getActiveUser().getEmail());
  const sum = prExpirySummary_();
  if (!sum.expiring.length && !sum.lapsed.length) {
    MailApp.sendEmail({ to: to, subject: 'Proposals: nothing expiring',
                        body: 'No open proposal expires within 3 days and none have lapsed. Go do the work.' });
    return { mailed: true, count: 0 };
  }
  const fmtLine = e => '  ' + e.number + ' · ' + e.client + ' · ' + prMoney_(e.total, 'INR') + ' · ' +
    (e.days < 0 ? 'lapsed ' + (-e.days) + 'd ago' : e.days + 'd left') + ' · at ' + e.stage;
  const body = 'Proposals needing a move:\n\n' +
    (sum.expiring.length ? 'EXPIRING WITHIN 3 DAYS\n' + sum.expiring.map(fmtLine).join('\n') + '\n\n' : '') +
    (sum.lapsed.length ? 'LAPSED — RE-PRICE OR CLOSE THEM\n' + sum.lapsed.map(fmtLine).join('\n') +
      '\nValue sitting in lapsed proposals: ' + prMoney_(sum.lapsedValue, 'INR') + '\n\n' : '') +
    'Lapsed proposals rarely come back on the old number. Either send a fresh one or mark them Expired.';
  MailApp.sendEmail({
    to: to,
    subject: 'Proposals: ' + sum.expiring.length + ' expiring, ' + sum.lapsed.length + ' lapsed',
    body: body
  });
  prRefreshDashboard();
  return { mailed: true, count: sum.expiring.length + sum.lapsed.length };
}

function markLapsedProposals() {
  const today = new Date();
  let n = 0;
  prRows_().forEach(o => {
    const v = o.v;
    const stage = String(v[PR.col.status] || '').trim();
    if (!PR_LIVE_STAGES.includes(stage.toLowerCase()) && stage !== '') return;
    const valid = prDay_(v[PR.col.validUntil]);
    if (!valid || prDaysBetween_(today, valid) >= 0) return;
    const sheet = prSheet_().getSheetByName(PR.proposalsSheet);
    sheet.getRange(o.row, PR.col.status + 1).setValue('Expired');
    prLog_(String(v[PR.col.number]), 'Stage', (stage || 'Draft') + ' → Expired (auto)');
    n++;
  });
  prRefreshDashboard();
  prUi().alert('Done', n ? n + ' lapsed proposal(s) marked Expired.' : 'Nothing had lapsed.', 'OK');
  return n;
}

function installProposalReminder() {
  const triggers = ScriptApp.getProjectTriggers();
  const has = triggers.some(t => t.getHandlerFunction() === 'dailyProposalCheck');
  if (!has) {
    ScriptApp.newTrigger('dailyProposalCheck').timeBased().everyDays(1).atHour(9).create();
  }
  prUi().alert('Installed', 'A short proposals email lands at 9am every day.', 'OK');
}

// ─── MENU ───────────────────────────────────────────────────────────────────
function proposalKitMenu_() {
  const ui = prUi();
  ui.createMenu('📄 Proposals')
    .addItem('🆕 New Draft Proposal', 'createDraftProposal')
    .addItem('🔄 Recalculate Totals For Selected', 'recalcProposalTotals')
    .addItem('📑 Create PDF For Selected', 'downloadProposalPdf')
    .addItem('📧 Email Proposal With PDF', 'emailProposalForSelected')
    .addSeparator()
    .addSubMenu(ui.createMenu('➡️ Move Selected Proposal To Stage')
      .addItem('Draft', 'setProposalDraft')
      .addItem('Sent', 'setProposalSent')
      .addItem('Follow-up', 'setProposalFollowUp')
      .addItem('Negotiating', 'setProposalNegotiating')
      .addSeparator()
      .addItem('✅ Accepted (then invoice it)', 'setProposalAccepted')
      .addItem('🏆 Won', 'setProposalWon')
      .addItem('❌ Lost', 'setProposalLost')
      .addItem('⌛ Expired', 'setProposalExpired'))
    .addSeparator()
    .addItem('🧾 Convert Accepted Proposal To Invoice', 'convertProposalToInvoice')
    .addItem('📝 Log Activity For Selected', 'logProposalActivity')
    .addItem('📨 Chase Selected Proposal', 'chaseProposalForSelected')
    .addSeparator()
    .addItem('📊 Refresh Dashboard', 'refreshProposalDashboard')
    .addItem('⏱ Mark Lapsed Proposals Expired', 'markLapsedProposals')
    .addItem('⏰ Install Daily Expiry Email', 'installProposalReminder')
    .addItem('⚙️ Run Setup (once)', 'setupProposals')
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

