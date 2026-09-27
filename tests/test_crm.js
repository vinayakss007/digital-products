// Unit tests for crm-template/crm_script.gs — the follow-up engine, dashboard maths,
// stage moves and blank/edge rows.
const M = require('./mock.js'); const { Range } = M;
const { Sheet, Book } = M;

let pass = 0, fail = 0;
const eq = (n, g, w) => { const a = JSON.stringify(g), b = JSON.stringify(w);
  if (a === b) { pass++; console.log('  ok   ' + n); } else { fail++; console.log('  FAIL ' + n + '\n        got  ' + a + '\n        want ' + b); } };
const truthy = (n, v, d) => { if (v) { pass++; console.log('  ok   ' + n); } else { fail++; console.log('  FAIL ' + n + (d ? '\n        ' + d : '')); } };

const api = M.load(require('path').resolve(__dirname, process.argv[2] || '../crm-template/crm_script.gs'), ['CONFIG','setupTemplate','checkFollowUps','updateDashboard','moveToStage','logActivity','sendFollowUpEmail','onOpen','installTrigger','formatINR','isOpenLead','setStageTo_','logNoteForSelected']);
const C = api.CONFIG;

function fresh(leadRows) {
  const b = new Book({ Leads: new Sheet('Leads'), Activities: new Sheet('Activities'), Pipeline: new Sheet('Pipeline'), Dashboard: new Sheet('Dashboard'), Settings: new Sheet('Settings') });
  b.sheets.Settings.getRange('A1:B1').setValues([['Setting','Value']]);
  b.sheets.Settings.getRange('A2:B8').setValues([
    ['Your Email','me@t.com'],['Default Follow-up Days','3'],['Sales Target (Monthly ₹)','500000'],
    ['Currency','INR'],['Company Name','Co'],['Auto-Reminder Enabled','TRUE'],['Reminder Time (24h)','09:00']
  ]);
  const L = b.sheets.Leads;
  L.getRange(1, 1, 1, 17).setValues([Array.from({ length: 17 }, (_, i) => 'c' + i)]);
  leadRows.forEach((r, i) => L.getRange(i + 2, 1, 1, r.length).setValues([r]));
  M.setBook(b);
  return b;
}
const d = n => { const x = new Date(); x.setHours(0,0,0,0); x.setDate(x.getDate() + n); return x; };
// build a 17-col lead row matching CONFIG.leadColumns
const lead = (id, company, stage, value, expected, followUp, status) => {
  const r = new Array(17).fill('');
  r[0]=id; r[1]=company; r[2]='Contact'; r[3]=id.toLowerCase()+'@x.com';
  r[6]=stage; r[7]=value; r[8]=50; r[9]=expected; r[14]=d(-5); r[15]=followUp; r[16]=status;
  return r;
};

console.log('\n=== follow-up detection (the headline feature) ===');
const b1 = fresh([
  lead('L1','Overdue Co','Cold',50000,5000,d(-1),'Active'),
  lead('L2','Today Co','Proposal',200000,120000,d(0),'Active'),
  lead('L3','Future Co','Qualified',120000,48000,d(5),'Active'),
  lead('L4','Won Co','Closed Won',150000,150000,'N/A','Won'),
  lead('L5','Paused Co','Contacted',75000,15000,d(-3),'Inactive')
]);
M.reset();
api.checkFollowUps();
truthy('one reminder email sent', M.mailCalls.length === 1, JSON.stringify(M.mailCalls.map(m=>m.subject)));
const body = M.mailCalls[0] ? M.mailCalls[0].htmlBody : '';
truthy('overdue lead included', /Overdue Co/.test(body));
truthy('today lead included', /Today Co/.test(body));
truthy('future lead excluded', !/Future Co/.test(body));
truthy('won lead excluded', !/Won Co/.test(body));
truthy('inactive lead excluded', !/Paused Co/.test(body));
truthy('subject counts leads', /2 lead\(s\)/.test(M.mailCalls[0]?.subject || ''), M.mailCalls[0]?.subject);

console.log('\n=== status filter regression (was: Negotiating silently skipped) ===');
eq('Active is open', api.isOpenLead('Active'), true);
eq('Negotiating is open', api.isOpenLead('Negotiating'), true);
eq('blank counts as open (new lead)', api.isOpenLead(''), true);
eq('Won is closed', api.isOpenLead('Won'), false);
eq('Lost is closed', api.isOpenLead('Lost'), false);
eq('case/space insensitive', api.isOpenLead('  won '), false);
// real sample CSV statuses
fresh([lead('L4','Delta Corp','Proposal',200000,120000,d(-2),'Negotiating')]);
M.reset();
api.checkFollowUps();
truthy('Negotiating lead DOES get a reminder now', M.mailCalls.length === 1 && /Delta Corp/.test(M.mailCalls[0].htmlBody), JSON.stringify(M.mailCalls.map(m=>m.subject)));

console.log('\n=== email injection safety ===');
fresh([lead('L1','R&D <sales> & "Co"','Cold',1000,500,d(-1),'Active')]);
M.reset();
api.checkFollowUps();
const body2 = M.mailCalls[0] ? M.mailCalls[0].htmlBody : '';
truthy('ampersand and angle brackets escaped', /R&amp;D &lt;sales&gt; &amp; &quot;Co&quot;/.test(body2), body2.match(/<td>[^<]{0,60}/g)?.slice(0,3).join(' | '));
truthy('no raw markup from cell values', !/<sales>/.test(body2));

console.log('\n=== reminders disabled ===');
const b2 = fresh([lead('L1','A','Cold',1,1,d(-1),'Active')]);
b2.sheets.Settings.set(7, 2, 'FALSE'); // row 7 = 'Auto-Reminder Enabled'
M.reset();
api.checkFollowUps();
eq('no email when disabled', M.mailCalls.length, 0);

console.log('\n=== dashboard maths ===');
fresh([
  lead('L1','A','Cold',50000,5000,d(1),'Active'),
  lead('L2','B','Qualified',100000,40000,d(1),'Active'),
  lead('L3','C','Closed Won',150000,150000,'N/A','Won'),
  lead('L4','D','Closed Lost',40000,0,'N/A','Lost')
]);
api.updateDashboard();
const D = M.getBook().getSheetByName('Dashboard');
const grid = {};
for (let r = 1; r <= D.getLastRow(); r++) grid[String(D.get(r,1))] = [D.get(r,2), D.get(r,3)];
eq('total leads', Number(grid['Total Leads'][0]), 4);
eq('active leads', Number(grid['Active Leads'][0]), 2);
eq('pipeline uses expected value', grid['Pipeline Value (₹)'][0], '45,000');
eq('closed won uses face value', grid['Closed Won (₹)'][0], '1,50,000');
eq('avg deal size', grid['Avg Deal Size (₹)'][0], '75,000');
eq('conversion rate 1 win of 2 closed', grid['Conversion Rate'][0], '50.0%');
eq('lost count', Number(grid['Lost Deals'][0]), 1);

console.log('\n=== stage move ===');
const b3 = fresh([lead('L1','Moving Co','Cold',50000,5000,d(9),'Active')]);
M.reset();
api.moveToStage(2, 'Proposal');
const L = b3.sheets.Leads;
eq('stage updated', L.get(2, 7), 'Proposal');
eq('status stays Active', L.get(2, 17), 'Active');
truthy('follow-up pushed forward', new Date(L.get(2,16)) > d(0), String(L.get(2,16)));
truthy('activity logged', b3.sheets.Activities.get(2, 3) === 'Moved to Proposal', JSON.stringify(b3.sheets.Activities.getDataRange().getValues().slice(0,3)));
api.moveToStage(2, 'Closed Won');
eq('won sets status', L.get(2, 17), 'Won');
eq('won clears follow-up', L.get(2, 16), 'N/A');
truthy('dashboard refreshed after move', String(b3.sheets.Dashboard.get(1,1)) === 'KPI');

console.log('\n=== menu stage controls (the advertised one-click move) ===');
const b5 = fresh([lead('L9','Menu Co','Cold',90000,9000,d(9),'Active')]);
b5.sheets.Leads.getActiveRange = () => new Range(b5.sheets.Leads, 2, 1, 1, 1);
M.reset();
api.setStageProposal ? null : null;
api.setStageTo_('Proposal');
eq('menu move changed stage', b5.sheets.Leads.get(2,7), 'Proposal');
truthy('menu move shows confirmation', M.uiCalls.some(u=>/L9/.test(JSON.stringify(u))), JSON.stringify(M.uiCalls));
M.reset();
api.setStageTo_('Proposal');
truthy('same-stage move is a no-op with a message', b5.sheets.Leads.get(2,7)==='Proposal' && M.uiCalls.some(u=>/Already there/.test(JSON.stringify(u))), JSON.stringify(M.uiCalls).slice(0,160));
M.reset();
api.logNoteForSelected();
const noteRow = [2,3].find(r => String(b5.sheets.Activities.get(r,3)) === 'Note');
truthy('log note writes an activity row', noteRow && /Friday/.test(String(b5.sheets.Activities.get(noteRow,4))), JSON.stringify(b5.sheets.Activities.getDataRange().getValues()));
truthy('logging stamps last-contacted', String(b5.sheets.Leads.get(2,15)).length > 4);
M.reset();
api.onOpen();
truthy('onOpen builds the menu without throwing', true);

console.log('\n=== blank trailing rows (formulas/formatting leave empties) ===');
const realRows = [lead('L1','Real Co','Cold',50000,5000,d(-1),'Active')];
const blanks = [['','','','','','','','','','','','','','','','','']];
fresh(realRows.concat(blanks, blanks.map(b => b.slice()), [blank()]));
function blank(){ const r=new Array(17).fill(''); return r; }
api.updateDashboard();
const D2 = M.getBook().getSheetByName('Dashboard');
const g2 = {};
for (let r = 1; r <= D2.getLastRow(); r++) g2[String(D2.get(r,1))] = [D2.get(r,2), D2.get(r,3)];
eq('blank rows not counted in total leads', Number(g2['Total Leads'][0]), 1);
eq('blank rows not counted as active', Number(g2['Active Leads'][0]), 1);
M.reset();
api.checkFollowUps();
truthy('checkFollowUps ignores blanks', M.mailCalls.length === 1 && !/(,,|undefined)/.test(M.mailCalls[0].htmlBody), JSON.stringify(M.mailCalls.map(m=>m.subject)));

console.log('\n=== empty sheet ===');
fresh([]);
let err = null;
try { api.updateDashboard(); } catch (e) { err = String(e.message || e); }
truthy('updateDashboard survives zero leads', err === null, err);
err = null;
try { api.checkFollowUps(); } catch (e) { err = String(e.message || e); }
truthy('checkFollowUps survives zero leads', err === null, err);

console.log('\n----------------------------------------');
console.log(`PASS ${pass}   FAIL ${fail}`);
process.exit(fail ? 1 : 0);
