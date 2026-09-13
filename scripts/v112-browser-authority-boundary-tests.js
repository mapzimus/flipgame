'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const CORE_FILES = Object.freeze([
  'js/v112-rules.js',
  'js/v112-event-kernel.js',
  'js/v112-event-runtime.js',
  'js/v112-event-rules-adapter.js',
  'js/v112-event-renderer.js',
  'scripts/lib/v112-event-harness.js',
]);
const CORE_GLOBALS = Object.freeze([
  'FlipgameV112Rules',
  'FlipgameV112EventKernel',
  'FlipgameV112EventRuntime',
  'FlipgameV112EventRulesAdapter',
  'FlipgameV112EventRenderer',
  'FlipgameV112EventHarness',
]);
const FACADES = Object.freeze([
  Object.freeze({
    file: 'js/v112-rules-browser-facade.js',
    key: 'FlipgameV112RulesBrowserFacadeV1',
    version: 1,
  }),
  Object.freeze({
    file: 'js/v112-event-kernel-browser-facade.js',
    key: 'FlipgameV112EventKernelBrowserFacadeV1',
    version: 2,
  }),
]);
const FORBIDDEN_CAPABILITY_WORDS = Object.freeze([
  'create', 'resolve', 'force', 'convert', 'claim', 'consume', 'issue', 'select',
  'roll', 'apply', 'prepare', 'cleanup', 'render', 'validate', 'normalize',
  'authority', 'capability', 'outcome', 'verdict', 'match', 'event', 'rules',
]);

function source(relative) {
  return fs.readFileSync(path.join(ROOT, relative), 'utf8');
}

function run(relative, context) {
  return vm.runInContext(source(relative), context, {
    filename: path.join(ROOT, relative),
  });
}

function assertInertFacade(context, definition) {
  const value = context[definition.key];
  const descriptor = Object.getOwnPropertyDescriptor(context, definition.key);
  assert.deepEqual(Object.keys(value), ['schema', 'version', 'liveAvailable']);
  assert.equal(value.schema, definition.key);
  assert.equal(value.version, definition.version);
  assert.equal(value.liveAvailable, false);
  assert.equal(Object.isFrozen(value), true);
  assert.equal(descriptor.enumerable, true);
  assert.equal(descriptor.writable, false);
  assert.equal(descriptor.configurable, false);
  for (const key of Reflect.ownKeys(value)) {
    assert.equal(typeof value[key], key === 'version' ? 'number' :
      (key === 'liveAvailable' ? 'boolean' : 'string'));
    const lowered = String(key).toLowerCase();
    if (key !== 'schema') {
      for (const word of FORBIDDEN_CAPABILITY_WORDS) {
        assert.equal(lowered.includes(word), false,
          `${definition.key}.${String(key)} must not imply ${word} authority`);
      }
    }
  }
  assert.equal(Reflect.ownKeys(value).some(key => typeof value[key] === 'function'), false);
}

function testFacadesAreExactFrozenAndIndependent() {
  for (const order of [FACADES, FACADES.slice().reverse()]) {
    const context = vm.createContext({ console });
    for (const definition of order) {
      run(definition.file, context);
      assertInertFacade(context, definition);
    }
    for (const key of CORE_GLOBALS) assert.equal(key in context, false);
  }
}

function testFacadePreseedsAndDuplicatesFailClosed() {
  for (const definition of FACADES) {
    for (const preseed of [
      { attacker: 'mutable' },
      Object.freeze({ schema: definition.key, version: definition.version,
        liveAvailable: false }),
    ]) {
      const context = vm.createContext({ console, [definition.key]: preseed });
      assert.throws(() => run(definition.file, context), /duplicate or preseeded/);
      assert.equal(context[definition.key], preseed,
        'preflight rejection must not replace an attacker preseed');
    }

    const context = vm.createContext({ console });
    run(definition.file, context);
    const original = context[definition.key];
    assert.throws(() => run(definition.file, context), /duplicate or preseeded/);
    assert.equal(context[definition.key], original,
      'duplicate loading must leave the first inert facade intact');
  }
}

function fakeCommonJsContext() {
  let requireCalls = 0;
  const sentinel = Object.freeze({ browserShim: true });
  function FakeModule() {}
  FakeModule._cache = Object.create(null);
  FakeModule.prototype.require = function () {
    requireCalls += 1;
    throw new Error('browser shim require must never run');
  };
  const fakeModule = {
    exports: sentinel,
    filename: 'browser-shim.js',
    require: function () {
      requireCalls += 1;
      throw new Error('browser shim require must never run');
    },
  };
  return {
    context: vm.createContext({
      console,
      module: fakeModule,
      require: fakeModule.require,
      process: {
        release: { name: 'node' },
        versions: { node: '999.0.0' },
        getBuiltinModule(name) {
          if (name !== 'module') throw new Error('unexpected fake builtin');
          return FakeModule;
        },
      },
    }),
    sentinel,
    calls: () => requireCalls,
  };
}

function testEveryCoreRefusesClassicAndFakeCommonJs() {
  for (const file of CORE_FILES) {
    const empty = vm.createContext({ console });
    assert.throws(() => run(file, empty), /private CommonJS core|test-only CommonJS/,
      `${file} must refuse an ordinary classic-script load`);
    for (const key of CORE_GLOBALS) assert.equal(key in empty, false);

    const shim = fakeCommonJsContext();
    assert.throws(() => run(file, shim.context),
      /private CommonJS core|test-only CommonJS/,
    `${file} must reject fake module/process/require globals`);
    assert.equal(shim.calls(), 0, `${file} must not call an attacker require shim`);
    assert.equal(shim.context.module.exports, shim.sentinel,
      `${file} must not export authority through an attacker module shim`);
    for (const key of CORE_GLOBALS) assert.equal(key in shim.context, false);
  }
}

function testThrownCoreCannotStopSafeFacadeLoading() {
  for (const coreFile of CORE_FILES) {
    for (const order of [FACADES, FACADES.slice().reverse()]) {
      const context = vm.createContext({ console });
      assert.throws(() => run(coreFile, context),
        /private CommonJS core|test-only CommonJS/);
      for (const definition of order) {
        run(definition.file, context);
        assertInertFacade(context, definition);
      }
      for (const key of CORE_GLOBALS) assert.equal(key in context, false);
    }
  }
}

function testForgedFrozenKernelGetsNoMatchCapability() {
  let forgedAuthorityCalls = 0;
  const forgedKernel = Object.freeze({
    schema: 'FlipgameEventKernelV2',
    createAuthority() {
      forgedAuthorityCalls += 1;
      throw new Error('forged authority invoked');
    },
  });
  const forgedRules = Object.freeze({
    schema: 'FlipgameV112RulesV1',
    createRulesAdapter() { return Object.freeze({
      claimEventAuthority() { return forgedKernel.createAuthority(); },
    }); },
  });
  const context = vm.createContext({ console,
    FlipgameV112EventKernel: forgedKernel,
    FlipgameV112Rules: forgedRules,
  });
  for (const coreFile of CORE_FILES) {
    assert.throws(() => run(coreFile, context),
      /private CommonJS core|test-only CommonJS/);
  }
  for (const definition of FACADES) {
    run(definition.file, context);
    assertInertFacade(context, definition);
  }
  assert.equal(context.FlipgameV112EventKernel, forgedKernel);
  assert.equal(context.FlipgameV112Rules, forgedRules);
  assert.equal(context.FlipgameV112EventKernelBrowserFacadeV1.createAuthority, undefined);
  assert.equal(context.FlipgameV112RulesBrowserFacadeV1.createRulesAdapter, undefined);
  assert.equal(forgedAuthorityCalls, 0,
    'no trusted match capability may cross into a schema-shaped frozen preseed');
}

function testCommonJsCoresNeverPolluteGlobalThis() {
  const sentinels = Object.create(null);
  for (const key of CORE_GLOBALS) {
    sentinels[key] = Object.freeze({ key, attacker: true });
    Object.defineProperty(globalThis, key, {
      value: sentinels[key], writable: true, configurable: true,
    });
  }
  try {
    for (const file of CORE_FILES.slice().reverse()) {
      const resolved = require.resolve(path.join(ROOT, file));
      delete require.cache[resolved];
      const value = require(resolved);
      assert.ok(value && typeof value === 'object', `${file} must export its CommonJS API`);
    }
    for (const key of CORE_GLOBALS) assert.equal(globalThis[key], sentinels[key],
      `CommonJS must not publish or replace ${key}`);
  } finally {
    for (const key of CORE_GLOBALS) delete globalThis[key];
  }
}

function testTrustedCoresAreAbsentFromBrowserBootGraph() {
  const bootFiles = Object.freeze([
    'index.html', 'service-worker.js', 'manifest.json', 'js/v111-boot.js',
  ]);
  const trustedBasenames = CORE_FILES.map(file => path.basename(file));
  for (const bootFile of bootFiles) {
    const text = source(bootFile);
    for (const basename of trustedBasenames) {
      assert.equal(text.includes(basename), false,
        `${bootFile} must not reference trusted core ${basename}`);
    }
  }

  const index = source('index.html');
  const scriptSources = Array.from(index.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["']/gi),
    match => match[1].split(/[?#]/, 1)[0]);
  assert.deepEqual(scriptSources, ['js/v111-boot.js'],
    'the HTML boot graph must stay rooted in the frozen v1.11 loader');

  const worker = source('service-worker.js');
  const manifest = JSON.stringify(JSON.parse(source('manifest.json')));
  for (const facade of FACADES) {
    assert.equal(worker.includes(path.basename(facade.file)), false,
      'interim facades are not live runtime composition and must not be precached');
    assert.equal(manifest.includes(path.basename(facade.file)), false);
  }
}

function runAll() {
  testFacadesAreExactFrozenAndIndependent();
  testFacadePreseedsAndDuplicatesFailClosed();
  testEveryCoreRefusesClassicAndFakeCommonJs();
  testThrownCoreCannotStopSafeFacadeLoading();
  testForgedFrozenKernelGetsNoMatchCapability();
  testCommonJsCoresNeverPolluteGlobalThis();
  testTrustedCoresAreAbsentFromBrowserBootGraph();
  console.log('v1.12 browser authority boundary tests passed.');
}

runAll();
