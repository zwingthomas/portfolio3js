// pulseEngine.js — pure, framework-free logic for the M3 rhythm cabinet "PULSE".
//
// Kept deliberately free of DOM / React / WebAudio so the judgment windows,
// scoring, combo, health, chart-generation and stage-progression logic can be
// unit-tested with the built-in `node --test` runner (Node v26) — no npm dep.
// Everything here is DETERMINISTIC (no Math.random / Date.now); randomness in
// chart generation comes from a seeded PRNG so charts are reproducible and the
// reversed "encore" maps cleanly back onto the forward chart.
//
// LEGAL: this is original game logic. The cabinet name PULSE is original (NOT
// Frogger/Tetris/DDR/Tron). No copyrighted song is embedded — tracks load from
// documented asset slots at runtime, and judgments work with a generated tone
// when the slots are empty (see pulseAudio.js + ASSETS.md M3).

// --- lanes: 0 = ← (left), 1 = ↓ (down), 2 = ↑ (up), 3 = → (right) ------------
export const LANES = 4;

export function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

// Deterministic PRNG (mulberry32). Returns a function yielding floats in [0,1).
// Seeded so a given (song, stage) always produces the same chart.
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

// --- judgment windows (ms) ---------------------------------------------------
// A press within PERFECT_MS of a note's time is PERFECT; within GREAT_MS is
// GREAT; a note whose time passes `now - GREAT_MS` unhit auto-MISSES. There is
// no "boo" penalty for empty presses (forgiving), so flailing can't tank a run.
export const JUDGE_WINDOWS = { perfectMs: 45, greatMs: 105 };

// Judge a signed timing delta (nowMs - noteTime). Returns 'PERFECT' | 'GREAT'
// when inside a hit window, or null when outside (the press hit nothing).
export function judge(deltaMs, windows = JUDGE_WINDOWS) {
  const d = Math.abs(deltaMs);
  if (d <= windows.perfectMs) return 'PERFECT';
  if (d <= windows.greatMs) return 'GREAT';
  return null;
}

// A note is missed once the clock passes its time by more than the GREAT window
// without the note having been hit.
export function isMissed(note, nowMs, windows = JUDGE_WINDOWS) {
  return nowMs - note.time > windows.greatMs;
}

// --- scoring / combo / health ------------------------------------------------
export const SCORE = { PERFECT: 300, GREAT: 100, MISS: 0 };

export function scoreForJudgment(j) {
  return SCORE[j] || 0;
}

// Combo grows the per-note multiplier in clean tiers; a MISS resets combo to 0.
export function comboMultiplier(combo) {
  if (combo >= 100) return 4;
  if (combo >= 50) return 3;
  if (combo >= 20) return 2;
  if (combo >= 10) return 1.5;
  return 1;
}

export function initialPlayState() {
  return {
    score: 0,
    combo: 0,
    maxCombo: 0,
    counts: { PERFECT: 0, GREAT: 0, MISS: 0 },
    lastJudgment: null,
    gained: 0,
  };
}

// Fold a judgment into the play state, returning a NEW state (pure). The
// multiplier is sampled from the combo AFTER incrementing so a hit on the 10th
// note already earns the 1.5x tier.
export function applyJudgment(state, j) {
  const combo = j === 'MISS' ? 0 : state.combo + 1;
  const mult = comboMultiplier(combo);
  const gained = Math.round(scoreForJudgment(j) * mult);
  return {
    score: state.score + gained,
    combo,
    maxCombo: Math.max(state.maxCombo, combo),
    counts: { ...state.counts, [j]: (state.counts[j] || 0) + 1 },
    lastJudgment: j,
    gained,
  };
}

export const HEALTH = { max: 100, start: 70, missDrain: 9, perfectGain: 1.5, greatGain: 0.75 };

// Health rises a little on good hits and drains on misses; clamped to [0, max].
// Reaching 0 ends the run (the player "dies"); the cabinet keeps escalating
// reversed tracks until then or until they leave.
export function nextHealth(health, j, cfg = HEALTH) {
  let delta = 0;
  if (j === 'MISS') delta = -cfg.missDrain;
  else if (j === 'PERFECT') delta = cfg.perfectGain;
  else if (j === 'GREAT') delta = cfg.greatGain;
  return clamp(health + delta, 0, cfg.max);
}

// --- chart generation --------------------------------------------------------
// Build a deterministic note chart. Difficulty ramps across the track: the
// chance of placing a note per beat rises, and at higher progress a quick
// off-beat note ("stream") can spawn. Notes are sorted ascending by time.
export function generateChart({
  bpm = 124,
  durationMs = 60000,
  seed = 1,
  lanes = LANES,
  leadInMs = 2000,
} = {}) {
  const rng = makeRng(seed);
  const beatMs = 60000 / Math.max(1, bpm);
  const notes = [];
  let id = 0;
  let lastLane = -1;
  // Iterate the beat grid from 0 so note times are exact multiples of beatMs and
  // therefore land on the metronome clicks (which fire at k*beatMs from the same
  // start). A non-grid-aligned lead-in would put every note a constant fraction
  // of a beat off the audible click → "on the beat" would score GREAT, not
  // PERFECT. The lead-in is just a quiet intro: no notes placed before it.
  for (let t = 0; t < durationMs - beatMs; t += beatMs) {
    if (t < leadInMs) continue;
    const span = Math.max(1, durationMs - leadInMs);
    const progress = clamp((t - leadInMs) / span, 0, 1);
    const placeChance = 0.62 + 0.3 * progress;
    if (rng() < placeChance) {
      let lane = Math.floor(rng() * lanes) % lanes;
      // avoid long single-lane "jacks": nudge to a neighbour sometimes
      if (lane === lastLane && rng() < 0.5) lane = (lane + 1) % lanes;
      notes.push({ id: id++, time: Math.round(t), lane });
      lastLane = lane;
      // higher difficulty: chance of a half-beat follow-up note
      if (progress > 0.4 && rng() < 0.32 * progress) {
        const lane2 = Math.floor(rng() * lanes) % lanes;
        notes.push({ id: id++, time: Math.round(t + beatMs / 2), lane: lane2 });
      }
    }
  }
  notes.sort((a, b) => a.time - b.time);
  return notes;
}

// Reverse a chart in time for the "encore". Each note at time `t` maps to
// `durationMs - t + leadInMs`; `mirror` flips lanes left<->right and up<->down
// (lane index 3 - lane) for a mirrored feel. `leadInMs` restores the quiet
// intro the forward pass enjoys — WITHOUT it the reversed chart's first note
// (the forward chart's LAST note, near durationMs) lands a few hundred ms in,
// already most of the way down the lane and physically unreactable, forcing
// guaranteed opening misses on every encore. Re-ids and re-sorts so the result
// is a valid forward chart for the same engine.
export function reverseChart(notes, durationMs, { mirror = false, lanes = LANES, leadInMs = 0 } = {}) {
  const mapLane = mirror ? (l) => lanes - 1 - l : (l) => l;
  const out = notes.map((n) => ({
    id: -1,
    time: durationMs - n.time + leadInMs,
    lane: mapLane(n.lane),
  }));
  out.sort((a, b) => a.time - b.time);
  out.forEach((n, i) => { n.id = i; });
  return out;
}

// Largest note time in a chart (used to know when a stage is cleared).
export function chartEndMs(notes) {
  let end = 0;
  for (const n of notes) if (n.time > end) end = n.time;
  return end;
}

// --- hit selection -----------------------------------------------------------
// Pick the nearest not-yet-consumed note in `lane` whose |delta| is within the
// GREAT window. `isConsumed(id)` lets the caller track which notes were used
// without this module holding mutable state. Returns { note, delta } or null.
export function pickHit(notes, lane, nowMs, windows = JUDGE_WINDOWS, isConsumed = () => false) {
  let best = null;
  let bestAbs = Infinity;
  for (const n of notes) {
    if (n.lane !== lane) continue;
    if (isConsumed(n.id)) continue;
    const delta = nowMs - n.time;
    const ad = Math.abs(delta);
    if (ad <= windows.greatMs && ad < bestAbs) {
      bestAbs = ad;
      best = n;
    }
  }
  return best ? { note: best, delta: nowMs - best.time } : null;
}

// --- rendering helpers (pure; used by the canvas in PulseGame) ---------------
// Note travel progress: 0 when the note spawns (approachMs before its time), 1
// exactly at the hit line, >1 once it has passed. Linear in time.
export function noteProgress(noteTime, nowMs, approachMs) {
  const a = approachMs > 0 ? approachMs : 1;
  return 1 - (noteTime - nowMs) / a;
}

// Which lane a horizontal pixel falls into for tap/click input. `bandLeft` is
// the x of the left edge of the lane band, `laneW` the per-lane width. Returns
// the lane index, or -1 when the point is outside the band.
export function laneIndexForX(x, bandLeft, laneW, lanes = LANES) {
  if (laneW <= 0) return -1;
  const rel = x - bandLeft;
  if (rel < 0 || rel >= laneW * lanes) return -1;
  return clamp(Math.floor(rel / laneW), 0, lanes - 1);
}

// --- stage progression -------------------------------------------------------
// Stage 0 = track 1 forward. Stage 1 = track 1 reversed (the "encore"). Stage 2
// = track 2 reversed, stage 3 = track 3 reversed, then it loops through the
// tracks again with a mirror flip and rising BPM — escalating until the player
// dies or leaves. Returns the config the game uses to build the next stage.
export function stageConfig(stage, songCount = 3) {
  const count = Math.max(1, songCount);
  if (stage <= 0) {
    return { songIndex: 0, reversed: false, mirror: false, bpmScale: 1, label: 'TRACK 01' };
  }
  if (stage === 1) {
    return { songIndex: 0, reversed: true, mirror: false, bpmScale: 1.05, label: 'ENCORE · TRACK 01 ◄' };
  }
  // stage 2 -> song index 1, stage 3 -> index 2, stage 4 -> index 0 (cycle 2)...
  const songIndex = (stage - 1) % count;
  const cycle = Math.floor((stage - 1) / count); // 0 on the first full pass
  const mirror = cycle % 2 === 1;
  const bpmScale = 1 + 0.05 * stage;
  const tag = cycle > 0 ? ` ×${cycle + 1}` : '';
  return {
    songIndex,
    reversed: true,
    mirror,
    bpmScale,
    label: `TRACK 0${songIndex + 1} ◄${tag}`,
  };
}
