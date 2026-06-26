import { useRef, useMemo, useEffect, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { RigidBody, CapsuleCollider } from '@react-three/rapier';
import * as THREE from 'three';
import SafeModel from './SafeModel';
import { ASSET_SLOTS } from './assets';
import { usePlayerState } from './usePlayerState';
import {
  THREAT_SPAWN_MS,
  THREAT_CATCH_RADIUS,
  threatShouldSpawn,
  threatSpeed,
  steerToward,
  headingTo,
  withinCatchRadius,
  clampToArena,
} from './deathMath';

// M6 roaming threat — the "minotaur": an ORIGINAL horned-capsule hunter that
// spawns after 15 minutes on-site and pursues the player, instantly downing
// them on contact. NOT a real character; the GLB slot (models/minotaur.glb) is
// optional and falls back to the primitive mesh below.
//
// Implementation: a rapier kinematicPosition body whose next translation is
// steered toward the camera (which rides the player capsule) each frame, using
// the pure helpers in deathMath.js. Frozen while a cabinet game is open
// (paused) or while the player is dead (defeat overlay up). On respawn it
// relocates far away with a short grace window so you aren't re-caught instantly.

// Inside the room walls (Hub ROOM.half = 14) with a margin so it never clips out.
const ARENA_HALF = 13.2;
const BODY_Y = 1.2; // capsule centre so the feet rest on the floor
const FAR_SPAWN = { x: 0, y: BODY_Y, z: -12.4 }; // behind the cabinets, opposite the spawn pad
const HIDDEN = { x: 0, y: -60, z: 0 }; // parked below the world before it spawns
const GRACE_MS = 2600; // post-spawn / post-respawn window: it holds, no catch

// Session-anchored start time so "15 minutes on-site" persists across world
// re-entry within the tab and resets on a new tab. sessionStorage survives the
// portfolio↔arcade round-trip; a blocked store (private mode) falls back to an
// in-memory anchor for this mount.
const CLOCK_KEY = 'arcade.threatClock';
function readSessionStartMs() {
  try {
    const existing = sessionStorage.getItem(CLOCK_KEY);
    if (existing != null) {
      const n = Number(existing);
      if (Number.isFinite(n)) return n;
    }
    const now = Date.now();
    sessionStorage.setItem(CLOCK_KEY, String(now));
    return now;
  } catch {
    return Date.now();
  }
}

// QA hook: `?threat=now` spawns the hunter immediately so the owner can verify
// the chase without idling 15 minutes. Pure-default otherwise.
function spawnThresholdMs() {
  try {
    if (typeof window !== 'undefined' && window.location?.search?.includes('threat=now')) {
      return 0;
    }
  } catch { /* ignore */ }
  return THREAT_SPAWN_MS;
}

// Primitive ORIGINAL horned-capsule hunter — the always-present fallback when
// no models/minotaur.glb is dropped in. Dark hide + red rim, two bone horns,
// two glowing eyes. The eyes/horns sit in `faceRef` so they turn to face you.
function MinotaurMesh({ faceRef }) {
  return (
    <group>
      {/* torso/body */}
      <mesh castShadow position={[0, 0, 0]}>
        <capsuleGeometry args={[0.5, 1.4, 6, 14]} />
        <meshStandardMaterial color="#1a0d12" emissive="#ff2740" emissiveIntensity={0.45} roughness={0.6} metalness={0.2} />
      </mesh>
      {/* head + face that turns toward the player */}
      <group ref={faceRef} position={[0, 1.05, 0]}>
        <mesh castShadow>
          <sphereGeometry args={[0.42, 16, 16]} />
          <meshStandardMaterial color="#160a0f" emissive="#7a0f1c" emissiveIntensity={0.5} roughness={0.5} />
        </mesh>
        {/* two horns angled up-and-out */}
        {[-1, 1].map((s) => (
          <mesh key={s} position={[s * 0.3, 0.32, 0.04]} rotation={[0, 0, s * -0.7]} castShadow>
            <coneGeometry args={[0.1, 0.55, 12]} />
            <meshStandardMaterial color="#e9e2d0" emissive="#5a5040" emissiveIntensity={0.2} roughness={0.8} />
          </mesh>
        ))}
        {/* glowing eyes (steady glow — no strobe, reduced-motion-safe) */}
        {[-1, 1].map((s) => (
          <mesh key={s} position={[s * 0.16, 0.05, 0.36]}>
            <sphereGeometry args={[0.07, 10, 10]} />
            <meshStandardMaterial color="#ff5a3c" emissive="#ff3b1e" emissiveIntensity={2.4} toneMapped={false} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

export default function Minotaur({ paused = false }) {
  const bodyRef = useRef(null);
  const groupRef = useRef(null); // visibility toggle (whole avatar)
  const faceRef = useRef(null); // head/horns/eyes yaw to face the player
  const lightRef = useRef(null);
  const { camera } = useThree();
  const player = usePlayerState();

  const [active, setActive] = useState(false); // spawned & visible (drives the menace light)

  // Mutable per-frame state (no React churn).
  const stateRef = useRef({
    spawned: false,
    pos: { x: HIDDEN.x, y: HIDDEN.y, z: HIDDEN.z },
    next: { x: 0, y: 0, z: 0 }, // scratch for steerToward (alloc-free)
    pursuitSeconds: 0,
    graceUntilMs: 0,
    lastEpoch: 0,
    elapsedMs: 0, // accumulated active time, in ms, for the grace clock
  });

  const startMs = useMemo(() => readSessionStartMs(), []);
  const thresholdMs = useMemo(() => spawnThresholdMs(), []);

  const pausedRef = useRef(paused);
  useEffect(() => { pausedRef.current = paused; }, [paused]);

  // Place the body at a world point and sync our scratch + the kinematic target.
  const placeAt = (p) => {
    const s = stateRef.current;
    s.pos.x = p.x; s.pos.y = p.y; s.pos.z = p.z;
    const body = bodyRef.current;
    if (body) {
      try {
        body.setNextKinematicTranslation(s.pos);
        body.setTranslation(s.pos, true);
      } catch { /* body not ready */ }
    }
  };

  // Park below the world until it spawns.
  useEffect(() => { placeAt(HIDDEN); }, []);

  useFrame((_, dtRaw) => {
    const body = bodyRef.current;
    if (!body) return;
    const s = stateRef.current;
    const dt = Math.min(dtRaw, 0.05); // clamp huge frames (tab refocus) so it can't teleport

    // Spawn gate: anchored to the session clock. Once spawned it stays spawned.
    if (!s.spawned) {
      const elapsed = Date.now() - startMs;
      if (threatShouldSpawn(elapsed, thresholdMs)) {
        s.spawned = true;
        s.pursuitSeconds = 0;
        s.graceUntilMs = s.elapsedMs + GRACE_MS;
        s.lastEpoch = player.getRespawnEpoch();
        if (groupRef.current) groupRef.current.visible = true;
        placeAt(FAR_SPAWN);
        setActive(true);
      } else {
        body.setNextKinematicTranslation(s.pos); // hold parked
        return;
      }
    }

    // On respawn: relocate far from the player and re-grace so it can't insta-catch.
    const epoch = player.getRespawnEpoch();
    if (epoch !== s.lastEpoch) {
      s.lastEpoch = epoch;
      s.pursuitSeconds = 0;
      s.graceUntilMs = s.elapsedMs + GRACE_MS;
      placeAt(FAR_SPAWN);
    }

    // Frozen while a cabinet game is open or the player is dead (defeat screen).
    if (pausedRef.current || player.getDead()) {
      body.setNextKinematicTranslation(s.pos);
      if (faceRef.current) faceRef.current.rotation.y = headingTo(s.pos, camera.position);
      return;
    }

    s.elapsedMs += dt * 1000;
    const inGrace = s.elapsedMs < s.graceUntilMs;

    // Face the player even while holding during grace.
    if (faceRef.current) faceRef.current.rotation.y = headingTo(s.pos, camera.position);

    if (!inGrace) {
      s.pursuitSeconds += dt;
      const step = threatSpeed(s.pursuitSeconds) * dt;
      steerToward(s.next, s.pos, camera.position, step);
      s.pos.x = clampToArena(s.next.x, ARENA_HALF);
      s.pos.z = clampToArena(s.next.z, ARENA_HALF);
      s.pos.y = BODY_Y;

      // Catch → instant down. The defeat flow (overlay + respawn) is driven by
      // usePlayerState's `dead` latch bridged into React in index.jsx.
      if (withinCatchRadius(s.pos, camera.position, THREAT_CATCH_RADIUS)) {
        player.kill();
      }
    }

    body.setNextKinematicTranslation(s.pos);
    if (lightRef.current) {
      lightRef.current.position.set(s.pos.x, s.pos.y + 1.4, s.pos.z);
    }
  });

  return (
    <>
      <RigidBody
        ref={bodyRef}
        type="kinematicPosition"
        colliders={false}
        position={[HIDDEN.x, HIDDEN.y, HIDDEN.z]}
        ccd
      >
        <CapsuleCollider args={[0.7, 0.5]} />
        <group ref={groupRef} visible={false}>
          {/* Optional ORIGINAL glb; falls back to the primitive horned capsule. */}
          <SafeModel url={ASSET_SLOTS.models.minotaur} fallback={<MinotaurMesh faceRef={faceRef} />} />
        </group>
      </RigidBody>
      {/* menace light only while the hunter is loose (kept out of the hidden state). */}
      {active && <pointLight ref={lightRef} color="#ff2740" intensity={1.1} distance={7} />}
    </>
  );
}
