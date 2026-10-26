const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function setup() {
  const listeners = new Map();
  const timers = new Map();
  const hooks = {};
  let calls = 0;
  let nextTimer = 0;
  const enabled = { value: true }, token = { value: 'session' };
  const surface = name => ({
    hidden: false,
    addEventListener: (event, fn) => listeners.set(`${name}:${event}`, fn),
    removeEventListener: event => listeners.delete(`${name}:${event}`)
  });
  const document = surface('document');
  const context = vm.createContext({
    document, window: surface('window'),
    ref: value => ({ value }),
    watch: (_, fn) => { hooks.watch = fn; fn(); },
    onMounted: fn => { hooks.mount = fn; },
    onUnmounted: fn => { hooks.unmount = fn; },
    setTimeout: (fn, delay) => { const id = ++nextTimer; timers.set(id, { fn, delay }); return id; },
    clearTimeout: id => timers.delete(id),
    call: async () => { calls++; return { notifications: [{ id: 'new' }], unreadTotal: calls }; }
  });
  const source = fs.readFileSync(path.join(__dirname, '../admin/src/composables/useNotifications.js'), 'utf8')
    .replace(/^import .*;\n/gm, '').replace('export function', 'function');
  vm.runInContext(source, context);
  const state = context.useNotifications({ token, enabled });
  hooks.mount();
  return { state, hooks, enabled, document, listeners, timers, calls: () => calls };
}
const settle = () => new Promise(resolve => setImmediate(resolve));

test('unread count updates automatically without opening the message panel', async () => {
  const app = setup();
  await settle();
  assert.equal(app.state.unreadTotal.value, 1);
  const [id, timer] = [...app.timers][0];
  assert.equal(timer.delay, 10000);
  app.timers.delete(id);
  await timer.fn();
  assert.equal(app.state.unreadTotal.value, 2);
  app.hooks.unmount();
});

test('focus and network recovery refresh, hidden pages pause, teardown removes listeners', async () => {
  const app = setup();
  await settle();
  await app.listeners.get('window:focus')();
  await app.listeners.get('window:online')();
  assert.equal(app.calls(), 3);
  app.document.hidden = true;
  app.listeners.get('document:visibilitychange')();
  await app.listeners.get('window:focus')();
  assert.equal(app.calls(), 3);
  assert.equal(app.timers.size, 0);
  app.document.hidden = false;
  app.listeners.get('document:visibilitychange')();
  await settle();
  assert.equal(app.calls(), 4);
  app.enabled.value = false;
  app.hooks.watch();
  assert.equal(app.state.unreadTotal.value, 0);
  assert.equal(app.timers.size, 0);
  app.hooks.unmount();
  assert.equal(app.listeners.size, 0);
});
