import { r as reactExports, w as jsxRuntimeExports } from "./index-DcHYFhnp.js";
import { i as isCoarsePointer, A as ASSET_SLOTS } from "./index-Cm8oW7Mh.js";
function createPulseAudio() {
  let ctx = null;
  try {
    const AC = typeof window !== "undefined" && (window.AudioContext || window.webkitAudioContext);
    if (AC) ctx = new AC();
  } catch {
    ctx = null;
  }
  let master = null;
  if (ctx) {
    master = ctx.createGain();
    master.gain.value = 0.55;
    master.connect(ctx.destination);
  }
  let source = null;
  let trackGain = null;
  let schedulerId = 0;
  let nextBeatTime = 0;
  let beatSec = 0.5;
  let startCtxTime = 0;
  let running = false;
  const reversedCache = typeof WeakMap !== "undefined" ? /* @__PURE__ */ new WeakMap() : null;
  function resume() {
    if (ctx && ctx.state === "suspended") {
      try {
        const p = ctx.resume();
        if (p && typeof p.catch === "function") p.catch(() => {
        });
      } catch {
      }
    }
  }
  async function loadBuffer(url) {
    if (!ctx || !url || typeof fetch === "undefined") return null;
    try {
      const res = await fetch(url);
      if (!res.ok) return null;
      const arr = await res.arrayBuffer();
      return await ctx.decodeAudioData(arr);
    } catch {
      return null;
    }
  }
  function reverseBuffer(buffer) {
    if (!ctx || !buffer) return buffer;
    if (reversedCache && reversedCache.has(buffer)) return reversedCache.get(buffer);
    try {
      const out = ctx.createBuffer(buffer.numberOfChannels, buffer.length, buffer.sampleRate);
      for (let c = 0; c < buffer.numberOfChannels; c++) {
        const src = buffer.getChannelData(c);
        const dst = out.getChannelData(c);
        for (let i = 0, n = src.length; i < n; i++) dst[i] = src[n - 1 - i];
      }
      if (reversedCache) reversedCache.set(buffer, out);
      return out;
    } catch {
      return buffer;
    }
  }
  function scheduleClick(time, accent, reversed) {
    if (!ctx || !master) return;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = reversed ? "sawtooth" : "square";
    const base = reversed ? 320 : 440;
    osc.frequency.setValueAtTime(accent ? base * 2 : base, time);
    if (reversed) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(80, (accent ? base * 2 : base) * 0.6), time + 0.08);
    }
    const peak = accent ? 0.26 : 0.13;
    g.gain.setValueAtTime(1e-4, time);
    g.gain.exponentialRampToValueAtTime(peak, time + 5e-3);
    g.gain.exponentialRampToValueAtTime(1e-4, time + 0.1);
    osc.connect(g);
    g.connect(master);
    osc.start(time);
    osc.stop(time + 0.12);
  }
  function tickScheduler(reversed) {
    if (!ctx) return;
    const ahead = ctx.currentTime + 0.14;
    let guard = 0;
    while (nextBeatTime < ahead && guard < 64) {
      const beatIndex = Math.round((nextBeatTime - startCtxTime) / beatSec);
      scheduleClick(nextBeatTime, beatIndex % 4 === 0, reversed);
      nextBeatTime += beatSec;
      guard++;
    }
  }
  function start({ buffer = null, bpm = 124, reversed = false, rate = 1 } = {}) {
    stop();
    resume();
    beatSec = 60 / Math.max(1, bpm);
    running = true;
    if (!ctx || !master) return;
    startCtxTime = ctx.currentTime + 0.06;
    if (buffer) {
      try {
        source = ctx.createBufferSource();
        source.buffer = reversed ? reverseBuffer(buffer) : buffer;
        if (source.playbackRate && rate && rate !== 1) source.playbackRate.value = rate;
        trackGain = ctx.createGain();
        trackGain.gain.value = 0.85;
        source.connect(trackGain);
        trackGain.connect(master);
        source.start(startCtxTime);
      } catch {
        source = null;
      }
    } else {
      nextBeatTime = startCtxTime;
      tickScheduler(reversed);
      schedulerId = setInterval(() => tickScheduler(reversed), 25);
    }
  }
  function playBlip(judgment) {
    if (!ctx || !master) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    if (judgment === "PERFECT") {
      osc.type = "triangle";
      osc.frequency.setValueAtTime(1320, now);
    } else if (judgment === "GREAT") {
      osc.type = "triangle";
      osc.frequency.setValueAtTime(880, now);
    } else {
      osc.type = "sine";
      osc.frequency.setValueAtTime(150, now);
      osc.frequency.exponentialRampToValueAtTime(70, now + 0.12);
    }
    const peak = judgment === "MISS" ? 0.22 : 0.16;
    g.gain.setValueAtTime(1e-4, now);
    g.gain.exponentialRampToValueAtTime(peak, now + 5e-3);
    g.gain.exponentialRampToValueAtTime(1e-4, now + (judgment === "MISS" ? 0.16 : 0.1));
    osc.connect(g);
    g.connect(master);
    osc.start(now);
    osc.stop(now + 0.2);
  }
  function stop() {
    running = false;
    if (schedulerId) {
      clearInterval(schedulerId);
      schedulerId = 0;
    }
    if (source) {
      try {
        source.stop();
      } catch {
      }
      try {
        source.disconnect();
      } catch {
      }
      source = null;
    }
    if (trackGain) {
      try {
        trackGain.disconnect();
      } catch {
      }
      trackGain = null;
    }
  }
  function dispose() {
    stop();
    if (ctx) {
      try {
        const p = ctx.close();
        if (p && typeof p.catch === "function") p.catch(() => {
        });
      } catch {
      }
      ctx = null;
      master = null;
    }
  }
  return {
    get available() {
      return !!ctx;
    },
    isRunning() {
      return running;
    },
    resume,
    loadBuffer,
    reverseBuffer,
    start,
    playBlip,
    stop,
    dispose
  };
}
const LANES = 4;
function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}
function makeRng(seed) {
  let a = seed >>> 0;
  return function rng() {
    a |= 0;
    a = a + 1831565813 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
const JUDGE_WINDOWS = { perfectMs: 45, greatMs: 105 };
function judge(deltaMs, windows = JUDGE_WINDOWS) {
  const d = Math.abs(deltaMs);
  if (d <= windows.perfectMs) return "PERFECT";
  if (d <= windows.greatMs) return "GREAT";
  return null;
}
const SCORE = { PERFECT: 300, GREAT: 100, MISS: 0 };
function scoreForJudgment(j) {
  return SCORE[j] || 0;
}
function comboMultiplier(combo) {
  if (combo >= 100) return 4;
  if (combo >= 50) return 3;
  if (combo >= 20) return 2;
  if (combo >= 10) return 1.5;
  return 1;
}
function initialPlayState() {
  return {
    score: 0,
    combo: 0,
    maxCombo: 0,
    counts: { PERFECT: 0, GREAT: 0, MISS: 0 },
    lastJudgment: null,
    gained: 0
  };
}
function applyJudgment(state, j) {
  const combo = j === "MISS" ? 0 : state.combo + 1;
  const mult = comboMultiplier(combo);
  const gained = Math.round(scoreForJudgment(j) * mult);
  return {
    score: state.score + gained,
    combo,
    maxCombo: Math.max(state.maxCombo, combo),
    counts: { ...state.counts, [j]: (state.counts[j] || 0) + 1 },
    lastJudgment: j,
    gained
  };
}
const HEALTH = { max: 100, start: 70, missDrain: 9, perfectGain: 1.5, greatGain: 0.75 };
function nextHealth(health, j, cfg = HEALTH) {
  let delta = 0;
  if (j === "MISS") delta = -cfg.missDrain;
  else if (j === "PERFECT") delta = cfg.perfectGain;
  else if (j === "GREAT") delta = cfg.greatGain;
  return clamp(health + delta, 0, cfg.max);
}
function generateChart({
  bpm = 124,
  durationMs = 6e4,
  seed = 1,
  lanes = LANES,
  leadInMs = 2e3
} = {}) {
  const rng = makeRng(seed);
  const beatMs = 6e4 / Math.max(1, bpm);
  const notes = [];
  let id = 0;
  let lastLane = -1;
  for (let t = 0; t < durationMs - beatMs; t += beatMs) {
    if (t < leadInMs) continue;
    const span = Math.max(1, durationMs - leadInMs);
    const progress = clamp((t - leadInMs) / span, 0, 1);
    const placeChance = 0.62 + 0.3 * progress;
    if (rng() < placeChance) {
      let lane = Math.floor(rng() * lanes) % lanes;
      if (lane === lastLane && rng() < 0.5) lane = (lane + 1) % lanes;
      notes.push({ id: id++, time: Math.round(t), lane });
      lastLane = lane;
      if (progress > 0.4 && rng() < 0.32 * progress) {
        const lane2 = Math.floor(rng() * lanes) % lanes;
        notes.push({ id: id++, time: Math.round(t + beatMs / 2), lane: lane2 });
      }
    }
  }
  notes.sort((a, b) => a.time - b.time);
  return notes;
}
function reverseChart(notes, durationMs, { mirror = false, lanes = LANES, leadInMs = 0 } = {}) {
  const mapLane = mirror ? (l) => lanes - 1 - l : (l) => l;
  const out = notes.map((n) => ({
    id: -1,
    time: durationMs - n.time + leadInMs,
    lane: mapLane(n.lane)
  }));
  out.sort((a, b) => a.time - b.time);
  out.forEach((n, i) => {
    n.id = i;
  });
  return out;
}
function chartEndMs(notes) {
  let end = 0;
  for (const n of notes) if (n.time > end) end = n.time;
  return end;
}
function pickHit(notes, lane, nowMs, windows = JUDGE_WINDOWS, isConsumed = () => false) {
  let best = null;
  let bestAbs = Infinity;
  for (const n of notes) {
    if (n.lane !== lane) continue;
    if (isConsumed(n.id)) continue;
    const delta = nowMs - n.time;
    const ad = Math.abs(delta);
    if (ad <= windows.greatMs && ad < bestAbs) {
      bestAbs = ad;
      best = n;
    }
  }
  return best ? { note: best, delta: nowMs - best.time } : null;
}
function noteProgress(noteTime, nowMs, approachMs) {
  const a = approachMs;
  return 1 - (noteTime - nowMs) / a;
}
function laneIndexForX(x, bandLeft, laneW, lanes = LANES) {
  if (laneW <= 0) return -1;
  const rel = x - bandLeft;
  if (rel < 0 || rel >= laneW * lanes) return -1;
  return clamp(Math.floor(rel / laneW), 0, lanes - 1);
}
function stageConfig(stage, songCount = 3) {
  const count = Math.max(1, songCount);
  if (stage <= 0) {
    return { songIndex: 0, reversed: false, mirror: false, bpmScale: 1, label: "TRACK 01" };
  }
  if (stage === 1) {
    return { songIndex: 0, reversed: true, mirror: false, bpmScale: 1.05, label: "ENCORE · TRACK 01 ◄" };
  }
  const songIndex = (stage - 1) % count;
  const cycle = Math.floor((stage - 1) / count);
  const mirror = cycle % 2 === 1;
  const bpmScale = 1 + 0.05 * stage;
  const tag = cycle > 0 ? ` ×${cycle + 1}` : "";
  return {
    songIndex,
    reversed: true,
    mirror,
    bpmScale,
    label: `TRACK 0${songIndex + 1} ◄${tag}`
  };
}
const BASE_BPM = 124;
const STAGE_DURATION_MS = 6e4;
const APPROACH_MS = 1500;
const LEAD_IN_MS = 2e3;
const END_TAIL_MS = 2200;
const SONG_COUNT = 3;
const LANE_KEY = { ArrowLeft: 0, ArrowDown: 1, ArrowUp: 2, ArrowRight: 3 };
const LANE_COLOR = ["#ff5cf4", "#36d6ff", "#36ff9e", "#ffd23b"];
const JUDGE_COLOR = { PERFECT: "#36ff9e", GREAT: "#36d6ff", MISS: "#ff3b6b" };
const ARROW_ROT = [-Math.PI / 2, Math.PI, 0, Math.PI / 2];
function perfNow() {
  return typeof performance !== "undefined" ? performance.now() : 0;
}
function usePrefersReducedMotion() {
  const [reduced, setReduced] = reactExports.useState(false);
  reactExports.useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return void 0;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const onChange = (e) => setReduced(e.matches);
    if (mq.addEventListener) mq.addEventListener("change", onChange);
    else if (mq.addListener) mq.addListener(onChange);
    return () => {
      if (mq.removeEventListener) mq.removeEventListener("change", onChange);
      else if (mq.removeListener) mq.removeListener(onChange);
    };
  }, []);
  return reduced;
}
function PulseGame({ onExit }) {
  const reducedMotion = usePrefersReducedMotion();
  const [coarse] = reactExports.useState(() => isCoarsePointer());
  const [over, setOver] = reactExports.useState(null);
  const canvasRef = reactExports.useRef(null);
  const rootRef = reactExports.useRef(null);
  const audioRef = reactExports.useRef(null);
  const rafRef = reactExports.useRef(0);
  const startPerfRef = reactExports.useRef(0);
  const mountedRef = reactExports.useRef(true);
  const reducedRef = reactExports.useRef(reducedMotion);
  const onExitRef = reactExports.useRef(onExit);
  const startStageRef = reactExports.useRef(null);
  const chartCacheRef = reactExports.useRef(/* @__PURE__ */ new Map());
  const bufferCacheRef = reactExports.useRef(/* @__PURE__ */ new Map());
  const gRef = reactExports.useRef(null);
  if (gRef.current === null) {
    gRef.current = {
      stage: 0,
      cfg: null,
      chart: [],
      endMs: 0,
      consumed: /* @__PURE__ */ new Set(),
      missCursor: 0,
      play: initialPlayState(),
      health: HEALTH.start,
      status: "booting",
      // booting | loading | playing | clearing | over
      judgeFx: { text: "", color: "", at: 0 },
      laneFlashAt: [0, 0, 0, 0],
      laneFlashStrong: [false, false, false, false],
      bannerText: "",
      bannerUntil: 0,
      // cached HUD strings (rebuilt only when the underlying value changes, so
      // draw() allocates no value strings per frame).
      _scoreVal: -1,
      _scoreStr: "",
      _cP: -1,
      _cG: -1,
      _cM: -1,
      _countsStr: "",
      _comboVal: -1,
      _comboStr: "",
      _multVal: -1,
      _multStr: ""
    };
  }
  reactExports.useEffect(() => {
    reducedRef.current = reducedMotion;
  }, [reducedMotion]);
  reactExports.useEffect(() => {
    onExitRef.current = onExit;
  }, [onExit]);
  const restart = reactExports.useCallback(() => {
    const g = gRef.current;
    g.play = initialPlayState();
    g.health = HEALTH.start;
    g.consumed = /* @__PURE__ */ new Set();
    g.missCursor = 0;
    g.judgeFx = { text: "", color: "", at: 0 };
    g.status = "loading";
    setOver(null);
    if (startStageRef.current) startStageRef.current(0);
  }, []);
  reactExports.useEffect(() => {
    mountedRef.current = true;
    const canvas = canvasRef.current;
    const ctx = canvas ? canvas.getContext("2d") : null;
    const audio = createPulseAudio();
    audioRef.current = audio;
    try {
      const el = rootRef.current;
      if (el && el.requestFullscreen) {
        const p = el.requestFullscreen();
        if (p && typeof p.catch === "function") p.catch(() => {
        });
      }
    } catch {
    }
    let W = 0;
    let H = 0;
    let baseGrad = null;
    const layout = {
      bandLeft: 0,
      laneW: 0,
      topY: 0,
      hitY: 0,
      laneX: [0, 0, 0, 0],
      arrowSize: 18,
      comboSize: 34,
      judgeFont: "",
      comboFont: "",
      bannerFont: ""
    };
    const resize = () => {
      if (!canvas) return;
      const dpr = Math.min(typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1, 1.5);
      W = window.innerWidth;
      H = window.innerHeight;
      canvas.width = Math.floor(W * dpr);
      canvas.height = Math.floor(H * dpr);
      canvas.style.width = "100%";
      canvas.style.height = "100%";
      if (ctx) {
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        baseGrad = ctx.createLinearGradient(0, 0, 0, H);
        baseGrad.addColorStop(0, "#0a0220");
        baseGrad.addColorStop(0.6, "#070015");
        baseGrad.addColorStop(1, "#03000c");
      }
      const laneW = Math.min(120, Math.max(58, W * 0.15));
      const bandW = laneW * LANES;
      layout.laneW = laneW;
      layout.bandLeft = (W - bandW) / 2;
      layout.topY = H * 0.06;
      layout.hitY = H * 0.8;
      for (let i = 0; i < LANES; i++) layout.laneX[i] = layout.bandLeft + laneW * (i + 0.5);
      layout.arrowSize = Math.max(16, laneW * 0.3);
      layout.comboSize = Math.max(34, laneW * 0.6);
      layout.judgeFont = `800 ${Math.max(26, laneW * 0.38)}px 'Courier New', monospace`;
      layout.comboFont = `800 ${layout.comboSize}px 'Courier New', monospace`;
      layout.bannerFont = `800 ${Math.max(26, Math.min(54, W * 0.05))}px 'Courier New', monospace`;
    };
    resize();
    window.addEventListener("resize", resize);
    async function loadOrGenChart(songIndex, durationMs) {
      const cache = chartCacheRef.current;
      if (cache.has(songIndex)) return cache.get(songIndex);
      let chart = null;
      const url = ASSET_SLOTS.charts && ASSET_SLOTS.charts[songIndex];
      if (url && typeof fetch !== "undefined") {
        try {
          const res = await fetch(url);
          if (res.ok) {
            const data = await res.json();
            const notes = Array.isArray(data) ? data : data && data.notes;
            if (Array.isArray(notes) && notes.length) {
              chart = notes.filter((n) => n && typeof n.time === "number" && typeof n.lane === "number").map((n, i) => ({ id: i, time: Math.round(n.time), lane: (n.lane % LANES + LANES) % LANES })).sort((a, b) => a.time - b.time);
              if (!chart.length) chart = null;
            }
          }
        } catch {
          chart = null;
        }
      }
      if (!chart) {
        chart = generateChart({
          seed: songIndex + 1,
          bpm: BASE_BPM,
          durationMs,
          leadInMs: LEAD_IN_MS
        });
      }
      cache.set(songIndex, chart);
      return chart;
    }
    async function getBuffer(songIndex) {
      const cache = bufferCacheRef.current;
      if (cache.has(songIndex)) return cache.get(songIndex);
      const url = ASSET_SLOTS.audio.rhythm && ASSET_SLOTS.audio.rhythm[songIndex];
      const buf = await audio.loadBuffer(url);
      cache.set(songIndex, buf);
      return buf;
    }
    async function startStage(stage) {
      const g = gRef.current;
      g.status = "loading";
      audio.stop();
      const cfg = stageConfig(stage, SONG_COUNT);
      const scale = cfg.bpmScale;
      const buffer = await getBuffer(cfg.songIndex);
      const durationMs = buffer ? Math.round(buffer.duration * 1e3) : STAGE_DURATION_MS;
      const canonical = await loadOrGenChart(cfg.songIndex, durationMs);
      let chart = cfg.reversed ? reverseChart(canonical, durationMs, { mirror: cfg.mirror, leadInMs: LEAD_IN_MS }) : canonical.map((n) => ({ ...n }));
      if (scale !== 1) chart = chart.map((n) => ({ ...n, time: Math.round(n.time / scale) }));
      if (!mountedRef.current) return;
      g.stage = stage;
      g.cfg = cfg;
      g.chart = chart;
      g.endMs = chartEndMs(chart);
      g.consumed = /* @__PURE__ */ new Set();
      g.missCursor = 0;
      g.bannerText = stage === 0 ? `PULSE · ${cfg.label}` : cfg.label;
      g.bannerUntil = perfNow() + 2600;
      g.status = "playing";
      startPerfRef.current = perfNow();
      audio.start({ buffer, bpm: Math.round(BASE_BPM * scale), reversed: cfg.reversed, rate: scale });
    }
    startStageRef.current = startStage;
    function registerHit(lane) {
      const g = gRef.current;
      audio.resume();
      if (g.status !== "playing") return;
      const now = perfNow() - startPerfRef.current;
      const sel = pickHit(g.chart, lane, now, JUDGE_WINDOWS, (id) => g.consumed.has(id));
      g.laneFlashAt[lane] = perfNow();
      if (sel) {
        const j = judge(sel.delta) || "GREAT";
        g.consumed.add(sel.note.id);
        g.play = applyJudgment(g.play, j);
        g.health = nextHealth(g.health, j);
        g.judgeFx = { text: j, color: JUDGE_COLOR[j], at: perfNow() };
        g.laneFlashStrong[lane] = true;
        audio.playBlip(j);
        if (g.health <= 0) endRun("downed");
      } else {
        g.laneFlashStrong[lane] = false;
      }
    }
    function endRun(reason) {
      const g = gRef.current;
      if (g.status === "over") return;
      g.status = "over";
      audio.stop();
      setOver({
        score: g.play.score,
        maxCombo: g.play.maxCombo,
        counts: { ...g.play.counts },
        stage: g.stage,
        reason
      });
    }
    const onKeyDown = (e) => {
      const lane = LANE_KEY[e.code];
      if (lane === void 0) return;
      e.preventDefault();
      e.stopPropagation();
      if (e.repeat) return;
      registerHit(lane);
    };
    const onPointerDown = (e) => {
      const g = gRef.current;
      if (g.status !== "playing") return;
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const lane = laneIndexForX(x, layout.bandLeft, layout.laneW, LANES);
      if (lane >= 0) {
        e.preventDefault();
        registerHit(lane);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    if (canvas) canvas.addEventListener("pointerdown", onPointerDown);
    function drawArrow(x, y, s, dir, fill, alpha, glow) {
      const rot = ARROW_ROT[dir];
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(rot);
      ctx.globalAlpha = alpha;
      if (glow > 0) {
        ctx.shadowColor = fill;
        ctx.shadowBlur = glow;
      }
      ctx.fillStyle = fill;
      ctx.beginPath();
      ctx.moveTo(0, -s);
      ctx.lineTo(s * 0.82, s * 0.18);
      ctx.lineTo(s * 0.32, s * 0.18);
      ctx.lineTo(s * 0.32, s * 0.82);
      ctx.lineTo(-s * 0.32, s * 0.82);
      ctx.lineTo(-s * 0.32, s * 0.18);
      ctx.lineTo(-s * 0.82, s * 0.18);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    function draw() {
      if (!ctx) return;
      const g = gRef.current;
      if (g.status === "over") return;
      const reduced = reducedRef.current;
      const tNow = perfNow();
      const clock = perfNow() - startPerfRef.current;
      const arrowSize = layout.arrowSize;
      ctx.fillStyle = baseGrad || "#05010f";
      ctx.fillRect(0, 0, W, H);
      for (let i = 0; i < LANES; i++) {
        const cx = layout.laneX[i];
        const col = LANE_COLOR[i];
        ctx.save();
        ctx.globalAlpha = 0.07;
        ctx.fillStyle = col;
        ctx.fillRect(cx - layout.laneW / 2 + 2, layout.topY, layout.laneW - 4, layout.hitY - layout.topY + 40);
        ctx.restore();
        ctx.strokeStyle = "rgba(120,150,220,0.12)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(cx - layout.laneW / 2, layout.topY);
        ctx.lineTo(cx - layout.laneW / 2, layout.hitY + 40);
        ctx.stroke();
      }
      ctx.save();
      ctx.strokeStyle = "rgba(230,240,255,0.6)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(layout.bandLeft - 6, layout.hitY);
      ctx.lineTo(layout.bandLeft + layout.laneW * LANES + 6, layout.hitY);
      ctx.stroke();
      ctx.restore();
      for (let i = 0; i < LANES; i++) {
        const cx = layout.laneX[i];
        const age = tNow - g.laneFlashAt[i];
        const flashing = age >= 0 && age < (reduced ? 120 : 220);
        let alpha = 0.34;
        let glow = 0;
        if (flashing) {
          const k = 1 - age / (reduced ? 120 : 220);
          if (g.laneFlashStrong[i]) {
            alpha = reduced ? 0.34 + 0.12 * k : 0.34 + 0.66 * k;
            glow = reduced ? 0 : 18 * k;
          } else {
            alpha = 0.34 + (reduced ? 0.08 : 0.25) * k;
          }
        }
        drawArrow(cx, layout.hitY, arrowSize, i, LANE_COLOR[i], alpha, glow);
      }
      if (g.status === "playing" || g.status === "clearing") {
        for (let n = 0; n < g.chart.length; n++) {
          const note = g.chart[n];
          const p = noteProgress(note.time, clock, APPROACH_MS);
          if (p < -0.06) break;
          if (p > 1.18 || g.consumed.has(note.id)) continue;
          const y = layout.topY + p * (layout.hitY - layout.topY);
          const cx = layout.laneX[note.lane];
          const near = reduced ? 0.9 : 0.55 + 0.45 * Math.max(0, Math.min(1, p));
          const glow = reduced ? 0 : 10 * Math.max(0, Math.min(1, p));
          drawArrow(cx, y, arrowSize, note.lane, LANE_COLOR[note.lane], near, glow);
        }
      }
      if (g.play.score !== g._scoreVal) {
        g._scoreVal = g.play.score;
        g._scoreStr = `SCORE ${String(g.play.score).padStart(7, "0")}`;
      }
      const counts = g.play.counts;
      if (counts.PERFECT !== g._cP || counts.GREAT !== g._cG || counts.MISS !== g._cM) {
        g._cP = counts.PERFECT;
        g._cG = counts.GREAT;
        g._cM = counts.MISS;
        g._countsStr = `P ${counts.PERFECT}  G ${counts.GREAT}  M ${counts.MISS}`;
      }
      const jAge = tNow - g.judgeFx.at;
      if (g.judgeFx.at && g.judgeFx.text && jAge < 480) {
        const k = 1 - jAge / 480;
        const rise = reduced ? 0 : (1 - k) * 26;
        ctx.save();
        ctx.globalAlpha = Math.max(0, k);
        ctx.fillStyle = g.judgeFx.color;
        ctx.font = layout.judgeFont;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        if (!reduced) {
          ctx.shadowColor = g.judgeFx.color;
          ctx.shadowBlur = 18;
        }
        ctx.fillText(g.judgeFx.text, W / 2, layout.hitY - 90 - rise);
        ctx.restore();
      }
      if (g.play.combo >= 2) {
        if (g.play.combo !== g._comboVal) {
          g._comboVal = g.play.combo;
          g._comboStr = String(g.play.combo);
        }
        const mult = comboMultiplier(g.play.combo);
        if (mult !== g._multVal) {
          g._multVal = mult;
          g._multStr = `COMBO   ×${mult}`;
        }
        ctx.save();
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = "#f4ecff";
        ctx.font = layout.comboFont;
        if (!reduced) {
          ctx.shadowColor = "#ff5cf4";
          ctx.shadowBlur = 16;
        }
        ctx.fillText(g._comboStr, W / 2, layout.topY + H * 0.16);
        ctx.shadowBlur = 0;
        ctx.fillStyle = "#9fb6d8";
        ctx.font = "700 13px 'Courier New', monospace";
        ctx.fillText(g._multStr, W / 2, layout.topY + H * 0.16 + layout.comboSize * 0.65);
        ctx.restore();
      }
      ctx.save();
      ctx.textBaseline = "top";
      ctx.fillStyle = "#cfe6ff";
      ctx.font = "700 14px 'Courier New', monospace";
      ctx.textAlign = "left";
      ctx.fillText(g._scoreStr, 18, 16);
      ctx.fillStyle = "#9fb6d8";
      ctx.font = "700 11px 'Courier New', monospace";
      ctx.fillText(g._countsStr, 18, 38);
      ctx.textAlign = "right";
      ctx.fillStyle = "#36d6ff";
      ctx.font = "700 13px 'Courier New', monospace";
      ctx.fillText(g.cfg ? g.cfg.label : "PULSE", W - 18, 16);
      ctx.restore();
      const hbW = W - 36;
      const hp = Math.max(0, Math.min(1, g.health / HEALTH.max));
      ctx.save();
      ctx.fillStyle = "rgba(120,150,220,0.18)";
      ctx.fillRect(18, H - 16, hbW, 6);
      const low = hp < 0.25;
      const pulse = low && !reduced ? 0.6 + 0.4 * Math.sin(tNow * 0.012) : 1;
      ctx.globalAlpha = pulse;
      ctx.fillStyle = hp > 0.5 ? "#36ff9e" : hp > 0.25 ? "#ffd23b" : "#ff3b6b";
      ctx.fillRect(18, H - 16, hbW * hp, 6);
      ctx.restore();
      if (tNow < g.bannerUntil && g.bannerText) {
        const remain = g.bannerUntil - tNow;
        const a = Math.min(1, remain / 500);
        ctx.save();
        ctx.globalAlpha = a;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = "#f6e9ff";
        ctx.font = layout.bannerFont;
        if (!reduced) {
          ctx.shadowColor = "#ff48c4";
          ctx.shadowBlur = 22;
        }
        ctx.fillText(g.bannerText, W / 2, H * 0.38);
        ctx.restore();
      }
      if (g.status === "loading" || g.status === "clearing") {
        ctx.save();
        ctx.globalAlpha = 0.8;
        ctx.textAlign = "center";
        ctx.fillStyle = "#9fb6d8";
        ctx.font = "700 14px 'Courier New', monospace";
        ctx.fillText("cueing next track…", W / 2, layout.hitY + 70);
        ctx.restore();
      }
    }
    function frame() {
      const g = gRef.current;
      if (g.status === "playing") {
        const now = perfNow() - startPerfRef.current;
        while (g.missCursor < g.chart.length) {
          const note = g.chart[g.missCursor];
          if (g.consumed.has(note.id)) {
            g.missCursor++;
            continue;
          }
          if (now - note.time > JUDGE_WINDOWS.greatMs) {
            g.consumed.add(note.id);
            g.play = applyJudgment(g.play, "MISS");
            g.health = nextHealth(g.health, "MISS");
            g.judgeFx = { text: "MISS", color: JUDGE_COLOR.MISS, at: perfNow() };
            g.missCursor++;
            if (g.health <= 0) {
              endRun("downed");
              break;
            }
          } else {
            break;
          }
        }
        if (g.status === "playing" && now > g.endMs + END_TAIL_MS) {
          g.status = "clearing";
          g.health = Math.min(HEALTH.max, g.health + 25);
          audio.stop();
          g.bannerText = "STAGE CLEAR";
          g.bannerUntil = perfNow() + 1500;
          startStage(g.stage + 1);
        }
      }
      draw();
      rafRef.current = requestAnimationFrame(frame);
    }
    startStage(0);
    rafRef.current = requestAnimationFrame(frame);
    return () => {
      mountedRef.current = false;
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", resize);
      window.removeEventListener("keydown", onKeyDown);
      if (canvas) canvas.removeEventListener("pointerdown", onPointerDown);
      audio.dispose();
      audioRef.current = null;
      try {
        if (typeof document !== "undefined" && document.fullscreenElement) {
          const p = document.exitFullscreen();
          if (p && typeof p.catch === "function") p.catch(() => {
          });
        }
      } catch {
      }
    };
  }, []);
  const handleExit = reactExports.useCallback(() => {
    if (onExitRef.current) onExitRef.current();
  }, []);
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(
    "div",
    {
      ref: rootRef,
      role: "application",
      "aria-label": "PULSE rhythm game",
      style: {
        position: "fixed",
        inset: 0,
        zIndex: 10001,
        background: "#04020c",
        overflow: "hidden",
        touchAction: "none",
        userSelect: "none"
      },
      children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("canvas", { ref: canvasRef, style: { position: "absolute", inset: 0, display: "block" }, "aria-hidden": true }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "button",
          {
            type: "button",
            onClick: handleExit,
            style: {
              position: "absolute",
              top: 14,
              right: 14,
              zIndex: 3,
              color: "#fff",
              background: "rgba(255,59,107,0.85)",
              border: "1px solid #ff3b6b",
              borderRadius: 8,
              padding: "8px 14px",
              fontFamily: "monospace",
              fontWeight: 700,
              cursor: "pointer"
            },
            children: "EXIT ✕"
          }
        ),
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "div",
          {
            style: {
              position: "absolute",
              bottom: 30,
              left: "50%",
              transform: "translateX(-50%)",
              color: "#8aa0c8",
              fontFamily: "monospace",
              fontSize: 12,
              textAlign: "center",
              pointerEvents: "none",
              zIndex: 2,
              textShadow: "0 0 8px #000"
            },
            children: coarse ? "tap the lanes  ← ↓ ↑ →  to the beat" : "arrow keys  ← ↓ ↑ →  to the beat · ESC to exit"
          }
        ),
        over && /* @__PURE__ */ jsxRuntimeExports.jsx(RunOver, { stats: over, onAgain: restart, onExit: handleExit, reduced: reducedMotion })
      ]
    }
  );
}
function RunOver({ stats, onAgain, onExit }) {
  const reason = stats.reason === "downed" ? "FLATLINED" : "RUN ENDED";
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(
    "div",
    {
      role: "dialog",
      "aria-label": "Run over",
      style: {
        position: "absolute",
        inset: 0,
        zIndex: 5,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(4,2,12,0.82)",
        fontFamily: "'Courier New', monospace",
        color: "#f4ecff",
        textAlign: "center",
        gap: 6
      },
      children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: { color: "#ff3b6b", fontSize: 36, fontWeight: 800, letterSpacing: "0.1em" }, children: reason }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { style: { fontSize: 20, fontWeight: 700, marginTop: 8 }, children: [
          "SCORE ",
          String(stats.score).padStart(7, "0")
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { style: { color: "#9fb6d8", fontSize: 13, marginTop: 4 }, children: [
          "max combo ",
          stats.maxCombo,
          " · perfect ",
          stats.counts.PERFECT,
          " · great ",
          stats.counts.GREAT,
          " · miss ",
          stats.counts.MISS
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { style: { color: "#9fb6d8", fontSize: 12, marginTop: 2 }, children: [
          "reached stage ",
          stats.stage + 1
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { style: { display: "flex", gap: 12, marginTop: 20 }, children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "button",
            {
              type: "button",
              onClick: onAgain,
              style: {
                color: "#04020c",
                background: "#36ff9e",
                border: "none",
                borderRadius: 8,
                padding: "10px 18px",
                fontWeight: 800,
                cursor: "pointer",
                fontFamily: "monospace"
              },
              children: "PLAY AGAIN"
            }
          ),
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "button",
            {
              type: "button",
              onClick: onExit,
              style: {
                color: "#fff",
                background: "rgba(255,59,107,0.85)",
                border: "1px solid #ff3b6b",
                borderRadius: 8,
                padding: "10px 18px",
                fontWeight: 800,
                cursor: "pointer",
                fontFamily: "monospace"
              },
              children: "LEAVE"
            }
          )
        ] })
      ]
    }
  );
}
export {
  PulseGame as default
};
//# sourceMappingURL=PulseGame-DxvAS7aX.js.map
