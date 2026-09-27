// Proves the bundle's claim: all three .gs files pasted into ONE Apps Script
// project. Same realm, no identifier collisions, one onOpen that builds every
// menu, and the Proposals → Invoices bridge working across files.
const M = require('./mock.js'); const { Sheet, Book } = M;
const fs = require('fs');
const path = require('path');
const vm = require('vm');

M.freezeClock('2026-09-27');

const FILES = [
  ['crm', '../crm-template/crm_script.gs'],
  ['invoice', '../invoice-kit/invoice_script.gs'],
  ['proposals', '../proposals-kit/proposal_script.gs']
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
eq('no other duplicate declaration across the three files', nonOnOpen, []);

console.log('=== load all three into one realm ===');
const src = FILES.map(([k, p]) => fs.readFileSync(p, 'utf8')).join('\n');
const mockMod = M;
// Load the merged source once, exactly as Apps Script would compile one project.
const tmp = path.join(require('os').tmpdir(), 'bundle_merged_' + process.pid + '.gs');
fs.writeFileSync(tmp, src);
const EXPORTS = ['onOpen', 'setupTemplate', 'setupKit', 'setupProposals', 'createDraftProposal',
  'createDraftInvoice', 'convertProposalToInvoice', 'prRefreshDashboard', 'refreshSummary', 'updateDashboard',
  'checkFollowUps', 'dailyOverdueCheck', 'dailyProposalCheck', 'CONFIG', 'CFG', 'PR', 'isOpenLead', 'classify_'];
// Every caption binds a function name; pull them straight out of the sources so
// the check cannot drift away from what the menus advertise.
const MENU_FNS = [...new Set(
  FILES.flatMap(([, f]) => [...fs.readFileSync(f, 'utf8').matchAll(/\.addItem\('(?:[^']*)',\s*'([A-Za-z_$][\w$]*)'\)/g)]
    .map(m => m[1]))
)];
truthy('found menu functions to check', MENU_FNS.length > 25, 'only ' + MENU_FNS.length);
let api = null, threw = null;
try { api = mockMod.load(tmp, EXPORTS.concat(MENU_FNS)); fs.unlinkSync(tmp); } catch (e) { threw = e; }
truthy('merged project parses and runs', !threw, threw && (threw.stack || String(threw)).slice(0, 500));

console.log('=== one onOpen builds all three menus ===');
const book = new Book({
  Leads: new Sheet('Leads'), Activities: new Sheet('Activities'), Pipeline: new Sheet('Pipeline'),
  Dashboard: new Sheet('Dashboard'), Settings: new Sheet('Settings'),
  Clients: new Sheet('Clients'), Invoices: new Sheet('Invoices'), Payments: new Sheet('Payments'),
  Proposals: new Sheet('Proposals'), 'Proposal Stages': new Sheet('Proposal Stages'),
  'Proposal Activities': new Sheet('Proposal Activities'), 'Proposal Dashboard': new Sheet('Proposal Dashboard')
});
M.setBook(book);
api.setupTemplate();
// Invoice kit tabs
api.setupKit();
// Proposals tabs
api.setupProposals();
mockMod.reset();
api.onOpen();
const labels = mockMod.menus.map(m => m.label);
eq('three menus, one onOpen', labels, ['📊 CRM Tools', '🧾 Invoice Kit', '📄 Proposals']);
const flat = mockMod.menus.map(m => mockMod.flattenMenu(m, '')).flat();
truthy('every menu item binds to a real function in the merged realm',
  flat.every(l => typeof api[l.fn] === 'function'),
  JSON.stringify(flat.filter(l => typeof api[l.fn] !== 'function').map(l => l.fn)));

console.log('=== the shared Settings tab survives all three setups ===');
const settings = book.sheets.Settings.getDataRange().getValues().slice(1).map(r => String(r[0]).trim());
['Your Email', 'Default Follow-up Days', 'Auto-Reminder Enabled', 'Your Business Name',
 'Default Tax Rate (%)', 'Payment Terms (days)', 'Invoice Number Prefix',
 'Proposal Valid For (days)', 'Default Deposit (%)', 'Proposal Number Prefix'].forEach(key =>
  truthy('settings has ' + key, settings.includes(key), settings.join(' | ')));
const dupeKeys = settings.filter((s, i) => settings.indexOf(s) !== i);
eq('no key duplicated by stacked setups', dupeKeys, []);

console.log('=== the three dashboards do not overwrite each other ===');
truthy('CRM owns Dashboard', book.sheets.Dashboard.get(1, 1) !== 'Proposals Dashboard', String(book.sheets.Dashboard.get(1, 1)));
truthy('Proposals owns its own tab', book.sheets['Proposal Dashboard'].get(1, 1) === 'Proposals Dashboard',
  String(book.sheets['Proposal Dashboard'].get(1, 1)));

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

console.log('=== the three daily emails can all run on the same sheet ===');
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
 ['proposals dailyProposalCheck', () => api.dailyProposalCheck()]].forEach(([name, fn]) => {
  try { fn(); } catch (e) { errs.push(name + ': ' + (e.message || e)); }
});
truthy('all three daily jobs run without throwing', errs.length === 0, errs.join(' | '));
eq('all three products mail on the same spreadsheet', mockMod.mailCalls.length, 3);
const subs = mockMod.mailCalls.map(m => m.subject).join('\n');
truthy('CRM reminder subject', /Follow-up|follow-up/.test(subs), subs);
truthy('Invoice overdue subject', /overdue/i.test(subs) && /INV-0001|1/.test(subs), subs);
truthy('Proposals subject', /Proposals:/.test(subs), subs);
// The real risk in a shared spreadsheet: one product refreshing its summary
// wipes another's. Refresh all three, then confirm each tab kept its own content.
api.updateDashboard();
api.refreshSummary();
api.prRefreshDashboard();
const crmDump = book.sheets.Dashboard.getDataRange().getValues().map(r => String(r[0])).join('\n');
const cashDump = book.sheets['Cash Flow'].getDataRange().getValues().map(r => String(r[0])).join('\n');
const propDump = book.sheets['Proposal Dashboard'].getDataRange().getValues().map(r => String(r[0])).join('\n');
truthy('CRM dashboard survived the other two', /Total Leads/.test(crmDump), crmDump.slice(0, 120));
truthy('cash-flow summary is on its own tab', /Cash Flow|Collected|Outstanding/.test(cashDump), cashDump.slice(0, 120));
truthy('cash-flow tab did not clobber the CRM tab', !/Outstanding/.test(crmDump));
truthy('proposals dashboard is on its own tab', /Open Proposals/.test(propDump), propDump.slice(0, 120));
truthy('three separate dashboards coexist',
  new Set([String(book.sheets.Dashboard.get(1, 1)), String(book.sheets['Cash Flow'].get(1, 1)),
           String(book.sheets['Proposal Dashboard'].get(1, 1))]).size === 3,
  [String(book.sheets.Dashboard.get(1, 1)), String(book.sheets['Cash Flow'].get(1, 1)),
   String(book.sheets['Proposal Dashboard'].get(1, 1))].join(' | '));

console.log('\n----------------------------------------');
console.log(`PASS ${pass}   FAIL ${fail}`);
process.exit(fail ? 1 : 0);
