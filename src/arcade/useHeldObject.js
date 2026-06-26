import { createContext, useContext, useMemo, useRef, useCallback, createElement } from 'react';

// Coordinates the single "held object" across the scene WITHOUT any external
// state lib (no zustand). Throwables register an imperative handle here; the
// Player drives pickup/drop/throw and the nearest-throwable query.
//
// We deliberately keep the "currently held id" in a ref (not React state) so
// the per-frame Player loop can read/write it with zero re-renders. UI that
// needs to reflect held-state can subscribe via onChange.

const HeldObjectContext = createContext(null);

export function HeldObjectProvider({ children }) {
  // Map<id, handle> of every registered throwable.
  const registry = useRef(new Map());
  // id of the currently held throwable, or null.
  const heldId = useRef(null);
  // subscribers notified when the held id changes (for HUD reactivity).
  const listeners = useRef(new Set());

  const notify = useCallback((id) => {
    for (const fn of listeners.current) {
      try { fn(id); } catch { /* ignore listener errors */ }
    }
  }, []);

  const register = useCallback((id, handle) => {
    registry.current.set(id, handle);
    return () => {
      registry.current.delete(id);
      if (heldId.current === id) {
        heldId.current = null;
        notify(null);
      }
    };
  }, [notify]);

  const getHeld = useCallback(() => {
    const id = heldId.current;
    return id == null ? null : registry.current.get(id) || null;
  }, []);

  const isHeld = useCallback((id) => heldId.current === id, []);

  // Find the closest registered throwable to a world-space point within reach.
  // Returns its handle or null. Allocation-light: reused tmp by the caller.
  const findNearest = useCallback((point, maxDist) => {
    let best = null;
    let bestDist = maxDist;
    for (const handle of registry.current.values()) {
      const p = handle.getPosition && handle.getPosition();
      if (!p) continue;
      const dx = p.x - point.x;
      const dy = p.y - point.y;
      const dz = p.z - point.z;
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (d < bestDist) {
        bestDist = d;
        best = handle;
      }
    }
    return best;
  }, []);

  const pickUp = useCallback((id) => {
    if (heldId.current != null && heldId.current !== id) return false; // one at a time
    const handle = registry.current.get(id);
    if (!handle) return false;
    heldId.current = id;
    if (handle.onPickUp) handle.onPickUp();
    notify(id);
    return true;
  }, [notify]);

  const drop = useCallback(() => {
    const id = heldId.current;
    if (id == null) return;
    const handle = registry.current.get(id);
    heldId.current = null;
    if (handle && handle.onDrop) handle.onDrop();
    notify(null);
  }, [notify]);

  const throwHeld = useCallback((impulse) => {
    const id = heldId.current;
    if (id == null) return;
    const handle = registry.current.get(id);
    heldId.current = null;
    if (handle && handle.onThrow) handle.onThrow(impulse);
    notify(null);
  }, [notify]);

  const subscribe = useCallback((fn) => {
    listeners.current.add(fn);
    return () => listeners.current.delete(fn);
  }, []);

  const value = useMemo(() => ({
    register,
    getHeld,
    isHeld,
    findNearest,
    pickUp,
    drop,
    throwHeld,
    subscribe,
  }), [register, getHeld, isHeld, findNearest, pickUp, drop, throwHeld, subscribe]);

  // This file is intentionally .js (no JSX), so we build the provider element
  // with createElement to stay loader-agnostic under Vite/esbuild.
  return createElement(HeldObjectContext.Provider, { value }, children);
}

export function useHeldObject() {
  const ctx = useContext(HeldObjectContext);
  if (!ctx) {
    throw new Error('useHeldObject must be used within <HeldObjectProvider>');
  }
  return ctx;
}

export default useHeldObject;
