'use strict';
// What the Battle screen actually says, rendered from real Rules states through
// the real mount(). Everything this file checks has been wrong at least once:
// a finished series shown under a live heat heading with an empty lane box and
// offers nobody could use, a relay Rush clock counted as wall seconds, and a
// one-lane relay announcing paired play it cannot give. The route is
// presentation, so its presentation is the thing worth pinning.
const assert = require('node:assert/strict');
const Routes = require('../js/v112-battle-routes.js');
const Battle = require('../js/v112-battle.js');

// The smallest document mount() can be honest in: element identity, parent and
// child order, text, classes and the few attributes the render reads back.
function fakeDocument(ids) {
  const registry = new Map();
  const doc = {
    activeElement: null,
    createElement(tag) { return element(tag); },
    getElementById(id) { return registry.get(id) || null; },
  };
  function element(tag) {
    const node = {
      tagName: String(tag).toUpperCase(), children: [], parent: null, dataset: {},
      classes: new Set(), disabled: false, type: '', listeners: new Map(),
      _text: '',
      get textContent() {
        return this.children.length
          ? this.children.map((child) => child.textContent).join('') : this._text;
      },
      set textContent(value) { this._text = String(value); this.children.length = 0; },
      classList: {
        add: (name) => node.classes.add(name),
        remove: (name) => node.classes.delete(name),
        contains: (name) => node.classes.has(name),
        toggle: (name, on) => { if (on) node.classes.add(name); else node.classes.delete(name); },
      },
      append(...nodes) { nodes.forEach((child) => { child.parent = node; node.children.push(child); }); },
      replaceChildren() { node.children.length = 0; },
      addEventListener(type, handler) { node.listeners.set(type, handler); },
      setAttribute(name, value) { node[name] = value; },
      focus() { doc.activeElement = node; },
      click() { const handler = node.listeners.get('click'); if (handler) return handler(); },
      querySelectorAll(selector) { return descendants(node).filter((child) => matches(child, selector)); },
      querySelector(selector) { return node.querySelectorAll(selector)[0] || null; },
    };
    return node;
  }
  function descendants(node) {
    return node.children.flatMap((child) => [child, ...descendants(child)]);
  }
  function matches(node, selector) {
    return selector.split(',').map((part) => part.trim()).some((part) => {
      const [tag, ...classes] = part.split('.');
      if (tag && node.tagName !== tag.toUpperCase()) return false;
      return classes.every((name) => node.classes.has(name));
    });
  }
  ids.forEach((id) => { const node = element('div'); node.id = id; registry.set(id, node); });
  return { doc, element };
}

const IDS = ['battle-screen', 'battle-body', 'battle-message', 'battle-back',
  'battle-stage', 'battle-open', 'battle-title'];

const roster = (count) => Array.from({ length: count }, (_, index) => ({
  id: 'p' + (index + 1), displayName: 'Entry ' + (index + 1), flipperId: 'bottle', type: 'human' }));

// A host with no authority of its own: it hands the screen real Rules states.
function screen(options = {}) {
  const hardware = options.hardware || { width: 1280, verifiedContacts: 4 };
  const { doc } = fakeDocument(IDS);
  let state = null, status = 'playing', wake = () => {};
  const host = { schema: 'FlipgameV112BattleHostV1',
    capabilities: () => Battle.hardwareProfile(hardware),
    prepare: async (request) => { state = Battle.createState({ ...request, matchId: 'presentation',
      seed: 17, hardware }); return { handle: 'handle' }; },
    start: async () => { state = Battle.startHeat(state); },
    snapshot: () => (state ? { status, state, lanes: status === 'playing'
      ? state.activePlayerIds.map((id, index) => ({ laneId: 'lane' + index, playerId: id,
        status: 'Flick to launch' })) : [] } : null),
    subscribe: (fn) => { wake = fn; return () => { wake = () => {}; }; },
    cancel: async () => {}, abandon: async () => { status = 'settled'; wake(); },
    choosePower: async () => {}, retryFinalization: async () => {},
  };
  const controller = Routes.mount({ document: doc, getHost: () => host,
    getPlayers: () => roster(options.count || 2), onOpen() {}, onHome() {}, onEditRoster() {} });
  return {
    doc, controller, host,
    body: () => doc.getElementById('battle-body').textContent,
    heading: () => {
      const found = doc.getElementById('battle-body').querySelectorAll('h2');
      return found.length ? found[0].textContent : '';
    },
    buttons: () => doc.getElementById('battle-body').querySelectorAll('button').map((n) => n.textContent),
    laneBoxes: () => doc.getElementById('battle-body').querySelectorAll('div.battle-lane-status').length,
    stageHidden: () => doc.getElementById('battle-stage').classList.contains('hidden'),
    backDisabled: () => doc.getElementById('battle-back').disabled,
    open() { doc.getElementById('battle-open').click(); },
    finish(value) { status = value; wake(); },
    get state() { return state; },
    attempt(playerId, pose, id) {
      state = Battle.recordAttempt(state, { attemptId: id, playerId, pose, qualifiedManual: true });
      // Opening the next heat is the host's job on a real table; here it only has
      // to happen so a series can reach the result this file is about.
      if (state.phase === 'between-heats') state = Battle.startHeat(state);
      wake();
    },
  };
}

// Every competitor lands the same pose, so the heat can only be decided in
// sudden death. That is the one phase whose name depends on the hardware.
function playToSuddenDeath(view) {
  let attempt = 0;
  while (!view.state.suddenDeath && view.state.phase === 'active') {
    assert.ok((attempt += 1) < 200, 'A tied heat has to reach sudden death');
    for (const playerId of view.state.activePlayerIds.slice()) {
      view.attempt(playerId, 'upright', 'tie-' + attempt + '-' + playerId);
    }
  }
}

async function testALiveRelayNamesTheClockItCounts() {
  const view = screen({ hardware: { width: 360, verifiedContacts: 1 } });
  view.open();
  view.controller.configure({ paceId: 'rush' });
  assert.match(view.body(), /the clock only runs while a lane is yours/,
    'A relay Rush heat has to say what its minute is');
  assert.equal(await view.controller.start(), true);
  assert.match(view.heading(), /gameplay clock/,
    'A relay Rush heading counts a gameplay clock, not wall seconds: ' + view.heading());
  assert.equal(view.stageHidden(), false, 'A running heat needs its pointer surface');
}

async function testASimultaneousRushSaysNothingAboutARelay() {
  const view = screen({ hardware: { width: 1280, verifiedContacts: 4 }, count: 4 });
  view.open();
  view.controller.configure({ formatId: 'four-way', paceId: 'rush' });
  assert.doesNotMatch(view.body(), /while a lane is yours/,
    'Simultaneous lanes are not a relay');
  assert.equal(await view.controller.start(), true);
}

async function testSuddenDeathIsOnlyPairedWhereItCanBe() {
  const relay = screen({ hardware: { width: 360, verifiedContacts: 1 } });
  relay.open();
  assert.equal(await relay.controller.start(), true);
  playToSuddenDeath(relay);
  assert.equal(relay.state.activePlayerIds.length, 1,
    'One lane takes its sudden-death turns one at a time');
  assert.match(relay.heading(), /Sudden death/);
  assert.doesNotMatch(relay.heading(), /Paired/,
    'A relay cannot pair sudden death: ' + relay.heading());

  const paired = screen({ hardware: { width: 1280, verifiedContacts: 4 } });
  paired.open();
  assert.equal(await paired.controller.start(), true);
  playToSuddenDeath(paired);
  assert.equal(paired.state.activePlayerIds.length, 2, 'Two lanes pair sudden death');
  assert.match(paired.heading(), /Paired sudden death/);
}

async function testAFinishedSeriesShowsAResultAndNothingLive() {
  const view = screen();
  view.open();
  assert.equal(await view.controller.start(), true);
  let guard = 0;
  while (view.state.phase !== 'complete') {
    assert.ok((guard += 1) < 400, 'The series has to finish');
    for (const playerId of view.state.activePlayerIds.slice()) {
      view.attempt(playerId, playerId === 'p1' ? 'cap' : 'miss', 'run-' + guard + '-' + playerId);
    }
  }
  view.finish('settled');
  const heading = view.heading();
  assert.match(heading, /takes it/, 'A finished series says who won: ' + heading);
  assert.doesNotMatch(heading, /Volley|gameplay clock/, 'A result is not a live heat: ' + heading);
  assert.doesNotMatch(view.body(), /wait for your active lane/,
    'A finished series stops telling people to wait');
  assert.doesNotMatch(view.body(), /charges/,
    'Charges only matter to a launch that can still be armed');
  assert.equal(view.laneBoxes(), 0, 'A result has no lane-sized hole in it');
  assert.equal(view.stageHidden(), true, 'A settled series gives the glass back');
  assert.equal(view.backDisabled(), false, 'A settled series can be left');
  assert.match(view.body(), /Battle complete/);
}

async function testASaveInProgressCannotBeWalkedOutOn() {
  const view = screen();
  view.open();
  assert.equal(await view.controller.start(), true);
  view.finish('finalizing');
  assert.equal(view.backDisabled(), true, 'A reward on its way to storage keeps the screen');
  assert.match(view.body(), /Saving the authoritative result/);
  assert.equal(view.stageHidden(), true, 'A series that takes no more launches needs no stage');
  view.finish('retryable');
  assert.equal(view.buttons().includes('Retry saving'), true, 'A failed save offers the retry');
}

(async () => {
  await testALiveRelayNamesTheClockItCounts();
  await testASimultaneousRushSaysNothingAboutARelay();
  await testSuddenDeathIsOnlyPairedWhereItCanBe();
  await testAFinishedSeriesShowsAResultAndNothingLive();
  await testASaveInProgressCannotBeWalkedOutOn();
  console.log('Battle presentation tests passed: a relay names the gameplay clock it counts, sudden death is only called paired where two lanes can pair it, a finished series announces its winner with no live chrome or dead charges left on screen, and a reward on its way to storage keeps the screen until it lands.');
})().catch((error) => { console.error(error); process.exitCode = 1; });
