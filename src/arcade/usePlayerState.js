import { createContext, useContext, useMemo, useRef, useCallback, createElement } from 'react';
import { MAX_HEALTH, applyDamage, isDead } from './deathMath';

// Shared player vitals for M6 (death & respawn), coordinated the same way as
// <HeldObjectProvider>: imperative handle, mutable refs (no React state in the
// per-frame path), and a subscribe() so DOM HUD/overlay can react.
//
// - Player.jsx writes fall damage and consumes respawn requests in useFrame.
// - Minotaur.jsx calls damage() on a catch and watches respawnEpoch to relocate.
// - index.jsx bridges `dead` into React state to mount the DefeatOverlay and to
//   freeze the world (paused) while the defeat screen is up.
//
// Health/`dead` live in refs so the hot loop never triggers re-renders; UI that
// must reflect them subscribes via onChange(health, dead, epoch).

const PlayerStateContext = createContext(null);

export function PlayerStateProvider({ children }) {
  const health = useRef(MAX_HEALTH);
  const dead = useRef(false);
  // Bumped on every respawn so the threat can detect it and relocate far away.
  const respawnEpoch = useRef(0);
  // One-shot flag the Player consumes in useFrame to teleport back to spawn.
  const pendingRespawn = useRef(false);
  const listeners = useRef(new Set());

  const notify = useCallback(() => {
    const h = health.current;
    const d = dead.current;
    const e = respawnEpoch.current;
    for (const fn of listeners.current) {
      try { fn(h, d, e); } catch { /* ignore listener errors */ }
    }
  }, []);

  const getHealth = useCallback(() => health.current, []);
  const getMaxHealth = useCallback(() => MAX_HEALTH, []);
  const getDead = useCallback(() => dead.current, []);
  const getRespawnEpoch = useCallback(() => respawnEpoch.current, []);

  // Apply `amount` damage. No-op once dead (so a corpse can't re-trigger the
  // defeat flow). Crossing zero latches `dead` and notifies exactly once.
  const damage = useCallback((amount) => {
    if (dead.current) return health.current;
    if (!(amount > 0)) return health.current;
    health.current = applyDamage(health.current, amount);
    if (isDead(health.current)) dead.current = true;
    notify();
    return health.current;
  }, [notify]);

  // Instant kill (used by the threat's catch).
  const kill = useCallback(() => {
    if (dead.current) return;
    health.current = 0;
    dead.current = true;
    notify();
  }, [notify]);

  // Full reset back to a live, full-health spawn. Flags a teleport for the
  // Player and bumps the epoch so the threat relocates.
  const respawn = useCallback(() => {
    health.current = MAX_HEALTH;
    dead.current = false;
    respawnEpoch.current += 1;
    pendingRespawn.current = true;
    notify();
  }, [notify]);

  // Player.jsx calls this each frame; returns true exactly once after a respawn
  // so the controller can hard-reset the body transform + velocity.
  const consumeRespawn = useCallback(() => {
    if (!pendingRespawn.current) return false;
    pendingRespawn.current = false;
    return true;
  }, []);

  const subscribe = useCallback((fn) => {
    listeners.current.add(fn);
    // push the current snapshot immediately so a fresh subscriber is in sync.
    try { fn(health.current, dead.current, respawnEpoch.current); } catch { /* ignore */ }
    return () => listeners.current.delete(fn);
  }, []);

  const value = useMemo(() => ({
    getHealth,
    getMaxHealth,
    getDead,
    getRespawnEpoch,
    damage,
    kill,
    respawn,
    consumeRespawn,
    subscribe,
  }), [getHealth, getMaxHealth, getDead, getRespawnEpoch, damage, kill, respawn, consumeRespawn, subscribe]);

  // Intentionally a .js file (no JSX) to stay loader-agnostic, like useHeldObject.
  return createElement(PlayerStateContext.Provider, { value }, children);
}

export function usePlayerState() {
  const ctx = useContext(PlayerStateContext);
  if (!ctx) {
    throw new Error('usePlayerState must be used within <PlayerStateProvider>');
  }
  return ctx;
}

export default usePlayerState;
