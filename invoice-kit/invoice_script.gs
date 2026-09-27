/**
 * Invoice & Cash-Flow Kit — Google Apps Script
 * ============================================
 * Paste this entire file into Extensions → Apps Script in Google Sheets.
 *
 * Features:
 * - Generates a clean PDF invoice from a draft row, one click
 * - Sequential invoice numbers that never skip
 * - Marks invoices paid / overdue, logs the payment date
 * - Emails the invoice to the client with the PDF attached
 * - Monthly cash-flow summary: invoiced, collected, outstanding, by age bucket
 *
 * Tabs this expects: Clients, Invoices, Payments, Settings
 */

// ─── CONFIGURATION ──────────────────────────────────────────────────────────
const CFG = {
  clientsSheet: 'Clients',
  invoicesSheet: 'Invoices',
  paymentsSheet: 'Payments',
  settingsSheet: 'Settings',
  // Column indexes on the Invoices tab, 0-based. Change these if you reorder.
  col: {
    number: 0, client: 1, issueDate: 2, dueDate: 3, items: 4,
    subtotal: 5, taxRate: 6, tax: 7, total: 8, status: 9,
    paidDate: 10, currency: 11, notes: 12
  },
  clientCols: { name: 0, email: 1, address: 2, phone: 3, gstin: 4 }
};

// ─── SETUP — Creates tabs and headers ───────────────────────────────────────
function setupKit() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  ['Clients', 'Invoices', 'Payments', 'Settings'].forEach(name => {
    if (!ss.getSheetByName(name)) ss.insertSheet(name);
  });

  const settings = ss.getSheetByName('Settings');
  settings.clear();
  settings.getRange('A1:B1').setValues([['Setting', 'Value']]).setFontWeight('bold');
  settings.getRange('A2:B10').setValues([
    ['Your Business Name', 'Your Business'],
    ['Your Address', 'Street, City, State, PIN'],
    ['Your Email', Session.getActiveUser().getEmail()],
    ['Your Phone', '+91-XXXXXXXXXX'],
    ['GSTIN / Tax ID', ''],
    ['Default Currency', 'INR'],
    ['Default Tax Rate (%)', '18'],
    ['Payment Terms (days)', '14'],
    ['Invoice Number Prefix', 'INV-']
  ]);

  const invoices = ss.getSheetByName('Invoices');
  if (invoices.getLastRow() === 0) {
    invoices.getRange('A1:M1').setValues([[
      'Invoice #', 'Client', 'Issue Date', 'Due Date', 'Line Items (one per line)',
      'Subtotal', 'Tax %', 'Tax', 'Total', 'Status', 'Paid Date', 'Currency', 'Notes'
    ]]).setFontWeight('bold');
  }

  const clients = ss.getSheetByName('Clients');
  if (clients.getLastRow() === 0) {
    clients.getRange('A1:E1').setValues([[
      'Client Name', 'Email', 'Address', 'Phone', 'GSTIN / Tax ID'
    ]]).setFontWeight('bold');
  }

  const payments = ss.getSheetByName('Payments');
  if (payments.getLastRow() === 0) {
    payments.getRange('A1:F1').setValues([[
      'Date', 'Invoice #', 'Amount Received', 'Method', 'Reference', 'Notes'
    ]]).setFontWeight('bold');
  }

  SpreadsheetApp.getUi()
    .alert('Invoice Kit ready', 'Tabs created. Fill in Settings, add Clients, then draft Invoices.', 'OK');
}

// ─── HELPERS ────────────────────────────────────────────────────────────────
function getSettings_() {
  const values = ss_().getSheetByName(CFG.settingsSheet).getRange('A2:B10').getValues();
  const out = {};
  values.forEach(([k, v]) => { out[String(k).trim()] = v; });
  return out;
}

function ss_() { return SpreadsheetApp.getActiveSpreadsheet(); }

function rowValues_(sheet) {
  const data = sheet.getDataRange().getValues();
  return data.slice(1).map((r, i) => ({ row: i + 2, v: r }))
    .filter(o => String(o.v[CFG.col.number] || '').trim() !== '');
}

function money_(amount, currency) {
  const symbol = { INR: '₹', USD: '$', EUR: '€', GBP: '£' }[currency] || (currency + ' ');
  const n = Number(amount) || 0;
  return symbol + n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function nextInvoiceNumber_() {
  const s = getSettings_();
  const prefix = String(s['Invoice Number Prefix'] || 'INV-');
  const existing = rowValues_(ss_().getSheetByName(CFG.invoicesSheet))
    .map(o => String(o.v[CFG.col.number]))
    .filter(x => x.startsWith(prefix))
    .map(x => parseInt(x.slice(prefix.length), 10))
    .filter(n => !isNaN(n));
  const next = (existing.length ? Math.max.apply(null, existing) : 0) + 1;
  return prefix + String(next).padStart(4, '0');
}

function parseItems_(text) {
  return String(text || '')
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => {
      // "Description | qty | unit price" — falls back gracefully if parts are missing.
      const parts = line.split('|').map(p => p.trim());
      const qty = Number(parts[1]) || 1;
      const price = Number(parts[2]) || 0;
      return { desc: parts[0] || line, qty, price, amount: qty * price };
    });
}

function clientFor_(name) {
  const rows = ss_().getSheetByName(CFG.clientsSheet).getDataRange().getValues().slice(1);
  const hit = rows.find(r => String(r[0]).trim().toLowerCase() === String(name).trim().toLowerCase());
  return hit
    ? { name: hit[0], email: hit[1], address: hit[2], phone: hit[3], taxId: hit[4] }
    : { name: name, email: '', address: '', phone: '', taxId: '' };
}

// ─── TOTALS — Recalculate a row from its line items ─────────────────────────
function recalcRow_(rowIndex) {
  const sheet = ss_().getSheetByName(CFG.invoicesSheet);
  const v = sheet.getRange(rowIndex, 1, 1, 13).getValues()[0];
  const items = parseItems_(v[CFG.col.items]);
  const subtotal = items.reduce((s, i) => s + i.amount, 0);
  const rate = Number(v[CFG.col.taxRate]) || 0;
  const tax = Math.round(subtotal * rate) / 100;
  const total = subtotal + tax;

  if (subtotal > 0) {
    sheet.getRange(rowIndex, CFG.col.subtotal + 1).setValue(subtotal);
    sheet.getRange(rowIndex, CFG.col.tax + 1).setValue(tax);
    sheet.getRange(rowIndex, CFG.col.total + 1).setValue(total);
  }
  return { items, subtotal, tax, total, v };
}

function recalcSelected() {
  const rowIndex = ss_().getSheetByName(CFG.invoicesSheet).getActiveRange().getRow();
  const r = recalcRow_(rowIndex);
  if (!r.items.length) {
    SpreadsheetApp.getUi().alert('No line items found. Use one per line:  Service name | 12 | 1500');
    return;
  }
  SpreadsheetApp.getUi().alert(
    'Totals updated',
    `${r.items.length} item(s)\nSubtotal ${money_(r.subtotal, r.v[CFG.col.currency] || 'INR')}\n` +
    `Tax ${money_(r.tax, r.v[CFG.col.currency] || 'INR')}\nTotal ${money_(r.total, r.v[CFG.col.currency] || 'INR')}`,
    'OK'
  );
}

// Header row for the Invoices tab; written automatically if someone drafts before running setup.
const INVOICE_HEADERS = [
  'Invoice #', 'Client', 'Issue Date', 'Due Date', 'Line Items (one per line)',
  'Subtotal', 'Tax %', 'Tax', 'Total', 'Status', 'Paid Date', 'Currency', 'Notes'
];

function ensureInvoiceHeaders_(sheet) {
  if (String(sheet.getRange(1, 1).getValue()) === 'Invoice #') return;
  if (sheet.getLastRow() > 0) sheet.insertRowsBefore(1, 1);
  sheet.getRange(1, 1, 1, 13).setValues([INVOICE_HEADERS]).setFontWeight('bold');
}

// ─── NEW DRAFT — Adds a numbered, dated row ready to fill ───────────────────
function createDraftInvoice() {
  const sheet = ss_().getSheetByName(CFG.invoicesSheet);
  ensureInvoiceHeaders_(sheet);
  const s = getSettings_();
  const terms = Number(s['Payment Terms (days)'] || 14);
  const today = new Date();
  const due = new Date(today.getTime() + terms * 86400000);

  const row = [
    nextInvoiceNumber_(), '', today, due, '',
    0, Number(s['Default Tax Rate (%)'] || 0), 0, 0, 'Draft', '',
    s['Default Currency'] || 'INR', ''
  ];
  sheet.appendRow(row);
  const last = sheet.getLastRow();
  sheet.setActiveRange(sheet.getRange(last, 2));
  SpreadsheetApp.getUi().alert(
    'Draft ' + row[0] + ' created',
    'Add the client name (must match the Clients tab), then the line items as:\n\n' +
    'Website design | 1 | 45000\nMaintenance retainer | 3 | 5000\n\n' +
    'Then run Recalculate Totals.',
    'OK'
  );
}

// ─── PDF GENERATION ─────────────────────────────────────────────────────────
function buildInvoiceHtml_(data) {
  const itemRows = data.items.map(i => `
    <tr>
      <td>${escapeHtml_(i.desc)}</td>
      <td class="num">${i.qty}</td>
      <td class="num">${money_(i.price, data.currency)}</td>
      <td class="num">${money_(i.amount, data.currency)}</td>
    </tr>`).join('');

  return `
  <style>
    body { font-family: Helvetica, Arial, sans-serif; color: #1a1a1a; font-size: 13px; }
    .head { display: flex; justify-content: space-between; margin-bottom: 28px; }
    h1 { font-size: 26px; letter-spacing: 3px; margin: 0 0 4px; text-transform: uppercase; }
    .biz { font-weight: bold; font-size: 15px; margin-bottom: 4px; }
    .muted { color: #666; line-height: 1.5; }
    table.items { width: 100%; border-collapse: collapse; margin: 18px 0; }
    table.items th { text-align: left; border-bottom: 2px solid #1a1a1a; padding: 8px 6px; font-size: 11px;
                     text-transform: uppercase; letter-spacing: 1px; }
    table.items td { padding: 8px 6px; border-bottom: 1px solid #e5e5e5; }
    .num { text-align: right; }
    .totals { width: 46%; margin-left: auto; }
    .totals td { padding: 6px; }
    .grand td { border-top: 2px solid #1a1a1a; font-weight: bold; font-size: 16px; padding-top: 10px; }
    .meta { text-align: right; }
    .foot { margin-top: 36px; padding-top: 12px; border-top: 1px solid #e5e5e5; color: #666; font-size: 11px; }
    .badge { display: inline-block; padding: 3px 10px; border: 1px solid #1a1a1a; font-size: 11px;
             text-transform: uppercase; letter-spacing: 1px; }
  </style>
  <div class="head">
    <div>
      <div class="biz">${escapeHtml_(data.business)}</div>
      <div class="muted">${escapeHtml_(data.address)}<br>${escapeHtml_(data.email)}
        ${data.phone ? ' · ' + escapeHtml_(data.phone) : ''}</div>
      ${data.sellerTaxId ? `<div class="muted">GSTIN: ${escapeHtml_(data.sellerTaxId)}</div>` : ''}
    </div>
    <div class="meta">
      <h1>Invoice</h1>
      <div class="muted"><span class="badge">${escapeHtml_(data.status)}</span></div>
    </div>
  </div>
  <div style="display:flex; justify-content:space-between; margin-bottom:8px;">
    <div>
      <div class="muted"><strong>Bill to</strong><br>${escapeHtml_(data.clientName)}</div>
      <div class="muted">${escapeHtml_(data.clientAddress)}<br>${escapeHtml_(data.clientEmail)}
        ${data.clientTaxId ? '<br>GSTIN: ' + escapeHtml_(data.clientTaxId) : ''}</div>
    </div>
    <div class="muted">
      Invoice ${escapeHtml_(data.number)}<br>
      Issued ${formatDate_(data.issueDate)}<br>
      Due ${formatDate_(data.dueDate)}
    </div>
  </div>
  <table class="items">
    <thead><tr><th>Description</th><th class="num">Qty</th><th class="num">Rate</th><th class="num">Amount</th></tr></thead>
    <tbody>${itemRows}</tbody>
  </table>
  <table class="totals">
    <tr><td>Subtotal</td><td class="num">${money_(data.subtotal, data.currency)}</td></tr>
    <tr><td>Tax (${data.taxRate}%)</td><td class="num">${money_(data.tax, data.currency)}</td></tr>
    <tr class="grand"><td>Total</td><td class="num">${money_(data.total, data.currency)}</td></tr>
  </table>
  ${data.paidDate ? `<p class="muted"><strong>Paid ${formatDate_(data.paidDate)}.</strong> Thank you.</p>` : ''}
  ${data.notes ? `<p class="muted">${escapeHtml_(data.notes)}</p>` : ''}
  <div class="foot">Payment due within ${data.terms} days of issue. Late payments may attract 1.5% monthly interest.</div>`;
}

function escapeHtml_(value) {
  return String(value === null || value === undefined ? '' : value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function formatDate_(d) {
  const date = d instanceof Date ? d : new Date(d);
  if (isNaN(date.getTime())) return '—';
  return Utilities.formatDate(date, Session.getScriptTimeZone(), 'dd MMM yyyy');
}

function makePdf_(data) {
  const html = buildInvoiceHtml_(data);
  const name = `Invoice-${data.number}.pdf`;
  const blob = Utilities.newBlob(html, 'text/html', name)
    .getAs('application/pdf')
    .setName(name);
  return blob.setContentType('application/pdf');
}

// ─── COLLECT INVOICE DATA FROM A ROW ────────────────────────────────────────
function invoiceDataFromRow_(rowIndex) {
  const sheet = ss_().getSheetByName(CFG.invoicesSheet);
  const r = recalcRow_(rowIndex);
  const v = r.v;
  const s = getSettings_();
  const c = clientFor_(v[CFG.col.client]);
  const currency = v[CFG.col.currency] || s['Default Currency'] || 'INR';

  if (!v[CFG.col.client]) throw new Error('Fill in the client name first (it must match the Clients tab).');
  if (!r.items.length) throw new Error('No line items. Use "Description | qty | rate", one per line.');

  return {
    business: s['Your Business Name'], address: s['Your Address'], email: s['Your Email'],
    phone: s['Your Phone'], sellerTaxId: s['GSTIN / Tax ID'],
    number: v[CFG.col.number], clientName: c.name, clientAddress: c.address,
    clientEmail: c.email, clientTaxId: c.taxId,
    issueDate: v[CFG.col.issueDate], dueDate: v[CFG.col.dueDate],
    items: r.items, subtotal: r.subtotal, taxRate: Number(v[CFG.col.taxRate]) || 0,
    tax: r.tax, total: r.total, currency,
    status: v[CFG.col.status] || 'Draft', paidDate: v[CFG.col.paidDate],
    notes: v[CFG.col.notes], terms: Number(s['Payment Terms (days)'] || 14)
  };
}

// ─── ACTIONS ────────────────────────────────────────────────────────────────
function generatePdfForSelected() {
  const rowIndex = ss_().getSheetByName(CFG.invoicesSheet).getActiveRange().getRow();
  try {
    const blob = makePdf_(invoiceDataFromRow_(rowIndex));
    const folder = getInvoiceFolder_();
    const file = folder.createFile(blob);
    SpreadsheetApp.getUi()
      .alert('Invoice PDF created', 'Saved to your Drive folder: ' + file.getUrl(), 'OK');
    return file;
  } catch (err) {
    SpreadsheetApp.getUi().alert('Cannot create invoice', String(err.message || err), 'OK');
  }
}

function getInvoiceFolder_() {
  const it = PropertiesService.getUserProperties();
  const existing = it.getProperty('INVOICE_FOLDER');
  if (existing) {
    const dir = DriveApp.getFolderById(existing);
    if (dir) return dir;
  }
  const folder = DriveApp.createFolder('Invoices — ' + ss_().getName());
  it.setProperty('INVOICE_FOLDER', folder.getId());
  return folder;
}

function emailPdfForSelected() {
  const ui = SpreadsheetApp.getUi();
  const rowIndex = ss_().getSheetByName(CFG.invoicesSheet).getActiveRange().getRow();
  try {
    const data = invoiceDataFromRow_(rowIndex);
    if (!data.clientEmail) {
      ui.alert('No client email', `Add ${data.clientName}'s email on the Clients tab first.`, 'OK');
      return;
    }
    const reply = ui.confirm(
      'Send invoice?',
      `${data.number} for ${money_(data.total, data.currency)} to ${data.clientEmail}?`,
      ui.YES, ui.NO
    );
    if (reply !== ui.YES) return;

    const blob = makePdf_(data);
    MailApp.sendEmail({
      to: data.clientEmail,
      subject: `Invoice ${data.number} — ${money_(data.total, data.currency)} from ${data.business}`,
      htmlBody: `
        <p>Hi ${escapeHtml_(data.clientName)},</p>
        <p>Invoice <strong>${escapeHtml_(data.number)}</strong> is attached for
        <strong>${escapeHtml_(money_(data.total, data.currency))}</strong>, due
        <strong>${escapeHtml_(formatDate_(data.dueDate))}</strong>.</p>
        <p>${escapeHtml_(data.notes || 'Payment by bank transfer is appreciated.')}</p>
        <p>Reply to this email if anything looks wrong and I'll fix it same-day.</p>
        <p>— ${escapeHtml_(data.business)}</p>`,
      attachments: [blob]
    });
    ss_().getSheetByName(CFG.invoicesSheet)
      .getRange(rowIndex, CFG.col.status + 1).setValue('Sent');
    ui.alert('Sent', `Invoice ${data.number} emailed to ${data.clientEmail}. Status set to Sent.`, 'OK');
  } catch (err) {
    ui.alert('Cannot send', String(err.message || err), 'OK');
  }
}

function markPaid() {
  const sheet = ss_().getSheetByName(CFG.invoicesSheet);
  const rowIndex = sheet.getActiveRange().getRow();
  const v = sheet.getRange(rowIndex, 1, 1, 13).getValues()[0];
  if (!v[CFG.col.number]) {
    SpreadsheetApp.getUi().alert('Select a row with an invoice number first.');
    return;
  }
  sheet.getRange(rowIndex, CFG.col.status + 1).setValue('Paid');
  sheet.getRange(rowIndex, CFG.col.paidDate + 1).setValue(new Date());
  ss_().getSheetByName(CFG.paymentsSheet).appendRow([
    new Date(), v[CFG.col.number], Number(v[CFG.col.total]) || 0, '', '', 'Marked paid from menu'
  ]);
  refreshSummary();
}

// ─── CASH FLOW ──────────────────────────────────────────────────────────────
function classify_(v, today) {
  const status = String(v[CFG.col.status] || '').toLowerCase();
  if (status === 'paid') return 'collected';
  if (status === 'draft') return 'draft';
  const due = new Date(v[CFG.col.dueDate]);
  if (isNaN(due.getTime())) return 'current';
  const days = Math.floor((today - due) / 86400000);
  if (days <= 0) return 'current';
  if (days <= 30) return 'over1';
  if (days <= 60) return 'over2';
  return 'over3';
}

function refreshSummary() {
  const sheet = ss_().getSheetByName(CFG.invoicesSheet);
  const rows = rowValues_(sheet);
  const today = new Date(); today.setHours(0, 0, 0, 0);

  const buckets = { collected: 0, current: 0, over1: 0, over2: 0, over3: 0, draft: 0 };
  const counts = { collected: 0, current: 0, over1: 0, over2: 0, over3: 0, draft: 0 };
  const byMonth = {};

  rows.forEach(({ v }) => {
    const total = Number(v[CFG.col.total]) || 0;
    const bucket = classify_(v, today);
    buckets[bucket] += total;
    counts[bucket] += 1;

    const issued = new Date(v[CFG.col.issueDate]);
    if (!isNaN(issued.getTime())) {
      const key = Utilities.formatDate(issued, Session.getScriptTimeZone(), 'yyyy-MM');
      byMonth[key] = byMonth[key] || { invoiced: 0, collected: 0 };
      byMonth[key].invoiced += total;
      if (bucket === 'collected') byMonth[key].collected += total;
    }
  });

  const outstanding = buckets.current + buckets.over1 + buckets.over2 + buckets.over3;
  const dash = ss_().getSheetByName('Dashboard') || ss_().insertSheet('Dashboard');
  dash.clear();

  let r = 1;
  dash.getRange(r, 1, 1, 3).setValues([['Cash Flow', 'Amount', 'Invoices']]).setFontWeight('bold');
  r += 2;
  [['Collected', 'collected'], ['Outstanding', null], ['Not yet due', 'current'],
   ['1–30 days late', 'over1'], ['31–60 days late', 'over2'], ['60+ days late', 'over3'],
   ['Still drafts', 'draft']]
    .forEach(([label, key]) => {
      const amount = key === null ? outstanding : buckets[key];
      const count = key === null ? counts.current + counts.over1 + counts.over2 + counts.over3 : counts[key];
      dash.getRange(r, 1, 1, 3).setValues([[label, amount, count]]);
      dash.getRange(r, 2).setNumberFormat('#,##0.00');
      r += 1;
    });

  r += 1;
  dash.getRange(r, 1, 1, 3).setValues([['Month', 'Invoiced', 'Collected']]).setFontWeight('bold');
  r += 1;
  Object.keys(byMonth).sort().forEach(month => {
    dash.getRange(r, 1, 1, 3).setValues([[month, byMonth[month].invoiced, byMonth[month].collected]]);
    dash.getRange(r, 2, 1, 2).setNumberFormat('#,##0.00');
    r += 1;
  });

  r += 1;
  dash.getRange(r, 1).setValue('Overdue invoices to chase');
  dash.getRange(r, 1).setFontWeight('bold');
  r += 1;
  const overdue = rows.filter(({ v }) => ['over1', 'over2', 'over3'].includes(classify_(v, today)));
  if (!overdue.length) {
    dash.getRange(r, 1).setValue('Nothing overdue.');
  } else {
    overdue.forEach(({ v }) => {
      dash.getRange(r, 1, 1, 4).setValues([[
        v[CFG.col.number], v[CFG.col.client], Number(v[CFG.col.total]) || 0, formatDate_(v[CFG.col.dueDate])
      ]]);
      dash.getRange(r, 3).setNumberFormat('#,##0.00');
      r += 1;
    });
  }
}

function chaseEmail() {
  const ui = SpreadsheetApp.getUi();
  const sheet = ss_().getSheetByName(CFG.invoicesSheet);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const overdue = rowValues_(sheet).filter(({ v }) =>
    ['over1', 'over2', 'over3'].includes(classify_(v, today)));

  if (!overdue.length) { ui.alert('Nothing overdue. Go do the work instead of refreshing.'); return; }

  const lines = overdue.map(({ v }) => {
    const c = clientFor_(v[CFG.col.client]);
    const days = Math.floor((today - new Date(v[CFG.col.dueDate])) / 86400000);
    return `<li><strong>${escapeHtml_(v[CFG.col.number])}</strong> — ${escapeHtml_(v[CFG.col.client])},
      ${escapeHtml_(money_(Number(v[CFG.col.total]) || 0, v[CFG.col.currency] || 'INR'))}
      (${days} days late, ${escapeHtml_(c.email || 'no email on Clients tab')})</li>`;
  }).join('');

  const s = getSettings_();
  ui.modalPrompt(
    `${overdue.length} overdue invoice(s). Copy-paste this into each client:\n\n` +
    `Subject: Reminder — invoice ${overdue[0].v[CFG.col.number]}\n\n` +
    `Hi [Name],\n\nJust flagging that invoice ${overdue[0].v[CFG.col.number]} for ` +
    `${money_(Number(overdue[0].v[CFG.col.total]) || 0, s['Default Currency'] || 'INR')} was due ` +
    `${formatDate_(overdue[0].v[CFG.col.dueDate])}. I know things slip.\n\n` +
    `Could you confirm whether payment is scheduled? If there's an issue with the invoice, tell me ` +
    `and I'll sort it today. Happy to accept part-payment this month if that's easier.\n\n` +
    `— ${s['Your Business Name']}\n\n──────────── FULL LIST ────────────\n<ul>${lines}</ul>`,
    'Payment reminders', 'Done', 'Cancel'
  );
}

// ─── MENU ───────────────────────────────────────────────────────────────────
function onOpen() {
  SpreadsheetApp.getUi().createMenu('🧾 Invoice Kit')
    .addItem('1. Run Setup (once)', 'setupKit')
    .addSeparator()
    .addItem('2. New Draft Invoice', 'createDraftInvoice')
    .addItem('3. Recalculate Totals', 'recalcSelected')
    .addItem('4. Create PDF in Drive', 'generatePdfForSelected')
    .addItem('5. Email PDF to Client', 'emailPdfForSelected')
    .addItem('6. Mark Row as Paid', 'markPaid')
    .addSeparator()
    .addItem('Refresh Cash-Flow Summary', 'refreshSummary')
    .addItem('Chase Overdue Payments', 'chaseEmail')
    .addToUi();
}

// ─── DAILY REMINDER (install from Apps Script triggers) ─────────────────────
function dailyOverdueCheck() {
  const s = getSettings_();
  const email = String(s['Your Email'] || '').trim();
  if (!email) return;

  const today = new Date(); today.setHours(0, 0, 0, 0);
  const rows = rowValues_(ss_().getSheetByName(CFG.invoicesSheet));

  const overdue = rows.filter(({ v }) => ['over1', 'over2', 'over3'].includes(classify_(v, today)));
  const dueSoon = rows.filter(({ v }) => {
    if (String(v[CFG.col.status] || '').toLowerCase() !== 'sent') return false;
    const due = new Date(v[CFG.col.dueDate]);
    if (isNaN(due.getTime())) return false;
    due.setHours(0, 0, 0, 0);
    const days = Math.floor((due - today) / 86400000);
    return days >= 0 && days <= 3;
  });

  if (!overdue.length && !dueSoon.length) return;

  const item = v => `<li>${escapeHtml_(v[CFG.col.number])} — ${escapeHtml_(v[CFG.col.client])},
    ${escapeHtml_(money_(Number(v[CFG.col.total]) || 0, v[CFG.col.currency] || 'INR'))}
    (due ${formatDate_(v[CFG.col.dueDate])})</li>`;

  MailApp.sendEmail({
    to: email,
    subject: `Invoices: ${overdue.length} overdue, ${dueSoon.length} due within 3 days`,
    htmlBody: `
      <h3>Overdue — send a reminder</h3>
      <ul>${overdue.map(o => item(o.v)).join('') || '<li>None.</li>'}</ul>
      <h3>Due soon — consider a heads-up</h3>
      <ul>${dueSoon.map(o => item(o.v)).join('') || '<li>None.</li>'}</ul>
      <p><em>Open the sheet → 🧾 Invoice Kit → Refresh Cash-Flow Summary.</em></p>`
  });
  refreshSummary();
}

function installReminderTrigger() {
  const has = ScriptApp.getProjectTriggers().some(t => t.getHandlerFunction() === 'dailyOverdueCheck');
  if (!has) {
    ScriptApp.newTrigger('dailyOverdueCheck').timeBased().everyDays(1).atHour(9).create();
    SpreadsheetApp.getUi().alert('Daily 9am invoice reminder installed.');
  } else {
    SpreadsheetApp.getUi().alert('Reminder already installed.');
  }
}
