// Pure control-math helpers for the arcade touch / virtual-joystick fallback.
//
// This module is intentionally free of any browser or three.js globals so it
// can be unit-tested directly under `node --test` (see __tests__/). Keeping the
// math here also lets the on-screen <TouchControls> UI and the per-frame
// Player loop agree on exactly one definition of "forward", sensitivity, etc.

// Clamp a number to [min, max].
export function clamp(v, min, max) {
  if (v < min) return min;
  if (v > max) return max;
  return v;
}

// Convert a virtual-joystick thumb offset (dx, dy in CSS pixels from the stick
// centre) plus the stick radius into:
//   knobX / knobY  — the thumb offset clamped to the ring (so it never escapes)
//   moveX          — analog strafe, right is +,  in [-1, 1]
//   moveZ          — analog forward, forward is +, in [-1, 1]
//   magnitude      — overall input strength in [0, 1] (for speed scaling)
//
// Screen-space Y grows downward, so "push the stick up" (dy < 0) must mean
// "walk forward" (moveZ > 0); hence moveZ = -uy * magnitude.
export function joystickVector(dx, dy, radius) {
  const r = radius > 0 ? radius : 1;
  const len = Math.hypot(dx, dy);
  const clampedLen = Math.min(len, r);
  const ux = len > 0 ? dx / len : 0;
  const uy = len > 0 ? dy / len : 0;
  const magnitude = clampedLen / r;
  return {
    knobX: ux * clampedLen,
    knobY: uy * clampedLen,
    moveX: ux * magnitude,
    moveZ: -uy * magnitude,
    magnitude,
  };
}

// Convert a look-drag pixel delta into yaw / pitch deltas in radians.
// Sign convention mirrors PointerLockControls so desktop and touch feel the
// same: dragging right looks right (yaw decreases), dragging down looks down
// (pitch decreases). `sensitivity` is radians per pixel.
export function lookDelta(dx, dy, sensitivity = 0.0045) {
  return { yaw: -dx * sensitivity, pitch: -dy * sensitivity };
}

// Clamp accumulated pitch so the camera can't flip past straight up / down.
export function clampPitch(pitch, limit = Math.PI / 2 - 0.05) {
  return clamp(pitch, -limit, limit);
}
