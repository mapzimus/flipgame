'use strict';
const assert = require('node:assert/strict');
const Presentation = require('../js/v112-plinko-presentation.js');

function board(slots) {
  const pegRows = Array.from({ length: 24 }, (_, row) => ({
    rowIndex: row, pegs: [{ x: 10, y: row * 20, radius: 4, rowIndex: row, pegIndex: 0 }],
  }));
  const slotBounds = (index) => ({
    left: index * 120, right: index * 120 + 120, top: 900, bottom: 1050, width: 120, height: 150,
  });
  return {
    schema: 'PlinkoMatterRenderBoardV1',
    innerLeft: 0, innerRight: 1080, top: 0, bottom: 1050,
    pegRows, pegs: pegRows.flatMap((row) => row.pegs),
    dividers: [],
    slots: Array.from({ length: slots }, (_, index) => ({
      index, kind: 'lives-doubled', bounds: slotBounds(index),
    })),
    trampoline: { bounds: { left: 0, right: 100, top: 0, bottom: 20, width: 100, height: 20 } },
  };
}

const ok = Presentation.project({
  schema: 'PlinkoMatterSnapshotV1', phase: 'dropping', boardEnabled: true,
  board: board(9),
  selected: {
    colliderRef: 'body:flipper-main', sameBody: true, matterBodyId: 1,
    transform: { x: 100, y: 200, angle: 0, scaleX: 1, scaleY: 1 },
    bounds: { left: 80, top: 180, right: 120, bottom: 220 },
    velocity: { x: 0, y: 10 }, angularVelocity: 0,
  },
  landing: { settled: false },
  spring: { trampolineVisible: true, compressed: false, scaleX: 1, scaleY: 1 },
}, { width: 800, height: 600 });
assert.equal(ok.board.slots.length, 9);

assert.throws(() => Presentation.project({
  schema: 'PlinkoMatterSnapshotV1', phase: 'dropping', boardEnabled: true,
  board: board(7),
  selected: {
    colliderRef: 'body:flipper-main', sameBody: true, matterBodyId: 1,
    transform: { x: 100, y: 200, angle: 0, scaleX: 1, scaleY: 1 },
    bounds: { left: 80, top: 180, right: 120, bottom: 220 },
    velocity: { x: 0, y: 10 }, angularVelocity: 0,
  },
  landing: { settled: false },
  spring: { trampolineVisible: true, compressed: false, scaleX: 1, scaleY: 1 },
}, { width: 800, height: 600 }), /Qualified Plinko/);

console.log('v1.12 Plinko presentation refuses a short board and keeps nine slots.');
