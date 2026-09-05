'use strict';

const assert = require('node:assert/strict');
const manifest = require('../js/v111-object-manifest.js');

const EXPECTED_OBJECT_NAMES = [
  'Coffee Mug',
  'Milk Carton',
  'Teapot',
  'Salt/Pepper Shaker',
  'Soup Can',
  'Smoothie',
  'Gumball Machine',
  'Microscope',
  'Desk Globe',
  'Microphone on a Stand',
  'Potted Plants',
  'Penguin',
  'Owl',
  'Giraffe',
  'Red Panda',
  'Trophy Cup',
  'Snow Globe',
  'Eyeball Monster',
  'Soda Can',
  'Watering Can',
  'Pinata',
  'Huge Rubber Duck',
  'Action Figures',
  'Tall Buildings',
  'Box of Snacks',
];

const EXPECTED_FLAVORS = [
  ['blue', 'Blue', '#1f9bff'],
  ['red', 'Red', '#e3263c'],
  ['lime', 'Lime', '#8ed11a'],
  ['orange', 'Orange', '#ff7a00'],
  ['purple', 'Purple', '#8a3ffc'],
  ['ice', 'Ice', '#5fcfe6'],
  ['green', 'Green', '#3fae1a'],
  ['berry', 'Berry', '#ff5b86'],
  ['indigo', 'Indigo', '#4f63e0'],
  ['yellow', 'Yellow', '#ffc233'],
  ['cherry', 'Cherry', '#c8203a'],
  ['pink', 'Pink', '#ff9ecf'],
];

const EXPECTED_UNLOCKS = Array.from({ length: 25 }, (_, index) => 2 + index * 4);
const SAFE_ID = /^[a-z][a-z0-9_]*$/;
const BANNED_TUNING_KEYS = new Set([
  'mass',
  'density',
  'friction',
  'frictionAir',
  'restitution',
  'inertia',
  'gravity',
  'gravityScale',
  'collisionFilter',
  'vertices',
  'width',
  'height',
  'angle',
  'spin',
  'launch',
  'force',
  'torque',
]);
const BANNED_BRANDS = /\b(?:coca[- ]?cola|coke|pepsi|starbucks|stanley|tabasco|gatorade|mcdonald'?s|disney|marvel|pokemon|lego|nerf)\b/i;

function assertUnique(values, label) {
  assert.equal(new Set(values).size, values.length, `${label} must be globally unique`);
}

function findBannedKey(value, path = 'manifest') {
  if (!value || typeof value !== 'object') return null;
  for (const [key, child] of Object.entries(value)) {
    const childPath = `${path}.${key}`;
    if (BANNED_TUNING_KEYS.has(key)) return childPath;
    const nested = findBannedKey(child, childPath);
    if (nested) return nested;
  }
  return null;
}

assert.equal(manifest.schema, 'FlipgameObjectManifestV1');
assert.equal(manifest.schemaVersion, 1);
assert.equal(manifest.contractRevision, 1);
assert.equal(manifest.releaseVersion, 'v111');
assert.equal(manifest.collisionPolicy, 'all-non-alien-objects-share-standard-competitive-v1');
assert.equal(manifest.unlockPolicy, 'all-12-variants-available-with-object');

assert.equal(manifest.objects.length, 25, 'v111 must add exactly 25 objects');
assert.equal(manifest.flavorOrder.length, 12, 'every object must expose exactly 12 flavors');
assert.equal(manifest.variants.length, 300, '25 objects × 12 variants must produce 300 variants');
assert.deepEqual(manifest.objects.map(({ displayName }) => displayName), EXPECTED_OBJECT_NAMES);
assert.deepEqual(manifest.objects.map(({ unlockAtWins }) => unlockAtWins), EXPECTED_UNLOCKS);
assert.deepEqual(
  manifest.flavorOrder.map(({ id, displayName, color }) => [id, displayName, color]),
  EXPECTED_FLAVORS,
);

assertUnique(manifest.objects.map(({ id }) => id), 'object IDs');
assertUnique(manifest.objects.map(({ displayName }) => displayName), 'object display names');
assertUnique(manifest.variants.map(({ id }) => id), 'variant IDs');
assertUnique(manifest.variants.map(({ displayName }) => displayName), 'variant display names');

for (const [objectIndex, object] of manifest.objects.entries()) {
  assert.match(object.id, SAFE_ID, `${object.displayName} must have a stable machine-safe ID`);
  assert.equal(object.rosterOrder, objectIndex + 1);
  assert.equal(object.unlockAtWins, EXPECTED_UNLOCKS[objectIndex]);
  assert.equal(object.visibility, 'locked-until-owned');
  assert.equal(object.collisionProfile, 'standard-competitive-v1');
  assert.equal(object.variantsAvailableWithObject, true);
  assert.equal(typeof object.emoji, 'string');
  assert.ok(object.emoji.length > 0);
  assert.equal(typeof object.broadFamily, 'string');
  assert.ok(object.broadFamily.length > 0);
  assert.equal(typeof object.material, 'object');
  assert.ok(object.material && !Array.isArray(object.material));

  assert.deepEqual(Object.keys(object.dynamicArt).sort(), ['ambient', 'flight', 'impact', 'reducedMotion']);
  for (const value of Object.values(object.dynamicArt)) assert.equal(typeof value, 'string');
  assert.deepEqual(
    { brandFree: object.safety.brandFree, classroomSafe: object.safety.classroomSafe },
    { brandFree: true, classroomSafe: true },
  );
  assert.equal(typeof object.safety.note, 'string');
  assert.ok(object.safety.note.length > 0);

  if (object.liquid !== null) {
    assert.ok(['open', 'closed', 'sand'].includes(object.liquid.mode));
    assert.ok(object.liquid.fill >= 0 && object.liquid.fill <= 1);
    assert.equal(typeof object.liquid.viscosity, 'string');
  }

  assert.equal(object.variants.length, 12);
  assertUnique(object.variants.map(({ castLabel }) => castLabel), `${object.displayName} cast labels`);
  assertUnique(object.variants.map(({ silhouette }) => silhouette), `${object.displayName} silhouettes`);

  for (const [variantIndex, variant] of object.variants.entries()) {
    const [flavorId, flavorName, flavorColor] = EXPECTED_FLAVORS[variantIndex];
    assert.match(variant.id, SAFE_ID);
    assert.equal(variant.id, `${object.id}_${flavorId}`);
    assert.equal(variant.objectId, object.id);
    assert.equal(variant.flavorId, flavorId);
    assert.equal(variant.color, flavorColor);
    assert.ok(variant.displayName.startsWith(`${object.displayName} — ${flavorName} `));
    assert.equal(variant.availability, 'with-object');
    assert.equal(variant.collisionProfile, 'standard-competitive-v1');
    assert.equal(Object.hasOwn(variant, 'unlockAtWins'), false, 'variants cannot have separate unlock gates');
    for (const key of ['castLabel', 'silhouette', 'finish']) {
      assert.equal(typeof variant[key], 'string');
      assert.ok(variant[key].length > 0);
    }
  }
}

assert.deepEqual(
  manifest.variants.map(({ id }) => id),
  manifest.objects.flatMap(({ variants }) => variants.map(({ id }) => id)),
  'the flat variant index must preserve roster and flavor order',
);
assert.equal(findBannedKey(manifest), null, 'manifest must not contain object-specific physics tuning');
assert.equal(BANNED_BRANDS.test(JSON.stringify(manifest)), false, 'manifest metadata must stay brand-free');

console.log('v111 object manifest tests passed (25 objects, 300 variants).');
