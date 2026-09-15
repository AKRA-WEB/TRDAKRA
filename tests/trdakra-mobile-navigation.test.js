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
