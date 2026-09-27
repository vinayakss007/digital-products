// Drives the shipped CRM sample CSV through crm_script.gs and asserts the
// dashboard and reminder email match what the listing promises.
const M=require('./mock.js'); const {Sheet,Book}=M; const fs=require('fs');
const api=M.load('../crm-template/crm_script.gs',
 ['CONFIG','setupTemplate','checkFollowUps','updateDashboard','isOpenLead']);
function parseCSV(t){const rows=[];let f=[],c='',q=false;for(let i=0;i<t.length;i++){const ch=t[i];
 if(q){if(ch==='"'){if(t[i+1]==='"'){c+='"';i++;}else q=false;}else c+=ch;}
 else if(ch==='"')q=true; else if(ch===','){f.push(c);c='';} else if(ch==='\n'){f.push(c);rows.push(f);f=[];c='';} else if(ch==='\r'){} else c+=ch;}
 if(c!==''||f.length){f.push(c);rows.push(f);} return rows.filter(r=>r.length>1);}
const b=new Book({Leads:new Sheet('Leads'),Activities:new Sheet('Activities'),Pipeline:new Sheet('Pipeline'),Dashboard:new Sheet('Dashboard'),Settings:new Sheet('Settings')});
const rows=parseCSV(fs.readFileSync('../crm-template/Sheet1_Leads.csv','utf8'));
rows.forEach((r,i)=>{const conv=r.map((v,j)=>{
  if((j===13||j===14||j===15)&&/^\d{4}-\d{2}-\d{2}$/.test(v)) return new Date(v+'T00:00:00');
  if(j===7||j===8||j===9){const n=Number(v); return isNaN(n)?v:n;} return v.startsWith(' ')?v.slice(1):v;});
  b.sheets.Leads.getRange(i+1,1,1,conv.length).setValues([conv]);});
b.sheets.Settings.getRange('A1:B1').setValues([['Setting','Value']]);
b.sheets.Settings.getRange('A2:B8').setValues([['Your Email','me@t.com'],['Default Follow-up Days','3'],['Sales Target','500000'],['Currency','INR'],['Company','Co'],['Auto-Reminder Enabled','TRUE'],['Reminder Time','09:00']]);
M.setBook(b);
let pass=0,fail=0;const eq=(n,g,w)=>{const a=JSON.stringify(g),x=JSON.stringify(w);if(a===x){pass++;console.log('  ok   '+n);}else{fail++;console.log('  FAIL '+n+'\n        got  '+a+'\n        want '+x);}};const truthy=(n,v,d)=>{if(v){pass++;console.log('  ok   '+n);}else{fail++;console.log('  FAIL '+n+(d?'\n        '+d:''));}};
console.log('=== shipped CRM CSV parses through the script ===');
eq('7 sample leads loaded',b.sheets.Leads.getDataRange().getValues().length-1,7);
const C=api.CONFIG;
const leads=b.sheets.Leads.getDataRange().getValues().slice(1);
eq('L004 status Negotiating is treated as open',api.isOpenLead(leads[3][C.leadColumns.status]),true);
eq('L006 status Won is closed',api.isOpenLead(leads[5][C.leadColumns.status]),false);
api.updateDashboard();
const D=b.getSheetByName('Dashboard'); const g={};
for(let r=1;r<=D.getLastRow();r++) g[String(D.get(r,1))]=[D.get(r,2),D.get(r,3)];
console.log('  dashboard:',JSON.stringify(g).slice(0,400));
const openSum=leads.filter(r=>api.isOpenLead(r[C.leadColumns.status])).reduce((s,r)=>s+(Number(r[C.leadColumns.expectedValue])||0),0);
eq('Total Leads',Number(g['Total Leads'][0]),7);
eq('Active Leads counts open statuses',Number(g['Active Leads'][0]),5);
eq('Pipeline Value uses en-IN grouping',g['Pipeline Value (₹)'][0],openSum.toLocaleString('en-IN'));
eq('Closed Won total',g['Closed Won (₹)'][0],(150000).toLocaleString('en-IN'));
M.reset(); api.checkFollowUps();
truthy('reminder email fires for sample data',M.mailCalls.length===1,JSON.stringify(M.mailCalls.map(m=>m.subject)));
const body=M.mailCalls[0]?M.mailCalls[0].htmlBody:'';
truthy('overdue sample leads named',/Acme Corp|Delta Corp|Epsilon Inc/.test(body));
truthy('won lead excluded',!/Zeta Ltd/.test(body));
truthy('lost lead excluded',!/Eta Services/.test(body));
console.log('\n-----------------------------');console.log(`PASS ${pass}  FAIL ${fail}`);process.exit(fail?1:0);
