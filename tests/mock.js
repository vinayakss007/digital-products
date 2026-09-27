// Test harness for invoice-kit/invoice_script.gs — mocks the Apps Script runtime.
const fs = require('fs');
const vm = require('vm');

class Range {
  constructor(sheet, a, b, nR, nC) {
    this.s = sheet;
    if (typeof a === 'string') {
      // A1 notation, e.g. 'A2:B10' or 'A1'
      const cell = t => { const m = /^([A-Z]+)(\d+)$/.exec(t); const col = m[1].split('').reduce((x, ch) => x * 26 + ch.charCodeAt(0) - 64, 0); return { r: +m[2], c: col }; };
      const [f, l] = a.split(':'); const start = cell(f); const end = cell(l || f);
      this.r = start.r; this.c = start.c; this.nR = end.r - start.r + 1; this.nC = end.c - start.c + 1;
    } else { this.r = a; this.c = b; this.nR = nR || 1; this.nC = nC || 1; }
  }
  getValues() {
    const out = [];
    for (let i = 0; i < this.nR; i++) {
      const row = [];
      for (let j = 0; j < this.nC; j++) row.push(this.s.get(this.r + i, this.c + j));
      out.push(row);
    }
    return out;
  }
  getValue() { return this.getValues()[0][0]; }
  setValues(v) {
    if (!Array.isArray(v)) throw new TypeError('setValues expects a 2-D array');
    // Apps Script rejects shape mismatches; mimic it so tests catch real bugs.
    if (v.length !== this.nR) {
      throw new Error('The number of rows in the provided data does not match the range (' +
        v.length + ' vs ' + this.nR + ') on ' + this.s.name + '!' + this.r + ':' + (this.r + this.nR - 1));
    }
    v.forEach((row, i) => {
      if (!Array.isArray(row) || row.length !== this.nC) {
        throw new Error('The number of columns in the provided data does not match the range (' +
          ((row || []).length) + ' vs ' + this.nC + ') at row ' + (this.r + i));
      }
      row.forEach((val, j) => this.s.set(this.r + i, this.c + j, val));
    });
    return this;
  }
  setValue(v) { return this.setValues([[v]]); }
  setFontWeight() { return this; }
  setNumberFormat() { return this; }
  setFontColor() { return this; }
  getRow() { return this.r; }
  getColumn() { return this.c; }
}

class Sheet {
  constructor(name) { this.name = name; this.grid = {}; }
  key(r, c) { return r + ':' + c; }
  get(r, c) { return this.grid[this.key(r, c)] === undefined ? '' : this.grid[this.key(r, c)]; }
  set(r, c, v) { this.grid[this.key(r, c)] = v; }
  getRange(a, b, c, d) { return new Range(this, a, b, c, d); }
  clear() { this.grid = {}; return this; }
  getLastRow() { return Object.keys(this.grid).reduce((m, k) => Math.max(m, +k.split(':')[0]), 0); }
  getLastColumn() { return Object.keys(this.grid).reduce((m, k) => Math.max(m, +k.split(':')[1]), 0); }
  getDataRange() { return new Range(this, 1, 1, Math.max(this.getLastRow(), 1), Math.max(this.getLastColumn(), 1)); }
  appendRow(vals) { const r = this.getLastRow() + 1; vals.forEach((v, j) => this.set(r, j + 1, v)); return this; }
  // Record the row so tests can drive "select this row then use the menu".
  setActiveRange(range) { this._activeRow = range && range.getRow ? range.getRow() : this._activeRow; return this; }
  getActiveRange() { return new Range(this, this._activeRow || 2, 1, 1, 1); }
  setName() { return this; }
  insertRowsBefore(at, n) { const shift={}; Object.keys(this.grid).forEach(k=>{const[r,c]=k.split(':').map(Number); if(r>=at) shift[(r+n)+':'+c]=this.grid[k]; else shift[k]=this.grid[k];}); this.grid=shift; return this; }
}

class Book {
  constructor(sheets) { this.sheets = sheets || {}; }
  getSheetByName(n) { return this.sheets[n] || null; }
  insertSheet(n) { this.sheets[n] = new Sheet(n); return this.sheets[n]; }
  getName() { return 'Test Book'; }
}

// ── Clock control ───────────────────────────────────────────────────────────
// Product scripts call new Date() to decide what is overdue or expiring, so a
// suite that runs next month would contradict sample data dated today. Tests
// can freeze the clock inside the sandbox and build fixtures off M.days().
const RealDate = Date;
let clockBase = null;
class FrozenDate extends RealDate {
  // With no clock pinned, behave exactly like the real Date.
  constructor(...a) { if (a.length === 0) super(clockBase === null ? RealDate.now() : clockBase); else super(...a); }
  static now() { return clockBase === null ? RealDate.now() : clockBase; }
}
function freezeClock(iso) { clockBase = new RealDate(iso + 'T09:00:00').getTime(); return clockBase; }
function baseDays(n) {
  const d = new RealDate(clockBase === null ? Date.now() : clockBase);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + n);
  return d;
}

const uiCalls = [];
const mailCalls = [];
const driveFiles = [];
const menus = [];
// Flatten a recorded menu into "Top > Child" captions and the function names bound to them.
function flattenMenu(node, prefix) {
  const out = [];
  (node.items || []).forEach(item => {
    const path = (prefix ? prefix + ' > ' : '') + item.caption;
    if (item.sub) out.push(...flattenMenu(item.sub, path));
    else out.push({ path: path, fn: item.fn });
  });
  return out;
}
const SpreadsheetApp = {
  _book: null,
  getActiveSpreadsheet() { return SpreadsheetApp._book; },
  getUi() {
    return {
      alert: (...a) => uiCalls.push(['alert', ...a.map(String)]),
      createMenu: label => {
        const node = { label: String(label), items: [] };
        const m = () => node;
        node.addItem = (cap, fn) => { node.items.push({ caption: String(cap), fn: String(fn) }); return node; };
        node.addSeparator = () => node;
        node.addSubMenu = sub => { node.items.push({ caption: String(sub.label), sub: sub }); return node; };
        node.addToUi = () => { menus.push(node); };
        return node;
      },
      prompt: () => ({ getSelectedButton: () => 'ok', getResponseText: () => 'Called, wants proposal Friday' }),
      ButtonSet: { OK_CANCEL: 'ok_cancel' }, Button: { OK: 'ok', CANCEL: 'cancel' },
      confirm: () => 'yes',
      modalPrompt: (...a) => uiCalls.push(['modal', String(a[0]).slice(0, 400)]),
      YES: 'yes', NO: 'no'
    };
  }
};
const MailApp = { sendEmail: o => mailCalls.push(o) };
const Session = { getActiveUser: () => ({ getEmail: () => 'me@test.com' }), getScriptTimeZone: () => 'Asia/Kolkata' };
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const Utilities = {
  formatDate: (d, tz, fmt) => {
    if (fmt === 'yyyy-MM') return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
    return String(d.getDate()).padStart(2, '0') + ' ' + MONTHS[d.getMonth()] + ' ' + d.getFullYear();
  },
  newBlob: (data, type, name) => {
    // Real Blob: getAs() -> Blob, setName() -> Blob, setContentType() -> Blob
    const mk = n => ({
      name: n, data,
      getAs: t => mk(n),
      setName: nn => mk(nn),
      setContentType: t => mk(n),
      copyBlob() { return mk(n); }
    });
    return mk(name);
  }
};
const DriveApp = {
  getFolderById: () => ({ getId: () => 'F1', createFile: b => { driveFiles.push(b); return { getUrl: () => 'https://drive/' + b.name }; } }),
  createFolder: n => ({ getId: () => 'F1', createFile: b => { driveFiles.push(b); return { getUrl: () => 'https://drive/' + b.name }; } })
};
const PropertiesService = { getUserProperties: () => { const s = {}; return { getProperty: k => s[k], setProperty: (k, v) => { s[k] = v; } }; } };
const ScriptApp = { getProjectTriggers: () => [], newTrigger: () => ({ timeBased: () => ({ everyDays: () => ({ atHour: () => ({ create: () => {} }) }) }) }) };



module.exports = { Sheet, Book, Range, menus, flattenMenu,
  get calls(){return {uiCalls, mailCalls, driveFiles};},
  reset(){ uiCalls.length=0; mailCalls.length=0; driveFiles.length=0; menus.length=0; },
  uiCalls, mailCalls, driveFiles,
  days: baseDays, freezeClock,
  load(src, exports){
    const wrapped = '(function(){' + require('fs').readFileSync(src,'utf8') + '\nreturn {' + exports.join(',') + '};})()';
    const ctx = vm.createContext({ SpreadsheetApp, MailApp, Session, Utilities, DriveApp, PropertiesService, ScriptApp,
      console, Number, Date: FrozenDate, Math, JSON, String, Array, Object, isNaN, parseInt, parseFloat, RegExp, Error });
    return vm.runInContext(wrapped, ctx, { filename: src });
  },

  setBook(b){ SpreadsheetApp._book = b; },
  getBook(){ return SpreadsheetApp._book; }
};
