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
    v.forEach((row, i) => row.forEach((val, j) => this.s.set(this.r + i, this.c + j, val)));
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
  setActiveRange() { this._active = true; return this; }
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

const uiCalls = [];
const mailCalls = [];
const driveFiles = [];
const SpreadsheetApp = {
  _book: null,
  getActiveSpreadsheet() { return SpreadsheetApp._book; },
  getUi() {
    return {
      alert: (...a) => uiCalls.push(['alert', ...a.map(String)]),
      createMenu: () => { const m = () => ({ addItem: m, addSeparator: m, addSubMenu: m, addToUi: () => {} }); return m(); },
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



module.exports = { Sheet, Book, Range, get calls(){return {uiCalls, mailCalls, driveFiles};},
  reset(){ uiCalls.length=0; mailCalls.length=0; driveFiles.length=0; },
  uiCalls, mailCalls, driveFiles,
  load(src, exports){
    const wrapped = '(function(){' + require('fs').readFileSync(src,'utf8') + '\nreturn {' + exports.join(',') + '};})()';
    const ctx = vm.createContext({ SpreadsheetApp, MailApp, Session, Utilities, DriveApp, PropertiesService, ScriptApp,
      console, Number, Date, Math, JSON, String, Array, Object, isNaN, parseInt, parseFloat, RegExp, Error });
    return vm.runInContext(wrapped, ctx, { filename: src });
  },
  setBook(b){ SpreadsheetApp._book = b; },
  getBook(){ return SpreadsheetApp._book; }
};
