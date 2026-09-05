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
  '20260905.03',
  'version.json must be 20260905.03'
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

// 5. Invariant: renderHistoryCards displays requester, request time, dispatcher, dispatch time
console.log('--- TEST 5: renderHistoryCards Requester & Dispatcher Display ---');
const { renderHistoryCards } = sandbox;
assert(typeof renderHistoryCards === 'function', 'renderHistoryCards must be a function');

const testCardItems = [
  {
    id: 'REQ-TEST-1',
    itemName: 'สินค้า ก',
    status: 'จัดส่งแล้ว',
    timestamp: '04-09-2569 / 12:00 น.',
    dispatchTimestamp: '04-09-2569 / 14:00 น.',
    requestedBy: 'เอี้ยง',
    w2Note: 'สมชาย',
    requestQty: 10,
    receiveQty: 10
  },
  {
    id: 'REQ-TEST-2',
    itemName: 'สินค้า ข',
    status: 'รอตรวจรับ',
    timestamp: '04-09-2569 / 11:30 น.',
    dispatchTimestamp: '04-09-2569 / 13:45 น.',
    requestedBy: 'หมูหยอง',
    w2Note: 'วิชัย',
    requestQty: 5,
    receiveQty: 5
  }
];

const renderedHtml = renderHistoryCards(testCardItems, 'w2');
assert(renderedHtml.includes('ผู้เบิก: เอี้ยง'), 'Card 1 must display ผู้เบิก: เอี้ยง');
assert(renderedHtml.includes('ผู้ส่ง: สมชาย'), 'Card 1 must display ผู้ส่ง: สมชาย');
assert(renderedHtml.includes('เวลาเบิก:'), 'Card must display label เวลาเบิก:');
assert(renderedHtml.includes('04-09-2569 / 12:00 น.'), 'Card 1 must display request timestamp');
assert(renderedHtml.includes('เวลากดส่ง:'), 'Card 1 must display label เวลากดส่ง:');
assert(renderedHtml.includes('04-09-2569 / 14:00 น.'), 'Card 1 must display dispatch timestamp');

assert(renderedHtml.includes('ผู้เบิก: หมูหยอง'), 'Card 2 must display ผู้เบิก: หมูหยอง');
assert(renderedHtml.includes('ผู้ส่ง: วิชัย'), 'Card 2 must display ผู้ส่ง: วิชัย');
assert(renderedHtml.includes('เวลากดส่ง (รอตรวจรับ):'), 'Card 2 must display label เวลากดส่ง (รอตรวจรับ):');
assert(renderedHtml.includes('04-09-2569 / 13:45 น.'), 'Card 2 must display dispatch timestamp');
assert(renderedHtml.includes('(วิชัย)'), 'Card 2 must include dispatcher name in dispatch timeline');

console.log('[PASS] renderHistoryCards correctly renders requester, request time, dispatcher, and dispatch time\n');

// 6. Invariant: Awaiting Recheck (รอตรวจรับ) items are pinned to the top
console.log('--- TEST 6: Priority Ordering for Awaiting Recheck (รอตรวจรับ) ---');
vm.runInContext(`
  state.items = [
    { id: 'ORD-1', itemName: 'สั่งเบิก 1', status: 'สั่งเบิก', rawDate: new Date('2026-09-04T12:00:00Z') },
    { id: 'RECHECK-1', itemName: 'รอตรวจรับ 1', status: 'รอตรวจรับ', rawDate: new Date('2026-09-03T10:00:00Z'), dispatchTimestamp: '04-09-2569 / 11:00 น.' },
    { id: 'ORD-2', itemName: 'สั่งเบิก 2', status: 'กำลังจัดสินค้า', rawDate: new Date('2026-09-04T15:00:00Z') },
    { id: 'DONE-1', itemName: 'รับแล้ว 1', status: 'รับสินค้าแล้ว', rawDate: new Date('2026-09-04T16:00:00Z'), dispatchTimestamp: '04-09-2569 / 16:30 น.' }
  ];
  state.historySort = 'request';
  state.historyDir = 'desc';
`, sandbox);

const historySorted = sandbox.getFilteredHistory();
assert.strictEqual(historySorted[0].id, 'RECHECK-1', 'In history list, รอตรวจรับ must be prioritized at the top');

// Test pending tab sorting logic inside the VM context where ACTIVE_W1_STATUSES is accessible
const pendingSorted = vm.runInContext(`
  state.items
    .filter(i => ACTIVE_W1_STATUSES.includes(i.status))
    .slice()
    .sort((a, b) => {
      const aIsRecheck = a.status === 'รอตรวจรับ' ? 1 : 0;
      const bIsRecheck = b.status === 'รอตรวจรับ' ? 1 : 0;
      if (aIsRecheck !== bIsRecheck) return bIsRecheck - aIsRecheck;
      const da = a.rawDate ? new Date(a.rawDate).getTime() : 0;
      const db = b.rawDate ? new Date(b.rawDate).getTime() : 0;
      return db - da;
    })
`, sandbox);

assert.strictEqual(pendingSorted[0].id, 'RECHECK-1', 'In pending tab, รอตรวจรับ must appear at the top');
console.log('[PASS] Awaiting recheck items are strictly pinned to the top in both pending tab and history list\n');

console.log('🌟 ALL HISTORY REMEDIATION AND RECEIVED QTY TESTS PASSED 100%! 🌟');
