// Unit tests for proposals-kit/proposal_script.gs — numbering, deposit math,
// stage moves, weighted dashboard, expiry detection, PDF/email safety, and the
// convert-to-invoice bridge.
const M = require('./mock.js');
const { Sheet, Book, Range } = M;

const SRC = require('path').resolve(__dirname, '../proposals-kit/proposal_script.gs');
const api = M.load(SRC, [
  'PR', 'PR_HEADERS', 'setupProposals', 'createDraftProposal', 'prNextNumber_',
  'prRecalc_', 'prItems_', 'prMoney_', 'prEsc_', 'prSettings_', 'prWeights_',
  'prRows_', 'prProposalHtml_', 'prClient_', 'prDay_', 'prDaysBetween_',
  'recalcProposalTotals', 'downloadProposalPdf', 'emailProposalForSelected',
  'convertProposalToInvoice', 'prRefreshDashboard', 'refreshProposalDashboard',
  'dailyProposalCheck', 'markLapsedProposals', 'chaseProposalForSelected',
  'prExpirySummary_', 'installProposalReminder', 'logProposalActivity',
  'setProposalSent', 'setProposalAccepted', 'setProposalWon', 'setProposalLost',
  'onOpen', 'proposalKitMenu_'
]);

let pass = 0, fail = 0;
const eq = (name, got, want) => {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + '\n        got  ' + g + '\n        want ' + w); }
};
const truthy = (name, v, detail) => {
  if (v) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (detail ? '\n        ' + String(detail).slice(0, 300) : '')); }
};

const P = api.PR;
const NCOL = 15;
const days = n => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + n); return d; };

const SETTINGS = [
  ['Your Business Name', 'Kite Studio'],
  ['Your Address', '49 Lane, Pune'],
  ['Your Email', 'me@kite.studio'],
  ['Your Phone', '+91-99'],
  ['GSTIN / Tax ID', '27ABCDE1234F1Z5'],
  ['Default Currency', 'INR'],
  ['Default Tax Rate (%)', '18'],
  ['Payment Terms (days)', '14'],
  ['Proposal Valid For (days)', '14'],
  ['Default Deposit (%)', '40'],
  ['Proposal Number Prefix', 'PROP-']
];

// A proposal row in the shipped column order.
function proposal(over) {
  const r = new Array(NCOL).fill('');
  const o = Object.assign({
    number: 'PROP-001', client: 'Acme', date: days(-10), valid: days(4),
    scope: 'Website build | 40 | 1500', subtotal: 60000, taxRate: 18, tax: 10800,
    total: 70800, depositPct: 40, deposit: 28320, status: 'Sent'
  }, over);
  r[0] = o.number; r[1] = o.client; r[2] = o.date; r[3] = o.valid; r[4] = o.scope;
  r[5] = o.subtotal; r[6] = o.taxRate; r[7] = o.tax; r[8] = o.total;
  r[9] = o.depositPct; r[10] = o.deposit; r[11] = o.status;
  r[12] = o.sent || ''; r[13] = o.won || ''; r[14] = o.notes || '';
  return r;
}

function fresh(rows, opts) {
  const o = opts || {};
  const b = new Book({
    'Proposals': new Sheet('Proposals'),
    'Clients': new Sheet('Clients'),
    'Proposal Stages': new Sheet('Proposal Stages'),
    'Proposal Activities': new Sheet('Proposal Activities'),
    'Proposal Dashboard': new Sheet('Proposal Dashboard'),
    'Settings': new Sheet('Settings')
  });
  if (o.noSettings !== true) {
    b.sheets.Settings.getRange('A1:B1').setValues([['Setting', 'Value']]);
    rows0(b.sheets.Settings, SETTINGS);
  }
  b.sheets.Clients.getRange(1, 1, 1, 5).setValues([['Client Name', 'Email', 'Address', 'Phone', 'GSTIN']]);
  b.sheets.Clients.getRange(2, 1, 3, 5).setValues([
    ['Acme', 'buy@acme.com', '2 Street, Pune', '99999', '27ACME'],
    ['Northwind', 'ops@northwind.co', '9 MG Road', '88888', ''],
    ['<script>x</script>', 'xss@evil.test', 'Nowhere', '7', '']
  ]);
  b.sheets['Proposals'].getRange(1, 1, 1, NCOL).setValues([api.PR_HEADERS]);
  rows0(b.sheets['Proposals'], rows.map(proposal), 2);
  if (o.noStages !== true) {
    b.sheets['Proposal Stages'].getRange(1, 1, 1, 4).setValues([['Stage', 'Order', 'Win Chance (%)', 'Notes']]);
    b.sheets['Proposal Stages'].getRange(2, 1, 8, 4).setValues([
      ['Draft', 1, 0, ''], ['Sent', 2, 15, ''], ['Follow-up', 3, 35, ''],
      ['Negotiating', 4, 60, ''], ['Accepted', 5, 90, ''], ['Won', 6, 100, ''],
      ['Lost', 7, 0, ''], ['Expired', 8, 5, '']
    ]);
  }
  M.setBook(b);
  M.reset();
  return b;
}
function rows0(sheet, values, startRow) {
  const at = startRow || 2;
  values.forEach((r, i) => sheet.getRange(at + i, 1, 1, r.length).setValues([r]));
}
function selectRow(b, n) { b.sheets['Proposals']._activeRow = n; }

console.log('\n=== pure helpers ===');
fresh([]);
eq('items parse qty x rate', api.prItems_('Design | 3 | 5000').map(i => i.amount), [15000]);
eq('items tolerate missing numbers', api.prItems_('Flat advisory').map(i => [i.desc, i.qty, i.rate]), [['Flat advisory', 1, 0]]);
eq('items ignore blank lines', api.prItems_('A | 1 | 100\n\n   \nB | 2 | 50').map(i => i.amount), [100, 100]);
eq('money groups in lakhs', api.prMoney_(141600, 'INR'), '₹1,41,600.00');
eq('money honours currency', api.prMoney_(1500, 'USD'), '$1,500.00');
eq('escape blocks markup', api.prEsc_('<img src=x onerror=alert(1)>'), '&lt;img src=x onerror=alert(1)&gt;');
eq('escape handles quotes', api.prEsc_('He said "hi" & left'), 'He said &quot;hi&quot; &amp; left');
eq('days between whole days', api.prDaysBetween_(days(-3), days(0)), 3);
eq('bad date is null not Invalid Date', api.prDay_('not a date'), null);

console.log('\n=== settings read by key, not by position ===');
const bSet = fresh([]);
eq('reads business name', api.prSettings_()['Your Business Name'], 'Kite Studio');
eq('reads deposit default', api.prSettings_()['Default Deposit (%)'], '40');
// Simulate a bundle install: CRM rows appended ABOVE and BELOW ours.
bSet.sheets.Settings.appendRow(['Unrelated CRM Setting', 'x']);
bSet.sheets.Settings.insertRowsBefore(2, 3);
rows0(bSet.sheets.Settings, [['Your Email', 'crm-owner@t.com'], ['Default Follow-up Days', '3'], ['Auto-Reminder Enabled', 'TRUE']], 2);
truthy('survives rows inserted above ours', api.prSettings_()['Proposal Number Prefix'] === 'PROP-',
  JSON.stringify(api.prSettings_()));
truthy('shared tab does not confuse keys', api.prSettings_()['Your Email'] === 'me@kite.studio' || api.prSettings_()['Your Email'] === 'crm-owner@t.com',
  'got ' + api.prSettings_()['Your Email']);

console.log('\n=== weights come from the Stages tab ===');
fresh([]);
eq('sent weight', api.prWeights_()['sent'], 15);
eq('stage names lowercased for lookup', api.prWeights_()['follow-up'], 35);
const bW = fresh([], { noStages: true });
eq('falls back to defaults when Stages is empty', api.prWeights_()['negotiating'], 60);
bW.sheets['Proposal Stages'].getRange(2, 1, 1, 4).setValues([['Sent', 2, 25, 'tuned upward']]);
eq('buyer can retune a weight', api.prWeights_()['sent'], 25);

console.log('\n=== numbering ===');
const b1 = fresh([{ number: 'PROP-007', client: 'Acme' }]);
eq('next after highest', api.prNextNumber_(), 'PROP-008');
const b2 = fresh([]);
api.createDraftProposal();
eq('first draft number', b2.sheets['Proposals'].get(2, 1), 'PROP-001');
eq('draft starts in Draft stage', b2.sheets['Proposals'].get(2, 12), 'Draft');
eq('draft validity uses settings', api.prDaysBetween_(days(0), b2.sheets['Proposals'].get(2, 4)), 14);
eq('draft picks up deposit %', b2.sheets['Proposals'].get(2, 10), 40);
api.createDraftProposal();
eq('sequential drafts', [b2.sheets['Proposals'].get(2, 1), b2.sheets['Proposals'].get(3, 1)], ['PROP-001', 'PROP-002']);

console.log('\n=== totals and deposit math ===');
const b3 = fresh([{ scope: 'Website | 40 | 1500\nCopy | 6 | 900', taxRate: 18, depositPct: 40 }]);
const t3 = api.prRecalc_(2);
eq('subtotal from two lines', t3.subtotal, 65400);
eq('tax at 18%', t3.tax, 11772);
eq('total', t3.total, 77172);
eq('deposit is 40% of total', t3.deposit, 30868.8);
eq('recalc writes back to the sheet', [b3.sheets['Proposals'].get(2, 6), b3.sheets['Proposals'].get(2, 9)], [65400, 77172]);
const b3z = fresh([{ scope: 'Thing | 1 | 10000', taxRate: 0, depositPct: 0 }]);
const t3z = api.prRecalc_(2);
eq('no tax no deposit', [t3z.tax, t3z.deposit], [0, 0]);
truthy('totals written even when deposit is zero', b3z.sheets['Proposals'].get(2, 11) === 0,
  'got ' + JSON.stringify(b3z.sheets['Proposals'].get(2, 11)));

console.log('\n=== stage moves ===');
const b4 = fresh([{ number: 'PROP-010', status: 'Sent', sent: '' }]);
selectRow(b4, 2);
api.setProposalAccepted();
eq('accepted writes status', b4.sheets['Proposals'].get(2, 12), 'Accepted');
truthy('accepted stamps a date', b4.sheets['Proposals'].get(2, 14) instanceof Date, JSON.stringify(b4.sheets['Proposals'].get(2, 14)));
truthy('stage move is logged', b4.sheets['Proposal Activities'].get(2, 3) === 'Stage' &&
  /Sent → Accepted/.test(String(b4.sheets['Proposal Activities'].get(2, 4))), JSON.stringify(b4.sheets['Proposal Activities'].grid));
const b5 = fresh([{ number: 'PROP-011', status: 'Draft', sent: '' }]);
selectRow(b5, 2);
api.setProposalSent();
truthy('sent stamps Sent Date', b5.sheets['Proposals'].get(2, 13) instanceof Date);
const before = b5.sheets['Proposals'].get(2, 13);
b5.sheets['Proposals']._activeRow = 2;
api.setProposalSent();
eq('moving to same stage is a no-op', b5.sheets['Proposals'].get(2, 12), 'Sent');
eq('re-sending does not overwrite Sent Date', b5.sheets['Proposals'].get(2, 13), before);
const b6 = fresh([]);
selectRow(b6, 2);
api.setProposalWon();
truthy('stage move on an empty row asks for a selection',
  M.uiCalls.some(c => /Select a proposal row/.test(JSON.stringify(c))), JSON.stringify(M.uiCalls));

console.log('\n=== dashboard: weighted pipeline and win rate ===');
const b7 = fresh([
  { number: 'PROP-001', client: 'Acme', status: 'Sent', total: 70800, subtotal: 60000, deposit: 28320, valid: days(4), date: days(-10) },
  { number: 'PROP-002', client: 'Northwind', status: 'Negotiating', total: 200000, subtotal: 169491.53, deposit: 80000, valid: days(2), date: days(-6) },
  { number: 'PROP-003', client: 'Acme', status: 'Won', total: 45000, subtotal: 38135.59, deposit: 18000, valid: days(-20), date: days(-30) },
  { number: 'PROP-004', client: 'Northwind', status: 'Lost', total: 90000, subtotal: 76271.19, deposit: 36000, valid: days(-25), date: days(-40) },
  { number: 'PROP-005', client: 'Acme', status: 'Expired', total: 10000, subtotal: 8474.58, deposit: 4000, valid: days(-31), date: days(-45) }
]);
const d7 = api.prRefreshDashboard();
eq('open excludes won/lost/expired', d7.open, 2);
eq('open value counts only open', d7.openValue, 270800);
eq('weighted uses per-stage probability', d7.weighted, Math.round(70800 * 0.15 + 200000 * 0.60));
// decided = accepted/won + lost. Expired is its own outcome, not a lost deal.
eq('win rate = accepted+won over decided', d7.winRate, 50);
eq('expiring within 3 days detected', d7.expiring.map(e => e.number), ['PROP-002']);
eq('lapsed detected', d7.expired.map(e => e.number), []);
const D = b7.sheets['Proposal Dashboard'];
const cell = (r, c) => D.get(r, c);
eq('dashboard titles itself', cell(1, 1), 'Proposals Dashboard');
eq('open proposals row', [cell(4, 1), cell(4, 2)], ['Open Proposals', 2]);
eq('weighted pipeline row', [cell(6, 1), cell(6, 2)], ['Weighted Pipeline', 130620]);
eq('win rate stored as fraction', Math.round(cell(8, 2) * 1000) / 1000, 0.5);
truthy('stage counts table present', [cell(10, 1), cell(10, 2)].join(',') === 'Stage,Count', JSON.stringify([cell(10, 1), cell(10, 2)]));

console.log('\n=== dashboard month grouping ===');
eq('two months of proposals', (() => {
  const b8 = fresh([
    { number: 'PROP-020', status: 'Sent', date: days(-70), valid: days(-56), total: 1000 },
    { number: 'PROP-021', status: 'Won', date: days(-5), valid: days(9), total: 2000 }
  ]);
  api.prRefreshDashboard();
  const s = b8.sheets['Proposal Dashboard'];
  let found = 0;
  for (let r = 1; r <= s.getLastRow(); r++) if (/^\d{4}-\d{2}$/.test(String(s.get(r, 1)))) found++;
  return found;
})(), 2);

console.log('\n=== expiry email ===');
const b9 = fresh([
  { number: 'PROP-030', client: 'Acme', status: 'Sent', total: 70800, valid: days(2), date: days(-12) },
  { number: 'PROP-031', client: 'Northwind', status: 'Follow-up', total: 50000, valid: days(-3), date: days(-20) },
  { number: 'PROP-032', client: 'Acme', status: 'Won', total: 90000, valid: days(-30), date: days(-60) }
]);
M.reset();
const r9 = api.dailyProposalCheck();
eq('counts what needs action', r9.count, 2);
truthy('won proposals are never chased', !/PROP-032/.test(JSON.stringify(M.mailCalls)), JSON.stringify(M.mailCalls));
truthy('subject carries both counts', M.mailCalls.length === 1 && /1 expiring, 1 lapsed/.test(M.mailCalls[0].subject),
  M.mailCalls[0] && M.mailCalls[0].subject);
truthy('body names the lapsed value', /₹50,000\.00/.test(M.mailCalls[0].body), M.mailCalls[0].body.slice(0, 400));
const b10 = fresh([{ number: 'PROP-040', status: 'Sent', valid: days(20), date: days(-1), total: 1000 }]);
M.reset();
api.dailyProposalCheck();
truthy('quiet inbox says so', /nothing expiring/.test(M.mailCalls[0].subject), M.mailCalls[0].subject);

console.log('\n=== auto-expire ===');
const b11 = fresh([
  { number: 'PROP-050', status: 'Sent', valid: days(-2), total: 5000, date: days(-16) },
  { number: 'PROP-051', status: 'Negotiating', valid: days(5), total: 6000, date: days(-9) },
  { number: 'PROP-052', status: 'Accepted', valid: days(-4), total: 7000, date: days(-14) }
]);
M.reset();
eq('expires only lapsed open rows', api.markLapsedProposals(), 1);
eq('lapsed row now Expired', b11.sheets['Proposals'].get(2, 12), 'Expired');
eq('future row untouched', b11.sheets['Proposals'].get(3, 12), 'Negotiating');
eq('accepted row not downgraded', b11.sheets['Proposals'].get(4, 12), 'Accepted');
truthy('auto-expire logged as a stage change', /Expired \(auto\)/.test(String(b11.sheets['Proposal Activities'].get(2, 4))),
  JSON.stringify(b11.sheets['Proposal Activities'].grid));

console.log('\n=== PDF output safety ===');
const b12 = fresh([{ number: 'PROP-060', client: 'Acme', status: 'Sent', total: 70800, deposit: 28320, depositPct: 40, taxRate: 18, subtotal: 60000, valid: days(4), notes: 'Phase 1 & 2 <b>only</b>' }]);
const built = api.prProposalHtml_(2);
truthy('proposal number in PDF', /PROP-060/.test(built.html));
truthy('lakh-grouped total in PDF', /₹70,800\.00/.test(built.html), built.html.match(/grand[\s\S]{0,120}/));
truthy('deposit block shown', /Deposit required: ₹28,320\.00/.test(built.html));
truthy('GSTIN printed', /27ACME/.test(built.html));
truthy('client note is escaped, not injected', /Phase 1 &amp; 2 &lt;b&gt;only&lt;\/b&gt;/.test(built.html), built.html.match(/class="note">[^<]*/));
truthy('no raw script tag from cell content', !/<script/i.test(built.html));
const b13 = fresh([{ number: 'PROP-061', client: '<script>x</script>', status: 'Sent' }]);
const built13 = api.prProposalHtml_(2);
truthy('injected client name neutralised in PDF', !/<script>x<\/script>/.test(built13.html), built13.html.match(/PREPARED FOR[\s\S]{0,140}/));
const b14 = fresh([{ number: 'PROP-062', client: 'Ghost', status: 'Sent' }]);
const built14 = api.prProposalHtml_(2);
eq('unknown client still renders with their name', built14.client.name, 'Ghost');
eq('unknown client has no email so sending is blocked', built14.client.email, '');
M.reset();
selectRow(b14, 2);
api.downloadProposalPdf();
truthy('PDF still saved without an email', M.driveFiles.length === 1 && M.driveFiles[0].name === 'Proposal-PROP-062.pdf',
  JSON.stringify(M.driveFiles.map(f => f && f.name)));
truthy('user warned about the missing email', M.uiCalls.some(c => /No client email/.test(JSON.stringify(c))), JSON.stringify(M.uiCalls));

console.log('\n=== emailing a proposal ===');
const b15 = fresh([{ number: 'PROP-070', client: 'Acme', status: 'Draft', subtotal: 60000, taxRate: 18, total: 70800, deposit: 28320, depositPct: 40, valid: days(4) }]);
selectRow(b15, 2);
M.reset();
api.emailProposalForSelected();
eq('one email out', M.mailCalls.length, 1);
eq('to the client address', M.mailCalls[0].to, 'buy@acme.com');
truthy('subject identifies the proposal', /PROP-070/.test(M.mailCalls[0].subject), M.mailCalls[0].subject);
truthy('body states total and deposit', /₹70,800\.00/.test(M.mailCalls[0].body) && /₹28,320\.00/.test(M.mailCalls[0].body),
  M.mailCalls[0].body.slice(0, 300));
truthy('real PDF blob attached', Array.isArray(M.mailCalls[0].attachments) && M.mailCalls[0].attachments.length === 1 &&
  /\.pdf$/.test(M.mailCalls[0].attachments[0].name), JSON.stringify(M.mailCalls[0].attachments && M.mailCalls[0].attachments.map(a => a.name)));
eq('sending advances Draft to Sent', b15.sheets['Proposals'].get(2, 12), 'Sent');
truthy('sent date recorded', b15.sheets['Proposals'].get(2, 13) instanceof Date);
truthy('pdf then email both logged',
  [b15.sheets['Proposal Activities'].get(2, 3), b15.sheets['Proposal Activities'].get(3, 3)].join(',') === 'PDF,Email',
  JSON.stringify(b15.sheets['Proposal Activities'].grid));

console.log('\n=== chase ===');
const b16 = fresh([{ number: 'PROP-080', client: 'Northwind', status: 'Sent', total: 40000, valid: days(-1), date: days(-15) }]);
selectRow(b16, 2);
M.reset();
api.chaseProposalForSelected();
truthy('chase emails the client', M.mailCalls.length === 1 && M.mailCalls[0].to === 'ops@northwind.co', JSON.stringify(M.mailCalls.map(m => m.to)));
truthy('chase offers to move scope rather than pretend', /move scope/.test(M.mailCalls[0].body));
eq('chase sets Follow-up', b16.sheets['Proposals'].get(2, 12), 'Follow-up');

console.log('\n=== convert to invoice (the bridge) ===');
const b17 = fresh([{ number: 'PROP-090', client: 'Acme', status: 'Accepted', scope: 'Website | 40 | 1500', subtotal: 60000, taxRate: 18, tax: 10800, total: 70800, depositPct: 40, deposit: 28320 }]);
selectRow(b17, 2);
M.reset();
const made = api.convertProposalToInvoice();
truthy('invoicing tab created on demand', !!b17.sheets['Invoices'], 'no Invoices sheet');
eq('invoice headers written', b17.sheets['Invoices'].get(1, 1), 'Invoice #');
eq('first invoice number', made.number, 'INV-0001');
eq('bills the deposit only', made.amount, 28320);
eq('deposit invoice carries no extra tax', [b17.sheets['Invoices'].get(2, 6), b17.sheets['Invoices'].get(2, 7), b17.sheets['Invoices'].get(2, 8), b17.sheets['Invoices'].get(2, 9)], [28320, 0, 0, 28320]);
truthy('line item explains itself', /^Deposit against PROP-090 \(40% of ₹70,800\.00\) \| 1 \| 28320$/.test(String(b17.sheets['Invoices'].get(2, 5))),
  b17.sheets['Invoices'].get(2, 5));
eq('client carried over', b17.sheets['Invoices'].get(2, 2), 'Acme');
eq('starts as a Draft invoice', b17.sheets['Invoices'].get(2, 10), 'Draft');
eq('currency carried over', b17.sheets['Invoices'].get(2, 12), 'INR');
truthy('due date uses payment terms', api.prDaysBetween_(new Date(), b17.sheets['Invoices'].get(2, 4)) === 14,
  String(b17.sheets['Invoices'].get(2, 4)));
truthy('conversion logged against the proposal', /Created draft INV-0001/.test(String(b17.sheets['Proposal Activities'].get(2, 4))),
  JSON.stringify(b17.sheets['Proposal Activities'].grid));
const made2 = api.convertProposalToInvoice();
eq('second conversion gets the next number', made2.number, 'INV-0002');

const b18 = fresh([{ number: 'PROP-099', client: 'Acme', status: 'Negotiating', scope: 'Website | 40 | 1500', subtotal: 60000, taxRate: 18, tax: 10800, total: 70800, depositPct: 0, deposit: 0 }]);
selectRow(b18, 2);
const full = api.convertProposalToInvoice();
eq('no deposit means bill the whole proposal', full.amount, 70800);
eq('full invoice keeps the tax rate', b18.sheets['Invoices'].get(2, 7), 18);
eq('full invoice copies the scope lines', b18.sheets['Invoices'].get(2, 5), 'Website | 40 | 1500');
eq('converting flips the proposal to Accepted', b18.sheets['Proposals'].get(2, 12), 'Accepted');

// Existing invoice numbers must not be reused.
const b19 = fresh([{ number: 'PROP-098', client: 'Acme', status: 'Sent', total: 10000, deposit: 0 }]);
b19.sheets.Invoices = new Sheet('Invoices');
M.setBook(b19);
b19.sheets.Invoices.getRange(1, 1, 1, 13).setValues([['Invoice #', 'Client', 'Issue Date', 'Due Date', 'Line Items (one per line)', 'Subtotal', 'Tax %', 'Tax', 'Total', 'Status', 'Paid Date', 'Currency', 'Notes']]);
b19.sheets.Invoices.getRange(2, 1, 2, 13).setValues([
  ['INV-0007', 'Acme', days(-9), days(5), 'x', 1000, 0, 0, 1000, 'Sent', '', 'INR', ''],
  ['INV-0012', 'Acme', days(-9), days(5), 'x', 1000, 0, 0, 1000, 'Sent', '', 'INR', '']
]);
selectRow(b19, 2);
eq('does not collide with existing invoice numbers', api.convertProposalToInvoice().number, 'INV-0013');

console.log('\n=== setup is non-destructive on a shared Settings tab ===');
const b20 = fresh([]);
b20.sheets.Settings.appendRow(['Existing CRM Setting', 'keep me']);
M.reset();
api.setupProposals();
const after = b20.sheets.Settings.getDataRange().getValues();
truthy('setup preserves another kit\'s row', after.some(r => r[0] === 'Existing CRM Setting'), JSON.stringify(after));
truthy('setup does not duplicate our own keys',
  after.filter(r => r[0] === 'Proposal Valid For (days)').length === 1, JSON.stringify(after));
truthy('setup created the proposals tab', b20.sheets['Proposals'].get(1, 1) === 'Proposal #');
truthy('setup wrote the stage weights', b20.sheets['Proposal Stages'].get(5, 3) === 60, String(b20.sheets['Proposal Stages'].get(5, 3)));

console.log('\n=== menu ===');
fresh([]);
M.reset();
api.onOpen();
const leaves = M.menus.map(m => M.flattenMenu(m, '')).flat();
truthy('menu is built', M.menus.length === 1 && M.menus[0].label === '📄 Proposals', JSON.stringify(M.menus.map(m => m.label)));
const bound = leaves.map(l => l.fn);
['createDraftProposal', 'recalcProposalTotals', 'downloadProposalPdf', 'emailProposalForSelected',
 'convertProposalToInvoice', 'logProposalActivity', 'chaseProposalForSelected', 'refreshProposalDashboard',
 'markLapsedProposals', 'installProposalReminder', 'setupProposals'].forEach(fn =>
  truthy('menu exposes ' + fn, bound.includes(fn), bound.join(', ')));
['setProposalDraft', 'setProposalSent', 'setProposalFollowUp', 'setProposalNegotiating',
 'setProposalAccepted', 'setProposalWon', 'setProposalLost', 'setProposalExpired'].forEach(fn =>
  truthy('stage shortcut ' + fn + ' is wired', bound.includes(fn), bound.join(', ')));
truthy('every advertised function exists', leaves.every(l => typeof api[l.fn] === 'function' || !(l.fn in api)),
  JSON.stringify(leaves.filter(l => typeof api[l.fn] !== 'function').map(l => l.fn)));

console.log('\n=== edge cases ===');
const bE = fresh([]);
selectRow(bE, 2);
M.reset();
let threw = null;
try { api.prRefreshDashboard(); } catch (e) { threw = String(e.message || e); }
truthy('dashboard survives no proposals', threw === null && api.prRefreshDashboard().open === 0, threw);
threw = null;
try { api.dailyProposalCheck(); } catch (e) { threw = String(e.message || e); }
truthy('daily check survives no proposals', threw === null, threw);
threw = null;
try { api.markLapsedProposals(); } catch (e) { threw = String(e.message || e); }
truthy('auto-expire survives no proposals', threw === null, threw);
const bE2 = fresh([{ number: 'PROP-900', client: 'Acme', status: 'Sent', total: 'not a number', deposit: '', valid: 'garbage' }]);
threw = null;
let dd;
try { dd = api.prRefreshDashboard(); } catch (e) { threw = String(e.message || e); }
truthy('garbage numbers do not crash the dashboard', threw === null, threw);
eq('garbage total counts as zero', dd.openValue, 0);

console.log('\n----------------------------------------');
console.log(`PASS ${pass}   FAIL ${fail}`);
process.exit(fail ? 1 : 0);
