// Unit tests for invoice-kit/invoice_script.gs — totals, tax rounding, aging buckets,
// PDF output and the email path.
const fs = require('fs');
const vm = require('vm');

const SRC = require('path').resolve(__dirname, process.argv[2] || '../invoice-kit/invoice_script.gs');
const code = fs.readFileSync(SRC, 'utf8');

class Range {
  constructor(sheet, a, b, nR, nC) {
    this.s = sheet;
    if (typeof a === 'string') {
      // A1 notation, e.g. 'A2:B10' or 'A1'
      const cell = t => { const m = /^([A-Z]+)(\d+)$/.exec(t); const col = m[1].split('').reduce((x, ch) => x * 26 + ch.charCodeAt(0) - 64, 0); return { r: +m[2], c: col }; };
      const [f, l] = a.split(':'); const start = cell(f); const end = cell(l || f);
      this.r = start.r; this.c = start.c; this.nR = end.r - start.r + 1; this.nC = end.c - start.c + 1;
    } else { this.r = a; this.c = b; this.nR = nR || 1; this.nC = nC || 1; }
  }
  getValues() {
    const out = [];
    for (let i = 0; i < this.nR; i++) {
      const row = [];
      for (let j = 0; j < this.nC; j++) row.push(this.s.get(this.r + i, this.c + j));
      out.push(row);
    }
    return out;
  }
  getValue() { return this.getValues()[0][0]; }
  setValues(v) {
    v.forEach((row, i) => row.forEach((val, j) => this.s.set(this.r + i, this.c + j, val)));
    return this;
  }
  setValue(v) { return this.setValues([[v]]); }
  setFontWeight() { return this; }
  setNumberFormat() { return this; }
  setFontColor() { return this; }
  getRow() { return this.r; }
  getColumn() { return this.c; }
}

class Sheet {
  constructor(name) { this.name = name; this.grid = {}; }
  key(r, c) { return r + ':' + c; }
  get(r, c) { return this.grid[this.key(r, c)] === undefined ? '' : this.grid[this.key(r, c)]; }
  set(r, c, v) { this.grid[this.key(r, c)] = v; }
  getRange(a, b, c, d) { return new Range(this, a, b, c, d); }
  clear() { this.grid = {}; return this; }
  getLastRow() { return Object.keys(this.grid).reduce((m, k) => Math.max(m, +k.split(':')[0]), 0); }
  getLastColumn() { return Object.keys(this.grid).reduce((m, k) => Math.max(m, +k.split(':')[1]), 0); }
  getDataRange() { return new Range(this, 1, 1, Math.max(this.getLastRow(), 1), Math.max(this.getLastColumn(), 1)); }
  appendRow(vals) { const r = this.getLastRow() + 1; vals.forEach((v, j) => this.set(r, j + 1, v)); return this; }
  setActiveRange() { this._active = true; return this; }
  getActiveRange() { return new Range(this, this._activeRow || 2, 1, 1, 1); }
  setName() { return this; }
  insertRowsBefore(at, n) { const shift={}; Object.keys(this.grid).forEach(k=>{const[r,c]=k.split(':').map(Number); if(r>=at) shift[(r+n)+':'+c]=this.grid[k]; else shift[k]=this.grid[k];}); this.grid=shift; return this; }
}

class Book {
  constructor(sheets) { this.sheets = sheets || {}; }
  getSheetByName(n) { return this.sheets[n] || null; }
  insertSheet(n) { this.sheets[n] = new Sheet(n); return this.sheets[n]; }
  getName() { return 'Test Book'; }
}

const uiCalls = [];
const mailCalls = [];
const driveFiles = [];
const SpreadsheetApp = {
  _book: null,
  getActiveSpreadsheet() { return SpreadsheetApp._book; },
  getUi() {
    return {
      alert: (...a) => uiCalls.push(['alert', ...a.map(String)]),
      confirm: () => 'yes',
      modalPrompt: (...a) => uiCalls.push(['modal', String(a[0]).slice(0, 400)]),
      YES: 'yes', NO: 'no'
    };
  }
};
const MailApp = { sendEmail: o => mailCalls.push(o) };
const Session = { getActiveUser: () => ({ getEmail: () => 'me@test.com' }), getScriptTimeZone: () => 'Asia/Kolkata' };
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const Utilities = {
  formatDate: (d, tz, fmt) => {
    if (fmt === 'yyyy-MM') return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
    return String(d.getDate()).padStart(2, '0') + ' ' + MONTHS[d.getMonth()] + ' ' + d.getFullYear();
  },
  newBlob: (data, type, name) => {
    // Real Blob: getAs() -> Blob, setName() -> Blob, setContentType() -> Blob
    const mk = n => ({
      name: n, data,
      getAs: t => mk(n),
      setName: nn => mk(nn),
      setContentType: t => mk(n),
      copyBlob() { return mk(n); }
    });
    return mk(name);
  }
};
const DriveApp = {
  getFolderById: () => ({ getId: () => 'F1', createFile: b => { driveFiles.push(b); return { getUrl: () => 'https://drive/' + b.name }; } }),
  createFolder: n => ({ getId: () => 'F1', createFile: b => { driveFiles.push(b); return { getUrl: () => 'https://drive/' + b.name }; } })
};
const PropertiesService = { getUserProperties: () => { const s = {}; return { getProperty: k => s[k], setProperty: (k, v) => { s[k] = v; } }; } };
const ScriptApp = { getProjectTriggers: () => [], newTrigger: () => ({ timeBased: () => ({ everyDays: () => ({ atHour: () => ({ create: () => {} }) }) }) }) };

const ctx = vm.createContext({
  SpreadsheetApp, MailApp, Session, Utilities, DriveApp, PropertiesService, ScriptApp,
  console, Number, Date, Math, JSON, String, Array, Object, isNaN, parseInt, parseFloat, RegExp, Error, RegExp
});
const wrapped = `(function(){${code}\nreturn {CFG, setupKit, createDraftInvoice, recalcSelected, recalcRow_, parseItems_, money_, nextInvoiceNumber_, classify_, refreshSummary, chaseEmail, buildInvoiceHtml_, makePdf_, invoiceDataFromRow_, generatePdfForSelected, emailPdfForSelected, markPaid, dailyOverdueCheck, escapeHtml_, getSettings_, clientFor_, rowValues_, installReminderTrigger, onOpen};})()`;
const api = vm.runInContext(wrapped, ctx, { filename: 'invoice_script.gs' });

// ── assertions ──────────────────────────────────────────────────────────────
let pass = 0, fail = 0;
const eq = (name, got, want) => {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + '\n        got  ' + g + '\n        want ' + w); }
};
const truthy = (name, v, detail) => { if (v) { pass++; console.log('  ok   ' + name); } else { fail++; console.log('  FAIL ' + name + (detail ? '\n        ' + detail : '')); } };

console.log('\n=== pure helpers ===');
eq('parseItems_ two lines', api.parseItems_('Design | 1 | 45000\nRetainer | 3 | 5000').map(i => i.amount), [45000, 15000]);
eq('parseItems_ no qty/price', api.parseItems_('Flat fee').map(i => [i.desc, i.qty, i.price]), [['Flat fee', 1, 0]]);
eq('parseItems_ empty', api.parseItems_(''), []);
eq('money_ INR', api.money_(150000, 'INR'), '₹1,50,000.00');
eq('money_ unknown currency prefixes', api.money_(10, 'JPY'), 'JPY 10.00');
eq('escapeHtml_ blocks injection', api.escapeHtml_('<img src=x onerror=alert(1)>'), '&lt;img src=x onerror=alert(1)&gt;');

console.log('\n=== invoice numbering ===');
SpreadsheetApp._book = new Book({ Invoices: new Sheet('Invoices'), Settings: new Sheet('Settings') });
eq('first number', api.nextInvoiceNumber_(), 'INV-0001');
api.createDraftInvoice();
api.createDraftInvoice();
eq('sequential after drafts', api.rowValues_(SpreadsheetApp._book.getSheetByName('Invoices')).map(r => r.v[0]), ['INV-0001', 'INV-0002']);
eq('headers auto-created', SpreadsheetApp._book.getSheetByName('Invoices').get(1,1), 'Invoice #');

console.log('\n=== totals (the money path) ===');
const inv = SpreadsheetApp._book.getSheetByName('Invoices');
inv.set(2, 2, 'Acme'); inv.set(2, 5, 'Design | 1 | 45000\nRetainer | 3 | 5000'); inv.set(2, 7, 18);
const t = api.recalcRow_(2);
eq('subtotal', t.subtotal, 60000);
eq('tax at 18% of 60000', t.tax, 10800);
eq('total', t.total, 70800);
inv.set(3, 2, 'Beta'); inv.set(3, 5, 'Audit | 1 | 10000'); inv.set(3, 7, 0);
const t2 = api.recalcRow_(3);
eq('zero tax', [t2.subtotal, t2.tax, t2.total], [10000, 0, 10000]);

console.log('\n=== rounding on odd amounts ===');
inv.set(4, 5, 'Thing | 3 | 99.99'); inv.set(4, 7, 18); inv.set(4, 2, 'Gamma');
const t3 = api.recalcRow_(4);
eq('subtotal exact', Math.round(t3.subtotal * 100) / 100, 299.97);
truthy('tax is 18% not 0.18%', Math.abs(t3.tax - 53.9946) < 0.01, 'got ' + t3.tax);

console.log('\n=== aging buckets ===');
const mk = (status, dueDays) => { const d = new Date(); d.setDate(d.getDate() + dueDays); return [status, d]; };
const cases = [
  ['Paid', -10, 'collected'], ['Draft', 5, 'draft'], ['Sent', 5, 'current'],
  ['Sent', 0, 'current'], ['Sent', -1, 'over1'], ['Sent', -30, 'over1'],
  ['Sent', -31, 'over2'], ['Sent', -60, 'over2'], ['Sent', -61, 'over3'], ['Sent', -400, 'over3']
];
cases.forEach(([st, days, want]) => {
  const d = new Date(); d.setDate(d.getDate() + days);
  eq('bucket ' + st + '/' + days, api.classify_([ 'X', 'C', new Date(), d, '', 0, 0, 0, 0, st], new Date()), want);
});
eq('bad due date is current', api.classify_(['X','C',new Date(),'n/a','','','','','','Sent'], new Date()), 'current');

console.log('\n=== cash-flow dashboard ===');
const b = new Book({ Clients: new Sheet('Clients'), Invoices: new Sheet('Invoices'), Settings: new Sheet('Settings'), Payments: new Sheet('Payments') });
SpreadsheetApp._book = b;
b.sheets.Settings.getRange(2, 1, 9, 2).setValues([
  ['Your Business Name', 'Test Co'], ['Your Address', '1 Road'], ['Your Email', 'me@t.com'],
  ['Your Phone', '123'], ['GSTIN / Tax ID', 'GST9'], ['Default Currency', 'INR'],
  ['Default Tax Rate (%)', '18'], ['Payment Terms (days)', '14'], ['Invoice Number Prefix', 'INV-']
]);
b.sheets.Clients.getRange(1, 1, 3, 5).setValues([
  ['Client Name','Email','Address','Phone','GSTIN'],
  ['Acme','buy@acme.com','2 Street','999','GA'],
  ['<script>alert(1)</script>','x@y.com','z','1','']
]);
const I = b.sheets.Invoices;
const days = n => { const d = new Date(); d.setDate(d.getDate() + n); return d; };
I.getRange(1, 1, 1, 13).setValues([['Invoice #','Client','Issue','Due','Items','Sub','Tax%','Tax','Total','Status','Paid','Cur','Notes']]);
const rows = [
  ['INV-0001','Acme',days(-40),days(-26),'Design | 1 | 50000',50000,18,9000,59000,'Paid',days(-30),'INR',''],
  ['INV-0002','Acme',days(-20),days(-6),'Audit | 1 | 20000',20000,0,0,20000,'Sent','','INR',''],
  ['INV-0003','Beta',days(-10),days(4),'Fix | 2 | 5000',10000,0,0,10000,'Sent','','INR',''],
  ['INV-0004','<script>alert(1)</script>',days(-5),days(9),'X | 1 | 1000',1000,0,0,1000,'Draft','','INR',''],
  ['INV-0005','Gamma',days(-90),days(-75),'Old | 1 | 7777',7777,0,0,7777,'Sent','','INR',''],
  ['INV-0006','Delta',days(-90),days(-45),'Mid | 1 | 500',500,0,0,500,'Sent','','INR','']
];
rows.forEach((r, i) => I.getRange(i + 2, 1, 1, 13).setValues([r]));
api.refreshSummary();
const D = b.getSheetByName('Dashboard');
const flat = [];
for (let r = 1; r <= D.getLastRow(); r++) { const row = []; for (let c = 1; c <= 4; c++) row.push(D.get(r, c)); if (row.some(x => x !== '')) flat.push(row.slice(0, 3)); }
const findRow = label => flat.find(f => String(f[0]) === label);
eq('collected total', findRow('Collected')[1], 59000);
eq('outstanding = current+all overdue', findRow('Outstanding')[1], 20000 + 10000 + 7777 + 500);
eq('not yet due', findRow('Not yet due')[1], 10000);
eq('1-30 late', findRow('1–30 days late')[1], 20000);
eq('31-60 late', findRow('31–60 days late')[1], 500);
eq('60+ late', findRow('60+ days late')[1], 7777);
eq('drafts excluded from outstanding', findRow('Still drafts')[1], 1000);

console.log('\n=== PDF + email path ===');
api._resetCalls = () => { mailCalls.length = 0; driveFiles.length = 0; uiCalls.length = 0; };
const data = api.invoiceDataFromRow_(2);
truthy('data has client email', data.clientEmail === 'buy@acme.com', JSON.stringify(data.clientEmail));
const html = api.buildInvoiceHtml_(data);
truthy('html has invoice number', html.includes('INV-0001'));
truthy('html has formatted total', html.includes('59,000'), html.match(/Total[\s\S]{0,120}/)?.[0]);
const xss = api.invoiceDataFromRow_(5);
const xhtml = api.buildInvoiceHtml_(xss);
truthy('XSS in client name is escaped', !xhtml.includes('<script>'), 'raw <script> leaked');
api._resetCalls();
SpreadsheetApp._book.getSheetByName('Invoices').setActiveRange;
b.sheets.Invoices._active = true;
const origActive = b.sheets.Invoices.getActiveRange.bind(b.sheets.Invoices);
b.sheets.Invoices.getActiveRange = () => new Range(b.sheets.Invoices, 2, 1, 1, 1);
api.generatePdfForSelected();
truthy('PDF created in Drive folder', driveFiles.length === 1 && driveFiles[0].name === 'Invoice-INV-0001.pdf', JSON.stringify({files: driveFiles.map(f=>f&&f.name), ui: uiCalls}));
api.emailPdfForSelected();
truthy('email sent to client', mailCalls.length === 1 && mailCalls[0].to === 'buy@acme.com', JSON.stringify(mailCalls.map(m => m.to)));
truthy('email subject has number + amount', /INV-0001.*59,000/.test(mailCalls[0].subject), mailCalls[0]?.subject);
truthy('status flipped to Sent', b.sheets.Invoices.get(2, 10) === 'Sent');
api._resetCalls();
b.sheets.Invoices.getActiveRange = () => new Range(b.sheets.Invoices, 5, 1, 1, 1); // XSS row
api.emailPdfForSelected();
truthy('xss client email escapes into body', mailCalls.length === 1 && !mailCalls[0].htmlBody.includes('<script>'));
api._resetCalls();
b.sheets.Invoices.getActiveRange = () => new Range(b.sheets.Invoices, 4, 1, 1, 1); // Beta (no client record)
api.emailPdfForSelected();
truthy('missing client email blocks send', mailCalls.length === 0 && uiCalls.some(c => c[0] === 'alert' && /No client email/.test(c[1] || '')), JSON.stringify(uiCalls));
b.sheets.Invoices.getActiveRange = () => new Range(b.sheets.Invoices, 3, 1, 1, 1);
api.markPaid();
truthy('markPaid logs payment row', b.sheets.Payments.getLastRow() === 1 && b.sheets.Invoices.get(3, 10) === 'Paid');
api._resetCalls();
api.dailyOverdueCheck();
truthy('daily check emails overdue count', mailCalls.length === 1 && /3 overdue, 0 due within 3 days/.test(mailCalls[0].subject), JSON.stringify({mail: mailCalls.map(m => m.subject), ui: uiCalls}));
api._resetCalls();
api.chaseEmail();
truthy('chase produces reminder text', uiCalls.some(c => c[0] === 'modal' && /Reminder|reminder|invoice/.test(c[1])), JSON.stringify(uiCalls).slice(0, 200));

console.log('\n=== edge: empty sheet ===');
SpreadsheetApp._book = new Book({ Clients: new Sheet('C'), Invoices: new Sheet('Invoices'), Settings: new Sheet('S'), Payments: new Sheet('P') });
SpreadsheetApp._book.sheets.Invoices.getRange(1, 1, 1, 13).setValues([['h1','h2','h3','h4','h5','h6','h7','h8','h9','h10','h11','h12','h13']]);
let threw = null;
try { api.refreshSummary(); } catch (e) { threw = String(e.message || e); }
truthy('refreshSummary survives empty sheet', threw === null, threw);
threw = null;
try { api.dailyOverdueCheck(); } catch (e) { threw = String(e.message || e); }
truthy('daily check survives empty sheet', threw === null, threw);

console.log('\n----------------------------------------');
console.log(`PASS ${pass}   FAIL ${fail}`);
process.exit(fail ? 1 : 0);
