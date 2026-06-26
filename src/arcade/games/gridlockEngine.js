// gridlockEngine.js — pure, framework-free logic for the M4 crossing cabinet
// "GRIDLOCK".
//
// Kept deliberately free of DOM / React / WebAudio so the board layout, lane /
// car math, step movement, collision and difficulty escalation can be unit
// tested with the built-in `node --test` runner (Node v26) — no npm dep.
// Everything here is DETERMINISTIC (no Math.random / Date.now); per-level lane
// variance comes from a seeded PRNG so a given level always builds the same
// board (handy for replays / debugging and for reproducible tests).
//
// LEGAL: original game logic. The cabinet name GRIDLOCK is original (NOT
// "Frogger"). The crossing GENRE is inspirational only; the parody character
// (an office "hauler" shoving an arcade cabinet across traffic), names, art and
// audio are all original. The game is UNWINNABLE BY DESIGN — see buildLanes /
// levelConfig: difficulty escalates without bound and there is no win state.

// --- grid -------------------------------------------------------------------
export const COLS = 13; // playfield width in columns
export const PLAYER_HALF = 0.42; // player half-width in column units (collision)

// step directions: row increases UPWARD (toward the goal at the top of the board)
export const DIRS = {
  up: { dc: 0, dr: 1 },
  down: { dc: 0, dr: -1 },
  left: { dc: -1, dr: 0 },
  right: { dc: 1, dr: 0 },
};

export function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

// True modulo (result has the sign of the divisor) — JS `%` keeps the dividend's
// sign, which would break the car-lattice math for negative positions/phases.
export function mod(n, m) {
  return ((n % m) + m) % m;
}

// Deterministic PRNG (mulberry32). Same seed -> identical stream.
export function makeRng(seed) {
  let a = seed >>> 0;
  return function rng() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// --- difficulty -------------------------------------------------------------
// Tunables. Early levels are comfortably passable; everything ramps with the
// level index so completion eventually becomes impossible (see UNWINNABLE note).
export const BASE_ROAD_LANES = 3; // road rows at level 0
export const MAX_ROAD_LANES = 7; // cap so the board always fits on screen…
export const BASE_SPEED = 2.0; // columns / second at level 0
export const BASE_PERIOD = 6.0; // base car spacing (columns) at level 0
export const BASE_CARLEN = 2.0; // base car length (columns)
// …but the gap between cars keeps shrinking toward this floor. Once the gap
// (period - carLen) drops below the player's width (2*PLAYER_HALF ≈ 0.84) a lane
// has NO safe pocket to stand in, so high levels become literally uncrossable.
export const MIN_GAP_FLOOR = 0.3;

// Scalar difficulty for a level. `speedScale` grows WITHOUT BOUND with the level
// (no clamp) — combined with the shrinking gap this guarantees the game is
// UNWINNABLE: there is no level at which the board is reliably crossable, and the
// engine never emits a "win" — crossing only escalates to a harder level.
export function levelConfig(level) {
  const lv = Math.max(0, Math.floor(level));
  return {
    level: lv,
    roadRows: Math.min(BASE_ROAD_LANES + lv, MAX_ROAD_LANES),
    speedScale: 1 + lv * 0.14, // unbounded
    periodShrink: lv * 0.5, // columns removed from each lane's spacing
  };
}

// Build the road lanes for a level. Each lane is a continuous-coordinate car
// stream described by { dir, speed, period, carLen, offset }; positions are
// derived analytically from the game clock (see laneOccupiedAt / visibleCars) so
// there is no mutable car array to advance. Deterministic per level.
export function buildLanes(level, cfg = levelConfig(level)) {
  const rng = makeRng(((cfg.level + 1) * 0x9e3779b1) >>> 0);
  const lanes = [];
  for (let i = 0; i < cfg.roadRows; i++) {
    const dir = rng() < 0.5 ? -1 : 1;
    const carLen = round3(BASE_CARLEN * (0.85 + 0.5 * rng())); // ~1.70 .. 2.60
    const speed = round3(BASE_SPEED * cfg.speedScale * (0.75 + 0.6 * rng()));
    const rawPeriod = BASE_PERIOD * (0.85 + 0.4 * rng()) - cfg.periodShrink;
    const period = round3(Math.max(carLen + MIN_GAP_FLOOR, rawPeriod));
    const offset = round3(rng() * period);
    lanes.push({ dir, speed, period, carLen, offset });
  }
  return lanes;
}

function round3(v) {
  return Math.round(v * 1000) / 1000;
}

// Assemble a full board for a level: a bottom SAFE start row (row 0), `roadRows`
// road rows, and a top SAFE goal row. Reaching the goal does NOT win — the
// caller escalates to level+1 and respawns (no terminal state).
export function buildBoard(level) {
  const cfg = levelConfig(level);
  const lanes = buildLanes(level, cfg);
  const rows = cfg.roadRows + 2; // start + roads + goal
  return {
    cols: COLS,
    rows,
    roadRows: cfg.roadRows,
    startRow: 0,
    goalRow: rows - 1,
    lanes, // indexed 0..roadRows-1, mapped to rows 1..roadRows
    cfg,
  };
}

// Lane descriptor for a board row, or null for the safe start/goal rows.
export function laneForRow(board, row) {
  if (row >= 1 && row <= board.roadRows) return board.lanes[row - 1];
  return null;
}

export function isSafeRow(board, row) {
  return laneForRow(board, row) === null;
}

// --- car math ---------------------------------------------------------------
// Canonical car left-edge lattice for a lane at time t (seconds):
//   L_k = offset + dir*speed*t + k*period   (k ∈ ℤ)
// A continuous column position x is covered by a car iff it sits within carLen
// of some lattice point: mod(x - phase, period) < carLen.
export function laneOccupiedAt(lane, x, t) {
  const phase = lane.offset + lane.dir * lane.speed * t;
  return mod(x - phase, lane.period) < lane.carLen;
}

// Does the player (centered at column `px`, half-width `pHalf`) overlap any car
// in `lane` at time t? Reduces the player center into one period and tests the
// three nearest car intervals (k = -1, 0, 1), which is exact because both carLen
// and 2*pHalf are < period for playable lanes (and when they are NOT < period,
// the lane is a solid wall and every position overlaps — handled correctly by
// the same loop). Pure interval overlap, no sampling gaps.
export function collides(lane, px, t, pHalf = PLAYER_HALF) {
  const phase = lane.offset + lane.dir * lane.speed * t;
  const c = mod(px - phase, lane.period); // player center within one period, [0, period)
  const aL = c - pHalf;
  const aR = c + pHalf;
  for (let k = -1; k <= 1; k++) {
    const carL = k * lane.period;
    const carR = carL + lane.carLen;
    if (aL < carR && carL < aR) return true;
  }
  return false;
}

// Iterate each visible car's left-edge column position for [xMin, xMax], calling
// cb(xLeft) per car. Starts one car-length below xMin so a car straddling the
// left edge is included. The lattice matches `collides` exactly (same phase mod
// period), so what you see is what kills you. ALLOCATION-FREE — the per-frame
// renderer uses this directly so the canvas draw loop never builds an array.
export function forEachVisibleCar(lane, t, xMin, xMax, cb) {
  const phase = lane.offset + lane.dir * lane.speed * t;
  const base = mod(phase, lane.period); // a lattice point in [0, period)
  const first = base + lane.period * Math.floor((xMin - lane.carLen - base) / lane.period);
  let guard = 0;
  for (let x = first; x <= xMax && guard < 512; x += lane.period, guard++) {
    cb(x);
  }
}

// Array-returning convenience wrapper over forEachVisibleCar (used by tests /
// non-hot callers). The hot render path uses forEachVisibleCar to avoid the
// per-frame array allocation.
export function visibleCars(lane, t, xMin, xMax) {
  const out = [];
  forEachVisibleCar(lane, t, xMin, xMax, (x) => out.push(round3(x)));
  return out;
}

// --- movement ---------------------------------------------------------------
export function startPos(board) {
  return { col: Math.floor(board.cols / 2), row: board.startRow };
}

// One discrete step in a direction, clamped to the board. Pure.
export function stepPlayer(pos, dirKey, board) {
  const d = DIRS[dirKey];
  if (!d) return pos;
  return {
    col: clamp(pos.col + d.dc, 0, board.cols - 1),
    row: clamp(pos.row + d.dr, 0, board.rows - 1),
  };
}

export function isGoal(pos, board) {
  return pos.row >= board.goalRow;
}

// True when the player currently overlaps traffic on their row. Safe rows are
// never deadly. The player center is `col + 0.5` (cells are unit-wide and the
// player stands in the middle of a cell).
export function playerHit(board, pos, t, pHalf = PLAYER_HALF) {
  const lane = laneForRow(board, pos.row);
  if (!lane) return false;
  return collides(lane, pos.col + 0.5, t, pHalf);
}
