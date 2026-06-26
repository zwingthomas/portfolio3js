import { useEffect, useRef, useState, useCallback } from 'react';
import { ASSET_SLOTS } from '../assets';
import { isCoarsePointer } from '../touchInput';
import { createGridlockAudio } from './gridlockAudio';
import {
  COLS,
  buildBoard,
  laneForRow,
  isSafeRow,
  forEachVisibleCar,
  startPos,
  stepPlayer,
  isGoal,
  playerHit,
  makeRng,
} from './gridlockEngine';

// ===========================================================================
// GridlockGame — Milestone-4 crossing cabinet "GRIDLOCK" (ORIGINAL name + art).
//
// A full-screen DOM overlay (mounted from src/arcade/index.jsx like PULSE / the
// M2 loader) rendering a single canvas: an ORIGINAL parody "hauler" shoving an
// arcade cabinet up through lanes of neon traffic in a stylized city. Step with
// the arrow keys / WASD (or tap / swipe / the on-screen D-pad on touch). Cross
// the top and you do NOT win — the city extends, difficulty escalates, and you
// respawn on a harder board. There is NO win state (see gridlockEngine.js).
//
// UNWINNABLE BY DESIGN: each crossing raises traffic speed/density without bound
// (engine `levelConfig` is unclamped; lane gaps shrink below the player's width),
// so completion is impossible. Every failure plays an ORIGINAL "mocking laugh"
// sting (asset slot public/arcade/audio/mock-laugh.mp3, silent/synth fallback).
//
// LEGAL: no copyrighted character/art/audio. The hauler + cabinet are drawn from
// primitives; the laugh is synthesized when the slot is empty (ASSETS.md M4).
//
// Accessibility: honors prefers-reduced-motion (no strobe/glow flashing; traffic
// still moves so the game stays playable), keyboard-driven, and touch-capable.
// ESC exit is routed by index.jsx (single owner) so it restores the world; this
// component also offers an on-screen EXIT button.
// ===========================================================================

const RESPAWN_MS = 600; // death-flash duration before respawn at the start row
const SKYLINE_SEED = 0xc1b07a11;

const KEY_DIR = {
  ArrowUp: 'up', KeyW: 'up',
  ArrowDown: 'down', KeyS: 'down',
  ArrowLeft: 'left', KeyA: 'left',
  ArrowRight: 'right', KeyD: 'right',
};

// Per-lane neon hues (cycled). Cars + lane tints pull from here.
const LANE_HUES = ['#36d6ff', '#ff5cf4', '#ffd23b', '#36ff9e', '#ff8a3b', '#9b5cff', '#00e0c6'];

function perfNow() {
  return typeof performance !== 'undefined' ? performance.now() : 0;
}

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return undefined;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(mq.matches);
    const onChange = (e) => setReduced(e.matches);
    if (mq.addEventListener) mq.addEventListener('change', onChange);
    else if (mq.addListener) mq.addListener(onChange);
    return () => {
      if (mq.removeEventListener) mq.removeEventListener('change', onChange);
      else if (mq.removeListener) mq.removeListener(onChange);
    };
  }, []);
  return reduced;
}

export default function GridlockGame({ onExit }) {
  const reducedMotion = usePrefersReducedMotion();
  const [coarse] = useState(() => isCoarsePointer());

  const canvasRef = useRef(null);
  const rootRef = useRef(null);
  const rafRef = useRef(0);
  const startPerfRef = useRef(0);
  const mountedRef = useRef(true);
  const reducedRef = useRef(reducedMotion);
  const onExitRef = useRef(onExit);
  const doMoveRef = useRef(null); // exposed so the touch D-pad buttons can step

  // mutable game state read every frame (no React churn during play).
  const gRef = useRef(null);
  if (gRef.current === null) {
    const board = buildBoard(0);
    gRef.current = {
      board,
      level: 0,
      hauled: 0, // successful crossings (each escalates difficulty)
      deaths: 0,
      player: startPos(board),
      lastDir: 'up',
      status: 'playing', // playing | respawning
      deathFlashAt: 0,
      escalateFlashAt: 0,
      bannerText: 'GRIDLOCK · HAUL THE CABINET ↑',
      bannerUntil: 0,
      // cached HUD strings (rebuilt only when the value changes)
      _hauled: -1, _hauledStr: '',
      _deaths: -1, _deathsStr: '',
      _block: -1, _blockStr: '',
    };
  }

  useEffect(() => { reducedRef.current = reducedMotion; }, [reducedMotion]);
  useEffect(() => { onExitRef.current = onExit; }, [onExit]);

  // ---- one mount-scoped effect owns the audio, RAF loop, input, layout ------
  useEffect(() => {
    mountedRef.current = true;
    const canvas = canvasRef.current;
    const ctx = canvas ? canvas.getContext('2d') : null;
    const audio = createGridlockAudio();
    // load the optional mock-laugh slot; on absence playLaugh() synthesizes one.
    audio.loadLaugh(ASSET_SLOTS.audio.mockLaugh);

    // best-effort true fullscreen (the overlay already covers the viewport).
    try {
      const el = rootRef.current;
      if (el && el.requestFullscreen) {
        const p = el.requestFullscreen();
        if (p && typeof p.catch === 'function') p.catch(() => {});
      }
    } catch { /* ignore */ }

    // ---- layout (recomputed on resize AND whenever the board's row count
    // changes on escalation) ----
    let W = 0;
    let H = 0;
    let baseGrad = null;
    let skyline = []; // precomputed building silhouettes (no per-frame alloc)
    const layout = {
      cell: 24, cols: COLS, rows: 5,
      boardLeft: 0, boardTop: 0, boardW: 0, boardH: 0,
      bannerFont: '', labelFont: '', hudFont: '',
      // cached lane-divider dash pattern (depends only on cell) — hoisted out of
      // the per-frame draw loop so we never allocate a dash array per road row.
      dashPattern: [12, 12],
    };
    const EMPTY_DASH = []; // shared "solid" reset, never mutated

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
      const usableH = H * 0.72; // headroom for HUD (top) + hint/D-pad (bottom)
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
      const dpr = Math.min(typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1, 1.5);
      W = window.innerWidth;
      H = window.innerHeight;
      canvas.width = Math.floor(W * dpr);
      canvas.height = Math.floor(H * dpr);
      canvas.style.width = '100%';
      canvas.style.height = '100%';
      if (ctx) {
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        baseGrad = ctx.createLinearGradient(0, 0, 0, H);
        baseGrad.addColorStop(0, '#0a0524');
        baseGrad.addColorStop(0.55, '#0c0726');
        baseGrad.addColorStop(1, '#04020c');
      }
      buildSkyline();
      relayout();
    };
    resize();
    window.addEventListener('resize', resize);

    // ---- per-frame render scratch (allocation-free) ----
    // The column/row→pixel maps are inlined at the hot call sites in draw() (no
    // per-call function overhead). Cars reuse ONE scratch array refilled via a
    // hoisted push callback, so iterating traffic allocates nothing per frame.
    const carScratch = [];
    const pushCar = (x) => { carScratch.push(x); };

    // ---- game transitions ----
    function escalate() {
      const g = gRef.current;
      g.hauled += 1;
      g.level += 1;
      g.board = buildBoard(g.level);
      g.player = startPos(g.board);
      g.lastDir = 'up';
      g.status = 'playing';
      g.bannerText = `BLOCK ${String(g.hauled + 1).padStart(2, '0')} · IT NEVER ENDS`;
      g.bannerUntil = perfNow() + 1900;
      if (!reducedRef.current) g.escalateFlashAt = perfNow();
      relayout();
      audio.playEscalate();
    }

    function die() {
      const g = gRef.current;
      if (g.status !== 'playing') return;
      g.deaths += 1;
      g.status = 'respawning';
      g.deathFlashAt = perfNow();
      audio.playLaugh(); // ORIGINAL mocking sting (slot or synth)
    }

    function doMove(dir) {
      const g = gRef.current;
      audio.resume(); // each input is a fresh gesture — unlock audio (iOS-safe)
      if (g.status !== 'playing') return;
      const prev = g.player;
      const next = stepPlayer(prev, dir, g.board);
      if (next.col === prev.col && next.row === prev.row) return; // clamped: no move
      g.player = next;
      g.lastDir = dir;
      audio.playStep();
      if (isGoal(next, g.board)) { escalate(); return; }
      const t = (perfNow() - startPerfRef.current) / 1000;
      if (playerHit(g.board, next, t)) die(); // stepped straight into traffic
    }
    doMoveRef.current = doMove;

    // ---- input ----
    const onKeyDown = (e) => {
      const dir = KEY_DIR[e.code];
      if (!dir) return; // ESC + everything else handled by index.jsx
      e.preventDefault();
      e.stopPropagation(); // keep arrows/WASD off the world Player (it's paused anyway)
      if (e.repeat) return; // discrete steps only — no key-repeat rushing
      doMove(dir);
    };

    let gestureStart = null;
    const onPointerDown = (e) => { gestureStart = { x: e.clientX, y: e.clientY }; };
    const onPointerUp = (e) => {
      if (!gestureStart) return;
      const dx = e.clientX - gestureStart.x;
      const dy = e.clientY - gestureStart.y;
      gestureStart = null;
      const TAP = 24;
      if (Math.abs(dx) < TAP && Math.abs(dy) < TAP) { doMove('up'); return; } // tap = advance
      if (Math.abs(dx) > Math.abs(dy)) doMove(dx > 0 ? 'right' : 'left');
      else doMove(dy < 0 ? 'up' : 'down'); // screen-up is forward
    };
    window.addEventListener('keydown', onKeyDown);
    if (canvas) {
      canvas.addEventListener('pointerdown', onPointerDown);
      canvas.addEventListener('pointerup', onPointerUp);
    }

    // ---- drawing ----
    function drawHauler(cx, cyTop, cell, dir, reduced) {
      // ORIGINAL parody "hauler": a little figure shoving an arcade cabinet. The
      // cabinet leads in the push direction; the figure leans in behind it.
      const cab = cell * 0.56;
      const half = cab / 2;
      const cyc = cyTop + cell / 2; // cell center y
      // lean offset in the push direction
      const dvx = dir === 'left' ? -1 : dir === 'right' ? 1 : 0;
      const dvy = dir === 'down' ? 1 : -1; // default & 'up' lead upward
      const lead = cell * 0.16;
      const cabX = cx + dvx * lead;
      const cabY = cyc + (dir === 'left' || dir === 'right' ? 0 : dvy * lead);
      // figure sits opposite the lead
      const figX = cx - dvx * cell * 0.12;
      const figY = cyc - (dir === 'left' || dir === 'right' ? 0 : dvy * lead) + cell * 0.04;

      // figure (cyan)
      ctx.save();
      ctx.fillStyle = '#36d6ff';
      if (!reduced) { ctx.shadowColor = '#36d6ff'; ctx.shadowBlur = 8; }
      // body
      ctx.beginPath();
      ctx.moveTo(figX - cab * 0.22, figY + half * 0.7);
      ctx.lineTo(figX + cab * 0.22, figY + half * 0.7);
      ctx.lineTo(figX + cab * 0.12, figY - half * 0.1);
      ctx.lineTo(figX - cab * 0.12, figY - half * 0.1);
      ctx.closePath();
      ctx.fill();
      // head
      ctx.beginPath();
      ctx.arc(figX, figY - half * 0.32, cab * 0.16, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // cabinet (magenta) being hauled
      ctx.save();
      ctx.translate(cabX, cabY);
      if (!reduced) { ctx.shadowColor = '#ff5cf4'; ctx.shadowBlur = 10; }
      ctx.fillStyle = '#2a0f3a';
      ctx.strokeStyle = '#ff5cf4';
      ctx.lineWidth = Math.max(1.5, cell * 0.05);
      roundRect(-half, -half, cab, cab, cell * 0.1);
      ctx.fill();
      ctx.stroke();
      // little glowing screen
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#9af7ff';
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
      const t = (tNow - startPerfRef.current) / 1000;
      const cell = layout.cell;

      // background + skyline
      ctx.fillStyle = baseGrad || '#05010f';
      ctx.fillRect(0, 0, W, H);
      for (let i = 0; i < skyline.length; i++) {
        const b = skyline[i];
        ctx.fillStyle = '#0d0726';
        ctx.fillRect(b.x, H - b.h, b.w, b.h);
        if (b.lit) {
          ctx.fillStyle = 'rgba(120,90,200,0.5)';
          ctx.fillRect(b.x, H - b.h, b.w, 2);
        }
      }

      // board (clipped so wrapping cars don't spill onto the skyline)
      ctx.save();
      ctx.beginPath();
      ctx.rect(layout.boardLeft, layout.boardTop, layout.boardW, layout.boardH);
      ctx.clip();

      for (let row = 0; row < board.rows; row++) {
        const yTop = layout.boardTop + (layout.rows - 1 - row) * cell; // row 0 = bottom
        const safe = isSafeRow(board, row);
        if (safe) {
          // sidewalk / median: lighter slab
          ctx.fillStyle = row === board.goalRow ? '#143a2a' : '#13213a';
          ctx.fillRect(layout.boardLeft, yTop, layout.boardW, cell);
          // hash texture
          ctx.strokeStyle = 'rgba(180,210,255,0.10)';
          ctx.lineWidth = 1;
          for (let hx = layout.boardLeft; hx < layout.boardLeft + layout.boardW; hx += cell * 0.5) {
            ctx.beginPath();
            ctx.moveTo(hx, yTop);
            ctx.lineTo(hx + cell * 0.3, yTop + cell);
            ctx.stroke();
          }
        } else {
          // asphalt + dashed centre line
          ctx.fillStyle = '#0a0a14';
          ctx.fillRect(layout.boardLeft, yTop, layout.boardW, cell);
          ctx.strokeStyle = 'rgba(230,220,120,0.35)';
          ctx.lineWidth = Math.max(1, cell * 0.04);
          ctx.setLineDash(layout.dashPattern); // hoisted: no per-row array alloc
          ctx.beginPath();
          ctx.moveTo(layout.boardLeft, yTop + cell / 2);
          ctx.lineTo(layout.boardLeft + layout.boardW, yTop + cell / 2);
          ctx.stroke();
          ctx.setLineDash(EMPTY_DASH);
        }
      }

      // goal stripe (checkered top edge — finish line you can never truly cross)
      const goalY = layout.boardTop + (layout.rows - 1 - board.goalRow) * cell;
      const sq = cell * 0.5;
      for (let i = 0; i * sq < layout.boardW; i++) {
        ctx.fillStyle = i % 2 === 0 ? '#36ff9e' : '#0a2a1c';
        ctx.fillRect(layout.boardLeft + i * sq, goalY + cell - 4, sq, 4);
      }

      // cars (allocation-free: refill the shared scratch via the hoisted callback)
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
          ctx.fillStyle = '#160a22';
          ctx.strokeStyle = hue;
          ctx.lineWidth = Math.max(1.5, cell * 0.05);
          if (!reduced) { ctx.shadowColor = hue; ctx.shadowBlur = 10; }
          roundRect(x + 2, yTop, w - 4, carH, cell * 0.14);
          ctx.fill();
          ctx.stroke();
          // headlight in the travel direction
          ctx.shadowBlur = 0;
          ctx.fillStyle = hue;
          const lx = lane.dir > 0 ? x + w - cell * 0.18 : x + cell * 0.06;
          ctx.fillRect(lx, yTop + carH * 0.3, cell * 0.12, carH * 0.4);
          ctx.restore();
        }
      }

      // player
      {
        const cx = layout.boardLeft + (g.player.col + 0.5) * cell;
        const cyTop = layout.boardTop + (layout.rows - 1 - g.player.row) * cell;
        const respawning = g.status === 'respawning';
        // blink while respawning
        const show = !respawning || (Math.floor(tNow / 90) % 2 === 0) || reduced;
        if (show) drawHauler(cx, cyTop, cell, g.lastDir, reduced);
      }

      ctx.restore(); // end board clip

      // escalate flash (gold pulse) — skipped in reduced motion
      if (!reduced && g.escalateFlashAt) {
        const age = tNow - g.escalateFlashAt;
        if (age < 380) {
          ctx.save();
          ctx.globalAlpha = 0.28 * (1 - age / 380);
          ctx.fillStyle = '#ffd23b';
          ctx.fillRect(0, 0, W, H);
          ctx.restore();
        }
      }

      // death flash (red vignette) — solid (no strobe) in reduced motion
      if (g.status === 'respawning') {
        const age = tNow - g.deathFlashAt;
        const k = reduced ? 0.32 : 0.42 * Math.max(0, 1 - age / RESPAWN_MS);
        ctx.save();
        ctx.globalAlpha = k;
        ctx.fillStyle = '#ff1f4f';
        ctx.fillRect(0, 0, W, H);
        ctx.restore();
        // SQUASHED feedback fades smoothly over the FULL respawn window in both
        // modes (globalAlpha handles it) — no abrupt mid-fade cutoff, which a
        // reduced-motion user would read as a flash.
        ctx.save();
        ctx.globalAlpha = Math.max(0, 1 - age / RESPAWN_MS);
        ctx.fillStyle = '#ffd9e2';
        ctx.font = layout.bannerFont;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('SQUASHED', W / 2, H * 0.42);
        ctx.restore();
      }

      // HUD: hauled / deaths / block label
      if (g.hauled !== g._hauled) { g._hauled = g.hauled; g._hauledStr = `HAULED ${g.hauled}`; }
      if (g.deaths !== g._deaths) { g._deaths = g.deaths; g._deathsStr = `SQUASHED ${g.deaths}`; }
      if (g.level !== g._block) { g._block = g.level; g._blockStr = `BLOCK ${String(g.level + 1).padStart(2, '0')}`; }
      ctx.save();
      ctx.textBaseline = 'top';
      ctx.font = layout.hudFont;
      ctx.textAlign = 'left';
      ctx.fillStyle = '#cfe6ff';
      ctx.fillText(g._hauledStr, 18, 16);
      ctx.fillStyle = '#ff9db4';
      ctx.fillText(g._deathsStr, 18, 36);
      ctx.textAlign = 'right';
      ctx.fillStyle = '#36d6ff';
      ctx.fillText(g._blockStr, W - 18, 16);
      ctx.restore();

      // banner (intro / escalation)
      if (tNow < g.bannerUntil && g.bannerText) {
        const remain = g.bannerUntil - tNow;
        const a = Math.min(1, remain / 500);
        ctx.save();
        ctx.globalAlpha = a;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#f6e9ff';
        ctx.font = layout.bannerFont;
        if (!reduced) { ctx.shadowColor = '#ff48c4'; ctx.shadowBlur = 20; }
        ctx.fillText(g.bannerText, W / 2, layout.boardTop * 0.6);
        ctx.restore();
      }
    }

    function frame() {
      // A frame may already be queued in the rAF buffer when we unmount; bail so
      // game logic (respawn/collision/die) never runs after teardown started.
      if (!mountedRef.current) return;
      const g = gRef.current;
      const tNow = perfNow();
      if (g.status === 'respawning' && tNow - g.deathFlashAt > RESPAWN_MS) {
        g.player = startPos(g.board);
        g.lastDir = 'up';
        g.status = 'playing';
      }
      if (g.status === 'playing') {
        const t = (tNow - startPerfRef.current) / 1000;
        if (playerHit(g.board, g.player, t)) die(); // traffic drove into a standing player
      }
      draw();
      rafRef.current = requestAnimationFrame(frame);
    }

    // kick off
    startPerfRef.current = perfNow();
    gRef.current.bannerUntil = startPerfRef.current + 2400;
    rafRef.current = requestAnimationFrame(frame);

    return () => {
      mountedRef.current = false;
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener('resize', resize);
      window.removeEventListener('keydown', onKeyDown);
      if (canvas) {
        canvas.removeEventListener('pointerdown', onPointerDown);
        canvas.removeEventListener('pointerup', onPointerUp);
      }
      doMoveRef.current = null;
      audio.dispose();
      try {
        if (typeof document !== 'undefined' && document.fullscreenElement) {
          const p = document.exitFullscreen();
          if (p && typeof p.catch === 'function') p.catch(() => {});
        }
      } catch { /* ignore */ }
    };
    // mount-once: live values (reducedMotion / onExit) read via refs so the loop
    // never tears down mid-run.
     
  }, []);

  const handleExit = useCallback(() => {
    if (onExitRef.current) onExitRef.current();
  }, []);

  const padMove = useCallback((dir) => {
    if (doMoveRef.current) doMoveRef.current(dir);
  }, []);

  return (
    <div
      ref={rootRef}
      role="application"
      aria-label="GRIDLOCK crossing game"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 10001,
        background: '#04020c',
        overflow: 'hidden',
        touchAction: 'none',
        userSelect: 'none',
      }}
    >
      <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, display: 'block' }} aria-hidden />

      {/* exit (ESC also exits — routed by index.jsx) */}
      <button
        type="button"
        onClick={handleExit}
        style={{
          position: 'absolute',
          top: 14,
          right: 14,
          zIndex: 3,
          color: '#fff',
          background: 'rgba(255,59,107,0.85)',
          border: '1px solid #ff3b6b',
          borderRadius: 8,
          padding: '8px 14px',
          fontFamily: 'monospace',
          fontWeight: 700,
          cursor: 'pointer',
        }}
      >
        EXIT ✕
      </button>

      {/* input hint */}
      <div
        style={{
          position: 'absolute',
          bottom: coarse ? 150 : 26,
          left: '50%',
          transform: 'translateX(-50%)',
          color: '#8aa0c8',
          fontFamily: 'monospace',
          fontSize: 12,
          textAlign: 'center',
          pointerEvents: 'none',
          zIndex: 2,
          textShadow: '0 0 8px #000',
        }}
      >
        {coarse
          ? 'tap / swipe (or use the pad) to shove the cabinet ↑ · it never ends'
          : 'arrow keys / WASD to shove the cabinet across · ESC to exit · it never ends'}
      </div>

      {/* touch D-pad (coarse pointers only) */}
      {coarse && <DPad onMove={padMove} />}
    </div>
  );
}

// On-screen directional pad for touch. Each press = one discrete step. Synthetic
// pointer handlers call straight into the game's doMove via the parent ref.
function DPad({ onMove }) {
  const btn = (label, dir, extra) => (
    <button
      type="button"
      aria-label={`move ${dir}`}
      onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); onMove(dir); }}
      style={{
        width: 56,
        height: 56,
        borderRadius: 12,
        border: '1px solid #2a1d66',
        background: 'rgba(20,12,46,0.8)',
        color: '#bfe9ff',
        fontFamily: 'monospace',
        fontSize: 22,
        fontWeight: 800,
        touchAction: 'none',
        cursor: 'pointer',
        ...extra,
      }}
    >
      {label}
    </button>
  );
  return (
    <div
      style={{
        position: 'absolute',
        bottom: 24,
        left: '50%',
        transform: 'translateX(-50%)',
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 56px)',
        gridTemplateRows: 'repeat(2, 56px)',
        gap: 8,
        zIndex: 4,
      }}
    >
      <div />
      {btn('↑', 'up')}
      <div />
      {btn('←', 'left')}
      {btn('↓', 'down')}
      {btn('→', 'right')}
    </div>
  );
}
