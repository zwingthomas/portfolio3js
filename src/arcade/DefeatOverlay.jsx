import { useEffect, useRef, useState, useCallback } from 'react';
import { createSilentAudio, ASSET_SLOTS } from './assets';

// M6 defeat screen — an ORIGINAL grayscale "downed" overlay (a "WASTED"-style
// beat, but original art + wording, NOT GTA's). Default shipped state is a
// procedural grayscale vignette that desaturates the live world view, with an
// original "DOWNED" headline. An optional ORIGINAL still (defeat/overlay.png)
// layers on top when present; the defeat sting (audio/defeat-sting.mp3) plays
// once if present, silent otherwise.
//
// Mounted as a DOM sibling overlay above the games (z 10002) from index.jsx
// whenever the shared player state latches `dead`. Honors prefers-reduced-motion:
// no strobe/flicker, just a smooth fade. Calls onRespawn on click / Enter / a
// backstop timer; the parent clears `dead` and the controller teleports home.

const AUTO_RESPAWN_MS = 6000; // backstop so a player can't get stuck on the screen
const PROMPT_DELAY_MS = 1100; // when the RESPAWN affordance appears

export default function DefeatOverlay({ onRespawn }) {
  const [artOk, setArtOk] = useState(false);
  const [showPrompt, setShowPrompt] = useState(false);
  const rootRef = useRef(null);
  const btnRef = useRef(null);
  const stingRef = useRef(null);
  const doneRef = useRef(false);

  const reduced = (() => {
    try {
      return typeof window !== 'undefined'
        && window.matchMedia
        && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch {
      return false;
    }
  })();

  // single-shot respawn (button, key, or backstop all route here)
  const respawn = useCallback(() => {
    if (doneRef.current) return;
    doneRef.current = true;
    if (onRespawn) onRespawn();
  }, [onRespawn]);

  // defeat sting (silent when the slot is empty), prompt reveal, auto-respawn
  // backstop, and a key handler — all wired once on mount, torn down on unmount.
  useEffect(() => {
    const sting = createSilentAudio(ASSET_SLOTS.audio.defeatSting, { volume: 0.6 });
    stingRef.current = sting;
    sting.play();

    // Move focus into the modal immediately on death (it's aria-modal) so the
    // defeat is announced and keyboard focus leaves the now-frozen world; the
    // showPrompt effect below advances focus to the RESPAWN button at ~1.1s.
    try { rootRef.current?.focus(); } catch { /* ignore */ }

    const promptT = setTimeout(() => setShowPrompt(true), PROMPT_DELAY_MS);
    const autoT = setTimeout(respawn, AUTO_RESPAWN_MS);

    const onKey = (e) => {
      // Enter / Space confirm the respawn. (Esc keeps its global meaning.)
      if (e.code === 'Enter' || e.code === 'NumpadEnter' || e.code === 'Space') {
        e.preventDefault();
        respawn();
      }
    };
    window.addEventListener('keydown', onKey);

    return () => {
      clearTimeout(promptT);
      clearTimeout(autoT);
      window.removeEventListener('keydown', onKey);
      try { sting.dispose(); } catch { /* ignore */ }
      stingRef.current = null;
    };
  }, [respawn]);

  // focus the button when it appears so Enter works and it's screen-reader-announced
  useEffect(() => {
    if (showPrompt && btnRef.current) {
      try { btnRef.current.focus(); } catch { /* ignore */ }
    }
  }, [showPrompt]);

  const fadeIn = reduced
    ? { opacity: 1 }
    : { opacity: 0, animation: 'arcadeDefeatFade 700ms ease-out forwards' };

  return (
    <div
      ref={rootRef}
      role="alertdialog"
      aria-modal="true"
      aria-label="You were downed. Respawn to continue."
      tabIndex={-1}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 10002,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        // desaturate + darken the live world behind the overlay (the grayscale
        // "downed" look); degrades to the dark layer below where unsupported.
        backdropFilter: 'grayscale(1) brightness(0.45) contrast(1.05)',
        WebkitBackdropFilter: 'grayscale(1) brightness(0.45) contrast(1.05)',
        background:
          'radial-gradient(ellipse at center, rgba(8,8,10,0.55) 0%, rgba(2,2,3,0.92) 70%, rgba(0,0,0,0.98) 100%)',
        cursor: 'pointer',
        userSelect: 'none',
        ...fadeIn,
      }}
      onClick={respawn}
    >
      {/* keyframes — only used when motion is allowed */}
      {!reduced && (
        <style>{`
          @keyframes arcadeDefeatFade { from { opacity: 0 } to { opacity: 1 } }
          @keyframes arcadeDefeatRise {
            from { transform: translateY(14px) scale(0.98); opacity: 0 }
            to   { transform: translateY(0) scale(1); opacity: 1 }
          }
        `}</style>
      )}

      {/* optional ORIGINAL still art, layered above the vignette (decorative) */}
      <img
        src={ASSET_SLOTS.defeat.overlay}
        alt=""
        aria-hidden="true"
        onLoad={() => setArtOk(true)}
        onError={() => setArtOk(false)}
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          filter: 'grayscale(1)',
          opacity: artOk ? 0.5 : 0,
          pointerEvents: 'none',
        }}
      />

      <div
        style={{
          position: 'relative',
          textAlign: 'center',
          fontFamily: 'monospace',
          color: '#e9e9ec',
          textShadow: '0 2px 18px #000, 0 0 2px #000',
          animation: reduced ? undefined : 'arcadeDefeatRise 800ms 120ms ease-out both',
        }}
      >
        <div
          style={{
            fontSize: 'clamp(48px, 12vw, 130px)',
            fontWeight: 900,
            letterSpacing: '0.12em',
            color: '#d7d7da',
            lineHeight: 1,
          }}
        >
          DOWNED
        </div>
        <div
          style={{
            marginTop: 14,
            fontSize: 'clamp(12px, 2.4vw, 18px)',
            letterSpacing: '0.35em',
            color: '#9a9aa0',
          }}
        >
          THE HUNTER GOT YOU
        </div>

        {/* RESPAWN affordance (appears after a beat; button is keyboard/touch-ready) */}
        <button
          ref={btnRef}
          type="button"
          onClick={(e) => { e.stopPropagation(); respawn(); }}
          style={{
            marginTop: 34,
            padding: '12px 30px',
            fontFamily: 'monospace',
            fontWeight: 800,
            fontSize: 16,
            letterSpacing: '0.2em',
            color: '#0b0b0d',
            background: '#dcdce0',
            border: '2px solid #ffffff',
            borderRadius: 10,
            cursor: 'pointer',
            opacity: showPrompt ? 1 : 0,
            transition: reduced ? undefined : 'opacity 400ms ease-out',
            pointerEvents: showPrompt ? 'auto' : 'none',
          }}
        >
          RESPAWN ⟳
        </button>
        <div
          style={{
            marginTop: 14,
            fontSize: 12,
            color: '#7a7a80',
            opacity: showPrompt ? 1 : 0,
            transition: reduced ? undefined : 'opacity 400ms ease-out',
          }}
        >
          click · tap · or press Enter
        </div>
      </div>
    </div>
  );
}
