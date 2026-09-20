const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const scripts = [...source.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)]
  .map(match => match[1].trim())
  .filter(Boolean);
const mainScript = scripts.find(code => code.includes('function renderW2'));
assert.ok(mainScript, 'TRDAKRA main script must contain renderW2');

const storage = new Map();
const node = () => ({
  style: {},
  hidden: false,
  innerHTML: '',
  textContent: '',
  classList: { add() {}, remove() {} },
  addEventListener() {}
});
const document = {
  getElementById: () => node(),
  addEventListener() {},
  createElement: () => node(),
  querySelector: () => null,
  querySelectorAll: () => []
};
const window = {
  addEventListener() {},
  location: { search: '', hostname: 'localhost', pathname: '/TRDAKRA/' },
  history: { replaceState() {} }
};
window.document = document;

const context = vm.createContext({
  console,
  Date,
  JSON,
  Math,
  Object,
  String,
  Array,
  Number,
  RegExp,
  Set,
  Map,
  URLSearchParams,
  parseInt,
  parseFloat,
  isNaN,
  document,
  window,
  location: window.location,
  localStorage: {
    getItem: key => storage.get(key) || null,
    setItem: (key, value) => storage.set(key, String(value)),
    removeItem: key => storage.delete(key)
  },
  sessionStorage: {
    getItem: key => storage.get(key) || null,
    setItem: (key, value) => storage.set(key, String(value)),
    removeItem: key => storage.delete(key)
  },
  performance: { now: () => Date.now() },
  fetch: async () => ({ ok: true, json: async () => ({ items: [] }) }),
  alert() {},
  confirm: () => true,
  setTimeout,
  clearTimeout
});

vm.runInContext(mainScript, context, { filename: 'trdakra-main.js' });
vm.runInContext(`
  state.view = 'w2';
  state.w2Tab = 'tasks';
  state.fullHistoryLoaded = true;
  state.items = [
    { id: 'RECENT-PENDING', itemName: 'รายการปัจจุบัน', requestQty: 1, status: 'สั่งเบิก', rawDate: new Date('2026-09-20T08:00:00Z') },
    { id: 'OLD-PENDING', itemName: 'รายการค้างเก่า', requestQty: 1, status: 'สั่งเบิก', rawDate: new Date('2026-01-01T08:00:00Z') }
  ];
  state.activeItemIds = new Set(['RECENT-PENDING']);
  state.activeItemsReady = true;
`, context);

const rendered = vm.runInContext('renderW2()', context);
assert.match(rendered, /รายการปัจจุบัน/, 'current pending item must remain visible');
assert.doesNotMatch(rendered, /รายการค้างเก่า/, 'old full-history pending item must not re-enter the dispatch queue');

console.log('PASS TRDAKRA: full history does not inflate the current dispatch queue');
