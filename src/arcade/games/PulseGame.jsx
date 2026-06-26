import { useEffect, useRef, useState, useCallback } from 'react';
import { ASSET_SLOTS } from '../assets';
import { isCoarsePointer } from '../touchInput';
import { createPulseAudio } from './pulseAudio';
import {
  generateChart,
  reverseChart,
  chartEndMs,
  judge,
  applyJudgment,
  initialPlayState,
  nextHealth,
  HEALTH,
  pickHit,
  noteProgress,
  laneIndexForX,
  comboMultiplier,
  stageConfig,
  JUDGE_WINDOWS,
  LANES,
} from './pulseEngine';

// ===========================================================================
// PulseGame — Milestone-3 rhythm cabinet "PULSE" (ORIGINAL name + art).
//
// A full-screen DOM overlay (mounted from src/arcade/index.jsx like the M2
// loader) rendering four scrolling arrow lanes (← ↓ ↑ →) on a single canvas.
// Hits are judged PERFECT / GREAT against the beat with score + combo + a
// health bar; notes that pass the line unhit auto-MISS. Clearing a track plays
// an "encore" of the SAME track reversed, then progressively-unlocked reversed
// tracks (2/3), escalating until the player's health hits 0 (death) or leaves.
//
// LEGAL: no copyrighted song is bundled. Tracks load from documented asset
// slots (ASSETS.md M3); with the slots empty a generated WebAudio metronome
// gives the player a beat so judgments still work (see pulseAudio.js). Original
// art only — procedural neon arrows, no third-party sprites.
//
// Accessibility: honors prefers-reduced-motion (no strobe/flash/rise; judgments
// stay fully readable), is keyboard-driven (arrow keys), and supports touch via
// tap-on-lane. ESC exit is routed by index.jsx (single owner) so it can restore
// the world cleanly; this component also offers an on-screen EXIT button.
// ===========================================================================

const BASE_BPM = 124;
const STAGE_DURATION_MS = 60000; // canonical chart length before time-scaling
const APPROACH_MS = 1500; // time a note takes to travel top → hit line
const LEAD_IN_MS = 2000; // quiet beats before the first note
const END_TAIL_MS = 2200; // grace after the last note before the stage clears
const SONG_COUNT = 3;

const LANE_KEY = { ArrowLeft: 0, ArrowDown: 1, ArrowUp: 2, ArrowRight: 3 };
const LANE_COLOR = ['#ff5cf4', '#36d6ff', '#36ff9e', '#ffd23b'];
const JUDGE_COLOR = { PERFECT: '#36ff9e', GREAT: '#36d6ff', MISS: '#ff3b6b' };
// Rotation per lane direction (left, down, up, right). Hoisted to module scope
// so drawArrow allocates nothing per call — it runs for every receptor + note
// every frame, so a fresh array there would churn GC against the 60fps budget.
const ARROW_ROT = [-Math.PI / 2, Math.PI, 0, Math.PI / 2];

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

export default function PulseGame({ onExit }) {
  const reducedMotion = usePrefersReducedMotion();
  const [coarse] = useState(() => isCoarsePointer());
  const [over, setOver] = useState(null); // null while playing; stats object on death

  const canvasRef = useRef(null);
  const rootRef = useRef(null);
  const audioRef = useRef(null);
  const rafRef = useRef(0);
  const startPerfRef = useRef(0);
  const mountedRef = useRef(true);
  const reducedRef = useRef(reducedMotion);
  const onExitRef = useRef(onExit);
  const startStageRef = useRef(null); // exposed so the React "play again" button can restart

  // chart + buffer caches keyed by song index (so reverse maps the SAME track
  // and we never refetch/decode a track twice).
  const chartCacheRef = useRef(new Map());
  const bufferCacheRef = useRef(new Map());

  // mutable game state read every frame (no React churn during play).
  const gRef = useRef(null);
  if (gRef.current === null) {
    gRef.current = {
      stage: 0,
      cfg: null,
      chart: [],
      endMs: 0,
      consumed: new Set(),
      missCursor: 0,
      play: initialPlayState(),
      health: HEALTH.start,
      status: 'booting', // booting | loading | playing | clearing | over
      judgeFx: { text: '', color: '', at: 0 },
      laneFlashAt: [0, 0, 0, 0],
      laneFlashStrong: [false, false, false, false],
      bannerText: '',
      bannerUntil: 0,
      // cached HUD strings (rebuilt only when the underlying value changes, so
      // draw() allocates no value strings per frame).
      _scoreVal: -1, _scoreStr: '',
      _cP: -1, _cG: -1, _cM: -1, _countsStr: '',
      _comboVal: -1, _comboStr: '',
      _multVal: -1, _multStr: '',
    };
  }

  useEffect(() => { reducedRef.current = reducedMotion; }, [reducedMotion]);
  useEffect(() => { onExitRef.current = onExit; }, [onExit]);

  // Reset the run and (re)start from stage 0 — used by "PLAY AGAIN".
  const restart = useCallback(() => {
    const g = gRef.current;
    g.play = initialPlayState();
    g.health = HEALTH.start;
    g.consumed = new Set();
    g.missCursor = 0;
    g.judgeFx = { text: '', color: '', at: 0 };
    g.status = 'loading';
    setOver(null);
    if (startStageRef.current) startStageRef.current(0);
  }, []);

  // ---- one mount-scoped effect owns the audio, RAF loop, and input ----------
  useEffect(() => {
    mountedRef.current = true;
    const canvas = canvasRef.current;
    const ctx = canvas ? canvas.getContext('2d') : null;
    const audio = createPulseAudio();
    audioRef.current = audio;

    // best-effort: ask the browser for true fullscreen (swallow if not granted;
    // the overlay already covers the viewport so this is purely a nicety).
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
    // Size-dependent font strings are precomputed here (they only change on
    // resize) so the per-frame draw() never builds interpolated font strings —
    // that allocation churn is exactly what the M2 review flagged.
    const layout = {
      bandLeft: 0, laneW: 0, topY: 0, hitY: 0, laneX: [0, 0, 0, 0],
      arrowSize: 18, comboSize: 34,
      judgeFont: '', comboFont: '', bannerFont: '',
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
        baseGrad.addColorStop(0, '#0a0220');
        baseGrad.addColorStop(0.6, '#070015');
        baseGrad.addColorStop(1, '#03000c');
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
    window.addEventListener('resize', resize);

    // ---- chart / buffer loading ----
    // `durationMs` anchors both auto-generation and the reversal pivot. With a
    // real track present it is the track's actual length so the reversed chart
    // mirrors the reversed audio about the SAME point (no constant desync); with
    // no track it is STAGE_DURATION_MS for the metronome fallback.
    async function loadOrGenChart(songIndex, durationMs) {
      const cache = chartCacheRef.current;
      if (cache.has(songIndex)) return cache.get(songIndex);
      let chart = null;
      // optional hand-authored beatmap slot
      const url = ASSET_SLOTS.charts && ASSET_SLOTS.charts[songIndex];
      if (url && typeof fetch !== 'undefined') {
        try {
          const res = await fetch(url);
          if (res.ok) {
            const data = await res.json();
            const notes = Array.isArray(data) ? data : data && data.notes;
            if (Array.isArray(notes) && notes.length) {
              chart = notes
                .filter((n) => n && typeof n.time === 'number' && typeof n.lane === 'number')
                .map((n, i) => ({ id: i, time: Math.round(n.time), lane: ((n.lane % LANES) + LANES) % LANES }))
                .sort((a, b) => a.time - b.time);
              if (!chart.length) chart = null;
            }
          }
        } catch { chart = null; }
      }
      if (!chart) {
        chart = generateChart({
          seed: songIndex + 1,
          bpm: BASE_BPM,
          durationMs,
          leadInMs: LEAD_IN_MS,
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
      g.status = 'loading';
      audio.stop();
      const cfg = stageConfig(stage, SONG_COUNT);
      const scale = cfg.bpmScale; // also a time-compression factor for escalation
      // load the (optional) track first so the chart can be anchored to its real
      // length — keeps the reversed encore aligned to the reversed audio.
      const buffer = await getBuffer(cfg.songIndex);
      const durationMs = buffer ? Math.round(buffer.duration * 1000) : STAGE_DURATION_MS;
      const canonical = await loadOrGenChart(cfg.songIndex, durationMs);
      let chart = cfg.reversed
        ? reverseChart(canonical, durationMs, { mirror: cfg.mirror, leadInMs: LEAD_IN_MS })
        : canonical.map((n) => ({ ...n }));
      // escalate later loops by compressing note times (faster, denser)
      if (scale !== 1) chart = chart.map((n) => ({ ...n, time: Math.round(n.time / scale) }));
      if (!mountedRef.current) return;

      g.stage = stage;
      g.cfg = cfg;
      g.chart = chart;
      g.endMs = chartEndMs(chart);
      g.consumed = new Set();
      g.missCursor = 0;
      g.bannerText = stage === 0 ? `PULSE · ${cfg.label}` : cfg.label;
      g.bannerUntil = perfNow() + 2600;
      g.status = 'playing';
      startPerfRef.current = perfNow();
      audio.start({ buffer, bpm: Math.round(BASE_BPM * scale), reversed: cfg.reversed, rate: scale });
    }
    startStageRef.current = startStage;

    // ---- input ----
    function registerHit(lane) {
      const g = gRef.current;
      // The game mounts on a later task than the launching gesture, so the
      // AudioContext may have started suspended. Every hit is a fresh user
      // gesture — unlock it here (idempotent no-op once running) so the beat /
      // blips actually sound, including on mobile.
      audio.resume();
      if (g.status !== 'playing') return;
      const now = perfNow() - startPerfRef.current;
      const sel = pickHit(g.chart, lane, now, JUDGE_WINDOWS, (id) => g.consumed.has(id));
      g.laneFlashAt[lane] = perfNow();
      if (sel) {
        const j = judge(sel.delta) || 'GREAT';
        g.consumed.add(sel.note.id);
        g.play = applyJudgment(g.play, j);
        g.health = nextHealth(g.health, j);
        g.judgeFx = { text: j, color: JUDGE_COLOR[j], at: perfNow() };
        g.laneFlashStrong[lane] = true;
        audio.playBlip(j);
        if (g.health <= 0) endRun('downed');
      } else {
        // empty press: forgiving (no penalty), just a faint receptor flash.
        g.laneFlashStrong[lane] = false;
      }
    }

    function endRun(reason) {
      const g = gRef.current;
      if (g.status === 'over') return;
      g.status = 'over';
      audio.stop();
      setOver({
        score: g.play.score,
        maxCombo: g.play.maxCombo,
        counts: { ...g.play.counts },
        stage: g.stage,
        reason,
      });
    }

    const onKeyDown = (e) => {
      const lane = LANE_KEY[e.code];
      if (lane === undefined) return; // ESC + everything else handled by index.jsx
      e.preventDefault();
      // also stop the press reaching drei's window KeyboardControls — arrows are
      // mapped to player movement, and a key still held at game-exit would
      // otherwise drift the avatar until keyup. Player is paused during play, so
      // this only matters for that exit edge, but it keeps the input isolated.
      e.stopPropagation();
      if (e.repeat) return; // ignore key auto-repeat
      registerHit(lane);
    };
    const onPointerDown = (e) => {
      const g = gRef.current;
      if (g.status !== 'playing') return;
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const lane = laneIndexForX(x, layout.bandLeft, layout.laneW, LANES);
      if (lane >= 0) {
        e.preventDefault();
        registerHit(lane);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    if (canvas) canvas.addEventListener('pointerdown', onPointerDown);

    // ---- drawing helpers ----
    function drawArrow(x, y, s, dir, fill, alpha, glow) {
      const rot = ARROW_ROT[dir]; // left, down, up, right
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(rot);
      ctx.globalAlpha = alpha;
      if (glow > 0) { ctx.shadowColor = fill; ctx.shadowBlur = glow; }
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
      // Once the run is over the opaque RunOver dialog covers the viewport, so
      // there is nothing worth repainting — idle the loop cheaply (it resumes
      // when restart() flips status back to playing).
      if (g.status === 'over') return;
      const reduced = reducedRef.current;
      const tNow = perfNow();
      const clock = perfNow() - startPerfRef.current;
      const arrowSize = layout.arrowSize;

      // background
      ctx.fillStyle = baseGrad || '#05010f';
      ctx.fillRect(0, 0, W, H);

      // lane columns + receptors
      for (let i = 0; i < LANES; i++) {
        const cx = layout.laneX[i];
        const col = LANE_COLOR[i];
        // column tint
        ctx.save();
        ctx.globalAlpha = 0.07;
        ctx.fillStyle = col;
        ctx.fillRect(cx - layout.laneW / 2 + 2, layout.topY, layout.laneW - 4, layout.hitY - layout.topY + 40);
        ctx.restore();
        // lane separators
        ctx.strokeStyle = 'rgba(120,150,220,0.12)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(cx - layout.laneW / 2, layout.topY);
        ctx.lineTo(cx - layout.laneW / 2, layout.hitY + 40);
        ctx.stroke();
      }

      // hit line
      ctx.save();
      ctx.strokeStyle = 'rgba(230,240,255,0.6)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(layout.bandLeft - 6, layout.hitY);
      ctx.lineTo(layout.bandLeft + layout.laneW * LANES + 6, layout.hitY);
      ctx.stroke();
      ctx.restore();

      // receptor arrows (always visible targets) + flash
      for (let i = 0; i < LANES; i++) {
        const cx = layout.laneX[i];
        const age = tNow - g.laneFlashAt[i];
        const flashing = age >= 0 && age < (reduced ? 120 : 220);
        let alpha = 0.34;
        let glow = 0;
        if (flashing) {
          const k = 1 - age / (reduced ? 120 : 220);
          // reduced motion: keep the hit confirmation subtle (small luminance
          // delta, no glow) so continuous hits don't strobe the receptors.
          if (g.laneFlashStrong[i]) {
            alpha = reduced ? 0.34 + 0.12 * k : 0.34 + 0.66 * k;
            glow = reduced ? 0 : 18 * k;
          } else {
            alpha = 0.34 + (reduced ? 0.08 : 0.25) * k;
          }
        }
        drawArrow(cx, layout.hitY, arrowSize, i, LANE_COLOR[i], alpha, glow);
      }

      // notes (chart is time-sorted: once a note hasn't spawned yet, neither
      // has any later note, so we can stop the scan there).
      if (g.status === 'playing' || g.status === 'clearing') {
        for (let n = 0; n < g.chart.length; n++) {
          const note = g.chart[n];
          const p = noteProgress(note.time, clock, APPROACH_MS);
          if (p < -0.06) break; // future notes — none visible beyond here
          if (p > 1.18 || g.consumed.has(note.id)) continue;
          const y = layout.topY + p * (layout.hitY - layout.topY);
          const cx = layout.laneX[note.lane];
          // brighten as it nears the receptor (flat in reduced motion)
          const near = reduced ? 0.9 : 0.55 + 0.45 * Math.max(0, Math.min(1, p));
          const glow = reduced ? 0 : 10 * Math.max(0, Math.min(1, p));
          drawArrow(cx, y, arrowSize, note.lane, LANE_COLOR[note.lane], near, glow);
        }
      }

      // refresh cached HUD value strings only when the value changed
      if (g.play.score !== g._scoreVal) {
        g._scoreVal = g.play.score;
        g._scoreStr = `SCORE ${String(g.play.score).padStart(7, '0')}`;
      }
      const counts = g.play.counts;
      if (counts.PERFECT !== g._cP || counts.GREAT !== g._cG || counts.MISS !== g._cM) {
        g._cP = counts.PERFECT; g._cG = counts.GREAT; g._cM = counts.MISS;
        g._countsStr = `P ${counts.PERFECT}  G ${counts.GREAT}  M ${counts.MISS}`;
      }

      // judgment popup
      const jAge = tNow - g.judgeFx.at;
      if (g.judgeFx.at && g.judgeFx.text && jAge < 480) {
        const k = 1 - jAge / 480;
        const rise = reduced ? 0 : (1 - k) * 26;
        ctx.save();
        ctx.globalAlpha = Math.max(0, k);
        ctx.fillStyle = g.judgeFx.color;
        ctx.font = layout.judgeFont;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        if (!reduced) { ctx.shadowColor = g.judgeFx.color; ctx.shadowBlur = 18; }
        ctx.fillText(g.judgeFx.text, W / 2, layout.hitY - 90 - rise);
        ctx.restore();
      }

      // combo
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
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#f4ecff';
        ctx.font = layout.comboFont;
        if (!reduced) { ctx.shadowColor = '#ff5cf4'; ctx.shadowBlur = 16; }
        ctx.fillText(g._comboStr, W / 2, layout.topY + H * 0.16);
        ctx.shadowBlur = 0;
        ctx.fillStyle = '#9fb6d8';
        ctx.font = "700 13px 'Courier New', monospace";
        ctx.fillText(g._multStr, W / 2, layout.topY + H * 0.16 + layout.comboSize * 0.65);
        ctx.restore();
      }

      // HUD: score, stage label, health
      ctx.save();
      ctx.textBaseline = 'top';
      ctx.fillStyle = '#cfe6ff';
      ctx.font = "700 14px 'Courier New', monospace";
      ctx.textAlign = 'left';
      ctx.fillText(g._scoreStr, 18, 16);
      ctx.fillStyle = '#9fb6d8';
      ctx.font = "700 11px 'Courier New', monospace";
      ctx.fillText(g._countsStr, 18, 38);
      ctx.textAlign = 'right';
      ctx.fillStyle = '#36d6ff';
      ctx.font = "700 13px 'Courier New', monospace";
      ctx.fillText(g.cfg ? g.cfg.label : 'PULSE', W - 18, 16);
      ctx.restore();

      // health bar (top, full width minus margins)
      const hbW = W - 36;
      const hp = Math.max(0, Math.min(1, g.health / HEALTH.max));
      ctx.save();
      ctx.fillStyle = 'rgba(120,150,220,0.18)';
      ctx.fillRect(18, H - 16, hbW, 6);
      const low = hp < 0.25;
      const pulse = low && !reduced ? 0.6 + 0.4 * Math.sin(tNow * 0.012) : 1;
      ctx.globalAlpha = pulse;
      ctx.fillStyle = hp > 0.5 ? '#36ff9e' : hp > 0.25 ? '#ffd23b' : '#ff3b6b';
      ctx.fillRect(18, H - 16, hbW * hp, 6);
      ctx.restore();

      // banner (stage transitions)
      if (tNow < g.bannerUntil && g.bannerText) {
        const remain = g.bannerUntil - tNow;
        const a = Math.min(1, remain / 500);
        ctx.save();
        ctx.globalAlpha = a;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#f6e9ff';
        ctx.font = layout.bannerFont;
        if (!reduced) { ctx.shadowColor = '#ff48c4'; ctx.shadowBlur = 22; }
        ctx.fillText(g.bannerText, W / 2, H * 0.38);
        ctx.restore();
      }

      // loading hint between stages
      if (g.status === 'loading' || g.status === 'clearing') {
        ctx.save();
        ctx.globalAlpha = 0.8;
        ctx.textAlign = 'center';
        ctx.fillStyle = '#9fb6d8';
        ctx.font = "700 14px 'Courier New', monospace";
        ctx.fillText('cueing next track…', W / 2, layout.hitY + 70);
        ctx.restore();
      }
    }

    function frame() {
      const g = gRef.current;
      if (g.status === 'playing') {
        const now = perfNow() - startPerfRef.current;
        // auto-miss notes that passed the line unhit
        while (g.missCursor < g.chart.length) {
          const note = g.chart[g.missCursor];
          if (g.consumed.has(note.id)) { g.missCursor++; continue; }
          if (now - note.time > JUDGE_WINDOWS.greatMs) {
            g.consumed.add(note.id);
            g.play = applyJudgment(g.play, 'MISS');
            g.health = nextHealth(g.health, 'MISS');
            g.judgeFx = { text: 'MISS', color: JUDGE_COLOR.MISS, at: perfNow() };
            g.missCursor++;
            if (g.health <= 0) { endRun('downed'); break; }
          } else {
            break; // sorted by time → no later note can be missed yet
          }
        }
        // stage cleared → advance to the (reversed) next stage
        if (g.status === 'playing' && now > g.endMs + END_TAIL_MS) {
          g.status = 'clearing';
          g.health = Math.min(HEALTH.max, g.health + 25);
          audio.stop();
          g.bannerText = 'STAGE CLEAR';
          g.bannerUntil = perfNow() + 1500;
          startStage(g.stage + 1);
        }
      }
      draw();
      rafRef.current = requestAnimationFrame(frame);
    }

    // kick off
    startStage(0);
    rafRef.current = requestAnimationFrame(frame);

    return () => {
      mountedRef.current = false;
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener('resize', resize);
      window.removeEventListener('keydown', onKeyDown);
      if (canvas) canvas.removeEventListener('pointerdown', onPointerDown);
      audio.dispose();
      audioRef.current = null;
      try {
        if (typeof document !== 'undefined' && document.fullscreenElement) {
          const p = document.exitFullscreen();
          if (p && typeof p.catch === 'function') p.catch(() => {});
        }
      } catch { /* ignore */ }
    };
    // mount-once: live values (reducedMotion / onExit) are read via refs so the
    // loop never tears down mid-run.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleExit = useCallback(() => {
    if (onExitRef.current) onExitRef.current();
  }, []);

  return (
    <div
      ref={rootRef}
      role="application"
      aria-label="PULSE rhythm game"
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
          bottom: 30,
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
        {coarse ? 'tap the lanes  ← ↓ ↑ →  to the beat' : 'arrow keys  ← ↓ ↑ →  to the beat · ESC to exit'}
      </div>

      {over && (
        <RunOver stats={over} onAgain={restart} onExit={handleExit} reduced={reducedMotion} />
      )}
    </div>
  );
}

// Death / run-over panel. Original "RUN ENDED" framing (NOT a GTA "Wasted"
// likeness — that grayscale defeat screen is M6's own original art).
function RunOver({ stats, onAgain, onExit }) {
  const reason = stats.reason === 'downed' ? 'FLATLINED' : 'RUN ENDED';
  return (
    <div
      role="dialog"
      aria-label="Run over"
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 5,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(4,2,12,0.82)',
        fontFamily: "'Courier New', monospace",
        color: '#f4ecff',
        textAlign: 'center',
        gap: 6,
      }}
    >
      <div style={{ color: '#ff3b6b', fontSize: 36, fontWeight: 800, letterSpacing: '0.1em' }}>{reason}</div>
      <div style={{ fontSize: 20, fontWeight: 700, marginTop: 8 }}>
        SCORE {String(stats.score).padStart(7, '0')}
      </div>
      <div style={{ color: '#9fb6d8', fontSize: 13, marginTop: 4 }}>
        max combo {stats.maxCombo} · perfect {stats.counts.PERFECT} · great {stats.counts.GREAT} · miss {stats.counts.MISS}
      </div>
      <div style={{ color: '#9fb6d8', fontSize: 12, marginTop: 2 }}>reached stage {stats.stage + 1}</div>
      <div style={{ display: 'flex', gap: 12, marginTop: 20 }}>
        <button
          type="button"
          onClick={onAgain}
          style={{
            color: '#04020c',
            background: '#36ff9e',
            border: 'none',
            borderRadius: 8,
            padding: '10px 18px',
            fontWeight: 800,
            cursor: 'pointer',
            fontFamily: 'monospace',
          }}
        >
          PLAY AGAIN
        </button>
        <button
          type="button"
          onClick={onExit}
          style={{
            color: '#fff',
            background: 'rgba(255,59,107,0.85)',
            border: '1px solid #ff3b6b',
            borderRadius: 8,
            padding: '10px 18px',
            fontWeight: 800,
            cursor: 'pointer',
            fontFamily: 'monospace',
          }}
        >
          LEAVE
        </button>
      </div>
    </div>
  );
}
