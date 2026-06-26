// node --test src/arcade/__tests__/loaderMath.test.mjs
//
// Pure-logic tests for the M2 loader timing/easing/noise helpers. No DOM, no
// React, no npm dep — uses the built-in node test runner (Node v26). NOT part
// of build-guard (can't edit package.json); run manually.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  clamp,
  easeOutCubic,
  syntheticProgress,
  loaderShouldClose,
  pseudoNoise,
  jitter,
  strobeOn,
} from '../loaderMath.js';

test('clamp bounds a value to [lo, hi]', () => {
  assert.equal(clamp(5, 0, 10), 5);
  assert.equal(clamp(-3, 0, 10), 0);
  assert.equal(clamp(99, 0, 10), 10);
});

test('easeOutCubic spans 0..1 and clamps its input', () => {
  assert.equal(easeOutCubic(0), 0);
  assert.equal(easeOutCubic(1), 1);
  assert.equal(easeOutCubic(-1), 0); // clamped
  assert.equal(easeOutCubic(2), 1); // clamped
  // monotonic increasing
  assert.ok(easeOutCubic(0.25) < easeOutCubic(0.75));
});

test('syntheticProgress holds below 95 until ready AND min time', () => {
  // not ready: never exceeds 95 even past the min window
  assert.ok(syntheticProgress(10_000, 2200, false) <= 95);
  // ready but before min time: still capped below 100
  assert.ok(syntheticProgress(1000, 2200, true) < 100);
  // ready and at/after min time: snaps to 100
  assert.equal(syntheticProgress(2200, 2200, true), 100);
  assert.equal(syntheticProgress(3000, 2200, true), 100);
});

test('syntheticProgress starts at 0 and is monotonic over the window', () => {
  assert.equal(syntheticProgress(0, 2200, false), 0);
  const a = syntheticProgress(500, 2200, false);
  const b = syntheticProgress(1500, 2200, false);
  assert.ok(a >= 0 && a < b && b <= 95);
});

test('loaderShouldClose requires ready AND min elapsed', () => {
  assert.equal(loaderShouldClose(3000, 2200, false), false);
  assert.equal(loaderShouldClose(1000, 2200, true), false);
  assert.equal(loaderShouldClose(2200, 2200, true), true);
});

test('pseudoNoise is deterministic and in [0, 1)', () => {
  for (let i = 0; i < 50; i++) {
    const n = pseudoNoise(i * 1.37);
    assert.ok(n >= 0 && n < 1, `noise out of range at ${i}: ${n}`);
  }
  // deterministic: same input → same output
  assert.equal(pseudoNoise(3.14), pseudoNoise(3.14));
});

test('jitter stays within [-amp, +amp), takes both signs, and centers near 0', () => {
  const amp = 18;
  const samples = [];
  for (let i = 0; i < 400; i++) samples.push(jitter(i * 2.1, amp));
  // range: pseudoNoise is [0,1) so the value can reach -amp but stays < +amp.
  for (const j of samples) {
    assert.ok(j >= -amp && j < amp, `jitter out of range: ${j}`);
  }
  // a constant-0 or always-+amp implementation must fail these:
  assert.ok(samples.some((j) => j < 0), 'expected some negative jitter');
  assert.ok(samples.some((j) => j > 0), 'expected some positive jitter');
  const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
  assert.ok(Math.abs(mean) < amp * 0.25, `jitter mean not centered: ${mean}`);
});

test('strobeOn fires only inside the duty window', () => {
  assert.equal(strobeOn(0, 1400, 160), true); // 0 < 160
  assert.equal(strobeOn(150, 1400, 160), true);
  assert.equal(strobeOn(160, 1400, 160), false); // boundary excluded
  assert.equal(strobeOn(700, 1400, 160), false);
  assert.equal(strobeOn(1400, 1400, 160), true); // wraps
  assert.equal(strobeOn(123, 0, 160), false); // guarded period
});
