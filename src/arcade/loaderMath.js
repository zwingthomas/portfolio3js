// loaderMath.js — pure, framework-free helpers for the M2 arcade loader.
//
// Kept separate from <ArcadeLoader> so the timing / easing / procedural-noise
// logic can be unit-tested with the built-in `node --test` runner (no DOM, no
// React, no npm dep). The component imports these; the test file imports them
// directly. Everything here is deterministic — NO Math.random / Date.now — so
// tests are stable and the loader animation is reproducible.

export function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

// Smooth ease-out so the progress bar decelerates as it fills (feels weighty).
export function easeOutCubic(t) {
  const x = clamp(t, 0, 1);
  return 1 - Math.pow(1 - x, 3);
}

// Synthetic load progress (0..100) for the loader bar.
//
// We can't rely on three's LoadingManager here: with NO asset slots filled
// (the default shipped state) it reports 100 instantly or never fires, which
// would flash the loader. Instead we ease a synthetic value to a 95% ceiling
// over `minMs`, and only snap to 100 once the scene has actually committed
// (`ready`) AND the minimum on-screen time has elapsed. When real assets ARE
// present the outer Suspense keeps `ready` false longer, so the bar naturally
// holds at 95% until they finish — no flash either way.
export function syntheticProgress(elapsedMs, minMs, ready) {
  const span = minMs > 0 ? minMs : 1;
  const eased = easeOutCubic(elapsedMs / span) * 95;
  if (ready && elapsedMs >= minMs) return 100;
  return Math.min(95, eased);
}

// The loader may close once it has shown for at least `minMs` AND the scene is
// ready. Returning a boolean keeps the component's effect trivial + testable.
export function loaderShouldClose(elapsedMs, minMs, ready) {
  return ready === true && elapsedMs >= minMs;
}

// Deterministic value-noise in [0, 1) from a single scalar — the classic
// fract(sin(x)*k) hash. Used to drive the RGB-split glitch jitter and grain so
// the animation is reproducible (and unit-testable) instead of Math.random.
export function pseudoNoise(x) {
  const s = Math.sin(x * 12.9898) * 43758.5453;
  return s - Math.floor(s);
}

// Map noise around zero: returns roughly [-amp, +amp]. Used for the chromatic
// title offset so it jitters symmetrically.
export function jitter(seed, amp) {
  return (pseudoNoise(seed) - 0.5) * 2 * amp;
}

// Strobe gate: returns true on a small duty cycle so the glitch only "fires"
// intermittently (more menacing than a constant shake). `period` and `duty`
// are in ms. Deterministic in time so reduced-motion can freeze it off.
export function strobeOn(timeMs, period, duty) {
  if (period <= 0) return false;
  return timeMs % period < duty;
}
