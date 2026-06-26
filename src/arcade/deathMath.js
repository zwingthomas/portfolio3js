// deathMath.js — pure, framework-free helpers for M6 (death & respawn).
//
// Kept separate from the React/r3f components so the fall-damage curve, the
// threat-spawn gate, and the pursuit/catch math can be unit-tested with the
// built-in `node --test` runner (no DOM, no React, no three, no npm dep). The
// components import these; the test file imports them directly. Everything here
// is deterministic — NO Math.random / Date.now — so tests are stable and the
// behaviour is reproducible. Time is always passed in as a parameter.

export function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

// ----------------------------- health / damage -----------------------------

export const MAX_HEALTH = 100;

// A landing below FALL_SAFE_SPEED is harmless; at/above FALL_LETHAL_SPEED it is
// instantly fatal. The player's jump apex returns it to the ground at ~jumpSpeed
// (6.2 m/s with gravity -18 and zero damping), so the safe floor sits above any
// normal jump — only genuine "big drops" off the hub ledge bite. The window is
// tuned to the 5 m-tall room: a ~3 m drop off the mezzanine deals a clear chunk
// (~10–25 HP) without one-shotting, so the chip-damage mechanic is visible while
// the roaming threat stays the lethal hazard.
export const FALL_SAFE_SPEED = 8; // m/s downward impact speed (jump-return ~6.2 stays safe)
export const FALL_LETHAL_SPEED = 16; // m/s downward impact speed

// Maps a downward impact speed (m/s, positive = falling) to damage in [0, max].
// Quadratic ramp between safe and lethal so a moderate drop only stings while a
// long fall kills. Returns an integer for clean HUD readouts.
export function fallDamage(
  impactSpeed,
  { safe = FALL_SAFE_SPEED, lethal = FALL_LETHAL_SPEED, max = MAX_HEALTH } = {},
) {
  if (!(impactSpeed > safe)) return 0; // also rejects NaN / non-finite
  const span = lethal - safe;
  if (span <= 0) return max;
  const t = clamp((impactSpeed - safe) / span, 0, 1);
  return Math.round(t * t * max);
}

// Subtract damage, clamped to [0, MAX_HEALTH]. Pure — returns the new value.
export function applyDamage(health, dmg, max = MAX_HEALTH) {
  return clamp(health - dmg, 0, max);
}

export function isDead(health) {
  return health <= 0;
}

// ----------------------------- threat spawn gate ----------------------------

// "spawns after 15 minutes on-site" — the gate is a pure comparison so the
// 15-minute threshold is testable. The component supplies elapsedMs from a
// sessionStorage-anchored start time (persists across world re-entry, resets on
// a new tab) so the timer survives the whole session.
export const THREAT_SPAWN_MS = 15 * 60 * 1000;

export function elapsedSince(startMs, nowMs) {
  const dt = nowMs - startMs;
  return dt > 0 ? dt : 0;
}

export function threatShouldSpawn(elapsedMs, spawnMs = THREAT_SPAWN_MS) {
  return elapsedMs >= spawnMs;
}

// ----------------------------- pursuit / catch ------------------------------

// The threat is a relentless hunter: slightly slower than a sprinting player so
// you can kite it on foot in a straight line but it corners you — and (M7) the
// neon cycle lets you truly outrun it. Speed ramps with pursuit time toward a
// cap so a long chase grows tense.
export const THREAT_BASE_SPEED = 4.0; // m/s at first lock-on (player run = 6)
export const THREAT_MAX_SPEED = 5.6; // m/s ceiling after a sustained chase
export const THREAT_CATCH_RADIUS = 1.2; // XZ distance at which it grabs you

export function threatSpeed(
  pursuitSeconds,
  { base = THREAT_BASE_SPEED, ramp = 0.05, cap = THREAT_MAX_SPEED } = {},
) {
  const s = base + ramp * (pursuitSeconds > 0 ? pursuitSeconds : 0);
  return s < cap ? s : cap;
}

// XZ-plane distance between two {x, y, z} points (Y ignored — the threat and the
// player both stand on the floor).
export function distanceXZ(a, b) {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return Math.hypot(dx, dz);
}

// Step `from` toward `to` on the XZ plane by up to maxStep metres, writing the
// result into `out` (alloc-free for the per-frame hunter). `from.y` is preserved
// — the threat keeps its resting height. Returns the PRE-move XZ distance so the
// caller can test for a catch before/after stepping.
export function steerToward(out, from, to, maxStep) {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const dist = Math.hypot(dx, dz);
  out.y = from.y;
  if (dist <= 1e-6 || !(maxStep > 0)) {
    out.x = from.x;
    out.z = from.z;
    return dist;
  }
  const step = maxStep < dist ? maxStep : dist;
  const k = step / dist;
  out.x = from.x + dx * k;
  out.z = from.z + dz * k;
  return dist;
}

// Yaw (radians, around +Y) that faces `from` toward `to`. Matches three's YXZ
// euler convention used by the mesh so the threat looks where it walks.
export function headingTo(from, to) {
  return Math.atan2(to.x - from.x, to.z - from.z);
}

export function withinCatchRadius(a, b, radius = THREAT_CATCH_RADIUS) {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return dx * dx + dz * dz <= radius * radius;
}

// Clamp a coordinate to the playable interior so the hunter never walks out
// through a wall while chasing.
export function clampToArena(v, half) {
  return clamp(v, -half, half);
}
