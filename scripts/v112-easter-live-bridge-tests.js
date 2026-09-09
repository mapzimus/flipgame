'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const main = fs.readFileSync(path.join(root, 'js/main.js'), 'utf8');
const helper = main.match(/  function resolvePresentationSecret\([^]*?\n  \}/)?.[0];
assert.ok(helper, 'Live committed-outcome adapter exists');
const context = vm.createContext({console});
vm.runInContext(`var window = globalThis; var currentMatchId = 'bridge-match';
  var easterEggState = null, easterPresentation = null;
  var calls = [];
  var game = Object.freeze({practiceAttempts:0,insanity:false,activePlayers:()=>[1,2]});
  var Settings = Object.freeze({sound:true});
  var Sound = {play: id=>calls.push(['audio',id])};
  var announce = text=>calls.push(['announce',text]);
  var reduceMotionActive = ()=>false;
  var FlipgameV112EasterPresentation = {audioCue:()=>null};`, context);
vm.runInContext(fs.readFileSync(path.join(root, 'js/v112-easter-eggs.js'), 'utf8'), context);
vm.runInContext(helper, context);
vm.runInContext(`var record = Object.freeze({objectId:'bottle',variantId:'blue-steel',
  arenaId:null,displayName:'Player',turn:1,heat:0,result:'MAKE',cap:true,
  rotations:2,bounces:0,banks:0,settleMs:400,testData:false});`, context);
let selected = null;
for (let seed = 0; seed < 1000; seed++) {
  vm.runInContext(`easterEggState=null; resolvePresentationSecret(record,{seed:${seed}});`, context);
  if (context.easterPresentation) { selected = context.easterPresentation; break; }
}
assert.equal(selected?.id, 'baseline-return-signal', 'Eligible measured result can produce its authored cue');
assert.equal(selected.presentationOnly, true);
assert.equal(selected.camera.interruptsExisting, false);
assert.equal(context.game.practiceAttempts, 0);
assert.equal(context.game.insanity, false);
assert.equal(context.record.result, 'MAKE');
assert.ok(context.calls.some(call=>call[0]==='announce'));
const sequence = context.easterEggState.lastSequence;
vm.runInContext('resolvePresentationSecret(record,{seed:123});', context);
assert.equal(context.easterPresentation, null, 'Duplicate flip ID cannot repeat presentation');
assert.equal(context.easterEggState.lastSequence, sequence);
for (const flag of ['practice','lab','forced','testData']) {
  vm.runInContext(`easterEggState=null; resolvePresentationSecret(Object.assign({},record,{${flag}:true}),{seed:11});`, context);
  assert.equal(context.easterPresentation, null, flag+' stays Test Data');
}
vm.runInContext(`currentMatchId='next-match';resolvePresentationSecret(record,{seed:1});`, context);
assert.equal(context.easterEggState.matchId, 'next-match');
assert.ok(main.indexOf('resolvePresentationSecret(statsRecord, flick)') > main.indexOf('function onResult()'));
assert.doesNotMatch(helper, /\.resolveFlip\(|\.addLives|\.consumeMatch|Math\.random|\.setSeed/);
console.log('Live Easter bridge: committed measured eligibility, duplicate protection, Test Data suppression, match isolation and presentation-only effects passed.');
