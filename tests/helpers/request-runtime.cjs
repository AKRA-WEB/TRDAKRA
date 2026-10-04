const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');

function requestRuntime({ write, crypto = webcrypto } = {}) {
  const appRoot = path.join(__dirname, '../..');
  const html = fs.readFileSync(path.join(appRoot, 'index.html'), 'utf8');
  const version = JSON.parse(fs.readFileSync(path.join(appRoot, 'version.json'), 'utf8')).version;
  const script = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)]
    .map(match => match[1]).find(code => code.includes('async function handleW1SubmitBulk'));
  const nodes = new Map(), storage = new Map(), alerts = [], calls = [];
  const node = id => {
    if (!nodes.has(id)) nodes.set(id, { value: '', style: {}, innerHTML: '', textContent: '',
      appendChild() {}, addEventListener() {}, setAttribute() {} });
    return nodes.get(id);
  };
  const store = { getItem: key => storage.get(key) || null,
    setItem: (key, value) => storage.set(key, String(value)), removeItem: key => storage.delete(key) };
  const location = { href: 'https://fixture.invalid/TRDAKRA/', search: '' };
  const document = { getElementById: node, createElement: () => node(Symbol()), addEventListener() {},
    head: { appendChild() {} }, body: { appendChild() {} }, visibilityState: 'visible' };
  const math = Object.create(Math);
  math.random = () => 0; // Always collides with the old REQ-1000 generator.
  const ctx = vm.createContext({ console: { log() {}, warn() {}, error() {} }, crypto, Math: math,
    document, location, localStorage: store, sessionStorage: store, performance: { now: () => 0 },
    window: { location, document, localStorage: store, sessionStorage: store, addEventListener() {} },
    setInterval() {}, setTimeout() {}, clearTimeout() {},
    alert: message => alerts.push(String(message)), confirm: () => true,
    fetch: async (url, options = {}) => {
      if (String(url).includes('version.json')) return { ok: true, json: async () => ({ version }) };
      const payload = JSON.parse(options.body || '{}');
      calls.push(payload);
      try {
        const result = write ? await write(payload) : { status: 'success' };
        return { ok: true, json: async () => result };
      } catch (error) {
        return { ok: false, status: 400, json: async () => ({ status: 'error', message: error.message }) };
      }
    }
  });
  vm.runInContext(script, ctx);
  vm.runInContext(`
    window.appSession = { id:'fixture', identityId:'10000000-0000-4000-8000-000000000001',
      sessionVersion:1, authorizationRevision:'fixture-revision' };
    sessionToken = 'fixture-token'; currentUser = 'Fixture';
    render = () => {}; sendAppLog = () => {}; fetchInitialData = async () => {};
    state.items = []; state.activeItemsReady = false;
    AppVersionGuard.start({ current: CURRENT_VERSION, readActions: [] });
  `, ctx);
  const state = vm.runInContext('state', ctx);
  async function submit(kind, rows) {
    if (kind === 'single') {
      node('w1-itemName').value = rows[0].itemName;
      node('w1-qty').value = rows[0].qty;
      node('w1-storageCapacity').value = rows[0].parLevel;
      node('w1-oldExpiry').value = '';
      return ctx.handleW1Submit({ preventDefault() {} });
    }
    if (kind === 'bulk') {
      state.w1Rows = rows;
      return ctx.handleW1SubmitBulk();
    }
    if (kind === 'survey') {
      state.surveyFloor = '1';
      state.surveyData = {};
      state.surveyConfirmList = rows.map(row => ({ name: row.itemName, needOrder: Number(row.qty), parLevel: Number(row.parLevel) }));
      return ctx.handleSurveyBulkOrder();
    }
    state.checkStockLocation = { floor: '1', location: '1' };
    state.products = rows.map(row => ({ name: row.itemName, parLevel: Number(row.parLevel), floor: '1', location: '1A', unit: 'กล่อง' }));
    state.checkStockEdits = Object.fromEntries(rows.map(row => [row.itemName,
      { checked: true, currentStock: Number(row.parLevel) - Number(row.qty), requestQty: row.qty }]));
    return ctx.handleCheckStockSubmit();
  }
  return { ctx, state, calls, alerts, submit };
}

module.exports = { requestRuntime };
