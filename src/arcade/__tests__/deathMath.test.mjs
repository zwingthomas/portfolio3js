// node --test src/arcade/__tests__/deathMath.test.mjs
//
// Pure-logic tests for M6 (death & respawn): fall-damage curve, threat-spawn
// gate, and pursuit/catch math. No DOM, React, three, or WebAudio — built-in
// node test runner (Node v26). NOT part of build-guard (can't edit
// package.json); run manually with an EXPLICIT file path (running the
// __tests__ DIR fails spuriously — node treats the dir as a test).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  clamp,
  MAX_HEALTH,
  FALL_SAFE_SPEED,
  FALL_LETHAL_SPEED,
  fallDamage,
  applyDamage,
  isDead,
  THREAT_SPAWN_MS,
  elapsedSince,
  threatShouldSpawn,
  THREAT_BASE_SPEED,
  THREAT_MAX_SPEED,
  THREAT_CATCH_RADIUS,
  THREAT_CATCH_VERTICAL,
  threatSpeed,
  distanceXZ,
  steerToward,
  headingTo,
  withinCatchRadius,
  caught,
  clampToArena,
} from '../deathMath.js';

test('clamp bounds a value to [lo, hi]', () => {
  assert.equal(clamp(5, 0, 10), 5);
  assert.equal(clamp(-3, 0, 10), 0);
  assert.equal(clamp(99, 0, 10), 10);
});

// --------------------------------- fall damage ------------------------------

test('fallDamage: harmless at/below the safe speed (normal jumps never hurt)', () => {
  assert.equal(fallDamage(0), 0);
  assert.equal(fallDamage(6.2), 0); // a max jump returns to ground at ~jumpSpeed
  assert.equal(fallDamage(FALL_SAFE_SPEED), 0); // exactly at the floor is safe
  assert.equal(fallDamage(FALL_SAFE_SPEED - 0.01), 0);
});

test('fallDamage: instantly lethal at/above the lethal speed', () => {
  assert.equal(fallDamage(FALL_LETHAL_SPEED), MAX_HEALTH);
  assert.equal(fallDamage(FALL_LETHAL_SPEED + 50), MAX_HEALTH); // clamped, not >max
});

test('fallDamage: ramps monotonically and quadratically between safe and lethal', () => {
  let prev = -1;
  for (let s = FALL_SAFE_SPEED; s <= FALL_LETHAL_SPEED; s += 0.5) {
    const d = fallDamage(s);
    assert.ok(d >= prev, `damage must be non-decreasing at s=${s}`);
    assert.ok(d >= 0 && d <= MAX_HEALTH, `damage in range at s=${s}: ${d}`);
    prev = d;
  }
  // midpoint of the span is a quarter of max (t=0.5 -> 0.25 quadratic)
  const mid = (FALL_SAFE_SPEED + FALL_LETHAL_SPEED) / 2;
  assert.equal(fallDamage(mid), Math.round(0.25 * MAX_HEALTH));
});

test('fallDamage: rejects NaN / non-finite without throwing', () => {
  assert.equal(fallDamage(NaN), 0);
  assert.equal(fallDamage(undefined), 0);
});

test('fallDamage: degenerate span (safe>=lethal) is all-or-nothing', () => {
  assert.equal(fallDamage(12, { safe: 10, lethal: 10 }), MAX_HEALTH);
  assert.equal(fallDamage(9, { safe: 10, lethal: 10 }), 0);
});

test('applyDamage clamps health to [0, MAX_HEALTH]; isDead at 0', () => {
  assert.equal(applyDamage(100, 30), 70);
  assert.equal(applyDamage(20, 30), 0); // never negative
  assert.equal(applyDamage(80, -10), 90); // healing clamps to max
  assert.equal(applyDamage(95, -50), MAX_HEALTH);
  assert.ok(isDead(0));
  assert.ok(isDead(-5));
  assert.ok(!isDead(1));
});

// ------------------------------- spawn gate ---------------------------------

test('THREAT_SPAWN_MS is exactly 15 minutes', () => {
  assert.equal(THREAT_SPAWN_MS, 15 * 60 * 1000);
  assert.equal(THREAT_SPAWN_MS, 900000);
});

test('elapsedSince never returns negative (clock skew safe)', () => {
  assert.equal(elapsedSince(1000, 4000), 3000);
  assert.equal(elapsedSince(5000, 4000), 0); // now < start -> 0, not negative
  assert.equal(elapsedSince(1000, 1000), 0);
});

test('threatShouldSpawn fires only at/after the threshold', () => {
  assert.ok(!threatShouldSpawn(0));
  assert.ok(!threatShouldSpawn(THREAT_SPAWN_MS - 1));
  assert.ok(threatShouldSpawn(THREAT_SPAWN_MS));
  assert.ok(threatShouldSpawn(THREAT_SPAWN_MS + 1));
  // custom threshold (used by a ?threat=now QA hook with spawnMs=0)
  assert.ok(threatShouldSpawn(0, 0));
});

// ------------------------------- pursuit / catch ----------------------------

test('threatSpeed ramps from base toward the cap and never exceeds it', () => {
  assert.equal(threatSpeed(0), THREAT_BASE_SPEED);
  assert.equal(threatSpeed(-5), THREAT_BASE_SPEED); // negative time clamped
  assert.ok(threatSpeed(10) > threatSpeed(0));
  assert.ok(threatSpeed(20) > threatSpeed(10));
  assert.equal(threatSpeed(100000), THREAT_MAX_SPEED); // saturates at the cap
  assert.ok(THREAT_BASE_SPEED < 6, 'base must be slower than the player run speed');
  // positional params (no per-frame options object): custom base/ramp/cap apply
  assert.equal(threatSpeed(10, 1, 0.5, 99), 6); // 1 + 0.5*10, high cap
  assert.equal(threatSpeed(100, 1, 0.5, 3), 3); // capped at the 4th arg
});

test('distanceXZ ignores Y (both stand on the floor)', () => {
  assert.equal(distanceXZ({ x: 0, y: 0, z: 0 }, { x: 3, y: 99, z: 4 }), 5);
  assert.equal(distanceXZ({ x: 1, y: 1, z: 1 }, { x: 1, y: -50, z: 1 }), 0);
});

test('steerToward moves up to maxStep toward the target, preserving Y, alloc-free', () => {
  const out = { x: 0, y: 0, z: 0 };
  const from = { x: 0, y: 2.5, z: 0 };
  const to = { x: 10, y: 0, z: 0 };
  const dist = steerToward(out, from, to, 3);
  assert.equal(dist, 10); // pre-move distance
  assert.ok(Math.abs(out.x - 3) < 1e-9, `stepped 3 along +x, got ${out.x}`);
  assert.equal(out.z, 0);
  assert.equal(out.y, 2.5, 'Y is preserved (resting height)');
});

test('steerToward never overshoots when maxStep exceeds the distance', () => {
  const out = { x: 0, y: 0, z: 0 };
  const from = { x: 0, y: 1, z: 0 };
  const to = { x: 2, y: 0, z: 0 };
  const dist = steerToward(out, from, to, 99);
  assert.equal(dist, 2);
  assert.ok(Math.abs(out.x - 2) < 1e-9, 'snaps to target, no overshoot');
  assert.equal(out.z, 0);
});

test('steerToward is a no-op at the target or with non-positive step', () => {
  const out = { x: 9, y: 9, z: 9 };
  const same = { x: 1, y: 1, z: 1 };
  steerToward(out, same, same, 5);
  assert.deepEqual(out, { x: 1, y: 1, z: 1 });
  const out2 = { x: 0, y: 0, z: 0 };
  steerToward(out2, { x: 0, y: 3, z: 0 }, { x: 5, y: 0, z: 0 }, 0);
  assert.deepEqual(out2, { x: 0, y: 3, z: 0 }); // zero step -> stays put, keeps Y
});

test('headingTo yaws to face the target (three YXZ convention: atan2(dx, dz))', () => {
  const from = { x: 0, y: 0, z: 0 };
  assert.equal(headingTo(from, { x: 0, y: 0, z: 1 }), 0); // straight +z
  assert.ok(Math.abs(headingTo(from, { x: 1, y: 0, z: 0 }) - Math.PI / 2) < 1e-9); // +x
  assert.ok(Math.abs(headingTo(from, { x: 0, y: 0, z: -1 }) - Math.PI) < 1e-9); // -z
});

test('withinCatchRadius matches an XZ disc of THREAT_CATCH_RADIUS', () => {
  const a = { x: 0, y: 0, z: 0 };
  assert.ok(withinCatchRadius(a, { x: 1, y: 5, z: 0 })); // 1 < 1.2, Y ignored
  assert.ok(!withinCatchRadius(a, { x: 2, y: 0, z: 0 })); // 2 > 1.2
  assert.ok(withinCatchRadius(a, { x: THREAT_CATCH_RADIUS, y: 0, z: 0 })); // boundary inclusive
  assert.ok(!withinCatchRadius(a, { x: 3, y: 0, z: 0 }, 0.5)); // custom radius
});

test('caught requires BOTH XZ overlap AND comparable height (mezzanine is safe)', () => {
  const hunter = { x: 0, y: 1.2, z: 0 }; // floor-locked threat (BODY_Y)
  // floor-standing player overhead (camera y≈1.95): within both gates -> caught
  assert.ok(caught(hunter, { x: 0.5, y: 1.95, z: 0.5 }));
  // mid-jump on the floor (camera y≈3.0): dy=1.8 < 2.0 -> still caught
  assert.ok(caught(hunter, { x: 0.3, y: 3.0, z: 0 }));
  // up on the ~3 m mezzanine (camera y≈4.95): dy=3.75 > 2.0 -> SAFE despite XZ overlap
  assert.ok(!caught(hunter, { x: 0, y: 4.95, z: 0 }));
  // far away horizontally but same height -> not caught
  assert.ok(!caught(hunter, { x: 5, y: 1.2, z: 0 }));
  // vertical gate is symmetric (player below the threat)
  assert.ok(!caught(hunter, { x: 0, y: 1.2 - (THREAT_CATCH_VERTICAL + 0.5), z: 0 }));
  assert.equal(THREAT_CATCH_VERTICAL, 2.0);
});

test('clampToArena keeps a coordinate inside the room half-extent', () => {
  assert.equal(clampToArena(5, 13), 5);
  assert.equal(clampToArena(20, 13), 13);
  assert.equal(clampToArena(-20, 13), -13);
});
