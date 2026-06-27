// node --test src/arcade/__tests__/cycleMath.test.mjs
//
// Pure-logic tests for M7 (neon light-cycle): ride speed/momentum curve, bank
// angle, tall-grass zone test, and the seeded encounter roll. No DOM, React,
// three, or WebAudio — built-in node test runner (Node v26). NOT part of
// build-guard (can't edit package.json); run manually with an EXPLICIT file path
// (running the __tests__ DIR fails spuriously — node treats the dir as a test).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  clamp,
  RIDE_MAX_SPEED,
  RIDE_REVERSE_FACTOR,
  approach,
  rideTopSpeed,
  bankAngle,
  outrunsThreat,
  GRASS_ZONES,
  GRASS_STEP,
  GRASS_ENCOUNTER_CHANCE,
  inTallGrass,
  makeRng,
  rollEncounter,
} from '../cycleMath.js';
import { THREAT_MAX_SPEED } from '../deathMath.js';

test('clamp bounds a value to [lo, hi]', () => {
  assert.equal(clamp(5, 0, 10), 5);
  assert.equal(clamp(-3, 0, 10), 0);
  assert.equal(clamp(99, 0, 10), 10);
});

// ------------------------------- ride physics -------------------------------

test('riding genuinely outruns the hunter AND the on-foot run speed', () => {
  // M7 acceptance: mounting lets you outrun the minotaur. Run speed = 6 (controls).
  assert.ok(RIDE_MAX_SPEED > THREAT_MAX_SPEED, 'cycle top speed must exceed THREAT_MAX_SPEED');
  assert.ok(RIDE_MAX_SPEED > 6, 'cycle top speed must exceed the on-foot run speed (6)');
  assert.ok(outrunsThreat(RIDE_MAX_SPEED, THREAT_MAX_SPEED));
  assert.ok(!outrunsThreat(THREAT_MAX_SPEED, RIDE_MAX_SPEED));
});

test('approach eases toward the target and is clamped to [0,1]', () => {
  assert.equal(approach(0, 10, 0), 0); // no authority -> no movement
  assert.equal(approach(0, 10, 1), 10); // full authority -> snaps
  assert.equal(approach(0, 10, 0.5), 5);
  assert.equal(approach(0, 10, -1), 0); // negative clamped to 0
  assert.equal(approach(0, 10, 2), 10); // >1 clamped to 1
  // converges monotonically (momentum feel) without overshoot
  let v = 0;
  let prev = -1;
  for (let i = 0; i < 200; i++) {
    v = approach(v, 9.2, 0.085);
    assert.ok(v >= prev && v <= 9.2, `monotone, no overshoot at i=${i}: ${v}`);
    prev = v;
  }
  assert.ok(v > 9.0, 'reaches near top speed after spool-up');
});

test('rideTopSpeed: full ahead, slow reverse, idle at zero', () => {
  assert.equal(rideTopSpeed(1), RIDE_MAX_SPEED);
  assert.equal(rideTopSpeed(0.3), RIDE_MAX_SPEED); // any forward throttle = full top speed
  assert.equal(rideTopSpeed(0), 0);
  assert.equal(rideTopSpeed(-1), RIDE_MAX_SPEED * RIDE_REVERSE_FACTOR);
  assert.ok(rideTopSpeed(-1) < rideTopSpeed(1), 'reverse is slower than forward');
});

test('bankAngle leans opposite the turn and is clamped (cosmetic only)', () => {
  assert.ok(bankAngle(0) === 0, 'no turn -> no lean'); // tolerate -0
  assert.ok(bankAngle(2) < 0, 'turning one way banks the other');
  assert.ok(bankAngle(-2) > 0);
  assert.ok(bankAngle(1000) >= -0.5, 'hard turn is clamped, never flips');
  assert.ok(bankAngle(-1000) <= 0.5);
  assert.equal(bankAngle(1000), -0.5);
});

// ------------------------------- tall grass ---------------------------------

test('inTallGrass detects entry into a zone disc and returns its index', () => {
  const z = GRASS_ZONES[0];
  assert.equal(inTallGrass(z.x, z.z), 0); // dead centre
  assert.equal(inTallGrass(z.x + z.r - 0.01, z.z), 0); // just inside the edge
  assert.equal(inTallGrass(z.x + z.r + 0.5, z.z), -1); // just outside
  assert.equal(inTallGrass(999, 999), -1); // far away -> no zone
  // a custom single-zone set
  assert.equal(inTallGrass(0, 0, [{ x: 0, z: 0, r: 1 }]), 0);
  assert.equal(inTallGrass(2, 0, [{ x: 0, z: 0, r: 1 }]), -1);
});

test('GRASS_ZONES are well-formed and non-overlapping with the spawn pad', () => {
  assert.ok(GRASS_ZONES.length >= 1);
  for (const zn of GRASS_ZONES) {
    assert.ok(Number.isFinite(zn.x) && Number.isFinite(zn.z) && zn.r > 0);
    // spawn pad sits at (0, 6); a duel must not trigger the instant you spawn.
    assert.equal(inTallGrass(0, 6, [zn]), -1, 'no grass patch covers the spawn pad');
  }
});

test('makeRng is deterministic and stays in [0,1)', () => {
  const a = makeRng(12345);
  const b = makeRng(12345);
  for (let i = 0; i < 50; i++) {
    const v = a();
    assert.equal(v, b(), 'same seed -> identical stream');
    assert.ok(v >= 0 && v < 1, `in range: ${v}`);
  }
  assert.notEqual(makeRng(1)(), makeRng(2)(), 'different seeds diverge');
});

test('rollEncounter is deterministic under a seed and respects the chance', () => {
  const rng = makeRng(7);
  const r1 = makeRng(7);
  for (let i = 0; i < 20; i++) {
    assert.equal(rollEncounter(rng), rollEncounter(r1));
  }
  // chance bounds: 0 never fires, 1 always fires
  assert.equal(rollEncounter(makeRng(99), 0), false);
  assert.equal(rollEncounter(makeRng(99), 1), true);
  // observed rate over many samples is near GRASS_ENCOUNTER_CHANCE
  let hits = 0;
  const n = 4000;
  const stream = makeRng(2024);
  for (let i = 0; i < n; i++) if (rollEncounter(stream)) hits++;
  const rate = hits / n;
  assert.ok(Math.abs(rate - GRASS_ENCOUNTER_CHANCE) < 0.04, `empirical rate ${rate} ≈ ${GRASS_ENCOUNTER_CHANCE}`);
  assert.ok(GRASS_STEP > 0);
});
