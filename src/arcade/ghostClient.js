// ghostClient.js — M8 ghost-replay network client (anonymous + offline-safe).
//
// PRIVACY (hard requirement): the ONLY thing that ever leaves the browser is a
// random anonymous sessionId (a client-side UUID, tied to no identity) plus a
// list of sampled world poses { t, x, y, z, ry }. We send NO name, NO email, NO
// IP (the server never stores it either), NO user-agent, NO PII of any kind —
// see backend/main.py + backend/README.md "Privacy model". The GET endpoint
// does not even return sessionId.
//
// OFFLINE-SAFE: every network call is gated on a configured base URL
// (VITE_GHOST_API_BASE — owned by the build/env, NOT committed). With it unset
// (the default shipped state) ghosts are DISABLED: record/fetch become no-ops
// and the world runs solo. Any network error is swallowed so an unreachable /
// absent backend never breaks the experience or the build.
//
// Vite exposes import.meta.env.VITE_* to the client at build time, so wiring the
// endpoint needs no edit to vite.config.js (the owner-owned file): the owner
// sets VITE_GHOST_API_BASE in .env / the deploy env after deploying Cloud Run.

import { GHOST_TTL_DAYS } from './ghostMath';

// import.meta.env may be undefined under the node test runner; guard it.
const RAW_BASE =
  (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_GHOST_API_BASE) || '';

// Normalised base URL (no trailing slash). '' means "ghosts disabled".
export function getGhostBase() {
  const b = String(RAW_BASE).trim();
  return b ? b.replace(/\/+$/, '') : '';
}

// True only when a base URL is configured. All record/replay UI gates on this.
export function ghostsEnabled() {
  return getGhostBase() !== '';
}

const SESSION_KEY = 'arcade.ghostSession';

function randomId() {
  try {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  } catch {
    /* fall through */
  }
  // Fallback: 32 hex chars. Still fully anonymous (no identity is derivable).
  let s = '';
  for (let i = 0; i < 32; i += 1) s += Math.floor(Math.random() * 16).toString(16);
  return s;
}

// Anonymous, per-tab session id, persisted in sessionStorage so a re-entry in
// the SAME tab reuses it (one ghost per visit, not one per cabinet). Never PII.
export function getSessionId() {
  try {
    const cached = sessionStorage.getItem(SESSION_KEY);
    if (cached) return cached;
    const id = randomId();
    sessionStorage.setItem(SESSION_KEY, id);
    return id;
  } catch {
    // private mode / storage blocked → still works, just not reused across entries
    return randomId();
  }
}

function resolveFetch(opts) {
  if (opts && typeof opts.fetch === 'function') return opts.fetch;
  if (typeof fetch !== 'undefined') return fetch;
  return null;
}

// POST a recorded session. Resolves to the new doc id, or null on
// disabled/failure. `keepalive` lets the request survive page unload/navigation
// (used when flushing on EXIT / pagehide). Body MUST contain only the anonymous
// fields the server persists.
export async function postGhost(body, opts) {
  const base = getGhostBase();
  if (!base) return null;
  const doFetch = resolveFetch(opts);
  if (!doFetch || !body) return null;
  try {
    const res = await doFetch(`${base}/ghosts`, {
      method: 'POST',
      mode: 'cors',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      keepalive: !!(opts && opts.keepalive),
    });
    if (!res || !res.ok) return null;
    const data = await res.json().catch(() => null);
    return data && data.id ? data.id : null;
  } catch {
    return null; // offline / unreachable / CORS — world runs solo
  }
}

// GET recent ghosts (newest first, no PII). Resolves to an array, or [] on
// disabled/failure. Never throws.
export async function fetchRecentGhosts(opts) {
  const base = getGhostBase();
  if (!base) return [];
  const doFetch = resolveFetch(opts);
  if (!doFetch) return [];
  const sinceDays = (opts && opts.sinceDays) || GHOST_TTL_DAYS;
  const limit = (opts && opts.limit) || 50;
  try {
    const res = await doFetch(`${base}/ghosts?sinceDays=${sinceDays}&limit=${limit}`, {
      method: 'GET',
      mode: 'cors',
    });
    if (!res || !res.ok) return [];
    const data = await res.json().catch(() => null);
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}
