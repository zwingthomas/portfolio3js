// node --test src/arcade/games/__tests__/gridlockEngine.test.mjs
//
// Pure-logic tests for the M4 crossing cabinet "GRIDLOCK". No DOM, React, or
// WebAudio — built-in node test runner (Node v26). NOT part of build-guard
// (can't edit package.json); run manually with an EXPLICIT file path (running
// the __tests__ DIR fails spuriously — node treats the dir as a test).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  COLS,
  PLAYER_HALF,
  clamp,
  mod,
  makeRng,
  levelConfig,
  buildLanes,
  buildBoard,
  laneForRow,
  isSafeRow,
  laneOccupiedAt,
  collides,
  visibleCars,
  forEachVisibleCar,
  startPos,
  stepPlayer,
  isGoal,
  playerHit,
  MIN_GAP_FLOOR,
  MAX_ROAD_LANES,
} from '../gridlockEngine.js';

test('clamp bounds a value to [lo, hi]', () => {
  assert.equal(clamp(5, 0, 10), 5);
  assert.equal(clamp(-3, 0, 10), 0);
  assert.equal(clamp(99, 0, 10), 10);
});

test('mod returns a non-negative result with the divisor sign (unlike %)', () => {
  assert.equal(mod(7, 5), 2);
  assert.equal(mod(-1, 5), 4); // JS -1 % 5 === -1; mod must wrap positive
  assert.equal(mod(-6, 5), 4);
  assert.equal(mod(10, 5), 0);
});

test('makeRng is deterministic and stays in [0, 1)', () => {
  const a = makeRng(123);
  const b = makeRng(123);
  for (let i = 0; i < 100; i++) {
    const x = a();
    assert.equal(x, b());
    assert.ok(x >= 0 && x < 1, `rng out of range: ${x}`);
  }
  assert.notEqual(makeRng(1)(), makeRng(2)());
});

test('levelConfig ramps difficulty: more lanes (capped), faster, denser', () => {
  const a = levelConfig(0);
  const b = levelConfig(3);
  const c = levelConfig(50);
  assert.equal(a.roadRows, 3);
  assert.equal(b.roadRows, 6);
  assert.equal(c.roadRows, MAX_ROAD_LANES); // lane count caps so the board fits
  // speed scale is strictly increasing and UNBOUNDED (no clamp)
  assert.ok(b.speedScale > a.speedScale);
  assert.ok(c.speedScale > b.speedScale);
  assert.ok(levelConfig(10000).speedScale > c.speedScale);
  // spacing shrink grows with level
  assert.ok(c.periodShrink > b.periodShrink);
});

test('buildLanes is deterministic and produces valid lane descriptors', () => {
  const a = buildLanes(2);
  const b = buildLanes(2);
  assert.deepEqual(a, b);
  assert.equal(a.length, levelConfig(2).roadRows);
  for (const lane of a) {
    assert.ok(lane.dir === 1 || lane.dir === -1, `bad dir ${lane.dir}`);
    assert.ok(lane.speed > 0, 'speed must be positive');
    assert.ok(lane.carLen > 0, 'carLen must be positive');
    assert.ok(lane.period >= lane.carLen + MIN_GAP_FLOOR - 1e-9, 'period must leave the gap floor');
    assert.ok(lane.offset >= 0 && lane.offset < lane.period + 1e-9, 'offset within one period');
  }
});

test('UNWINNABLE: at high levels every lane gap is smaller than the player', () => {
  // Once period - carLen < 2*PLAYER_HALF there is no pocket wide enough to stand
  // in, so the lane cannot be safely occupied → no completion is possible.
  const lanes = buildLanes(200);
  const playerWidth = 2 * PLAYER_HALF;
  for (const lane of lanes) {
    const gap = lane.period - lane.carLen;
    assert.ok(
      Math.abs(gap - MIN_GAP_FLOOR) < 1e-6,
      `expected gap floored to ${MIN_GAP_FLOOR}, got ${gap}`,
    );
    assert.ok(gap < playerWidth, `gap ${gap} should be uncrossable (< ${playerWidth})`);
  }
});

test('buildBoard: start + roads + goal rows, safe rows have no lane', () => {
  const board = buildBoard(1);
  assert.equal(board.cols, COLS);
  assert.equal(board.roadRows, levelConfig(1).roadRows);
  assert.equal(board.rows, board.roadRows + 2);
  assert.equal(board.startRow, 0);
  assert.equal(board.goalRow, board.rows - 1);
  // bottom + top rows safe; middle rows are roads
  assert.ok(isSafeRow(board, board.startRow));
  assert.ok(isSafeRow(board, board.goalRow));
  assert.equal(laneForRow(board, board.startRow), null);
  assert.equal(laneForRow(board, board.goalRow), null);
  for (let r = 1; r <= board.roadRows; r++) {
    assert.ok(!isSafeRow(board, r), `row ${r} should be a road`);
    assert.equal(laneForRow(board, r), board.lanes[r - 1]);
  }
});

test('laneOccupiedAt matches the car lattice and moves with time', () => {
  // a car at the origin: left edge sweeps right at 1 col/sec
  const lane = { dir: 1, speed: 1, period: 10, carLen: 2, offset: 0 };
  // at t=0 the car occupies [0, 2)
  assert.ok(laneOccupiedAt(lane, 0, 0));
  assert.ok(laneOccupiedAt(lane, 1.9, 0));
  assert.ok(!laneOccupiedAt(lane, 2.0, 0)); // just past the car
  assert.ok(!laneOccupiedAt(lane, 5, 0)); // in the gap
  // next car wraps in at x=10 -> occupied [10,12)
  assert.ok(laneOccupiedAt(lane, 10, 0));
  // at t=1 the whole stream shifted +1 col: car now occupies [1, 3)
  assert.ok(!laneOccupiedAt(lane, 0.5, 1));
  assert.ok(laneOccupiedAt(lane, 2.5, 1));
});

test('laneOccupiedAt handles negative direction without sign bugs', () => {
  const lane = { dir: -1, speed: 1, period: 10, carLen: 2, offset: 0 };
  // at t=1 the stream shifts -1: car occupies [-1, 1) ≡ also wraps at [9, 11)
  assert.ok(laneOccupiedAt(lane, 0, 1));
  assert.ok(laneOccupiedAt(lane, 9.5, 1));
  assert.ok(!laneOccupiedAt(lane, 5, 1));
});

test('collides is exact interval overlap, including wrap and the gap', () => {
  const lane = { dir: 1, speed: 0, period: 10, carLen: 2, offset: 0 }; // static car [0,2)
  const pHalf = 0.42;
  // player centered at 1 sits inside the car
  assert.ok(collides(lane, 1, 0, pHalf));
  // player centered at 5 is in the middle of the gap -> safe
  assert.ok(!collides(lane, 5, 0, pHalf));
  // player edge just grazes the car: center 2.41 -> left edge 1.99 < 2 -> hit
  assert.ok(collides(lane, 2.41, 0, pHalf));
  // center 2.43 -> left edge 2.01 -> clear
  assert.ok(!collides(lane, 2.43, 0, pHalf));
  // wrap: player near the top of the period overlaps the next car at x=10
  assert.ok(collides(lane, 9.7, 0, pHalf)); // right edge 10.12 > 10
});

test('collides: a solid wall lane (no gap) hits the player everywhere', () => {
  const lane = { dir: 1, speed: 0, period: 2.2, carLen: 2.0, offset: 0 }; // gap 0.2 < player
  for (let x = 0; x < 2.2; x += 0.1) {
    assert.ok(collides(lane, x, 0, 0.42), `wall should hit at x=${x.toFixed(1)}`);
  }
});

test('visibleCars are period-spaced, cover the range, and match collisions', () => {
  const lane = { dir: 1, speed: 1.3, period: 5, carLen: 2, offset: 1.5 };
  const t = 2.7;
  const cars = visibleCars(lane, t, 0, COLS);
  assert.ok(cars.length > 0);
  // strictly increasing, spaced by exactly `period`
  for (let i = 1; i < cars.length; i++) {
    assert.ok(Math.abs(cars[i] - cars[i - 1] - lane.period) < 1e-6, 'cars must be period-spaced');
  }
  // covers the whole visible band
  assert.ok(cars[0] <= 0 + 1e-9);
  assert.ok(cars[cars.length - 1] >= COLS - lane.period - 1e-9);
  // each rendered car's interior is reported occupied by the collision math
  for (const x of cars) {
    assert.ok(laneOccupiedAt(lane, x + lane.carLen / 2, t), `car at ${x} should read as occupied`);
    // a point just past the car (in the gap) is clear
    assert.ok(!laneOccupiedAt(lane, x + lane.carLen + 0.3, t));
  }
});

test('forEachVisibleCar yields the same left-edges as visibleCars (alloc-free path)', () => {
  // the per-frame renderer uses forEachVisibleCar to avoid building an array;
  // it must visit exactly the cars visibleCars() reports (rounding aside).
  const lane = { dir: -1, speed: 0.9, period: 4.5, carLen: 1.8, offset: 2.1 };
  const t = 3.3;
  const expected = visibleCars(lane, t, 0, COLS);
  const seen = [];
  forEachVisibleCar(lane, t, 0, COLS, (x) => seen.push(Math.round(x * 1000) / 1000));
  assert.deepEqual(seen, expected);
});

test('stepPlayer moves one cell and clamps to the board', () => {
  const board = buildBoard(0);
  const p = startPos(board);
  assert.equal(p.row, 0);
  assert.equal(p.col, Math.floor(COLS / 2));
  const up = stepPlayer(p, 'up', board);
  assert.equal(up.row, 1);
  assert.equal(up.col, p.col);
  const down = stepPlayer(p, 'down', board); // already on bottom row -> clamped
  assert.equal(down.row, 0);
  const left = stepPlayer({ col: 0, row: 2 }, 'left', board);
  assert.equal(left.col, 0); // clamped at left edge
  const right = stepPlayer({ col: COLS - 1, row: 2 }, 'right', board);
  assert.equal(right.col, COLS - 1); // clamped at right edge
  assert.deepEqual(stepPlayer(p, 'nonsense', board), p); // unknown dir is a no-op
});

test('isGoal fires only on the top safe row', () => {
  const board = buildBoard(0);
  assert.ok(!isGoal({ col: 6, row: 0 }, board));
  assert.ok(!isGoal({ col: 6, row: board.goalRow - 1 }, board));
  assert.ok(isGoal({ col: 6, row: board.goalRow }, board));
});

test('playerHit is false on safe rows and tracks lane traffic on road rows', () => {
  const board = buildBoard(0);
  // safe start/goal rows never kill regardless of time
  assert.ok(!playerHit(board, { col: 6, row: board.startRow }, 0));
  assert.ok(!playerHit(board, { col: 6, row: board.goalRow }, 99));
  // on a road row, hit-state must agree with the lane's own collision math
  const row = 1;
  const lane = laneForRow(board, row);
  for (let t = 0; t < 4; t += 0.13) {
    const px = 6 + 0.5;
    assert.equal(playerHit(board, { col: 6, row }, t), collides(lane, px, t));
  }
});
