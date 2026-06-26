// node --test src/arcade/games/__tests__/pulseEngine.test.mjs
//
// Pure-logic tests for the M3 rhythm cabinet "PULSE". No DOM, React, or
// WebAudio — built-in node test runner (Node v26). NOT part of build-guard
// (can't edit package.json); run manually with an EXPLICIT file path (running
// the __tests__ DIR fails spuriously — node treats the dir as a test).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  clamp,
  makeRng,
  judge,
  isMissed,
  JUDGE_WINDOWS,
  scoreForJudgment,
  comboMultiplier,
  initialPlayState,
  applyJudgment,
  nextHealth,
  HEALTH,
  generateChart,
  reverseChart,
  chartEndMs,
  pickHit,
  noteProgress,
  laneIndexForX,
  stageConfig,
  LANES,
} from '../pulseEngine.js';

test('clamp bounds a value to [lo, hi]', () => {
  assert.equal(clamp(5, 0, 10), 5);
  assert.equal(clamp(-3, 0, 10), 0);
  assert.equal(clamp(99, 0, 10), 10);
});

test('makeRng is deterministic and stays in [0, 1)', () => {
  const a = makeRng(42);
  const b = makeRng(42);
  for (let i = 0; i < 100; i++) {
    const x = a();
    assert.equal(x, b()); // same seed -> identical stream
    assert.ok(x >= 0 && x < 1, `rng out of range: ${x}`);
  }
  // different seeds diverge
  assert.notEqual(makeRng(1)(), makeRng(2)());
});

test('judge classifies by absolute timing delta and is symmetric', () => {
  assert.equal(judge(0), 'PERFECT');
  assert.equal(judge(45), 'PERFECT');
  assert.equal(judge(-45), 'PERFECT'); // symmetric (early)
  assert.equal(judge(46), 'GREAT');
  assert.equal(judge(105), 'GREAT');
  assert.equal(judge(-105), 'GREAT');
  assert.equal(judge(106), null); // outside the window -> hit nothing
  assert.equal(judge(500), null);
});

test('isMissed only fires once a note passes the GREAT window late', () => {
  const note = { id: 0, time: 1000, lane: 0 };
  assert.equal(isMissed(note, 1000), false);
  assert.equal(isMissed(note, 1000 + JUDGE_WINDOWS.greatMs), false); // boundary still hittable
  assert.equal(isMissed(note, 1000 + JUDGE_WINDOWS.greatMs + 1), true);
  assert.equal(isMissed(note, 500), false); // early notes are never "missed"
});

test('scoring + combo multiplier tiers', () => {
  assert.equal(scoreForJudgment('PERFECT'), 300);
  assert.equal(scoreForJudgment('GREAT'), 100);
  assert.equal(scoreForJudgment('MISS'), 0);
  assert.equal(comboMultiplier(0), 1);
  assert.equal(comboMultiplier(9), 1);
  assert.equal(comboMultiplier(10), 1.5);
  assert.equal(comboMultiplier(20), 2);
  assert.equal(comboMultiplier(50), 3);
  assert.equal(comboMultiplier(100), 4);
});

test('applyJudgment accumulates score, grows combo, and resets on MISS', () => {
  let s = initialPlayState();
  assert.equal(s.score, 0);
  s = applyJudgment(s, 'PERFECT'); // combo 1, mult 1 -> +300
  assert.equal(s.score, 300);
  assert.equal(s.combo, 1);
  assert.equal(s.counts.PERFECT, 1);
  s = applyJudgment(s, 'GREAT'); // combo 2 -> +100
  assert.equal(s.score, 400);
  assert.equal(s.combo, 2);
  s = applyJudgment(s, 'MISS'); // combo resets, +0
  assert.equal(s.score, 400);
  assert.equal(s.combo, 0);
  assert.equal(s.maxCombo, 2); // max retained across the miss
  assert.equal(s.counts.MISS, 1);
});

test('applyJudgment applies the combo multiplier on tier boundaries', () => {
  let s = initialPlayState();
  for (let i = 0; i < 9; i++) s = applyJudgment(s, 'PERFECT'); // combos 1..9, mult 1
  assert.equal(s.score, 9 * 300);
  s = applyJudgment(s, 'PERFECT'); // 10th note -> mult 1.5 -> +450
  assert.equal(s.combo, 10);
  assert.equal(s.score, 9 * 300 + 450);
});

test('nextHealth drains on miss, heals on hits, clamps to [0, max]', () => {
  assert.equal(nextHealth(HEALTH.max, 'PERFECT'), HEALTH.max); // already full, clamps
  assert.equal(nextHealth(50, 'MISS'), 50 - HEALTH.missDrain);
  assert.equal(nextHealth(50, 'GREAT'), 50 + HEALTH.greatGain);
  assert.equal(nextHealth(3, 'MISS'), 0); // floor at 0 -> death condition
  assert.equal(nextHealth(0, 'MISS'), 0);
});

test('generateChart is deterministic, sorted, valid lanes, and ramps density', () => {
  const a = generateChart({ seed: 7, durationMs: 60000, bpm: 124 });
  const b = generateChart({ seed: 7, durationMs: 60000, bpm: 124 });
  assert.deepEqual(a, b); // same seed -> identical chart
  assert.ok(a.length > 10, `expected a populated chart, got ${a.length}`);
  // sorted ascending by time + lanes within range + ids unique
  const ids = new Set();
  for (let i = 0; i < a.length; i++) {
    const n = a[i];
    assert.ok(n.lane >= 0 && n.lane < LANES, `bad lane ${n.lane}`);
    assert.ok(!ids.has(n.id), `dup id ${n.id}`);
    ids.add(n.id);
    if (i > 0) assert.ok(a[i].time >= a[i - 1].time, 'chart not sorted by time');
  }
  // density ramp: more notes in the back half than the front half
  const mid = 30000;
  const front = a.filter((n) => n.time < mid).length;
  const back = a.filter((n) => n.time >= mid).length;
  assert.ok(back >= front, `expected density to ramp: front=${front} back=${back}`);
});

test('generateChart places notes on the beat grid (so they hit the metronome)', () => {
  const bpm = 124;
  const beatMs = 60000 / bpm;
  const chart = generateChart({ seed: 5, bpm, durationMs: 60000, leadInMs: 2000 });
  for (const n of chart) {
    // each note time rounds a multiple of beatMs OR a half-beat (stream notes)
    const beats = n.time / beatMs;
    const nearestHalf = Math.round(beats * 2) / 2;
    assert.ok(
      Math.abs(beats - nearestHalf) < 0.02,
      `note ${n.time}ms is ${beats.toFixed(3)} beats — not on the beat/half-beat grid`,
    );
    assert.ok(n.time >= 2000, `note ${n.time}ms placed before the 2000ms lead-in`);
  }
});

test('reverseChart mirrors time, optionally flips lanes, re-ids, and re-sorts', () => {
  const fwd = generateChart({ seed: 3, durationMs: 40000, bpm: 120 });
  const dur = 40000;
  const rev = reverseChart(fwd, dur);
  assert.equal(rev.length, fwd.length);
  // sorted + every reversed time equals dur - some forward time
  const fwdTimes = new Set(fwd.map((n) => n.time));
  for (let i = 0; i < rev.length; i++) {
    if (i > 0) assert.ok(rev[i].time >= rev[i - 1].time, 'reversed chart not sorted');
    assert.ok(fwdTimes.has(dur - rev[i].time), 'reversed time has no forward source');
    assert.equal(rev[i].id, i); // re-ided 0..n-1
  }
  // mirror flips lane l -> 3 - l
  const mir = reverseChart(fwd, dur, { mirror: true });
  const fwdByTime = new Map(fwd.map((n) => [n.time, n.lane]));
  for (const n of mir) {
    const srcLane = fwdByTime.get(dur - n.time);
    assert.equal(n.lane, LANES - 1 - srcLane);
  }
});

test('reverseChart leadInMs shifts the encore later so opening notes stay reactable', () => {
  const fwd = generateChart({ seed: 9, durationMs: 40000, bpm: 120, leadInMs: 2000 });
  const dur = 40000;
  const lead = 2000;
  const plain = reverseChart(fwd, dur);
  const lifted = reverseChart(fwd, dur, { leadInMs: lead });
  // every lifted note is exactly leadInMs later than its plain counterpart
  for (let i = 0; i < plain.length; i++) {
    assert.equal(lifted[i].time, plain[i].time + lead);
  }
  // the earliest reversed note (the forward chart's LAST note) is now well past
  // the start instead of arriving in the first frames.
  const firstPlain = Math.min(...plain.map((n) => n.time));
  const firstLifted = Math.min(...lifted.map((n) => n.time));
  assert.equal(firstLifted, firstPlain + lead);
  assert.ok(firstLifted >= lead, 'first reversed note should sit at/after the lead-in');
});

test('chartEndMs returns the latest note time', () => {
  assert.equal(chartEndMs([{ time: 10 }, { time: 99 }, { time: 50 }]), 99);
  assert.equal(chartEndMs([]), 0);
});

test('pickHit selects the nearest unconsumed in-window note in the lane', () => {
  const notes = [
    { id: 'a', time: 1000, lane: 0 },
    { id: 'b', time: 1040, lane: 0 }, // closer to now=1050
    { id: 'c', time: 1000, lane: 1 }, // wrong lane
  ];
  const sel = pickHit(notes, 0, 1050, JUDGE_WINDOWS, () => false);
  assert.equal(sel.note.id, 'b');
  assert.equal(sel.delta, 10);
  // consumed notes are skipped -> falls back to 'a'
  const sel2 = pickHit(notes, 0, 1050, JUDGE_WINDOWS, (id) => id === 'b');
  assert.equal(sel2.note.id, 'a');
  // nothing within the window -> null
  assert.equal(pickHit(notes, 0, 5000, JUDGE_WINDOWS, () => false), null);
  // wrong lane only -> null
  assert.equal(pickHit(notes, 2, 1000, JUDGE_WINDOWS, () => false), null);
});

test('noteProgress is 0 at spawn, 1 at the hit line, >1 past it', () => {
  // approachMs = 1000; note at t=2000
  assert.equal(noteProgress(2000, 1000, 1000), 0); // spawns 1000ms before
  assert.equal(noteProgress(2000, 2000, 1000), 1); // at the line
  assert.equal(noteProgress(2000, 2500, 1000), 1.5); // passed
  assert.ok(noteProgress(2000, 1500, 1000) > 0 && noteProgress(2000, 1500, 1000) < 1);
});

test('laneIndexForX maps x to a lane or -1 outside the band', () => {
  // band starts at x=100, each lane 50px wide, 4 lanes -> [100, 300)
  assert.equal(laneIndexForX(100, 100, 50, 4), 0);
  assert.equal(laneIndexForX(149, 100, 50, 4), 0);
  assert.equal(laneIndexForX(150, 100, 50, 4), 1);
  assert.equal(laneIndexForX(299, 100, 50, 4), 3);
  assert.equal(laneIndexForX(300, 100, 50, 4), -1); // just past the band
  assert.equal(laneIndexForX(99, 100, 50, 4), -1); // just before
  assert.equal(laneIndexForX(200, 100, 0, 4), -1); // degenerate width
});

test('stageConfig: forward, encore, then escalating reversed loop', () => {
  const s0 = stageConfig(0, 3);
  assert.equal(s0.reversed, false);
  assert.equal(s0.songIndex, 0);
  assert.equal(s0.bpmScale, 1);

  const s1 = stageConfig(1, 3);
  assert.equal(s1.reversed, true); // encore = same track reversed
  assert.equal(s1.songIndex, 0);
  assert.ok(s1.bpmScale > 1);

  assert.equal(stageConfig(2, 3).songIndex, 1); // track 2 reversed
  assert.equal(stageConfig(3, 3).songIndex, 2); // track 3 reversed
  assert.equal(stageConfig(4, 3).songIndex, 0); // loops back to track 1
  assert.equal(stageConfig(4, 3).mirror, true); // second pass mirrors
  // BPM keeps escalating with stage
  assert.ok(stageConfig(6, 3).bpmScale > stageConfig(3, 3).bpmScale);
  // single-song safety: never divides by zero / out of range
  const solo = stageConfig(5, 1);
  assert.equal(solo.songIndex, 0);
});
