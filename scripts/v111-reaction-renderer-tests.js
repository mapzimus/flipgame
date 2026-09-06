#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Reaction = require('../js/v111-reaction-renderer.js');
const Legacy = require('../js/v111-legacy-object-dynamics.js');
const Manifest = require('../js/v111-object-manifest.js');

const LEGACY_TRUE = ['bowlingpin', 'cone', 'pawn', 'whippedcream', 'lawnchair', 'alien'];
const NEW_TRUE = ['penguin', 'owl', 'giraffe', 'red-panda', 'eyeball-monster', 'huge-rubber-duck', 'action-figures'];
const VIEWPORTS = [[360, 740], [768, 1024], [1280, 720], [1366, 768], [1920, 1080], [3840, 2160]];

function main() {
  const legacyIds = Array.from(Legacy.ids);
  const newIds = Manifest.objects.map((entry) => entry.id);
  const allIds = legacyIds.concat(newIds);
  assert.equal(new Set(allIds).size, 51, 'the renderer contract must cover all 51 object IDs');

  assert.deepEqual(legacyIds.filter((id) => Legacy.faceFor(id).supportsEmotion), LEGACY_TRUE);
  assert.equal(Legacy.faceFor('bottle').supportsEmotion, false);
  assert.equal(Legacy.faceFor('trex').supportsEmotion, false);

  const artRoot = {
    FlipArtV111: {
      getRenderVariant(id) {
        assert.ok(newIds.includes(id));
        return {
          metrics: { pivot: { x: 150, y: 376 }, artScale: 0.74 },
          face: NEW_TRUE.includes(id)
            ? { anchor: { x: 150, y: 190 }, scale: 0.8, focusRadius: 54, supportsEmotion: true }
            : { anchor: { x: 150, y: 190 }, scale: 0.8, focusRadius: 54, supportsEmotion: false },
        };
      },
    },
  };
  for (const id of newIds) {
    const face = Reaction.faceFor(artRoot, id, 'blue-steel');
    assert.equal(!!face, NEW_TRUE.includes(id), `${id} explicit face eligibility diverged`);
    if (face) {
      assert.ok(Object.isFrozen(face) && Object.isFrozen(face.anchor));
      assert.deepEqual(face.anchor, { x: 0, y: (190 - 376) * 0.74 });
    }
  }
  assert.equal(Reaction.faceFor({}, 'unclassified', 'blue-steel'), null);
  assert.equal(Reaction.faceFor({ FlipLegacyDynamicsV111: Legacy }, 'bottle'), null);
  assert.equal(Reaction.faceFor({ FlipLegacyDynamicsV111: Legacy }, 'trex'), null);
  assert.equal(Reaction.faceFor({ FlipLegacyDynamicsV111: Legacy }, 'alien').supportsEmotion, true);

  const phases = {
    resolvedIdle: Reaction.emotionFor(null, { phase: 'resolved' }),
    airborne: Reaction.emotionFor(null, { phase: 'airborne' }),
    contact: Reaction.emotionFor(null, { phase: 'contact' }),
    settling: Reaction.emotionFor(null, { phase: 'settling' }),
    make: Reaction.emotionFor('MAKE', { phase: 'resolved' }),
    miss: Reaction.emotionFor('MISS', { phase: 'resolved' }),
  };
  assert.deepEqual(phases, {
    resolvedIdle: 'idle', airborne: 'scared', contact: 'scared', settling: 'scared',
    make: 'smile', miss: 'frown',
  });

  const source = {
    objectId: 'penguin', variantId: 'blue-steel', result: null,
    lifecycle: { phase: 'airborne' }, flipSeed: 'trajectory-42', time: 1.25,
    angle: 1.2, slosh: 0.3, angularVelocity: 8.5, velocity: { x: 140, y: -620 },
  };
  const one = Reaction.artState(source);
  const two = Reaction.artState({ ...source, velocity: { ...source.velocity } });
  assert.deepEqual(one, two, 'seed replay produced unstable paint inputs');
  assert.equal(one.flipSeed, 'trajectory-42');
  assert.equal(one.motionSeed, Reaction.motionSeed('trajectory-42', 'penguin', 'blue-steel'));
  assert.equal(one.time, 1.25);
  assert.equal(one.elapsed, 1.25);
  assert.equal(one.emotion, 'scared');
  assert.ok(Object.isFrozen(one) && Object.isFrozen(one.velocity));
  const reduced = Reaction.artState({ ...source, reducedMotion: true, result: 'MAKE' });
  assert.equal(reduced.emotion, 'smile', 'reduced motion removed the expression cue');
  assert.deepEqual(reduced.velocity, { x: 0, y: 0 });

  const face = Reaction.normalizeFace({
    anchor: { x: 0, y: -40 }, scale: 0.8, focusRadius: 48, supportsEmotion: true,
  }, null, 'legacy');
  for (const [width, height] of VIEWPORTS) {
    const controller = Reaction.createFocusController();
    const base = { zoom: 1, camX: width / 2, camY: height / 2 };
    const point = { x: width - 18, y: height - 18 };
    const request = {
      view: base, width, height, dt: 1 / 60, result: 'MAKE', key: 'seed',
      face, point, radius: 48, reducedMotion: false,
    };
    controller.next(request);
    const focused = controller.next(request);
    assert.equal(focused.reactionFocus, true);
    const screenX = width / 2 + (point.x - focused.camX) * focused.zoom;
    const screenY = height / 2 + (point.y - focused.camY) * focused.zoom;
    assert.ok(screenX >= 0 && screenX <= width, `${width}x${height} clipped face horizontally`);
    assert.ok(screenY >= 0 && screenY <= height, `${width}x${height} clipped face vertically`);
  }

  const unsupportedController = Reaction.createFocusController();
  const base = { zoom: 0.8, camX: 200, camY: 300 };
  assert.equal(unsupportedController.next({
    view: base, width: 1280, height: 720, result: 'MISS', face: null,
  }), base, 'unsupported art received a camera beat');
  const reducedController = Reaction.createFocusController();
  const restrained = reducedController.next({
    view: base, width: 1280, height: 720, result: 'MISS', face,
    point: { x: 500, y: 300 }, reducedMotion: true,
  });
  assert.ok(restrained.zoom <= base.zoom * 1.026, 'reduced-motion focus was not restrained');

  const root = path.join(__dirname, '..');
  const boot = fs.readFileSync(path.join(root, 'js/v111-boot.js'), 'utf8');
  const worker = fs.readFileSync(path.join(root, 'service-worker.js'), 'utf8');
  const renderer = fs.readFileSync(path.join(root, 'js/renderer.js'), 'utf8');
  const reactionSource = fs.readFileSync(path.join(root, 'js/v111-reaction-renderer.js'), 'utf8');
  const mainSource = fs.readFileSync(path.join(root, 'js/main.js'), 'utf8');
  for (const asset of ['v111-legacy-object-dynamics.js', 'v111-reaction-renderer.js']) {
    assert.ok(boot.includes(asset), `${asset} is missing from atomic boot`);
    assert.ok(worker.includes(asset), `${asset} is missing from offline precache`);
  }
  for (const field of ['motionSeed', 'flipSeed', 'angularVelocity', 'velocity', 'airborne', 'contact', 'impact', 'emotion']) {
    assert.ok((renderer + reactionSource).includes(field), `renderer does not forward ${field}`);
  }
  assert.ok(mainSource.includes('landingLifecycle') && mainSource.includes('flipSeed: lastFlickInfo'));
  assert.ok(renderer.includes('nextMotionKey !== motionFlipKey') && renderer.includes('time: motionElapsed'),
    'trajectory elapsed time is not reset at the bound flip seed');
  assert.ok(!renderer.includes("skin === 'trex'"), 'renderer special-cased or mutated original T-Rex art');
  assert.equal(typeof Reaction.createFocusController().next, 'function');

  console.log('v1.11 reaction renderer tests passed (51 IDs, lifecycle, seed, camera, protected art).');
}

main();
