import { useEffect, useRef, useState, useMemo } from 'react';
import { ASSET_SLOTS, createSilentAudio, assetExists } from './assets';
import {
  syntheticProgress,
  loaderShouldClose,
  pseudoNoise,
  jitter,
  strobeOn,
} from './loaderMath';

// ===========================================================================
// ArcadeLoader — Milestone-2 full-screen loading animation.
//
// An ORIGINAL, transformative "rage / opium"-aesthetic loader: dark, grainy,
// high-contrast neon with chromatic-aberration glitch text and a breathing
// halo motif. It is NOT a Ken Carson / Carti likeness and ships NO music — all
// three asset slots (bg / sprite / theme) are OPTIONAL and documented in
// ASSETS.md. With every slot empty (the default shipped state) the loader runs
// a procedural canvas animation and is silent, so `npm run build` stays green.
//
// Accessibility: honors prefers-reduced-motion (a calm static composition, no
// strobe/jitter/grain animation) and exposes the load status via role="status".
//
// Lifecycle: the parent keeps <ArcadeLoader> mounted while the world boots and
// passes `ready` once the r3f scene has committed. The loader shows for at
// least MIN_VISIBLE_MS, eases a synthetic progress bar to 100%, then fades out
// and calls `onHidden` so the parent can unmount it.
// ===========================================================================

const MIN_VISIBLE_MS = 2200; // deliberate minimum so the loader never flashes
const FADE_MS = 600; // opacity transition on dismiss

// Detect reduced-motion once at module scope is unsafe (SSR / test); do it in a
// hook so it re-reads per mount and stays defined when matchMedia is absent.
function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return undefined;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(mq.matches);
    const onChange = (e) => setReduced(e.matches);
    // addEventListener is the modern API; fall back to addListener for old WebKit.
    if (mq.addEventListener) mq.addEventListener('change', onChange);
    else if (mq.addListener) mq.addListener(onChange);
    return () => {
      if (mq.removeEventListener) mq.removeEventListener('change', onChange);
      else if (mq.removeListener) mq.removeListener(onChange);
    };
  }, []);
  return reduced;
}

export default function ArcadeLoader({ ready = false, onHidden }) {
  const reducedMotion = usePrefersReducedMotion();
  const canvasRef = useRef(null);
  const rootRef = useRef(null);
  const audioRef = useRef(null);
  const rafRef = useRef(0);
  const startRef = useRef(0);
  const readyRef = useRef(ready);
  const closingRef = useRef(false);
  const hiddenCalledRef = useRef(false);
  const reducedDrawnRef = useRef(false);
  const onHiddenRef = useRef(onHidden);

  const [progress, setProgress] = useState(0);
  const [closing, setClosing] = useState(false);
  const [bgUrl, setBgUrl] = useState(null);
  const [spriteUrl, setSpriteUrl] = useState(null);

  // Keep refs of the latest `ready` / `onHidden` so the rAF + dismiss effects
  // always see current values without re-subscribing (and so an unstable
  // onHidden identity can't restart the dismiss backstop on every re-render).
  useEffect(() => {
    readyRef.current = ready;
  }, [ready]);
  useEffect(() => {
    onHiddenRef.current = onHidden;
  }, [onHidden]);

  // Probe the optional background / sprite slots. Absent slots stay null and
  // the procedural composition is used instead. HEAD checks never throw.
  useEffect(() => {
    let alive = true;
    assetExists(ASSET_SLOTS.loader.bg).then((ok) => {
      if (alive && ok) setBgUrl(ASSET_SLOTS.loader.bg);
    });
    assetExists(ASSET_SLOTS.loader.sprite).then((ok) => {
      if (alive && ok) setSpriteUrl(ASSET_SLOTS.loader.sprite);
    });
    return () => { alive = false; };
  }, []);

  // Optional loader theme — silent when the slot is empty. Mounts after the
  // user clicked "ENTER THE ARCADE", so autoplay policy is satisfied; any
  // rejection is swallowed by createSilentAudio. Stopped + disposed on unmount.
  useEffect(() => {
    const audio = createSilentAudio(ASSET_SLOTS.loader.theme, { volume: 0.45, loop: true });
    audioRef.current = audio;
    // give the element a moment to reach canplaythrough before play()
    const t = setTimeout(() => audio.play(), 120);
    return () => {
      clearTimeout(t);
      audio.dispose();
      audioRef.current = null;
    };
  }, []);

  // Single rAF loop: advances the synthetic progress, decides when to close,
  // and draws the canvas. Reads `ready` via ref. Cancels on unmount.
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas ? canvas.getContext('2d') : null;

    // device-pixel sizing, capped so per-frame grain stays cheap on the hub.
    const grain = typeof document !== 'undefined' ? document.createElement('canvas') : null;
    const grainCtx = grain ? grain.getContext('2d') : null;
    if (grain) { grain.width = 96; grain.height = 96; }
    // Allocate the grain ImageData ONCE and rewrite its pixels each frame — a
    // fresh createImageData per frame would churn ~2 MB/s of garbage right when
    // the WebGL hub is fighting for the same frame budget.
    const grainImg = grainCtx ? grainCtx.createImageData(grain.width, grain.height) : null;
    const grainData = grainImg ? grainImg.data : null;

    let W = 0;
    let H = 0;
    // Static gradients are rebuilt only on resize, not every frame.
    let baseGrad = null;
    let vignetteGrad = null;
    const resize = () => {
      if (!canvas) return;
      const dpr = Math.min(typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1, 1.5);
      W = Math.min(window.innerWidth, 1920);
      H = Math.min(window.innerHeight, 1080);
      canvas.width = Math.floor(W * dpr);
      canvas.height = Math.floor(H * dpr);
      canvas.style.width = '100%';
      canvas.style.height = '100%';
      if (ctx) {
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        baseGrad = ctx.createLinearGradient(0, 0, 0, H);
        baseGrad.addColorStop(0, '#0a0016');
        baseGrad.addColorStop(0.55, '#070011');
        baseGrad.addColorStop(1, '#02000a');
        vignetteGrad = ctx.createRadialGradient(
          W / 2, H / 2, Math.min(W, H) * 0.2,
          W / 2, H / 2, Math.max(W, H) * 0.75,
        );
        vignetteGrad.addColorStop(0, 'rgba(0,0,0,0)');
        vignetteGrad.addColorStop(1, 'rgba(0,0,0,0.72)');
      }
      reducedDrawnRef.current = false; // force a redraw of the static frame
    };
    resize();
    window.addEventListener('resize', resize);

    const drawGrain = (t, alpha) => {
      if (!grain || !grainCtx || !ctx || !grainData) return;
      for (let i = 0; i < grainData.length; i += 4) {
        const n = Math.floor(pseudoNoise((i + t * 0.06) * 0.123) * 255);
        grainData[i] = n; grainData[i + 1] = n; grainData[i + 2] = n; grainData[i + 3] = 255;
      }
      grainCtx.putImageData(grainImg, 0, 0);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.globalCompositeOperation = 'screen';
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(grain, 0, 0, W, H);
      ctx.restore();
    };

    const draw = (t) => {
      if (!ctx) return;
      const cx = W / 2;
      const cy = H * 0.46;

      // base gradient (cached; rebuilt only on resize)
      ctx.fillStyle = baseGrad || '#05010f';
      ctx.fillRect(0, 0, W, H);

      // breathing neon core glow
      const breathe = reducedMotion ? 0.6 : 0.5 + 0.5 * Math.sin(t * 0.0017);
      const radius = Math.min(W, H) * (0.34 + 0.05 * breathe);
      const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
      glow.addColorStop(0, `rgba(255,72,196,${0.42 + 0.2 * breathe})`);
      glow.addColorStop(0.4, 'rgba(120,40,200,0.22)');
      glow.addColorStop(1, 'rgba(8,2,20,0)');
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, W, H);

      // halo rings — rotating cross of light (original geometric motif)
      const rot = reducedMotion ? 0.3 : t * 0.0004;
      ctx.translate(cx, cy);
      ctx.rotate(rot);
      ctx.lineWidth = 1.4;
      for (let r = 0; r < 4; r++) {
        const rr = radius * (0.5 + r * 0.16);
        ctx.beginPath();
        ctx.strokeStyle = r % 2 === 0 ? 'rgba(54,214,255,0.30)' : 'rgba(255,92,244,0.26)';
        ctx.arc(0, 0, rr, 0, Math.PI * 2);
        ctx.stroke();
      }
      // thin radial spokes
      ctx.strokeStyle = 'rgba(180,230,255,0.18)';
      for (let s = 0; s < 4; s++) {
        ctx.beginPath();
        const a = (s / 4) * Math.PI * 2;
        ctx.moveTo(Math.cos(a) * radius * 0.4, Math.sin(a) * radius * 0.4);
        ctx.lineTo(Math.cos(a) * radius * 1.05, Math.sin(a) * radius * 1.05);
        ctx.stroke();
      }
      ctx.restore();

      // diagonal "rain" streaks (skipped in reduced motion)
      if (!reducedMotion) {
        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        ctx.strokeStyle = 'rgba(120,180,255,0.10)';
        ctx.lineWidth = 1;
        for (let i = 0; i < 28; i++) {
          const sx = pseudoNoise(i * 7.3) * W;
          const fall = (t * 0.22 + pseudoNoise(i * 3.1) * H) % (H + 80);
          ctx.beginPath();
          ctx.moveTo(sx, fall - 40);
          ctx.lineTo(sx - 7, fall);
          ctx.stroke();
        }
        ctx.restore();
      }

      // intermittent horizontal glitch slices (reduced motion = off)
      if (!reducedMotion && strobeOn(t, 1400, 160)) {
        const bands = 3;
        for (let b = 0; b < bands; b++) {
          const by = pseudoNoise(t * 0.01 + b * 11) * H;
          const bh = 6 + pseudoNoise(b * 5 + t * 0.002) * 22;
          const off = jitter(t * 0.02 + b, 18);
          ctx.save();
          ctx.globalCompositeOperation = 'screen';
          ctx.fillStyle = b % 2 === 0 ? 'rgba(255,40,120,0.16)' : 'rgba(40,220,255,0.16)';
          ctx.fillRect(off, by, W, bh);
          ctx.restore();
        }
      }

      // vignette (cached; rebuilt only on resize)
      if (vignetteGrad) {
        ctx.fillStyle = vignetteGrad;
        ctx.fillRect(0, 0, W, H);
      }

      // film grain
      drawGrain(t, reducedMotion ? 0.03 : 0.07);
    };

    const frame = () => {
      const now = (typeof performance !== 'undefined' ? performance.now() : 0);
      if (!startRef.current) startRef.current = now;
      const elapsed = now - startRef.current;

      const p = syntheticProgress(elapsed, MIN_VISIBLE_MS, readyRef.current);
      setProgress((prev) => (Math.abs(prev - p) > 0.4 ? p : prev));

      if (!closingRef.current && loaderShouldClose(elapsed, MIN_VISIBLE_MS, readyRef.current)) {
        closingRef.current = true;
        setClosing(true);
      }

      // Once dismissing, stop the canvas work entirely: the element is fading to
      // transparent (CSS owns the fade) and the hub behind it is being revealed,
      // so a full-cost draw here would only steal frames. Don't reschedule.
      if (closingRef.current) return;

      // reduced motion: draw the calm composition only once (no animation),
      // but keep ticking so progress + close logic still advance.
      if (reducedMotion) {
        if (!reducedDrawnRef.current) {
          draw(0);
          reducedDrawnRef.current = true;
        }
      } else {
        draw(elapsed);
      }

      rafRef.current = requestAnimationFrame(frame);
    };
    rafRef.current = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener('resize', resize);
    };
  }, [reducedMotion]);

  // When the fade-out transition ends, tell the parent to unmount us. A timeout
  // backstop guarantees onHidden fires even if transitionend is missed. Depends
  // ONLY on `closing` (onHidden is read via ref) so the listener + backstop are
  // installed exactly once when closing flips true — an unstable onHidden
  // identity can no longer tear them down / restart the backstop on re-renders.
  useEffect(() => {
    if (!closing) return undefined;
    const fire = () => {
      if (hiddenCalledRef.current) return;
      hiddenCalledRef.current = true;
      if (audioRef.current) audioRef.current.stop();
      if (onHiddenRef.current) onHiddenRef.current();
    };
    const node = rootRef.current;
    const onEnd = (e) => { if (e.target === node && e.propertyName === 'opacity') fire(); };
    if (node) node.addEventListener('transitionend', onEnd);
    const backstop = setTimeout(fire, FADE_MS + 200);
    return () => {
      if (node) node.removeEventListener('transitionend', onEnd);
      clearTimeout(backstop);
    };
  }, [closing]);

  const css = useMemo(() => loaderCss(reducedMotion), [reducedMotion]);
  const pct = Math.round(progress);

  return (
    <div
      ref={rootRef}
      role="status"
      aria-label="Loading the arcade"
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 10000,
        background: '#05010f',
        overflow: 'hidden',
        opacity: closing ? 0 : 1,
        transition: `opacity ${FADE_MS}ms ease`,
        pointerEvents: closing ? 'none' : 'auto',
        // block taps/clicks from reaching the world while loading
        touchAction: 'none',
      }}
    >
      <style>{css}</style>

      {/* procedural animated canvas (always present; the floor of the visuals) */}
      <canvas ref={canvasRef} className="arcade-loader-canvas" aria-hidden />

      {/* optional ORIGINAL background art slot, blended over the canvas */}
      {bgUrl && (
        <div
          aria-hidden
          className="arcade-loader-bg"
          style={{ backgroundImage: `url("${bgUrl}")` }}
        />
      )}

      {/* CSS scanlines overlay (cheap, separate from canvas) */}
      <div aria-hidden className="arcade-loader-scan" />

      {/* center stack — the visible glitch text is decorative (aria-hidden);
          the single accessible announcement is the root's stable label, and
          load detail is exposed via the progressbar value. No mutating
          aria-label / live text, so screen readers don't over-announce. */}
      <div className="arcade-loader-center">
        <div className="arcade-loader-kicker" aria-hidden>SYSTEM // BOOT</div>
        <div className="arcade-loader-title" data-text="THE ARCADE" aria-hidden>THE ARCADE</div>
        <div className="arcade-loader-sub" aria-hidden>rendering the neon hall</div>

        {/* optional ORIGINAL foreground sprite slot */}
        {spriteUrl && (
          <img className="arcade-loader-sprite" src={spriteUrl} alt="" aria-hidden />
        )}

        <div
          className="arcade-loader-bar"
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuetext={`${pct}%`}
        >
          <div className="arcade-loader-bar-fill" style={{ width: `${pct}%` }} />
        </div>
        <div className="arcade-loader-pct" aria-hidden>{pct}%</div>
      </div>
    </div>
  );
}

// Scoped CSS for the loader. When `reducedMotion` is true we emit a calm,
// animation-free variant (no glitch, flicker, scanline drift, or shimmer).
function loaderCss(reducedMotion) {
  const anim = (decl) => (reducedMotion ? '' : decl);
  return `
.arcade-loader-canvas {
  position: absolute; inset: 0; width: 100%; height: 100%; display: block;
}
.arcade-loader-bg {
  position: absolute; inset: 0;
  background-size: cover; background-position: center;
  mix-blend-mode: screen; opacity: 0.5; pointer-events: none;
}
.arcade-loader-scan {
  position: absolute; inset: 0; pointer-events: none; opacity: 0.5;
  background: repeating-linear-gradient(
    to bottom,
    rgba(0,0,0,0) 0px,
    rgba(0,0,0,0) 2px,
    rgba(0,0,0,0.28) 3px,
    rgba(0,0,0,0) 4px
  );
  ${anim('animation: arcadeLoaderScan 7s linear infinite;')}
}
.arcade-loader-center {
  position: absolute; left: 50%; top: 50%;
  transform: translate(-50%, -50%);
  display: flex; flex-direction: column; align-items: center;
  font-family: 'Courier New', monospace; text-align: center;
  width: min(90vw, 560px); user-select: none;
}
.arcade-loader-kicker {
  color: #36d6ff; letter-spacing: 0.5em; font-size: 12px; font-weight: 700;
  text-indent: 0.5em; margin-bottom: 14px; opacity: 0.85;
  ${anim('animation: arcadeLoaderFlicker 3.3s steps(1) infinite;')}
}
.arcade-loader-title {
  position: relative; color: #f6e9ff; font-weight: 800;
  font-size: clamp(34px, 9vw, 78px); letter-spacing: 0.06em; line-height: 1;
  text-shadow: 0 0 18px rgba(255,72,196,0.55), 0 0 40px rgba(120,40,200,0.4);
  ${anim('animation: arcadeLoaderGlitch 2.6s infinite steps(1);')}
}
.arcade-loader-title::before,
.arcade-loader-title::after {
  content: attr(data-text); position: absolute; left: 0; top: 0; width: 100%;
  ${reducedMotion ? 'display: none;' : ''}
}
.arcade-loader-title::before {
  color: #36d6ff; text-shadow: 2px 0 #36d6ff; mix-blend-mode: screen;
  ${anim('animation: arcadeLoaderShiftA 1.8s infinite steps(2);')}
}
.arcade-loader-title::after {
  color: #ff48c4; text-shadow: -2px 0 #ff48c4; mix-blend-mode: screen;
  ${anim('animation: arcadeLoaderShiftB 2.1s infinite steps(2);')}
}
.arcade-loader-sub {
  color: #9fb6d8; font-size: 13px; letter-spacing: 0.32em; margin-top: 16px;
  text-transform: uppercase;
}
.arcade-loader-sprite {
  max-width: 220px; max-height: 30vh; margin-top: 18px; pointer-events: none;
  filter: drop-shadow(0 0 16px rgba(255,72,196,0.5));
}
.arcade-loader-bar {
  position: relative; width: 100%; height: 6px; margin-top: 26px;
  background: rgba(120,150,220,0.15); border: 1px solid rgba(120,150,220,0.25);
  border-radius: 999px; overflow: hidden;
}
.arcade-loader-bar-fill {
  height: 100%; border-radius: 999px;
  background: linear-gradient(90deg, #36d6ff, #ff48c4);
  box-shadow: 0 0 14px rgba(255,72,196,0.7);
  transition: width 0.18s linear;
}
.arcade-loader-pct {
  color: #cfe6ff; font-size: 12px; letter-spacing: 0.3em; margin-top: 12px;
  font-weight: 700;
}
@keyframes arcadeLoaderScan { from { background-position: 0 0; } to { background-position: 0 64px; } }
@keyframes arcadeLoaderFlicker {
  0%,19%,21%,55%,57%,100% { opacity: 0.85; }
  20%,56% { opacity: 0.25; }
}
@keyframes arcadeLoaderGlitch {
  0%,92%,100% { transform: translate(0,0); }
  93% { transform: translate(-2px,1px); }
  95% { transform: translate(3px,-1px); }
  97% { transform: translate(-1px,0); }
}
@keyframes arcadeLoaderShiftA {
  0%,100% { clip-path: inset(0 0 85% 0); transform: translate(-2px,0); }
  50% { clip-path: inset(60% 0 10% 0); transform: translate(2px,0); }
}
@keyframes arcadeLoaderShiftB {
  0%,100% { clip-path: inset(70% 0 5% 0); transform: translate(2px,0); }
  50% { clip-path: inset(15% 0 55% 0); transform: translate(-2px,0); }
}
@media (prefers-reduced-motion: reduce) {
  .arcade-loader-scan, .arcade-loader-kicker, .arcade-loader-title,
  .arcade-loader-title::before, .arcade-loader-title::after { animation: none !important; }
}
`;
}
