#!/usr/bin/env node

'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'js', 'v111-boot.js'), 'utf8');

function eventTarget(initial = {}) {
  const handlers = new Map();
  return Object.assign(initial, {
    addEventListener(type, handler) {
      if (!handlers.has(type)) handlers.set(type, new Set());
      handlers.get(type).add(handler);
    },
    removeEventListener(type, handler) { handlers.get(type)?.delete(handler); },
    dispatch(type) { for (const handler of handlers.get(type) || []) handler({ type }); },
  });
}

function classList() {
  const values = new Set();
  return { add: (...names) => names.forEach((name) => values.add(name)), contains: (name) => values.has(name) };
}

function harness({ protocol = 'https:', hostname = 'example.test', registerError = null } = {}) {
  const scripts = [];
  const styles = [];
  const elements = new Map();
  const oldWorker = eventTarget({ scriptURL: 'https://example.test/flipgame/service-worker.js?v=110', state: 'activated' });
  const newWorker = eventTarget({ scriptURL: 'https://example.test/flipgame/service-worker.js?v=111', state: 'installing' });
  const serviceWorker = eventTarget({ controller: oldWorker });
  const registration = { installing: newWorker, waiting: null, active: oldWorker, update: async () => {} };
  serviceWorker.register = async () => {
    if (registerError) throw registerError;
    return registration;
  };
  const body = {
    classList: classList(),
    appendChild(element) {
      if (element.id) elements.set(element.id, element);
      if (element.tagName === 'SCRIPT') { scripts.push(element.src); queueMicrotask(() => element.onload?.()); }
      return element;
    },
  };
  const head = {
    appendChild(element) {
      if (element.tagName === 'LINK') { styles.push(element.href); queueMicrotask(() => element.onload?.()); }
      return element;
    },
  };
  const document = {
    body, head,
    createElement(tag) {
      return eventTarget({
        tagName: String(tag).toUpperCase(), id: '', textContent: '', children: [],
        classList: classList(), setAttribute() {},
        appendChild(child) { this.children.push(child); return child; },
      });
    },
    getElementById(id) { return elements.get(id) || null; },
  };
  const location = { protocol, hostname, href: `${protocol}//${hostname}/flipgame/`, reload() {} };
  const window = eventTarget({ document, location });
  const context = vm.createContext({
    window, document, location, navigator: { serviceWorker }, URL,
    Promise, Object, Error, console: { error() {} }, setTimeout, clearTimeout, queueMicrotask,
  });
  vm.runInContext(source, context, { filename: 'v111-boot.js' });
  return {
    window, document, serviceWorker, registration, oldWorker, newWorker, scripts, styles,
    activateV111() {
      newWorker.state = 'activated';
      registration.installing = null;
      registration.active = newWorker;
      serviceWorker.controller = newWorker;
      newWorker.dispatch('statechange');
      serviceWorker.dispatch('controllerchange');
    },
  };
}

async function main() {
  const upgrade = harness();
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(upgrade.scripts.length, 0, 'v111 runtime loaded under the old v110 controller');
  assert.equal(upgrade.styles.length, 0, 'v111 CSS loaded under the old v110 controller');
  upgrade.activateV111();
  assert.equal(await upgrade.window.__FLIPGAME_BOOT_PROMISE__, true);
  assert.ok(upgrade.scripts.length > 20, 'ordered runtime did not load after v111 control');
  assert.equal(upgrade.scripts.at(-1), 'js/main.js?v=111');
  assert.deepEqual(upgrade.styles, ['css/style.css?v=111']);
  assert.equal(upgrade.document.body.classList.contains('flipgame-boot-ready'), true);

  const failed = harness({ registerError: new Error('offline update failure') });
  assert.equal(await failed.window.__FLIPGAME_BOOT_PROMISE__, false);
  assert.equal(failed.scripts.length, 0, 'failed worker update loaded a partial runtime');
  assert.equal(failed.document.body.classList.contains('flipgame-boot-failed'), true);
  const notice = failed.document.getElementById('flipgame-boot-status');
  assert.ok(notice && notice.children.some((child) => child.textContent === 'Retry update'));

  for (const local of [
    harness({ protocol: 'http:', hostname: 'localhost' }),
    harness({ protocol: 'file:', hostname: '' }),
  ]) {
    assert.equal(await local.window.__FLIPGAME_BOOT_PROMISE__, true);
    assert.ok(local.scripts.length > 20, 'local/APK direct boot did not load the runtime');
    assert.equal(local.document.body.classList.contains('flipgame-boot-ready'), true);
  }

  console.log('v111 atomic boot tests passed.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
