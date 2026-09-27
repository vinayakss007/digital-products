// Feed the shipped proposals_sample.csv through the real script and check the
// dashboard, the expiry email and the PDF, so the listing demos match output.
const M = require('./mock.js'); const { Sheet, Book } = M; const fs = require('fs');
// The shipped sample is dated against this day, so pin the clock: the demo
// figures on the sales page and these assertions can never drift apart.
M.freezeClock('2026-09-27');
const api = M.load('../proposals-kit/proposal_script.gs',
  ['PR', 'PR_HEADERS', 'prRows_', 'prRecalc_', 'prRefreshDashboard', 'prProposalHtml_',
   'dailyProposalCheck', 'markLapsedProposals', 'convertProposalToInvoice',
   'createDraftProposal', 'prNextNumber_', 'setupProposals', 'emailProposalForSelected',
   'prExpirySummary_']);
const P = api.PR;

function parseCSV(t) {
  const rows = []; let f = [], c = '', q = false;
  for (let i = 0; i < t.length; i++) { const ch = t[i];
    if (q) { if (ch === '"') { if (t[i + 1] === '"') { c += '"'; i++; } else q = false; } else c += ch; }
    else if (ch === '"') q = true; else if (ch === ',') { f.push(c); c = ''; }
    else if (ch === '\n') { f.push(c); rows.push(f); f = []; c = ''; }
    else if (ch === '\r') {} else c += ch; }
  if (c !== '' || f.length) { f.push(c); rows.push(f); }
  return rows.filter(r => r.length > 1);
}

const b = new Book({
  'Proposals': new Sheet('Proposals'), 'Clients': new Sheet('Clients'),
  'Proposal Stages': new Sheet('Proposal Stages'),
  'Proposal Activities': new Sheet('Proposal Activities'),
  'Proposal Dashboard': new Sheet('Proposal Dashboard'),
  'Settings': new Sheet('Settings')
});
const cl = parseCSV(fs.readFileSync('../proposals-kit/clients_sample.csv', 'utf8'));
cl.forEach((r, i) => b.sheets.Clients.getRange(i + 1, 1, 1, r.length).setValues([r]));
const pr = parseCSV(fs.readFileSync('../proposals-kit/proposals_sample.csv', 'utf8'));
pr.forEach((r, i) => {
  const conv = r.map((v, j) => (j === 2 || j === 3) && /^\d{4}-\d{2}-\d{2}$/.test(v)
    ? new Date(v + 'T00:00:00')
    : (j >= 5 && j <= 10) && v !== '' && !isNaN(v) ? Number(v) : v);
  b.sheets['Proposals'].getRange(i + 1, 1, 1, conv.length).setValues([conv]);
});
b.sheets.Settings.getRange('A1:B1').setValues([['Setting', 'Value']]);
const SET = [['Your Business Name', 'Kite Studio'], ['Your Address', '49 Baner Road, Pune 411045'],
  ['Your Email', 'hello@kitestudio.work'], ['Your Phone', '+91-9876500011'],
  ['GSTIN / Tax ID', '27AAECK1234F1Z9'], ['Default Currency', 'INR'],
  ['Default Tax Rate (%)', '18'], ['Payment Terms (days)', '14'],
  ['Proposal Valid For (days)', '14'], ['Default Deposit (%)', '40'],
  ['Proposal Number Prefix', 'PROP-']];
SET.forEach((r, i) => b.sheets.Settings.getRange(i + 2, 1, 1, 2).setValues([r]));
b.sheets['Proposal Stages'].getRange(1, 1, 1, 4).setValues([['Stage', 'Order', 'Win Chance (%)', 'Notes']]);
[['Draft',1,0,''],['Sent',2,15,''],['Follow-up',3,35,''],['Negotiating',4,60,''],
 ['Accepted',5,90,''],['Won',6,100,''],['Lost',7,0,''],['Expired',8,5,'']]
  .forEach((r, i) => b.sheets['Proposal Stages'].getRange(i + 2, 1, 1, 4).setValues([r]));
M.setBook(b);

let pass = 0, fail = 0;
const eq = (n, g, w) => { const a = JSON.stringify(g), x = JSON.stringify(w);
  if (a === x) { pass++; console.log('  ok   ' + n); }
  else { fail++; console.log('  FAIL ' + n + '\n        got  ' + a + '\n        want ' + x); } };
const truthy = (n, v, d) => { if (v) { pass++; console.log('  ok   ' + n); }
  else { fail++; console.log('  FAIL ' + n + (d ? '\n        ' + String(d).slice(0, 300) : '')); } };

console.log('=== shipped sample loads and the math reconciles ===');
const rows = api.prRows_();
eq('9 sample proposals parsed', rows.length, 9);
rows.forEach(o => {
  const t = api.prRecalc_(o.row);
  eq('  subtotal matches CSV ' + o.v[0], t.subtotal, Number(o.v[5]));
  eq('  tax matches CSV ' + o.v[0], t.tax, Number(o.v[7]));
  eq('  total matches CSV ' + o.v[0], t.total, Number(o.v[8]));
  eq('  deposit matches CSV ' + o.v[0], t.deposit, Number(o.v[10]));
});
truthy('every line item is qty x rate consistent', rows.every(o => {
  const t = api.prRecalc_(o.row);
  return t.items.reduce((s, i) => s + i.amount, 0) === t.subtotal && t.items.length >= 1;
}));

console.log('=== dashboard from shipped data ===');
const d = api.prRefreshDashboard();
const D = b.sheets['Proposal Dashboard'];
const g = {};
for (let r = 1; r <= D.getLastRow(); r++) { const k = String(D.get(r, 1)); if (k) g[k] = [D.get(r, 2), D.get(r, 3), D.get(r, 4)]; }
// Still in play = anything not Won/Lost/Expired: 001 002 003 004 007 008.
const openTotal = 223020 + 167088 + 330400 + 401200 + 68440 + 245440;
eq('open proposals', d.open, 6);
eq('open value', d.openValue, openTotal);
// Per-stage chance: sent 15%, negotiating 60%, accepted 90%, draft 0%.
eq('weighted pipeline', d.weighted,
  Math.round(223020 * 0.15 + 167088 * 0.60 + 330400 * 0.15 + 401200 * 0.90 + 68440 * 0.15 + 245440 * 0));
eq('won value counts accepted + won', g['Won Value'][0], 401200 + 129800);
// decided = accepted(1) + won(1) + lost(1) = 3, of which 2 came through.
eq('win rate 2 of 3 decided', g['Win Rate'][0] * 100, 66.7);
truthy('win-rate row states its formula', /accepted\+won/.test(String(g['Win Rate'][1])), JSON.stringify(g['Win Rate']));

console.log('=== expiry email from shipped data ===');
M.reset();
const summary = api.prExpirySummary_();
const res = api.dailyProposalCheck();
eq('two proposals expire within 3 days', summary.expiring.map(e => e.number), ['PROP-003', 'PROP-001']);
eq('one zombie has lapsed while still marked Sent', summary.lapsed.map(e => e.number), ['PROP-007']);
eq('lapsed value totalled', summary.lapsedValue, 68440);
eq('email count matches summary', res.count, summary.expiring.length + summary.lapsed.length);
truthy('subject states both counts',
  M.mailCalls[0].subject === 'Proposals: ' + summary.expiring.length + ' expiring, ' + summary.lapsed.length + ' lapsed',
  M.mailCalls[0].subject);
truthy('lapsed value appears as ₹ with lakh grouping', /₹[0-9,]+\.00/.test(M.mailCalls[0].body));
truthy('won and lost rows are never nagged about', !/PROP-005|PROP-006/.test(M.mailCalls[0].body));
truthy('already-Expired row is silent, not chased again', !/PROP-009/.test(M.mailCalls[0].body),
  M.mailCalls[0].body);
truthy('the lapsed-but-open zombie is reported', /PROP-007.*lapsed 56d ago/.test(M.mailCalls[0].body),
  M.mailCalls[0].body.match(/PROP-007.*/));

console.log('=== PDF for a shipped row ===');
const built = api.prProposalHtml_(2); // PROP-001
truthy('number and client on page', /PROP-001/.test(built.html) && /Northwind Logistics/.test(built.html));
truthy('total lakh-grouped', /₹2,23,020\.00/.test(built.html), built.html.match(/grand[\s\S]{0,90}/));
truthy('deposit shown', /Deposit required: ₹89,208\.00/.test(built.html));
truthy('GSTIN printed for the client', /09AABCU1234F1Z5/.test(built.html));
truthy('validity date printed', /Valid until 29 Sep 2026/.test(built.html), built.html.match(/Valid until[^<]*/));
const scopeTable = built.html.split('Scope of work</th>')[1].split('</table>')[0];
eq('multi-line scope renders both items', (scopeTable.match(/<tr>/g) || []).length, 2);
truthy('rates and amounts rendered per line', /₹1,65,000\.00/.test(scopeTable) && /₹24,000\.00/.test(scopeTable),
  scopeTable.slice(0, 400));
truthy('no raw ampersand markup leaks', !/&(?!(amp|lt|gt|quot|#)\w*;)/.test(built.html.replace(/&#\d+;/g, '')),
  (built.html.match(/&[^a]{0,12}/g) || []).slice(0, 6).join(' | '));

console.log('=== next number continues past the samples ===');
eq('next proposal number', api.prNextNumber_(), 'PROP-010');
M.reset();
api.createDraftProposal();
eq('draft appended after samples', b.sheets['Proposals'].get(11, 1), 'PROP-010');
truthy('new draft starts at zero totals', b.sheets['Proposals'].get(11, 6) === 0 && b.sheets['Proposals'].get(11, 9) === 0,
  JSON.stringify([b.sheets['Proposals'].get(11, 6), b.sheets['Proposals'].get(11, 9)]));

console.log('=== convert the accepted sample to an invoice ===');
b.sheets['Proposals']._activeRow = 5; // PROP-004 Meridian, Accepted
M.reset();
const made = api.convertProposalToInvoice();
eq('creates the Invoices tab with headers', b.sheets.Invoices.get(1, 1), 'Invoice #');
eq('bills the deposit', made.amount, 160480);
truthy('amount is lakh-grouped in the note', /₹1,60,480/.test(String(b.sheets['Proposal Activities'].get(2, 4))),
  String(b.sheets['Proposal Activities'].get(2, 4)));

console.log('\n-----------------------------');
console.log(`PASS ${pass}  FAIL ${fail}`);
process.exit(fail ? 1 : 0);
