// ghostMath.js — pure, framework-free helpers for M8 (ghost replay).
//
// Kept separate from the React/r3f components (Ghosts.jsx) and the network
// client (ghostClient.js) so the recency/TTL filter, the recorder's
// sampling/decimation, and the per-frame pose interpolation can be unit-tested
// with the built-in `node --test` runner (no DOM, React, three, fetch, or npm
// dep). Everything here is deterministic — NO Math.random / Date.now — so the
// tests are stable; time is always passed in as a parameter. Mirrors
// deathMath.js / cycleMath.js.

export function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

// --------------------------------- TTL / recency ----------------------------

// Ghost docs live for 30 days (server-side Firestore TTL on `expiresAt`). The
// client re-applies the same cutoff on read so an expired-but-not-yet-swept doc
// is never replayed (TTL deletion is best-effort and can lag ~24h).
export const GHOST_TTL_DAYS = 30;
export const DAY_MS = 24 * 60 * 60 * 1000;

export function ttlCutoff(nowMs, days = GHOST_TTL_DAYS) {
  return nowMs - days * DAY_MS;
}

// Is a ghost (by its createdAt epoch-ms) still inside the lookback window?
export function withinTtl(createdAtMs, nowMs, days = GHOST_TTL_DAYS) {
  return Number.isFinite(createdAtMs) && createdAtMs >= ttlCutoff(nowMs, days);
}

// Filter a fetched ghost list to recent, well-formed entries, newest first,
// capped to `limit`. Belt-and-suspenders on top of the server filter. Called
// ONCE on fetch (NOT per frame), so allocating a new array is fine.
export function filterRecent(ghosts, nowMs, days = GHOST_TTL_DAYS, limit = Infinity) {
  if (!Array.isArray(ghosts)) return [];
  const cutoff = ttlCutoff(nowMs, days);
  const out = [];
  for (const g of ghosts) {
    if (!g) continue;
    const created = Number(g.createdAt);
    if (!Number.isFinite(created) || created < cutoff) continue;
    if (!Array.isArray(g.path) || g.path.length === 0) continue;
    out.push(g);
  }
  out.sort((a, b) => Number(b.createdAt) - Number(a.createdAt));
  return limit === Infinity ? out : out.slice(0, limit);
}

// --------------------------- recorder sampling / decimation -----------------

export const GHOST_SAMPLE_MS = 120; // ~8 pose samples/sec
export const GHOST_MAX_FRAMES = 3000; // matches the server's MAX_FRAMES cap
export const GHOST_MIN_FLUSH_FRAMES = 8; // skip uploading a path that barely moved
export const GHOST_MIN_MOVE = 0.05; // metres moved (3D) to keep a frame
export const GHOST_MIN_TURN = 0.09; // radians of heading change to keep a frame

// Has `intervalMs` elapsed since the last sample? (fixed-cadence gate)
export function shouldSample(lastSampleMs, nowMs, intervalMs = GHOST_SAMPLE_MS) {
  return nowMs - lastSampleMs >= intervalMs;
}

// Keep a candidate frame only if it moved OR turned enough vs the last KEPT
// frame — decimation drops near-duplicate idle frames so paths stay compact.
// `prev` is null for the very first frame (always kept). Alloc-free.
export function shouldKeepFrame(
  prev, x, y, z, ry,
  minMove = GHOST_MIN_MOVE,
  minTurn = GHOST_MIN_TURN,
) {
  if (!prev) return true;
  const dx = x - prev.x;
  const dy = y - prev.y;
  const dz = z - prev.z;
  if (dx * dx + dy * dy + dz * dz >= minMove * minMove) return true;
  let dr = ry - prev.ry;
  dr = Math.atan2(Math.sin(dr), Math.cos(dr)); // shortest-arc wrap
  return Math.abs(dr) >= minTurn;
}

// ------------------------------- replay sampling ----------------------------

// Total track length in ms (the last frame's offset). 0 for an empty path.
export function trackDuration(path) {
  if (!Array.isArray(path) || path.length === 0) return 0;
  const last = path[path.length - 1];
  return last && Number.isFinite(last.t) ? last.t : 0;
}

// Shortest-arc angle interpolation (so a ±π heading flip never spins the long
// way round). Alloc-free.
export function lerpAngle(a, b, t) {
  let d = b - a;
  d = Math.atan2(Math.sin(d), Math.cos(d));
  return a + d * t;
}

// Write the interpolated pose at offset `tMs` along `path` into `out`
// ({x,y,z,ry}, reused). Binary-search + in-place write → ZERO allocation, so it
// is safe to call once per ghost per frame in the replay loop. The caller wraps
// `tMs` into [0, duration] for looping playback. Clamps to the endpoints.
export function sampleTrackPose(path, tMs, out) {
  const n = Array.isArray(path) ? path.length : 0;
  if (n === 0) {
    out.x = 0; out.y = 0; out.z = 0; out.ry = 0;
    return out;
  }
  const first = path[0];
  if (n === 1 || tMs <= first.t) {
    out.x = first.x; out.y = first.y; out.z = first.z; out.ry = first.ry || 0;
    return out;
  }
  const last = path[n - 1];
  if (tMs >= last.t) {
    out.x = last.x; out.y = last.y; out.z = last.z; out.ry = last.ry || 0;
    return out;
  }
  // Find segment [lo, hi=lo+1] with path[lo].t <= tMs < path[hi].t.
  let lo = 0;
  let hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (path[mid].t <= tMs) lo = mid; else hi = mid;
  }
  const a = path[lo];
  const b = path[hi];
  const span = b.t - a.t;
  const f = span > 0 ? (tMs - a.t) / span : 0;
  out.x = a.x + (b.x - a.x) * f;
  out.y = a.y + (b.y - a.y) * f;
  out.z = a.z + (b.z - a.z) * f;
  out.ry = lerpAngle(a.ry || 0, b.ry || 0, f);
  return out;
}

// ----------------------------------- label ----------------------------------

// Deterministic relative-age label for the floating ghost tag (no Date / locale
// dependency → timezone-stable and unit-testable). The component appends a wall
// clock time from the absolute timestamp. ANONYMOUS: date/time only, never a name.
export function relativeAge(createdAtMs, nowMs) {
  let d = nowMs - createdAtMs;
  if (!(d > 0)) d = 0; // future / NaN → "just now"
  const sec = Math.floor(d / 1000);
  if (sec < 45) return 'just now';
  const min = Math.floor(sec / 60);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  return `${day}d ago`;
}
