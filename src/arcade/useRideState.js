import { createContext, useContext, useMemo, useRef, useCallback, createElement } from 'react';

// Shared "neon cycle" ride state for M7, coordinated the same way as
// <HeldObjectProvider> / <PlayerStateProvider>: an imperative handle backed by
// mutable refs (no React state in the per-frame path) plus a subscribe() so DOM
// HUD can react to mount/dismount.
//
// - Player.jsx owns the E mount/dismount routing and, while riding, writes the
//   live cycle pose every frame (alloc-free, in place).
// - Cycle.jsx reads the pose each frame to place the cycle mesh (live under the
//   rider while mounted; at its parked spot otherwise).
// - index.jsx bridges `riding` into React for the HUD hint.
//
// Poses are flat mutable objects { x, y, z, yaw } reused in place so nothing is
// allocated per frame. yaw matches three's YXZ convention (rotation.y).

const RideStateContext = createContext(null);

// The cycle's home bay: floor level, left-front of the spawn pad, facing the
// arcade (−z). Kept in sync with the bay pad rendered in Cycle.jsx.
export const CYCLE_HOME = { x: -7, y: 0, z: 4, yaw: Math.PI };

export function RideStateProvider({ children }) {
  const riding = useRef(false);
  // live pose while mounted (written by Player each frame).
  const livePose = useRef({ x: CYCLE_HOME.x, y: CYCLE_HOME.y, z: CYCLE_HOME.z, yaw: CYCLE_HOME.yaw });
  // where the cycle sits when nobody's on it (updated on dismount).
  const parkedPose = useRef({ x: CYCLE_HOME.x, y: CYCLE_HOME.y, z: CYCLE_HOME.z, yaw: CYCLE_HOME.yaw });
  const listeners = useRef(new Set());

  const notify = useCallback(() => {
    const r = riding.current;
    for (const fn of listeners.current) {
      try { fn(r); } catch { /* ignore listener errors */ }
    }
  }, []);

  const getRiding = useCallback(() => riding.current, []);
  const getLivePose = useCallback(() => livePose.current, []);
  const getParkedPose = useCallback(() => parkedPose.current, []);

  // Mount: begin riding from the parked spot (seed the live pose so the first
  // frame doesn't snap from a stale location).
  const mount = useCallback(() => {
    if (riding.current) return;
    const p = parkedPose.current;
    const l = livePose.current;
    l.x = p.x; l.y = p.y; l.z = p.z; l.yaw = p.yaw;
    riding.current = true;
    notify();
  }, [notify]);

  // Dismount: park the cycle where the rider left it.
  const dismount = useCallback(() => {
    if (!riding.current) return;
    const p = parkedPose.current;
    const l = livePose.current;
    p.x = l.x; p.y = l.y; p.z = l.z; p.yaw = l.yaw;
    riding.current = false;
    notify();
  }, [notify]);

  // Player writes the live pose each frame while mounted (in place — no alloc).
  const setLivePose = useCallback((x, y, z, yaw) => {
    const l = livePose.current;
    l.x = x; l.y = y; l.z = z; l.yaw = yaw;
  }, []);

  const subscribe = useCallback((fn) => {
    listeners.current.add(fn);
    try { fn(riding.current); } catch { /* ignore */ }
    return () => listeners.current.delete(fn);
  }, []);

  const value = useMemo(() => ({
    getRiding,
    getLivePose,
    getParkedPose,
    setLivePose,
    mount,
    dismount,
    subscribe,
  }), [getRiding, getLivePose, getParkedPose, setLivePose, mount, dismount, subscribe]);

  // Intentionally a .js file (no JSX) to stay loader-agnostic, like useHeldObject.
  return createElement(RideStateContext.Provider, { value }, children);
}

export function useRideState() {
  const ctx = useContext(RideStateContext);
  if (!ctx) {
    throw new Error('useRideState must be used within <RideStateProvider>');
  }
  return ctx;
}

export default useRideState;
