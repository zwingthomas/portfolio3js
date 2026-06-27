import { createContext, useContext, useMemo, useRef, useCallback, createElement } from 'react';
import { discoverAt, questSummary } from './questMath';

// Shared adventure/objective state for M9, coordinated the same way as the other
// arcade stores (<PlayerStateProvider> / <RideStateProvider>): an imperative
// handle over mutable refs (no React state in the per-frame path) plus a
// subscribe() so the DOM objective HUD can react.
//
// - <QuestWatcher> (inside the Canvas) calls tryDiscover(px, pz) each frame; the
//   discovered Set lives in a ref so the hot loop never re-renders. A genuinely
//   NEW discovery (≤ LANDMARK_COUNT times per session) notifies subscribers.
// - <QuestHud> (DOM overlay) subscribes and renders the objective line.
//
// Discoveries reset on every fresh mount of the experience (the Set is created
// per-Provider), so re-entering the arcade starts the tour over — no module-level
// persistence. ALL labels here are ORIGINAL parody; no real workplace-sitcom IP.

const QuestContext = createContext(null);

export function QuestProvider({ children }) {
  const discovered = useRef(null);
  if (discovered.current === null) discovered.current = new Set();
  const lastFound = useRef(null);
  const listeners = useRef(new Set());

  const notify = useCallback(() => {
    const snap = questSummary(discovered.current, lastFound.current);
    for (const fn of listeners.current) {
      try { fn(snap); } catch { /* ignore listener errors */ }
    }
  }, []);

  // Called each frame by the watcher. Records at most one NEW landmark per call
  // and notifies only on a genuine discovery, so the hot path is a no-op once a
  // spot is already found. Returns the discovered id (or null).
  const tryDiscover = useCallback((px, pz) => {
    const id = discoverAt(px, pz, discovered.current);
    if (!id) return null;
    discovered.current.add(id);
    lastFound.current = id;
    notify();
    return id;
  }, [notify]);

  const getDiscovered = useCallback(() => discovered.current, []);
  const getSummary = useCallback(() => questSummary(discovered.current, lastFound.current), []);

  const subscribe = useCallback((fn) => {
    listeners.current.add(fn);
    // push the current snapshot immediately so a fresh subscriber is in sync.
    try { fn(questSummary(discovered.current, lastFound.current)); } catch { /* ignore */ }
    return () => listeners.current.delete(fn);
  }, []);

  const value = useMemo(() => ({
    tryDiscover,
    getDiscovered,
    getSummary,
    subscribe,
  }), [tryDiscover, getDiscovered, getSummary, subscribe]);

  // Intentionally a .js file (no JSX) to stay loader-agnostic, like the other
  // arcade stores (useHeldObject / usePlayerState / useRideState).
  return createElement(QuestContext.Provider, { value }, children);
}

export function useQuest() {
  const ctx = useContext(QuestContext);
  if (!ctx) {
    throw new Error('useQuest must be used within <QuestProvider>');
  }
  return ctx;
}

export default useQuest;
