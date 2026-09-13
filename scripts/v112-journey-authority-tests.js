'use strict';
// Focused application coverage for Cup, Team Clash, Alien, Insane, Story and
// Training after the recovered journey-authority repair.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('path');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');

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
  try {
    assert.deepEqual(Array.from(app.supported.formats), ['classic', 'cup', 'team-clash', 'battle']);
    assert.ok(app.supported.activities.includes('story'));
    assert.ok(app.supported.activities.includes('tutorial'));
    assert.deepEqual(Array.from(app.supported.physics), ['normal', 'insane', 'alien']);
    assert.equal(app.arenas().length, 23);
    assert.equal(app.achievements().length, 120);

    for (const formatId of ['classic', 'cup', 'team-clash']) {
      app.beginSession({ formatId, roster: [{ name: 'One' }, { name: 'Two' }] });
      const session = app.snapshot().session;
      assert.equal(session.request.formatId, formatId);
      assert.equal(session.status, 'active');
      app.abandonSession();
    }

    app.enableOwnerTesting('Howe Test Mode');
    for (const physicsModeId of ['alien', 'insane']) {
      app.beginSession({ physicsModeId, roster: [{ name: 'One' }, { name: 'Two' }] });
      assert.equal(app.snapshot().session.request.physicsModeId, physicsModeId);
      app.abandonSession();
    }
    app.disableOwnerTesting();

    const views = app.storyViews();
    assert.ok(views.hub && Array.isArray(views.hub.chapters));
    const request = app.createStoryRequest({
      chapterId: 'first-broadcast',
      humans: [{ id: 'human-1', displayName: 'One', flipperId: 'bottle' }],
    });
    assert.equal(request.activityId, 'story');
    assert.equal(request.formatId, 'classic');

    const prepared = app.prepareStory({
      chapterId: 'first-broadcast',
      humans: [{ id: 'human-1', displayName: 'One', flipperId: 'bottle' }],
    });
    assert.equal(prepared.request.activityContext.prescribedArena, true);
    assert.equal(prepared.card.schema, 'StoryBroadcastCardV1');
    assert.equal(app.snapshot().session, null);
    app.startPreparedStory(prepared.handle);
    assert.equal(app.snapshot().session.request.matchId, prepared.request.matchId);
    assert.equal(app.snapshot().session.status, 'active');
    app.abandonSession();

    const cancelled = app.prepareStory({
      chapterId: 'first-broadcast',
      humans: [{ id: 'human-1', displayName: 'One', flipperId: 'bottle' }],
    });
    app.cancelPreparedStory(cancelled.handle);
    assert.equal(app.snapshot().story, null);

    const tour = app.startTour({ human: { id: 'human-1', displayName: 'One', flipperId: 'bottle' } });
    assert.equal(tour.isolation.testData, true);
    assert.equal(tour.isolation.fcEligible, false);
    app.skipTour();
  } finally {
    close();
  }
  console.log('v1.12 journey authority application tests passed.');
}

run().catch((error) => { console.error(error); process.exitCode = 1; });
