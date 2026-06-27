import { r as reactExports, w as jsxRuntimeExports } from "./index-DcHYFhnp.js";
import { i as isCoarsePointer, A as ASSET_SLOTS } from "./index-Cm8oW7Mh.js";
function createGridlockAudio() {
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
    master.gain.value = 0.5;
    master.connect(ctx.destination);
  }
  let laughBuffer = null;
  let laughLoaded = false;
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
  async function loadLaugh(url) {
    laughLoaded = true;
    if (!ctx || !url || typeof fetch === "undefined") return;
    try {
      const res = await fetch(url);
      if (!res.ok) return;
      const arr = await res.arrayBuffer();
      laughBuffer = await ctx.decodeAudioData(arr);
    } catch {
      laughBuffer = null;
    }
  }
  function synthLaugh() {
    if (!ctx || !master) return;
    const now = ctx.currentTime;
    const steps = [0, 0.12, 0.24, 0.36];
    const freqs = [392, 330, 277, 233];
    for (let i = 0; i < steps.length; i++) {
      const t0 = now + steps[i];
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(freqs[i], t0);
      osc.frequency.exponentialRampToValueAtTime(freqs[i] * 0.78, t0 + 0.09);
      g.gain.setValueAtTime(1e-4, t0);
      g.gain.exponentialRampToValueAtTime(0.22, t0 + 0.012);
      g.gain.exponentialRampToValueAtTime(1e-4, t0 + 0.11);
      osc.connect(g);
      g.connect(master);
      osc.start(t0);
      osc.stop(t0 + 0.14);
    }
  }
  function playLaugh() {
    resume();
    if (laughBuffer && ctx && master) {
      try {
        const src = ctx.createBufferSource();
        src.buffer = laughBuffer;
        const g = ctx.createGain();
        g.gain.value = 0.9;
        src.connect(g);
        g.connect(master);
        src.start();
        return;
      } catch {
      }
    }
    synthLaugh();
  }
  function playStep() {
    if (!ctx || !master) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = "square";
    osc.frequency.setValueAtTime(660, now);
    g.gain.setValueAtTime(1e-4, now);
    g.gain.exponentialRampToValueAtTime(0.07, now + 4e-3);
    g.gain.exponentialRampToValueAtTime(1e-4, now + 0.05);
    osc.connect(g);
    g.connect(master);
    osc.start(now);
    osc.stop(now + 0.06);
  }
  function playEscalate() {
    if (!ctx || !master) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(440, now);
    osc.frequency.exponentialRampToValueAtTime(880, now + 0.18);
    g.gain.setValueAtTime(1e-4, now);
    g.gain.exponentialRampToValueAtTime(0.18, now + 0.02);
    g.gain.exponentialRampToValueAtTime(1e-4, now + 0.22);
    osc.connect(g);
    g.connect(master);
    osc.start(now);
    osc.stop(now + 0.25);
  }
  function dispose() {
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
    laughBuffer = null;
  }
  return {
    get available() {
      return !!ctx;
    },
    get laughLoaded() {
      return laughLoaded;
    },
    resume,
    loadLaugh,
    playLaugh,
    playStep,
    playEscalate,
    dispose
  };
}
const COLS = 13;
const PLAYER_HALF = 0.42;
const DIRS = {
  up: { dc: 0, dr: 1 },
  down: { dc: 0, dr: -1 },
  left: { dc: -1, dr: 0 },
  right: { dc: 1, dr: 0 }
};
function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}
function mod(n, m) {
  return (n % m + m) % m;
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
const BASE_ROAD_LANES = 3;
const MAX_ROAD_LANES = 7;
const BASE_SPEED = 2;
const BASE_PERIOD = 6;
const BASE_CARLEN = 2;
const MIN_GAP_FLOOR = 0.3;
function levelConfig(level) {
  const lv = Math.max(0, Math.floor(level));
  return {
    level: lv,
    roadRows: Math.min(BASE_ROAD_LANES + lv, MAX_ROAD_LANES),
    speedScale: 1 + lv * 0.14,
    // unbounded
    periodShrink: lv * 0.5
    // columns removed from each lane's spacing
  };
}
function buildLanes(level, cfg = levelConfig(level)) {
  const rng = makeRng((cfg.level + 1) * 2654435761 >>> 0);
  const lanes = [];
  for (let i = 0; i < cfg.roadRows; i++) {
    const dir = rng() < 0.5 ? -1 : 1;
    const carLen = round3(BASE_CARLEN * (0.85 + 0.5 * rng()));
    const speed = round3(BASE_SPEED * cfg.speedScale * (0.75 + 0.6 * rng()));
    const rawPeriod = BASE_PERIOD * (0.85 + 0.4 * rng()) - cfg.periodShrink;
    const period = round3(Math.max(carLen + MIN_GAP_FLOOR, rawPeriod));
    const offset = round3(rng() * period);
    lanes.push({ dir, speed, period, carLen, offset });
  }
  return lanes;
}
function round3(v) {
  return Math.round(v * 1e3) / 1e3;
}
function buildBoard(level) {
  const cfg = levelConfig(level);
  const lanes = buildLanes(level, cfg);
  const rows = cfg.roadRows + 2;
  return {
    cols: COLS,
    rows,
    roadRows: cfg.roadRows,
    startRow: 0,
    goalRow: rows - 1,
    lanes,
    // indexed 0..roadRows-1, mapped to rows 1..roadRows
    cfg
  };
}
function laneForRow(board, row) {
  if (row >= 1 && row <= board.roadRows) return board.lanes[row - 1];
  return null;
}
function isSafeRow(board, row) {
  return laneForRow(board, row) === null;
}
function collides(lane, px, t, pHalf = PLAYER_HALF) {
  const phase = lane.offset + lane.dir * lane.speed * t;
  const c = mod(px - phase, lane.period);
  const aL = c - pHalf;
  const aR = c + pHalf;
  for (let k = -1; k <= 1; k++) {
    const carL = k * lane.period;
    const carR = carL + lane.carLen;
    if (aL < carR && carL < aR) return true;
  }
  return false;
}
function forEachVisibleCar(lane, t, xMin, xMax, cb) {
  const phase = lane.offset + lane.dir * lane.speed * t;
  const base = mod(phase, lane.period);
  const first = base + lane.period * Math.floor((xMin - lane.carLen - base) / lane.period);
  let guard = 0;
  for (let x = first; x <= xMax && guard < 512; x += lane.period, guard++) {
    cb(x);
  }
}
function startPos(board) {
  return { col: Math.floor(board.cols / 2), row: board.startRow };
}
function stepPlayer(pos, dirKey, board) {
  const d = DIRS[dirKey];
  if (!d) return pos;
  return {
    col: clamp(pos.col + d.dc, 0, board.cols - 1),
    row: clamp(pos.row + d.dr, 0, board.rows - 1)
  };
}
function isGoal(pos, board) {
  return pos.row >= board.goalRow;
}
function playerHit(board, pos, t, pHalf = PLAYER_HALF) {
  const lane = laneForRow(board, pos.row);
  if (!lane) return false;
  return collides(lane, pos.col + 0.5, t, pHalf);
}
const RESPAWN_MS = 600;
const SKYLINE_SEED = 3249568273;
const KEY_DIR = {
  ArrowUp: "up",
  KeyW: "up",
  ArrowDown: "down",
  KeyS: "down",
  ArrowLeft: "left",
  KeyA: "left",
  ArrowRight: "right",
  KeyD: "right"
};
const LANE_HUES = ["#36d6ff", "#ff5cf4", "#ffd23b", "#36ff9e", "#ff8a3b", "#9b5cff", "#00e0c6"];
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
function GridlockGame({ onExit }) {
  const reducedMotion = usePrefersReducedMotion();
  const [coarse] = reactExports.useState(() => isCoarsePointer());
  const canvasRef = reactExports.useRef(null);
  const rootRef = reactExports.useRef(null);
  const rafRef = reactExports.useRef(0);
  const startPerfRef = reactExports.useRef(0);
  const mountedRef = reactExports.useRef(true);
  const reducedRef = reactExports.useRef(reducedMotion);
  const onExitRef = reactExports.useRef(onExit);
  const doMoveRef = reactExports.useRef(null);
  const gRef = reactExports.useRef(null);
  if (gRef.current === null) {
    const board = buildBoard(0);
    gRef.current = {
      board,
      level: 0,
      hauled: 0,
      // successful crossings (each escalates difficulty)
      deaths: 0,
      player: startPos(board),
      lastDir: "up",
      status: "playing",
      // playing | respawning
      deathFlashAt: 0,
      escalateFlashAt: 0,
      bannerText: "GRIDLOCK · HAUL THE CABINET ↑",
      bannerUntil: 0,
      // cached HUD strings (rebuilt only when the value changes)
      _hauled: -1,
      _hauledStr: "",
      _deaths: -1,
      _deathsStr: "",
      _block: -1,
      _blockStr: ""
    };
  }
  reactExports.useEffect(() => {
    reducedRef.current = reducedMotion;
  }, [reducedMotion]);
  reactExports.useEffect(() => {
    onExitRef.current = onExit;
  }, [onExit]);
  reactExports.useEffect(() => {
    mountedRef.current = true;
    const canvas = canvasRef.current;
    const ctx = canvas ? canvas.getContext("2d") : null;
    const audio = createGridlockAudio();
    audio.loadLaugh(ASSET_SLOTS.audio.mockLaugh);
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
    let skyline = [];
    const layout = {
      cell: 24,
      cols: COLS,
      rows: 5,
      boardLeft: 0,
      boardTop: 0,
      boardW: 0,
      boardH: 0,
      bannerFont: "",
      labelFont: "",
      hudFont: "",
      // cached lane-divider dash pattern (depends only on cell) — hoisted out of
      // the per-frame draw loop so we never allocate a dash array per road row.
      dashPattern: [12, 12]
    };
    const EMPTY_DASH = [];
    const buildSkyline = () => {
      skyline = [];
      if (!W || !H) return;
      const rng = makeRng(SKYLINE_SEED);
      let x = -20;
      while (x < W + 20) {
        const w = 24 + rng() * 70;
        const h = H * (0.12 + rng() * 0.34);
        skyline.push({ x, w, h, lit: rng() < 0.5 });
        x += w + 6 + rng() * 18;
      }
    };
    const relayout = () => {
      const board = gRef.current.board;
      if (!board || !W || !H) return;
      const rows = board.rows;
      const cols = board.cols;
      const usableW = W * 0.94;
      const usableH = H * 0.72;
      const cell = Math.max(16, Math.min(usableW / cols, usableH / rows));
      layout.cell = cell;
      layout.cols = cols;
      layout.rows = rows;
      layout.boardW = cell * cols;
      layout.boardH = cell * rows;
      layout.boardLeft = Math.round((W - layout.boardW) / 2);
      layout.boardTop = Math.round(Math.max(H * 0.13, (H - layout.boardH) / 2));
      layout.bannerFont = `800 ${Math.max(22, Math.min(48, W * 0.044))}px 'Courier New', monospace`;
      layout.labelFont = `800 ${Math.max(13, cell * 0.4)}px 'Courier New', monospace`;
      layout.hudFont = "700 14px 'Courier New', monospace";
      layout.dashPattern[0] = cell * 0.3;
      layout.dashPattern[1] = cell * 0.3;
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
        baseGrad.addColorStop(0, "#0a0524");
        baseGrad.addColorStop(0.55, "#0c0726");
        baseGrad.addColorStop(1, "#04020c");
      }
      buildSkyline();
      relayout();
    };
    resize();
    window.addEventListener("resize", resize);
    const carScratch = [];
    const pushCar = (x) => {
      carScratch.push(x);
    };
    function escalate() {
      const g = gRef.current;
      g.hauled += 1;
      g.level += 1;
      g.board = buildBoard(g.level);
      g.player = startPos(g.board);
      g.lastDir = "up";
      g.status = "playing";
      g.bannerText = `BLOCK ${String(g.hauled + 1).padStart(2, "0")} · IT NEVER ENDS`;
      g.bannerUntil = perfNow() + 1900;
      if (!reducedRef.current) g.escalateFlashAt = perfNow();
      relayout();
      audio.playEscalate();
    }
    function die() {
      const g = gRef.current;
      if (g.status !== "playing") return;
      g.deaths += 1;
      g.status = "respawning";
      g.deathFlashAt = perfNow();
      audio.playLaugh();
    }
    function doMove(dir) {
      const g = gRef.current;
      audio.resume();
      if (g.status !== "playing") return;
      const prev = g.player;
      const next = stepPlayer(prev, dir, g.board);
      if (next.col === prev.col && next.row === prev.row) return;
      g.player = next;
      g.lastDir = dir;
      audio.playStep();
      if (isGoal(next, g.board)) {
        escalate();
        return;
      }
      const t = (perfNow() - startPerfRef.current) / 1e3;
      if (playerHit(g.board, next, t)) die();
    }
    doMoveRef.current = doMove;
    const onKeyDown = (e) => {
      const dir = KEY_DIR[e.code];
      if (!dir) return;
      e.preventDefault();
      e.stopPropagation();
      if (e.repeat) return;
      doMove(dir);
    };
    let gestureStart = null;
    const onPointerDown = (e) => {
      gestureStart = { x: e.clientX, y: e.clientY };
    };
    const onPointerUp = (e) => {
      if (!gestureStart) return;
      const dx = e.clientX - gestureStart.x;
      const dy = e.clientY - gestureStart.y;
      gestureStart = null;
      const TAP = 24;
      if (Math.abs(dx) < TAP && Math.abs(dy) < TAP) {
        doMove("up");
        return;
      }
      if (Math.abs(dx) > Math.abs(dy)) doMove(dx > 0 ? "right" : "left");
      else doMove(dy < 0 ? "up" : "down");
    };
    window.addEventListener("keydown", onKeyDown);
    if (canvas) {
      canvas.addEventListener("pointerdown", onPointerDown);
      canvas.addEventListener("pointerup", onPointerUp);
    }
    function drawHauler(cx, cyTop, cell, dir, reduced) {
      const cab = cell * 0.56;
      const half = cab / 2;
      const cyc = cyTop + cell / 2;
      const dvx = dir === "left" ? -1 : dir === "right" ? 1 : 0;
      const dvy = dir === "down" ? 1 : -1;
      const lead = cell * 0.16;
      const cabX = cx + dvx * lead;
      const cabY = cyc + (dir === "left" || dir === "right" ? 0 : dvy * lead);
      const figX = cx - dvx * cell * 0.12;
      const figY = cyc - (dir === "left" || dir === "right" ? 0 : dvy * lead) + cell * 0.04;
      ctx.save();
      ctx.fillStyle = "#36d6ff";
      if (!reduced) {
        ctx.shadowColor = "#36d6ff";
        ctx.shadowBlur = 8;
      }
      ctx.beginPath();
      ctx.moveTo(figX - cab * 0.22, figY + half * 0.7);
      ctx.lineTo(figX + cab * 0.22, figY + half * 0.7);
      ctx.lineTo(figX + cab * 0.12, figY - half * 0.1);
      ctx.lineTo(figX - cab * 0.12, figY - half * 0.1);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.arc(figX, figY - half * 0.32, cab * 0.16, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      ctx.save();
      ctx.translate(cabX, cabY);
      if (!reduced) {
        ctx.shadowColor = "#ff5cf4";
        ctx.shadowBlur = 10;
      }
      ctx.fillStyle = "#2a0f3a";
      ctx.strokeStyle = "#ff5cf4";
      ctx.lineWidth = Math.max(1.5, cell * 0.05);
      roundRect(-half, -half, cab, cab, cell * 0.1);
      ctx.fill();
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.fillStyle = "#9af7ff";
      ctx.globalAlpha = 0.85;
      ctx.fillRect(-half * 0.55, -half * 0.6, cab * 0.55, cab * 0.4);
      ctx.restore();
    }
    function roundRect(x, y, w, h, r) {
      const rr = Math.min(r, w / 2, h / 2);
      ctx.beginPath();
      ctx.moveTo(x + rr, y);
      ctx.arcTo(x + w, y, x + w, y + h, rr);
      ctx.arcTo(x + w, y + h, x, y + h, rr);
      ctx.arcTo(x, y + h, x, y, rr);
      ctx.arcTo(x, y, x + w, y, rr);
      ctx.closePath();
    }
    function draw() {
      if (!ctx) return;
      const g = gRef.current;
      const board = g.board;
      const reduced = reducedRef.current;
      const tNow = perfNow();
      const t = (tNow - startPerfRef.current) / 1e3;
      const cell = layout.cell;
      ctx.fillStyle = baseGrad || "#05010f";
      ctx.fillRect(0, 0, W, H);
      for (let i = 0; i < skyline.length; i++) {
        const b = skyline[i];
        ctx.fillStyle = "#0d0726";
        ctx.fillRect(b.x, H - b.h, b.w, b.h);
        if (b.lit) {
          ctx.fillStyle = "rgba(120,90,200,0.5)";
          ctx.fillRect(b.x, H - b.h, b.w, 2);
        }
      }
      ctx.save();
      ctx.beginPath();
      ctx.rect(layout.boardLeft, layout.boardTop, layout.boardW, layout.boardH);
      ctx.clip();
      for (let row = 0; row < board.rows; row++) {
        const yTop = layout.boardTop + (layout.rows - 1 - row) * cell;
        const safe = isSafeRow(board, row);
        if (safe) {
          ctx.fillStyle = row === board.goalRow ? "#143a2a" : "#13213a";
          ctx.fillRect(layout.boardLeft, yTop, layout.boardW, cell);
          ctx.strokeStyle = "rgba(180,210,255,0.10)";
          ctx.lineWidth = 1;
          for (let hx = layout.boardLeft; hx < layout.boardLeft + layout.boardW; hx += cell * 0.5) {
            ctx.beginPath();
            ctx.moveTo(hx, yTop);
            ctx.lineTo(hx + cell * 0.3, yTop + cell);
            ctx.stroke();
          }
        } else {
          ctx.fillStyle = "#0a0a14";
          ctx.fillRect(layout.boardLeft, yTop, layout.boardW, cell);
          ctx.strokeStyle = "rgba(230,220,120,0.35)";
          ctx.lineWidth = Math.max(1, cell * 0.04);
          ctx.setLineDash(layout.dashPattern);
          ctx.beginPath();
          ctx.moveTo(layout.boardLeft, yTop + cell / 2);
          ctx.lineTo(layout.boardLeft + layout.boardW, yTop + cell / 2);
          ctx.stroke();
          ctx.setLineDash(EMPTY_DASH);
        }
      }
      const goalY = layout.boardTop + (layout.rows - 1 - board.goalRow) * cell;
      const sq = cell * 0.5;
      for (let i = 0; i * sq < layout.boardW; i++) {
        ctx.fillStyle = i % 2 === 0 ? "#36ff9e" : "#0a2a1c";
        ctx.fillRect(layout.boardLeft + i * sq, goalY + cell - 4, sq, 4);
      }
      for (let row = 1; row <= board.roadRows; row++) {
        const lane = laneForRow(board, row);
        const hue = LANE_HUES[(row - 1) % LANE_HUES.length];
        const yTop = layout.boardTop + (layout.rows - 1 - row) * cell + cell * 0.16;
        const carH = cell * 0.68;
        carScratch.length = 0;
        forEachVisibleCar(lane, t, 0, COLS, pushCar);
        for (let i = 0; i < carScratch.length; i++) {
          const x = layout.boardLeft + carScratch[i] * cell;
          const w = lane.carLen * cell;
          ctx.save();
          ctx.fillStyle = "#160a22";
          ctx.strokeStyle = hue;
          ctx.lineWidth = Math.max(1.5, cell * 0.05);
          if (!reduced) {
            ctx.shadowColor = hue;
            ctx.shadowBlur = 10;
          }
          roundRect(x + 2, yTop, w - 4, carH, cell * 0.14);
          ctx.fill();
          ctx.stroke();
          ctx.shadowBlur = 0;
          ctx.fillStyle = hue;
          const lx = lane.dir > 0 ? x + w - cell * 0.18 : x + cell * 0.06;
          ctx.fillRect(lx, yTop + carH * 0.3, cell * 0.12, carH * 0.4);
          ctx.restore();
        }
      }
      {
        const cx = layout.boardLeft + (g.player.col + 0.5) * cell;
        const cyTop = layout.boardTop + (layout.rows - 1 - g.player.row) * cell;
        const respawning = g.status === "respawning";
        const show = !respawning || Math.floor(tNow / 90) % 2 === 0 || reduced;
        if (show) drawHauler(cx, cyTop, cell, g.lastDir, reduced);
      }
      ctx.restore();
      if (!reduced && g.escalateFlashAt) {
        const age = tNow - g.escalateFlashAt;
        if (age < 380) {
          ctx.save();
          ctx.globalAlpha = 0.28 * (1 - age / 380);
          ctx.fillStyle = "#ffd23b";
          ctx.fillRect(0, 0, W, H);
          ctx.restore();
        }
      }
      if (g.status === "respawning") {
        const age = tNow - g.deathFlashAt;
        const k = reduced ? 0.32 : 0.42 * Math.max(0, 1 - age / RESPAWN_MS);
        ctx.save();
        ctx.globalAlpha = k;
        ctx.fillStyle = "#ff1f4f";
        ctx.fillRect(0, 0, W, H);
        ctx.restore();
        ctx.save();
        ctx.globalAlpha = Math.max(0, 1 - age / RESPAWN_MS);
        ctx.fillStyle = "#ffd9e2";
        ctx.font = layout.bannerFont;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("SQUASHED", W / 2, H * 0.42);
        ctx.restore();
      }
      if (g.hauled !== g._hauled) {
        g._hauled = g.hauled;
        g._hauledStr = `HAULED ${g.hauled}`;
      }
      if (g.deaths !== g._deaths) {
        g._deaths = g.deaths;
        g._deathsStr = `SQUASHED ${g.deaths}`;
      }
      if (g.level !== g._block) {
        g._block = g.level;
        g._blockStr = `BLOCK ${String(g.level + 1).padStart(2, "0")}`;
      }
      ctx.save();
      ctx.textBaseline = "top";
      ctx.font = layout.hudFont;
      ctx.textAlign = "left";
      ctx.fillStyle = "#cfe6ff";
      ctx.fillText(g._hauledStr, 18, 16);
      ctx.fillStyle = "#ff9db4";
      ctx.fillText(g._deathsStr, 18, 36);
      ctx.textAlign = "right";
      ctx.fillStyle = "#36d6ff";
      ctx.fillText(g._blockStr, W - 18, 16);
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
          ctx.shadowBlur = 20;
        }
        ctx.fillText(g.bannerText, W / 2, layout.boardTop * 0.6);
        ctx.restore();
      }
    }
    function frame() {
      if (!mountedRef.current) return;
      const g = gRef.current;
      const tNow = perfNow();
      if (g.status === "respawning" && tNow - g.deathFlashAt > RESPAWN_MS) {
        g.player = startPos(g.board);
        g.lastDir = "up";
        g.status = "playing";
      }
      if (g.status === "playing") {
        const t = (tNow - startPerfRef.current) / 1e3;
        if (playerHit(g.board, g.player, t)) die();
      }
      draw();
      rafRef.current = requestAnimationFrame(frame);
    }
    startPerfRef.current = perfNow();
    gRef.current.bannerUntil = startPerfRef.current + 2400;
    rafRef.current = requestAnimationFrame(frame);
    return () => {
      mountedRef.current = false;
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", resize);
      window.removeEventListener("keydown", onKeyDown);
      if (canvas) {
        canvas.removeEventListener("pointerdown", onPointerDown);
        canvas.removeEventListener("pointerup", onPointerUp);
      }
      doMoveRef.current = null;
      audio.dispose();
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
  const padMove = reactExports.useCallback((dir) => {
    if (doMoveRef.current) doMoveRef.current(dir);
  }, []);
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(
    "div",
    {
      ref: rootRef,
      role: "application",
      "aria-label": "GRIDLOCK crossing game",
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
              bottom: coarse ? 150 : 26,
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
            children: coarse ? "tap / swipe (or use the pad) to shove the cabinet ↑ · it never ends" : "arrow keys / WASD to shove the cabinet across · ESC to exit · it never ends"
          }
        ),
        coarse && /* @__PURE__ */ jsxRuntimeExports.jsx(DPad, { onMove: padMove })
      ]
    }
  );
}
function DPad({ onMove }) {
  const btn = (label, dir, extra) => /* @__PURE__ */ jsxRuntimeExports.jsx(
    "button",
    {
      type: "button",
      "aria-label": `move ${dir}`,
      onPointerDown: (e) => {
        e.preventDefault();
        e.stopPropagation();
        onMove(dir);
      },
      style: {
        width: 56,
        height: 56,
        borderRadius: 12,
        border: "1px solid #2a1d66",
        background: "rgba(20,12,46,0.8)",
        color: "#bfe9ff",
        fontFamily: "monospace",
        fontSize: 22,
        fontWeight: 800,
        touchAction: "none",
        cursor: "pointer",
        ...extra
      },
      children: label
    }
  );
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(
    "div",
    {
      style: {
        position: "absolute",
        bottom: 24,
        left: "50%",
        transform: "translateX(-50%)",
        display: "grid",
        gridTemplateColumns: "repeat(3, 56px)",
        gridTemplateRows: "repeat(2, 56px)",
        gap: 8,
        zIndex: 4
      },
      children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", {}),
        btn("↑", "up"),
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", {}),
        btn("←", "left"),
        btn("↓", "down"),
        btn("→", "right")
      ]
    }
  );
}
export {
  GridlockGame as default
};
//# sourceMappingURL=GridlockGame-CGHfsX2c.js.map
