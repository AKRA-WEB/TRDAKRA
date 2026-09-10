const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const script = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)]
  .map(match => match[1].trim())
  .find(code => code.includes('function buildReceiptMutation'));
assert.ok(script, 'TRDAKRA main script must contain receipt runtime functions');
new vm.Script(script, { filename: 'trdakra-receipt-runtime.js' });

const storage = {};
const elements = new Map();
const alerts = [];
const apiCalls = [];
const makeElement = () => ({
  style: {}, innerText: '', innerHTML: '', className: '',
  appendChild() {}, setAttribute() {}, addEventListener() {}, focus() {}
});
for (const id of ['main-view', 'sidebar', 'loading-overlay', 'loading-text']) elements.set(id, makeElement());

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
    getItem(key) { return Object.prototype.hasOwnProperty.call(storage, key) ? storage[key] : null; },
    setItem(key, value) { storage[key] = String(value); },
    removeItem(key) { delete storage[key]; }
  },
  sessionStorage: {
    getItem(key) { return Object.prototype.hasOwnProperty.call(storage, key) ? storage[key] : null; },
    setItem(key, value) { storage[key] = String(value); },
    removeItem(key) { delete storage[key]; }
  },
  document: {
    getElementById(id) { return elements.get(id) || null; },
    addEventListener() {},
    createElement() { return makeElement(); },
    head: { appendChild() {} },
    body: { appendChild() {} },
    visibilityState: 'visible'
  },
  window: {
    addEventListener() {},
    location: { href: 'http://localhost', search: '', replace() {} }
  },
  location: { href: 'http://localhost', search: '' },
  performance: { now: () => Date.now() },
  setInterval() { return 0; },
  confirm: () => true,
  alert(message) { alerts.push(String(message)); },
  fetch: async (url, options = {}) => {
    const target = String(url);
    if (target.includes('version.json')) return { ok: true, json: async () => ({ version: '20260910.02' }) };
    const payload = JSON.parse(options.body || '{}');
    apiCalls.push(payload);
    if (payload.action === 'receiveInventoryItems') {
      return {
        ok: true,
        json: async () => ({
          status: 'success',
          items: payload.items.map(item => ({
            id: item.id,
            status: item.receivedQty >= 5 ? 'รับสินค้าแล้ว' : 'จัดส่งไม่ครบ',
            recheckQty: item.receivedQty,
            recheckAt: '10-09-2569 / 12:00 น.',
            recheckBy: 'TRD User',
            receiptDate: item.receiptDate,
            receiptDateKind: item.receiptDateKind,
            receiptReceivedAt: '2026-09-10T05:00:00.000Z',
            receiptReceivedBy: 'TRD User',
            newExpiry: item.receiptDateKind === 'expiry' ? '03-02-2027' : null,
            revision: 2
          }))
        })
      };
    }
    return { ok: true, json: async () => ({ status: 'success' }) };
  }
};
sandbox.window.localStorage = sandbox.localStorage;
sandbox.window.sessionStorage = sandbox.sessionStorage;
sandbox.window.document = sandbox.document;
vm.createContext(sandbox);
vm.runInContext(script, sandbox);
vm.runInContext('AppVersionGuard.start({ current: CURRENT_VERSION, readActions: [] })', sandbox);

vm.runInContext(`
  state.items = [
    { id: 'RC-EXP', itemName: 'สินค้า EXP', status: 'รอตรวจรับ', requestQty: 5, receiveQty: 5, revision: 1 },
    { id: 'RC-MFG', itemName: 'สินค้า MFG', status: 'รอตรวจรับ', requestQty: 5, receiveQty: 3, revision: 1 }
  ];
  state.recheckQty = {};
  state.receiptDrafts = {};
`, sandbox);

const expItem = vm.runInContext('state.items[0]', sandbox);
assert.equal(sandbox.parseReceiptDateInput('15/09/69'), '2026-09-15');
assert.equal(sandbox.parseReceiptDateInput('15/9/27'), '2027-09-15');
assert.equal(sandbox.parseReceiptDateInput('15/09/2569'), '2026-09-15');
assert.equal(sandbox.parseReceiptDateInput('15-9-2027'), '2027-09-15');
assert.equal(sandbox.parseReceiptDateInput('2027-09-15'), '2027-09-15');
assert.equal(sandbox.parseReceiptDateInput('15/09/69 พ.ศ.'), '2026-09-15');
assert.equal(sandbox.parseReceiptDateInput('15/9/27 ค.ศ.'), '2027-09-15');
assert.equal(sandbox.parseReceiptDateInput('31/02/69'), null);

let mutation = sandbox.buildReceiptMutation(expItem);
assert.equal(mutation.error, 'กรุณาระบุวันหมดอายุที่ใกล้ที่สุด', 'positive receipt must require an expiry date by default');

sandbox.updateReceiptDate('RC-EXP', '15/09/69');
mutation = sandbox.buildReceiptMutation(expItem);
assert.equal(mutation.item.receiptDateKind, 'expiry');
assert.equal(mutation.item.receiptDate, '2026-09-15');
assert.equal(mutation.item.expectedRevision, 1);

sandbox.updateReceiptDate('RC-EXP', '15/9/27');
mutation = sandbox.buildReceiptMutation(expItem);
assert.equal(mutation.item.receiptDate, '2027-09-15');

sandbox.updateReceiptDate('RC-EXP', '31/02/69');
mutation = sandbox.buildReceiptMutation(expItem);
assert.equal(mutation.error, 'รูปแบบวันหมดอายุไม่ถูกต้อง เช่น 15/09/69 หรือ 15/9/27');

sandbox.setReceiptDateKind('RC-EXP', 'manufacturing_only');
assert.equal(vm.runInContext("state.receiptDrafts['RC-EXP'].date", sandbox), '', 'switching to manufacturing-only must clear a stale date');
mutation = sandbox.buildReceiptMutation(expItem);
assert.equal(mutation.item.receiptDateKind, 'manufacturing_only');
assert.equal(mutation.item.receiptDate, null);

const latest = sandbox.getLatestReceiptRecord([
  { id: 'OLD-EXP', actualQty: 5, receiptDateKind: 'expiry', receiptDate: '2027-01-01', receiptReceivedAt: '2026-09-10T04:00:00.000Z', receiptReceivedBy: 'Older' },
  { id: 'LATEST-MFG', actualQty: 5, receiptDateKind: 'manufacturing_only', receiptDate: null, receiptReceivedAt: '2026-09-10T05:00:00.000Z', receiptReceivedBy: 'Latest' }
]);
assert.equal(latest.id, 'LATEST-MFG', 'latest receipt must be selected by server receipt time');
assert.match(sandbox.renderMovementReceiptEvidence(latest), /มีแต่วันผลิต/);
assert.match(sandbox.renderReceiptEvidenceLine({ status: 'รับสินค้าแล้ว', requestQty: 5, receiveQty: 5 }), /ยังไม่มีข้อมูลล็อต/, 'legacy completed receipt without lot evidence must be explicit');

vm.runInContext("state.recheckQty['RC-EXP'] = '0'", sandbox);
mutation = sandbox.buildReceiptMutation(expItem);
assert.equal(mutation.item.receivedQty, 0);
assert.equal(mutation.item.receiptDateKind, null, 'zero receipt must send no lot kind');
assert.equal(mutation.item.receiptDate, null, 'zero receipt must send no lot date');

vm.runInContext("state.recheckQty = { 'RC-EXP': '', 'RC-MFG': '3' }", sandbox);
sandbox.setReceiptDateKind('RC-MFG', 'manufacturing_only');
const beforeInvalidBatchCalls = apiCalls.length;
sandbox.confirmRecheckAllItems();
assert.equal(alerts.at(-1), 'สินค้า EXP: จำนวนรับจริงไม่ถูกต้อง', 'bulk receipt must reject a blank quantity instead of clamping it');
assert.equal(apiCalls.length, beforeInvalidBatchCalls, 'invalid bulk receipt must not call the API');

vm.runInContext("state.recheckQty = { 'RC-EXP': '5', 'RC-MFG': '2' }", sandbox);
sandbox.updateReceiptDate('RC-EXP', '2027-02-03');
sandbox.setReceiptDateKind('RC-MFG', 'manufacturing_only');
sandbox.confirmRecheckAllItems();

setTimeout(() => {
  try {
    const receiptCall = apiCalls.find(call => call.action === 'receiveInventoryItems');
    assert.ok(receiptCall, 'bulk receipt must use the dedicated API action');
    assert.equal(receiptCall.items.length, 2);
    assert.equal(receiptCall.items[0].receiptDateKind, 'expiry');
    assert.equal(receiptCall.items[0].receiptDate, '2027-02-03');
    assert.equal(receiptCall.items[1].receiptDateKind, 'manufacturing_only');
    assert.equal(receiptCall.items[1].receiptDate, null);
    assert.equal(Object.hasOwn(receiptCall.items[0], 'recheckBy'), false, 'client must not send receiver identity');
    assert.equal(vm.runInContext('state.items[0].status', sandbox), 'รับสินค้าแล้ว');
    assert.equal(vm.runInContext('state.items[1].status', sandbox), 'จัดส่งไม่ครบ');
    assert.equal(vm.runInContext('state.items[0].itemName', sandbox), 'สินค้า EXP', 'receipt result must not erase item identity');
    assert.equal(vm.runInContext('state.items[0].requestQty', sandbox), 5, 'receipt result must not erase request data');
    assert.equal(vm.runInContext('Object.keys(state.receiptDrafts).length', sandbox), 0, 'successful bulk receipt clears drafts');
    console.log('PASS: TRDAKRA receipt date/mode UI runtime contract (single and bulk).');
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  }
}, 0);
