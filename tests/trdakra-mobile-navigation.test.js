const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const script = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)]
  .map(match => match[1].trim())
  .filter(Boolean)
  .sort((a, b) => b.length - a.length)[0];
assert.ok(script, 'TRDAKRA inline runtime must exist');
new vm.Script(script, { filename: 'trdakra-mobile-navigation-runtime.js' });

class StubClassList {
  constructor() { this.values = new Set(); }
  add(...names) { names.forEach(name => this.values.add(name)); }
  remove(...names) { names.forEach(name => this.values.delete(name)); }
  contains(name) { return this.values.has(name); }
  toggle(name, force) {
    const next = force === undefined ? !this.values.has(name) : Boolean(force);
    if (next) this.values.add(name); else this.values.delete(name);
    return next;
  }
}

function makeElement(id = '') {
  const listeners = new Map();
  return {
    id,
    style: {},
    innerHTML: '',
    hidden: false,
    className: '',
    classList: new StubClassList(),
    attributes: new Map(),
    listeners,
    appendChild(child) { return child; },
    setAttribute(name, value) { this.attributes.set(name, String(value)); },
    getAttribute(name) { return this.attributes.get(name) ?? null; },
    addEventListener(name, handler) {
      const handlers = listeners.get(name) || [];
      handlers.push(handler);
      listeners.set(name, handlers);
    },
    dispatchEvent(event) {
      (listeners.get(event.type) || []).forEach(handler => handler(event));
    },
    querySelector() { return null; },
    focus() {}
  };
}

const elements = new Map([
  ['trd-topbar', makeElement('trd-topbar')],
  ['trd-module-nav', makeElement('trd-module-nav')],
  ['trd-mobile-menu-root', makeElement('trd-mobile-menu-root')],
  ['sidebar', makeElement('sidebar')],
  ['main-view', makeElement('main-view')],
  ['app-root', makeElement('app-root')],
  ['loading-overlay', makeElement('loading-overlay')],
  ['loading-text', makeElement('loading-text')]
]);

const windowListeners = new Map();
const documentListeners = new Map();
const windowObject = {
  appSession: { name: 'Test User', roles: [] },
  scrollY: 0,
  innerWidth: 390,
  innerHeight: 844,
  location: { href: 'http://localhost/', search: '', pathname: '/' },
  addEventListener(name, handler) {
    const handlers = windowListeners.get(name) || [];
    handlers.push(handler);
    windowListeners.set(name, handlers);
  },
  dispatchEvent(event) {
    (windowListeners.get(event.type) || []).forEach(handler => handler(event));
  }
};

const documentObject = {
  visibilityState: 'visible',
  documentElement: { scrollTop: 0 },
  body: { classList: new StubClassList(), style: {}, appendChild() {} },
  head: { appendChild() {} },
  getElementById(id) { return elements.get(id) || null; },
  createElement() { return makeElement(); },
  addEventListener(name, handler) {
    const handlers = documentListeners.get(name) || [];
    handlers.push(handler);
    documentListeners.set(name, handlers);
  },
  dispatchEvent(event) {
    (documentListeners.get(event.type) || []).forEach(handler => handler(event));
  }
};

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
  URL,
  URLSearchParams,
  parseInt,
  parseFloat,
  isNaN,
  document: documentObject,
  window: windowObject,
  location: windowObject.location,
  localStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
  sessionStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
  performance: { now: () => Date.now() },
  setInterval() { return 0; },
  setTimeout(handler) { handler(); return 0; },
  clearTimeout() {},
  fetch: async () => ({ ok: true, json: async () => ({}) }),
  alert() {},
  confirm() { return true; }
};
windowObject.document = documentObject;
windowObject.localStorage = sandbox.localStorage;
windowObject.sessionStorage = sandbox.sessionStorage;

vm.createContext(sandbox);
vm.runInContext(script, sandbox);

const topbar = elements.get('trd-topbar');
const menuRoot = elements.get('trd-mobile-menu-root');
sandbox.renderTopbar();
sandbox.initMobileNavigation();

function scrollTo(y) {
  windowObject.scrollY = y;
  documentObject.documentElement.scrollTop = y;
  windowObject.dispatchEvent({ type: 'scroll' });
}

scrollTo(0);
assert.equal(topbar.classList.contains('is-hidden-on-scroll'), false, 'topbar starts visible at page top');
scrollTo(80);
assert.equal(topbar.classList.contains('is-hidden-on-scroll'), true, 'topbar hides after downward scroll');
scrollTo(30);
assert.equal(topbar.classList.contains('is-hidden-on-scroll'), false, 'topbar returns on upward scroll');
scrollTo(0);
assert.equal(topbar.classList.contains('is-hidden-on-scroll'), false, 'topbar remains visible at the top');

sandbox.toggleMobileMenu(true);
assert.equal(menuRoot.classList.contains('is-open'), true, 'mobile menu opens');
assert.equal(menuRoot.getAttribute('aria-hidden'), 'false', 'open menu is exposed to assistive technology');
assert.equal(documentObject.body.classList.contains('trd-mobile-menu-open'), true, 'open menu locks page scrolling');
sandbox.toggleMobileMenu(false);
assert.equal(menuRoot.classList.contains('is-open'), false, 'mobile menu closes');
assert.equal(menuRoot.getAttribute('aria-hidden'), 'true', 'closed menu is hidden from assistive technology');
assert.equal(documentObject.body.classList.contains('trd-mobile-menu-open'), false, 'closed menu releases page scrolling');

sandbox.toggleMobileMenu(true);
documentObject.dispatchEvent({ type: 'keydown', key: 'Escape' });
assert.equal(menuRoot.classList.contains('is-open'), false, 'Escape closes the mobile menu');

console.log('PASS: TRDAKRA mobile navigation scroll and menu controller behavior.');

// Execute the operational dashboard renderers with real state, including empty
// data, unsafe display values and newest-first ordering. Assertions inspect
// renderer output, never source-text presence.
vm.runInContext(`
  state.products = [{name:'Flour <sample>',unit:'ถุง',floor:'1'}];
  state.items = [
    {id:'old', itemName:'Flour <sample>', requestQty:2, status:'สั่งเบิก', rawDate:'2026-09-01T00:00:00Z', requestedBy:'A & B'},
    {id:'new', itemName:'Flour <sample>', requestQty:3, status:'รอตรวจรับ', rawDate:'2026-09-15T00:00:00Z'}
  ];
`, sandbox);
const home = sandbox.renderHomeLegacy();
const values = [...home.matchAll(/<strong>(\d+)<\/strong><small>/g)].map(m => Number(m[1]));
assert.deepEqual(values, [1, 0, 1, 0], 'home counts actual request/preparing/recheck/unlocated states');
const beforeItems = vm.runInContext('JSON.stringify(state.items)', sandbox);
const table = vm.runInContext('renderRequestTable(state.items)', sandbox);
assert.ok(table.indexOf('new') < table.indexOf('old'), 'latest request renders first');
assert.match(table, /Flour &lt;sample&gt;/, 'product text is escaped');
assert.match(table, /A &amp; B/, 'requester text is escaped');
assert.equal(vm.runInContext('JSON.stringify(state.items)', sandbox), beforeItems, 'render sorting does not mutate shared state');
assert.equal((table.match(/<tbody>[\s\S]*?<\/tbody>/)[0].match(/<tr>/g) || []).length, 2);
assert.match(sandbox.renderRequestTable([]), /ไม่มีรายการในช่วงเวลานี้/);
vm.runInContext('state.items = []; state.products = [];', sandbox);
assert.deepEqual([...sandbox.renderHomeLegacy().matchAll(/<strong>(\d+)<\/strong><small>/g)].map(m => Number(m[1])), [0,0,0,0]);
const summary = sandbox.renderDashboardSummary([], [], new Date('2026-09-01'));
assert.match(summary, /ไม่มีข้อมูลในช่วงเวลานี้/);
assert.match(summary, /ไม่มีข้อมูลผู้ขอเบิกในช่วงนี้/);
assert.doesNotMatch(summary, /NaN|undefined/);
const manyRows = Array.from({length:25}, (_,i) => ({id:'row-'+i,itemName:'Sample',requestQty:1,status:'สั่งเบิก',rawDate:new Date(2026,8,i+1).toISOString()}));
const limited = sandbox.renderRequestTable(manyRows);
assert.equal((limited.match(/<tbody>[\s\S]*?<\/tbody>/)[0].match(/<tr>/g) || []).length,20,'table caps output at twenty rows');
assert.match(limited, /row-24/);
assert.doesNotMatch(limited, />row-0</);
console.log('PASS: Dashboard runtime counts, empty report, escaping and immutable newest-first table.');

vm.runInContext("state.view = 'w1'; state.w1Tab = 'request';", sandbox);
sandbox.renderTopbar();
const storefrontNav = elements.get('trd-module-nav').innerHTML;
assert.equal((storefrontNav.match(/<button /g) || []).length,5,'desktop has one combined storefront entry');
assert.doesNotMatch(storefrontNav,/setView\('w1'\)/,'manual request is not a separate top-level route');
assert.match(storefrontNav,/is-active[^>]+setView\('check_stock'\)/,'manual request highlights parent survey menu');
const storefrontTabs = sandbox.renderStorefrontTabs();
assert.match(storefrontTabs,/setW1Tab\('request'\)/);
assert.match(storefrontTabs,/setW1Tab\('pending'\)/);
assert.match(storefrontTabs,/setW1Tab\('history'\)/);
vm.runInContext("state.view = 'check_stock';",sandbox);
assert.match(sandbox.renderStorefrontTabs(),/is-active[^>]+setView\('check_stock'\)/);
console.log('PASS: Survey-first navigation grouping, parent selection and manual/receiving/history access.');

vm.runInContext(`
  state.items = [];
  state.dashboardTab = 'trend';
  state.surveyMonthKey = '2026_09';
  state.surveyLogs = {monthKey:'2026_09',details:[
    {surveyDate:'2026-09-24',floor:'1',productName:'Flour',currentStock:2,parLevel:5,needToOrder:3,surveyedBy:'A',sessionKey:'survey-1'},
    {surveyDate:'2026-09-24',floor:'1',productName:'Sugar',currentStock:5,parLevel:5,needToOrder:0,surveyedBy:'A',sessionKey:'survey-1'}
  ]};
  state.surveyHistoryOpen = true;
`, sandbox);
const analytics = sandbox.renderDashboard();
assert.match(analytics, /ปฏิทิน/);
assert.match(analytics, /สินค้าเชิงลึก/);
assert.doesNotMatch(analytics, /สรุป|หมด\/ยกเลิก|Survey/);
const surveyHistory = sandbox.renderCheckStock();
assert.match(surveyHistory, /ประวัติการสำรวจสต็อก/);
assert.match(surveyHistory, /สำรวจ กันยายน 2569/);
assert.match(surveyHistory, /1 <span[^>]*>ครั้ง/);
assert.match(surveyHistory, /1 <span[^>]*>รายการ/);
assert.match(surveyHistory, /Flour/);
console.log('PASS: Analytics keeps only detailed reports and survey history remains available in stock survey.');

let surveyUrl = '';
let surveyAuth = '';
sandbox.fetch = async (url, options) => {
  surveyUrl = String(url);
  surveyAuth = options.headers.Authorization;
  return {ok:true,json:async()=>({status:'success',records:[
    {surveyDate:'2026-08-12',floor:'2',productName:'Butter',currentStock:1,parLevel:4,needToOrder:3,surveyedBy:'B',sessionKey:'aug-1'}
  ]})};
};
vm.runInContext("sessionToken = 'survey-fixture-token';", sandbox);
sandbox.fetchSurveyLogs('2026_08').then(() => {
  assert.match(surveyUrl, /action=getSurveyLogMonthly&month=2026-08$/);
  assert.equal(surveyAuth, 'Bearer survey-fixture-token');
  const august = sandbox.renderCheckStock();
  assert.match(august, /สำรวจ สิงหาคม 2569/);
  assert.match(august, /Butter/);
  assert.match(august, /1 <span[^>]*>รายการ/);
  console.log('PASS: Monthly Survey read uses the current API month and records contract.');
});
