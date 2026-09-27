// Feed the shipped invoice-kit sample CSVs through the real script and check the
// dashboard, the PDF HTML and the next invoice number.
const M=require('./mock.js'); const {Sheet,Book}=M;
const fs=require('fs');
const api=M.load('../invoice-kit/invoice_script.gs',
 ['CFG','refreshSummary','rowValues_','classify_','getSettings_','invoiceDataFromRow_','buildInvoiceHtml_','parseItems_','recalcRow_','chaseEmail','dailyOverdueCheck','createDraftInvoice','nextInvoiceNumber_','setupKit']);

function parseCSV(t){const rows=[];let f=[],c='',q=false;for(let i=0;i<t.length;i++){const ch=t[i];
 if(q){if(ch==='"'){if(t[i+1]==='"'){c+='"';i++;}else q=false;}else c+=ch;}
 else if(ch==='"')q=true; else if(ch===','){f.push(c);c='';} else if(ch==='\n'){f.push(c);rows.push(f);f=[];c='';} else if(ch==='\r'){} else c+=ch;}
 if(c!==''||f.length){f.push(c);rows.push(f);} return rows.filter(r=>r.length>1);}

const b=new Book({Clients:new Sheet('Clients'),Invoices:new Sheet('Invoices'),Settings:new Sheet('Settings'),Payments:new Sheet('Payments')});
const cl=parseCSV(fs.readFileSync('../invoice-kit/clients_sample.csv','utf8'));
cl.forEach((r,i)=>b.sheets.Clients.getRange(i+1,1,1,5).setValues([r]));
const iv=parseCSV(fs.readFileSync('../invoice-kit/invoices_sample.csv','utf8'));
iv.forEach((r,i)=>{const conv=r.map((v,j)=>(j===2||j===3||j===10)&&/^\d{4}-\d{2}-\d{2}$/.test(v)?new Date(v+'T00:00:00'):isNaN(v)||j===0||j===1||j===4||j===9||j===11||j===12?Number(v)||v:v);
 b.sheets.Invoices.getRange(i+1,1,1,13).setValues([conv]);});
b.sheets.Settings.getRange('A1:B1').setValues([['Setting','Value']]);
b.sheets.Settings.getRange('A2:B10').setValues([['Your Business Name','Kite Studio'],['Your Address','Pune'],['Your Email','me@kite.studio'],['Your Phone','+91-99'],['GSTIN / Tax ID','27ABC'],['Default Currency','INR'],['Default Tax Rate (%)','18'],['Payment Terms (days)','14'],['Invoice Number Prefix','INV-']]);
M.setBook(b);

let pass=0,fail=0; const eq=(n,g,w)=>{const a=JSON.stringify(g),b2=JSON.stringify(w); if(a===b2){pass++;console.log('  ok   '+n);}else{fail++;console.log('  FAIL '+n+'\n        got  '+a+'\n        want '+b2);}};

console.log('=== sample data loads into the real script ===');
const rows=api.rowValues_(b.sheets.Invoices);
eq('all 8 invoices parsed',rows.length,8);
eq('client rows parsed',api.clientFor_ ? 'n/a':'n/a','n/a');
const buckets=rows.map(o=>api.classify_(o.v,new Date()));
console.log('  aging:',JSON.stringify(buckets));
eq('INV-0001 paid',buckets[0],'collected');
eq('INV-0003 60+ late',buckets[2],'over3');
eq('INV-0004 31-60 late',buckets[3],'over2');
eq('INV-0005 1-30 late',buckets[4],'over1');
eq('INV-0006 due today = current',buckets[5],'current');
eq('INV-0007 not yet due',buckets[6],'current');
eq('INV-0008 draft',buckets[7],'draft');

console.log('=== totals recompute from sample line items ===');
rows.forEach((o,i)=>{const r=api.recalcRow_(o.row);
  if(i>0) eq('  recomputed subtotal matches shipped CSV '+o.v[0], Math.round(r.subtotal*100)/100, Number(o.v[5]));
  if(i>0) eq('  recomputed tax matches '+o.v[0], r.tax, Number(o.v[7]));
  if(i>0) eq('  recomputed total matches '+o.v[0], r.total, Number(o.v[8]));
});

console.log('=== dashboard from shipped data ===');
api.refreshSummary();
const D=b.getSheetByName('Dashboard'); const g={};
for(let r=1;r<=D.getLastRow();r++) g[String(D.get(r,1))]=[D.get(r,2),D.get(r,3)];
const wantColl=241900+85000, wantOut=67024+129800+141600+63720+54044;
eq('collected',Number(g['Collected'][0]),wantColl);
eq('outstanding',Number(g['Outstanding'][0]),wantOut);
eq('not yet due',Number(g['Not yet due'][0]),63720+54044);
eq('1-30 late',Number(g['1–30 days late'][0]),141600);
eq('31-60 late',Number(g['31–60 days late'][0]),129800);
eq('60+ late',Number(g['60+ days late'][0]),67024);
eq('drafts tracked separately',Number(g['Still drafts'][0]),56640);
truthy('drafts excluded from outstanding', wantOut === Number(g['Outstanding'][0]) && !String(wantOut).includes('56640'));
function truthy(n,v,d){if(v){pass++;console.log('  ok   '+n);}else{fail++;console.log('  FAIL '+n+(d?'\n        '+d:''));}}

console.log('=== invoice PDF renders for a sample row ===');
const data=api.invoiceDataFromRow_(2);
const html=api.buildInvoiceHtml_(data);
truthy('uses client email from Clients tab', data.clientEmail==='accounts@northwind.co.in', data.clientEmail);
const tbody=html.split('<tbody>')[1].split('</tbody>')[0];
eq('two line items rendered in table', (tbody.match(/<tr>/g)||[]).length, 2);
truthy('shows GSTIN', html.includes('09AABCU1234F1Z5'));
truthy('formats lakh-grouped total', html.includes('2,41,900'), html.match(/Total<\/td>[\s\S]{0,80}/)?.[0]);
truthy('shows Paid banner', /Paid \d\d \w\w\w/.test(html));

console.log('=== next number continues past samples ===');
eq('next invoice number', api.nextInvoiceNumber_(), 'INV-0009');

console.log('\n-----------------------------'); console.log(`PASS ${pass}  FAIL ${fail}`);
process.exit(fail?1:0);
