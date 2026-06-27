// MUST be first: patches troika-three-text so drei <Text> can construct on
// three r0.175 (Object3D ctor assigns getter-only customDepthMaterial). Without
// this, every <Text> throws and the arcade renders a black screen. See the file.
import './troikaTextFix.js';
import { Suspense, lazy, useState, useEffect, useCallback, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { KeyboardControls, Html, useProgress } from '@react-three/drei';
import { Physics } from '@react-three/rapier';
import { CONTROLS_MAP, PLAYER_CONFIG } from './controls';
import { HeldObjectProvider, useHeldObject } from './useHeldObject';
import { PlayerStateProvider, usePlayerState } from './usePlayerState';
import { RideStateProvider, useRideState } from './useRideState';
import { QuestProvider, useQuest } from './useQuest';
import { inTallGrass, GRASS_STEP, makeRng, rollEncounter } from './cycleMath';
import { isCoarsePointer, resetTouchInput } from './touchInput';
import Player from './Player';
import Hub from './Hub';
import Minotaur from './Minotaur';
import TouchControls from './TouchControls';
import ArcadeLoader from './ArcadeLoader';
import DefeatOverlay from './DefeatOverlay';
import { GhostReplay, GhostRecorder } from './Ghosts';

// Game modules are lazy-loaded so they never bloat the initial portfolio paint;
// they only fetch once the player actually enters a cabinet.
const PulseGame = lazy(() => import('./games/PulseGame'));
const GridlockGame = lazy(() => import('./games/GridlockGame'));
const CascadeGame = lazy(() => import('./games/CascadeGame'));
// M7 NEON RUNNER grid duel — triggered when the riding player enters a hub
// "tall grass" zone (see <GrassEncounter> below), not a cabinet. Lazy like the
// cabinet games so it never bloats the initial paint.
const NeonRunnerGame = lazy(() => import('./games/NeonRunnerGame'));

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

  // M7: per-encounter seed for the NEON RUNNER duel (varies each grass trigger
  // so back-to-back duels don't replay identically). Lifted riding flag drives
  // the DOM "RIDING" hint (set by <RideBridge>).
  const [encounterSeed, setEncounterSeed] = useState(0);
  const [riding, setRiding] = useState(false);

  // M6: latched true while the defeat overlay is up. Lifted out of the shared
  // player-state store by <DeathLayer>; it freezes the world (paused) and gates
  // the touch controls just like an open cabinet game does.
  const [dead, setDead] = useState(false);
  // The world is frozen whenever a cabinet game is open OR the player is dead.
  const frozen = activeGame != null || dead;

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
    // PULSE (M3), GRIDLOCK (M4) and CASCADE (M5) launch full-screen cabinet
    // games. Others are still placeholders until their milestones land. Each
    // frees the cursor (so the game's UI / tap input works) and the world
    // re-locks on click on exit.
    if (name === 'PULSE' || name === 'GRIDLOCK' || name === 'CASCADE') {
      try { document.exitPointerLock?.(); } catch { /* ignore */ }
      setActiveGame(name);
      return;
    }
    console.log(`[arcade] cabinet activated: ${name} (game launches in a later milestone)`);
  }, []);

  const handleCloseGame = useCallback(() => setActiveGame(null), []);

  // M7: a tall-grass roll hit while riding → open the full-screen NEON RUNNER
  // duel. Free the cursor first (mirrors the cabinet launches) so the duel's DOM
  // UI / tap input works; the world freezes via `frozen` while the duel is up.
  const handleGrassEncounter = useCallback((n) => {
    try { document.exitPointerLock?.(); } catch { /* ignore */ }
    setEncounterSeed(n);
    setActiveGame('NEON_RUNNER');
  }, []);

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
          <PlayerStateProvider>
           <RideStateProvider>
            <QuestProvider>
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
                  <Hub onActivateCabinet={handleActivateCabinet} paused={frozen} />
                  <Player onLockChange={setLocked} touchMode={touchMode} paused={frozen} />
                  {/* M6 roaming threat: spawns after 15 min on-site, hunts the
                      player, frozen while a cabinet game is open. Death/respawn is
                      driven through the shared player-state store. */}
                  <Minotaur paused={activeGame != null} />
                  {/* M7: watches the riding player's travel through "tall grass"
                      and rolls a NEON RUNNER encounter; fires once per entry. */}
                  <GrassEncounter paused={frozen} onEncounter={handleGrassEncounter} />
                  {/* M8 ghost backend: records THIS visit anonymously (poses only,
                      no PII) and replays recent visitors' ghosts with floating
                      date/time labels. Both no-op when VITE_GHOST_API_BASE is
                      unset (the default shipped state) → the world runs solo. */}
                  <GhostRecorder />
                  <GhostReplay paused={frozen} touchMode={touchMode} />
                  {/* M9 adventure layer: watches the player's position and marks
                      each attraction (cabinets, kiosk, cycle bay, grass,
                      mezzanine) discovered as they walk near it, feeding the
                      objective HUD. Zero per-frame alloc; no-ops while frozen. */}
                  <QuestWatcher paused={frozen} />
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
            {/* M9 objective tracker: progress + next suggested attraction. Lives
                in the DOM inside <QuestProvider>; hidden while the world is frozen
                (a cabinet game open / dead) so it never covers a game UI, and
                hidden while riding so it never overlaps the top-center RIDING hint
                (which already carries the grass guidance). */}
            <QuestHud frozen={frozen} riding={riding} touchMode={touchMode} />
            {/* M6 health bar + defeat overlay + respawn. <DeathLayer> lives in the
                DOM (inside the provider) so it can both lift `dead` into React and
                call respawn(). Hidden while a cabinet game owns the screen. */}
            {!frozen && <HealthBar />}
            <DeathLayer onDeadChange={setDead} suppressed={activeGame != null} />
            {touchMode && !frozen && <TouchControls />}
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
            {activeGame === 'CASCADE' && (
              <Suspense fallback={null}>
                <CascadeGame onExit={handleCloseGame} />
              </Suspense>
            )}
            {/* M7 NEON RUNNER grid duel (triggered from a tall-grass roll while
                riding). Full-screen DOM overlay, lazy like the cabinets; ESC is
                routed by the window handler above to close it and ride on. */}
            {activeGame === 'NEON_RUNNER' && (
              <Suspense fallback={null}>
                <NeonRunnerGame onExit={handleCloseGame} seed={encounterSeed} />
              </Suspense>
            )}
            {/* M7: lift the ride flag into React for the HUD hint. */}
            <RideBridge onRidingChange={setRiding} />
            {riding && !frozen && (
              <div
                style={{
                  position: 'absolute',
                  top: 84,
                  left: '50%',
                  transform: 'translateX(-50%)',
                  zIndex: 2,
                  pointerEvents: 'none',
                  color: '#36d6ff',
                  fontFamily: 'monospace',
                  fontSize: 13,
                  fontWeight: 700,
                  letterSpacing: '0.08em',
                  textShadow: '0 0 8px #000, 0 0 14px #36d6ff',
                }}
              >
                ◈ RIDING · {touchMode ? 'GRAB' : 'E'} to dismount · ride into TALL GRASS for a duel
              </div>
            )}
            </QuestProvider>
           </RideStateProvider>
          </PlayerStateProvider>
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

// M7: per-frame watcher (inside the Canvas) that turns riding the cycle through
// a hub "tall grass" zone into a NEON RUNNER encounter. Each frame it tracks how
// far the rider has travelled INSIDE a patch; every GRASS_STEP metres it pulls
// one seeded roll, and a hit fires onEncounter(count) ONCE. It re-arms only after
// the rider leaves every patch, so the duel can't immediately re-trigger when it
// closes (you're still standing in the grass). Alloc-free: one mutable scratch
// read each frame + a fixed-seed PRNG stream (deterministic, no Math.random).
function GrassEncounter({ paused = false, onEncounter }) {
  const ride = useRideState();
  const { camera } = useThree();
  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  const onEncounterRef = useRef(onEncounter);
  onEncounterRef.current = onEncounter;

  const s = useRef(null);
  if (s.current === null) {
    s.current = { rng: makeRng(0x9e7c15), prevX: 0, prevZ: 0, havePrev: false, dist: 0, armed: true, count: 0 };
  }

  useFrame(() => {
    const st = s.current;
    // Frozen (a game open / dead) or on foot: stop accumulating so resuming the
    // ride doesn't bank a huge teleport-sized step.
    if (pausedRef.current || !ride.getRiding()) {
      st.havePrev = false;
      st.dist = 0;
      return;
    }
    const px = camera.position.x;
    const pz = camera.position.z;
    if (inTallGrass(px, pz) === -1) {
      // ridden out of all grass → re-arm and reset travel tracking.
      st.armed = true;
      st.dist = 0;
      st.havePrev = true;
      st.prevX = px;
      st.prevZ = pz;
      return;
    }
    // inside a patch: seed prev on entry, then accumulate planar travel.
    if (!st.havePrev) {
      st.havePrev = true;
      st.prevX = px;
      st.prevZ = pz;
      return;
    }
    const dx = px - st.prevX;
    const dz = pz - st.prevZ;
    st.prevX = px;
    st.prevZ = pz;
    st.dist += Math.sqrt(dx * dx + dz * dz);
    if (st.armed && st.dist >= GRASS_STEP) {
      st.dist = 0;
      if (rollEncounter(st.rng)) {
        st.armed = false; // one duel per grass entry; re-arm on leaving
        st.count += 1;
        if (onEncounterRef.current) onEncounterRef.current(st.count);
      }
    }
  });
  return null;
}

// M7: bridges the shared ride flag (mount/dismount) into React so the DOM HUD
// can show a "RIDING" hint. Lives in the DOM tree inside <RideStateProvider>.
function RideBridge({ onRidingChange }) {
  const ride = useRideState();
  const onChangeRef = useRef(onRidingChange);
  onChangeRef.current = onRidingChange;
  useEffect(() => {
    const unsub = ride.subscribe((r) => onChangeRef.current?.(r));
    return unsub;
  }, [ride]);
  return null;
}

// M9: per-frame watcher (inside the Canvas) that records "discovery" of each
// attraction as the player walks near it. Reads the camera XZ and asks the quest
// store to mark the nearest undiscovered landmark found; the store no-ops once a
// spot is known, so the steady state is a handful of distance² compares with
// ZERO per-frame allocation. Frozen (a game open / dead) → skip.
function QuestWatcher({ paused = false }) {
  const quest = useQuest();
  const { camera } = useThree();
  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  useFrame(() => {
    if (pausedRef.current) return;
    quest.tryDiscover(camera.position.x, camera.position.z);
  });
  return null;
}

// M9 objective tracker (DOM overlay): subscribes to the quest store and shows the
// current progress + the next suggested attraction, plus a row of pips and a
// brief "DISCOVERED: X" line on the latest find. Static text only (no animation)
// so it's reduced-motion safe by construction. Lives inside <QuestProvider>.
//
// HUD layering: the top-center column is shared with the touch look-hint
// (TouchControls, top:56) and the RIDING hint (top:84). To avoid overlap we (a)
// hide entirely while `riding` (the RIDING hint already names the grass
// objective), and (b) on touch drop below the look-hint band (top:92). On
// desktop it sits at the top of the column (top:52) with the riding hint hidden
// unless riding (when we're hidden), so the bands never collide.
function QuestHud({ frozen = false, riding = false, touchMode = false }) {
  const quest = useQuest();
  const [snap, setSnap] = useState(() => quest.getSummary());
  useEffect(() => {
    const unsub = quest.subscribe((s) => setSnap(s));
    return unsub;
  }, [quest]);

  if (frozen || riding) return null;
  const { found, total, complete, line, lastLabel } = snap;
  const accent = complete ? '#ffd23b' : '#36d6ff';
  return (
    <div
      style={{
        position: 'absolute',
        top: touchMode ? 92 : 52,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 2,
        pointerEvents: 'none',
        maxWidth: '92vw',
        textAlign: 'center',
        fontFamily: 'monospace',
      }}
    >
      <div
        style={{
          display: 'inline-block',
          background: 'rgba(10,4,32,0.66)',
          border: `1px solid ${accent}`,
          borderRadius: 8,
          padding: '5px 12px',
          color: '#eaf4ff',
          fontSize: 12,
          fontWeight: 700,
          letterSpacing: '0.04em',
          textShadow: '0 0 8px #000',
          boxShadow: '0 0 12px rgba(0,0,0,0.45)',
        }}
      >
        <span style={{ color: accent }}>{complete ? '★ ' : '◈ '}</span>
        {line}
        <div style={{ marginTop: 4, display: 'flex', gap: 4, justifyContent: 'center' }}>
          {Array.from({ length: total }).map((_, i) => (
            <span
              key={i}
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: i < found ? accent : 'transparent',
                border: `1px solid ${accent}`,
                boxShadow: i < found ? `0 0 6px ${accent}` : 'none',
              }}
            />
          ))}
        </div>
        {lastLabel && !complete && (
          <div style={{ marginTop: 3, color: '#36ff9e', fontSize: 10, letterSpacing: '0.08em' }}>
            DISCOVERED: {lastLabel}
          </div>
        )}
      </div>
    </div>
  );
}

// M6: bridges the shared `dead` latch into React (lifting it to ArcadeExperience
// so the world freezes) and renders the defeat overlay with a respawn handler.
// Lives in the DOM tree inside <PlayerStateProvider> so it can both subscribe
// and call respawn().
function DeathLayer({ onDeadChange, suppressed = false }) {
  const player = usePlayerState();
  const [dead, setDeadLocal] = useState(false);
  const onDeadChangeRef = useRef(onDeadChange);
  onDeadChangeRef.current = onDeadChange;

  useEffect(() => {
    const unsub = player.subscribe((_h, d) => {
      setDeadLocal(d);
      onDeadChangeRef.current?.(d);
    });
    return unsub;
  }, [player]);

  const handleRespawn = useCallback(() => player.respawn(), [player]);

  if (!dead || suppressed) return null;
  return <DefeatOverlay onRespawn={handleRespawn} />;
}

// M6 health readout: a small DOM bar fed by the shared player-state store.
function HealthBar() {
  const player = usePlayerState();
  const max = player.getMaxHealth();
  const [hp, setHp] = useState(() => player.getHealth());
  useEffect(() => {
    const unsub = player.subscribe((h) => setHp(h));
    return unsub;
  }, [player]);

  const pct = Math.max(0, Math.min(100, (hp / max) * 100));
  const color = pct > 50 ? '#36ff9e' : pct > 25 ? '#ffd23b' : '#ff3b6b';
  return (
    <div
      style={{
        position: 'absolute',
        bottom: 16,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 2,
        pointerEvents: 'none',
        fontFamily: 'monospace',
        textAlign: 'center',
      }}
    >
      <div style={{ color: '#bfe9ff', fontSize: 10, letterSpacing: '0.2em', marginBottom: 4, textShadow: '0 0 6px #000' }}>
        VITALS
      </div>
      <div
        style={{
          width: 180,
          height: 12,
          borderRadius: 6,
          border: '1px solid #2a1d66',
          background: 'rgba(10,4,32,0.7)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: `${pct}%`,
            height: '100%',
            background: color,
            boxShadow: `0 0 8px ${color}`,
            transition: 'width 180ms linear, background 180ms linear',
          }}
        />
      </div>
    </div>
  );
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
