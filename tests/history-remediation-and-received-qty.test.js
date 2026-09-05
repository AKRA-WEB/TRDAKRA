const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

console.log('======================================================================');
console.log('  TEST SUITE: TRDAKRA HISTORY REMEDIATION & RECEIVED QTY INVARIANTS   ');
console.log('======================================================================\n');

const indexHtmlPath = path.join(__dirname, '..', 'index.html');
const versionJsonPath = path.join(__dirname, '..', 'version.json');
const indexHtml = fs.readFileSync(indexHtmlPath, 'utf8');
const versionJson = JSON.parse(fs.readFileSync(versionJsonPath, 'utf8'));

// 1. Version Parity
console.log('--- TEST 1: Version Parity ---');
assert.strictEqual(
  versionJson.version,
  '20260905.01',
  'version.json must be 20260905.01'
);
assert(
  indexHtml.includes(`const CURRENT_VERSION = "${versionJson.version}";`),
  `index.html CURRENT_VERSION must match version.json (${versionJson.version})`
);
console.log(`[PASS] Version parity verified: ${versionJson.version}\n`);

// 2. Inline Scripts Compilation
console.log('--- TEST 2: Inline Scripts Compilation (Strict VM) ---');
const scriptMatches = [...indexHtml.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)];
assert(scriptMatches.length > 0, 'index.html must contain scripts');

let mainScriptCode = '';
scriptMatches.forEach((m, idx) => {
  const code = m[1].trim();
  if (code) {
    new vm.Script(code, { filename: `trdakra-script-${idx}.js` });
    if (code.includes('function getActualReceivedQty')) {
      mainScriptCode = code;
    }
  }
});
assert(mainScriptCode.length > 0, 'Main script containing getActualReceivedQty must exist');
console.log('[PASS] All inline scripts compiled successfully with zero syntax errors\n');

// 3. Functional Execution of getActualReceivedQty in VM Context
console.log('--- TEST 3: Executing getActualReceivedQty in Runtime VM Context ---');

// Set up browser/DOM globals in VM context
const storage = {};
const sandbox = {
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
  parseInt,
  parseFloat,
  isNaN,
  localStorage: {
    getItem(k) { return Object.prototype.hasOwnProperty.call(storage, k) ? storage[k] : null; },
    setItem(k, v) { storage[k] = String(v); },
    removeItem(k) { delete storage[k]; }
  },
  sessionStorage: {
    getItem(k) { return Object.prototype.hasOwnProperty.call(storage, k) ? storage[k] : null; },
    setItem(k, v) { storage[k] = String(v); },
    removeItem(k) { delete storage[k]; }
  },
  document: {
    getElementById() { return null; },
    addEventListener() {},
    createElement() { return {}; }
  },
  window: {
    addEventListener() {},
    location: { href: 'http://localhost' }
  },
  location: { href: 'http://localhost' },
  performance: { now: () => Date.now() },
  state: { items: [], products: [] }
};
sandbox.window.localStorage = sandbox.localStorage;
sandbox.window.sessionStorage = sandbox.sessionStorage;
sandbox.window.document = sandbox.document;

vm.createContext(sandbox);

// Execute actual main inline script
vm.runInContext(mainScriptCode, sandbox);
const { getActualReceivedQty } = sandbox;
assert.strictEqual(typeof getActualReceivedQty, 'function', 'getActualReceivedQty must be a function');

// Scenario A: Legitimate recheck with non-zero count
const recheckPartial = {
  id: 'TEST-1',
  itemName: 'สินค้า A',
  requestQty: 20,
  receiveQty: 20,
  recheckQty: 18,
  recheckBy: 'YONG',
  recheckAt: '02-07-2569 / 13:29 น.'
};
assert.strictEqual(getActualReceivedQty(recheckPartial), 18, 'Must return recheckQty (18) when recheck was performed');

// Scenario B: Legitimate recheck with 0 count (goods rejected or not received)
const recheckZero = {
  id: 'TEST-2',
  itemName: 'สินค้า B',
  requestQty: 10,
  receiveQty: 10,
  recheckQty: 0,
  recheckBy: 'Inspector',
  recheckAt: '03-07-2569 / 10:00 น.'
};
assert.strictEqual(getActualReceivedQty(recheckZero), 0, 'Must return 0 when recheckBy confirms 0 received');

// Scenario C (CRITICAL BUG FIX): Unrechecked item with PostgreSQL DEFAULT 0 for recheck_qty
const unrecheckedWithDbDefaultZero = {
  id: 'TEST-3',
  itemName: 'สินค้า C',
  requestQty: 50,
  receiveQty: 35,
  recheckQty: 0, // database default 0
  recheckBy: null,
  recheckAt: null
};
assert.strictEqual(
  getActualReceivedQty(unrecheckedWithDbDefaultZero),
  35,
  'CRITICAL BUG FIX: Unrechecked item with default recheckQty=0 must fallback to receiveQty (35), NOT 0'
);

// Scenario D: Legacy row with recheckQty null/undefined
const legacyItem = {
  id: 'TEST-4',
  itemName: 'สินค้า D',
  requestQty: 10,
  receiveQty: 10,
  recheckQty: null
};
assert.strictEqual(getActualReceivedQty(legacyItem), 10, 'Legacy item with recheckQty null must return receiveQty (10)');

// Scenario E: Legacy row without receiveQty (falls back to requestQty)
const legacyNoRecv = {
  id: 'TEST-5',
  itemName: 'สินค้า E',
  requestQty: 15,
  receiveQty: null,
  recheckQty: 0,
  recheckBy: null
};
assert.strictEqual(getActualReceivedQty(legacyNoRecv), 15, 'Legacy item without receiveQty must fallback to requestQty (15)');

console.log('[PASS] All 5 getActualReceivedQty invariant scenarios passed 100%\n');

// 4. Invariant: History Filter Inclusions
console.log('--- TEST 4: History Filter and Dispatch Invariants ---');
const { getFilteredHistory, getLastDispatchInfo } = sandbox;

assert(typeof getFilteredHistory === 'function', 'getFilteredHistory must be a function');
assert(typeof getLastDispatchInfo === 'function', 'getLastDispatchInfo must be a function');

// Populate test items with various statuses inside the VM context
vm.runInContext(`
  state.items = [
    { id: 'H-1', itemName: 'แป้ง A', status: 'จัดส่งแล้ว', rawDate: new Date('2026-09-04T10:00:00Z'), dispatchTimestamp: '04-09-2569 / 10:00 น.' },
    { id: 'H-2', itemName: 'แป้ง B', status: 'รับสินค้าแล้ว', rawDate: new Date('2026-09-04T11:00:00Z'), dispatchTimestamp: '04-09-2569 / 11:00 น.' },
    { id: 'H-3', itemName: 'แป้ง C', status: 'จัดส่งไม่ครบ', rawDate: new Date('2026-09-04T12:00:00Z'), dispatchTimestamp: '04-09-2569 / 12:00 น.' },
    { id: 'H-4', itemName: 'แป้ง D', status: 'ยกเลิกรายการ', rawDate: new Date('2026-09-04T13:00:00Z'), dispatchTimestamp: '04-09-2569 / 13:00 น.' },
    { id: 'H-5', itemName: 'แป้ง E', status: 'รอตรวจรับ', rawDate: new Date('2026-09-04T14:00:00Z'), dispatchTimestamp: '04-09-2569 / 14:00 น.' },
    { id: 'H-6', itemName: 'แป้ง F', status: 'สั่งเบิก', rawDate: new Date('2026-09-04T15:00:00Z') }
  ];
`, sandbox);

const historyResult = getFilteredHistory();
const historyIds = historyResult.map(i => i.id);

assert(historyIds.includes('H-1'), 'Must include จัดส่งแล้ว');
assert(historyIds.includes('H-2'), 'Must include รับสินค้าแล้ว');
assert(historyIds.includes('H-3'), 'Must include จัดส่งไม่ครบ');
assert(historyIds.includes('H-4'), 'Must include ยกเลิกรายการ');
assert(historyIds.includes('H-5'), 'Must include รอตรวจรับ in History');
assert(!historyIds.includes('H-6'), 'Must NOT include สั่งเบิก in History');

console.log('[PASS] History filter correctly includes รอตรวจรับ and excludes active สั่งเบิก');

// Test getLastDispatchInfo for รอตรวจรับ and จัดส่งไม่ครบ
const lastDispE = getLastDispatchInfo('แป้ง E');
assert(lastDispE !== null, 'getLastDispatchInfo must recognize รอตรวจรับ as dispatched');

const lastDispC = getLastDispatchInfo('แป้ง C');
assert(lastDispC !== null, 'getLastDispatchInfo must recognize จัดส่งไม่ครบ as dispatched');

console.log('[PASS] getLastDispatchInfo correctly recognizes รอตรวจรับ and จัดส่งไม่ครบ\n');

console.log('🌟 ALL HISTORY REMEDIATION AND RECEIVED QTY TESTS PASSED 100%! 🌟');
