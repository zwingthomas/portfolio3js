import { useEffect, useRef, useState, useCallback } from 'react';
import { isCoarsePointer } from '../touchInput';
import { createNeonRunnerAudio } from './neonRunnerAudio';
import {
  GRID,
  DIR,
  CELL,
  idx,
  createDuel,
  setDir,
  step,
  isOver,
} from './neonRunnerEngine';

// ===========================================================================
// NeonRunnerGame — Milestone-7 "NEON RUNNER" grid duel (ORIGINAL name + art).
//
// The encounter triggered when the player rides into a hub "tall grass" zone
// (see Cycle.jsx + the GrassEncounter watcher in index.jsx). A full-screen DOM
// overlay (mounted from src/arcade/index.jsx like the cabinet games / the M2
// loader): you and a CPU each leave a neon light-trail across a grid; steer with
// the arrow keys / WASD (or the on-screen D-pad / swipes on touch); the last
// rider standing wins. The duel ALWAYS RESOLVES (win / lose / draw) — the board
// is finite — then hands control back to the world.
//
// LEGAL: the neon-cycle "leave a wall, last standing wins" GENRE is inspiration
// only; the name, art, and audio are ORIGINAL (never a real Tron character /
// logo / likeness). The duel ships NO asset files — all sound is synthesized.
//
// Accessibility: honors prefers-reduced-motion (no strobe/glow flashing; the
// duel still plays), keyboard-driven, and touch-capable. ESC exit is routed by
// index.jsx (single owner) so it restores the world; an on-screen EXIT button
// and "tap to continue" (once resolved) are also provided.
// ===========================================================================

const TICK_MS = 110; // duel advances one cell every this many ms
const START_DELAY_MS = 1100; // "ready" beat: hold the board still under the intro banner before the first auto-step
const RESULT_MS = 2000; // how long the win/lose/draw card lingers before auto-exit
const DUEL_SEED = 0x4e07; // fixed seed base; nudged by the per-encounter `seed` prop

const KEY_DIR = {
  ArrowUp: DIR.up, KeyW: DIR.up,
  ArrowDown: DIR.down, KeyS: DIR.down,
  ArrowLeft: DIR.left, KeyA: DIR.left,
  ArrowRight: DIR.right, KeyD: DIR.right,
};

const PLAYER_COLOR = '#36d6ff';
const CPU_COLOR = '#ff5cf4';
const BG_TOP = '#070a1e';
const BG_BOT = '#03040c';

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

export default function NeonRunnerGame({ onExit, seed = 1 }) {
  const reducedMotion = usePrefersReducedMotion();
  const [coarse] = useState(() => isCoarsePointer());

  const canvasRef = useRef(null);
  const rootRef = useRef(null);
  const rafRef = useRef(0);
  const mountedRef = useRef(true);
  const reducedRef = useRef(reducedMotion);
  const onExitRef = useRef(onExit);
  const turnRef = useRef(null); // exposed so the touch D-pad can steer
  const resultLiveRef = useRef(null); // polite live region for the duel outcome

  // mutable duel + timing state read every frame (no React churn during play).
  const gRef = useRef(null);
  if (gRef.current === null) {
    gRef.current = {
      duel: createDuel((DUEL_SEED + (seed | 0)) | 0),
      lastTick: 0,
      resultAt: 0,
      exited: false,
      bannerText: 'NEON RUNNER · LAST RIDER STANDING',
      bannerUntil: 0,
      // cached result strings (built once on resolve)
      _resultStr: '', _resultSub: '',
    };
  }

  useEffect(() => { reducedRef.current = reducedMotion; }, [reducedMotion]);
  useEffect(() => { onExitRef.current = onExit; }, [onExit]);

  // ---- one mount-scoped effect owns the audio, RAF loop, input, layout ------
  useEffect(() => {
    mountedRef.current = true;
    const canvas = canvasRef.current;
    const ctx = canvas ? canvas.getContext('2d') : null;
    const audio = createNeonRunnerAudio();

    // best-effort true fullscreen (the overlay already covers the viewport).
    try {
      const el = rootRef.current;
      if (el && el.requestFullscreen) {
        const p = el.requestFullscreen();
        if (p && typeof p.catch === 'function') p.catch(() => {});
      }
    } catch { /* ignore */ }

    // ---- layout (recomputed on resize) ----
    let W = 0;
    let H = 0;
    let baseGrad = null;
    const layout = {
      cell: 18, left: 0, top: 0, size: 0,
      bannerFont: '', resultFont: '', subFont: '', hudFont: '',
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
        baseGrad.addColorStop(0, BG_TOP);
        baseGrad.addColorStop(1, BG_BOT);
      }
      relayout();
    };
    resize();
    window.addEventListener('resize', resize);

    // ---- input: steer the player rider ----
    function turn(dir) {
      audio.resume(); // each input is a fresh gesture — unlock audio (iOS-safe)
      const g = gRef.current;
      if (isOver(g.duel)) { exitNow(); return; }
      if (setDir(g.duel, 'player', dir)) audio.playTurn();
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
      if (isOver(g.duel) && (e.code === 'Enter' || e.code === 'Space')) {
        e.preventDefault();
        exitNow();
        return;
      }
      const dir = KEY_DIR[e.code];
      if (dir === undefined) return; // ESC + everything else handled by index.jsx
      e.preventDefault();
      e.stopPropagation(); // keep arrows/WASD off the world Player (it's paused anyway)
      if (e.repeat) return;
      turn(dir);
    };

    // swipe / tap to steer (touch).
    let gestureStart = null;
    const onPointerDown = (e) => { gestureStart = { x: e.clientX, y: e.clientY }; };
    const onPointerUp = (e) => {
      if (!gestureStart) return;
      const dx = e.clientX - gestureStart.x;
      const dy = e.clientY - gestureStart.y;
      gestureStart = null;
      if (isOver(gRef.current.duel)) { exitNow(); return; } // tap to continue
      const TAP = 24;
      if (Math.abs(dx) < TAP && Math.abs(dy) < TAP) return;
      if (Math.abs(dx) > Math.abs(dy)) turn(dx > 0 ? DIR.right : DIR.left);
      else turn(dy < 0 ? DIR.up : DIR.down);
    };
    window.addEventListener('keydown', onKeyDown);
    if (canvas) {
      canvas.addEventListener('pointerdown', onPointerDown);
      canvas.addEventListener('pointerup', onPointerUp);
    }

    // ---- drawing ----
    function cellRect(col, row) {
      // returns nothing; draws at the precomputed layout (alloc-free).
      const x = layout.left + col * layout.cell;
      const y = layout.top + row * layout.cell;
      ctx.fillRect(x + 1, y + 1, layout.cell - 2, layout.cell - 2);
    }

    // Hoisted out of draw() so NO closure is allocated per frame (zero-alloc
    // gate, matching CascadeGame's hoisted draw callbacks). `reduced`
    // (reducedRef.current) is the only frame-varying input, passed as an arg.
    function drawHead(rider, color, reduced) {
      ctx.save();
      ctx.fillStyle = color;
      if (!reduced) { ctx.shadowColor = color; ctx.shadowBlur = 14; }
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

      // background
      ctx.fillStyle = baseGrad || BG_TOP;
      ctx.fillRect(0, 0, W, H);

      // arena frame + faint grid
      ctx.strokeStyle = 'rgba(120,90,200,0.5)';
      ctx.lineWidth = 2;
      ctx.strokeRect(layout.left - 1, layout.top - 1, layout.size + 2, layout.size + 2);
      if (!reduced) {
        ctx.strokeStyle = 'rgba(80,70,140,0.16)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let i = 1; i < GRID; i++) {
          const gx = layout.left + i * cell;
          const gy = layout.top + i * cell;
          ctx.moveTo(gx, layout.top); ctx.lineTo(gx, layout.top + layout.size);
          ctx.moveTo(layout.left, gy); ctx.lineTo(layout.left + layout.size, gy);
        }
        ctx.stroke();
      }

      // trails (one pass over the grid; no per-frame alloc)
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

      // heads (bright, with glow unless reduced motion). drawHead is hoisted to
      // the effect body so no per-frame closure is allocated.
      drawHead(duel.player, PLAYER_COLOR, reduced);
      drawHead(duel.cpu, CPU_COLOR, reduced);

      // intro banner
      if (tNow < g.bannerUntil && g.bannerText) {
        const a = Math.min(1, (g.bannerUntil - tNow) / 500);
        ctx.save();
        ctx.globalAlpha = a;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#dfeaff';
        ctx.font = layout.bannerFont;
        if (!reduced) { ctx.shadowColor = '#48b4ff'; ctx.shadowBlur = 18; }
        ctx.fillText(g.bannerText, W / 2, layout.top * 0.58);
        ctx.restore();
      }

      // HUD legend
      ctx.save();
      ctx.font = layout.hudFont;
      ctx.textBaseline = 'top';
      ctx.textAlign = 'left';
      ctx.fillStyle = PLAYER_COLOR;
      ctx.fillText('YOU', 18, 16);
      ctx.textAlign = 'right';
      ctx.fillStyle = CPU_COLOR;
      ctx.fillText('RIVAL', W - 18, 16);
      ctx.restore();

      // result card
      if (isOver(duel)) {
        const dim = reduced ? 0.55 : 0.62;
        ctx.save();
        ctx.globalAlpha = dim;
        ctx.fillStyle = '#05030f';
        ctx.fillRect(0, 0, W, H);
        ctx.restore();
        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = layout.resultFont;
        const win = duel.status === 'win';
        const draw = duel.status === 'draw';
        ctx.fillStyle = win ? '#36ff9e' : draw ? '#ffd23b' : '#ff5c7a';
        if (!reduced) { ctx.shadowColor = ctx.fillStyle; ctx.shadowBlur = 22; }
        ctx.fillText(g._resultStr, W / 2, H * 0.44);
        ctx.shadowBlur = 0;
        ctx.font = layout.subFont;
        ctx.fillStyle = '#bfe9ff';
        ctx.fillText(g._resultSub, W / 2, H * 0.44 + Math.max(40, H * 0.07));
        ctx.restore();
      }
    }

    // ---- main loop ----
    function frame() {
      if (!mountedRef.current) return; // a queued rAF may fire post-unmount
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
            g._resultStr = s === 'win' ? 'YOU WIN' : s === 'draw' ? 'DRAW' : 'DEFEATED';
            g._resultSub = s === 'win'
              ? 'rival derezzed · tap / Enter to ride on'
              : s === 'draw'
                ? 'mutual wipeout · tap / Enter to ride on'
                : 'you derezzed · tap / Enter to ride on';
            // Announce the outcome once to assistive tech (the canvas is
            // aria-hidden) — a single write on resolve, no per-frame alloc.
            if (resultLiveRef.current) {
              resultLiveRef.current.textContent = `${g._resultStr}. ${g._resultSub}`;
            }
            if (s === 'win') audio.playWin();
            else if (s === 'draw') audio.playCrash();
            else { audio.playCrash(); audio.playLose(); }
          }
        }
      } else if (g.resultAt && tNow - g.resultAt > RESULT_MS) {
        // auto-hand control back to the world after the result lingers.
        if (!g.exited) { g.exited = true; if (onExitRef.current) onExitRef.current(); }
      }

      draw();
      rafRef.current = requestAnimationFrame(frame);
    }

    // kick off — hold the board still for a short "ready" beat under the intro
    // banner so a player reading it isn't auto-driven into a wall before they
    // can steer (the player rider auto-advances DIR.up from the first tick).
    const t0 = perfNow();
    gRef.current.bannerUntil = t0 + 2200;
    gRef.current.lastTick = t0 + START_DELAY_MS;
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
      turnRef.current = null;
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

  const padTurn = useCallback((dir) => {
    if (turnRef.current) turnRef.current(dir);
  }, []);

  return (
    <div
      ref={rootRef}
      role="application"
      aria-label="NEON RUNNER grid duel"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 10001,
        background: BG_BOT,
        overflow: 'hidden',
        touchAction: 'none',
        userSelect: 'none',
      }}
    >
      <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, display: 'block' }} aria-hidden />

      {/* Visually-hidden polite live region: the win/lose/draw outcome (painted
          on the aria-hidden canvas) is announced here once on resolve, so
          screen-reader users learn the result + that control is handed back. */}
      <div
        ref={resultLiveRef}
        role="status"
        aria-live="polite"
        style={{
          position: 'absolute',
          width: 1,
          height: 1,
          padding: 0,
          margin: -1,
          overflow: 'hidden',
          clip: 'rect(0 0 0 0)',
          whiteSpace: 'nowrap',
          border: 0,
        }}
      />

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
          ? 'swipe / pad to steer · cut off the rival · ESC to exit'
          : 'arrow keys / WASD to steer · cut off the rival · ESC to exit'}
      </div>

      {/* touch D-pad (coarse pointers only) */}
      {coarse && <DPad onTurn={padTurn} />}
    </div>
  );
}

// On-screen directional pad for touch. Each press sets the rider's heading.
function DPad({ onTurn }) {
  const btn = (label, dir, extra) => (
    <button
      type="button"
      aria-label={`steer ${label}`}
      onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); onTurn(dir); }}
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
      {btn('↑', DIR.up)}
      <div />
      {btn('←', DIR.left)}
      {btn('↓', DIR.down)}
      {btn('→', DIR.right)}
    </div>
  );
}
