import { useRef, useState, useEffect, useMemo } from 'react';
import { Text } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import SafeModel from './SafeModel';
import { ASSET_SLOTS, createSilentAudio } from './assets';
import { useRideState, CYCLE_HOME } from './useRideState';
import { MOUNT_RADIUS, bankAngle } from './cycleMath';

// M7 — the rideable ORIGINAL neon light-cycle ("NEON RUNNER" vehicle).
//
// A purely VISUAL object: the player's capsule (Player.jsx) keeps doing the
// physics/collisions, and while mounted it writes the cycle's live pose into the
// shared ride store each frame; this component just places the cycle mesh there
// (live under the rider while riding, at its parked bay otherwise). Mount /
// dismount is owned by Player.jsx (press E near the bay → ride; E again → off),
// so there is exactly one E handler and no double-fire with pickup.
//
// LEGAL: ORIGINAL low-poly cycle built from primitives; an optional
// models/cycle.glb slot can replace it via <SafeModel> (never a real Tron /
// light-cycle likeness — see ASSETS.md M7).

// Original low-poly neon cycle, modelled nose-toward +z (forward) with its
// lowest point at y≈0 so the parked pose (floor) and the live pose (rider feet)
// both sit flush on the ground. Accent hue is configurable.
function CycleMesh({ accent = '#36d6ff', rim = '#ff5cf4' }) {
  return (
    <group>
      {/* main chassis — a low slung wedge */}
      <mesh castShadow position={[0, 0.42, 0]}>
        <boxGeometry args={[0.34, 0.26, 1.7]} />
        <meshStandardMaterial color="#0b0820" emissive={accent} emissiveIntensity={0.5} roughness={0.35} metalness={0.5} />
      </mesh>
      {/* nose fairing tapering forward */}
      <mesh castShadow position={[0, 0.42, 1.0]} rotation={[Math.PI / 2, 0, 0]}>
        <coneGeometry args={[0.18, 0.7, 12]} />
        <meshStandardMaterial color="#0b0820" emissive={accent} emissiveIntensity={0.7} roughness={0.3} metalness={0.5} />
      </mesh>
      {/* seat / rider perch */}
      <mesh castShadow position={[0, 0.6, -0.35]}>
        <boxGeometry args={[0.26, 0.16, 0.6]} />
        <meshStandardMaterial color="#15102e" roughness={0.6} />
      </mesh>
      {/* glowing engine core */}
      <mesh position={[0, 0.5, 0.05]}>
        <sphereGeometry args={[0.13, 14, 14]} />
        <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={2.2} toneMapped={false} />
      </mesh>
      {/* rear light-trail fin */}
      <mesh position={[0, 0.62, -0.85]}>
        <boxGeometry args={[0.05, 0.4, 0.3]} />
        <meshStandardMaterial color={rim} emissive={rim} emissiveIntensity={2.0} toneMapped={false} />
      </mesh>
      {/* two wheels (rolling along z): cylinders laid on their side */}
      {[0.66, -0.66].map((z, i) => (
        <group key={i} position={[0, 0.34, z]} rotation={[0, 0, Math.PI / 2]}>
          <mesh castShadow>
            <cylinderGeometry args={[0.34, 0.34, 0.14, 20]} />
            <meshStandardMaterial color="#08060f" roughness={0.5} metalness={0.4} />
          </mesh>
          {/* glowing neon hub ring */}
          <mesh>
            <torusGeometry args={[0.24, 0.035, 8, 20]} />
            <meshStandardMaterial color={rim} emissive={rim} emissiveIntensity={1.6} toneMapped={false} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

// The bay pad: a static neon ring at the cycle's home so it stays discoverable
// even after you've parked the cycle elsewhere.
function CycleBay() {
  return (
    <group position={[CYCLE_HOME.x, 0.03, CYCLE_HOME.z]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.9, 1.25, 36]} />
        <meshStandardMaterial color="#36d6ff" emissive="#36d6ff" emissiveIntensity={0.8} transparent opacity={0.85} />
      </mesh>
      <Text position={[0, 0.01, 1.6]} rotation={[-Math.PI / 2, 0, 0]} fontSize={0.28} color="#36d6ff" anchorX="center">
        CYCLE BAY
      </Text>
    </group>
  );
}

export default function Cycle({ paused = false }) {
  const ride = useRideState();
  const { camera } = useThree();
  const groupRef = useRef(null);
  const lightRef = useRef(null);
  const [riding, setRiding] = useState(false);
  const [near, setNear] = useState(false);
  const nearRef = useRef(false);
  const prevYaw = useRef(CYCLE_HOME.yaw);

  const pausedRef = useRef(paused);
  pausedRef.current = paused;

  // Optional looping engine hum while riding (silent when the slot is empty).
  const hum = useMemo(() => createSilentAudio(ASSET_SLOTS.audio.cycleHum, { volume: 0.35, loop: true }), []);
  useEffect(() => () => hum.dispose(), [hum]);

  // Reflect mount/dismount into React (for the bay hint) and drive the hum.
  useEffect(() => {
    const unsub = ride.subscribe((r) => {
      setRiding(r);
      if (r) hum.play(); else hum.stop();
    });
    return unsub;
  }, [ride, hum]);

  useFrame((_, dtRaw) => {
    const g = groupRef.current;
    if (!g) return;
    const r = ride.getRiding();
    const pose = r ? ride.getLivePose() : ride.getParkedPose();
    g.position.set(pose.x, pose.y, pose.z);

    // visual lean into turns while riding (cosmetic; from yaw rate).
    const dt = dtRaw > 1e-4 ? dtRaw : 1e-4;
    let bank = 0;
    if (r) {
      const dyaw = pose.yaw - prevYaw.current;
      // shortest-arc wrap so a ±π flip doesn't spike the lean
      const wrapped = Math.atan2(Math.sin(dyaw), Math.cos(dyaw));
      bank = bankAngle(wrapped / dt);
    }
    prevYaw.current = pose.yaw;
    g.rotation.set(0, pose.yaw, bank);

    if (lightRef.current) lightRef.current.position.set(pose.x, pose.y + 0.6, pose.z);

    // bay proximity hint only when parked & not paused; lift to React on flip.
    if (!r && !pausedRef.current) {
      const pp = ride.getParkedPose();
      const dx = camera.position.x - pp.x;
      const dz = camera.position.z - pp.z;
      const isNear = dx * dx + dz * dz < MOUNT_RADIUS * MOUNT_RADIUS;
      if (isNear !== nearRef.current) { nearRef.current = isNear; setNear(isNear); }
    } else if (nearRef.current) {
      nearRef.current = false; setNear(false);
    }
  });

  return (
    <>
      <group ref={groupRef}>
        {/* Optional ORIGINAL glb; falls back to the primitive neon cycle. */}
        <SafeModel url={ASSET_SLOTS.models.cycle} fallback={<CycleMesh />} />
        {/* "press E to ride" floats above when parked & you're close */}
        {near && !riding ? (
          <Text position={[0, 1.5, 0]} fontSize={0.16} color="#bfe9ff" anchorX="center" anchorY="middle" outlineWidth={0.008} outlineColor="#000">
            press E to ride
          </Text>
        ) : null}
      </group>
      {/* underglow follows the cycle (parked or live) */}
      <pointLight ref={lightRef} color="#36d6ff" intensity={riding ? 1.2 : 0.5} distance={6} />
      <CycleBay />
    </>
  );
}
