// Renders the storefront with a tiny DOM stub to prove the catalogue, prices and
// buy buttons come out correct — including the case where a store URL is unset.
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const src = p => path.resolve(__dirname, '..', p);
const SITE = name => fs.readFileSync(src('site/' + name), 'utf8');

function el(attrs) {
  return {
    attrs: attrs || {}, _html: '', _text: '',
    set innerHTML(v) { this._html = v; }, get innerHTML() { return this._html; },
    set textContent(v) { this._text = v; }, get textContent() { return this._text; },
    addEventListener() {},
    getAttribute(k) { return this.attrs[k]; }
  };
}

// Load products.js + store.js against a DOM whose slots are all present.
function render(buyLinks) {
  const slots = {
    '[data-products]': el({ 'data-products': '' }),
    '[data-bundle]': el({ 'data-bundle': '' }),
    '[data-price]': el({ 'data-price': 'bundle' }),
    '[data-buy]': el({ 'data-buy': 'crm' }),
    '[data-year]': el({ 'data-year': '' })
  };
  const doc = {
    readyState: 'complete',
    addEventListener() {},
    querySelector: sel => slots[sel] || null,
    querySelectorAll: sel => (sel === '[data-unwired]' ? [] : slots[sel] ? [slots[sel]] : [])
  };
  const win = {};
  const ctx = vm.createContext({ window: win, document: doc, console });
  vm.runInContext(SITE('products.js'), ctx);
  Object.assign(win.BUY_LINKS, buyLinks || {});
  vm.runInContext(SITE('store.js'), ctx);
  return slots;
}

function readProducts() {
  const w = {};
  vm.runInContext(SITE('products.js'), vm.createContext({ window: w }));
  return w;
}

let pass = 0, fail = 0;
const t = (name, ok, detail) => {
  if (ok) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (detail ? '\n        ' + String(detail).slice(0, 300) : '')); }
};

console.log('=== unwired store (fresh clone state) ===');
const a = render();
const cards = (a['[data-products]'].innerHTML.match(/class="card"/g) || []).length;
const prodCount = JSON.parse(JSON.stringify({})); // placeholder
t('catalogue renders one card per product', cards === 4, 'got ' + cards);
t('bundle is not duplicated in the product grid', !/🧰/.test(a['[data-products]'].innerHTML));
t('bundle renders in its own slot', /🧰/.test(a['[data-bundle]'].innerHTML));
const names = ['CRM &amp; Sales Tracker Template', 'Small Business Prompt Pack',
  'Proposals &amp; Quotes Kit', 'Invoice &amp; Cash-Flow Kit'];
t('all product names appear, ampersands encoded', names.every(n => a['[data-products]'].innerHTML.includes(n)));
t('no raw & left in interpolated names', !/<h3>[^<]*&[^a]/.test(a['[data-products]'].innerHTML),
  (a['[data-products]'].innerHTML.match(/<h3>[^<]*<\/h3>/g) || []).join(' '));
t('detail pages are linked', ['crm.html', 'prompt-pack.html', 'proposals.html', 'invoice-kit.html'].every(p => a['[data-products]'].innerHTML.includes(p)));

const bundleHtml = a['[data-bundle]'].innerHTML + a['[data-price]'].innerHTML;
// Asserted against the config the pages actually render from, so a price change is
// a one-line edit rather than three failing tests.
const cfg = readProducts();
const inr = n => '₹' + n.toLocaleString('en-IN');
t('bundle shows its price against the sum of parts',
  bundleHtml.includes(inr(cfg.BUNDLE.price)) && bundleHtml.includes(inr(cfg.BUNDLE.was)), bundleHtml.slice(0, 200));
t('bundle advertises the real saving',
  new RegExp('Save ' + inr(cfg.BUNDLE.was - cfg.BUNDLE.price).replace('₹', '₹')).test(bundleHtml), bundleHtml.slice(0, 200));
cfg.PRODUCTS.forEach(p => t(p.id + ' price ₹' + p.price + ' appears in the catalogue',
  a['[data-products]'].innerHTML.includes(inr(p.price))));

const unwired = a['[data-buy]'].innerHTML;
t('unwired buy button is not a dead external link', !/href="https?:/.test(unwired), unwired);
t('unwired button names the exact config key to set', /BUY_LINKS\.crm/.test(unwired), unwired);
t('year is stamped', /^20\d\d$/.test(String(a['[data-year]'].textContent)), a['[data-year]'].textContent);

console.log('\n=== wired store (real Gumroad URLs) ===');
const b = render({ crm: 'https://you.gumroad.com/l/leadstack-crm', bundle: 'https://you.gumroad.com/l/starter-bundle' });
const crmBuy = b['[data-buy]'].innerHTML;
t('wired button points at the store URL', /href="https:\/\/you\.gumroad\.com\/l\/leadstack-crm"/.test(crmBuy), crmBuy);
t('external link opens in a new tab safely', /target="_blank"/.test(crmBuy) && /rel="noopener"/.test(crmBuy));
t('setup hint disappears once wired', !/BUY_LINKS\.crm/.test(crmBuy));
t('bundle button also wired', /starter-bundle/.test(b['[data-bundle]'].innerHTML));

console.log('\n=== injection safety in the catalogue ===');
const c = render();
const grid = c['[data-products]'].innerHTML;
t('no script tags emitted by the renderer', !/<script/i.test(grid));

// Verify the prices in products.js agree with the numbers used on the landing pages.
console.log('\n=== listing prices agree with the product pages ===');
const win2 = readProducts();
const parts = win2.PRODUCTS.reduce((s, p) => s + p.price, 0);
t('individual prices add up to the stated bundle baseline', parts === win2.BUNDLE.was, parts + ' vs ' + win2.BUNDLE.was);
t('bundle is cheaper than buying separately', win2.BUNDLE.price < win2.BUNDLE.was);
const ids = new Set(win2.PRODUCTS.map(p => p.id));
t('every bundle member is a real product', win2.BUNDLE.includes.every(i => ids.has(i)));
for (const p of win2.PRODUCTS) {
  const page = SITE(p.page);
  t(p.id + ' page exists and loads the shared scripts',
    page.includes('products.js') && page.includes('store.js') && page.includes('styles.css'));
}

// "N automated checks pass" is the one marketing claim on these pages that can
// rot silently: the number goes stale the day a suite is added or renamed. The
// counts come from tests/check-count.json, which run_tests.sh wipes and rewrites
// from the suites' own output, and tools/sync_check_claims.py stamps those numbers
// into the pages' <span data-checks="…"> markers before this test runs. So a page
// that oversells the build — by edit, by drift, or by a suite that stops being
// measured — fails here instead of shipping.
console.log('\n=== check-count claims match the measured run ===');
const countFile = src('tests/check-count.json');
if (!fs.existsSync(countFile)) {
  console.error('tests/check-count.json is missing — it is written by ./tests/run_tests.sh,\n' +
    'which is the only supported way to run this suite. Do not hand-write it.');
  process.exit(1);
}
const COUNTS = JSON.parse(fs.readFileSync(countFile, 'utf8'));
const catalogue = readProducts();
const sum = ids => ids.map(id => {
  if (!(id in COUNTS.suites)) throw new Error('suite not measured this run: ' + id);
  return COUNTS.suites[id];
}).reduce((s, n) => s + n, 0);

const want = {};
for (const [pid, ids] of Object.entries(catalogue.CHECK_SUITES)) {
  try { want[pid] = sum(ids); } catch (e) { t(pid + ' suites are all measured', false, e.message); }
}
try { want.all = sum(catalogue.CHECK_ALL); } catch (e) { t('CHECK_ALL suites are measured', false, e.message); }

const pageIds = new Set(['all']);
for (const file of fs.readdirSync(src('site')).filter(f => f.endsWith('.html'))) {
  const html = SITE(file);
  for (const m of html.matchAll(/data-checks="([a-z]+)">([\d,]+)</g)) {
    const [, pid, claimed] = m;
    pageIds.add(pid);
    const n = Number(claimed.replace(/,/g, ''));
    t(`${file} claims ${claimed} checks [${pid}]`, pid in want && want[pid] === n,
      pid in want ? `build measures ${want[pid]}` : 'no count configured for this id');
  }
}
t('every product with a suite has a claim somewhere',
  Object.keys(catalogue.CHECK_SUITES).every(pid => pageIds.has(pid)),
  [...Object.keys(catalogue.CHECK_SUITES)].filter(pid => !pageIds.has(pid)).join(', '));
t('CHECK_ALL covers every suite named in CHECK_SUITES',
  Object.values(catalogue.CHECK_SUITES).flat().every(s => catalogue.CHECK_ALL.includes(s)));
// The home page's catalogue-wide number covers product behaviour only, never the
// storefront meta-suite that is asserting it — otherwise the claim feeds on itself.
t('the catalogue claim excludes the storefront meta-suite',
  !catalogue.CHECK_ALL.some(s => /storefront/.test(s)) &&
  !Object.values(catalogue.CHECK_SUITES).flat().some(s => /storefront/.test(s)));

// store-listings.md is pasted into Gumroad by hand, so it cannot carry a marker to
// be rewritten — but a stale "195 automated checks" reads just as false there.
// Every count quoted in it must still be a number some page legitimately claims.
const listings = fs.readFileSync(src('store-listings.md'), 'utf8');
const valid = new Set(Object.values(want).map(String));
for (const m of listings.matchAll(/(\d[\d,]*) automated checks/g)) {
  t('store-listings quote of ' + m[1] + ' checks is current', valid.has(m[1].replace(/,/g, '')),
    'measured counts: ' + [...valid].join(', ') + ' — update store-listings.md');
}

console.log('\n----------------------------------------');
console.log(`PASS ${pass}   FAIL ${fail}`);
process.exit(fail ? 1 : 0);
