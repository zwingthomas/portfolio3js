import { Suspense, lazy, useState, useEffect, useCallback, useRef } from 'react';
import { Canvas } from '@react-three/fiber';
import { KeyboardControls, Html, useProgress } from '@react-three/drei';
import { Physics } from '@react-three/rapier';
import { CONTROLS_MAP, PLAYER_CONFIG } from './controls';
import { HeldObjectProvider, useHeldObject } from './useHeldObject';
import { isCoarsePointer, resetTouchInput } from './touchInput';
import Player from './Player';
import Hub from './Hub';
import TouchControls from './TouchControls';
import ArcadeLoader from './ArcadeLoader';

// Game modules are lazy-loaded so they never bloat the initial portfolio paint;
// they only fetch once the player actually enters a cabinet.
const PulseGame = lazy(() => import('./games/PulseGame'));
const GridlockGame = lazy(() => import('./games/GridlockGame'));

// ===========================================================================
// ArcadeExperience — Milestone-1 explorable 3D hub.
//
// Renders a full-screen fixed overlay above the page containing an r3f Canvas
// with a rapier Physics world, a first-person Player controller, and the neon
// hub (cabinets, Traxy kiosk, throwables). All game-specific logic plugs in at
// the cabinet `onActivate` hook in later milestones.
//
// Mount from the page like:
//   {showArcade && <ArcadeExperience onExit={() => setShowArcade(false)} />}
// ===========================================================================

function CanvasLoader() {
  const { progress } = useProgress();
  return (
    <Html center>
      <div style={{ color: '#36d6ff', fontWeight: 800, fontFamily: 'monospace' }}>
        loading arcade… {progress.toFixed(0)}%
      </div>
    </Html>
  );
}

export default function ArcadeExperience({ onExit }) {
  const [locked, setLocked] = useState(false);
  const [holding, setHolding] = useState(false);
  // M2 loader: shown until the r3f scene commits AND the minimum on-screen time
  // has elapsed. `sceneReady` is flipped by <ReadyBeacon> inside the Canvas
  // Suspense boundary; `showLoader` keeps the overlay mounted until it fades.
  const [sceneReady, setSceneReady] = useState(false);
  const [showLoader, setShowLoader] = useState(true);
  // Decide once (on mount) whether to use the touch fallback. Coarse pointer =
  // no mouse/pointer-lock, so we show on-screen controls and manual look.
  const [touchMode] = useState(() => isCoarsePointer());

  // Which cabinet game (if any) is currently full-screen. null = roaming the
  // hub. Read via ref in the window-level Esc handler so it can route the press
  // (close the game) without re-subscribing the listener every render.
  const [activeGame, setActiveGame] = useState(null);
  const activeGameRef = useRef(activeGame);
  activeGameRef.current = activeGame;

  // Start every (re)entry with a neutral touch-input state.
  useEffect(() => {
    resetTouchInput();
  }, []);

  // Esc routing (single owner): if a cabinet game is open, the first Esc closes
  // the GAME and restores the world; otherwise Esc exits the whole experience.
  // (pointer-lock also releases on Esc; we still give an explicit exit.)
  useEffect(() => {
    const onKey = (e) => {
      if (e.code !== 'Escape') return;
      if (activeGameRef.current) {
        setActiveGame(null); // close the game, stay in the world
        return;
      }
      if (onExit) onExit();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onExit]);

  const handleActivateCabinet = useCallback((name) => {
    // PULSE (M3) and GRIDLOCK (M4) launch full-screen cabinet games. Others are
    // still placeholders until their milestones land. Each frees the cursor (so
    // the game's UI / tap input works) and the world re-locks on click on exit.
    if (name === 'PULSE' || name === 'GRIDLOCK') {
      try { document.exitPointerLock?.(); } catch { /* ignore */ }
      setActiveGame(name);
      return;
    }
    console.log(`[arcade] cabinet activated: ${name} (game launches in a later milestone)`);
  }, []);

  const handleCloseGame = useCallback(() => setActiveGame(null), []);

  // Stable identities so the loader's scene-ready beacon + dismiss backstop are
  // wired exactly once (an inline arrow would re-fire / restart them on every
  // re-render from setLocked / setHolding).
  const handleSceneReady = useCallback(() => setSceneReady(true), []);
  const handleLoaderHidden = useCallback(() => setShowLoader(false), []);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: '#05010f',
        overflow: 'hidden',
      }}
    >
      <KeyboardControls map={CONTROLS_MAP}>
        <HeldObjectProvider>
          <Canvas
            shadows
            dpr={[1, 1.8]}
            camera={{ fov: 70, near: 0.1, far: 200, position: [0, PLAYER_CONFIG.eyeHeight, 8] }}
            gl={{ antialias: true, powerPreference: 'high-performance' }}
            style={{ width: '100%', height: '100%', cursor: 'crosshair', touchAction: 'none' }}
          >
            <color attach="background" args={['#05010f']} />
            <fog attach="fog" args={['#05010f', 16, 40]} />
            <Suspense fallback={<CanvasLoader />}>
              <Physics gravity={[0, -18, 0]}>
                <Hub onActivateCabinet={handleActivateCabinet} paused={activeGame != null} />
                <Player onLockChange={setLocked} touchMode={touchMode} paused={activeGame != null} />
                {/* bridge held-state from the per-frame system into React for HUD.
                    Mounted inside provider so it can subscribe. */}
                <HeldStateBridge onChange={setHolding} />
                {/* commits only once the Suspense subtree resolves → tells the
                    loader the world is ready to reveal. */}
                <ReadyBeacon onReady={handleSceneReady} />
              </Physics>
            </Suspense>
          </Canvas>

          <Hud locked={locked} holding={holding} onExit={onExit} touchMode={touchMode} />
          {touchMode && !activeGame && <TouchControls />}
          {showLoader && (
            <ArcadeLoader ready={sceneReady} onHidden={handleLoaderHidden} />
          )}
          {/* full-screen cabinet games (lazy). Mounted as a sibling overlay, like
              the loader — never edits the owner-owned src/App.jsx. */}
          {activeGame === 'PULSE' && (
            <Suspense fallback={null}>
              <PulseGame onExit={handleCloseGame} />
            </Suspense>
          )}
          {activeGame === 'GRIDLOCK' && (
            <Suspense fallback={null}>
              <GridlockGame onExit={handleCloseGame} />
            </Suspense>
          )}
        </HeldObjectProvider>
      </KeyboardControls>
    </div>
  );
}

// Rendered inside the Canvas Suspense boundary: it mounts only once the
// suspended subtree has resolved and committed, which is our signal that the
// world is ready to reveal behind the M2 loader. The effect fires exactly once
// on that commit — onReady is read via ref so an unstable prop identity can't
// re-fire it on later re-renders.
function ReadyBeacon({ onReady }) {
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;
  useEffect(() => {
    onReadyRef.current();
  }, []);
  return null;
}

// Tiny non-visual component that subscribes to the held-object system and lifts
// the boolean into React so the HUD reticle can react. Rendered inside
// <Physics> which is inside HeldObjectProvider, so context is available.
function HeldStateBridge({ onChange }) {
  const held = useHeldObject();
  useEffect(() => {
    const unsub = held.subscribe((id) => onChange(id != null));
    return unsub;
  }, [held, onChange]);
  return null;
}

// --------------------------------- HUD -------------------------------------
function Hud({ locked, holding, onExit, touchMode = false }) {
  return (
    <>
      {/* crosshair */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: 18,
          height: 18,
          pointerEvents: 'none',
          zIndex: 2,
        }}
      >
        <div style={{ position: 'absolute', top: 8, left: 0, width: 18, height: 2, background: holding ? '#36ff9e' : '#ffffff', opacity: 0.9 }} />
        <div style={{ position: 'absolute', left: 8, top: 0, width: 2, height: 18, background: holding ? '#36ff9e' : '#ffffff', opacity: 0.9 }} />
      </div>

      {/* start / lock hint (desktop pointer-lock only) */}
      {!locked && !touchMode && (
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, 40px)',
            color: '#bfe9ff',
            fontFamily: 'monospace',
            fontSize: 14,
            textAlign: 'center',
            pointerEvents: 'none',
            zIndex: 2,
            textShadow: '0 0 8px #000',
          }}
        >
          click to start · move with WASD · mouse to look
        </div>
      )}

      {/* controls legend */}
      <div
        style={{
          position: 'absolute',
          bottom: 16,
          left: 16,
          color: '#bfe9ff',
          fontFamily: 'monospace',
          fontSize: 12,
          lineHeight: 1.6,
          background: 'rgba(10,4,32,0.6)',
          border: '1px solid #2a1d66',
          borderRadius: 8,
          padding: '10px 14px',
          zIndex: 2,
          pointerEvents: 'none',
          // hidden on touch: the joystick + labelled GRAB/THROW/JUMP buttons
          // are self-explanatory and would otherwise overlap the joystick.
          display: touchMode ? 'none' : 'block',
        }}
      >
        <div style={{ color: '#ff5cf4', fontWeight: 700, marginBottom: 4 }}>CONTROLS</div>
        <div>WASD — move</div>
        <div>Mouse — look</div>
        <div>Space — jump</div>
        <div>E — pick up / drop</div>
        <div>Left click — throw (while holding)</div>
        <div>Esc — exit</div>
      </div>

      {/* desktop note */}
      <div
        style={{
          position: 'absolute',
          top: 16,
          left: 16,
          color: '#8aa0c8',
          fontFamily: 'monospace',
          fontSize: 11,
          zIndex: 2,
          pointerEvents: 'none',
        }}
      >
        {touchMode
          ? 'touch controls active · joystick + drag to look'
          : 'best experienced on desktop (keyboard + mouse)'}
      </div>

      {/* exit button (clickable) */}
      <button
        type="button"
        onClick={onExit}
        style={{
          position: 'absolute',
          top: 16,
          right: 16,
          zIndex: 3,
          color: '#fff',
          background: 'rgba(255,59,107,0.85)',
          border: '1px solid #ff3b6b',
          borderRadius: 8,
          padding: '8px 16px',
          fontFamily: 'monospace',
          fontWeight: 700,
          cursor: 'pointer',
        }}
      >
        EXIT ✕
      </button>
    </>
  );
}
