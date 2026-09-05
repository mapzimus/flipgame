#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const settingsSource = fs.readFileSync(path.join(root, 'js', 'settings.js'), 'utf8');
const mainSource = fs.readFileSync(path.join(root, 'js', 'main.js'), 'utf8');

function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(String(key), String(value)); },
    removeItem(key) { values.delete(String(key)); },
    read(key) { const value = values.get(key); return value == null ? null : JSON.parse(value); },
    raw(key) { return values.get(key); },
  };
}

function loadSettings(storage) {
  const context = { console, localStorage: storage };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(settingsSource, context, { filename: 'js/settings.js' });
  return context;
}

function testClassicScriptGlobalAndSingleObject() {
  const storage = memoryStorage();
  const context = loadSettings(storage);
  assert.ok(context.window.Settings, 'classic script exposes window.Settings');
  assert.equal(vm.runInContext('Settings === window.Settings', context), true,
    'unqualified classic-script Settings resolves to the exact browser-global object');
  assert.deepEqual(Object.keys(context.Settings).sort(), [
    'feel', 'flickFeedback', 'reduceMotion', 'setFeel', 'setFlickFeedback',
    'setReduceMotion', 'setSound', 'sound',
  ]);
  const first = context.Settings;
  vm.runInContext(settingsSource, context, { filename: 'js/settings.js#reload' });
  assert.equal(context.Settings, first, 're-evaluating the script cannot fork preference state');
  assert.ok(Object.isFrozen(context.Settings));
}

function testPersistenceAndReload() {
  const storage = memoryStorage();
  const first = loadSettings(storage);
  first.Settings.setSound(false);
  first.Settings.setReduceMotion(true);
  first.Settings.setFeel('pro');
  first.Settings.setFlickFeedback(true);
  assert.deepEqual(storage.read('flipgame.settings.v1'), {
    sound: false, reduceMotion: true, feel: 'pro', flickFeedback: true,
  }, 'every setter immediately persists the canonical settings object');

  const reloaded = loadSettings(storage);
  assert.equal(reloaded.Settings.sound, false, 'mute reloads');
  assert.equal(reloaded.Settings.reduceMotion, true, 'explicit reduced motion reloads');
  assert.equal(reloaded.Settings.feel, 'pro', 'feel reloads');
  assert.equal(reloaded.Settings.flickFeedback, true, 'flick feedback reloads');
  reloaded.Settings.setFeel('invalid');
  assert.equal(reloaded.Settings.feel, 'standard', 'invalid feel values fail to the stable default');
}

function testOneTimeLegacySetupMigration() {
  const legacySetup = {
    rows: [{ id: 'seat-1', name: 'Ada' }], difficulty: 'hard', future: { kept: true },
    feel: 'forgiving', feedback: true, reduceMotion: true,
  };
  const partial = memoryStorage({
    'flipgame.settings.v1': JSON.stringify({ sound: false }),
    'flipgame.setup.v2': JSON.stringify(legacySetup),
  });
  const migrated = loadSettings(partial).Settings;
  assert.equal(migrated.sound, false);
  assert.equal(migrated.reduceMotion, true);
  assert.equal(migrated.feel, 'forgiving');
  assert.equal(migrated.flickFeedback, true);
  assert.deepEqual(partial.read('flipgame.settings.v1'), {
    sound: false, reduceMotion: true, feel: 'forgiving', flickFeedback: true,
  }, 'legacy setup selections migrate into the canonical settings object');
  assert.deepEqual(partial.read('flipgame.setup.v2'), {
    rows: legacySetup.rows, difficulty: 'hard', future: { kept: true },
  }, 'migration removes only obsolete preference copies from saved setup');

  const canonical = memoryStorage({
    'flipgame.settings.v1': JSON.stringify({
      sound: true, reduceMotion: false, feel: 'pro', flickFeedback: false,
    }),
    'flipgame.setup.v2': JSON.stringify(legacySetup),
  });
  const preferred = loadSettings(canonical).Settings;
  assert.deepEqual({
    sound: preferred.sound, reduceMotion: preferred.reduceMotion,
    feel: preferred.feel, flickFeedback: preferred.flickFeedback,
  }, { sound: true, reduceMotion: true, feel: 'forgiving', flickFeedback: true },
  'v110 setup selections override stale canonical defaults once while sound remains canonical');
  assert.deepEqual(canonical.read('flipgame.settings.v1'), {
    sound: true, reduceMotion: true, feel: 'forgiving', flickFeedback: true,
  });
  assert.equal(canonical.read('flipgame.setup.v2').feel, undefined);
  const afterMigrationReload = loadSettings(canonical).Settings;
  assert.deepEqual({
    sound: afterMigrationReload.sound, reduceMotion: afterMigrationReload.reduceMotion,
    feel: afterMigrationReload.feel, flickFeedback: afterMigrationReload.flickFeedback,
  }, { sound: true, reduceMotion: true, feel: 'forgiving', flickFeedback: true },
  'after obsolete setup fields are removed, reload uses canonical settings without repeating migration');
}

function functionSection(source, start, end) {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  assert.ok(from >= 0 && to > from, `missing source section ${start}`);
  return source.slice(from, to);
}

function namedFunction(source, name) {
  const from = source.indexOf(`function ${name}(`);
  assert.ok(from >= 0, `missing function ${name}`);
  const open = source.indexOf('{', from);
  let depth = 0;
  for (let index = open; index < source.length; index++) {
    if (source[index] === '{') depth++;
    if (source[index] === '}' && --depth === 0) return source.slice(from, index + 1);
  }
  throw new Error(`unterminated function ${name}`);
}

function testReducedMotionRuntimeAndCheckbox() {
  const calls = [];
  const runtime = {
    Settings: { reduceMotion: false },
    window: { matchMedia: () => ({ matches: false }) },
    document: { body: { classList: { toggle: (name, active) => calls.push(['class', name, active]) } } },
    Renderer: { setReduceMotion: (active) => calls.push(['renderer', active]) },
  };
  vm.createContext(runtime);
  vm.runInContext(`${namedFunction(mainSource, 'reduceMotionActive')}\n${namedFunction(mainSource, 'applyReducedMotion')}`, runtime);
  assert.equal(vm.runInContext('reduceMotionActive()', runtime), false);
  runtime.window.matchMedia = () => ({ matches: true });
  assert.equal(vm.runInContext('reduceMotionActive()', runtime), true,
    'OS preference activates reduced motion when the explicit setting is off');
  runtime.window.matchMedia = () => ({ matches: false });
  runtime.Settings.reduceMotion = true;
  assert.equal(vm.runInContext('applyReducedMotion()', runtime), true,
    'explicit preference activates reduced motion independently of the OS');
  assert.deepEqual(calls, [['class', 'reduce-motion', true], ['renderer', true]]);

  const storage = memoryStorage();
  const checkboxRuntime = loadSettings(storage);
  let listener = null;
  const toggle = { checked: true, addEventListener(type, callback) {
    assert.equal(type, 'change'); listener = callback;
  } };
  let applied = 0;
  checkboxRuntime.document = { getElementById: () => toggle };
  checkboxRuntime.applyReducedMotion = () => {
    applied++;
    assert.equal(storage.read('flipgame.settings.v1').reduceMotion, toggle.checked,
      'checkbox persistence completes before renderer application');
  };
  checkboxRuntime.saveSetup = () => {};
  vm.runInContext(functionSection(mainSource, 'const reduceMotionToggle', 'let labLastSuccessful'), checkboxRuntime);
  assert.equal(typeof listener, 'function');
  listener();
  assert.equal(checkboxRuntime.Settings.reduceMotion, true);
  assert.equal(applied, 1);
  toggle.checked = false;
  listener();
  assert.equal(checkboxRuntime.Settings.reduceMotion, false);
  assert.equal(applied, 2);
}

function testFeelFeedbackAndMuteHandlers() {
  const storage = memoryStorage();
  const runtime = loadSettings(storage);
  const feel = { value: 'pro', addEventListener(type, callback) { this[type] = callback; } };
  const feedback = { checked: true, addEventListener(type, callback) { this[type] = callback; } };
  let setupSaves = 0;
  runtime.document = {
    querySelectorAll: (selector) => selector === 'input[name="feel"]' ? [feel] : [],
    getElementById: (id) => id === 'flick-feedback-toggle' ? feedback : null,
  };
  runtime.saveSetup = () => { setupSaves++; };
  vm.runInContext(functionSection(mainSource,
    'document.querySelectorAll(\'input[name="feel"]\')',
    "document.querySelectorAll('input[name=\"direction\"]"), runtime);
  feel.change();
  feedback.change();
  assert.equal(runtime.Settings.feel, 'pro');
  assert.equal(runtime.Settings.flickFeedback, true);
  assert.equal(storage.read('flipgame.settings.v1').feel, 'pro');
  assert.equal(storage.read('flipgame.settings.v1').flickFeedback, true);
  assert.equal(setupSaves, 2);

  let muteListener = null;
  const muteBtn = { addEventListener(type, callback) { assert.equal(type, 'click'); muteListener = callback; } };
  const soundCalls = [];
  runtime.muteBtn = muteBtn;
  runtime.Sound = {
    setMuted: (value) => soundCalls.push(['muted', value]),
    unlock: () => soundCalls.push(['unlock']),
  };
  runtime.syncMuteBtn = () => soundCalls.push(['sync']);
  vm.runInContext(functionSection(mainSource,
    "if (muteBtn) muteBtn.addEventListener('click'", 'if (passGoBtn)'), runtime);
  assert.equal(typeof muteListener, 'function');
  muteListener();
  assert.equal(runtime.Settings.sound, false);
  assert.deepEqual(soundCalls, [['muted', true], ['sync']]);
  muteListener();
  assert.equal(runtime.Settings.sound, true);
  assert.deepEqual(soundCalls.slice(-3), [['muted', false], ['unlock'], ['sync']]);

  const reloaded = loadSettings(storage).Settings;
  assert.equal(reloaded.sound, true);
  assert.equal(reloaded.feel, 'pro');
  assert.equal(reloaded.flickFeedback, true);
}

function testMainUsesCanonicalSettings() {
  assert.ok(mainSource.includes('const Settings = window.Settings;'),
    'main aliases the exact browser-global object');
  assert.ok(mainSource.includes("if (!Settings) throw new Error('Settings must load before main.js')"));
  assert.match(mainSource, /function chosenFeel\(\) \{\s*return Settings\.feel;\s*\}/);
  assert.match(mainSource, /function flickFeedbackOn\(\) \{\s*return Settings\.flickFeedback;\s*\}/);

  const savedSetup = functionSection(mainSource, 'function saveSetup()', 'function loadSetup()');
  assert.ok(!/\bfeel\s*:|\bfeedback\s*:|\breduceMotion\s*:/.test(savedSetup),
    'setup v2 no longer writes duplicate preference state');
  const loadedSetup = functionSection(mainSource, 'function loadSetup()', '// Persist feel / flick-feedback');
  assert.ok(!/s\.(feel|feedback|reduceMotion)/.test(loadedSetup),
    'setup reload never overrides canonical settings');

  const reduceHandler = functionSection(mainSource,
    "if (reduceMotionToggle) reduceMotionToggle.addEventListener('change'", 'let labLastSuccessful');
  assert.ok(reduceHandler.indexOf('Settings.setReduceMotion(reduceMotionToggle.checked)') >= 0);
  assert.ok(reduceHandler.indexOf('Settings.setReduceMotion(reduceMotionToggle.checked)') <
    reduceHandler.indexOf('applyReducedMotion()'),
  'reduced-motion checkbox persists before the same event applies it');
  assert.match(mainSource, /function reduceMotionActive\(\) \{[\s\S]*Settings\.reduceMotion[\s\S]*prefers-reduced-motion: reduce/,
    'effective reduced motion is the explicit setting OR the OS preference');
  assert.match(mainSource, /function applyReducedMotion\(\) \{[\s\S]*classList\.toggle\('reduce-motion', active\)[\s\S]*Renderer\.setReduceMotion\(active\)/,
    'the effective setting immediately updates both UI and renderer');
  assert.match(mainSource, /const onMq = \(\) => applyReducedMotion\(\)/,
    'OS preference changes reapply the effective setting');
  assert.match(mainSource, /Sound\.setMuted\(!Settings\.sound\)/,
    'Sound starts from the canonical mute setting');
  assert.match(mainSource, /Settings\.setFlickFeedback\(flickFeedbackEl\.checked\)/,
    'feedback UI writes the canonical setting');
  assert.match(mainSource, /syncPreferenceControls\(\);\s*Sound\.setMuted\(!Settings\.sound\);\s*applyReducedMotion\(\)/,
    'reload reflects controls and applies sound/motion from the canonical object');
}

testClassicScriptGlobalAndSingleObject();
testPersistenceAndReload();
testOneTimeLegacySetupMigration();
testReducedMotionRuntimeAndCheckbox();
testFeelFeedbackAndMuteHandlers();
testMainUsesCanonicalSettings();
console.log('v111 settings/browser-global tests passed.');
