import { r as reactExports, w as jsxRuntimeExports } from "./index-DcHYFhnp.js";
import { i as isCoarsePointer } from "./index-Cm8oW7Mh.js";
function createNeonRunnerAudio() {
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
    master.gain.value = 0.45;
    master.connect(ctx.destination);
  }
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
  function blip(type, f0, f1, t0, dur, peak) {
    if (!ctx || !master) return;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(f0, t0);
    if (f1 !== f0) osc.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
    g.gain.setValueAtTime(1e-4, t0);
    g.gain.exponentialRampToValueAtTime(peak, t0 + Math.min(0.012, dur * 0.3));
    g.gain.exponentialRampToValueAtTime(1e-4, t0 + dur);
    osc.connect(g);
    g.connect(master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }
  function playTurn() {
    if (!ctx) return;
    blip("square", 540, 680, ctx.currentTime, 0.05, 0.06);
  }
  function playCrash() {
    if (!ctx) return;
    const now = ctx.currentTime;
    blip("sawtooth", 320, 70, now, 0.34, 0.22);
    blip("triangle", 160, 50, now + 0.02, 0.3, 0.16);
  }
  function playWin() {
    if (!ctx) return;
    const now = ctx.currentTime;
    const notes = [440, 554, 659, 880];
    for (let i = 0; i < notes.length; i++) {
      blip("triangle", notes[i], notes[i], now + i * 0.09, 0.16, 0.2);
    }
  }
  function playLose() {
    if (!ctx) return;
    const now = ctx.currentTime;
    blip("sawtooth", 300, 240, now, 0.18, 0.18);
    blip("sawtooth", 220, 150, now + 0.16, 0.34, 0.2);
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
  }
  return {
    get available() {
      return !!ctx;
    },
    resume,
    playTurn,
    playCrash,
    playWin,
    playLose,
    dispose
  };
}
const GRID = 21;
const DIR = { up: 0, right: 1, down: 2, left: 3 };
const DV = [
  [0, -1],
  // up
  [1, 0],
  // right
  [0, 1],
  // down
  [-1, 0]
  // left
];
const CELL = { empty: 0, player: 1, cpu: 2 };
function idx(col, row, grid = GRID) {
  return row * grid + col;
}
function inBounds(col, row, grid = GRID) {
  return col >= 0 && col < grid && row >= 0 && row < grid;
}
function isReverse(cur, next) {
  return (cur + 2) % 4 === next;
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
function createDuel(seed = 1) {
  const grid = new Int8Array(GRID * GRID);
  const startRow = GRID - 4;
  const player = { col: 4, row: startRow, dir: DIR.up, alive: true };
  const cpu = { col: GRID - 5, row: 3, dir: DIR.down, alive: true };
  grid[idx(player.col, player.row)] = CELL.player;
  grid[idx(cpu.col, cpu.row)] = CELL.cpu;
  return {
    grid,
    player,
    cpu,
    status: "playing",
    // playing | win (player) | lose (player) | draw
    tick: 0,
    rng: makeRng(seed)
  };
}
function setDir(state, who, dir) {
  if (state.status !== "playing") return false;
  const r = state[who];
  if (!r || !r.alive) return false;
  if (dir < 0 || dir > 3) return false;
  if (isReverse(r.dir, dir)) return false;
  r.dir = dir;
  return true;
}
function freeRun(grid, col, row, dir, limit = GRID) {
  const [dc, dr] = DV[dir];
  let c = col;
  let r = row;
  let n = 0;
  while (n < limit) {
    c += dc;
    r += dr;
    if (!inBounds(c, r) || grid[idx(c, r)] !== CELL.empty) break;
    n++;
  }
  return n;
}
function cpuChooseDir(state) {
  const { grid, cpu, player } = state;
  let bestDir = cpu.dir;
  let bestScore = -Infinity;
  for (let d = 0; d < 4; d++) {
    if (isReverse(cpu.dir, d)) continue;
    const [dc, dr] = DV[d];
    const nc = cpu.col + dc;
    const nr = cpu.row + dr;
    const blocked = !inBounds(nc, nr) || grid[idx(nc, nr)] !== CELL.empty;
    let score = blocked ? -1e3 : freeRun(grid, cpu.col, cpu.row, d, GRID);
    if (!blocked) {
      const dist = Math.abs(nc - player.col) + Math.abs(nr - player.row);
      score += (2 * GRID - dist) * 0.15;
      if (d === cpu.dir) score += 0.5;
      score += state.rng() * 0.4;
    }
    if (score > bestScore) {
      bestScore = score;
      bestDir = d;
    }
  }
  return bestDir;
}
function step(state) {
  if (state.status !== "playing") return state;
  setDir(state, "cpu", cpuChooseDir(state));
  const p = state.player;
  const c = state.cpu;
  state.grid[idx(p.col, p.row)] = CELL.player;
  state.grid[idx(c.col, c.row)] = CELL.cpu;
  const [pdc, pdr] = DV[p.dir];
  const [cdc, cdr] = DV[c.dir];
  const pnc = p.col + pdc;
  const pnr = p.row + pdr;
  const cnc = c.col + cdc;
  const cnr = c.row + cdr;
  const pCrash = !inBounds(pnc, pnr) || state.grid[idx(pnc, pnr)] !== CELL.empty;
  const cCrash = !inBounds(cnc, cnr) || state.grid[idx(cnc, cnr)] !== CELL.empty;
  const headOn = !pCrash && !cCrash && pnc === cnc && pnr === cnr;
  const playerDies = pCrash || headOn;
  const cpuDies = cCrash || headOn;
  if (!playerDies) {
    p.col = pnc;
    p.row = pnr;
    state.grid[idx(p.col, p.row)] = CELL.player;
  } else {
    p.alive = false;
  }
  if (!cpuDies) {
    c.col = cnc;
    c.row = cnr;
    state.grid[idx(c.col, c.row)] = CELL.cpu;
  } else {
    c.alive = false;
  }
  state.tick += 1;
  if (playerDies && cpuDies) state.status = "draw";
  else if (playerDies) state.status = "lose";
  else if (cpuDies) state.status = "win";
  return state;
}
function isOver(state) {
  return state.status !== "playing";
}
const TICK_MS = 110;
const START_DELAY_MS = 1100;
const RESULT_MS = 2e3;
const DUEL_SEED = 19975;
const KEY_DIR = {
  ArrowUp: DIR.up,
  KeyW: DIR.up,
  ArrowDown: DIR.down,
  KeyS: DIR.down,
  ArrowLeft: DIR.left,
  KeyA: DIR.left,
  ArrowRight: DIR.right,
  KeyD: DIR.right
};
const PLAYER_COLOR = "#36d6ff";
const CPU_COLOR = "#ff5cf4";
const BG_TOP = "#070a1e";
const BG_BOT = "#03040c";
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
function NeonRunnerGame({ onExit, seed = 1 }) {
  const reducedMotion = usePrefersReducedMotion();
  const [coarse] = reactExports.useState(() => isCoarsePointer());
  const canvasRef = reactExports.useRef(null);
  const rootRef = reactExports.useRef(null);
  const rafRef = reactExports.useRef(0);
  const mountedRef = reactExports.useRef(true);
  const reducedRef = reactExports.useRef(reducedMotion);
  const onExitRef = reactExports.useRef(onExit);
  const turnRef = reactExports.useRef(null);
  const resultLiveRef = reactExports.useRef(null);
  const gRef = reactExports.useRef(null);
  if (gRef.current === null) {
    gRef.current = {
      duel: createDuel(DUEL_SEED + (seed | 0) | 0),
      lastTick: 0,
      resultAt: 0,
      exited: false,
      bannerText: "NEON RUNNER · LAST RIDER STANDING",
      bannerUntil: 0,
      // cached result strings (built once on resolve)
      _resultStr: "",
      _resultSub: ""
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
    const audio = createNeonRunnerAudio();
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
      cell: 18,
      left: 0,
      top: 0,
      size: 0,
      bannerFont: "",
      resultFont: "",
      subFont: "",
      hudFont: ""
    };
    const relayout = () => {
      if (!W || !H) return;
      const usable = Math.min(W * 0.92, H * 0.78);
      const cell = Math.max(8, Math.floor(usable / GRID));
      layout.cell = cell;
      layout.size = cell * GRID;
      layout.left = Math.round((W - layout.size) / 2);
      layout.top = Math.round(Math.max(H * 0.12, (H - layout.size) / 2));
      layout.bannerFont = `800 ${Math.max(18, Math.min(40, W * 0.038))}px 'Courier New', monospace`;
      layout.resultFont = `800 ${Math.max(34, Math.min(86, W * 0.09))}px 'Courier New', monospace`;
      layout.subFont = `700 ${Math.max(14, Math.min(22, W * 0.02))}px 'Courier New', monospace`;
      layout.hudFont = "700 14px 'Courier New', monospace";
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
        baseGrad.addColorStop(0, BG_TOP);
        baseGrad.addColorStop(1, BG_BOT);
      }
      relayout();
    };
    resize();
    window.addEventListener("resize", resize);
    function turn(dir) {
      audio.resume();
      const g = gRef.current;
      if (isOver(g.duel)) {
        exitNow();
        return;
      }
      if (setDir(g.duel, "player", dir)) audio.playTurn();
    }
    turnRef.current = turn;
    function exitNow() {
      const g = gRef.current;
      if (g.exited) return;
      g.exited = true;
      if (onExitRef.current) onExitRef.current();
    }
    const onKeyDown = (e) => {
      const g = gRef.current;
      if (isOver(g.duel) && (e.code === "Enter" || e.code === "Space")) {
        e.preventDefault();
        exitNow();
        return;
      }
      const dir = KEY_DIR[e.code];
      if (dir === void 0) return;
      e.preventDefault();
      e.stopPropagation();
      if (e.repeat) return;
      turn(dir);
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
      if (isOver(gRef.current.duel)) {
        exitNow();
        return;
      }
      const TAP = 24;
      if (Math.abs(dx) < TAP && Math.abs(dy) < TAP) return;
      if (Math.abs(dx) > Math.abs(dy)) turn(dx > 0 ? DIR.right : DIR.left);
      else turn(dy < 0 ? DIR.up : DIR.down);
    };
    window.addEventListener("keydown", onKeyDown);
    if (canvas) {
      canvas.addEventListener("pointerdown", onPointerDown);
      canvas.addEventListener("pointerup", onPointerUp);
    }
    function cellRect(col, row) {
      const x = layout.left + col * layout.cell;
      const y = layout.top + row * layout.cell;
      ctx.fillRect(x + 1, y + 1, layout.cell - 2, layout.cell - 2);
    }
    function drawHead(rider, color, reduced) {
      ctx.save();
      ctx.fillStyle = color;
      if (!reduced) {
        ctx.shadowColor = color;
        ctx.shadowBlur = 14;
      }
      cellRect(rider.col, rider.row);
      ctx.restore();
    }
    function draw() {
      if (!ctx) return;
      const g = gRef.current;
      const duel = g.duel;
      const reduced = reducedRef.current;
      const tNow = perfNow();
      const cell = layout.cell;
      ctx.fillStyle = baseGrad || BG_TOP;
      ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = "rgba(120,90,200,0.5)";
      ctx.lineWidth = 2;
      ctx.strokeRect(layout.left - 1, layout.top - 1, layout.size + 2, layout.size + 2);
      if (!reduced) {
        ctx.strokeStyle = "rgba(80,70,140,0.16)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let i = 1; i < GRID; i++) {
          const gx = layout.left + i * cell;
          const gy = layout.top + i * cell;
          ctx.moveTo(gx, layout.top);
          ctx.lineTo(gx, layout.top + layout.size);
          ctx.moveTo(layout.left, gy);
          ctx.lineTo(layout.left + layout.size, gy);
        }
        ctx.stroke();
      }
      const grid = duel.grid;
      ctx.globalAlpha = 0.55;
      for (let row = 0; row < GRID; row++) {
        for (let col = 0; col < GRID; col++) {
          const v = grid[idx(col, row)];
          if (v === CELL.empty) continue;
          ctx.fillStyle = v === CELL.player ? PLAYER_COLOR : CPU_COLOR;
          cellRect(col, row);
        }
      }
      ctx.globalAlpha = 1;
      drawHead(duel.player, PLAYER_COLOR, reduced);
      drawHead(duel.cpu, CPU_COLOR, reduced);
      if (tNow < g.bannerUntil && g.bannerText) {
        const a = Math.min(1, (g.bannerUntil - tNow) / 500);
        ctx.save();
        ctx.globalAlpha = a;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = "#dfeaff";
        ctx.font = layout.bannerFont;
        if (!reduced) {
          ctx.shadowColor = "#48b4ff";
          ctx.shadowBlur = 18;
        }
        ctx.fillText(g.bannerText, W / 2, layout.top * 0.58);
        ctx.restore();
      }
      ctx.save();
      ctx.font = layout.hudFont;
      ctx.textBaseline = "top";
      ctx.textAlign = "left";
      ctx.fillStyle = PLAYER_COLOR;
      ctx.fillText("YOU", 18, 16);
      ctx.textAlign = "right";
      ctx.fillStyle = CPU_COLOR;
      ctx.fillText("RIVAL", W - 18, 16);
      ctx.restore();
      if (isOver(duel)) {
        const dim = reduced ? 0.55 : 0.62;
        ctx.save();
        ctx.globalAlpha = dim;
        ctx.fillStyle = "#05030f";
        ctx.fillRect(0, 0, W, H);
        ctx.restore();
        ctx.save();
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.font = layout.resultFont;
        const win = duel.status === "win";
        const draw2 = duel.status === "draw";
        ctx.fillStyle = win ? "#36ff9e" : draw2 ? "#ffd23b" : "#ff5c7a";
        if (!reduced) {
          ctx.shadowColor = ctx.fillStyle;
          ctx.shadowBlur = 22;
        }
        ctx.fillText(g._resultStr, W / 2, H * 0.44);
        ctx.shadowBlur = 0;
        ctx.font = layout.subFont;
        ctx.fillStyle = "#bfe9ff";
        ctx.fillText(g._resultSub, W / 2, H * 0.44 + Math.max(40, H * 0.07));
        ctx.restore();
      }
    }
    function frame() {
      if (!mountedRef.current) return;
      const g = gRef.current;
      const tNow = perfNow();
      if (!isOver(g.duel)) {
        if (g.lastTick === 0) g.lastTick = tNow;
        if (tNow - g.lastTick >= TICK_MS) {
          g.lastTick = tNow;
          step(g.duel);
          if (isOver(g.duel)) {
            g.resultAt = tNow;
            const s = g.duel.status;
            g._resultStr = s === "win" ? "YOU WIN" : s === "draw" ? "DRAW" : "DEFEATED";
            g._resultSub = s === "win" ? "rival derezzed · tap / Enter to ride on" : s === "draw" ? "mutual wipeout · tap / Enter to ride on" : "you derezzed · tap / Enter to ride on";
            if (resultLiveRef.current) {
              resultLiveRef.current.textContent = `${g._resultStr}. ${g._resultSub}`;
            }
            if (s === "win") audio.playWin();
            else if (s === "draw") audio.playCrash();
            else {
              audio.playCrash();
              audio.playLose();
            }
          }
        }
      } else if (g.resultAt && tNow - g.resultAt > RESULT_MS) {
        if (!g.exited) {
          g.exited = true;
          if (onExitRef.current) onExitRef.current();
        }
      }
      draw();
      rafRef.current = requestAnimationFrame(frame);
    }
    const t0 = perfNow();
    gRef.current.bannerUntil = t0 + 2200;
    gRef.current.lastTick = t0 + START_DELAY_MS;
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
      turnRef.current = null;
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
  const padTurn = reactExports.useCallback((dir) => {
    if (turnRef.current) turnRef.current(dir);
  }, []);
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(
    "div",
    {
      ref: rootRef,
      role: "application",
      "aria-label": "NEON RUNNER grid duel",
      style: {
        position: "fixed",
        inset: 0,
        zIndex: 10001,
        background: BG_BOT,
        overflow: "hidden",
        touchAction: "none",
        userSelect: "none"
      },
      children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("canvas", { ref: canvasRef, style: { position: "absolute", inset: 0, display: "block" }, "aria-hidden": true }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "div",
          {
            ref: resultLiveRef,
            role: "status",
            "aria-live": "polite",
            style: {
              position: "absolute",
              width: 1,
              height: 1,
              padding: 0,
              margin: -1,
              overflow: "hidden",
              clip: "rect(0 0 0 0)",
              whiteSpace: "nowrap",
              border: 0
            }
          }
        ),
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
            children: coarse ? "swipe / pad to steer · cut off the rival · ESC to exit" : "arrow keys / WASD to steer · cut off the rival · ESC to exit"
          }
        ),
        coarse && /* @__PURE__ */ jsxRuntimeExports.jsx(DPad, { onTurn: padTurn })
      ]
    }
  );
}
function DPad({ onTurn }) {
  const btn = (label, dir, extra) => /* @__PURE__ */ jsxRuntimeExports.jsx(
    "button",
    {
      type: "button",
      "aria-label": `steer ${label}`,
      onPointerDown: (e) => {
        e.preventDefault();
        e.stopPropagation();
        onTurn(dir);
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
        btn("↑", DIR.up),
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", {}),
        btn("←", DIR.left),
        btn("↓", DIR.down),
        btn("→", DIR.right)
      ]
    }
  );
}
export {
  NeonRunnerGame as default
};
//# sourceMappingURL=NeonRunnerGame-eohR20GO.js.map
