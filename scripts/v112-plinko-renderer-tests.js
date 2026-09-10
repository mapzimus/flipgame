'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const Matter = require('../js/vendor/matter.min.js');
const Plinko = require('../js/v112-plinko-matter.js');
const Presentation = require('../js/v112-plinko-presentation.js');

// Reuse the qualified host suite's canonical geometry/directive fixtures, not
// its 81-run assertions. Fail clearly if that explicit fixture boundary moves.
const fixturePath = require.resolve('./v112-plinko-matter-tests.js');
const fixtureText = fs.readFileSync(fixturePath, 'utf8');
const boundary = fixtureText.indexOf('\nconst results = Array.from(');
assert.ok(boundary > 0);
const fixture = { require: createRequire(fixturePath) };
vm.runInNewContext(fixtureText.slice(0, boundary) + '\nthis.fixture = {canonicalBoard, applyExpected};', fixture);
// Normalize across VM realms so the host's plain-data guard stays meaningful.
const geometry = JSON.parse(JSON.stringify(fixture.fixture.canonicalBoard()));
const engine = Matter.Engine.create();
const selected = Matter.Body.create({ parts: [
  Matter.Bodies.rectangle(640, 5892, 70, 50, { density: .0015 }),
  Matter.Bodies.rectangle(640, 5930, 74, 70, { density: .018 }),
  Matter.Bodies.rectangle(640, 5848, 44, 36, { density: .0004 })] });
Matter.Composite.add(engine.world, selected);
const adapter = Plinko.create({ Matter });
adapter.attach({ engine, world: engine.world, selectedBody: selected, selectedResource: selected,
  geometry, binding: null, viewport: { width: 1280, height: 720 } });
adapter.start({ seed: 9123, entryVelocityX: .37, angularVelocity: .1 });
function directive(tick) {
  fixture.fixture.applyExpected({ applyDirective: (kind, data) => adapter.applyDirective(kind,
    JSON.parse(JSON.stringify(data))) }, tick, 9123);
}
directive(0);
const frames = [adapter.snapshot()];
for (let tick = 1; tick < 2200; tick++) {
  adapter.step({ targetTick: tick }); directive(tick);
  const frame = adapter.snapshot();
  if (tick % 12 === 0 || frame.landing.settled) frames.push(frame);
  if (frame.landing.settled || frame.timedOut) break;
}
assert.ok(frames.at(-1).landing.settled);
assert.equal(frames[0].spring.compressed, true);
const viewports = [[360,740], [768,1024], [1280,720], [1366,768], [1920,1080], [3840,2160]];
for (const [width,height] of viewports) {
  let minimumY = Infinity, maximumY = -Infinity;
  for (const frame of frames) {
    const before = JSON.stringify(frame);
    const p = Presentation.project(frame, { width,height });
    assert.deepEqual(p, Presentation.project(frame, { width,height }));
    assert.equal(JSON.stringify(frame), before, 'presentation must never alter host evidence');
    assert.equal(p.bottle.id, selected.id);
    assert.equal(p.bottle.position.x, frame.selected.transform.x);
    assert.equal(p.bottle.angle, frame.selected.transform.angle);
    assert.equal(p.board.pegs.length, 252);
    assert.equal(p.board.slots.length, 9);
    assert.equal(p.boardVisible, frame.boardEnabled);
    assert.equal(p.spring.visible, frame.spring.trampolineVisible);
    assert.equal(p.scale.y, frame.selected.transform.scaleY);
    assert.equal(Object.isFrozen(p.view), true);
    const screenX = width/2 + (p.bottle.position.x-p.view.camX)*p.view.zoom;
    const screenY = height/2 + (p.bottle.position.y-p.view.camY)*p.view.zoom;
    if (!p.settled) {
      assert.equal(screenX, width/2); assert.equal(screenY, height/2);
      assert.equal(p.selectedSlot, null, 'never highlight a predicted slot');
    } else {
      assert.ok(screenX > 0 && screenX < width && screenY > 0 && screenY < height-100);
      assert.ok(width/2 + (p.board.left-p.view.camX)*p.view.zoom >= 0);
      assert.ok(width/2 + (p.board.right-p.view.camX)*p.view.zoom <= width);
      assert.equal(p.selectedSlot, frame.landing.slotIndex);
    }
    minimumY = Math.min(minimumY, p.view.camY); maximumY = Math.max(maximumY, p.view.camY);
  }
  assert.ok(maximumY-minimumY > 2000, `camera follows the actual long rise/drop: ${minimumY}–${maximumY}`);
}
assert.equal(Presentation.project({schema:'PlinkoMatterSnapshotV1',phase:'idle'}, {}), null);
assert.equal(Presentation.project({schema:'PlinkoMatterSnapshotV1',phase:'cleaned'}, {}), null);
assert.throws(() => Presentation.project(frames[0], {width:0,height:720}), /viewport/);

// Execute the real renderer against a traced Canvas2D interface. This catches
// double camera easing, old art offsets, wrong object dispatch, and lost scale.
function harness() {
  let matrix = [1,0,0,1,0,0]; const stack = [], draws = [], texts = [];
  function multiply(n) {
    const m=matrix;
    matrix=[m[0]*n[0]+m[2]*n[1],m[1]*n[0]+m[3]*n[1],m[0]*n[2]+m[2]*n[3],
      m[1]*n[2]+m[3]*n[3],m[0]*n[4]+m[2]*n[5]+m[4],m[1]*n[4]+m[3]*n[5]+m[5]];
  }
  const ctx = new Proxy({
    save(){stack.push(matrix.slice());}, restore(){assert.ok(stack.length);matrix=stack.pop();},
    setTransform(...m){matrix=m;}, translate(x,y){multiply([1,0,0,1,x,y]);},
    scale(x,y){multiply([x,0,0,y,0,0]);}, rotate(a){multiply([Math.cos(a),Math.sin(a),-Math.sin(a),Math.cos(a),0,0]);},
    createLinearGradient(){return {addColorStop(){}};}, createRadialGradient(){return {addColorStop(){}};},
    measureText(text){return {width:String(text).length*8};},
    fillText(text){texts.push(text);},
  }, { get(target,key){return key in target ? target[key] : (()=>{});} });
  const canvas={width:1280,height:720,getContext:()=>ctx};
  const world={console,FlipgameV112PlinkoPresentation:Presentation};
  world.window=world;
  world.Skins={hasDraw:()=>true,liquidFor:()=>null,draw(c,skin,state){draws.push({skin,state,matrix:matrix.slice()});}};
  vm.runInNewContext(fs.readFileSync(require.resolve('../js/renderer.js'),'utf8')+'\nthis.renderer=Renderer;',world);
  world.renderer.init(canvas);
  return {world,canvas,draws,texts,stack};
}
const h=harness();
for (const [width,height] of viewports) for (const reduced of [true,false]) {
  h.canvas.width=width*2; h.canvas.height=height*2;
  h.world.renderer.resize(width,height); h.world.renderer.setReduceMotion(reduced);
  for (const frame of frames.filter((_,i)=>i%8===0)) {
    h.world.renderer.frame(1/60,{plinkoSnapshot:frame,bottle:null,liquid:{slosh:.2,vel:0},
      groundY:6000,skin:'trex',variantId:'original-protected',liquidColor:'#123456',stake:0,
      flipSeed:9123,result:null});
    const d=h.draws.at(-1);
    assert.equal(d.skin,'trex'); assert.equal(d.state.variantId,'original-protected');
    assert.equal(d.state.slosh,.2);
    const p=Presentation.project(frame,{width,height});
    assert.ok(Math.abs(d.matrix[4]/2-(width/2+(p.bottle.position.x-p.view.camX)*p.view.zoom))<1e-6);
    assert.ok(Math.abs(d.matrix[5]/2-(height/2+(p.bottle.position.y-p.view.camY)*p.view.zoom))<1e-6);
    assert.equal(h.stack.length,0);
  }
}
assert.ok(h.texts.includes('PLINKO · Spring loaded'));
assert.ok(h.texts.includes('PLINKO · Lift-off'));
assert.ok(h.texts.includes('PLINKO · Peg drop'));
assert.ok(h.texts.includes('WIN') && h.texts.includes('LOSS'));
adapter.cleanup();
console.log('Plinko renderer passed: real Matter trace, six viewports, selected art/DPR/center tracking, spring, nine slots, reduced motion');
module.exports = { frames };
