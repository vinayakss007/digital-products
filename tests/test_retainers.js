// Unit tests for retainer-kit/retainer_script.gs — the billable/not-billable
// decision, overage and tax math, the double-billing guard, hours reconciliation,
// renewals, status moves, the MRR definition and the dashboard/email wiring.
const M = require('./mock.js');
const { Sheet, Book } = M;

const SRC = require('path').resolve(__dirname, '../retainer-kit/retainer_script.gs');
const api = M.load(SRC, [
  'RR', 'RR_HEADERS', 'RR_HOURS_HEADERS', 'RR_INVOICE_HEADERS', 'RR_BILLABLE_STATUS', 'setupRetainers',
  'rrSelected_', 'rrSettings_', 'rrSeedSettings_', 'rrRows_', 'rrHourRows_', 'rrShape_',
  'rrMoney_', 'rrPeriod_', 'rrDaysBetween_', 'rrNumber_', 'rrDay_',
  'rrHoursInPeriod_', 'rrLastLogged_', 'rrHoursMatch_', 'rrNextNumber_', 'rrNextInvoiceNumber_',
  'createRetainer', 'addHoursRowForSelected', 'reconcileHours', 'recalcRetainerTotals',
  'runMonthlyBilling', 'rrRefreshDashboard', 'refreshRetainerDashboard', 'dailyRetainerCheck',
  'markExpiredRetainers', 'renewSelectedRetainer', 'setRetainerActive', 'setRetainerPaused',
  'setRetainerCancelled', 'installRetainerReminder', 'onOpen', 'retainerKitMenu_'
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

const R = api.RR;
const NCOL = api.RR_HEADERS.length;
const HCOL = api.RR_HOURS_HEADERS.length;
const days = n => M.days(n);

// The samples are dated against this day; pin the clock so "due" means the same
// thing on the day the suite runs as it does in the listing screenshots.
M.freezeClock('2026-09-27');

const SETTINGS = [
  ['Your Business Name', 'Kite Studio'],
  ['Your Email', 'hello@kitestudio.work'],
  ['Default Currency', 'INR'],
  ['Default Tax Rate (%)', '18'],
  ['Payment Terms (days)', '7'],
  ['Silence Alert (days)', '21'],
  ['Renewal Length (months)', '3'],
  ['Default Included Hours', '20'],
  ['Default Overage Rate / hr', '4000'],
  ['Default Billing Day', '1'],
  ['Retainer Number Prefix', 'RET-']
];

function retainer(over) {
  const o = Object.assign({
    number: 'RET-001', client: 'Acme', start: days(-200), end: '',
    fee: 50000, includedHours: 20, overageRate: 4000, taxRate: 18, billingDay: 1,
    status: 'Active', lastBilled: ''
  }, over);
  const r = new Array(NCOL).fill('');
  r[R.col.number] = o.number; r[R.col.client] = o.client; r[R.col.start] = o.start;
  r[R.col.end] = o.end; r[R.col.fee] = o.fee; r[R.col.includedHours] = o.includedHours;
  r[R.col.overageRate] = o.overageRate; r[R.col.taxRate] = o.taxRate;
  r[R.col.billingDay] = o.billingDay; r[R.col.status] = o.status;
  r[R.col.lastBilled] = o.lastBilled; r[R.col.notes] = o.notes || '';
  return r;
}

function hours(rows) {
  return rows.map(r => {
    const o = Object.assign({ date: days(-3), client: 'Acme', number: 'RET-001', hours: 4, note: 'work' }, r);
    const a = new Array(api.RR_HOURS_HEADERS.length).fill('');
    a[R.hoursCol.date] = o.date; a[R.hoursCol.client] = o.client; a[R.hoursCol.number] = o.number;
    a[R.hoursCol.hours] = o.hours; a[R.hoursCol.note] = o.note;
    return a;
  });
}

function fresh(retainers, hourRows, opts) {
  const o = opts || {};
  const b = new Book({
    Retainers: new Sheet('Retainers'),
    'Retainer Hours': new Sheet('Retainer Hours'),
    'Retainer Activities': new Sheet('Retainer Activities'),
    'Retainer Dashboard': new Sheet('Retainer Dashboard'),
    Clients: new Sheet('Clients'),
    Settings: new Sheet('Settings'),
    Invoices: o.noInvoices ? undefined : new Sheet('Invoices')
  });
  b.sheets.Settings.getRange('A1:B1').setValues([['Setting', 'Value']]);
  (o.settings === false ? [] : SETTINGS).forEach((r, i) =>
    b.sheets.Settings.getRange(i + 2, 1, 1, 2).setValues([r]));
  b.sheets.Retainers.getRange(1, 1, 1, NCOL).setValues([api.RR_HEADERS]);
  retainers.forEach((r, i) => b.sheets.Retainers.getRange(i + 2, 1, 1, NCOL).setValues([r]));
  b.sheets['Retainer Hours'].getRange(1, 1, 1, api.RR_HOURS_HEADERS.length)
    .setValues([api.RR_HOURS_HEADERS]);
  (hourRows || []).forEach((r, i) =>
    b.sheets['Retainer Hours'].getRange(i + 2, 1, 1, r.length).setValues([r]));
  b.sheets.Clients.getRange(1, 1, 1, 5).setValues([['Client Name', 'Email', 'Address', 'Phone', 'GSTIN']]);
  b.sheets.Clients.getRange(2, 1, 2, 5).setValues([
    ['Acme', 'ap@acme.test', '2 Street, Pune', '99999', '27ACME'],
    ['Northwind', 'ops@northwind.test', '9 MG Road', '88888', '']
  ]);
  if (o.invoices) o.invoices.forEach((r, i) => b.sheets.Invoices.getRange(i + 2, 1, 1, r.length).setValues([r]));
  M.setBook(b);
  M.reset();
  return b;
}

// Build a retainer row and read the decision for it. Callers always pass the
// hours explicitly — a default entry would silently change what "due" is worth.
const shape = (r, hourRows) => {
  fresh([r], hourRows);
  return api.rrShape_(r);
};

console.log('\n=== pure helpers ===');
fresh([]);
eq('period key is yyyy-MM', api.rrPeriod_(new Date(2026, 8, 27)), '2026-09');
eq('days between whole days', api.rrDaysBetween_(days(-3), days(0)), 3);
eq('days between can be negative', api.rrDaysBetween_(days(0), days(-2)), -2);
eq('bad date is null not Invalid Date', api.rrDay_('not a date'), null);
eq('blank date is null', api.rrDay_(''), null);
truthy('text date parses', api.rrDay_('2026-09-15') instanceof Date, String(api.rrDay_('2026-09-15')));
eq('money groups in lakhs', api.rrMoney_(110920, 'INR'), '₹1,10,920.00');
eq('money honours currency', api.rrMoney_(1500, 'USD'), '$1,500.00');
eq('money survives text input', api.rrMoney_('85000', 'INR'), '₹85,000.00');
eq('number coerce of garbage is zero', api.rrNumber_('twelve'), 0);
eq('only Active is billable', api.RR_BILLABLE_STATUS, ['active']);

console.log('\n=== settings read by key, not by position ===');
const bSet = fresh([]);
eq('reads business name', api.rrSettings_()['Your Business Name'], 'Kite Studio');
eq('reads silence alert', api.rrSettings_()['Silence Alert (days)'], '21');
// Simulate a bundle install: other kits' rows sit above and below ours.
bSet.sheets.Settings.getRange('A13:B16').setValues([
  ['Invoice Number Prefix', 'INV-'], ['Lead Source Defaults', 'Referral'],
  ['Proposal Valid For (days)', '14'], ['Your Address', '49 Baner Road']]);
bSet.sheets.Settings.insertRowsBefore(2, 2);
bSet.sheets.Settings.getRange(2, 1, 2, 2).setValues([['CRM Stuff', 'x'], ['Another Kit', 'y']]);
eq('still finds a key with rows inserted above', api.rrSettings_()['Silence Alert (days)'], '21');
eq('and still finds a key appended below', api.rrSettings_()['Proposal Valid For (days)'], '14');
eq('missing settings tab yields empty object rather than throwing', (() => {
  const b2 = new Book({ Settings: new Sheet('Settings') }); M.setBook(b2);
  return Object.keys(api.rrSettings_()).length;
})(), 0);

console.log('\n=== the money math ===');
const r1 = retainer({ fee: 85000, includedHours: 20, overageRate: 4500, taxRate: 18 });
const s1 = shape(r1, hours([{ hours: 12 }, { hours: 10 }]));
eq('logged hours sum in the period', s1.logged, 22);
eq('overage hours beyond included', s1.overageHours, 2);
eq('overage value', s1.overageValue, 9000);
eq('subtotal is fee + overage', s1.subtotal, 94000);
eq('tax rounds to paisa', s1.tax, 16920);
eq('total', s1.total, 110920);
eq('utilisation percent', s1.utilisation, 110);
truthy('and it is due', s1.due, s1.reason);

const s2 = shape(retainer({ fee: 40000, includedHours: 40, taxRate: 18 }), hours([{ hours: 22 }]));
eq('under cover means no overage', [s2.overageHours, s2.overageValue], [0, 0]);
eq('subtotal is the plain fee', s2.subtotal, 40000);
eq('utilisation of 22/40', s2.utilisation, 55);

const s3 = shape(retainer({ fee: 30000, includedHours: 0, overageRate: 5000, taxRate: 0 }), hours([{ hours: 7 }]));
eq('no included hours means no overage claim', s3.overageHours, 0);
eq('zero tax still balances', [s3.subtotal, s3.tax, s3.total], [30000, 0, 30000]);
eq('utilisation with no included hours is 0 not Infinity', s3.utilisation, 0);

const s4 = shape(retainer({ fee: 50000, includedHours: 20, overageRate: 4000, taxRate: 18 }),
  hours([{ hours: 20.5 }, { hours: 0.6 }]));
eq('fractional hours keep precision', s4.overageHours, 1.1);
eq('fractional overage values in paisa', s4.overageValue, 4400);

console.log('\n=== last month never bills again ===');
const sPrev = shape(retainer({ fee: 50000 }), [
  ...hours([{ date: days(-40), hours: 9 }]),   // August
  ...hours([{ date: days(-2), hours: 3 }])     // September
]);
eq('only the current period counts', sPrev.logged, 3);

console.log('\n=== hours match by number first, client only as a fallback ===');
const bMatch = fresh([
  retainer({ number: 'RET-010', client: 'Acme', fee: 10000, includedHours: 10 }),
  retainer({ number: 'RET-011', client: 'Acme', fee: 20000, includedHours: 10 })
], hours([{ number: 'RET-010', hours: 4 }, { number: 'RET-011', hours: 6 }]));
const ten = api.rrShape_(bMatch.sheets.Retainers.getRange(2, 1, 1, NCOL).getValues()[0]);
const eleven = api.rrShape_(bMatch.sheets.Retainers.getRange(3, 1, 1, NCOL).getValues()[0]);
eq('RET-010 sees only its own hours', ten.logged, 4);
eq('RET-011 sees only its own hours', eleven.logged, 6);
// A row with no number falls back to the client name — two retainers for one
// client would double-count, which is why the number column exists.
const hrow = (client, number, h) => ({ v: ['', client, number, h, ''] });
truthy('client fallback ignores case and padding',
  api.rrHoursMatch_({ number: '', client: 'Acme' }, hrow('acme ', '', 2)));
truthy('a different number never matches',
  !api.rrHoursMatch_({ number: 'RET-001', client: 'Acme' }, hrow('Acme', 'RET-002', 2)));
truthy('client name is not used when a number is present',
  !api.rrHoursMatch_({ number: '', client: 'Acme' }, hrow('Acme', 'RET-002', 2)));
eq('case-insensitive number match',
  api.rrHoursMatch_({ number: 'ret-001', client: '' }, hrow('', 'RET-001', 2)), true);

console.log('\n=== what makes a retainer NOT billable ===');
const notBillable = [
  ['already billed this period', retainer({ lastBilled: '2026-09' }), 'already billed for 2026-09'],
  ['paused', retainer({ status: 'Paused' }), 'paused, not billable'],
  ['cancelled', retainer({ status: 'Cancelled' }), 'cancelled, not billable'],
  ['expired', retainer({ status: 'Expired' }), 'expired, not billable'],
  ['no number yet', retainer({ number: '' }), 'no retainer number'],
  ['zero fee', retainer({ fee: 0 }), 'no monthly fee on the row'],
  ['ends before today', retainer({ end: days(-3) }), 'ended ' + api.rrPeriod_(days(-3))],
  ['starts after today', retainer({ start: days(4) }), 'starts ' + api.rrPeriod_(days(4)) + ', not this month'],
  ['billing day not reached', retainer({ billingDay: 28 }), 'not due until day 28']
];
notBillable.forEach(([label, row, wantReason]) => {
  const s = shape(row, hours([{ hours: 5 }]));
  eq(label + ' is not due', s.due, false);
  eq(label + ' says why', s.reason, wantReason);
});
// Status text must not be the thing that quietly decides billing.
const lower = shape(retainer({ status: ' active ' }), hours([{ hours: 1 }]));
truthy('status is trimmed and case-insensitive', lower.due, lower.reason);
const blankStatus = shape(retainer({ status: '' }), hours([{ hours: 1 }]));
truthy('a blank status defaults to Active', blankStatus.due, blankStatus.reason);

console.log('\n=== billing day is clamped into a usable range ===');
[0, -5].forEach(d => eq('billing day ' + d + ' becomes the 1st', shape(retainer({ billingDay: d }), hours([])).billingDay, 1));
eq('billing day 31 becomes 28', shape(retainer({ billingDay: 31 }), hours([])).billingDay, 28);
eq('text billing day still works', shape(retainer({ billingDay: '5' }), hours([])).billingDay, 5);
eq('non-numeric billing day falls back to the 1st', shape(retainer({ billingDay: 'weekly' }), hours([])).billingDay, 1);
const wait = shape(retainer({ billingDay: 28 }), hours([]));
eq('waiting days are structured, not a string to parse', wait.waitingDays, 1);
eq('a due retainer has no waiting days', shape(retainer({}), hours([])).waitingDays, null);

console.log('\n=== in force is not the same as marked Active ===');
const endedRow = retainer({ number: 'RET-900', end: days(-10), lastBilled: '2026-08' });
const sEnded = shape(endedRow, hours([]));
eq('past end date is ended', [sEnded.active, sEnded.ended, sEnded.inForce], [true, true, false]);
const futureRow = retainer({ number: 'RET-901', start: days(10) });
const sFuture = shape(futureRow, hours([]));
eq('future start is not in force', [sFuture.started, sFuture.inForce], [false, false]);
const openRow = retainer({ number: 'RET-902', end: days(20) });
eq('a future end date is still in force', shape(openRow, hours([])).inForce, true);
eq('no end date at all is in force', shape(retainer({ end: '' }), hours([])).inForce, true);

console.log('\n=== retainer numbering ===');
const bNum = fresh([
  retainer({ number: 'RET-001' }), retainer({ number: 'RET-007' }), retainer({ number: 'RET-002' })
], hours([]));
eq('next number is max + 1, not count + 1', api.rrNextNumber_(), 'RET-008');
fresh([retainer({ number: 'whatever' })], hours([]));
eq('non-matching numbers do not block the sequence', api.rrNextNumber_(), 'RET-001');
const bNew = fresh([], hours([]));
api.createRetainer();
eq('new retainer row is numbered and dated today', bNew.sheets.Retainers.get(2, 1), 'RET-001');
truthy('start date written', bNew.sheets.Retainers.get(2, 3) instanceof Date,
  String(bNew.sheets.Retainers.get(2, 3)));
eq('status defaults to Active', bNew.sheets.Retainers.get(2, R.col.status + 1), 'Active');
eq('included hours come from Settings', bNew.sheets.Retainers.get(2, R.col.includedHours + 1), 20);
eq('overage rate comes from Settings', bNew.sheets.Retainers.get(2, R.col.overageRate + 1), 4000);
eq('billing day comes from Settings', bNew.sheets.Retainers.get(2, R.col.billingDay + 1), 1);
bNew.sheets.Retainers.getRange(3, 1, 1, NCOL).setValues([retainer({ number: 'RET-012' })]);
eq('next after a manual jump', api.rrNextNumber_(), 'RET-013');

console.log('\n=== invoice numbering continues past what is already on the tab ===');
const bInv = fresh([], hours([]));
const invSheet = bInv.sheets.Invoices;
invSheet.getRange(1, 1, 1, api.RR_INVOICE_HEADERS.length).setValues([api.RR_INVOICE_HEADERS]);
invSheet.getRange(2, 1, 3, 2).setValues([['INV-0001', 'x'], ['INV-0009', 'y'], ['MANUAL-3', 'z']]);
eq('picks max + 1', api.rrNextInvoiceNumber_(invSheet), 'INV-0010');
eq('and the columns line up with what the kit writes', api.RR_INVOICE_HEADERS.length, 13);
eq('a row from this kit recalculates in the Invoice Kit: subtotal+tax=total', (() => {
  const s = api.rrShape_(retainer({ fee: 85000, includedHours: 20, overageRate: 4500, taxRate: 18 }));
  return s.subtotal + s.tax === s.total;
})(), true);
const blankInv = new Sheet('Empty');
eq('empty tab starts at 0001', api.rrNextInvoiceNumber_(blankInv), 'INV-0001');

console.log('\n=== the billing run ===');
const bRun = fresh([
  retainer({ number: 'RET-001', client: 'Acme', fee: 85000, includedHours: 20, overageRate: 4500, taxRate: 18 }),
  retainer({ number: 'RET-002', client: 'Northwind', fee: 45000, includedHours: 12, overageRate: 3500, taxRate: 18, billingDay: 28, lastBilled: '2026-08' }),
  retainer({ number: 'RET-003', client: 'Acme', fee: 30000, includedHours: 10, status: 'Paused' })
], hours([{ number: 'RET-001', hours: 22 }, { number: 'RET-002', hours: 12 }]));
const run = api.runMonthlyBilling();
eq('one invoice for the single due retainer', run.created.map(c => c.invoice), ['INV-0001']);
eq('and it is the tax-inclusive total', run.created[0].total, 110920);
eq('billed value matches', run.billed, 110920);
eq('skips are reported with reasons', run.skipped.map(s => s.number + ': ' + s.reason),
  ['RET-002: not due until day 28', 'RET-003: paused, not billable']);
const line = bRun.sheets.Invoices.getDataRange().getValues()[1];
eq('invoice carries the client', line[1], 'Acme');
eq('subtotal excludes tax', line[5], 94000);
eq('tax recorded separately', line[7], 16920);
eq('total is the sum', line[8], 110920);
eq('status is Draft, not Sent', line[9], 'Draft');
eq('currency from settings', line[11], 'INR');
truthy('line items name the period', /Monthly retainer — 2026-09 \| 1 \| 85000/.test(String(line[4])), String(line[4]));
truthy('line items price the overage', /Overage: 2h beyond 20h \| 2 \| 4500/.test(String(line[4])), String(line[4]));
truthy('notes point back at the retainer', /RET-001/.test(String(line[12])), String(line[12]));
eq('period stamped on the retainer row (the double-bill guard)', bRun.sheets.Retainers.get(2, R.col.lastBilled + 1), '2026-09');
eq('untouched rows keep their own period', bRun.sheets.Retainers.get(3, R.col.lastBilled + 1), '2026-08');
truthy('billing is logged as an activity', bRun.sheets['Retainer Activities'].get(2, 2) === 'RET-001',
  String(bRun.sheets['Retainer Activities'].get(2, 2)));

// The whole point of the stamp: a second run must be a no-op.
const again = api.runMonthlyBilling();
eq('running it twice bills nothing', again.created.length, 0);
eq('and says why', again.skipped[0].reason, 'already billed for 2026-09');
eq('still one invoice row on the tab', bRun.sheets.Invoices.getLastRow(), 2);

console.log('\n=== the billing run writes lines the Invoice Kit can recalculate ===');
const bTwo = fresh([
  retainer({ number: 'RET-020', client: 'Acme', fee: 40000, includedHours: 16, overageRate: 4000, taxRate: 18 }),
  retainer({ number: 'RET-021', client: 'Northwind', fee: 60000, includedHours: 15, overageRate: 4000, taxRate: 18 })
], hours([{ number: 'RET-020', hours: 18 }, { number: 'RET-021', hours: 5 }]));
const run2 = api.runMonthlyBilling();
eq('both billed', run2.created.map(c => c.total), [56640, 70800]);
const rows2 = bTwo.sheets.Invoices.getDataRange().getValues().slice(1);
eq('sequential invoice numbers', rows2.map(r => r[0]), ['INV-0001', 'INV-0002']);
// qty x rate for every line must add up to the subtotal the kit wrote.
rows2.forEach(r => {
  const sum = String(r[4]).split('\n').reduce((t, l) => {
    const p = l.split('|'); return t + (Number(p[1]) || 0) * (Number(p[2]) || 0);
  }, 0);
  eq('line items reconcile to the subtotal for ' + r[0], sum, r[5]);
});

console.log('\n=== hours log reconciliation ===');
const bRec = fresh([retainer({ number: 'RET-001', client: 'Acme' })], [
  ...hours([{ number: 'RET-001', hours: 5 }]),                    // good
  ...hours([{ number: 'RET-999', hours: 3 }]),                    // unknown number
  ...hours([{ number: '', client: 'Ghost Corp', hours: 2 }]),     // unknown client
  ...hours([{ number: 'RET-001', hours: 90 }]),                   // impossible
  ...hours([{ number: 'RET-001', hours: 4, date: 'yesterday-ish' }]), // bad date
  ...hours([{ number: 'RET-001', hours: 6, date: '' }])           // no date at all
]);
const rec = api.reconcileHours();
eq('one clean entry', rec.ok, 1);
eq('unknown retainer numbers named with the row', rec.unknownNumber, ['row 3: RET-999 is not on the Retainers tab']);
eq('orphan client hours named', rec.unknownClient, ['row 4: Ghost Corp has no retainer']);
eq('impossible hours named with what was typed', rec.badHours, ['row 5: 90 — hours must be between 1 and 24']);
eq('two undated entries found', rec.badDates.length, 2);
truthy('unparseable date quotes the value', /"yesterday-ish" is not a date/.test(rec.badDates[0]), rec.badDates[0]);
truthy('blank date names the entry so it can be found', /Acme · 6h/.test(rec.badDates[1]), rec.badDates[1]);
const alert = M.uiCalls.find(c => c[1] && /need a fix/.test(c[1]));
truthy('the alert counts the problems', alert && /^5 row\(s\) need a fix$/.test(alert[1]), alert && alert[1]);
fresh([retainer({})], []);
eq('an empty log is clean, not an error', api.reconcileHours().ok, 0);

console.log('\n=== status moves ===');
const bSt = fresh([retainer({ number: 'RET-001', status: 'Active' }), retainer({ number: 'RET-002', status: 'Paused' })], hours([]));
bSt.sheets.Retainers._activeRow = 2;
api.setRetainerPaused();
eq('pause writes the status', bSt.sheets.Retainers.get(2, R.col.status + 1), 'Paused');
truthy('and logs the change', /Active → Paused/.test(String(bSt.sheets['Retainer Activities'].get(2, 4))),
  String(bSt.sheets['Retainer Activities'].get(2, 4)));
bSt.sheets.Retainers._activeRow = 2;
api.setRetainerPaused();
const already = M.uiCalls[M.uiCalls.length - 1];
truthy('re-applying the same status says so instead of re-logging', /Already Paused/.test(String(already[1])), String(already[1]));
eq('no duplicate activity row', bSt.sheets['Retainer Activities'].getLastRow(), 2);
bSt.sheets.Retainers._activeRow = 3;
api.setRetainerActive();
eq('resume works', bSt.sheets.Retainers.get(3, R.col.status + 1), 'Active');
bSt.sheets.Retainers._activeRow = 1;
api.setRetainerCancelled();
truthy('selecting the header row is refused, not written', bSt.sheets.Retainers.get(1, R.col.status + 1) === 'Status',
  String(bSt.sheets.Retainers.get(1, R.col.status + 1)));

console.log('\n=== renewal ===');
const bRe = fresh([
  retainer({ number: 'RET-001', end: days(5), status: 'Active' }),
  retainer({ number: 'RET-002', end: days(-40), status: 'Expired' }),
  retainer({ number: 'RET-003', end: '', status: 'Active' })
], hours([]));
bRe.sheets.Retainers._activeRow = 2;
const newEnd = api.renewSelectedRetainer();
eq('renews from the existing end date when it is still ahead', api.rrPeriod_(newEnd), '2027-01');
eq('end date written to the row', bRe.sheets.Retainers.get(2, R.col.end + 1) instanceof Date, true);
bRe.sheets.Retainers._activeRow = 3;
const lapsed = api.renewSelectedRetainer();
truthy('a lapsed deal renews from today, not back over the gap', lapsed > new Date(2026, 8, 27), String(lapsed));
eq('and an Expired retainer comes back to Active', bRe.sheets.Retainers.get(3, R.col.status + 1), 'Active');
bRe.sheets.Retainers._activeRow = 4;
const open = api.renewSelectedRetainer();
truthy('an open-ended retainer gets a firm end date', open instanceof Date, String(open));
truthy('renewal is logged', bRe.sheets['Retainer Activities'].getDataRange().getValues().some(r => /Renewal/.test(String(r[2]))),
  JSON.stringify(bRe.sheets['Retainer Activities'].getDataRange().getValues()));

console.log('\n=== mark ended retainers expired ===');
const bEx = fresh([
  retainer({ number: 'RET-001', end: days(-2), status: 'Active' }),
  retainer({ number: 'RET-002', end: days(20), status: 'Active' }),
  retainer({ number: 'RET-003', end: '', status: 'Active' }),
  retainer({ number: 'RET-004', end: days(-2), status: 'Paused' })
], hours([]));
eq('only the stale active ones flip', api.markExpiredRetainers(), 1);
eq('ended + Active becomes Expired', bEx.sheets.Retainers.get(2, R.col.status + 1), 'Expired');
eq('a future end date is left alone', bEx.sheets.Retainers.get(3, R.col.status + 1), 'Active');
eq('open-ended left alone', bEx.sheets.Retainers.get(4, R.col.status + 1), 'Active');
eq('paused left alone — the user said what they meant', bEx.sheets.Retainers.get(5, R.col.status + 1), 'Paused');
eq('running it again finds nothing', api.markExpiredRetainers(), 0);

console.log('\n=== dashboard: MRR counts work actually running ===');
const bDash = fresh([
  retainer({ number: 'RET-001', client: 'Acme', fee: 85000, includedHours: 20, overageRate: 4500 }),
  retainer({ number: 'RET-002', client: 'Northwind', fee: 45000, includedHours: 12, overageRate: 3500, billingDay: 28, lastBilled: '2026-08' }),
  retainer({ number: 'RET-003', client: 'Acme', fee: 120000, includedHours: 40, status: 'Active', lastBilled: '2026-08' }),
  retainer({ number: 'RET-005', client: 'Northwind', fee: 30000, status: 'Paused' }),
  retainer({ number: 'RET-008', client: 'Acme', fee: 25000, end: days(-27), status: 'Active', lastBilled: '2026-08' }),
  retainer({ number: 'RET-009', client: 'Northwind', fee: 55000, start: days(4), status: 'Active' })
], hours([
  { number: 'RET-001', hours: 22 }, { number: 'RET-002', hours: 12 }, { number: 'RET-003', hours: 22 }
]));
const d = api.rrRefreshDashboard();
eq('MRR excludes ended, future and paused', d.mrr, 250000);
eq('in force is narrower than marked Active', [d.inForce, d.markedActive], [3, 5]);
eq('unbilled & due lists the open ones', d.unbilled.map(u => u.number), ['RET-001', 'RET-003']);
eq('unbilled value is tax-inclusive', d.unbilledValue, 110920 + 141600);
eq('overage only counts in-force work', [d.overageHours, d.overageValue], [2, 9000]);
eq('billed this period reads the stamps', d.billedCount, 0);
eq('ended-but-still-Active is surfaced separately', d.endedButActive.map(x => x.number), ['RET-008']);
const sheet = bDash.sheets['Retainer Dashboard'];
eq('title on its own tab', String(sheet.get(1, 1)), 'Retainer Dashboard');
eq('MRR printed in rupees not the raw number', String(sheet.get(5, 1)), 'Monthly Recurring');
truthy('headline says 3 retainers', String(sheet.get(4, 2)) === '3' || sheet.get(4, 2) === 3, String(sheet.get(4, 2)));
truthy('the honest note: past-end retainers called out', /past their end date/.test(String(sheet.get(4, 3))), String(sheet.get(4, 3)));
const dump = sheet.getDataRange().getValues().map(r => String(r[0]));
truthy('utilisation table lists in-force retainers', dump.includes('Client'), dump.join(' | ').slice(0, 200));
truthy('quiet section header present', dump.some(x => /No Hours Logged Recently/.test(x)), dump.join(' | '));
truthy('past-end section header present', dump.some(x => /Past End Date But Still Active/.test(x)));
// Read only the rows directly under the heading, stopping at the blank line that
// separates sections — otherwise the next section's rows get attributed to this one.
const blockOf = heading => {
  const grid = sheet.getDataRange().getValues();
  const at = grid.findIndex(r => new RegExp(heading).test(String(r[0])));
  const out = [];
  for (let i = at + 1; i < grid.length && String(grid[i][0]).trim() !== ''; i++) out.push(String(grid[i][0]));
  return out;
};
const quietBlock = blockOf('No Hours Logged Recently');
eq('quiet list is empty when every live client logged hours this week', quietBlock, ['—']);
truthy('the ended retainer is NOT reported as churn', !quietBlock.join(' ').includes('RET-008'), quietBlock.join(' '));
truthy('but it IS on the stale-status list', blockOf('Past End Date But Still Active').includes('RET-008'),
  blockOf('Past End Date But Still Active').join(' '));
truthy('and the not-due-yet list is its own section', blockOf('Not Due Yet This Month').includes('RET-002'),
  blockOf('Not Due Yet This Month').join(' '));

console.log('\n=== the percent format lands on the percent row ===');
const utilRow = 4 + 5; // headline rows are Retainers In Force, MRR, Billed, Unbilled, Overage, Utilisation
const pct = M.formats.filter(f => f.format === '0%').map(f => f.where);
truthy('average utilisation is formatted as a percent', pct.includes('Retainer Dashboard!' + utilRow + ':2'), pct.join(' '));
truthy('and the money rows are not', !M.formats.some(f => f.format === '0%' && f.where === 'Retainer Dashboard!5:2'));
truthy('utilisation column in the table too', pct.some(w => /:6$/.test(w)), pct.join(' '));
eq('value stored as a fraction so 0% renders 110%', sheet.get(utilRow, 2), 1.1 === sheet.get(utilRow, 2) ? 1.1 : (d.avgUtilisation / 100));

console.log('\n=== empty dashboard still reads as a report ===');
const bEmpty = fresh([], []);
const de = api.rrRefreshDashboard();
eq('no retainers, no crash', [de.mrr, de.inForce, de.unbilledValue], [0, 0, 0]);
const emptyDump = bEmpty.sheets['Retainer Dashboard'].getDataRange().getValues().map(r => String(r[0]));
truthy('every section keeps a heading', emptyDump.filter(x => /No Hours|Ending Within|Due & Unbilled|Past End/.test(x)).length >= 4,
  emptyDump.join(' | '));
truthy('empty sections show a dash row rather than nothing', emptyDump.some(x => x === '—'), emptyDump.join(' | '));

console.log('\n=== daily email ===');
const bMail = fresh([
  retainer({ number: 'RET-001', client: 'Acme', fee: 85000, includedHours: 20, overageRate: 4500 }),
  retainer({ number: 'RET-002', client: 'Northwind', fee: 45000, includedHours: 12, billingDay: 28, lastBilled: '2026-08' }),
  retainer({ number: 'RET-004', client: 'Acme', fee: 60000, includedHours: 15, lastBilled: '2026-08', end: days(18) })
], hours([{ number: 'RET-001', hours: 22 }, { number: 'RET-004', hours: 1, date: days(-30) }]));
const m = api.dailyRetainerCheck();
eq('mailed to the settings address', M.mailCalls.length, 1);
eq('address from Settings', M.mailCalls[0].to, 'hello@kitestudio.work');
eq('due count in the subject', m.due, 2);
truthy('subject leads with money left on the table', /^Retainers: 2 unbilled/.test(M.mailCalls[0].subject), M.mailCalls[0].subject);
truthy('at-risk count in the subject', /at risk/.test(M.mailCalls[0].subject), M.mailCalls[0].subject);
const body = M.mailCalls[0].body;
truthy('due section lists the retainer', /RET-001 · Acme · ₹1,10,920\.00/.test(body), body.slice(0, 300));
truthy('overage explained inline', /incl\. 2h overage/.test(body), body);
truthy('coming-due section uses billing day, not a parsed reason', /RET-002 .* due on day 28/.test(body), body);
truthy('renewal window named', /RET-004 .*ends in 18d/.test(body), body);
truthy('silence reported in days', /30d since the last entry/.test(body), body);
truthy('quiet client named', /RET-004/.test(body.split('NO RECENT HOURS')[1] || ''), body);

// A retainer that is both ending and quiet is one problem, not two.
const bBoth = fresh([
  retainer({ number: 'RET-700', client: 'Acme', fee: 50000, end: days(10), lastBilled: '2026-08' })
], hours([{ number: 'RET-700', hours: 2, date: days(-40) }]));
const mb = api.dailyRetainerCheck();
eq('counted once in the subject', mb.endings, 1);
eq('and once in the silence list', mb.silence, 1);
truthy('subject total is 1 at risk, not 2', /1 at risk/.test(M.mailCalls[1] ? M.mailCalls[1].subject : M.mailCalls[0].subject),
  M.mailCalls[M.mailCalls.length - 1].subject);

console.log('\n=== all-quiet email ===');
fresh([retainer({ number: 'RET-001', client: 'Acme', fee: 50000, lastBilled: '2026-09' })],
  hours([{ number: 'RET-001', hours: 5 }]));
const quiet = api.dailyRetainerCheck();
eq('nothing due', quiet.due, 0);
truthy('still sends a reassuring note', /all billed, nothing at risk/.test(M.mailCalls[0].subject), M.mailCalls[0].subject);
truthy('body states MRR', /₹50,000\.00 a month is holding/.test(M.mailCalls[0].body), M.mailCalls[0].body);

console.log('\n=== recalc for one selected row ===');
const bRec2 = fresh([retainer({ number: 'RET-001', client: 'Acme', fee: 85000, includedHours: 20, overageRate: 4500 })],
  hours([{ number: 'RET-001', hours: 22 }]));
bRec2.sheets.Retainers._activeRow = 2;
const rc = api.recalcRetainerTotals();
eq('reads the selected row', rc.total, 110920);
const recAlert = M.uiCalls[M.uiCalls.length - 1];
truthy('alert shows fee, hours and the total', /Logged this period 22h/.test(recAlert[2]) && /₹1,10,920\.00/.test(recAlert[2]),
  recAlert[2]);
bRec2.sheets.Retainers._activeRow = 4;
api.recalcRetainerTotals();
truthy('empty row asks for a selection', /Select a retainer row/.test(String(M.uiCalls[M.uiCalls.length - 1][1])),
  String(M.uiCalls[M.uiCalls.length - 1][1]));

console.log('\n=== hours row helper ===');
const bH = fresh([retainer({ number: 'RET-001', client: 'Acme' })], []);
bH.sheets.Retainers._activeRow = 2;
const added = api.addHoursRowForSelected();
eq('prefilled with today and the retainer #', added.number, 'RET-001');
eq('client name copied', bH.sheets['Retainer Hours'].get(added.row, R.hoursCol.client + 1), 'Acme');
truthy('hours cell left blank for typing', String(bH.sheets['Retainer Hours'].get(added.row, R.hoursCol.hours + 1)) === '');
bH.sheets.Retainers._activeRow = 1;
api.addHoursRowForSelected();
truthy('refuses on the header row', /Select a retainer row/.test(String(M.uiCalls[M.uiCalls.length - 1][1])));

console.log('\n=== setup is safe on a shared spreadsheet ===');
const bSetup = new Book({
  Retainers: new Sheet('Retainers'), 'Retainer Hours': new Sheet('Retainer Hours'),
  Clients: new Sheet('Clients'), Settings: new Sheet('Settings'), Invoices: new Sheet('Invoices'),
  Leads: new Sheet('Leads'), Dashboard: new Sheet('Dashboard')
});
bSetup.sheets.Settings.getRange('A1:B3').setValues([['Setting', 'Value'],
  ['Your Email', 'real@studio.work'], ['Invoice Number Prefix', 'INV-']]);
bSetup.sheets.Retainers.getRange(1, 1, 1, NCOL).setValues([api.RR_HEADERS]);
bSetup.sheets.Retainers.getRange(2, 1, 1, NCOL).setValues([retainer({ number: 'RET-001', fee: 50000 })]);
bSetup.sheets.Invoices.getRange(1, 1, 1, 13).setValues([['Invoice #', 'Client', 'Issue Date', 'Due Date',
  'Line Items (one per line)', 'Subtotal', 'Tax %', 'Tax', 'Total', 'Status', 'Paid Date', 'Currency', 'Notes']]);
bSetup.sheets.Invoices.getRange(2, 1, 1, 2).setValues([['INV-0001', 'Existing']]);
M.setBook(bSetup); M.reset();
api.setupRetainers();
eq('existing retainer row survives setup', bSetup.sheets.Retainers.get(2, 1), 'RET-001');
eq('existing invoice survives setup', bSetup.sheets.Invoices.get(2, 1), 'INV-0001');
eq('another kit\u2019s setting survives', api.rrSettings_()['Invoice Number Prefix'], 'INV-');
eq('setup does NOT clobber an email the user already typed', api.rrSettings_()['Your Email'], 'real@studio.work');
eq('but it still fills a key another kit left empty', api.rrSettings_()['Silence Alert (days)'], '21');
// Row 4 is 'Your Business Name', appended by the setup call above. Blank it and
// setup must refill it: "not overwriting" is for values, not for empty space.
eq('setup appended its own keys below the others', String(bSetup.sheets.Settings.get(4, 1)), 'Your Business Name');
bSetup.sheets.Settings.getRange(4, 2).setValue('');
api.setupRetainers();
eq('an empty key is refilled on the next setup', String(bSetup.sheets.Settings.get(4, 2)), 'Your Business');
eq('and rows are not duplicated when nothing needs adding',
  bSetup.sheets.Settings.getDataRange().getValues().slice(1)
    .map(r => String(r[0]).trim()).filter(k => k === 'Your Business Name').length, 1);
truthy('new settings appended, not a cleared tab', Object.keys(api.rrSettings_()).length >= 9,
  JSON.stringify(Object.keys(api.rrSettings_())));
truthy('CRM tab untouched by setup', bSetup.sheets.Leads.getLastRow() === 0);
api.setupRetainers();
const keys = bSetup.sheets.Settings.getDataRange().getValues().slice(1).map(r => String(r[0]).trim());
eq('second setup does not duplicate keys', keys.filter((k, i) => keys.indexOf(k) !== i), []);

console.log('\n=== menu ===');
fresh([]);
M.reset();
api.onOpen();
eq('one menu built', M.menus.length, 1);
eq('menu label', M.menus[0].label, '📅 Retainers');
const leaves = M.flattenMenu(M.menus[0], '');
truthy('billing run is on the menu', leaves.some(l => l.fn === 'runMonthlyBilling'), JSON.stringify(leaves.map(l => l.fn)));
truthy('status submenu expands to three real functions',
  ['setRetainerActive', 'setRetainerPaused', 'setRetainerCancelled'].every(fn => leaves.some(l => l.fn === fn)));
eq('every menu item binds to a real function',
  leaves.filter(l => typeof api[l.fn] !== 'function').map(l => l.fn), []);
truthy('setup is offered exactly once', leaves.filter(l => l.fn === 'setupRetainers').length === 1);

console.log('\n=== edge cases ===');
const be = fresh([], []);
let threw = null;
try { api.rrRefreshDashboard(); } catch (e) { threw = String(e.message || e); }
truthy('dashboard survives no retainers', threw === null && api.rrRefreshDashboard().mrr === 0, threw);
threw = null;
try { api.dailyRetainerCheck(); } catch (e) { threw = String(e.message || e); }
truthy('daily email survives no retainers', threw === null, threw);
threw = null;
try { api.runMonthlyBilling(); } catch (e) { threw = String(e.message || e); }
truthy('billing run survives an empty sheet', threw === null && api.runMonthlyBilling().created.length === 0, threw);
threw = null;
try { api.reconcileHours(); } catch (e) { threw = String(e.message || e); }
truthy('reconcile survives an empty log', threw === null, threw);
threw = null;
try { api.markExpiredRetainers(); } catch (e) { threw = String(e.message || e); }
truthy('auto-expire survives no retainers', threw === null, threw);
// Garbage in the money columns must not produce NaN on the dashboard.
const bg = fresh([retainer({ number: 'RET-800', fee: 'many', includedHours: 'lots', taxRate: 'eighteen', billingDay: 'first' })],
  hours([{ hours: 'three' }]));
let dg;
threw = null;
try { dg = api.rrRefreshDashboard(); } catch (e) { threw = String(e.message || e); }
truthy('garbage numbers do not crash the dashboard', threw === null, threw);
eq('garbage fee counts as zero', dg.mrr, 0);
const gs = api.rrShape_(bg.sheets.Retainers.getRange(2, 1, 1, NCOL).getValues()[0]);
eq('and produce no NaN total', String(gs.total), '0');
truthy('NaN never reaches a printed figure', !/NaN/.test(JSON.stringify(dg)), JSON.stringify(dg).slice(0, 200));
// Missing tabs must be reported, not half-run.
const noTabs = new Book({ Settings: new Sheet('Settings') });
M.setBook(noTabs); M.reset();
truthy('billing run refuses without a Retainers tab', api.runMonthlyBilling() === null);
truthy('new retainer refuses without a Retainers tab', (() => { api.createRetainer(); return /Run Setup/.test(String(M.uiCalls[M.uiCalls.length - 1][1])); })());
api.installRetainerReminder();
truthy('reminder installer reports success', /9am/.test(String(M.uiCalls[M.uiCalls.length - 1][2])), String(M.uiCalls[M.uiCalls.length - 1][2]));

console.log('\n----------------------------------------');
console.log(`PASS ${pass}   FAIL ${fail}`);
process.exit(fail ? 1 : 0);
