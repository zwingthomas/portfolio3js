// questMath.js — pure, framework-free logic for M9 (adventure / objective layer).
//
// The arcade is themed as an ORIGINAL parody "workplace-sitcom" office. The
// adventure layer turns the hub into a self-guided tour: each attraction (the 3
// cabinets, the Traxy kiosk, the cycle bay, the tall grass, the mezzanine) is a
// LANDMARK the player "discovers" by walking near it. A DOM HUD shows progress
// and the next suggested objective so the world is discoverable through
// exploration (M9 acceptance) without a forced sequence — you can wander in any
// order and the tracker just fills in.
//
// Kept separate from the React/r3f components (Decor.jsx, useQuest.js, index.jsx)
// so the discovery geometry + objective formatting are unit-testable with the
// built-in `node --test` runner (no DOM, React, three, or npm dep). Everything is
// deterministic and alloc-free on the hot path (landmarkAt loops a fixed array of
// distance² compares — no Date.now, no Math.random, no per-call allocation).
//
// LEGAL: ORIGINAL parody only. No real "The Office" IP — no Dunder Mifflin, no
// real character names/likeness. All slogans/labels here are original. See
// ASSETS.md M9.

import { GRASS_ZONES } from './cycleMath.js';

// The discoverable attractions, in the recommended tour order (the "next
// objective" picker walks this array and surfaces the first one you haven't
// found yet). Coordinates mirror the placements in Hub.jsx / Cycle.jsx so the
// single source of truth for "where is X" stays consistent. `radius` is the XZ
// discovery distance in metres — generous so you discover by getting close, not
// by standing exactly on the spot. The `grass` landmark uses the shared
// GRASS_ZONES (three patches) instead of a single circle.
export const LANDMARKS = [
  {
    id: 'cyclebay',
    label: 'CYCLE BAY',
    hint: 'Find the CYCLE BAY and mount the neon cycle (west)',
    x: -7,
    z: 4,
    radius: 3.2,
  },
  {
    id: 'traxy',
    label: 'TRAXY KIOSK',
    hint: 'Visit the TRAXY KIOSK — opens traxy.app (east)',
    x: 7,
    z: 2,
    radius: 3.2,
  },
  {
    id: 'pulse',
    label: 'PULSE',
    hint: 'Find PULSE — the rhythm cabinet (north-west)',
    x: -7,
    z: -9,
    radius: 3.2,
  },
  {
    id: 'gridlock',
    label: 'GRIDLOCK',
    hint: 'Find GRIDLOCK — the crossing cabinet (north)',
    x: 0,
    z: -10,
    radius: 3.2,
  },
  {
    id: 'cascade',
    label: 'CASCADE',
    hint: 'Find CASCADE — the stack cabinet (north-east)',
    x: 7,
    z: -9,
    radius: 3.2,
  },
  {
    id: 'grass',
    label: 'TALL GRASS',
    hint: 'Ride the cycle into the TALL GRASS for a duel',
    zones: GRASS_ZONES,
  },
  {
    id: 'mezzanine',
    label: 'MEZZANINE',
    hint: 'Climb the MEZZANINE — mind the drop (west)',
    x: -10,
    z: 10.5,
    radius: 3.4,
  },
];

export const LANDMARK_COUNT = LANDMARKS.length;

// True when (px, pz) is inside this landmark's region. Supports a single circle
// (x, z, radius) or a list of circular `zones`. Alloc-free.
export function inLandmark(lm, px, pz) {
  if (lm.zones) {
    for (let i = 0; i < lm.zones.length; i++) {
      const zn = lm.zones[i];
      const dx = px - zn.x;
      const dz = pz - zn.z;
      if (dx * dx + dz * dz <= zn.r * zn.r) return true;
    }
    return false;
  }
  const dx = px - lm.x;
  const dz = pz - lm.z;
  return dx * dx + dz * dz <= lm.radius * lm.radius;
}

// The FIRST landmark whose region contains (px, pz), or null. Alloc-free; safe
// to call per frame. Order is the LANDMARKS array order.
export function landmarkAt(px, pz, landmarks = LANDMARKS) {
  for (let i = 0; i < landmarks.length; i++) {
    if (inLandmark(landmarks[i], px, pz)) return landmarks[i];
  }
  return null;
}

// Returns the id of a landmark the player is standing in that is NOT yet in the
// `discovered` Set, or null. The per-frame watcher calls this and, on a non-null
// result, records the discovery exactly once. `discovered` is a Set<string>.
export function discoverAt(px, pz, discovered, landmarks = LANDMARKS) {
  for (let i = 0; i < landmarks.length; i++) {
    const lm = landmarks[i];
    if (!discovered.has(lm.id) && inLandmark(lm, px, pz)) return lm.id;
  }
  return null;
}

// Progress summary. `discovered` is a Set<string> of landmark ids.
export function questProgress(discovered, landmarks = LANDMARKS) {
  const total = landmarks.length;
  let found = 0;
  for (let i = 0; i < landmarks.length; i++) {
    if (discovered.has(landmarks[i].id)) found++;
  }
  return { found, total, complete: found >= total };
}

// The first not-yet-discovered landmark in tour order, or null when complete.
export function nextObjective(discovered, landmarks = LANDMARKS) {
  for (let i = 0; i < landmarks.length; i++) {
    if (!discovered.has(landmarks[i].id)) return landmarks[i];
  }
  return null;
}

// A single HUD line summarising progress + the next suggested objective. Pure
// string assembly so the DOM HUD stays dumb and this stays unit-testable.
export function objectiveLine(discovered, landmarks = LANDMARKS) {
  const { found, total, complete } = questProgress(discovered, landmarks);
  if (complete) {
    return `TOUR COMPLETE · ${total}/${total} attractions found · beware the minotaur`;
  }
  const next = nextObjective(discovered, landmarks);
  return `OBJECTIVES ${found}/${total} · ${next.hint}`;
}

// Full snapshot object the store hands to React subscribers (so the HUD never
// touches the Set directly). `lastFound` is the label of the most recent
// discovery (for a brief "DISCOVERED: X" flourish), or null.
export function questSummary(discovered, lastFoundId = null, landmarks = LANDMARKS) {
  const { found, total, complete } = questProgress(discovered, landmarks);
  let lastLabel = null;
  if (lastFoundId) {
    for (let i = 0; i < landmarks.length; i++) {
      if (landmarks[i].id === lastFoundId) { lastLabel = landmarks[i].label; break; }
    }
  }
  return {
    found,
    total,
    complete,
    line: objectiveLine(discovered, landmarks),
    lastLabel,
  };
}
