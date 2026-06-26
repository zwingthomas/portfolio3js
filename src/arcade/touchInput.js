// Shared analog/touch input bridge between the on-screen <TouchControls> DOM UI
// (outside the canvas) and the per-frame Player loop (inside the canvas).
//
// It is a plain mutable singleton — deliberately NOT React state — so the
// Player can read it every frame with zero re-renders, mirroring the
// held-object pattern. Only ONE arcade experience is mounted at a time, so a
// module-level store is safe; resetTouchInput() clears it on (re)mount.

export const touchInput = {
  // Analog movement from the virtual joystick. x = strafe (right +),
  // z = forward (forward +). Each component is in [-1, 1]; the magnitude
  // (<= 1) scales walk speed so a light push walks slowly.
  move: { x: 0, z: 0 },
  // Pending look delta in radians, accumulated by the look-drag surface and
  // consumed (zeroed) by the Player each frame. dx = yaw, dy = pitch.
  look: { dx: 0, dy: 0 },
  // Edge-triggered throw latch; consumed once by the Player. Jump and grab are
  // routed through synthetic keyboard events instead (see TouchControls) so the
  // existing desktop window-level handlers fire unchanged.
  throwing: false,
};

export function resetTouchInput() {
  touchInput.move.x = 0;
  touchInput.move.z = 0;
  touchInput.look.dx = 0;
  touchInput.look.dy = 0;
  touchInput.throwing = false;
}

// True when the primary pointer is coarse (touch / stylus). Used to decide
// whether to show the on-screen controls and use manual look instead of
// PointerLockControls (which is meaningless without a mouse).
export function isCoarsePointer() {
  if (typeof window === 'undefined') return false;
  try {
    if (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) {
      return true;
    }
    return 'ontouchstart' in window && (navigator?.maxTouchPoints || 0) > 0;
  } catch {
    return false;
  }
}
