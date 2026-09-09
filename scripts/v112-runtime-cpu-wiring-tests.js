#!/usr/bin/env node

'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const mainSource = read('js/main.js');
const rendererSource = read('js/renderer.js');

function extractFunction(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `missing function ${name}`);
  const open = source.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    if (source[i] === '{') depth++;
    if (source[i] === '}' && --depth === 0) return source.slice(start, i + 1);
  }
  throw new Error(`unterminated function ${name}`);
}

async function testDevelopmentBootOrder() {
  const scripts = [];
  const styles = [];
  const listeners = new Map();
  const body = {
    classList: { add() {}, contains() { return false; } },
    appendChild(element) {
      if (element.tagName === 'SCRIPT') {
        scripts.push(element.src);
        queueMicrotask(() => element.onload());
      }
    },
  };
  const head = {
    appendChild(element) {
      if (element.tagName === 'LINK') {
        styles.push(element.href);
        queueMicrotask(() => element.onload());
      }
    },
  };
  const document = {
    body,
    head,
    getElementById() { return null; },
    createElement(tag) {
      return {
        tagName: String(tag).toUpperCase(),
        addEventListener() {},
        setAttribute() {},
        appendChild() {},
      };
    },
  };
  const location = {
    protocol: 'http:', hostname: 'localhost', href: 'http://localhost/flipgame/', reload() {},
  };
  const window = {
    document,
    location,
    addEventListener(type, handler) { listeners.set(type, handler); },
  };
  const context = vm.createContext({
    window, document, location, navigator: {}, URL, Promise, Error, Object,
    console: { error() {} }, setTimeout, clearTimeout, queueMicrotask,
  });
  vm.runInContext(read('js/v111-boot.js'), context, { filename: 'js/v111-boot.js' });
  assert.equal(await window.__FLIPGAME_BOOT_PROMISE__, true);
  const cpuIndex = scripts.indexOf('js/v112-cpu.js?v=111');
  const physicsIndex = scripts.indexOf('js/physics.js?v=111');
  const mainIndex = scripts.indexOf('js/main.js?v=111');
  assert.ok(physicsIndex >= 0 && cpuIndex > physicsIndex && mainIndex > cpuIndex,
    `CPU module must load after Physics and before main: ${scripts.join(', ')}`);
  assert.equal(window.__FLIPGAME_BOOT_VERSION__, 'v1.11',
    'staged development wiring must not change release identity');
  assert.deepEqual(styles, ['css/style.css?v=111', 'css/v112-broadcast.css?v=111']);
}

function cpuHarness({ alienSkin = false, predictedEvent = null } = {}) {
  const calls = { targets: [], intents: [], releases: [] };
  const game = {
    state: 'TURN_START',
    turnCounter: 17,
    currentPlayerIndex: 2,
    difficulty: 'hard',
    insanity: false,
    currentPlayer() { return { skin: alienSkin ? 'alien' : 'bottle', name: 'CPU' }; },
  };
  const Physics = {
    rareEventForSeed(seed) { calls.eventSeed = seed; return predictedEvent; },
    alienTargetForSeed(seed) {
      calls.targets.push(seed);
      return { x: 314, y: 271, worldW: 1640, worldH: 700, viewW: 1280, viewH: 720 };
    },
    getViewHint() { return { worldW: 1280 }; },
  };
  const window = {
    innerWidth: 1280,
    innerHeight: 720,
    Skins: { physicsFor: () => ({ floorResolve: alienSkin }) },
    FlipgameV112Cpu: {
      createLaunch(value) {
        calls.intents.push(value);
        return { seed: value.seed, vx: 612, vy: -1840, inputFeelMode: 'standard' };
      },
    },
  };
  const context = vm.createContext({
    window,
    Skins: window.Skins,
    Physics,
    game,
    GAME_STATES: { TURN_START: 'TURN_START', ON_FIRE: 'ON_FIRE' },
    currentMatchOptions: {},
    BASE_SKIN: 'bottle',
    isMrHoweName: () => false,
    onFlick(vx, vy, source) { calls.releases.push({ vx, vy, source }); },
  });
  for (const name of ['predictedCpuEvent', 'aiFlick', 'cpuLaunchPolicy', 'turnArenaSeed']) {
    vm.runInContext(extractFunction(mainSource, name), context, { filename: `main.js#${name}` });
  }
  return { context, calls };
}

function testLiveCpuIntentAndSeedBinding() {
  const normal = cpuHarness();
  normal.context.aiFlick();
  assert.equal(normal.calls.intents.length, 1);
  assert.equal(normal.calls.intents[0].physicsModeId, 'normal');
  assert.equal(normal.calls.intents[0].target, null);
  assert.equal(normal.calls.releases[0].source.inputFeelMode, 'standard');
  assert.equal(normal.calls.releases[0].source.seed, normal.calls.intents[0].seed);
  assert.equal(normal.calls.eventSeed, normal.calls.intents[0].seed,
    'event prediction and CPU intent must use one seed');

  const nativeAlien = cpuHarness({ alienSkin: true });
  nativeAlien.context.aiFlick();
  assert.equal(nativeAlien.calls.intents[0].physicsModeId, 'alien');
  assert.equal(nativeAlien.calls.targets[0], nativeAlien.calls.intents[0].seed,
    'native Alien target and launch must use one seed');
  assert.equal(nativeAlien.calls.intents[0].target.x, 314);

  const invasion = cpuHarness({ predictedEvent: 'alien-invasion' });
  invasion.context.aiFlick();
  assert.equal(invasion.calls.intents[0].physicsModeId, 'alien');
  assert.equal(invasion.calls.targets[0], invasion.calls.intents[0].seed,
    'Alien Invasion target and launch must use one seed');

  const repeated = cpuHarness({ alienSkin: true });
  repeated.context.aiFlick();
  assert.equal(JSON.stringify(repeated.calls.intents[0]), JSON.stringify(nativeAlien.calls.intents[0]),
    'the same turn/seat state must create the same prelaunch intent');

  const aiBlock = mainSource.slice(
    mainSource.indexOf('function aiFlick('),
    mainSource.indexOf('function cpuLaunchPolicy('),
  );
  assert.doesNotMatch(aiBlock, /Math\.random\s*\(/,
    'live CPU aimer must not fall back to Math.random');
  assert.match(aiBlock, /FlipgameV112Cpu/);
}

function testCpuPolicyReachesLaunchBoundary() {
  const context = vm.createContext({
    onlineMode: false,
    window: {},
    currentMatchOptions: {},
    claimMirrorCopy: () => null,
    mirrorLaunch: (_claim, vx, vy) => ({ vx, vy, claim: null }),
    launchFlick(...args) { context.launchArgs = args; },
  });
  vm.runInContext(extractFunction(mainSource, 'cpuLaunchPolicy'), context);
  vm.runInContext(extractFunction(mainSource, 'onFlick'), context);
  context.onFlick(500, -1800, { source: 'cpu', seed: 0xf00d, inputFeelMode: 'standard' });
  assert.equal(context.launchArgs[2], 0xf00d);
  assert.equal(context.launchArgs[4].inputFeelMode, 'standard');

  assert.match(mainSource,
    /Physics\.applyFlick[\s\S]*?inputFeelMode:\s*launchPolicy\?\.inputFeelMode/,
    'launch boundary must forward CPU Standard Feel into Physics.applyFlick');
}

function loadPhysics(width = 1280, height = 720) {
  const window = { matchMedia: () => ({ matches: false }) };
  const context = vm.createContext({ console, window, Math });
  vm.runInContext(read('js/vendor/matter.min.js'), context);
  vm.runInContext(read('js/physics.js') + '\nthis.__physics = Physics;', context);
  context.__physics.init(width, height);
  context.__physics.setProfile({
    floorResolve: true,
    alienPortal: true,
    landOnTarget: true,
    keepWalls: true,
    wallBounce: 0.86,
    saucerCount: 6,
  });
  return context.__physics;
}

function testRendererUsesAuthoritativeSaucerTransform() {
  const physics = loadPhysics();
  physics.seedTurn(0x12345678);
  const obstacle = physics.getObstacles().saucers[0];
  assert.ok(obstacle && Number.isFinite(obstacle.angle));

  const rotations = [];
  const translations = [];
  const gradient = { addColorStop() {} };
  const ctx = {
    save() {}, restore() {}, beginPath() {}, ellipse() {}, fill() {}, stroke() {}, arc() {},
    translate(x, y) { translations.push({ x, y }); },
    rotate(angle) { rotations.push(angle); },
    createLinearGradient() { return gradient; },
  };
  const context = vm.createContext({ ctx, clock: 1, drawDeflectorPoly() {} });
  vm.runInContext(extractFunction(rendererSource, 'drawObstacles'), context);
  context.drawObstacles({ deflectors: [], saucers: [obstacle] });
  assert.deepEqual(translations[0], { x: obstacle.x, y: obstacle.y });
  assert.equal(rotations[0], obstacle.angle,
    'renderer must consume the exact authoritative physics angle');
  assert.doesNotMatch(extractFunction(rendererSource, 'drawObstacles'),
    /s\.angle\s*\*\s*0\.35/);
}

async function main() {
  await testDevelopmentBootOrder();
  testLiveCpuIntentAndSeedBinding();
  testCpuPolicyReachesLaunchBoundary();
  testRendererUsesAuthoritativeSaucerTransform();
  console.log('v1.12 live CPU/runtime and Alien renderer wiring tests passed.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
