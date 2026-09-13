'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const names = require('../js/v112-variant-names.js');
const manifest = require('../js/v111-object-manifest.js');
const namePolicy = require('../js/v111-name-policy.js');
const replacement = { giraffe: 'desk-gyroscope', 'tall-buildings': 'mechanical-metronome' };
const expectedIds = manifest.objects.map(o => replacement[o.id] || o.id);
const source = fs.readFileSync(path.join(__dirname, '../js/v112-variant-names.js'), 'utf8');

assert.equal(names.list().length, 25);
assert.deepEqual(names.list().map(g => g.objectId), expectedIds);
assert.deepEqual(names.colors, manifest.flavorOrder.map(f => f.color));
assert.deepEqual(names.variantIds, manifest.flavorOrder.map(f => f.id));
const skinsSource = fs.readFileSync(path.join(__dirname, '../js/skins.js'), 'utf8');
const skinPalette = skinsSource.match(/const FLAVOR_HEXES = \[([\s\S]*?)\];/);
assert.ok(skinPalette, 'existing Skins palette is available');
assert.deepEqual(names.colors, Array.from(skinPalette[1].matchAll(/'([0-9a-f]{6})'/g), m => '#' + m[1]));

let checked = 0;
for (const gallery of names.list()) {
  assert.equal(gallery.variants.length, 12);
  assert.equal(new Set(gallery.variants.map(v => v.name.toLowerCase())).size, 12);
  for (const variant of gallery.variants) {
    const label = gallery.objectId + '/' + variant.variantId;
    assert.equal(namePolicy.validate(variant.name).valid, true, label + ' must be safe as a player name');
    assert.ok(namePolicy.graphemes(variant.name).length <= 14, label + ' fits name input');
    assert.equal(variant.name.trim(), variant.name, label);
    assert.doesNotMatch(variant.name, /\b(?:unlock|level|wins?|FL|FXP|FC)\b/i, label);
    assert.equal(names.nameFor(gallery.objectId, variant.index), variant.name, label);
    assert.equal(names.nameFor(gallery.objectId, variant.color), variant.name, label);
    assert.equal(names.nameFor(gallery.objectId, variant.color.slice(1).toUpperCase()), variant.name, label);
    assert.equal(names.nameFor(gallery.objectId, variant.variantId), variant.name, label);
    assert.deepEqual(Object.keys(variant), ['index', 'variantId', 'color', 'name', 'cast']);
    assert.ok(Object.isFrozen(variant));
    checked++;
  }
  assert.ok(Object.isFrozen(gallery));
  assert.ok(Object.isFrozen(gallery.variants));
}
assert.equal(checked, 300);

// Each authored broad cast retains its established slot, even when the funny
// label is different. Replacement apparatus do not inherit retired silhouettes.
for (const id of ['salt-pepper-shaker', 'potted-plants', 'snow-globe', 'eyeball-monster', 'pinata', 'action-figures', 'box-of-snacks']) {
  const original = manifest.objects.find(o => o.id === id);
  assert.deepEqual(names.list(id).map(v => v.cast), original.variants.map(v => v.castLabel), id);
}
for (const id of ['desk-gyroscope', 'mechanical-metronome']) {
  assert.ok(names.list(id).every(v => v.cast === null));
}

// The existing roster, especially the protected T-Rex, stays in Skins' original
// name table. Unknown/retired IDs and invalid colors never select a random name.
const legacy = ['bottle', 'ketchup', 'maple', 'honeybear', 'babybottle', 'extinguisher', 'soap', 'hourglass', 'bowlingpin', 'cone', 'flask', 'shell', 'pawn', 'buoy', 'wineglass', 'toucan', 'trex', 'whippedcream', 'potion', 'tabasco', 'coke', 'stanley', 'lavalamp', 'lawnchair', 'octopus', 'alien'];
for (const id of legacy.concat(['giraffe', 'tall-buildings', '__proto__', 'constructor', 'toString', 'missing'])) {
  assert.equal(names.nameFor(id, 0), null, id);
  assert.equal(names.list(id).length, 0, id);
}
for (const value of [undefined, null, -1, 12, 1.5, NaN, Infinity, '', '0', '#fff', '#ffffff', ' #1f9bff', {}, []]) {
  assert.equal(names.nameFor('coffee-mug', value), null);
}
assert.equal(names.nameFor({ toString() { throw new Error('must not coerce'); } }, 0), null);
assert.ok(Object.isFrozen(names));
assert.ok(Object.isFrozen(names.colors));
assert.ok(Object.isFrozen(names.variantIds));
assert.ok(Object.isFrozen(names.list()));
assert.throws(() => { names.list('coffee-mug')[0].name = 'Changed'; }, TypeError);
assert.throws(() => { names.list('coffee-mug').push({}); }, TypeError);
assert.equal(names.nameFor('coffee-mug', 0), 'Blue Brew');

// Browser loading adds only the data API; it never installs or calls gameplay.
const browser = vm.createContext({});
vm.runInContext(source, browser);
assert.deepEqual(Object.keys(browser), ['FLIP_V112_VARIANT_NAMES']);
assert.equal(browser.FLIP_V112_VARIANT_NAMES.nameFor('potted-plants', 9), 'Lemon Snap');
assert.equal(browser.FLIP_V112_VARIANT_NAMES.list().length, 25);
assert.ok(Object.isFrozen(browser.FLIP_V112_VARIANT_NAMES));
assert.deepEqual(Object.keys(names).sort(), ['colors', 'list', 'nameFor', 'schema', 'variantIds', 'version']);

console.log('v1.12 variant names: 300 labels, palette/cast alignment, name safety, immutability and legacy fallback passed.');
