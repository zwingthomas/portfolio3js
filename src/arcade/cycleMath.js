// cycleMath.js — pure, framework-free helpers for M7 (neon light-cycle).
//
// Kept separate from the React/r3f components so the ride speed/momentum curve,
// the visual bank (lean) angle, the "tall grass" zone test, and the encounter
// roll are unit-testable with the built-in `node --test` runner (no DOM, React,
// three, or npm dep). The components import these; the test file imports them
// directly. Everything is deterministic — NO Date.now; randomness is supplied by
// an explicit seeded PRNG so tests are stable and replays are reproducible.
//
// LEGAL: original mechanics only. The rideable cycle and the "NEON RUNNER" grid
// duel are an ORIGINAL take on the neon-cycle genre — original name, art, and
// audio (never a real Tron character/logo/likeness). See ASSETS.md M7.

export function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

// ------------------------------- ride physics -------------------------------

// Top speed while riding the cycle. This MUST exceed the hunter's ceiling
// (deathMath THREAT_MAX_SPEED = 5.6) and the on-foot run speed (controls
// moveSpeed = 6) so mounting genuinely lets you OUTRUN the minotaur (M7 accept).
export const RIDE_MAX_SPEED = 9.2; // m/s forward top speed
// Reverse is a slow crawl — the cycle is built to surge forward.
export const RIDE_REVERSE_FACTOR = 0.32; // fraction of RIDE_MAX_SPEED in reverse
// Velocity approaches its target slowly (vs the on-foot snappy authority of 1.0)
// so the ride has weight/momentum: you spool up and you coast.
export const RIDE_ACCEL = 0.085; // per-frame lerp authority toward target velocity
// When no throttle is applied the cycle coasts, bleeding speed gently rather
// than stopping dead like the on-foot friction (0.7).
export const RIDE_FRICTION = 0.975; // per-frame horizontal velocity retained while coasting
// How close (XZ metres) the player must be to the parked cycle to press E and
// mount. Shared by Player.jsx (the gate) and Cycle.jsx (the "press E" hint).
export const MOUNT_RADIUS = 2.8;

// Ease `current` toward `target` by fraction `rate` (clamped to [0,1]). Used for
// the momentum-y velocity approach; pure and alloc-free.
export function approach(current, target, rate) {
  const r = rate < 0 ? 0 : rate > 1 ? 1 : rate;
  return current + (target - current) * r;
}

// Forward top-speed for a throttle input in [-1, 1]: full RIDE_MAX_SPEED ahead,
// a slow crawl in reverse. (Magnitude scaling for partial joystick pushes is
// applied by the caller.)
export function rideTopSpeed(throttle, max = RIDE_MAX_SPEED, reverseFactor = RIDE_REVERSE_FACTOR) {
  if (throttle > 0) return max;
  if (throttle < 0) return max * reverseFactor;
  return 0;
}

// Visual lean: map a per-second yaw rate to a bank angle (radians), clamped so a
// hard turn never flips the cycle. Purely cosmetic — does not affect physics.
export function bankAngle(yawRatePerSec, gain = 0.14, max = 0.5) {
  const b = -yawRatePerSec * gain;
  return clamp(b, -max, max);
}

// True when riding outruns the hunter — a guard the test asserts so the speeds
// can't silently regress below the threat ceiling.
export function outrunsThreat(rideMax, threatMax) {
  return rideMax > threatMax;
}

// ------------------------------- tall grass ---------------------------------

// Circular "tall grass" patches in the hub (world XZ + radius). Entering one can
// trigger a NEON RUNNER grid-duel. Kept here (not in Hub.jsx) so the same data
// drives the rendered patches AND the encounter test — single source of truth.
export const GRASS_ZONES = [
  { x: -9.5, z: -2.5, r: 2.6 },
  { x: 9.0, z: -5.5, r: 2.4 },
  { x: 0.5, z: -6.5, r: 2.2 },
];

// Metres of travel through grass between encounter rolls (a "step"), and the
// per-step chance a duel triggers. Tuned so a duel is likely within a couple of
// seconds of riding through a patch, without firing the instant you touch it.
export const GRASS_STEP = 1.6;
export const GRASS_ENCOUNTER_CHANCE = 0.28;

// Index of the first zone containing (px, pz), or -1 if none. Alloc-free; called
// per frame while moving.
export function inTallGrass(px, pz, zones = GRASS_ZONES) {
  for (let i = 0; i < zones.length; i++) {
    const zn = zones[i];
    const dx = px - zn.x;
    const dz = pz - zn.z;
    if (dx * dx + dz * dz <= zn.r * zn.r) return i;
  }
  return -1;
}

// Deterministic PRNG (mulberry32) — same seed yields the same stream, matching
// the engine PRNGs so encounter rolls and the duel are reproducible in tests.
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

// One encounter roll: true with probability `chance`. The randomness source is
// passed in (a makeRng stream) so the decision is deterministic under test.
export function rollEncounter(rng, chance = GRASS_ENCOUNTER_CHANCE) {
  return rng() < chance;
}
