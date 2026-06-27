// node --test src/arcade/__tests__/questMath.test.mjs
//
// Pure-logic tests for M9 (adventure / objective layer): landmark discovery
// geometry, progress counting, next-objective selection, and HUD line/summary
// formatting. No DOM, React, three, or WebAudio — built-in node test runner
// (Node v26). NOT part of build-guard (can't edit package.json); run manually
// with an EXPLICIT file path (running the __tests__ DIR fails spuriously).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  LANDMARKS,
  LANDMARK_COUNT,
  inLandmark,
  landmarkAt,
  discoverAt,
  questProgress,
  nextObjective,
  objectiveLine,
  questSummary,
} from '../questMath.js';
import { GRASS_ZONES } from '../cycleMath.js';

function byId(id) {
  return LANDMARKS.find((l) => l.id === id);
}

test('LANDMARKS has the seven attractions with stable ids', () => {
  assert.equal(LANDMARK_COUNT, LANDMARKS.length);
  const ids = LANDMARKS.map((l) => l.id);
  for (const id of ['cyclebay', 'traxy', 'pulse', 'gridlock', 'cascade', 'grass', 'mezzanine']) {
    assert.ok(ids.includes(id), `missing landmark ${id}`);
  }
  // every landmark has a label + a hint, and is either a circle or a zone set
  for (const lm of LANDMARKS) {
    assert.equal(typeof lm.label, 'string');
    assert.equal(typeof lm.hint, 'string');
    assert.ok(lm.zones ? Array.isArray(lm.zones) : typeof lm.radius === 'number');
  }
});

test('inLandmark: circle membership uses XZ distance², ignores Y', () => {
  const pulse = byId('pulse');
  assert.ok(inLandmark(pulse, pulse.x, pulse.z));
  assert.ok(inLandmark(pulse, pulse.x + pulse.radius - 0.01, pulse.z));
  assert.ok(!inLandmark(pulse, pulse.x + pulse.radius + 0.5, pulse.z));
});

test('inLandmark: zone landmark (grass) matches any patch', () => {
  const grass = byId('grass');
  // dead-center of each grass patch is inside the grass landmark
  for (const zn of GRASS_ZONES) {
    assert.ok(inLandmark(grass, zn.x, zn.z), `grass center ${zn.x},${zn.z}`);
  }
  // far away is not
  assert.ok(!inLandmark(grass, 100, 100));
});

test('landmarkAt returns the first containing landmark or null', () => {
  const traxy = byId('traxy');
  assert.equal(landmarkAt(traxy.x, traxy.z)?.id, 'traxy');
  assert.equal(landmarkAt(1000, 1000), null);
});

test('discoverAt returns a NEW landmark id, then null once recorded', () => {
  const seen = new Set();
  const cascade = byId('cascade');
  const id = discoverAt(cascade.x, cascade.z, seen);
  assert.equal(id, 'cascade');
  seen.add(id);
  // standing in the same spot no longer yields a discovery
  assert.equal(discoverAt(cascade.x, cascade.z, seen), null);
  // empty space yields nothing
  assert.equal(discoverAt(1000, 1000, seen), null);
});

test('questProgress counts found vs total and flags completion', () => {
  const empty = new Set();
  let p = questProgress(empty);
  assert.deepEqual(p, { found: 0, total: LANDMARK_COUNT, complete: false });

  const all = new Set(LANDMARKS.map((l) => l.id));
  p = questProgress(all);
  assert.equal(p.found, LANDMARK_COUNT);
  assert.equal(p.complete, true);
});

test('nextObjective walks tour order and is null when complete', () => {
  const seen = new Set();
  // first objective is the first landmark in array order
  assert.equal(nextObjective(seen).id, LANDMARKS[0].id);
  seen.add(LANDMARKS[0].id);
  assert.equal(nextObjective(seen).id, LANDMARKS[1].id);
  const all = new Set(LANDMARKS.map((l) => l.id));
  assert.equal(nextObjective(all), null);
});

test('objectiveLine surfaces the next hint, then a completion line', () => {
  const seen = new Set();
  const line0 = objectiveLine(seen);
  assert.match(line0, /OBJECTIVES 0\//);
  assert.ok(line0.includes(LANDMARKS[0].hint));

  const all = new Set(LANDMARKS.map((l) => l.id));
  const done = objectiveLine(all);
  assert.match(done, /TOUR COMPLETE/);
  assert.match(done, /minotaur/);
});

test('questSummary exposes found/total/complete/line/lastLabel', () => {
  const seen = new Set(['pulse']);
  const s = questSummary(seen, 'pulse');
  assert.equal(s.found, 1);
  assert.equal(s.total, LANDMARK_COUNT);
  assert.equal(s.complete, false);
  assert.equal(s.lastLabel, byId('pulse').label);
  assert.equal(typeof s.line, 'string');

  // no lastFoundId → null label
  assert.equal(questSummary(seen).lastLabel, null);
});

test('discoverAt never allocates a result object (returns id string or null)', () => {
  const seen = new Set();
  const r = discoverAt(byId('gridlock').x, byId('gridlock').z, seen);
  assert.equal(typeof r, 'string');
});
