// Feed the shipped retainers_sample.csv and hours_sample.csv through the real
// script, so the numbers on the sales page are numbers the product produces.
// The samples are dated against a fixed day; the clock is pinned to match.
const M = require('./mock.js'); const { Sheet, Book } = M; const fs = require('fs');
const path = require('path');
M.freezeClock('2026-09-27');

const SRC = path.resolve(__dirname, '../retainer-kit/retainer_script.gs');
const api = M.load(SRC, [
  'RR', 'RR_HEADERS', 'RR_HOURS_HEADERS', 'rrRows_', 'rrHourRows_', 'rrShape_',
  'rrRefreshDashboard', 'runMonthlyBilling', 'dailyRetainerCheck', 'reconcileHours',
  'markExpiredRetainers', 'renewSelectedRetainer', 'setupRetainers', 'rrNextNumber_',
  'createRetainer', 'recalcRetainerTotals', 'addHoursRowForSelected'
]);
const R = api.RR;
const DIR = path.resolve(__dirname, '../retainer-kit');

function parseCSV(t) {
  const rows = []; let f = [], c = '', q = false;
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (q) { if (ch === '"') { if (t[i + 1] === '"') { c += '"'; i++; } else q = false; } else c += ch; }
    else if (ch === '"') q = true;
    else if (ch === ',') { f.push(c); c = ''; }
    else if (ch === '\n') { f.push(c); rows.push(f); f = []; c = ''; }
    else if (ch === '\r') { /* ignore */ } else c += ch;
  }
  if (c !== '' || f.length) { f.push(c); rows.push(f); }
  return rows.filter(r => r.length > 1);
}

const b = new Book({
  Retainers: new Sheet('Retainers'), 'Retainer Hours': new Sheet('Retainer Hours'),
  Clients: new Sheet('Clients'), 'Retainer Activities': new Sheet('Retainer Activities'),
  'Retainer Dashboard': new Sheet('Retainer Dashboard'), Settings: new Sheet('Settings')
});

const ret = parseCSV(fs.readFileSync(DIR + '/retainers_sample.csv', 'utf8'));
ret.forEach((r, i) => {
  const conv = r.map((v, j) => (j === 2 || j === 3) && /^\d{4}-\d{2}-\d{2}$/.test(v)
    ? new Date(v + 'T00:00:00')
    : (j >= 4 && j <= 9) && v !== '' && !isNaN(v) ? Number(v) : v);
  b.sheets.Retainers.getRange(i + 1, 1, 1, conv.length).setValues([conv]);
});
const hrs = parseCSV(fs.readFileSync(DIR + '/hours_sample.csv', 'utf8'));
hrs.forEach((r, i) => {
  const conv = i === 0 ? r : r.map((v, j) => j === 0 ? new Date(v + 'T00:00:00') : j === 3 ? Number(v) : v);
  b.sheets['Retainer Hours'].getRange(i + 1, 1, 1, conv.length).setValues([conv]);
});
parseCSV(fs.readFileSync(DIR + '/clients_sample.csv', 'utf8')).forEach((r, i) => {
  b.sheets.Clients.getRange(i + 1, 1, 1, r.length).setValues([r]);
});
b.sheets.Settings.getRange('A1:B1').setValues([['Setting', 'Value']]);
[['Your Business Name', 'Kite Studio'], ['Your Email', 'hello@kitestudio.work'],
 ['Default Currency', 'INR'], ['Default Tax Rate (%)', '18'], ['Payment Terms (days)', '7'],
 ['Silence Alert (days)', '21'], ['Renewal Length (months)', '3'],
 ['Default Included Hours', '20'], ['Default Overage Rate / hr', '4000'],
 ['Default Billing Day', '1'], ['Retainer Number Prefix', 'RET-']]
  .forEach((r, i) => b.sheets.Settings.getRange(i + 2, 1, 1, 2).setValues([r]));
M.setBook(b);

let pass = 0, fail = 0;
const eq = (n, g, w) => { const a = JSON.stringify(g), x = JSON.stringify(w);
  if (a === x) { pass++; console.log('  ok   ' + n); }
  else { fail++; console.log('  FAIL ' + n + '\n        got  ' + a + '\n        want ' + x); } };
const truthy = (n, v, d) => { if (v) { pass++; console.log('  ok   ' + n); }
  else { fail++; console.log('  FAIL ' + n + (d ? '\n        ' + String(d).slice(0, 320) : '')); } };

console.log('=== the shipped sample loads cleanly ===');
const rows = api.rrRows_();
eq('9 sample retainers parsed', rows.length, 9);
eq('all 22 hours entries parsed', api.rrHourRows_().length, 22);
eq('every retainer row has the shipped column count',
  rows.filter(o => o.v.length !== api.RR_HEADERS.length).map(o => o.v[0]), []);
eq('header row matches the script', String(b.sheets.Retainers.get(1, 1)), 'Retainer #');
eq('hours header matches the script', String(b.sheets['Retainer Hours'].get(1, 1)), api.RR_HOURS_HEADERS[0]);
const parsed = rows.map(o => api.rrShape_(o.v));
truthy('no NaN anywhere in the parsed rows',
  !JSON.stringify(parsed, (k, v) => v instanceof Date ? 'd' : v).includes('null,null'), 'dates parsed');
parsed.forEach(r => {
  eq('  ' + r.number + ' totals reconcile', r.subtotal + r.tax, r.total);
  truthy('  ' + r.number + ' has a fee', r.fee > 0, String(r.fee));
});

console.log('=== each sample row demonstrates the rule it claims to ===');
const by = {};
parsed.forEach(r => { by[r.number] = r; });
eq('RET-001 logs 22h against 20h included', [by['RET-001'].logged, by['RET-001'].overageHours], [22, 2]);
eq('RET-001 overage priced at the row rate', by['RET-001'].overageValue, 9000);
eq('RET-001 monthly total incl. tax', by['RET-001'].total, 110920);
truthy('RET-001 is due', by['RET-001'].due, by['RET-001'].reason);
eq('RET-002 bills on the 28th, so it waits', [by['RET-002'].due, by['RET-002'].reason, by['RET-002'].waitingDays],
  [false, 'not due until day 28', 1]);
eq('RET-002 logged exactly its included hours', [by['RET-002'].logged, by['RET-002'].overageHours], [12, 0]);
eq('RET-003 uses 22 of 40 hours — thin cover', [by['RET-003'].logged, by['RET-003'].utilisation], [22, 55]);
eq('RET-004 has logged nothing since 24 Aug', by['RET-004'].logged, 0);
eq('RET-005 is paused, so it never bills', [by['RET-005'].due, by['RET-005'].reason], [false, 'paused, not billable']);
eq('RET-006 was already billed this month', [by['RET-006'].due, by['RET-006'].reason], [false, 'already billed for 2026-09']);
eq('RET-007 runs to 15 Oct and is due now', [by['RET-007'].due, by['RET-007'].overageHours], [true, 2]);
eq('RET-008 ended in August despite saying Active',
  [by['RET-008'].active, by['RET-008'].ended, by['RET-008'].inForce, by['RET-008'].reason],
  [true, true, false, 'ended 2026-08']);
eq('RET-009 starts in October', [by['RET-009'].due, by['RET-009'].reason], [false, 'starts 2026-10, not this month']);

console.log('=== the hours typo is caught, not silently dropped ===');
M.reset();
const rec = api.reconcileHours();
eq('21 of 22 entries reconcile', rec.ok, 21);
eq('the RET-012 typo is named with its row', rec.unknownNumber,
  ['row 15: RET-012 is not on the Retainers tab']);
eq('no other category is triggered by the sample',
  [rec.badDates.length, rec.badHours.length, rec.unknownClient.length], [0, 0, 0]);
truthy('the alert tells the buyer one row needs a fix',
  /1 row\(s\) need a fix/.test(String(M.uiCalls[M.uiCalls.length - 1][1])),
  String(M.uiCalls[M.uiCalls.length - 1][1]));
// The typo'd 5h must not be billed to Delta under either of their retainers.
eq('typo hours are excluded from RET-003', by['RET-003'].logged, 22);
eq('typo hours are excluded from RET-007', by['RET-007'].logged, 18);

console.log('=== dashboard figures, as the listing shows them ===');
const d = api.rrRefreshDashboard();
eq('6 retainers are actually in force', d.inForce, 6);
eq('8 are marked Active, and the report says so', d.markedActive, 8);
eq('MRR counts in-force fees only', d.mrr, 420000);
eq('naive sum of rows marked Active', parsed.filter(r => r.active).reduce((s2, r) => s2 + r.fee, 0), 500000);
eq('the gap is exactly the ended row plus the not-yet-started row', 500000 - d.mrr, 25000 + 55000);
eq('4 due and unbilled', d.unbilled.map(u => u.number), ['RET-001', 'RET-003', 'RET-004', 'RET-007']);
eq('unbilled value incl. tax', d.unbilledValue, 379960);
eq('overage billable this month', [d.overageHours, d.overageValue], [4, 17000]);
eq('average utilisation across live cover', d.avgUtilisation, 70.4);
eq('one retainer ending within 30 days', d.endingSoon.map(x => x.number), ['RET-007']);
eq('RET-007 ends in 18 days', d.endingSoon[0].days, 18);
eq('one genuinely quiet client', d.quiet.map(x => x.number), ['RET-004']);
eq('quiet measured from the last entry', d.quiet[0].days, 34);
eq('ended-but-still-Active surfaced separately', d.endedButActive.map(x => x.number), ['RET-008']);
eq('revenue at risk counts a client once', d.revenueAtRisk, 100000);

const sheet = b.sheets['Retainer Dashboard'];
const grid = sheet.getDataRange().getValues();
const dump = grid.map(r => String(r[0]));
eq('title', String(grid[0][0]), 'Retainer Dashboard');
eq('period noted beside the updated stamp', /period 2026-09/.test(String(grid[1][2])), true);
const label = row => String(grid[row - 1][0]);
const value = row => grid[row - 1][1];
eq('headline row 1 label', label(4), 'Retainers In Force');
eq('headline row 1 value', value(4), 6);
eq('MRR headline row', label(5), 'Monthly Recurring');
eq('MRR value is the number, not a string', value(5), 420000);
eq('billed this period counts the pre-stamped RET-006', label(6) + ' ' + value(6), 'Billed This Period 1');
eq('unbilled', label(7) + ' ' + value(7), 'Unbilled & Due Now 379960');
eq('overage', label(8) + ' ' + value(8), 'Overage Billable 17000');
eq('utilisation label', label(9), 'Average Utilisation');
eq('utilisation stored as a fraction for the % format', Math.round(value(9) * 1000) / 1000, 0.704);
eq('revenue at risk', label(10), 'Revenue At Risk');
eq('risk value', value(10), 100000);
const pct = M.formats.filter(f => f.format === '0%').map(f => f.where);
truthy('the percent lands on the utilisation row', pct.includes('Retainer Dashboard!9:2'), pct.join(' '));
truthy('and not on a money row',
  !['4:2', '5:2', '6:2', '7:2', '8:2', '10:2'].some(c => pct.includes('Retainer Dashboard!' + c)), pct.join(' '));
truthy('utilisation column in the table is percent-formatted too',
  pct.filter(w => /:6$/.test(w)).length >= 6, pct.join(' '));
truthy('money rows use a thousands format',
  M.formats.some(f => f.where === 'Retainer Dashboard!5:2' && f.format === '#,##0'),
  JSON.stringify(M.formats.filter(f => /!5:2$/.test(f.where))));

const blockOf = heading => {
  const at = dump.findIndex(x => new RegExp(heading).test(x));
  const out = [];
  for (let i = at + 1; i < grid.length && String(grid[i][0]).trim() !== ''; i++) out.push(grid[i]);
  return out;
};
truthy('utilisation table lists the six live retainers',
  blockOf('^Client$').length === 6, JSON.stringify(blockOf('^Client$').map(r => r[1])));
eq('utilisation table sorted by fee, biggest first',
  blockOf('^Client$').map(r => r[2]), [120000, 85000, 70000, 60000, 45000, 40000]);
truthy('the ended retainer is not in the utilisation table',
  !blockOf('^Client$').some(r => String(r[1]) === 'RET-008'), JSON.stringify(blockOf('^Client$').map(r => r[1])));
truthy('the paused retainer is not in the utilisation table',
  !blockOf('^Client$').some(r => String(r[1]) === 'RET-005'));
eq('due & unbilled section lists all four', blockOf('^Due & Unbilled$').map(r => r[0]),
  ['RET-001', 'RET-003', 'RET-004', 'RET-007']);
truthy('each unbilled row says what to do',
  blockOf('^Due & Unbilled$').every(r => /Bill Due Retainers/.test(String(r[3]))));
truthy('unbilled amounts are rupee-formatted',
  /₹1,10,920\.00/.test(String(blockOf('^Due & Unbilled$')[0][2])), String(blockOf('^Due & Unbilled$')[0][2]));
eq('not-due-yet lists RET-002 with its day',
  blockOf('^Not Due Yet This Month$').map(r => r[0] + ' ' + r[2]), ['RET-002 due on day 28']);
eq('ending-soon section', blockOf('^Ending Within 30 Days$').map(r => r[0] + ' ' + r[2]), ['RET-007 ends in 18d']);
eq('quiet section holds only the live client',
  blockOf('^No Hours Logged Recently$').map(r => r[0] + ' ' + r[2]), ['RET-004 34d ago']);
eq('stale-status section names the fix',
  blockOf('^Past End Date But Still Active$').map(r => r[0] + ' ' + r[3]), ['RET-008 ₹25,000.00']);
truthy('the quiet section does not include the ended retainer',
  !blockOf('^No Hours Logged Recently$').some(r => /RET-008/.test(String(r[0]))));

console.log('=== the daily email before billing ===');
M.reset();
const pre = api.dailyRetainerCheck();
eq('four unbilled in the subject', M.mailCalls[0].subject, 'Retainers: 4 unbilled, 2 at risk');
eq('due count', pre.due, 4);
eq('one coming due within 3 days', pre.comingSoon, 1);
eq('one ending, one quiet', [pre.endings, pre.silence], [1, 1]);
eq('sent to the Settings address', M.mailCalls[0].to, 'hello@kitestudio.work');
const mail = M.mailCalls[0].body;
truthy('due block lists all four',
  ['RET-001', 'RET-003', 'RET-004', 'RET-007'].every(n => new RegExp(n + ' ·').test(mail)), mail.slice(0, 400));
truthy('overage called out on RET-001', /RET-001 · Northwind Logistics · ₹1,10,920\.00 \(incl\. 2h overage\)/.test(mail), mail);
truthy('RET-003 priced with no overage suffix', /RET-003 · Delta Structures · ₹1,41,600\.00\n/.test(mail),
  (mail.match(/RET-003[^\n]*/) || [''])[0]);
truthy('coming-due block names the day', /RET-002 · Saffron Coffee Roasters · ₹53,100\.00 · due on day 28/.test(mail), mail);
truthy('renewal block gives the countdown', /RET-007 · Delta Structures · ends in 18d · ₹40,000\.00\/mo/.test(mail), mail);
truthy('silence block gives the days since', /RET-004 · Meridian Clinic · 34d since the last entry · ₹60,000\.00\/mo/.test(mail), mail);
truthy('paused and ended retainers are nowhere in the email',
  !/RET-005|RET-008|RET-009|RET-006/.test(mail), (mail.match(/RET-\d+/g) || []).join(','));
truthy('email closes by saying what it will not do', /Drafts you approve/.test(mail), mail.slice(-200));

console.log('=== the billing run on the shipped sample ===');
M.reset();
const run = api.runMonthlyBilling();
eq('4 invoices created', run.created.map(c => c.invoice), ['INV-0001', 'INV-0002', 'INV-0003', 'INV-0004']);
eq('total billed incl. tax', run.billed, 379960);
eq('each invoice maps to its retainer', run.created.map(c => c.number),
  ['RET-001', 'RET-003', 'RET-004', 'RET-007']);
eq('and to its total', run.created.map(c => c.total), [110920, 141600, 70800, 56640]);
eq('5 skipped, each with a reason', run.skipped.map(s => s.number + ': ' + s.reason), [
  'RET-002: not due until day 28', 'RET-005: paused, not billable',
  'RET-006: already billed for 2026-09', 'RET-008: ended 2026-08',
  'RET-009: starts 2026-10, not this month']);
const inv = b.sheets.Invoices;
eq('Invoices tab created by the run', String(inv.get(1, 1)), 'Invoice #');
eq('13 columns, matching the Invoice Kit', inv.getLastColumn(), 13);
const invRows = inv.getDataRange().getValues().slice(1);
eq('4 invoice rows written', invRows.length, 4);
eq('client names carried through', invRows.map(r => r[1]),
  ['Northwind Logistics', 'Delta Structures', 'Meridian Clinic', 'Delta Structures']);
truthy('all drafts, none sent', invRows.every(r => String(r[9]) === 'Draft'));
truthy('currency stamped', invRows.every(r => String(r[11]) === 'INR'));
invRows.forEach(r => {
  eq('  ' + r[0] + ' subtotal + tax = total', Number(r[5]) + Number(r[7]), Number(r[8]));
  const lineSum = String(r[4]).split('\n').reduce((t, l) => {
    const p = l.split('|'); return t + (Number(p[1]) || 0) * (Number(p[2]) || 0);
  }, 0);
  eq('  ' + r[0] + ' line items add up to the subtotal', lineSum, Number(r[5]));
  truthy('  ' + r[0] + ' due date is 7 days out per Settings',
    new Date(r[3]).toISOString().slice(0, 10) === '2026-10-04', String(r[3]));
});
truthy('RET-001 invoice shows the overage line',
  /Overage: 2h beyond 20h \| 2 \| 4500/.test(String(invRows[0][4])), String(invRows[0][4]));
truthy('and no overage line where there is none',
  !/Overage/.test(String(invRows[2][4])), String(invRows[2][4]));
eq('period stamped on every billed row — the double-bill guard',
  api.rrRows_().map(o => api.rrShape_(o.v)).filter(r => r.lastBilled === '2026-09').map(r => r.number),
  ['RET-001', 'RET-003', 'RET-004', 'RET-006', 'RET-007']);
truthy('billing logged per retainer',
  b.sheets['Retainer Activities'].getDataRange().getValues().slice(1).filter(r => String(r[2]) === 'Invoice').length === 4,
  JSON.stringify(b.sheets['Retainer Activities'].getDataRange().getValues().slice(1).map(r => r[2])));

console.log('=== running it again on the 28th still bills nothing twice ===');
M.reset();
const again = api.runMonthlyBilling();
eq('nothing created', again.created.length, 0);
eq('billed value zero', again.billed, 0);
eq('still 4 invoice rows on the tab', inv.getLastRow(), 5);
truthy('the alert explains every row',
  /already billed for 2026-09/.test(String(M.uiCalls[M.uiCalls.length - 1][2])),
  String(M.uiCalls[M.uiCalls.length - 1][2]).slice(0, 200));

console.log('=== RET-002 becomes billable on its own day ===');
M.freezeClock('2026-09-28');
M.reset();
const onThe28th = api.runMonthlyBilling();
eq('only the 28th retainer bills', onThe28th.created.map(c => c.number), ['RET-002']);
eq('exactly its included hours, no overage', onThe28th.created[0].overageHours, 0);
eq('₹45,000 + 18% = ₹53,100', onThe28th.created[0].total, 53100);
M.freezeClock('2026-09-27');

console.log('=== renewal path ===');
M.freezeClock('2026-10-10');
M.reset();
b.sheets.Retainers._activeRow = 8; // RET-007 ends 15 Oct
const until = api.renewSelectedRetainer();
eq('renewed three months past its 15 Oct end date',
  [until.getFullYear(), until.getMonth() + 1, until.getDate()], [2027, 1, 15]);
eq('and the row holds the new date', b.sheets.Retainers.get(8, R.col.end + 1).getDate(), 15);
truthy('renewal written to the activity log',
  b.sheets['Retainer Activities'].getDataRange().getValues().some(r =>
    String(r[1]) === 'RET-007' && String(r[2]) === 'Renewal'),
  JSON.stringify(b.sheets['Retainer Activities'].getDataRange().getValues().slice(-2)));
M.freezeClock('2026-09-27');
const dr2 = api.rrRefreshDashboard();
truthy('dashboard no longer flags the renewed cover as ending',
  dr2.endingSoon.every(x => x.number !== 'RET-007'), JSON.stringify(dr2.endingSoon));
eq('MRR unaffected by the renewal', dr2.mrr, 420000);

console.log('=== auto-expire cleans the stale row the sample is famous for ===');
M.reset();
const flipped = api.markExpiredRetainers();
eq('RET-008 flips to Expired', flipped, 1);
eq('status written', String(b.sheets.Retainers.get(9, R.col.status + 1)), 'Expired');
const after = api.rrRefreshDashboard();
eq('nothing left in the stale-status list', after.endedButActive.length, 0);
eq('MRR unchanged — it never counted the ended row', after.mrr, 420000);
eq('in-force count unchanged', after.inForce, 6);
truthy('change logged', /Active → Expired/.test(String(b.sheets['Retainer Activities']
  .getDataRange().getValues().slice(-1)[0][3])), String(b.sheets['Retainer Activities']
  .getDataRange().getValues().slice(-1)[0][3]));

console.log('=== numbering continues past the sample ===');
eq('next retainer number', api.rrNextNumber_(), 'RET-010');
M.reset();
b.sheets.Retainers._activeRow = 0;
api.createRetainer();
eq('draft appended on the next row', String(b.sheets.Retainers.get(11, 1)), 'RET-010');
eq('with Settings defaults filled in', b.sheets.Retainers.get(11, R.col.includedHours + 1), 20);
eq('and no period stamped yet', String(b.sheets.Retainers.get(11, R.col.lastBilled + 1)), '');

console.log('=== one-row recalc tells the truth about RET-008 ===');
b.sheets.Retainers._activeRow = 9;
M.reset();
const stale = api.recalcRetainerTotals();
eq('still not billable after being marked Expired', stale.due, false);
truthy('alert names the reason', /Not billing: expired, not billable/.test(String(M.uiCalls[M.uiCalls.length - 1][2])),
  String(M.uiCalls[M.uiCalls.length - 1][2]));
b.sheets.Retainers._activeRow = 2;
const first = api.recalcRetainerTotals();
eq('RET-001 total', first.total, 110920);
truthy('alert prints logged vs included', /Logged this period 22h · overage 2h/.test(String(M.uiCalls[M.uiCalls.length - 1][2])),
  String(M.uiCalls[M.uiCalls.length - 1][2]));
truthy('after the billing run it says already billed instead of due',
  /already billed for 2026-09/.test(String(M.uiCalls[M.uiCalls.length - 1][2])),
  String(M.uiCalls[M.uiCalls.length - 1][2]));
b.sheets.Retainers.getRange(2, R.col.lastBilled + 1).setValue('');
const dueAgain = api.recalcRetainerTotals();
truthy('clear the stamp and it is due again', /Due to bill now/.test(String(M.uiCalls[M.uiCalls.length - 1][2])) && dueAgain.due,
  String(M.uiCalls[M.uiCalls.length - 1][2]));

console.log('\n-----------------------------');
console.log(`PASS ${pass}  FAIL ${fail}`);
process.exit(fail ? 1 : 0);
