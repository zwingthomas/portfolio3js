// Smoke tests for the arcade's pure control math + the keyboard controls map.
//
// These are framework-free and run on Node's built-in test runner (no extra
// dependency), so they execute even though the repo has no JS test harness:
//
//   node --test src/arcade/__tests__/touchMath.test.mjs
//
// They deliberately import ONLY modules with no browser/three globals
// (touchMath.js, controls.js) so they load cleanly outside a bundler.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  clamp,
  joystickVector,
  lookDelta,
  clampPitch,
} from '../touchMath.js';
import { CONTROLS_MAP, Controls, PLAYER_CONFIG } from '../controls.js';

// Signed-zero tolerant "is ~0" (assert/strict uses Object.is, so -0 !== 0).
const isZero = (n) => Math.abs(n) < 1e-9;

test('clamp bounds values', () => {
  assert.equal(clamp(5, 0, 10), 5);
  assert.equal(clamp(-1, 0, 10), 0);
  assert.equal(clamp(99, 0, 10), 10);
});

test('joystickVector: centred stick is neutral', () => {
  const v = joystickVector(0, 0, 56);
  assert.ok(isZero(v.moveX));
  assert.ok(isZero(v.moveZ));
  assert.ok(isZero(v.magnitude));
  assert.ok(isZero(v.knobX));
  assert.ok(isZero(v.knobY));
});

test('joystickVector: pushing up walks forward (z+), knob within ring', () => {
  // dy negative = thumb pushed up the screen = walk forward.
  const v = joystickVector(0, -56, 56);
  assert.ok(v.moveZ > 0, 'forward should be positive');
  assert.ok(isZero(v.moveX));
  assert.ok(Math.abs(v.magnitude - 1) < 1e-9, 'full push = magnitude 1');
  // knob clamped to the ring radius
  assert.ok(Math.hypot(v.knobX, v.knobY) <= 56 + 1e-9);
});

test('joystickVector: pushing right strafes right (x+)', () => {
  const v = joystickVector(56, 0, 56);
  assert.ok(v.moveX > 0, 'right strafe should be positive');
  assert.ok(isZero(v.moveZ));
});

test('joystickVector: beyond-radius push is clamped to magnitude 1', () => {
  const v = joystickVector(500, 0, 56);
  assert.ok(v.magnitude <= 1 + 1e-9);
  assert.ok(Math.hypot(v.knobX, v.knobY) <= 56 + 1e-9);
});

test('joystickVector: partial push scales magnitude below 1', () => {
  const v = joystickVector(28, 0, 56); // half radius
  assert.ok(v.magnitude > 0.49 && v.magnitude < 0.51);
});

test('lookDelta: drag right looks right (yaw decreases), matching mouse', () => {
  const { yaw, pitch } = lookDelta(10, 0);
  assert.ok(yaw < 0, 'dragging right yields negative yaw delta');
  assert.ok(isZero(pitch));
});

test('clampPitch keeps the camera from flipping past the poles', () => {
  const limit = Math.PI / 2 - 0.05;
  assert.ok(clampPitch(10) <= limit + 1e-9);
  assert.ok(clampPitch(-10) >= -limit - 1e-9);
  assert.ok(isZero(clampPitch(0)));
});

test('CONTROLS_MAP wires WASD + arrows + jump + interact', () => {
  const byName = Object.fromEntries(CONTROLS_MAP.map((c) => [c.name, c.keys]));
  assert.deepEqual([...byName[Controls.forward]].sort(), ['ArrowUp', 'KeyW'].sort());
  assert.deepEqual([...byName[Controls.back]].sort(), ['ArrowDown', 'KeyS'].sort());
  assert.deepEqual([...byName[Controls.left]].sort(), ['ArrowLeft', 'KeyA'].sort());
  assert.deepEqual([...byName[Controls.right]].sort(), ['ArrowRight', 'KeyD'].sort());
  assert.ok(byName[Controls.jump].includes('Space'));
  assert.ok(byName[Controls.interact].includes('KeyE'));
});

test('PLAYER_CONFIG exposes sane movement tunables', () => {
  assert.ok(PLAYER_CONFIG.moveSpeed > 0);
  assert.ok(PLAYER_CONFIG.jumpSpeed > 0);
  assert.ok(PLAYER_CONFIG.airControl > 0 && PLAYER_CONFIG.airControl <= 1);
  assert.ok(Array.isArray(PLAYER_CONFIG.spawn) && PLAYER_CONFIG.spawn.length === 3);
});
