// cascadeEngine.js — pure, framework-free logic for the M5 stack cabinet
// "CASCADE" (an ORIGINAL falling-block puzzle).
//
// Kept deliberately free of DOM / React / WebAudio so the board, piece geometry,
// rotation (with wall-kicks), gravity, locking, line-clears and scoring can all
// be exercised by the built-in `node --test` runner (Node v26) — no npm dep.
// Everything here is DETERMINISTIC: the only randomness is a seeded mulberry32
// PRNG (shared with the pulse/gridlock engines) that feeds a 7-bag piece
// randomizer, so a given seed always produces the same game (great for replays
// and reproducible tests).
//
// LEGAL: this is an ORIGINAL game. The cabinet name CASCADE is original (NOT
// "Tetris"). The seven tetromino shapes are public-domain geometry (the letters
// I/O/T/S/Z/J/L are generic descriptors, not branding); the art, palette, audio
// and cabinet stickers are all original (see CascadeGame.jsx / ASSETS.md M5).
// We render an original falling-block game IN-WORLD — we do NOT embed tetr.io,
// which sets X-Frame-Options/CSP that block embedding and whose ToS forbids it
// (see the note in CascadeGame.jsx).

// --- board ------------------------------------------------------------------
export const COLS = 10;
export const ROWS = 20;

// Piece type order is fixed and used as the color index (1..7); 0 = empty cell.
export const PIECE_TYPES = ['I', 'O', 'T', 'S', 'Z', 'J', 'L'];

// Color index (1-based) for a piece type — what gets written into the board on
// lock. The component maps these indices to its own ORIGINAL neon palette.
export function colorIndex(type) {
  return PIECE_TYPES.indexOf(type) + 1;
}

// --- PRNG -------------------------------------------------------------------
// Deterministic mulberry32, same stream as the other engines. Two flavours:
//  - makeRng(seed): a stateful closure (for one-shot shuffles / non-serializable
//    callers).
//  - rngNext(state): a PURE step that returns { value, state } so the whole game
//    (including the upcoming-piece queue) stays serializable + replayable.
export function rngNext(state) {
  let a = state | 0;
  a = (a + 0x6d2b79f5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  const value = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  return { value, state: a };
}

export function makeRng(seed) {
  let s = seed >>> 0;
  return function rng() {
    const r = rngNext(s);
    s = r.state;
    return r.value;
  };
}

// --- piece geometry ---------------------------------------------------------
// Each piece is defined by its spawn cells inside an N×N bounding box (BOX) and
// rotated programmatically, so the four rotation states are derived (not hand
// transcribed). Coordinates are [col, row] with row increasing DOWNWARD (the
// natural orientation for a piece that falls from the top of the board).
export const BOX = { I: 4, O: 2, T: 3, S: 3, Z: 3, J: 3, L: 3 };

const SPAWN_CELLS = {
  I: [[0, 1], [1, 1], [2, 1], [3, 1]],
  O: [[0, 0], [1, 0], [0, 1], [1, 1]],
  T: [[1, 0], [0, 1], [1, 1], [2, 1]],
  S: [[1, 0], [2, 0], [0, 1], [1, 1]],
  Z: [[0, 0], [1, 0], [1, 1], [2, 1]],
  J: [[0, 0], [0, 1], [1, 1], [2, 1]],
  L: [[2, 0], [0, 1], [1, 1], [2, 1]],
};

// Rotate a single [x, y] cell clockwise inside an N×N box: (x,y) -> (N-1-y, x).
function rotateCellCW(x, y, n) {
  return [n - 1 - y, x];
}

// Precompute all four rotation states for every piece ONCE at module load, so
// the hot render path (forEachPieceCell, called per frame for the active + ghost
// pieces) does ZERO allocation — rotatedCells just returns a cached, shared,
// read-only array. ROTATIONS[type][r] = cells after r clockwise rotations.
const ROTATIONS = {};
for (let p = 0; p < PIECE_TYPES.length; p++) {
  const type = PIECE_TYPES[p];
  const n = BOX[type];
  let cells = SPAWN_CELLS[type].map(([x, y]) => [x, y]);
  ROTATIONS[type] = [];
  for (let r = 0; r < 4; r++) {
    ROTATIONS[type].push(cells.map(([x, y]) => [x, y]));
    cells = cells.map(([x, y]) => rotateCellCW(x, y, n));
  }
}

// The four cells of `type` at rotation `rot` (0..3, clockwise), relative to the
// piece's bounding-box origin. Returns a CACHED, SHARED, READ-ONLY array (no
// allocation) so it is safe on the per-frame render path — callers must not
// mutate the result.
export function rotatedCells(type, rot) {
  return ROTATIONS[type][((rot % 4) + 4) % 4];
}

// Spawn column so the piece sits roughly centered along the top of the board.
export function spawnCol(type) {
  return Math.floor((COLS - BOX[type]) / 2);
}

// A piece is { type, rot, x, y } where (x, y) is the bounding-box origin on the
// board. Pieces spawn with their box at the very top (y = 0).
export function spawnPiece(type) {
  return { type, rot: 0, x: spawnCol(type), y: 0 };
}

// Absolute board cells of a piece (allocates a small array — use on state change
// only). The renderer should prefer forEachPieceCell to stay alloc-free.
export function pieceCells(piece) {
  const rel = rotatedCells(piece.type, piece.rot);
  const out = [];
  for (let i = 0; i < rel.length; i++) out.push([piece.x + rel[i][0], piece.y + rel[i][1]]);
  return out;
}

// Allocation-free iteration over a piece's absolute cells: cb(col, row) per cell.
// The per-frame canvas renderer uses this so drawing the active/ghost piece
// never allocates.
export function forEachPieceCell(piece, cb) {
  const rel = rotatedCells(piece.type, piece.rot);
  for (let i = 0; i < rel.length; i++) cb(piece.x + rel[i][0], piece.y + rel[i][1]);
}

// --- board helpers ----------------------------------------------------------
export function createBoard() {
  const board = new Array(ROWS);
  for (let r = 0; r < ROWS; r++) board[r] = new Array(COLS).fill(0);
  return board;
}

function cloneBoard(board) {
  const out = new Array(board.length);
  for (let r = 0; r < board.length; r++) out[r] = board[r].slice();
  return out;
}

// True if the piece is out of bounds (sides / bottom) or overlaps a filled cell.
// Cells ABOVE the board (row < 0) are allowed — pieces can poke out of the top
// while spawning/rotating; only the visible/solid region collides.
export function collides(board, piece) {
  const rel = rotatedCells(piece.type, piece.rot);
  for (let i = 0; i < rel.length; i++) {
    const c = piece.x + rel[i][0];
    const r = piece.y + rel[i][1];
    if (c < 0 || c >= COLS) return true;
    if (r >= ROWS) return true;
    if (r >= 0 && board[r][c] !== 0) return true;
  }
  return false;
}

// Try to translate a piece; returns the moved piece or null if it would collide.
export function tryMove(board, piece, dx, dy) {
  const next = { type: piece.type, rot: piece.rot, x: piece.x + dx, y: piece.y + dy };
  return collides(board, next) ? null : next;
}

// Wall-kick offsets tried (in order) when a rotation is blocked. A pragmatic,
// symmetric kick set (NOT the full SRS tables) that pushes the piece off walls,
// the floor and neighbouring blocks — deterministic and unit-tested. [dx, dy],
// row increases downward so dy = -1 nudges the piece UP off the floor. The
// deeper [0, -2] up-kick exists specifically so a horizontal I resting on the
// floor (which needs 3 rows of clearance to stand up) can rotate to vertical.
const KICKS = [
  [0, 0],
  [-1, 0], [1, 0],
  [0, -1],
  [-2, 0], [2, 0],
  [-1, -1], [1, -1],
  [0, -2],
];

// Rotate a piece (dir = +1 clockwise, -1 counter-clockwise) with wall-kicks.
// Returns the rotated+kicked piece, or null if no offset frees it.
export function tryRotate(board, piece, dir) {
  const rot = ((piece.rot + (dir > 0 ? 1 : 3)) % 4 + 4) % 4;
  for (let i = 0; i < KICKS.length; i++) {
    const cand = { type: piece.type, rot, x: piece.x + KICKS[i][0], y: piece.y + KICKS[i][1] };
    if (!collides(board, cand)) return cand;
  }
  return null;
}

// Drop a piece straight down until it rests; returns { piece, distance }.
export function hardDropPiece(board, piece) {
  let p = piece;
  let distance = 0;
  for (;;) {
    const next = tryMove(board, p, 0, 1);
    if (!next) break;
    p = next;
    distance++;
  }
  return { piece: p, distance };
}

// The landing "ghost" — where the current piece would rest if hard-dropped.
export function ghostFor(board, piece) {
  return hardDropPiece(board, piece).piece;
}

// Stamp a piece into the board (returns a NEW board; cells above the top are
// dropped). Color is the piece's type index.
export function lockPiece(board, piece) {
  const out = cloneBoard(board);
  const color = colorIndex(piece.type);
  const rel = rotatedCells(piece.type, piece.rot);
  for (let i = 0; i < rel.length; i++) {
    const c = piece.x + rel[i][0];
    const r = piece.y + rel[i][1];
    if (r >= 0 && r < ROWS && c >= 0 && c < COLS) out[r][c] = color;
  }
  return out;
}

export function isRowFull(row) {
  for (let c = 0; c < row.length; c++) if (row[c] === 0) return false;
  return true;
}

// Remove all full rows; returns { board, cleared, rows } where `rows` are the
// cleared row indices (top→bottom) for the component's flash animation.
export function clearLines(board) {
  const kept = [];
  const rows = [];
  for (let r = 0; r < board.length; r++) {
    if (isRowFull(board[r])) rows.push(r);
    else kept.push(board[r].slice());
  }
  const cleared = rows.length;
  while (kept.length < ROWS) kept.unshift(new Array(COLS).fill(0));
  return { board: kept, cleared, rows };
}

// --- 7-bag randomizer -------------------------------------------------------
// Fisher–Yates shuffle of one bag (all seven pieces, each once) using a closure
// rng. Deterministic for a given rng stream.
export function makeBag(rng) {
  const bag = PIECE_TYPES.slice();
  for (let i = bag.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = bag[i];
    bag[i] = bag[j];
    bag[j] = tmp;
  }
  return bag;
}

// Refill an upcoming-piece queue to at least `min` entries using the serializable
// rng state, appending whole 7-bags. Returns { queue, state }. Pure.
export function refillQueue(queue, rngState, min = 7) {
  const q = queue.slice();
  let state = rngState;
  while (q.length < min) {
    const bag = PIECE_TYPES.slice();
    for (let i = bag.length - 1; i > 0; i--) {
      const step = rngNext(state);
      state = step.state;
      const j = Math.floor(step.value * (i + 1));
      const tmp = bag[i];
      bag[i] = bag[j];
      bag[j] = tmp;
    }
    for (let i = 0; i < bag.length; i++) q.push(bag[i]);
  }
  return { queue: q, state };
}

// --- scoring / level / gravity ----------------------------------------------
// Points awarded for clearing n lines at once (× level). Index by line count.
export const LINE_SCORES = [0, 100, 300, 500, 800];

export function levelForLines(lines) {
  return 1 + Math.floor(lines / 10);
}

export function scoreForClear(cleared, level) {
  const base = LINE_SCORES[Math.min(cleared, 4)] || 0;
  return base * level;
}

// Gravity interval (ms per cell) by level. Starts gentle, ramps to a fast floor
// so the game stays playable but escalates. Pure.
export function gravityMs(level) {
  return Math.max(60, Math.round(800 - (level - 1) * 65));
}

// --- game reducer -----------------------------------------------------------
// A serializable game object the component holds in a ref and reassigns. All
// transitions are pure (return a new game); the board is only copied when it
// actually changes (lock), so moves/rotations are cheap. Timing (gravity cadence,
// lock delay, soft/hard-drop input) is owned by the component — the engine only
// answers "what is the next valid state".
export function createGame(seed = 0x9e3779b1) {
  const init = refillQueue([], seed >>> 0, 7);
  const type = init.queue[0];
  const queue = init.queue.slice(1);
  const board = createBoard();
  const piece = spawnPiece(type);
  return {
    board,
    piece,
    ghost: ghostFor(board, piece),
    queue, // upcoming piece types (queue[0] is "next")
    rngState: init.state,
    score: 0,
    lines: 0,
    level: 1,
    cleared: 0, // lines cleared by the LAST lock (for the component's flash)
    clearedRows: [], // their row indices
    pieces: 0, // pieces locked (stat)
    over: false,
  };
}

function withGhost(game) {
  return { ...game, ghost: ghostFor(game.board, game.piece) };
}

// Pull the next piece from the queue (refilling from the bag as needed) and
// spawn it; flags game over if it has nowhere to go. Internal.
function spawnNext(game, board) {
  let queue = game.queue;
  let rngState = game.rngState;
  if (queue.length < 1) {
    const r = refillQueue(queue, rngState, 7);
    queue = r.queue;
    rngState = r.state;
  }
  const type = queue[0];
  const rest = queue.slice(1);
  const refilled = refillQueue(rest, rngState, 7);
  const piece = spawnPiece(type);
  const over = collides(board, piece);
  return {
    ...game,
    board,
    piece,
    ghost: ghostFor(board, piece),
    queue: refilled.queue,
    rngState: refilled.state,
    over,
  };
}

export function moveLeft(game) {
  if (game.over) return game;
  const next = tryMove(game.board, game.piece, -1, 0);
  return next ? withGhost({ ...game, piece: next }) : game;
}

export function moveRight(game) {
  if (game.over) return game;
  const next = tryMove(game.board, game.piece, 1, 0);
  return next ? withGhost({ ...game, piece: next }) : game;
}

export function rotateGame(game, dir) {
  if (game.over) return game;
  const next = tryRotate(game.board, game.piece, dir);
  return next ? withGhost({ ...game, piece: next }) : game;
}

// Try to drop the active piece by one cell. Returns { game, moved }. Does NOT
// lock when blocked (the component runs the lock-delay timer, then calls
// lockAndSpawn). `soft` adds a +1 manual soft-drop point when it moves.
export function dropStep(game, soft = false) {
  if (game.over) return { game, moved: false };
  const next = tryMove(game.board, game.piece, 0, 1);
  if (!next) return { game, moved: false };
  const g = withGhost({ ...game, piece: next, score: game.score + (soft ? 1 : 0) });
  return { game: g, moved: true };
}

// Lock the active piece, clear lines, score, level-up and spawn the next piece.
export function lockAndSpawn(game) {
  if (game.over) return game;
  const locked = lockPiece(game.board, game.piece);
  const { board, cleared, rows } = clearLines(locked);
  const lines = game.lines + cleared;
  const level = levelForLines(lines);
  const score = game.score + scoreForClear(cleared, game.level);
  const base = {
    ...game,
    score,
    lines,
    level,
    cleared,
    clearedRows: rows,
    pieces: game.pieces + 1,
  };
  return spawnNext(base, board);
}

// Hard drop: slam to the bottom (+2/cell), then lock+spawn.
export function hardDrop(game) {
  if (game.over) return game;
  const { piece, distance } = hardDropPiece(game.board, game.piece);
  const dropped = { ...game, piece, score: game.score + distance * 2 };
  return lockAndSpawn(dropped);
}
