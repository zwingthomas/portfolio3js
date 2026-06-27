// node --test src/arcade/games/__tests__/neonRunnerEngine.test.mjs
//
// Pure-logic tests for the M7 "NEON RUNNER" grid duel: bounds/reverse helpers,
// deterministic PRNG, initial state, legal turns, CPU survival AI, step
// collision resolution (wall / trail / head-on), and guaranteed termination.
// No DOM/React/three. Run with an EXPLICIT file path (running the __tests__ DIR
// fails spuriously — node treats the dir as a test).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  GRID,
  DIR,
  CELL,
  idx,
  inBounds,
  isReverse,
  makeRng,
  createDuel,
  setDir,
  freeRun,
  cpuChooseDir,
  step,
  isOver,
  dirDelta,
} from '../neonRunnerEngine.js';

test('idx + inBounds map the grid correctly', () => {
  assert.equal(idx(0, 0), 0);
  assert.equal(idx(3, 2), 2 * GRID + 3);
  assert.ok(inBounds(0, 0));
  assert.ok(inBounds(GRID - 1, GRID - 1));
  assert.ok(!inBounds(-1, 0));
  assert.ok(!inBounds(0, GRID));
});

test('isReverse flags exact 180° turns only', () => {
  assert.ok(isReverse(DIR.up, DIR.down));
  assert.ok(isReverse(DIR.left, DIR.right));
  assert.ok(!isReverse(DIR.up, DIR.left));
  assert.ok(!isReverse(DIR.up, DIR.up));
  assert.ok(!isReverse(DIR.right, DIR.down));
});

test('makeRng is deterministic and bounded', () => {
  const a = makeRng(42);
  const b = makeRng(42);
  for (let i = 0; i < 30; i++) {
    const v = a();
    assert.equal(v, b());
    assert.ok(v >= 0 && v < 1);
  }
});

test('createDuel places two alive riders on opposite sides with trails laid', () => {
  const s = createDuel(1);
  assert.equal(s.status, 'playing');
  assert.equal(s.tick, 0);
  assert.ok(s.player.alive && s.cpu.alive);
  assert.notEqual(idx(s.player.col, s.player.row), idx(s.cpu.col, s.cpu.row));
  assert.equal(s.grid[idx(s.player.col, s.player.row)], CELL.player);
  assert.equal(s.grid[idx(s.cpu.col, s.cpu.row)], CELL.cpu);
  assert.deepEqual(dirDelta(DIR.up), [0, -1]);
});

test('setDir accepts legal turns, rejects reversals / dead / finished', () => {
  const s = createDuel(1); // player.dir = up
  assert.ok(setDir(s, 'player', DIR.left));
  assert.equal(s.player.dir, DIR.left);
  assert.ok(!setDir(s, 'player', DIR.right), 'cannot reverse left->right');
  assert.equal(s.player.dir, DIR.left);
  assert.ok(!setDir(s, 'player', 9), 'out-of-range dir rejected');
  s.player.alive = false;
  assert.ok(!setDir(s, 'player', DIR.up), 'dead rider cannot turn');
  s.player.alive = true;
  s.status = 'win';
  assert.ok(!setDir(s, 'player', DIR.up), 'no turns once the duel is over');
});

test('freeRun counts open cells ahead until a wall or the boundary', () => {
  const s = createDuel(1);
  s.grid.fill(CELL.empty);
  // from (5,10) heading right with an open row: cells (6..GRID-1) -> GRID-6 cells
  assert.equal(freeRun(s.grid, 5, 10, DIR.right), GRID - 6);
  // a wall two cells ahead caps the run at 1
  s.grid[idx(7, 10)] = CELL.cpu;
  assert.equal(freeRun(s.grid, 5, 10, DIR.right), 1);
  // facing the boundary immediately -> 0
  assert.equal(freeRun(s.grid, 0, 10, DIR.left), 0);
});

test('cpuChooseDir never steers into an immediate wall when an exit exists', () => {
  const s = createDuel(1);
  s.grid.fill(CELL.empty);
  s.cpu.col = 10; s.cpu.row = 10; s.cpu.dir = DIR.up;
  // block straight-ahead (up) and right; left + (down is reverse) remain — it
  // must pick a NON-crashing dir (left), not plough into the wall.
  s.grid[idx(10, 9)] = CELL.player; // up blocked
  s.grid[idx(11, 10)] = CELL.player; // right blocked
  const d = cpuChooseDir(s);
  assert.equal(d, DIR.left);
});

test('step: player into the boundary -> lose (cpu survives in open space)', () => {
  const s = createDuel(1);
  s.grid.fill(CELL.empty);
  s.player.col = 0; s.player.row = 10; s.player.dir = DIR.left; // next col -1 = OOB
  s.cpu.col = 15; s.cpu.row = 15; s.cpu.dir = DIR.up; // open -> survives
  step(s);
  assert.ok(isOver(s));
  assert.equal(s.status, 'lose');
  assert.ok(!s.player.alive && s.cpu.alive);
});

test('step: cpu boxed in -> win', () => {
  const s = createDuel(1);
  s.grid.fill(CELL.empty);
  s.cpu.col = 10; s.cpu.row = 10; s.cpu.dir = DIR.up;
  // every legal move (up/left/right; down is reverse) crashes
  s.grid[idx(10, 9)] = CELL.player;
  s.grid[idx(9, 10)] = CELL.player;
  s.grid[idx(11, 10)] = CELL.player;
  s.player.col = 2; s.player.row = 2; s.player.dir = DIR.down; // open -> survives
  step(s);
  assert.ok(isOver(s));
  assert.equal(s.status, 'win');
  assert.ok(s.player.alive && !s.cpu.alive);
});

test('step: head-on into the same cell -> draw', () => {
  const s = createDuel(1);
  s.grid.fill(CELL.empty);
  s.player.col = 5; s.player.row = 10; s.player.dir = DIR.right; // -> (6,10)
  s.cpu.col = 7; s.cpu.row = 10; s.cpu.dir = DIR.left; // -> (6,10)
  // force the AI's only sensible move to be left into the shared cell
  s.grid[idx(7, 9)] = CELL.player; // cpu up blocked
  s.grid[idx(7, 11)] = CELL.player; // cpu down blocked
  step(s);
  assert.ok(isOver(s));
  assert.equal(s.status, 'draw');
  assert.ok(!s.player.alive && !s.cpu.alive);
});

test('step: player into an existing trail -> lose', () => {
  const s = createDuel(1);
  s.grid.fill(CELL.empty);
  s.grid[idx(6, 10)] = CELL.cpu; // a standing wall
  s.player.col = 5; s.player.row = 10; s.player.dir = DIR.right; // -> into the wall
  s.cpu.col = 15; s.cpu.row = 15; s.cpu.dir = DIR.down; // open
  step(s);
  assert.equal(s.status, 'lose');
});

test('a full duel always resolves within a bounded number of ticks', () => {
  for (let seed = 1; seed <= 6; seed++) {
    const s = createDuel(seed);
    let guard = 0;
    const cap = GRID * GRID * 2; // the board has finitely many cells
    while (!isOver(s) && guard < cap) { step(s); guard++; }
    assert.ok(isOver(s), `duel resolved for seed ${seed} (ticks=${s.tick})`);
    assert.ok(['win', 'lose', 'draw'].includes(s.status));
  }
});

test('no turns or steps mutate a finished duel', () => {
  const s = createDuel(1);
  s.status = 'win';
  const before = s.tick;
  step(s);
  assert.equal(s.tick, before, 'step is a no-op once over');
});
