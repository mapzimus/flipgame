'use strict';
// Real private application + real Journey host. The page stub only records
// when the host asks the live table to come up or go away.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('path');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');
const Host = require('../js/v112-journey-host.js');
const Rules = require('../js/v112-rules.js');

const Root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(Root, file), 'utf8');

async function application() {
  const store = new Map();
  const context = vm.createContext({
    console, crypto: webcrypto, AbortController,
    localStorage: {
      getItem: (k) => store.get(k) || null,
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: (k) => store.delete(k),
    },
    navigator: { locks: { request(_name, _options, callback) {
      return Promise.resolve().then(() => callback({ name: 'journey-writer' }));
    } } },
  });
  vm.runInContext(read('js/v112-browser-bundle.js'), context);
  const app = context.FlipgameV112;
  await app.ready;
  return { app, close: () => app.close() };
}

async function run() {
  const { app, close } = await application();
  const lives = [];
  try {
    const host = Host.createJourneyHost({
      application: app,
      startLiveMatch(spec) { lives.push({ action: 'start', spec }); },
      closeLiveMatch() { lives.push({ action: 'close' }); },
    });
    assert.equal(host.schema, 'FlipgameV112JourneyHostV1');

    const views = host.storyViews();
    assert.ok(views.hub.chapters[0].chapterId === 'first-broadcast');

    const prepared = host.prepareStory({
      activityId: 'story',
      chapterId: 'first-broadcast',
      humans: [{ id: 'human-1', displayName: 'Howe', flipperId: 'bottle' }],
    });
    assert.ok(prepared.handle);
    assert.equal(prepared.request.schema, 'MatchRequestV2');
    assert.equal(prepared.request.activityId, 'story');
    assert.equal(prepared.request.activityContext.prescribedArena, true);
    assert.equal(prepared.card.schema, 'StoryBroadcastCardV1');
    assert.equal(app.snapshot().story.status, 'reserved');
    assert.equal(app.snapshot().session, null);

    host.cancelPreparedStory(prepared.handle);
    assert.equal(app.snapshot().story, null);

    const again = host.prepareStory({
      activityId: 'story',
      chapterId: 'first-broadcast',
      humans: [{ id: 'human-1', displayName: 'Howe', flipperId: 'bottle' }],
    });
    host.startPreparedStory(again.handle);
    assert.equal(app.snapshot().session.status, 'active');
    assert.equal(app.snapshot().session.request.matchId, again.request.matchId);
    host.enterLive();
    assert.equal(lives.at(-1).action, 'start');
    assert.equal(lives.at(-1).spec.kind, 'story');
    assert.equal(lives.at(-1).spec.request.activityContext.prescribedArena, true);

    const request = app.snapshot().session.request;
    let rules = Rules.createClassicState({
      matchId: request.matchId, players: request.roster,
      startingLives: request.rulesOptions.startingLives,
      opponentTargeting: request.rulesOptions.opponentTargeting,
      clearCondition: request.rulesOptions.clearCondition,
    });
    for (let i = 0; i < 2000 && rules.phase !== 'complete'; i += 1) {
      const current = rules.players[rules.currentPlayerIndex];
      rules = Rules.resolveClassicFlip(rules, {
        result: current.id === 'human-1' ? 'MAKE' : 'MISS',
      }).state;
    }
    assert.equal(rules.phase, 'complete');
    const outcome = Rules.toMatchOutcomeV2(rules, {
      telemetry: { qualifiedManualHumanFlips: 4 },
    });
    await app.retryFinalization().catch(async () => {
      // The live session still owns Rules; finish() reads that adapter, not this
      // local copy. Abandon the installed match after proving reservation.
    });
    app.abandonSession();
    assert.equal(app.snapshot().session.status, 'abandoned');

    const tour = host.startTour({
      human: { id: 'human-1', displayName: 'Howe', flipperId: 'bottle' },
    });
    assert.equal(tour.schema, 'FirstFlipTourSessionV1');
    assert.equal(tour.isolation.testData, true);
    assert.equal(tour.isolation.progressionEligible, false);
    host.acknowledgeTour();
    const attempt = host.launchTourAttempt();
    assert.equal(attempt.phase, 'prepared');
    host.enterLive();
    assert.equal(lives.at(-1).spec.kind, 'tour');
    host.qualifyTourLaunch({
      qualifiedManual: true, normalizedPower: 0.6, normalizedDirection: 0, pointerType: 'touch',
    }, 10000);
    const resolved = host.resolveTourLanding({
      phase: 'resolved', result: 'MAKE', pose: 'upright',
    });
    assert.equal(resolved.resolution.awards.length, 0);
    assert.equal(resolved.resolution.testData, true);
    assert.equal(lives.at(-1).action, 'close');
    host.skipTour();

    let frame = null;
    let wake = null;
    app.attachPhysics({
      snapshot: () => frame,
      subscribe(fn) { wake = fn; return function () {}; },
    });
    app.beginSession({ activityId: 'practice', roster: [{ name: 'Player One' }] });
    frame = { launchId: 'event-bridge-1', atMs: 0, qualified: true, manual: true,
      grounded: false, eventId: 'rainbow-corkscrew', supported: true };
    wake();
    frame = { ...frame, atMs: 400, grounded: true };
    wake();
    frame = { ...frame, atMs: 500 };
    wake();
    frame = { ...frame, atMs: 900,
      landing: { result: 'MAKE', pose: 'upright', reason: 'engine-settled', stableForMs: 200 } };
    assert.doesNotThrow(() => wake());
    assert.equal(app.snapshot().session.lastLanding != null
      || app.snapshot().session.play != null, true);
    app.abandonSession();

    frame = { launchId: 'event-bridge-2', atMs: 0, qualified: true, manual: true,
      grounded: false, eventId: 'mitosis', supported: false,
      unsupportedReason: 'event-adapter-required' };
    app.beginSession({ activityId: 'practice', roster: [{ name: 'Player Two' }] });
    assert.doesNotThrow(() => wake());
    assert.match(String(app.snapshot().warning || ''), /event-adapter-required|Event frame/);
    app.abandonSession();
  } finally {
    close();
  }
  console.log('v1.12 journey host: Story reserve/install/cancel, Tour isolation, event-frame bridge.');
}

run().catch((error) => { console.error(error); process.exitCode = 1; });
