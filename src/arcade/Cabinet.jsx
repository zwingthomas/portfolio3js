import { useState, useRef, useEffect, useMemo } from 'react';
import { Text } from '@react-three/drei';
import { RigidBody } from '@react-three/rapier';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';

// Reusable placeholder arcade cabinet built from primitives: a body box, an
// angled "screen" plane that glows, a marquee with the (ORIGINAL) game name,
// and a short tagline. Solid (fixed RigidBody) so the player collides with it.
//
// onActivate fires when the player is within `activateRadius` and presses E, or
// clicks the screen. E-proximity is the reliable desktop path (clicking meshes
// while pointer-locked is flaky); it mirrors the Traxy kiosk's proximity gate.

export default function Cabinet({
  position = [0, 0, 0],
  rotation = [0, 0, 0],
  name = 'GAME',
  tagline = '',
  color = '#1b1140',
  glow = '#ff5cf4',
  activateRadius = 3.4,
  paused = false,
  onActivate,
}) {
  const [hovered, setHovered] = useState(false);
  const [near, setNear] = useState(false);
  const { camera } = useThree();
  const nearRef = useRef(false);
  const worldPos = useMemo(() => new THREE.Vector3(...position), [position]);
  // Don't re-fire activation from world input while a game overlay already owns
  // the screen. Read via ref so the keydown listener isn't re-subscribed.
  const pausedRef = useRef(paused);
  pausedRef.current = paused;

  const activate = () => {
    if (onActivate) onActivate(name);
  };

  const handleActivate = (e) => {
    if (e && e.stopPropagation) e.stopPropagation();
    if (pausedRef.current) return;
    activate();
  };

  // Press E while standing near the cabinet to enter it.
  useEffect(() => {
    const onKey = (e) => {
      if (e.code === 'KeyE' && nearRef.current && !pausedRef.current) activate();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // `activate` reads the latest onActivate/name via closure each render is not
    // needed: name is stable per cabinet and onActivate is memoized in the hub.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Proximity check each frame; lift into React only when it flips (for the
  // hint label + screen glow) to avoid per-frame re-renders.
  useFrame(() => {
    const isNear = camera.position.distanceTo(worldPos) < activateRadius;
    if (isNear !== nearRef.current) {
      nearRef.current = isNear;
      setNear(isNear);
    }
  });

  const screenHot = hovered || near;

  return (
    <group position={position} rotation={rotation}>
      <RigidBody type="fixed" colliders="cuboid">
        {/* main body */}
        <mesh castShadow receiveShadow position={[0, 1.1, 0]}>
          <boxGeometry args={[1.1, 2.2, 0.9]} />
          <meshStandardMaterial color={color} roughness={0.5} metalness={0.2} />
        </mesh>
        {/* base plinth */}
        <mesh castShadow receiveShadow position={[0, 0.15, 0.05]}>
          <boxGeometry args={[1.2, 0.3, 1.0]} />
          <meshStandardMaterial color="#0d0820" roughness={0.6} />
        </mesh>
      </RigidBody>

      {/* angled glowing screen (no collider; purely visual + clickable) */}
      <mesh
        position={[0, 1.45, 0.46]}
        rotation={[-0.25, 0, 0]}
        onPointerOver={(e) => { e.stopPropagation(); setHovered(true); }}
        onPointerOut={() => setHovered(false)}
        onClick={handleActivate}
      >
        <planeGeometry args={[0.85, 0.62]} />
        <meshStandardMaterial
          color="#05010f"
          emissive={glow}
          emissiveIntensity={screenHot ? 1.4 : 0.7}
          roughness={0.2}
        />
      </mesh>

      {/* marquee name */}
      <Text
        position={[0, 2.35, 0.46]}
        fontSize={0.22}
        color={glow}
        anchorX="center"
        anchorY="middle"
        outlineWidth={0.01}
        outlineColor="#000000"
        maxWidth={1.4}
      >
        {name}
      </Text>

      {/* tagline */}
      {tagline ? (
        <Text
          position={[0, 1.02, 0.47]}
          fontSize={0.08}
          color="#bfe9ff"
          anchorX="center"
          anchorY="middle"
          maxWidth={1.0}
        >
          {tagline}
        </Text>
      ) : null}

      {/* proximity hint: "press E to play" floats above when the player is near */}
      {near ? (
        <Text
          position={[0, 2.68, 0.46]}
          fontSize={0.11}
          color="#bfe9ff"
          anchorX="center"
          anchorY="middle"
          outlineWidth={0.008}
          outlineColor="#000000"
        >
          press E to play
        </Text>
      ) : null}

      {/* simple joystick + buttons hint on the control deck */}
      <mesh position={[-0.2, 0.92, 0.5]} rotation={[Math.PI / 2.4, 0, 0]} castShadow>
        <cylinderGeometry args={[0.03, 0.03, 0.18, 8]} />
        <meshStandardMaterial color="#ff3b6b" />
      </mesh>
      <mesh position={[0.18, 0.86, 0.5]} castShadow>
        <sphereGeometry args={[0.05, 12, 12]} />
        <meshStandardMaterial color="#36d6ff" emissive="#36d6ff" emissiveIntensity={0.4} />
      </mesh>
    </group>
  );
}
