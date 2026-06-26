import { useEffect, useRef, useState, useCallback } from 'react';
import { ASSET_SLOTS } from '../assets';
import { isCoarsePointer } from '../touchInput';
import { createCascadeAudio } from './cascadeAudio';
import {
  COLS,
  ROWS,
  colorIndex,
  forEachPieceCell,
  tryMove,
  gravityMs,
  createGame,
  moveLeft,
  moveRight,
  rotateGame,
  dropStep,
  lockAndSpawn,
  hardDrop,
} from './cascadeEngine';

// ===========================================================================
// CascadeGame — Milestone-5 stack cabinet "CASCADE" (ORIGINAL falling-block
// puzzle, original name + art).
//
// A full-screen DOM overlay (mounted from src/arcade/index.jsx like PULSE /
// GRIDLOCK / the M2 loader) rendering a single canvas: an ORIGINAL neon arcade
// cabinet whose screen frames a 10×20 falling-block playfield. Move with the
// arrow keys / WASD, rotate with Up/X (CW) or Z (CCW), soft-drop with Down,
// hard-drop with Space. On touch: swipe to move, swipe-down to drop, tap to
// rotate, plus an on-screen control pad. Clear lines to score; topping out shows
// a game-over panel you can restart (R / tap / button). ESC exits (routed by
// index.jsx) and restores the world.
//
// WHY NOT AN IFRAME TO tetr.io: tetr.io serves `X-Frame-Options`/a frame-ancestors
// CSP that BLOCK embedding it in another site, and its Terms of Service forbid
// embedding/reframing the game. So we do NOT iframe it — we render our OWN
// original falling-block game in-world (see cascadeEngine.js for the pure logic).
//
// LEGAL: original game. The seven tetromino shapes are public-domain geometry;
// the cabinet bezel, stickers, palette and audio are all original (optional art
// slot public/arcade/textures/stack-cabinet.png + SFX slot
// public/arcade/audio/stack-clear.mp3, both with procedural/synth fallbacks —
// ASSETS.md M5). NOT "Tetris" (original name CASCADE).
//
// Accessibility: honors prefers-reduced-motion (no line-clear strobe / block
// glow flashing; the game stays fully playable), keyboard-driven, touch-capable.
// Performance: ZERO per-frame allocation (cached rotation table + hoisted draw
// helpers + a single mount-scoped RAF), DPR-capped canvas, full teardown.
// ===========================================================================

const DAS_MS = 150; // delay before a held left/right auto-repeats
const ARR_MS = 45; // auto-repeat interval once DAS elapses
const SOFT_DROP_MS = 45; // drop cadence while soft-drop is held
const LOCK_DELAY_MS = 480; // grace after a piece lands before it locks
const MAX_LOCK_RESETS = 15; // cap move/rotate lock-delay resets (anti-stall)
const CLEAR_FLASH_MS = 320; // line-clear feedback duration
const SEED = 0x5a17c0de; // deterministic-ish first board (re-seeded on restart)

// ORIGINAL corner-sticker decal colors (module-level so the bezel draw never
// allocates an array per frame — see drawCabinetFrame).
const STICKER_COLORS = ['#ffd23b', '#36ff9e', '#00e0c6', '#ff8a3b'];

// ORIGINAL neon palette, indexed by the engine's piece color index (1..7).
const PIECE_COLORS = [
  '#0a0a14', // 0 — empty (unused as a fill)
  '#36d6ff', // I — cyan
  '#ffd23b', // O — gold
  '#ff5cf4', // T — magenta
  '#36ff9e', // S — green
  '#ff3b6b', // Z — red
  '#5a8bff', // J — blue
  '#ff8a3b', // L — orange
];

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

export default function CascadeGame({ onExit }) {
  const reducedMotion = usePrefersReducedMotion();
  const [coarse] = useState(() => isCoarsePointer());

  const canvasRef = useRef(null);
  const rootRef = useRef(null);
  const rafRef = useRef(0);
  const mountedRef = useRef(true);
  const reducedRef = useRef(reducedMotion);
  const onExitRef = useRef(onExit);
  // exposed so the touch control pad + game-over button can drive the game.
  const actionRef = useRef(null);

  // mutable game state read every frame (no React churn during play). The engine
  // game lives on gRef.current.game and is reassigned by the pure reducers.
  const gRef = useRef(null);
  if (gRef.current === null) {
    gRef.current = {
      game: createGame(SEED),
      // input/timing state (component-owned; engine stays pure)
      seed: SEED,
      dropAcc: 0, // ms accumulator toward the next gravity step
      landed: false, // resting on the stack (lock-delay armed)
      lockAt: 0, // timestamp the piece will lock at (0 = not armed)
      lockResets: 0, // move/rotate lock-delay resets used this piece
      lowestRow: -Infinity, // deepest piece.y reached this spawn (anti-stall baseline)
      softHeld: false,
      hDir: 0, // held horizontal: -1, 0, +1
      hSince: 0, // when the hold began (for DAS)
      hNext: 0, // next auto-repeat time
      clearFlashAt: 0, // line-clear feedback start
      clearCount: 0, // lines cleared in the last lock
      paused: false,
      pauseStart: 0, // perfNow() when the current pause began (for timer rebasing)
      // cached HUD strings (rebuilt only when the value changes)
      _score: -1, _scoreStr: '',
      _lines: -1, _linesStr: '',
      _level: -1, _levelStr: '',
      _compactA: '', _compactB: '', // cached compact-mode HUD lines
    };
  }

  // re-render trigger for the React game-over panel (kept off the hot path).
  const [over, setOver] = useState(false);

  useEffect(() => { reducedRef.current = reducedMotion; }, [reducedMotion]);
  useEffect(() => { onExitRef.current = onExit; }, [onExit]);

  // ---- one mount-scoped effect owns audio, RAF, input, layout ----------------
  useEffect(() => {
    mountedRef.current = true;
    const canvas = canvasRef.current;
    const ctx = canvas ? canvas.getContext('2d') : null;
    const audio = createCascadeAudio();
    audio.loadClear(ASSET_SLOTS.audio.stackClear); // optional slot; synth fallback

    // optional cabinet bezel art (procedural fallback when the slot is empty).
    let bezelImg = null;
    let bezelLoader = null;
    if (typeof Image !== 'undefined' && ASSET_SLOTS.textures && ASSET_SLOTS.textures.stackCabinet) {
      bezelLoader = new Image();
      bezelLoader.onload = () => { bezelImg = bezelLoader; };
      bezelLoader.onerror = () => { bezelImg = null; };
      bezelLoader.src = ASSET_SLOTS.textures.stackCabinet;
    }

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
      cell: 22,
      boardLeft: 0, boardTop: 0, boardW: 0, boardH: 0,
      panelLeft: 0, panelW: 0, compact: false,
      bezel: 14, // bezel thickness around the screen
      titleFont: '', labelFont: '', valueFont: '', hudFont: '', bigFont: '',
    };

    const relayout = () => {
      if (!W || !H) return;
      const compact = W < 720; // stack the side panel above the board when tight
      const availH = H * (compact ? 0.74 : 0.84);
      // reserve horizontal room for the side panel in wide mode.
      const panelW = compact ? 0 : Math.max(132, Math.min(220, W * 0.18));
      const gap = compact ? 0 : Math.max(16, W * 0.02);
      const availW = (W * 0.96) - panelW - gap;
      const cell = Math.max(12, Math.floor(Math.min(availH / ROWS, availW / COLS)));
      const boardW = cell * COLS;
      const boardH = cell * ROWS;
      const bezel = Math.max(10, Math.round(cell * 0.55));
      const totalW = boardW + (compact ? 0 : gap + panelW);
      const groupLeft = Math.round((W - totalW) / 2);
      layout.cell = cell;
      layout.bezel = bezel;
      layout.boardW = boardW;
      layout.boardH = boardH;
      layout.boardLeft = groupLeft;
      layout.boardTop = Math.round(Math.max(H * (compact ? 0.16 : 0.09), (H - boardH) / 2));
      layout.compact = compact;
      layout.panelW = panelW;
      layout.panelLeft = groupLeft + boardW + gap;
      layout.titleFont = `800 ${Math.max(18, Math.round(cell * 1.1))}px 'Courier New', monospace`;
      layout.labelFont = `700 ${Math.max(11, Math.round(cell * 0.52))}px 'Courier New', monospace`;
      layout.valueFont = `800 ${Math.max(16, Math.round(cell * 0.82))}px 'Courier New', monospace`;
      layout.hudFont = "700 13px 'Courier New', monospace";
      layout.bigFont = `800 ${Math.max(26, Math.min(64, W * 0.06))}px 'Courier New', monospace`;
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
        baseGrad.addColorStop(0.6, '#0b0626');
        baseGrad.addColorStop(1, '#04020c');
      }
      relayout();
    };
    resize();
    window.addEventListener('resize', resize);

    // ---- helpers shared by drawing (hoisted; no per-frame allocation) ----
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

    // hoisted (defined once) so the bezel's four corner decals never create a
    // per-frame closure.
    function drawSticker(x, y, r, color) {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }

    // hoisted (defined once) so the wide-mode side panel never builds a per-frame
    // stat closure. Reads ctx + layout fonts from the effect closure.
    function drawStat(label, value, color, sx, sy, lh) {
      ctx.fillStyle = '#7f93c4';
      ctx.font = layout.labelFont;
      ctx.fillText(label, sx, sy);
      ctx.fillStyle = color;
      ctx.font = layout.valueFont;
      ctx.fillText(value, sx, sy + lh);
    }

    // draw one mino at board column/row (col,row) — used for the stack, the
    // active piece, and (filled=false) the ghost outline.
    function drawCell(px, py, size, color, reduced, filled, alpha) {
      const inset = Math.max(1, size * 0.06);
      const s = size - inset * 2;
      ctx.save();
      ctx.globalAlpha = alpha;
      if (filled) {
        ctx.fillStyle = color;
        if (!reduced) { ctx.shadowColor = color; ctx.shadowBlur = size * 0.4; }
        roundRect(px + inset, py + inset, s, s, size * 0.16);
        ctx.fill();
        // inner highlight (top-left) for a beveled look
        ctx.shadowBlur = 0;
        ctx.globalAlpha = alpha * 0.5;
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        roundRect(px + inset * 1.6, py + inset * 1.6, s * 0.42, s * 0.42, size * 0.1);
        ctx.fill();
      } else {
        // ghost: hollow outline
        ctx.strokeStyle = color;
        ctx.lineWidth = Math.max(1.5, size * 0.07);
        ctx.globalAlpha = alpha;
        roundRect(px + inset, py + inset, s, s, size * 0.16);
        ctx.stroke();
      }
      ctx.restore();
    }

    // hoisted draw callbacks for forEachPieceCell (avoid per-frame closures).
    let dpCell = 0, dpColor = '#fff', dpReduced = false, dpFilled = true, dpAlpha = 1;
    const drawActiveCb = (c, r) => {
      if (r < 0) return; // cells poking above the screen aren't drawn
      const px = layout.boardLeft + c * dpCell;
      const py = layout.boardTop + r * dpCell;
      drawCell(px, py, dpCell, dpColor, dpReduced, dpFilled, dpAlpha);
    };

    // mini preview (next piece) — centered in a small box at (bx,by,bw,bh).
    let pvCell = 0, pvOx = 0, pvOy = 0, pvColor = '#fff', pvReduced = false;
    const previewCb = (c, r) => {
      drawCell(pvOx + c * pvCell, pvOy + r * pvCell, pvCell, pvColor, pvReduced, true, 1);
    };

    // shared scratch for the NEXT preview so the per-frame draw never allocates a
    // piece literal / closure / bounds object. computeNextBounds() mutates these.
    const previewPiece = { type: 'I', rot: 0, x: 0, y: 0 };
    let nbMinX = 0, nbMinY = 0, nbMaxX = 0, nbMaxY = 0;
    const boundsCb = (c, r) => {
      if (c < nbMinX) nbMinX = c;
      if (c > nbMaxX) nbMaxX = c;
      if (r < nbMinY) nbMinY = r;
      if (r > nbMaxY) nbMaxY = r;
    };
    function computeNextBounds(type) {
      previewPiece.type = type; previewPiece.rot = 0; previewPiece.x = 0; previewPiece.y = 0;
      nbMinX = 9; nbMinY = 9; nbMaxX = -9; nbMaxY = -9;
      forEachPieceCell(previewPiece, boundsCb);
    }

    function drawCabinetFrame() {
      const bz = layout.bezel;
      const bx = layout.boardLeft - bz;
      const by = layout.boardTop - bz;
      const bw = layout.boardW + bz * 2;
      const bh = layout.boardH + bz * 2;
      ctx.save();
      if (bezelImg) {
        // optional original art frames the screen (drawn behind the playfield).
        try { ctx.drawImage(bezelImg, bx - bz, by - bz * 1.6, bw + bz * 2, bh + bz * 3); } catch { /* ignore */ }
      } else {
        // procedural ORIGINAL neon bezel: a dark rounded shell + glowing edge.
        ctx.fillStyle = '#160a2c';
        roundRect(bx, by, bw, bh, bz * 0.9);
        ctx.fill();
        ctx.lineWidth = Math.max(2, bz * 0.32);
        ctx.strokeStyle = '#ff5cf4';
        if (!reducedRef.current) { ctx.shadowColor = '#ff5cf4'; ctx.shadowBlur = bz; }
        roundRect(bx, by, bw, bh, bz * 0.9);
        ctx.stroke();
        ctx.shadowBlur = 0;
        ctx.strokeStyle = '#36d6ff';
        ctx.lineWidth = Math.max(1, bz * 0.14);
        roundRect(bx + bz * 0.35, by + bz * 0.35, bw - bz * 0.7, bh - bz * 0.7, bz * 0.7);
        ctx.stroke();
        // ORIGINAL corner "stickers": little geometric decals (no IP). Drawn
        // from the four corners with no per-frame array (positions inlined).
        const sr = bz * 0.5;
        const sIn = bz * 0.9;
        ctx.globalAlpha = 0.85;
        drawSticker(bx + sIn, by + sIn, sr, STICKER_COLORS[0]);
        drawSticker(bx + bw - sIn, by + sIn, sr, STICKER_COLORS[1]);
        drawSticker(bx + sIn, by + bh - sIn, sr, STICKER_COLORS[2]);
        drawSticker(bx + bw - sIn, by + bh - sIn, sr, STICKER_COLORS[3]);
        ctx.globalAlpha = 1;
      }
      ctx.restore();
    }

    function drawBoardBackground() {
      // playfield screen
      ctx.fillStyle = '#06030f';
      ctx.fillRect(layout.boardLeft, layout.boardTop, layout.boardW, layout.boardH);
      // faint grid
      ctx.strokeStyle = 'rgba(120,140,200,0.08)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let c = 1; c < COLS; c++) {
        const x = layout.boardLeft + c * layout.cell;
        ctx.moveTo(x, layout.boardTop);
        ctx.lineTo(x, layout.boardTop + layout.boardH);
      }
      for (let r = 1; r < ROWS; r++) {
        const y = layout.boardTop + r * layout.cell;
        ctx.moveTo(layout.boardLeft, y);
        ctx.lineTo(layout.boardLeft + layout.boardW, y);
      }
      ctx.stroke();
    }

    function drawSidePanel(g) {
      const cell = layout.cell;
      const reduced = reducedRef.current;
      const compact = layout.compact;
      // NEXT preview box
      let bx;
      let by;
      let bw;
      let bh;
      if (compact) {
        // a small box tucked at the top-right inside the screen header area
        bw = cell * 4.2;
        bh = cell * 3.2;
        bx = layout.boardLeft + layout.boardW - bw;
        by = layout.boardTop - layout.bezel - bh - 6;
        if (by < 4) by = 4;
      } else {
        bw = layout.panelW;
        bh = cell * 4.4;
        bx = layout.panelLeft;
        by = layout.boardTop;
      }
      ctx.save();
      ctx.fillStyle = 'rgba(14,8,38,0.85)';
      ctx.strokeStyle = '#2a1d66';
      ctx.lineWidth = 1.5;
      roundRect(bx, by, bw, bh, 8);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#9bb4e8';
      ctx.font = layout.labelFont;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText('NEXT', bx + 10, by + 8);
      // draw the next piece centered in the lower portion of the box. Uses the
      // shared previewPiece + nb* scratch (no per-frame allocation).
      const nextType = g.queue[0];
      if (nextType) {
        computeNextBounds(nextType); // sets previewPiece.type=nextType + nb* bounds
        pvCell = Math.min((bw - 24) / 4, (bh - cell) / 3.2);
        const pw = (nbMaxX - nbMinX + 1) * pvCell;
        const ph = (nbMaxY - nbMinY + 1) * pvCell;
        pvOx = bx + (bw - pw) / 2 - nbMinX * pvCell;
        pvOy = by + cell * 0.9 + ((bh - cell) - ph) / 2 - nbMinY * pvCell;
        pvColor = PIECE_COLORS[colorIndex(nextType)];
        pvReduced = reduced;
        forEachPieceCell(previewPiece, previewCb);
      }
      ctx.restore();

      // stats — cache the rendered strings (incl. the compact combined lines) so
      // the per-frame draw never builds a template string.
      if (g.score !== g._score) { g._score = g.score; g._scoreStr = String(g.score).padStart(6, '0'); g._compactA = `SCORE ${g._scoreStr}`; }
      let lvChanged = false;
      if (g.lines !== g._lines) { g._lines = g.lines; g._linesStr = String(g.lines); lvChanged = true; }
      if (g.level !== g._level) { g._level = g.level; g._levelStr = String(g.level); lvChanged = true; }
      if (lvChanged) g._compactB = `LINES ${g._linesStr}   LV ${g._levelStr}`;
      ctx.save();
      ctx.textBaseline = 'top';
      if (compact) {
        // a compact HUD strip above the board on the left
        ctx.textAlign = 'left';
        ctx.font = layout.hudFont;
        const hy = Math.max(6, layout.boardTop - layout.bezel - 40);
        ctx.fillStyle = '#cfe6ff';
        ctx.fillText(g._compactA, layout.boardLeft, hy);
        ctx.fillStyle = '#9bb4e8';
        ctx.fillText(g._compactB, layout.boardLeft, hy + 18);
      } else {
        const sx = layout.panelLeft + 6;
        const step = Math.max(46, cell * 1.7);
        const lh = Math.max(14, cell * 0.55);
        let sy = layout.boardTop + cell * 4.4 + 18;
        drawStat('SCORE', g._scoreStr, '#cfe6ff', sx, sy, lh); sy += step;
        drawStat('LINES', g._linesStr, '#36ff9e', sx, sy, lh); sy += step;
        drawStat('LEVEL', g._levelStr, '#ffd23b', sx, sy, lh);
      }
      ctx.restore();
    }

    function drawTitle() {
      if (layout.compact) return; // no room for a big title in compact mode
      ctx.save();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'alphabetic';
      ctx.font = layout.titleFont;
      ctx.fillStyle = '#ff5cf4';
      if (!reducedRef.current) { ctx.shadowColor = '#ff48c4'; ctx.shadowBlur = 18; }
      ctx.fillText('CASCADE', layout.boardLeft + layout.boardW / 2, layout.boardTop - layout.bezel - 14);
      ctx.restore();
    }

    function draw() {
      if (!ctx) return;
      const g = gRef.current.game;
      const reduced = reducedRef.current;
      const tNow = perfNow();
      const cell = layout.cell;

      // background
      ctx.fillStyle = baseGrad || '#05010f';
      ctx.fillRect(0, 0, W, H);

      drawTitle();
      drawCabinetFrame();
      drawBoardBackground();

      // clip to the screen so nothing spills onto the bezel
      ctx.save();
      ctx.beginPath();
      ctx.rect(layout.boardLeft, layout.boardTop, layout.boardW, layout.boardH);
      ctx.clip();

      // locked stack
      const board = g.board;
      for (let r = 0; r < ROWS; r++) {
        const row = board[r];
        const py = layout.boardTop + r * cell;
        for (let c = 0; c < COLS; c++) {
          const v = row[c];
          if (v !== 0) {
            drawCell(layout.boardLeft + c * cell, py, cell, PIECE_COLORS[v], reduced, true, 1);
          }
        }
      }

      if (!g.over) {
        // ghost (landing preview) — hollow outline
        dpCell = cell;
        dpReduced = reduced;
        dpFilled = false;
        dpAlpha = reduced ? 0.5 : 0.35;
        dpColor = PIECE_COLORS[colorIndex(g.piece.type)];
        forEachPieceCell(g.ghost, drawActiveCb);

        // active piece
        dpFilled = true;
        dpAlpha = 1;
        forEachPieceCell(g.piece, drawActiveCb);
      }

      // line-clear flash — a smooth bright bar over the cleared rows that fades
      // over the FULL window in BOTH modes (no strobe; reduced-motion safe).
      if (gRef.current.clearFlashAt) {
        const age = tNow - gRef.current.clearFlashAt;
        if (age < CLEAR_FLASH_MS) {
          const k = 1 - age / CLEAR_FLASH_MS;
          ctx.save();
          ctx.globalAlpha = (reduced ? 0.3 : 0.55) * k;
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(layout.boardLeft, layout.boardTop, layout.boardW, layout.boardH);
          ctx.restore();
        } else {
          gRef.current.clearFlashAt = 0;
        }
      }

      ctx.restore(); // end screen clip

      drawSidePanel(g);

      // pause veil
      if (gRef.current.paused && !g.over) {
        ctx.save();
        ctx.globalAlpha = 0.66;
        ctx.fillStyle = '#05010f';
        ctx.fillRect(0, 0, W, H);
        ctx.globalAlpha = 1;
        ctx.fillStyle = '#bfe9ff';
        ctx.font = layout.bigFont;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('PAUSED', W / 2, H / 2);
        ctx.restore();
      }

      // game-over is rendered by the React panel (so it's keyboard/touch
      // operable); we just dim the screen here.
      if (g.over) {
        ctx.save();
        ctx.globalAlpha = 0.55;
        ctx.fillStyle = '#0a0414';
        ctx.fillRect(layout.boardLeft, layout.boardTop, layout.boardW, layout.boardH);
        ctx.restore();
      }
    }

    // ---- game transitions (component owns timing; engine stays pure) ----
    // Grant lock-delay. The anti-stall gate (GOTCHAS): a fresh, UNcounted
    // lock-delay is only granted when the piece descends to a strictly-new lowest
    // row (genuine downward progress). Re-grounding at the same/higher row — the
    // classic "shuffle the piece on a ledge to never lock" exploit — is charged
    // against lockResets and, once the cap is hit, can no longer extend the timer.
    function groundLock(now) {
      const s = gRef.current;
      const y = s.game.piece.y; // box origin; increases with depth (row down)
      if (y > s.lowestRow) {
        s.lowestRow = y;
        s.landed = true;
        s.lockAt = now + LOCK_DELAY_MS;
      } else if (!s.landed) {
        if (s.lockResets < MAX_LOCK_RESETS) {
          s.lockResets += 1;
          s.landed = true;
          s.lockAt = now + LOCK_DELAY_MS;
        } else {
          s.landed = true;
          if (!s.lockAt) s.lockAt = now; // already overdue → locks next frame
        }
      } else if (s.lockResets < MAX_LOCK_RESETS) {
        s.lockResets += 1;
        s.lockAt = now + LOCK_DELAY_MS;
      }
      // else: stayed grounded, cap reached → leave the existing lockAt (no extend)
    }

    function reLand(now) {
      const s = gRef.current;
      const g = s.game;
      if (tryMove(g.board, g.piece, 0, 1) === null) groundLock(now);
      else { s.landed = false; s.lockAt = 0; }
    }

    // reset lock-delay after a successful move/rotate (subject to the cap above).
    function bumpLock(now) {
      reLand(now);
    }

    function afterSpawn(now) {
      const s = gRef.current;
      s.dropAcc = 0;
      s.landed = false;
      s.lockAt = 0;
      s.lockResets = 0;
      s.lowestRow = -Infinity;
      reLand(now);
      if (s.game.over) {
        audio.playGameOver();
        if (mountedRef.current) setOver(true);
      }
    }

    function performLock(now) {
      const s = gRef.current;
      s.game = lockAndSpawn(s.game);
      if (s.game.cleared > 0) {
        s.clearFlashAt = now;
        s.clearCount = s.game.cleared;
        audio.playClear(s.game.cleared);
      } else {
        audio.playLock();
      }
      afterSpawn(now);
    }

    function doMoveH(dir, now) {
      const s = gRef.current;
      if (s.game.over || s.paused) return;
      audio.resume();
      const prev = s.game;
      s.game = dir < 0 ? moveLeft(prev) : moveRight(prev);
      if (s.game !== prev) { audio.playMove(); bumpLock(now); }
    }

    function doRotate(dir, now) {
      const s = gRef.current;
      if (s.game.over || s.paused) return;
      audio.resume();
      const prev = s.game;
      s.game = rotateGame(prev, dir);
      if (s.game !== prev) { audio.playRotate(); bumpLock(now); }
    }

    function doSoftStep(now) {
      const s = gRef.current;
      if (s.game.over || s.paused) return;
      const r = dropStep(s.game, true);
      if (r.moved) { s.game = r.game; s.landed = false; s.lockAt = 0; }
      else { reLand(now); }
    }

    function doHardDrop(now) {
      const s = gRef.current;
      if (s.game.over || s.paused) return;
      audio.resume();
      audio.playDrop();
      s.game = hardDrop(s.game);
      if (s.game.cleared > 0) {
        s.clearFlashAt = now;
        s.clearCount = s.game.cleared;
        audio.playClear(s.game.cleared);
      }
      afterSpawn(now);
    }

    function restart() {
      const s = gRef.current;
      // vary the seed so each run differs but stays deterministic per-run.
      s.seed = (s.seed * 1664525 + 1013904223) >>> 0;
      s.game = createGame(s.seed);
      s.dropAcc = 0;
      s.landed = false;
      s.lockAt = 0;
      s.lockResets = 0;
      s.lowestRow = -Infinity;
      s.softHeld = false;
      s.hDir = 0;
      s.clearFlashAt = 0;
      s.paused = false;
      s.pauseStart = 0;
      if (mountedRef.current) setOver(false);
    }

    // Pause that is transparent to game timing: while paused the loop is frozen,
    // so on resume we shift the live absolute deadlines (lockAt, DAS hNext)
    // forward by the paused duration — otherwise a piece would lock instantly or
    // DAS would fire instantly the moment play resumes.
    function setPaused(next, now) {
      const s = gRef.current;
      if (s.game.over) return;
      if (next === s.paused) return;
      if (next) {
        s.paused = true;
        s.pauseStart = now;
      } else {
        const elapsed = now - s.pauseStart;
        if (s.lockAt) s.lockAt += elapsed;
        if (s.hDir !== 0) s.hNext += elapsed;
        s.paused = false;
      }
    }

    // expose imperative actions to the React controls (touch pad + buttons).
    // All zero-arg so the generic act(name) bridge can call them.
    actionRef.current = {
      moveLeft: () => doMoveH(-1, perfNow()),
      moveRight: () => doMoveH(1, perfNow()),
      rotateCW: () => doRotate(1, perfNow()),
      rotateCCW: () => doRotate(-1, perfNow()),
      softDrop: () => doSoftStep(perfNow()),
      softHeldOn: () => { gRef.current.softHeld = true; },
      softHeldOff: () => { gRef.current.softHeld = false; },
      hardDrop: () => doHardDrop(perfNow()),
      togglePause: () => setPaused(!gRef.current.paused, perfNow()),
      restart,
    };

    // ---- keyboard input ----
    const keyDown = new Set();
    const onKeyDown = (e) => {
      const code = e.code;
      const now = perfNow();
      const s = gRef.current;
      // ESC is intentionally NOT handled here — index.jsx routes it.
      switch (code) {
        case 'ArrowLeft': case 'KeyA':
          e.preventDefault(); e.stopPropagation();
          if (!keyDown.has(code)) {
            keyDown.add(code);
            s.hDir = -1; s.hSince = now; s.hNext = now + DAS_MS;
            doMoveH(-1, now);
          }
          break;
        case 'ArrowRight': case 'KeyD':
          e.preventDefault(); e.stopPropagation();
          if (!keyDown.has(code)) {
            keyDown.add(code);
            s.hDir = 1; s.hSince = now; s.hNext = now + DAS_MS;
            doMoveH(1, now);
          }
          break;
        case 'ArrowUp': case 'KeyW': case 'KeyX':
          e.preventDefault(); e.stopPropagation();
          if (!e.repeat) doRotate(1, now);
          break;
        case 'KeyZ': case 'ControlLeft': case 'ControlRight':
          e.preventDefault(); e.stopPropagation();
          if (!e.repeat) doRotate(-1, now);
          break;
        case 'ArrowDown': case 'KeyS':
          e.preventDefault(); e.stopPropagation();
          s.softHeld = true;
          if (!keyDown.has(code)) { keyDown.add(code); doSoftStep(now); s.dropAcc = 0; }
          break;
        case 'Space':
          e.preventDefault(); e.stopPropagation();
          // de-dup against OS key-repeat via the keyDown set (not just e.repeat,
          // which some platforms/remappers don't set) so a held Space can't slam
          // multiple pieces. One hard drop per physical press.
          if (!keyDown.has(code)) { keyDown.add(code); doHardDrop(now); }
          break;
        case 'KeyP':
          e.preventDefault(); e.stopPropagation();
          setPaused(!s.paused, now);
          break;
        case 'KeyR':
          e.preventDefault(); e.stopPropagation();
          if (s.game.over) restart();
          break;
        default:
          break;
      }
    };
    const onKeyUp = (e) => {
      const code = e.code;
      const s = gRef.current;
      keyDown.delete(code);
      if ((code === 'ArrowLeft' || code === 'KeyA') && s.hDir === -1) s.hDir = 0;
      if ((code === 'ArrowRight' || code === 'KeyD') && s.hDir === 1) s.hDir = 0;
      // if the opposite horizontal key is still held, resume that direction
      if (s.hDir === 0) {
        if (keyDown.has('ArrowLeft') || keyDown.has('KeyA')) { s.hDir = -1; s.hSince = perfNow(); s.hNext = perfNow() + DAS_MS; }
        else if (keyDown.has('ArrowRight') || keyDown.has('KeyD')) { s.hDir = 1; s.hSince = perfNow(); s.hNext = perfNow() + DAS_MS; }
      }
      // soft-drop stops only when BOTH aliases are released (mirror the
      // horizontal resume logic) — releasing one of two held keys shouldn't cancel.
      if (code === 'ArrowDown' || code === 'KeyS') {
        if (!keyDown.has('ArrowDown') && !keyDown.has('KeyS')) s.softHeld = false;
      }
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);

    // ---- touch input (swipe = move / drop, tap = rotate) ----
    let gesture = null;
    const onPointerDown = (e) => {
      gesture = { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, t: perfNow(), moved: 0, col: 0 };
      audio.resume();
    };
    const onPointerMove = (e) => {
      if (!gesture) return;
      const stepPx = Math.max(20, layout.cell * 0.9);
      // horizontal column stepping
      let dx = e.clientX - gesture.x;
      while (dx >= stepPx) { doMoveH(1, perfNow()); gesture.x += stepPx; gesture.moved += 1; dx -= stepPx; }
      while (dx <= -stepPx) { doMoveH(-1, perfNow()); gesture.x -= stepPx; gesture.moved += 1; dx += stepPx; }
      // downward swipe = soft drop steps
      const dy = e.clientY - gesture.y;
      if (dy >= stepPx) { doSoftStep(perfNow()); gesture.y += stepPx; gesture.moved += 1; }
    };
    const onPointerUp = (e) => {
      if (!gesture) return;
      const totalY = e.clientY - gesture.y0;
      const totalX = e.clientX - gesture.x0;
      const dt = perfNow() - gesture.t;
      const moved = gesture.moved;
      gesture = null;
      const s = gRef.current;
      if (s.game.over) { restart(); return; }
      // a quick flick down = hard drop
      if (totalY > layout.cell * 3 && Math.abs(totalX) < layout.cell * 1.5 && dt < 250) {
        doHardDrop(perfNow());
        return;
      }
      // a tap (no stepping) = rotate
      if (moved === 0 && Math.abs(totalX) < 18 && Math.abs(totalY) < 18) {
        doRotate(1, perfNow());
      }
    };
    if (canvas) {
      canvas.addEventListener('pointerdown', onPointerDown);
      canvas.addEventListener('pointermove', onPointerMove);
      canvas.addEventListener('pointerup', onPointerUp);
      canvas.addEventListener('pointercancel', onPointerUp);
    }

    // ---- frame loop ----
    let lastTime = perfNow();
    function frame() {
      if (!mountedRef.current) return;
      const now = perfNow();
      let dt = now - lastTime;
      lastTime = now;
      if (dt > 100) dt = 100; // clamp after a tab-away so we don't fast-forward
      const s = gRef.current;
      const g = s.game;

      if (!g.over && !s.paused) {
        // DAS auto-repeat for a held horizontal direction
        if (s.hDir !== 0 && now >= s.hNext) {
          doMoveH(s.hDir, now);
          s.hNext = now + ARR_MS;
        }
        // gravity / soft-drop cadence (single accumulator)
        s.dropAcc += dt;
        const interval = s.softHeld ? SOFT_DROP_MS : gravityMs(g.level);
        let steps = 0;
        while (s.dropAcc >= interval && steps < 4) {
          s.dropAcc -= interval;
          steps += 1;
          const r = dropStep(s.game, s.softHeld);
          if (r.moved) {
            s.game = r.game;
            s.landed = false;
            s.lockAt = 0;
          } else {
            reLand(now);
            break; // resting on the stack — let the lock timer run
          }
        }
        // lock delay
        if (s.landed && s.lockAt && now >= s.lockAt) {
          performLock(now);
        }
      }

      draw();
      rafRef.current = requestAnimationFrame(frame);
    }

    // kick off — arm the initial landed state, then run.
    reLand(perfNow());
    rafRef.current = requestAnimationFrame(frame);

    return () => {
      mountedRef.current = false;
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener('resize', resize);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      if (canvas) {
        canvas.removeEventListener('pointerdown', onPointerDown);
        canvas.removeEventListener('pointermove', onPointerMove);
        canvas.removeEventListener('pointerup', onPointerUp);
        canvas.removeEventListener('pointercancel', onPointerUp);
      }
      actionRef.current = null;
      // detach the optional bezel-art loader so a late onload/onerror can't run
      // after unmount (harmless — they only touch a local — but kept tidy).
      if (bezelLoader) { bezelLoader.onload = null; bezelLoader.onerror = null; bezelLoader = null; }
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

  const act = useCallback((name) => {
    const a = actionRef.current;
    if (a && a[name]) a[name]();
  }, []);

  return (
    <div
      ref={rootRef}
      role="application"
      aria-label="CASCADE stacking game"
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
          zIndex: 5,
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
          bottom: coarse ? 168 : 22,
          left: '50%',
          transform: 'translateX(-50%)',
          color: '#8aa0c8',
          fontFamily: 'monospace',
          fontSize: 12,
          textAlign: 'center',
          pointerEvents: 'none',
          zIndex: 2,
          textShadow: '0 0 8px #000',
          maxWidth: '92vw',
        }}
      >
        {coarse
          ? 'swipe ← → to move · swipe ↓ to drop · tap to rotate · use the pad below · ESC to exit'
          : '← → move · ↑/X rotate · Z rotate ccw · ↓ soft drop · Space hard drop · P pause · R restart · ESC exit'}
      </div>

      {/* touch pause toggle (coarse pointers only — keyboard uses P) so pause is
          reachable without a keyboard */}
      {coarse && (
        <button
          type="button"
          aria-label="pause"
          onClick={() => act('togglePause')}
          style={{
            position: 'absolute',
            top: 14,
            left: 14,
            zIndex: 5,
            color: '#bfe9ff',
            background: 'rgba(20,12,46,0.82)',
            border: '1px solid #2a1d66',
            borderRadius: 8,
            padding: '8px 14px',
            fontFamily: 'monospace',
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          ⏸ PAUSE
        </button>
      )}

      {/* touch control pad (coarse pointers only) */}
      {coarse && <ControlPad onAct={act} />}

      {/* game-over panel — keyboard/touch operable */}
      {over && <GameOverPanel game={gRef.current.game} onRestart={() => act('restart')} onExit={handleExit} />}
    </div>
  );
}

// On-screen control pad for touch. Move / rotate / soft-drop (press-and-hold to
// accelerate gravity) / hard-drop. Each press calls straight into the game's
// imperative actions via the parent's act() bridge.
function ControlPad({ onAct }) {
  const baseStyle = {
    width: 52,
    height: 52,
    borderRadius: 12,
    border: '1px solid #2a1d66',
    background: 'rgba(20,12,46,0.82)',
    color: '#bfe9ff',
    fontFamily: 'monospace',
    fontSize: 19,
    fontWeight: 800,
    touchAction: 'none',
    cursor: 'pointer',
  };
  const tap = (label, name, aria, extra) => (
    <button
      type="button"
      aria-label={aria}
      onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); onAct(name); }}
      style={{ ...baseStyle, ...extra }}
    >
      {label}
    </button>
  );
  return (
    <div
      style={{
        position: 'absolute',
        bottom: 22,
        left: 0,
        right: 0,
        display: 'flex',
        justifyContent: 'space-between',
        padding: '0 14px',
        zIndex: 4,
        pointerEvents: 'none',
      }}
    >
      {/* left cluster: move + rotate (both directions) */}
      <div style={{ display: 'flex', gap: 6, pointerEvents: 'auto' }}>
        {tap('←', 'moveLeft', 'move left')}
        {tap('→', 'moveRight', 'move right')}
        {tap('⟲', 'rotateCCW', 'rotate counter-clockwise')}
        {tap('⟳', 'rotateCW', 'rotate clockwise')}
      </div>
      {/* right cluster: soft-drop (press-and-hold) + hard drop */}
      <div style={{ display: 'flex', gap: 6, pointerEvents: 'auto' }}>
        <button
          type="button"
          aria-label="soft drop"
          onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); onAct('softHeldOn'); }}
          onPointerUp={(e) => { e.preventDefault(); e.stopPropagation(); onAct('softHeldOff'); }}
          onPointerLeave={(e) => { e.preventDefault(); e.stopPropagation(); onAct('softHeldOff'); }}
          onPointerCancel={(e) => { e.preventDefault(); e.stopPropagation(); onAct('softHeldOff'); }}
          style={baseStyle}
        >
          ↓
        </button>
        {tap('⤓', 'hardDrop', 'hard drop', { background: 'rgba(54,214,255,0.22)', borderColor: '#36d6ff' })}
      </div>
    </div>
  );
}

// Original "topped out" panel (NOT a copyrighted defeat screen). Shows the run
// stats and offers restart / exit. M6 layers the world-wide defeat overlay; this
// is the in-cabinet game-over for CASCADE. The RESTART button is auto-focused so
// a keyboard-only player gets a visible focus target the moment they top out.
function GameOverPanel({ game, onRestart, onExit }) {
  const restartRef = useRef(null);
  useEffect(() => {
    if (restartRef.current) {
      try { restartRef.current.focus(); } catch { /* ignore */ }
    }
  }, []);
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="CASCADE game over"
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 6,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 14,
        pointerEvents: 'none',
      }}
    >
      <div
        style={{
          pointerEvents: 'auto',
          textAlign: 'center',
          background: 'rgba(8,4,22,0.9)',
          border: '1px solid #ff3b6b',
          borderRadius: 14,
          padding: '26px 34px',
          fontFamily: 'monospace',
          boxShadow: '0 0 40px rgba(255,59,107,0.35)',
        }}
      >
        <div style={{ color: '#ff5cf4', fontWeight: 800, fontSize: 30, letterSpacing: 2 }}>STACK TOPPED OUT</div>
        <div style={{ color: '#cfe6ff', fontSize: 15, marginTop: 10 }}>
          score {String(game.score).padStart(6, '0')} · lines {game.lines} · level {game.level}
        </div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 18 }}>
          <button
            type="button"
            ref={restartRef}
            onClick={onRestart}
            style={{
              color: '#04130c',
              background: '#36ff9e',
              border: 'none',
              borderRadius: 8,
              padding: '10px 20px',
              fontFamily: 'monospace',
              fontWeight: 800,
              cursor: 'pointer',
            }}
          >
            RESTART ↺
          </button>
          <button
            type="button"
            onClick={onExit}
            style={{
              color: '#fff',
              background: 'rgba(255,59,107,0.85)',
              border: '1px solid #ff3b6b',
              borderRadius: 8,
              padding: '10px 20px',
              fontFamily: 'monospace',
              fontWeight: 800,
              cursor: 'pointer',
            }}
          >
            EXIT ✕
          </button>
        </div>
      </div>
    </div>
  );
}
