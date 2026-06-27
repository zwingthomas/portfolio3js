// node --test src/arcade/__tests__/ghostMath.test.mjs
//
// Pure-logic tests for M8 (ghost replay): the TTL/recency filter, the recorder's
// sampling + decimation gates, and the per-frame pose interpolation. No DOM,
// React, three, fetch, or WebAudio — built-in node test runner (Node v26). NOT
// part of build-guard (can't edit package.json); run manually with an EXPLICIT
// file path (running the __tests__ DIR fails spuriously — node treats it as a test).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  clamp,
  GHOST_TTL_DAYS,
  DAY_MS,
  ttlCutoff,
  withinTtl,
  filterRecent,
  GHOST_SAMPLE_MS,
  GHOST_MIN_MOVE,
  GHOST_MIN_TURN,
  shouldSample,
  shouldKeepFrame,
  trackDuration,
  lerpAngle,
  sampleTrackPose,
  relativeAge,
} from '../ghostMath.js';

const NOW = 1_700_000_000_000; // fixed "now" so tests are deterministic

test('clamp bounds a value to [lo, hi]', () => {
  assert.equal(clamp(5, 0, 10), 5);
  assert.equal(clamp(-3, 0, 10), 0);
  assert.equal(clamp(99, 0, 10), 10);
});

// --------------------------------- TTL / recency ----------------------------

test('ttlCutoff is exactly N days before now', () => {
  assert.equal(ttlCutoff(NOW), NOW - 30 * DAY_MS);
  assert.equal(ttlCutoff(NOW, 7), NOW - 7 * DAY_MS);
  assert.equal(GHOST_TTL_DAYS, 30);
});

test('withinTtl: inside the 30-day window passes, older fails', () => {
  assert.equal(withinTtl(NOW, NOW), true);
  assert.equal(withinTtl(NOW - 29 * DAY_MS, NOW), true);
  assert.equal(withinTtl(NOW - 30 * DAY_MS, NOW), true); // exactly at the edge
  assert.equal(withinTtl(NOW - 31 * DAY_MS, NOW), false);
  assert.equal(withinTtl(NaN, NOW), false);
});

test('filterRecent: drops expired/malformed, sorts newest-first, caps to limit', () => {
  const list = [
    { id: 'old', createdAt: NOW - 31 * DAY_MS, path: [{ t: 0, x: 0, y: 0, z: 0, ry: 0 }] },
    { id: 'mid', createdAt: NOW - 10 * DAY_MS, path: [{ t: 0, x: 0, y: 0, z: 0, ry: 0 }] },
    { id: 'new', createdAt: NOW - 1 * DAY_MS, path: [{ t: 0, x: 0, y: 0, z: 0, ry: 0 }] },
    { id: 'nopath', createdAt: NOW, path: [] }, // dropped (empty path)
    { id: 'badtime', createdAt: 'x', path: [{ t: 0, x: 0, y: 0, z: 0, ry: 0 }] }, // dropped
    null, // dropped
  ];
  const out = filterRecent(list, NOW);
  assert.deepEqual(out.map((g) => g.id), ['new', 'mid']);

  const capped = filterRecent(list, NOW, GHOST_TTL_DAYS, 1);
  assert.deepEqual(capped.map((g) => g.id), ['new']);
});

test('filterRecent: non-array input → empty array', () => {
  assert.deepEqual(filterRecent(null, NOW), []);
  assert.deepEqual(filterRecent(undefined, NOW), []);
  assert.deepEqual(filterRecent(42, NOW), []);
});

// --------------------------- recorder sampling / decimation -----------------

test('shouldSample: gates on the fixed cadence', () => {
  assert.equal(shouldSample(1000, 1000 + GHOST_SAMPLE_MS, GHOST_SAMPLE_MS), true);
  assert.equal(shouldSample(1000, 1000 + GHOST_SAMPLE_MS - 1, GHOST_SAMPLE_MS), false);
  assert.equal(shouldSample(-1e9, 0), true); // first sample always passes
});

test('shouldKeepFrame: first frame (no prev) is always kept', () => {
  assert.equal(shouldKeepFrame(null, 0, 0, 0, 0), true);
});

test('shouldKeepFrame: keeps a frame that moved past the threshold', () => {
  const prev = { x: 0, y: 0, z: 0, ry: 0 };
  assert.equal(shouldKeepFrame(prev, GHOST_MIN_MOVE + 0.01, 0, 0, 0), true);
  assert.equal(shouldKeepFrame(prev, 0, 0, GHOST_MIN_MOVE + 0.01, 0), true);
});

test('shouldKeepFrame: drops a near-stationary, near-still frame (decimation)', () => {
  const prev = { x: 0, y: 0, z: 0, ry: 0 };
  assert.equal(shouldKeepFrame(prev, 0.001, 0, 0.001, 0.001), false);
});

test('shouldKeepFrame: keeps a frame that turned enough even if it barely moved', () => {
  const prev = { x: 0, y: 0, z: 0, ry: 0 };
  assert.equal(shouldKeepFrame(prev, 0, 0, 0, GHOST_MIN_TURN + 0.01), true);
});

test('shouldKeepFrame: heading change uses shortest-arc (π→−π is ~0)', () => {
  const prev = { x: 0, y: 0, z: 0, ry: Math.PI - 0.001 };
  // crossing the ±π seam is a tiny turn, not a ~2π one → dropped
  assert.equal(shouldKeepFrame(prev, 0, 0, 0, -Math.PI + 0.001), false);
});

// ------------------------------- replay sampling ----------------------------

test('trackDuration: last frame offset, 0 for empty/invalid', () => {
  assert.equal(trackDuration([{ t: 0 }, { t: 120 }, { t: 999 }]), 999);
  assert.equal(trackDuration([]), 0);
  assert.equal(trackDuration(null), 0);
});

test('lerpAngle: interpolates the short way around the circle', () => {
  assert.ok(Math.abs(lerpAngle(0, Math.PI / 2, 0.5) - Math.PI / 4) < 1e-9);
  // from just under +π to just over −π is a short hop across the seam, near ±π
  const v = lerpAngle(Math.PI - 0.1, -Math.PI + 0.1, 0.5);
  assert.ok(Math.abs(Math.abs(v) - Math.PI) < 0.11, `near ±π, got ${v}`);
});

const PATH = [
  { t: 0, x: 0, y: 2, z: 0, ry: 0 },
  { t: 100, x: 10, y: 2, z: 0, ry: 0 },
  { t: 200, x: 10, y: 2, z: 10, ry: 1 },
];

test('sampleTrackPose: clamps before the first and after the last frame', () => {
  const out = { x: 0, y: 0, z: 0, ry: 0 };
  sampleTrackPose(PATH, -50, out);
  assert.deepEqual(out, { x: 0, y: 2, z: 0, ry: 0 });
  sampleTrackPose(PATH, 9999, out);
  assert.deepEqual(out, { x: 10, y: 2, z: 10, ry: 1 });
});

test('sampleTrackPose: interpolates linearly within a segment', () => {
  const out = { x: 0, y: 0, z: 0, ry: 0 };
  sampleTrackPose(PATH, 50, out); // halfway through segment 0→1
  assert.ok(Math.abs(out.x - 5) < 1e-9);
  assert.equal(out.z, 0);
  sampleTrackPose(PATH, 150, out); // halfway through segment 1→2
  assert.ok(Math.abs(out.z - 5) < 1e-9);
  assert.ok(Math.abs(out.ry - 0.5) < 1e-9);
});

test('sampleTrackPose: exact frame boundary returns that frame', () => {
  const out = { x: 0, y: 0, z: 0, ry: 0 };
  sampleTrackPose(PATH, 100, out);
  assert.ok(Math.abs(out.x - 10) < 1e-9);
  assert.equal(out.z, 0);
});

test('sampleTrackPose: empty path → zeroed out, single frame → that frame', () => {
  const out = { x: 9, y: 9, z: 9, ry: 9 };
  sampleTrackPose([], 10, out);
  assert.deepEqual(out, { x: 0, y: 0, z: 0, ry: 0 });
  sampleTrackPose([{ t: 0, x: 1, y: 2, z: 3, ry: 0.4 }], 10, out);
  assert.deepEqual(out, { x: 1, y: 2, z: 3, ry: 0.4 });
});

test('sampleTrackPose: writes into the SAME out object (zero per-frame alloc)', () => {
  const out = { x: 0, y: 0, z: 0, ry: 0 };
  const ret = sampleTrackPose(PATH, 50, out);
  assert.equal(ret, out); // returns the same reference it was handed
});

test('sampleTrackPose: binary search picks the right segment across many frames', () => {
  const path = [];
  for (let i = 0; i <= 100; i += 1) path.push({ t: i * 10, x: i, y: 0, z: 0, ry: 0 });
  const out = { x: 0, y: 0, z: 0, ry: 0 };
  sampleTrackPose(path, 555, out); // between t=550 (x=55) and t=560 (x=56)
  assert.ok(out.x > 55 && out.x < 56, `got ${out.x}`);
});

// ----------------------------------- label ----------------------------------

test('relativeAge: buckets seconds/minutes/hours/days', () => {
  assert.equal(relativeAge(NOW, NOW), 'just now');
  assert.equal(relativeAge(NOW - 5 * 1000, NOW), 'just now');
  assert.equal(relativeAge(NOW - 90 * 1000, NOW), '1m ago');
  assert.equal(relativeAge(NOW - 5 * 60 * 1000, NOW), '5m ago');
  assert.equal(relativeAge(NOW - 3 * 60 * 60 * 1000, NOW), '3h ago');
  assert.equal(relativeAge(NOW - 2 * DAY_MS, NOW), '2d ago');
});

test('relativeAge: future/NaN delta → "just now" (never negative)', () => {
  assert.equal(relativeAge(NOW + 10_000, NOW), 'just now');
  assert.equal(relativeAge(NaN, NOW), 'just now');
});
