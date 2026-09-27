// Proves the bundle's claim: all four .gs files pasted into ONE Apps Script
// project. Same realm, no identifier collisions, one onOpen that builds every
// menu, and the cross-file bridges (proposal → invoice, retainer → invoice)
// working on one shared spreadsheet.
const M = require('./mock.js'); const { Sheet, Book } = M;
const fs = require('fs');
const path = require('path');
const vm = require('vm');

M.freezeClock('2026-09-27');

const FILES = [
  ['crm', '../crm-template/crm_script.gs'],
  ['invoice', '../invoice-kit/invoice_script.gs'],
  ['proposals', '../proposals-kit/proposal_script.gs'],
  ['retainer', '../retainer-kit/retainer_script.gs']
].map(([k, p]) => [k, path.resolve(__dirname, p)]);

let pass = 0, fail = 0;
const eq = (n, g, w) => { const a = JSON.stringify(g), x = JSON.stringify(w);
  if (a === x) { pass++; console.log('  ok   ' + n); }
  else { fail++; console.log('  FAIL ' + n + '\n        got  ' + a + '\n        want ' + x); } };
const truthy = (n, v, d) => { if (v) { pass++; console.log('  ok   ' + n); }
  else { fail++; console.log('  FAIL ' + n + (d ? '\n        ' + String(d).slice(0, 400) : '')); } };

console.log('=== top-level names must not collide ===');
function topLevelNames(src) {
  const names = new Set();
  src.split('\n').forEach(line => {
    let m = /^(?:function)\s+([A-Za-z_$][\w$]*)/.exec(line) ||
            /^(?:const|let|var)\s+([A-Za-z_$][\w$]*)/.exec(line);
    if (m) names.add(m[1]);
  });
  return names;
}
const declared = FILES.map(([k, p]) => [k, fs.readFileSync(p, 'utf8')]);
const seen = new Map();
const clashes = [];
declared.forEach(([k, text]) => topLevelNames(text).forEach(n => {
  if (seen.has(n) && seen.get(n) !== k) clashes.push(n + ' (' + seen.get(n) + ' vs ' + k + ')');
  else if (!seen.has(n)) seen.set(n, k);
}));
// onOpen is the one deliberate duplicate: Apps Script allows a single onOpen per
// project, so every file ships the same composing hook and the last one loaded
// wins. It is only safe because the bodies are identical.
const dupes = [...new Set(clashes.map(c => c.split(' ')[0]))];
eq('the only duplicate name is onOpen', dupes, ['onOpen']);
const onOpenBodies = declared.map(([, text]) => {
  const m = /\nfunction onOpen\(\) \{[\s\S]*?\n\}/.exec(text);
  return m ? m[0].trim() : null;
});
truthy('every file defines onOpen', onOpenBodies.every(Boolean), JSON.stringify(onOpenBodies.map(Boolean)));
truthy('all onOpen copies are byte-identical, so load order cannot matter',
  new Set(onOpenBodies).size === 1,
  onOpenBodies.map((b, i) => b && b.length + '@' + i).join(' vs '));
const nonOnOpen = clashes.filter(c => !/^onOpen /.test(c));
eq('no other duplicate declaration across the four files', nonOnOpen, []);

console.log('=== load all four into one realm ===');
const src = FILES.map(([k, p]) => fs.readFileSync(p, 'utf8')).join('\n');
const mockMod = M;
// Load the merged source once, exactly as Apps Script would compile one project.
const tmp = path.join(require('os').tmpdir(), 'bundle_merged_' + process.pid + '.gs');
fs.writeFileSync(tmp, src);
const EXPORTS = ['onOpen', 'setupTemplate', 'setupKit', 'setupProposals', 'setupRetainers',
  'createDraftProposal', 'createDraftInvoice', 'convertProposalToInvoice', 'prRefreshDashboard',
  'refreshSummary', 'updateDashboard', 'checkFollowUps', 'dailyOverdueCheck', 'dailyProposalCheck',
  'runMonthlyBilling', 'rrRefreshDashboard', 'dailyRetainerCheck', 'reconcileHours',
  'CONFIG', 'CFG', 'PR', 'RR', 'isOpenLead', 'classify_', 'rrShape_'];
// Every caption binds a function name; pull them straight out of the sources so
// the check cannot drift away from what the menus advertise.
const MENU_FNS = [...new Set(
  FILES.flatMap(([, f]) => [...fs.readFileSync(f, 'utf8').matchAll(/\.addItem\('(?:[^']*)',\s*'([A-Za-z_$][\w$]*)'\)/g)]
    .map(m => m[1]))
)];
truthy('found menu functions to check', MENU_FNS.length > 35, 'only ' + MENU_FNS.length);
let api = null, threw = null;
try { api = mockMod.load(tmp, EXPORTS.concat(MENU_FNS)); fs.unlinkSync(tmp); } catch (e) { threw = e; }
truthy('merged project parses and runs', !threw, threw && (threw.stack || String(threw)).slice(0, 500));

console.log('=== one onOpen builds all three menus ===');
const book = new Book({
  Leads: new Sheet('Leads'), Activities: new Sheet('Activities'), Pipeline: new Sheet('Pipeline'),
  Dashboard: new Sheet('Dashboard'), Settings: new Sheet('Settings'),
  Clients: new Sheet('Clients'), Invoices: new Sheet('Invoices'), Payments: new Sheet('Payments'),
  Proposals: new Sheet('Proposals'), 'Proposal Stages': new Sheet('Proposal Stages'),
  'Proposal Activities': new Sheet('Proposal Activities'), 'Proposal Dashboard': new Sheet('Proposal Dashboard'),
  Retainers: new Sheet('Retainers'), 'Retainer Hours': new Sheet('Retainer Hours'),
  'Retainer Activities': new Sheet('Retainer Activities'), 'Retainer Dashboard': new Sheet('Retainer Dashboard')
});
M.setBook(book);
api.setupTemplate();
// Invoice kit tabs
api.setupKit();
// Proposals tabs
api.setupProposals();
// Retainer tabs — last, to prove a late installer cannot damage the earlier ones
api.setupRetainers();
mockMod.reset();
api.onOpen();
const labels = mockMod.menus.map(m => m.label);
eq('four menus, one onOpen', labels, ['📊 CRM Tools', '🧾 Invoice Kit', '📄 Proposals', '📅 Retainers']);
const flat = mockMod.menus.map(m => mockMod.flattenMenu(m, '')).flat();
truthy('every menu item binds to a real function in the merged realm',
  flat.every(l => typeof api[l.fn] === 'function'),
  JSON.stringify(flat.filter(l => typeof api[l.fn] !== 'function').map(l => l.fn)));

console.log('=== the shared Settings tab survives all three setups ===');
const settings = book.sheets.Settings.getDataRange().getValues().slice(1).map(r => String(r[0]).trim());
['Your Email', 'Default Follow-up Days', 'Auto-Reminder Enabled', 'Your Business Name',
 'Default Tax Rate (%)', 'Payment Terms (days)', 'Invoice Number Prefix',
 'Proposal Valid For (days)', 'Default Deposit (%)', 'Proposal Number Prefix',
 'Silence Alert (days)', 'Renewal Length (months)', 'Retainer Number Prefix',
 'Default Included Hours', 'Default Billing Day'].forEach(key =>
  truthy('settings has ' + key, settings.includes(key), settings.join(' | ')));
const dupeKeys = settings.filter((s, i) => settings.indexOf(s) !== i);
eq('no key duplicated by stacked setups', dupeKeys, []);

// The bug this exists to catch: every kit seeds the same keys (Your Email,
// GSTIN, address). A setup that overwrites instead of seeding blanks the config
// the previous kit wrote, so invoices PDF with an empty tax ID.
const shared = book.sheets.Settings.getDataRange().getValues().slice(1);
const emailRow = shared.filter(r => String(r[0]).trim() === 'Your Email');
eq('exactly one Your Email row for four kits', emailRow.length, 1);
truthy('and it holds a real value, not a blank', String(emailRow[0][1]).length > 3, JSON.stringify(emailRow[0]));
const bizRow = shared.filter(r => String(r[0]).trim() === 'Your Business Name');
eq('exactly one business-name row', bizRow.length, 1);
truthy('business name survived four stacked setups', String(bizRow[0][1]).length > 0, JSON.stringify(bizRow[0]));

console.log('=== the four dashboards do not overwrite each other ===');
truthy('CRM owns Dashboard', book.sheets.Dashboard.get(1, 1) !== 'Proposals Dashboard', String(book.sheets.Dashboard.get(1, 1)));
truthy('Proposals owns its own tab', book.sheets['Proposal Dashboard'].get(1, 1) === 'Proposals Dashboard',
  String(book.sheets['Proposal Dashboard'].get(1, 1)));
truthy('Retainer Kit owns its own tab', book.sheets['Retainer Dashboard'].get(1, 1) === 'Retainer Dashboard',
  String(book.sheets['Retainer Dashboard'].get(1, 1)));
truthy('Retainer Kit did not claim the CRM Dashboard tab',
  /Total Leads/.test(String(book.sheets.Dashboard.getDataRange().getValues().map(r => r[0]).join(' '))) === false ||
  String(book.sheets.Dashboard.get(1, 1)).indexOf('Retainer') !== 0,
  String(book.sheets.Dashboard.get(1, 1)));

console.log('=== cross-product bridge: proposal → invoice ===');
const row = new Array(15).fill('');
row[0] = 'PROP-001'; row[1] = 'Acme Client'; row[2] = M.days(-10); row[3] = M.days(4);
row[4] = 'Site build | 1 | 100000'; row[6] = 18; row[9] = 40; row[11] = 'Accepted';
book.sheets.Proposals.getRange(2, 1, 1, 15).setValues([row]);
book.sheets.Proposals._activeRow = 2;
book.sheets.Clients.getRange(2, 1, 1, 5).setValues([['Acme Client', 'ap@acme.test', 'Pune', '999', '27X']]);
mockMod.reset();
const made = api.convertProposalToInvoice();
truthy('invoice created from a proposal', made && /^INV-/.test(made.number), JSON.stringify(made));
eq('proposal is untouched by the read', book.sheets.Proposals.get(2, 12), 'Accepted');
eq('bills the 40% deposit of a ₹1,18,000 proposal', made.amount, 47200);
const invRow = book.sheets.Invoices.getDataRange().getValues()[1]; // first data row
truthy('invoice tab header intact', String(book.sheets.Invoices.get(1, 1)) === 'Invoice #');
eq('client name carried across', invRow[1], 'Acme Client');

console.log('=== cross-product bridge: retainer → invoice, into the same tab ===');
// Same Invoices tab the proposal bridge wrote to, on the same spreadsheet.
const retRow = new Array(12).fill('');
retRow[0] = 'RET-001'; retRow[1] = 'Acme Client'; retRow[2] = M.days(-100); retRow[4] = 85000;
retRow[5] = 20; retRow[6] = 4500; retRow[7] = 18; retRow[8] = 1; retRow[9] = 'Active';
book.sheets.Retainers.getRange(2, 1, 1, 12).setValues([retRow]);
const hrow = new Array(5).fill('');
hrow[0] = M.days(-5); hrow[1] = 'Acme Client'; hrow[2] = 'RET-001'; hrow[3] = 24;
book.sheets['Retainer Hours'].getRange(2, 1, 1, 5).setValues([hrow]);
mockMod.reset();
const rrRun = api.runMonthlyBilling();
eq('retainer run bills one retainer', rrRun.created.map(c => c.number), ['RET-001']);
truthy('it allocated the next number after the proposal invoice, not a clash',
  /^INV-000[2-9]$/.test(rrRun.created[0].invoice), rrRun.created[0].invoice);
eq('proposal invoice row is still on the tab', String(book.sheets.Invoices.get(2, 1)), 'INV-0001');
eq('retainer invoice sits below it', String(book.sheets.Invoices.get(3, 1)), rrRun.created[0].invoice);
// 24h logged vs 20h included = 4h x ₹4,500 on top of ₹85,000, then 18% GST.
eq('overage hours carried into the bundle run', rrRun.created[0].overageHours, 4);
eq('and it priced the overage the same way the kit does', rrRun.created[0].total, 121540);
truthy('the stamp landed on the Retainers tab only',
  String(book.sheets.Retainers.get(2, 11)) === '2026-09' && String(book.sheets.Proposals.get(2, 12)) === 'Accepted',
  String(book.sheets.Retainers.get(2, 11)) + ' / ' + String(book.sheets.Proposals.get(2, 12)));
mockMod.reset();
eq('a second run double-bills nothing', api.runMonthlyBilling().created.length, 0);
const reconciled = api.reconcileHours();
eq('hours reconcile against the retainer tab in a shared project', reconciled.ok, 1);

console.log('=== the four daily emails can all run on the same sheet ===');
// Seed one live record per product so each job actually has something to report.
const lead = new Array(17).fill('');
lead[0] = 'L1'; lead[1] = 'Bundle Lead Co'; lead[6] = 'Qualified'; lead[7] = 50000;
lead[8] = 40; lead[9] = 20000; lead[15] = M.days(-2); lead[16] = 'Active';
book.sheets.Leads.getRange(2, 1, 1, 17).setValues([lead]);
const inv = new Array(13).fill('');
inv[0] = 'INV-0001'; inv[1] = 'Acme Client'; inv[2] = M.days(-40); inv[3] = M.days(-26);
inv[4] = 'Late work | 1 | 50000'; inv[5] = 50000; inv[6] = 0; inv[7] = 0; inv[8] = 50000;
inv[9] = 'Sent'; inv[11] = 'INR';
book.sheets.Invoices.getRange(2, 1, 1, 13).setValues([inv]);
mockMod.reset();
let errs = [];
[['crm checkFollowUps', () => api.checkFollowUps()],
 ['invoice dailyOverdueCheck', () => api.dailyOverdueCheck()],
 ['proposals dailyProposalCheck', () => api.dailyProposalCheck()],
 ['retainer dailyRetainerCheck', () => api.dailyRetainerCheck()]].forEach(([name, fn]) => {
  try { fn(); } catch (e) { errs.push(name + ': ' + (e.message || e)); }
});
truthy('all four daily jobs run without throwing', errs.length === 0, errs.join(' | '));
eq('all four products mail on the same spreadsheet', mockMod.mailCalls.length, 4);
const subs = mockMod.mailCalls.map(m => m.subject).join('\n');
truthy('CRM reminder subject', /Follow-up|follow-up/.test(subs), subs);
truthy('Invoice overdue subject', /overdue/i.test(subs) && /INV-0001|1/.test(subs), subs);
truthy('Proposals subject', /Proposals:/.test(subs), subs);
truthy('Retainer subject', /Retainers:/.test(subs), subs);
truthy('four distinct subject lines, none swallowed another',
  new Set(mockMod.mailCalls.map(m => m.subject)).size === 4, subs);
// The real risk in a shared spreadsheet: one product refreshing its summary
// wipes another's. Refresh all three, then confirm each tab kept its own content.
api.updateDashboard();
api.refreshSummary();
api.prRefreshDashboard();
api.rrRefreshDashboard();
const crmDump = book.sheets.Dashboard.getDataRange().getValues().map(r => String(r[0])).join('\n');
const cashDump = book.sheets['Cash Flow'].getDataRange().getValues().map(r => String(r[0])).join('\n');
const propDump = book.sheets['Proposal Dashboard'].getDataRange().getValues().map(r => String(r[0])).join('\n');
const retDump = book.sheets['Retainer Dashboard'].getDataRange().getValues().map(r => String(r[0])).join('\n');
truthy('CRM dashboard survived the other two', /Total Leads/.test(crmDump), crmDump.slice(0, 120));
truthy('cash-flow summary is on its own tab', /Cash Flow|Collected|Outstanding/.test(cashDump), cashDump.slice(0, 120));
truthy('cash-flow tab did not clobber the CRM tab', !/Outstanding/.test(crmDump));
truthy('proposals dashboard is on its own tab', /Open Proposals/.test(propDump), propDump.slice(0, 120));
truthy('retainer dashboard is on its own tab', /Retainers In Force/.test(retDump), retDump.slice(0, 160));
truthy('retainer tab did not clobber the others', !/Total Leads|Open Proposals|Collected/.test(retDump), retDump.slice(0, 160));
truthy('four separate dashboards coexist',
  new Set([String(book.sheets.Dashboard.get(1, 1)), String(book.sheets['Cash Flow'].get(1, 1)),
           String(book.sheets['Proposal Dashboard'].get(1, 1)),
           String(book.sheets['Retainer Dashboard'].get(1, 1))]).size === 4,
  [String(book.sheets.Dashboard.get(1, 1)), String(book.sheets['Cash Flow'].get(1, 1)),
   String(book.sheets['Proposal Dashboard'].get(1, 1)),
   String(book.sheets['Retainer Dashboard'].get(1, 1))].join(' | '));
truthy('MRR on the retainer tab survived the other three', /Monthly Recurring/.test(retDump), retDump.slice(0, 200));

console.log('\n----------------------------------------');
console.log(`PASS ${pass}   FAIL ${fail}`);
process.exit(fail ? 1 : 0);
