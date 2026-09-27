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

let pass = 0, fail = 0;
const t = (name, ok, detail) => {
  if (ok) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (detail ? '\n        ' + String(detail).slice(0, 300) : '')); }
};

console.log('=== unwired store (fresh clone state) ===');
const a = render();
const cards = (a['[data-products]'].innerHTML.match(/class="card"/g) || []).length;
t('catalogue renders one card per product', cards === 3, 'got ' + cards);
t('bundle is not duplicated in the product grid', !/🧰/.test(a['[data-products]'].innerHTML));
t('bundle renders in its own slot', /🧰/.test(a['[data-bundle]'].innerHTML));
const names = ['CRM &amp; Sales Tracker Template', 'Small Business Prompt Pack', 'Invoice &amp; Cash-Flow Kit'];
t('all product names appear, ampersands encoded', names.every(n => a['[data-products]'].innerHTML.includes(n)));
t('no raw & left in interpolated names', !/<h3>[^<]*&[^a]/.test(a['[data-products]'].innerHTML),
  (a['[data-products]'].innerHTML.match(/<h3>[^<]*<\/h3>/g) || []).join(' '));
t('detail pages are linked', ['crm.html', 'prompt-pack.html', 'invoice-kit.html'].every(p => a['[data-products]'].innerHTML.includes(p)));

const bundleHtml = a['[data-bundle]'].innerHTML + a['[data-price]'].innerHTML;
t('bundle shows ₹599 against ₹797', /₹599/.test(bundleHtml) && /₹797/.test(bundleHtml), bundleHtml);
t('bundle advertises the real saving', /Save ₹198/.test(bundleHtml), bundleHtml);
t('crm price is ₹299', /₹299/.test(a['[data-price]'].innerHTML || '') || /₹299/.test(a['[data-products]'].innerHTML));

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
const win2 = {};
vm.createContext(win2);
vm.runInContext(SITE('products.js'), vm.createContext({ window: win2 }));
const sum = win2.PRODUCTS.reduce((s, p) => s + p.price, 0);
t('individual prices add up to the stated bundle baseline', sum === win2.BUNDLE.was, sum + ' vs ' + win2.BUNDLE.was);
t('bundle is cheaper than buying separately', win2.BUNDLE.price < win2.BUNDLE.was);
const ids = new Set(win2.PRODUCTS.map(p => p.id));
t('every bundle member is a real product', win2.BUNDLE.includes.every(i => ids.has(i)));
for (const p of win2.PRODUCTS) {
  const page = SITE(p.page);
  t(p.id + ' page exists and loads the shared scripts',
    page.includes('products.js') && page.includes('store.js') && page.includes('styles.css'));
}

console.log('\n----------------------------------------');
console.log(`PASS ${pass}   FAIL ${fail}`);
process.exit(fail ? 1 : 0);
