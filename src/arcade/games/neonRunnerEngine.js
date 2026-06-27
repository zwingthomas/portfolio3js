// neonRunnerEngine.js — pure, framework-free logic for the M7 "NEON RUNNER"
// grid duel (the encounter triggered in a hub "tall grass" zone while riding).
//
// Kept deliberately free of DOM / React / WebAudio so the grid, the two riders,
// their light-trails, the step/collision rules, the CPU AI, and win/lose/draw
// resolution can be unit-tested with the built-in `node --test` runner (Node
// v26) — no npm dep. Everything is DETERMINISTIC (no Math.random / Date.now):
// per-duel variety comes from a seeded PRNG, so a given seed always plays out
// identically (handy for reproducible tests).
//
// LEGAL: original game logic + name. The neon-cycle "leave a wall behind you,
// last rider standing wins" GENRE is inspirational only; "NEON RUNNER", its art,
// and audio are all original (NEVER a real Tron character / logo / likeness).

export const GRID = 21; // cells per side (odd so there's a centre column)

// Direction codes + unit deltas. up = row decreasing (screen-up).
export const DIR = { up: 0, right: 1, down: 2, left: 3 };
const DV = [
  [0, -1], // up
  [1, 0], // right
  [0, 1], // down
  [-1, 0], // left
];

// Cell contents.
export const CELL = { empty: 0, player: 1, cpu: 2 };

export function idx(col, row, grid = GRID) {
  return row * grid + col;
}

export function inBounds(col, row, grid = GRID) {
  return col >= 0 && col < grid && row >= 0 && row < grid;
}

// 180° reversal is illegal (you'd drive straight into your own trail). Returns
// true when `next` is the direct opposite of `cur`.
export function isReverse(cur, next) {
  return (cur + 2) % 4 === next;
}

// Deterministic PRNG (mulberry32) — same seed yields the same stream.
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

// Fresh duel state. Riders start on opposite sides facing each other across the
// grid; with both leaving trails the board fills, so the duel ALWAYS resolves
// within a bounded number of ticks (no infinite game).
export function createDuel(seed = 1) {
  const grid = new Int8Array(GRID * GRID);
  const startRow = GRID - 4;
  const player = { col: 4, row: startRow, dir: DIR.up, alive: true };
  const cpu = { col: GRID - 5, row: 3, dir: DIR.down, alive: true };
  // mark the starting cells as occupied so neither can be re-entered.
  grid[idx(player.col, player.row)] = CELL.player;
  grid[idx(cpu.col, cpu.row)] = CELL.cpu;
  return {
    grid,
    player,
    cpu,
    status: 'playing', // playing | win (player) | lose (player) | draw
    tick: 0,
    rng: makeRng(seed),
  };
}

// Queue a turn for a rider (mutates dir) unless it's an illegal 180° reversal or
// the rider is dead / the duel is over. `who` is 'player' or 'cpu'.
export function setDir(state, who, dir) {
  if (state.status !== 'playing') return false;
  const r = state[who];
  if (!r || !r.alive) return false;
  if (dir < 0 || dir > 3) return false;
  if (isReverse(r.dir, dir)) return false;
  r.dir = dir;
  return true;
}

// How many empty cells lie straight ahead of (col,row) heading `dir`, up to
// `limit`. Used by the CPU to prefer roomy directions (a cheap survival score).
export function freeRun(grid, col, row, dir, limit = GRID) {
  const [dc, dr] = DV[dir];
  let c = col;
  let r = row;
  let n = 0;
  while (n < limit) {
    c += dc;
    r += dr;
    if (!inBounds(c, r) || grid[idx(c, r)] !== CELL.empty) break;
    n++;
  }
  return n;
}

// Pure CPU AI: choose a direction for the cpu that (1) is legal (no reversal),
// (2) does not drive it straight into a wall next tick when avoidable, and (3)
// maximises open run length, with a mild bias toward the player so it plays
// aggressively. Ties are broken by the seeded rng so behaviour is deterministic
// yet not perfectly predictable. Returns a DIR code (falls back to the current
// dir when truly boxed in — it will crash, i.e. the player wins).
export function cpuChooseDir(state) {
  const { grid, cpu, player } = state;
  let bestDir = cpu.dir;
  let bestScore = -Infinity;
  for (let d = 0; d < 4; d++) {
    if (isReverse(cpu.dir, d)) continue;
    const [dc, dr] = DV[d];
    const nc = cpu.col + dc;
    const nr = cpu.row + dr;
    const blocked = !inBounds(nc, nr) || grid[idx(nc, nr)] !== CELL.empty;
    // base survival score: how much room is ahead this way.
    let score = blocked ? -1000 : freeRun(grid, cpu.col, cpu.row, d, GRID);
    if (!blocked) {
      // aggression: shrinking Manhattan distance to the player is a small bonus.
      const dist = Math.abs(nc - player.col) + Math.abs(nr - player.row);
      score += (2 * GRID - dist) * 0.15;
      // keep going straight a touch more often (smoother lines, fewer self-traps)
      if (d === cpu.dir) score += 0.5;
      // rng tie-break / jitter so it isn't robotic
      score += state.rng() * 0.4;
    }
    if (score > bestScore) {
      bestScore = score;
      bestDir = d;
    }
  }
  return bestDir;
}

// Advance the duel one tick. Both riders lay a trail in the cell they occupy,
// then attempt to move forward one cell. A rider dies if its target cell is out
// of bounds or already filled (a wall/trail), or if BOTH riders target the same
// empty cell (a head-on). Resolves `status` to win/lose/draw. Mutates `state`.
export function step(state) {
  if (state.status !== 'playing') return state;

  // CPU picks its heading for this tick (player's dir was set via input).
  setDir(state, 'cpu', cpuChooseDir(state));

  const p = state.player;
  const c = state.cpu;

  // 1) lay trails at current cells (the cell you leave becomes a solid wall).
  state.grid[idx(p.col, p.row)] = CELL.player;
  state.grid[idx(c.col, c.row)] = CELL.cpu;

  // 2) compute next cells.
  const [pdc, pdr] = DV[p.dir];
  const [cdc, cdr] = DV[c.dir];
  const pnc = p.col + pdc;
  const pnr = p.row + pdr;
  const cnc = c.col + cdc;
  const cnr = c.row + cdr;

  const pCrash = !inBounds(pnc, pnr) || state.grid[idx(pnc, pnr)] !== CELL.empty;
  const cCrash = !inBounds(cnc, cnr) || state.grid[idx(cnc, cnr)] !== CELL.empty;
  // head-on: both heading into the same empty cell this tick.
  const headOn = !pCrash && !cCrash && pnc === cnc && pnr === cnr;

  const playerDies = pCrash || headOn;
  const cpuDies = cCrash || headOn;

  // 3) move survivors.
  if (!playerDies) { p.col = pnc; p.row = pnr; state.grid[idx(p.col, p.row)] = CELL.player; }
  else { p.alive = false; }
  if (!cpuDies) { c.col = cnc; c.row = cnr; state.grid[idx(c.col, c.row)] = CELL.cpu; }
  else { c.alive = false; }

  state.tick += 1;

  // 4) resolve.
  if (playerDies && cpuDies) state.status = 'draw';
  else if (playerDies) state.status = 'lose';
  else if (cpuDies) state.status = 'win';
  return state;
}

export function isOver(state) {
  return state.status !== 'playing';
}

// Convenience for the renderer/HUD: directional unit delta for a DIR code.
export function dirDelta(dir) {
  return DV[dir];
}
