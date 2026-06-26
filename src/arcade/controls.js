// Shared KeyboardControls map for the arcade experience.
// drei <KeyboardControls> consumes this `map`, and useKeyboardControls()
// reads boolean state keyed by `name`. Keep this the single source of truth
// so Player.jsx and any future game module stay in sync.

export const Controls = {
  forward: 'forward',
  back: 'back',
  left: 'left',
  right: 'right',
  jump: 'jump',
  interact: 'interact',
};

// Map fed to <KeyboardControls map={CONTROLS_MAP}>.
// We register E here too so future games can read it via useKeyboardControls,
// but the canonical pickup/throw handling lives on window keydown in Player
// (so it works even when focus/lock edge cases swallow drei's state).
export const CONTROLS_MAP = [
  { name: Controls.forward, keys: ['ArrowUp', 'KeyW'] },
  { name: Controls.back, keys: ['ArrowDown', 'KeyS'] },
  { name: Controls.left, keys: ['ArrowLeft', 'KeyA'] },
  { name: Controls.right, keys: ['ArrowRight', 'KeyD'] },
  { name: Controls.jump, keys: ['Space'] },
  { name: Controls.interact, keys: ['KeyE'] },
];

// Tunables shared across the controller. Centralised so the loop can balance
// movement feel for later milestones without spelunking through components.
export const PLAYER_CONFIG = {
  eyeHeight: 1.6, // camera offset above the capsule centre
  capsuleHalfHeight: 0.5, // half-height of the cylinder part of the capsule
  capsuleRadius: 0.35,
  moveSpeed: 6, // target horizontal speed (m/s)
  airControl: 0.35, // fraction of move authority while airborne
  jumpSpeed: 6.2, // upward velocity applied on jump
  // a capsule is "grounded" when its downward gap to the floor is below this
  groundedThreshold: 0.18,
  linearDamping: 0.0,
  spawn: [0, 2, 6],
};
