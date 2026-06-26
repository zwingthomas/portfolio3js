// node --test src/arcade/games/__tests__/cascadeEngine.test.mjs
//
// Pure-logic tests for the M5 stack cabinet "CASCADE". No DOM, React, or
// WebAudio — built-in node test runner (Node v26). NOT part of build-guard
// (can't edit package.json); run manually with an EXPLICIT file path (running
// the __tests__ DIR fails spuriously — node treats the dir as a test).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  COLS,
  ROWS,
  PIECE_TYPES,
  colorIndex,
  makeRng,
  rngNext,
  rotatedCells,
  spawnCol,
  spawnPiece,
  pieceCells,
  forEachPieceCell,
  createBoard,
  collides,
  tryMove,
  tryRotate,
  hardDropPiece,
  ghostFor,
  lockPiece,
  isRowFull,
  clearLines,
  makeBag,
  refillQueue,
  LINE_SCORES,
  levelForLines,
  scoreForClear,
  gravityMs,
  createGame,
  moveLeft,
  moveRight,
  rotateGame,
  dropStep,
  lockAndSpawn,
  hardDrop,
} from '../cascadeEngine.js';

// --- helpers ----------------------------------------------------------------
function emptyBoard() {
  return createBoard();
}
function key(cells) {
  return cells.map(([x, y]) => `${x},${y}`).sort().join(' ');
}

// --- PRNG -------------------------------------------------------------------
test('makeRng is deterministic and stays in [0, 1)', () => {
  const a = makeRng(42);
  const b = makeRng(42);
  for (let i = 0; i < 100; i++) {
    const x = a();
    assert.equal(x, b());
    assert.ok(x >= 0 && x < 1, `rng out of range: ${x}`);
  }
  assert.notEqual(makeRng(1)(), makeRng(2)());
});

test('rngNext is a pure step matching makeRng stream', () => {
  const closure = makeRng(7);
  let state = 7 >>> 0;
  for (let i = 0; i < 20; i++) {
    const step = rngNext(state);
    state = step.state;
    assert.equal(step.value, closure(), `stream diverged at ${i}`);
  }
});

// --- piece geometry ---------------------------------------------------------
test('colorIndex maps each piece to a unique 1..7 index', () => {
  const seen = new Set();
  for (const t of PIECE_TYPES) {
    const idx = colorIndex(t);
    assert.ok(idx >= 1 && idx <= 7, `${t} -> ${idx}`);
    assert.ok(!seen.has(idx), `duplicate color index for ${t}`);
    seen.add(idx);
  }
});

test('rotatedCells: O is rotation-invariant', () => {
  const base = key(rotatedCells('O', 0));
  for (let r = 1; r < 4; r++) assert.equal(key(rotatedCells('O', r)), base, `O changed at rot ${r}`);
});

test('rotatedCells: every piece keeps 4 cells and is 4-periodic', () => {
  for (const t of PIECE_TYPES) {
    for (let r = 0; r < 4; r++) {
      const cells = rotatedCells(t, r);
      assert.equal(cells.length, 4, `${t} rot ${r} not 4 cells`);
    }
    assert.equal(key(rotatedCells(t, 0)), key(rotatedCells(t, 4)), `${t} not 4-periodic`);
    // negative rotation normalizes
    assert.equal(key(rotatedCells(t, -1)), key(rotatedCells(t, 3)), `${t} negative rot wrong`);
  }
});

test('rotatedCells: I spawn is a horizontal bar, rotation a vertical bar', () => {
  const h = rotatedCells('I', 0);
  const rowsH = new Set(h.map(([, y]) => y));
  assert.equal(rowsH.size, 1, 'spawn I should occupy a single row');
  const v = rotatedCells('I', 1);
  const colsV = new Set(v.map(([x]) => x));
  assert.equal(colsV.size, 1, 'rotated I should occupy a single column');
});

test('rotatedCells: T spawn points up (apex above the bar)', () => {
  // spawn T: bar on row 1, single nub on row 0
  assert.equal(key(rotatedCells('T', 0)), key([[1, 0], [0, 1], [1, 1], [2, 1]]));
});

test('spawnCol centers pieces; spawnPiece starts at the top', () => {
  assert.equal(spawnCol('I'), 3);
  assert.equal(spawnCol('O'), 4);
  assert.equal(spawnCol('T'), 3);
  const p = spawnPiece('T');
  assert.equal(p.y, 0);
  assert.equal(p.rot, 0);
  assert.equal(p.x, 3);
});

test('pieceCells and forEachPieceCell agree', () => {
  const p = { type: 'L', rot: 2, x: 4, y: 5 };
  const viaArray = key(pieceCells(p));
  const seen = [];
  forEachPieceCell(p, (c, r) => seen.push([c, r]));
  assert.equal(key(seen), viaArray);
});

// --- board / collision ------------------------------------------------------
test('createBoard is ROWS×COLS of zeros', () => {
  const b = createBoard();
  assert.equal(b.length, ROWS);
  for (const row of b) {
    assert.equal(row.length, COLS);
    assert.ok(row.every((c) => c === 0));
  }
});

test('collides: walls, floor, and stacked cells; above-top is allowed', () => {
  const b = emptyBoard();
  assert.ok(!collides(b, spawnPiece('T')));
  // off the left wall
  assert.ok(collides(b, { type: 'T', rot: 0, x: -1, y: 0 }));
  // off the right wall (T box width 3, x = COLS-2 pushes a cell to COLS)
  assert.ok(collides(b, { type: 'T', rot: 0, x: COLS - 2, y: 0 }));
  // through the floor
  assert.ok(collides(b, { type: 'O', rot: 0, x: 4, y: ROWS - 1 }));
  // cells above the visible top (row < 0) do NOT collide
  assert.ok(!collides(b, { type: 'I', rot: 1, x: 4, y: -2 }));
  // overlapping a filled cell collides
  b[5][4] = 3;
  assert.ok(collides(b, { type: 'O', rot: 0, x: 3, y: 4 })); // O covers (3..4, 4..5) -> hits (4,5)
});

test('tryMove returns null when blocked, a new piece when free', () => {
  const b = emptyBoard();
  const p = spawnPiece('O');
  const right = tryMove(b, p, 1, 0);
  assert.ok(right && right.x === p.x + 1);
  // jam it against the right wall
  let edge = { type: 'O', rot: 0, x: COLS - 2, y: 0 };
  assert.equal(tryMove(b, edge, 1, 0), null);
});

test('tryRotate wall-kicks a piece off the left wall', () => {
  const b = emptyBoard();
  // vertical I hugging the left wall; rotating to horizontal would poke x<0
  const vert = { type: 'I', rot: 1, x: -2, y: 4 };
  assert.ok(!collides(b, vert));
  const rotated = tryRotate(b, vert, 1);
  assert.ok(rotated, 'rotation should kick into a valid spot');
  assert.ok(!collides(b, rotated), 'kicked piece must be valid');
});

test('tryRotate stands a floored horizontal I up via the deep up-kick', () => {
  // A horizontal I on the bottom row needs 3 rows of clearance to become a
  // vertical I; the [0,-2] kick lifts it enough on an otherwise empty board.
  const b = emptyBoard();
  const floored = { type: 'I', rot: 0, x: 3, y: ROWS - 2 }; // cells on the last row
  assert.ok(!collides(b, floored));
  const up = tryRotate(b, floored, 1);
  assert.ok(up, 'a floored I should be able to stand up');
  assert.ok(!collides(b, up), 'the kicked vertical I must be valid');
  // it is now vertical (occupies a single column)
  const cols = new Set(pieceCells(up).map(([c]) => c));
  assert.equal(cols.size, 1);
});

test('tryRotate returns null when no kick frees the piece', () => {
  // a 1-wide well that only fits a vertical I; rotating to horizontal is fully
  // blocked on both sides and cannot be kicked free.
  const b = emptyBoard();
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (c !== 4) b[r][c] = 1;
    }
  }
  const vert = { type: 'I', rot: 1, x: 2, y: 0 }; // occupies col 4
  assert.ok(!collides(b, vert));
  assert.equal(tryRotate(b, vert, 1), null);
});

// --- drop / lock / clear ----------------------------------------------------
test('hardDropPiece lands on the floor and reports distance', () => {
  const b = emptyBoard();
  const p = spawnPiece('O'); // cells at rows 0,1
  const { piece, distance } = hardDropPiece(b, p);
  // O bottom cells must rest on the last row
  const maxRow = Math.max(...pieceCells(piece).map(([, r]) => r));
  assert.equal(maxRow, ROWS - 1);
  assert.equal(distance, piece.y - p.y);
  assert.ok(distance > 0);
});

test('hardDropPiece stacks on top of existing blocks', () => {
  const b = emptyBoard();
  for (let c = 0; c < COLS; c++) b[ROWS - 1][c] = 2; // solid floor row
  const p = spawnPiece('O');
  const { piece } = hardDropPiece(b, p);
  const maxRow = Math.max(...pieceCells(piece).map(([, r]) => r));
  assert.equal(maxRow, ROWS - 2, 'should rest on top of the solid row');
});

test('ghostFor equals the hard-drop resting position', () => {
  const b = emptyBoard();
  const p = spawnPiece('T');
  assert.deepEqual(ghostFor(b, p), hardDropPiece(b, p).piece);
});

test('lockPiece stamps the color and is immutable', () => {
  const b = emptyBoard();
  const p = { type: 'O', rot: 0, x: 0, y: ROWS - 2 };
  const out = lockPiece(b, p);
  assert.notEqual(out, b);
  assert.equal(b[ROWS - 1][0], 0, 'original board untouched');
  assert.equal(out[ROWS - 1][0], colorIndex('O'));
  assert.equal(out[ROWS - 1][1], colorIndex('O'));
  assert.equal(out[ROWS - 2][0], colorIndex('O'));
});

test('isRowFull / clearLines remove full rows and drop the stack', () => {
  const b = emptyBoard();
  // fill the bottom row completely, and a partial row above it
  for (let c = 0; c < COLS; c++) b[ROWS - 1][c] = 1;
  b[ROWS - 2][3] = 5; // a single block that should fall down one row
  assert.ok(isRowFull(b[ROWS - 1]));
  assert.ok(!isRowFull(b[ROWS - 2]));
  const { board, cleared, rows } = clearLines(b);
  assert.equal(cleared, 1);
  assert.deepEqual(rows, [ROWS - 1]);
  assert.equal(board.length, ROWS);
  assert.equal(board[ROWS - 1][3], 5, 'the floating block dropped into the cleared row');
  assert.ok(board[ROWS - 1].filter((c) => c !== 0).length === 1, 'only the dropped block remains');
});

test('clearLines clears multiple rows at once (a tetris)', () => {
  const b = emptyBoard();
  for (let r = ROWS - 4; r < ROWS; r++) for (let c = 0; c < COLS; c++) b[r][c] = 1;
  const { cleared, board } = clearLines(b);
  assert.equal(cleared, 4);
  assert.ok(board.every((row) => row.every((c) => c === 0)), 'board fully cleared');
});

// --- 7-bag ------------------------------------------------------------------
test('makeBag yields all 7 distinct pieces and is deterministic', () => {
  const a = makeBag(makeRng(99));
  const b = makeBag(makeRng(99));
  assert.deepEqual(a, b);
  assert.equal(a.length, 7);
  assert.deepEqual([...a].sort(), [...PIECE_TYPES].sort());
});

test('refillQueue tops up in whole bags and advances rng state', () => {
  const r = refillQueue([], 12345 >>> 0, 7);
  assert.ok(r.queue.length >= 7);
  assert.equal(r.queue.length % 7, 0);
  // every 7-window contains each piece exactly once (bag guarantee)
  for (let i = 0; i + 7 <= r.queue.length; i += 7) {
    const window = r.queue.slice(i, i + 7);
    assert.deepEqual([...window].sort(), [...PIECE_TYPES].sort());
  }
  // calling again with a queue already long enough is a no-op on contents
  const same = refillQueue(r.queue, r.state, 7);
  assert.deepEqual(same.queue, r.queue);
  assert.equal(same.state, r.state);
});

// --- scoring / level / gravity ---------------------------------------------
test('scoreForClear scales with line count and level', () => {
  assert.equal(scoreForClear(0, 5), 0);
  assert.equal(scoreForClear(1, 1), LINE_SCORES[1]);
  assert.equal(scoreForClear(4, 3), LINE_SCORES[4] * 3);
  // clamps absurd counts to the tetris value
  assert.equal(scoreForClear(9, 2), LINE_SCORES[4] * 2);
});

test('levelForLines climbs every 10 lines', () => {
  assert.equal(levelForLines(0), 1);
  assert.equal(levelForLines(9), 1);
  assert.equal(levelForLines(10), 2);
  assert.equal(levelForLines(25), 3);
});

test('gravityMs decreases with level toward a floor', () => {
  assert.ok(gravityMs(1) > gravityMs(2));
  assert.ok(gravityMs(2) > gravityMs(5));
  assert.ok(gravityMs(100) >= 60, 'never faster than the 60ms floor');
  assert.equal(gravityMs(100), 60);
});

// --- reducer ----------------------------------------------------------------
test('createGame is deterministic for a seed and well-formed', () => {
  const a = createGame(2024);
  const b = createGame(2024);
  assert.equal(a.piece.type, b.piece.type);
  assert.deepEqual(a.queue, b.queue);
  assert.equal(a.score, 0);
  assert.equal(a.lines, 0);
  assert.equal(a.level, 1);
  assert.equal(a.over, false);
  assert.ok(a.queue.length >= 6, 'a "next" queue is primed');
  assert.deepEqual(a.ghost, ghostFor(a.board, a.piece));
});

test('moveLeft / moveRight shift the active piece and respect walls', () => {
  let g = createGame(1);
  const x0 = g.piece.x;
  g = moveRight(g);
  assert.equal(g.piece.x, x0 + 1);
  g = moveLeft(g);
  assert.equal(g.piece.x, x0);
  // walk into the left wall — eventually a move is rejected (state unchanged)
  let guard = 0;
  let prev = g.piece.x;
  while (guard++ < 20) {
    g = moveLeft(g);
    if (g.piece.x === prev) break;
    prev = g.piece.x;
  }
  assert.ok(guard < 20, 'left movement clamps at the wall');
});

test('rotateGame updates rotation and the ghost', () => {
  let g = createGame(5);
  const before = g.piece.rot;
  g = rotateGame(g, 1);
  // O never visually rotates but rot still advances; other pieces change shape
  assert.equal(g.piece.rot, (before + 1) % 4);
  assert.deepEqual(g.ghost, ghostFor(g.board, g.piece));
});

test('dropStep moves down or reports blocked without locking', () => {
  let g = createGame(3);
  const r = dropStep(g, true);
  assert.ok(r.moved);
  assert.equal(r.game.piece.y, g.piece.y + 1);
  assert.equal(r.game.score, 1, 'soft drop adds a point');
  // at the floor, dropStep reports not-moved and does NOT lock
  let cur = g;
  for (let i = 0; i < ROWS + 2; i++) {
    const step = dropStep(cur, false);
    if (!step.moved) break;
    cur = step.game;
  }
  const blocked = dropStep(cur, false);
  assert.equal(blocked.moved, false);
  assert.equal(blocked.game, cur, 'blocked dropStep is a no-op (component locks)');
});

test('hardDrop locks the piece, spawns the next, and advances the count', () => {
  let g = createGame(7);
  const firstType = g.piece.type;
  const nextType = g.queue[0];
  g = hardDrop(g);
  assert.equal(g.pieces, 1);
  assert.equal(g.piece.type, nextType, 'next piece spawned from the queue');
  assert.ok(g.score >= 2, 'hard drop awarded drop points');
  // the locked piece left filled cells on the board
  const filled = g.board.flat().filter((c) => c !== 0).length;
  assert.equal(filled, 4, `${firstType} contributes its 4 cells`);
});

test('lockAndSpawn clears a completed line and scores it', () => {
  // hand-build a board one cell short of a full bottom row, with a vertical I
  // ready to drop into the gap at the last column. A rot-1 I occupies box-column
  // offset 2, so x = COLS-3 (=7) places its single column at COLS-1 (=9).
  let g = createGame(11);
  const b = createBoard();
  for (let c = 0; c < COLS - 1; c++) b[ROWS - 1][c] = 1; // gap at the last column
  g = { ...g, board: b, piece: { type: 'I', rot: 1, x: COLS - 3, y: ROWS - 4 } };
  const before = g.lines;
  g = hardDrop(g);
  assert.equal(g.lines, before + 1, 'one line cleared');
  assert.ok(g.score > 0, 'clearing scored');
  assert.equal(g.cleared, 1, 'flash count exposed');
  // 9 (bottom row) + 4 (the I) = 13 cells; clearing the full row removes 10 → 3
  // cells (the I's upper three) remain, shifted down by the cleared row.
  assert.equal(g.board.flat().filter((c) => c !== 0).length, 3);
  assert.ok(!g.board.some((row) => row.every((c) => c !== 0)), 'no full row survives');
});

test('a clear that crosses a level boundary scores with the PRE-clear level', () => {
  // lines 9 -> 10 levels up to 2, but the clear that triggers it must still be
  // scored at level 1 (the conventional ordering). Use lockAndSpawn directly so
  // no hard-drop points muddy the assertion.
  let g = createGame(21);
  const b = createBoard();
  for (let c = 0; c < COLS - 1; c++) b[ROWS - 1][c] = 1; // gap at the last column
  g = { ...g, board: b, lines: 9, level: 1, score: 0, piece: { type: 'I', rot: 1, x: COLS - 3, y: ROWS - 4 } };
  g = lockAndSpawn(g);
  assert.equal(g.lines, 10, 'one line cleared, crossing the boundary');
  assert.equal(g.level, 2, 'level advanced AFTER the clear');
  assert.equal(g.score, scoreForClear(1, 1), 'scored at the pre-clear level (1)');
  assert.notEqual(g.score, scoreForClear(1, 2), 'NOT the post-clear level (2)');
});

test('game over fires when a freshly spawned piece has no room', () => {
  let g = createGame(13);
  // Block the spawn band (rows 0-1, cols 3-6 — every piece spawns within it) but
  // leave NO full row, so nothing clears on lock. Drop a vertical I far down
  // column 0 (rot-1 I at x=-2 occupies col 0) where it locks without completing
  // a line; the NEXT spawn then has nowhere to go → topped out.
  const b = createBoard();
  for (let r = 0; r <= 1; r++) for (let c = 3; c <= 6; c++) b[r][c] = 1;
  g = { ...g, board: b, piece: { type: 'I', rot: 1, x: -2, y: 0 } };
  g = hardDrop(g);
  assert.equal(g.over, true, 'topped out');
  // transitions on a finished game are no-ops
  assert.equal(moveLeft(g), g);
  assert.equal(rotateGame(g, 1), g);
  assert.equal(hardDrop(g), g);
});
