import { useRef, useState, useEffect, useMemo } from 'react';
import { Text } from '@react-three/drei';
import { RigidBody, CuboidCollider } from '@react-three/rapier';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import Cabinet from './Cabinet';
import Throwable from './Throwable';
import SafeModel from './SafeModel';
import { ASSET_SLOTS } from './assets';

const ROOM = { size: 28, wallH: 5, half: 14 };

// ----- original neon arcade hub: room, lights, cabinets, kiosk, props -----

function Room() {
  const t = ROOM.half;
  const h = ROOM.wallH;
  return (
    <>
      {/* floor: fixed collider + dark reflective-ish plane with grid lines */}
      <RigidBody type="fixed" colliders={false}>
        <CuboidCollider args={[t, 0.5, t]} position={[0, -0.5, 0]} />
      </RigidBody>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
        <planeGeometry args={[ROOM.size, ROOM.size]} />
        <meshStandardMaterial color="#0a0420" roughness={0.7} metalness={0.2} />
      </mesh>
      <gridHelper args={[ROOM.size, 28, '#ff2bd6', '#2a1d66']} position={[0, 0.02, 0]} />

      {/* ceiling (visual only) */}
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, h, 0]}>
        <planeGeometry args={[ROOM.size, ROOM.size]} />
        <meshStandardMaterial color="#070317" side={THREE.DoubleSide} />
      </mesh>

      {/* 4 perimeter walls: fixed colliders + emissive trim so you can't fall out */}
      {[
        { pos: [0, h / 2, -t], rot: [0, 0, 0] },
        { pos: [0, h / 2, t], rot: [0, Math.PI, 0] },
        { pos: [-t, h / 2, 0], rot: [0, Math.PI / 2, 0] },
        { pos: [t, h / 2, 0], rot: [0, -Math.PI / 2, 0] },
      ].map((w, i) => (
        <group key={i} position={w.pos} rotation={w.rot}>
          <RigidBody type="fixed" colliders={false}>
            <CuboidCollider args={[t, h / 2, 0.25]} />
          </RigidBody>
          <mesh receiveShadow>
            <boxGeometry args={[ROOM.size, h, 0.5]} />
            <meshStandardMaterial color="#120a2e" roughness={0.6} />
          </mesh>
          {/* neon trim strip near the top */}
          <mesh position={[0, h / 2 - 0.3, 0.26]}>
            <boxGeometry args={[ROOM.size - 0.5, 0.12, 0.05]} />
            <meshStandardMaterial color="#36d6ff" emissive="#36d6ff" emissiveIntensity={1.2} />
          </mesh>
        </group>
      ))}
    </>
  );
}

function SpawnPad() {
  return (
    <group position={[0, 0.03, 6]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.7, 1.0, 32]} />
        <meshStandardMaterial color="#36ff9e" emissive="#36ff9e" emissiveIntensity={0.9} />
      </mesh>
      <Text position={[0, 0.01, 1.3]} rotation={[-Math.PI / 2, 0, 0]} fontSize={0.3} color="#36ff9e" anchorX="center">
        SPAWN
      </Text>
    </group>
  );
}

// The Traxy kiosk: a glowing pillar + label. Pressing E nearby OR clicking it
// opens https://traxy.app in a new tab (noopener). We watch player proximity
// each frame via the camera position and listen for E.
function TraxyKiosk({ position = [6, 0, -2], paused = false }) {
  const groupRef = useRef(null);
  const { camera } = useThree();
  const near = useRef(false);
  const [hovered, setHovered] = useState(false);
  const tmp = useMemo(() => new THREE.Vector3(...position), [position]);
  // Don't react to world input (E / proximity open) while a full-screen game
  // overlay owns the screen. Read via ref so the listener isn't re-subscribed.
  const pausedRef = useRef(paused);
  pausedRef.current = paused;

  const open = () => {
    try {
      window.open('https://traxy.app', '_blank', 'noopener,noreferrer');
    } catch {
      /* popup blocked — ignore */
    }
  };

  useEffect(() => {
    const onKey = (e) => {
      if (e.code === 'KeyE' && near.current && !pausedRef.current) open();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useFrame(() => {
    near.current = camera.position.distanceTo(tmp) < 3.2;
  });

  return (
    <group ref={groupRef} position={position}>
      <RigidBody type="fixed" colliders="cuboid">
        <mesh
          castShadow
          receiveShadow
          position={[0, 1.0, 0]}
          onPointerOver={(e) => { e.stopPropagation(); setHovered(true); }}
          onPointerOut={() => setHovered(false)}
          onClick={(e) => { e.stopPropagation(); open(); }}
        >
          <boxGeometry args={[0.8, 2.0, 0.8]} />
          <meshStandardMaterial
            color="#0b2030"
            emissive="#00e0c6"
            emissiveIntensity={hovered ? 1.1 : 0.5}
            roughness={0.3}
            metalness={0.4}
          />
        </mesh>
      </RigidBody>
      <Text position={[0, 2.4, 0]} fontSize={0.26} color="#00e0c6" anchorX="center" anchorY="middle" outlineWidth={0.01} outlineColor="#000">
        TRAXY KIOSK
      </Text>
      <Text position={[0, 2.1, 0]} fontSize={0.1} color="#bfe9ff" anchorX="center" anchorY="middle">
        press E / click to open traxy.app
      </Text>
    </group>
  );
}

// Original game names (NOT Frogger/Tetris/DDR/Tron).
const CABINETS = [
  { name: 'PULSE', tagline: 'rhythm runner', glow: '#ff5cf4', position: [-7, 0, -9], rotation: [0, 0.5, 0] },
  { name: 'GRIDLOCK', tagline: 'cross the flow', glow: '#36d6ff', position: [0, 0, -10], rotation: [0, 0, 0] },
  { name: 'CASCADE', tagline: 'stack & clear', glow: '#ffd23b', position: [7, 0, -9], rotation: [0, -0.5, 0] },
];

// Scatter of original "office-supplies"-style throwables (6-10 props).
const THROWABLES = [
  { kind: 'mug', position: [-2, 1.2, 2], color: '#ff5cf4' },
  { kind: 'mug', position: [-1, 1.2, 3], color: '#36d6ff' },
  { kind: 'stapler', position: [1, 1.2, 2.5], color: '#ff3b6b' },
  { kind: 'stapler', position: [2, 1.2, 1.5], color: '#36ff9e' },
  { kind: 'cube', position: [0, 1.2, 1], color: '#ffd23b' },
  { kind: 'cube', position: [3, 1.2, 3], color: '#9b5cff' },
  { kind: 'ball', position: [-3, 1.2, 1.5], color: '#00e0c6' },
  { kind: 'ball', position: [-2.5, 1.2, 4], color: '#ff8a3b' },
];

export default function Hub({ onActivateCabinet, paused = false }) {
  return (
    <group>
      {/* lights: moody synthwave key + neon fills */}
      <ambientLight intensity={0.35} color="#5a3bff" />
      <hemisphereLight intensity={0.25} color="#ff2bd6" groundColor="#0a0420" />
      <directionalLight
        position={[6, 10, 6]}
        intensity={0.9}
        color="#ffffff"
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-camera-left={-18}
        shadow-camera-right={18}
        shadow-camera-top={18}
        shadow-camera-bottom={-18}
        shadow-camera-far={40}
      />
      <pointLight position={[0, 4, 0]} intensity={0.6} color="#36d6ff" distance={22} />
      <pointLight position={[-8, 3, -8]} intensity={0.5} color="#ff5cf4" distance={16} />
      <pointLight position={[8, 3, -8]} intensity={0.5} color="#ffd23b" distance={16} />

      {/* optional baked environment — falls back to nothing when absent.
          The primitive Room below always provides the colliders. */}
      <SafeModel url={ASSET_SLOTS.models.hub} fallback={null} />

      <Room />
      <SpawnPad />

      {CABINETS.map((c) => (
        <Cabinet
          key={c.name}
          name={c.name}
          tagline={c.tagline}
          glow={c.glow}
          position={c.position}
          rotation={c.rotation}
          onActivate={onActivateCabinet}
          paused={paused}
        />
      ))}

      <TraxyKiosk position={[7, 0, 2]} paused={paused} />

      {THROWABLES.map((p, i) => (
        <Throwable key={i} kind={p.kind} position={p.position} color={p.color} />
      ))}

      {/* welcome banner */}
      <Text position={[0, 4, -13.6]} fontSize={0.7} color="#ff5cf4" anchorX="center" anchorY="middle" outlineWidth={0.02} outlineColor="#000">
        NEON ARCADE
      </Text>
    </group>
  );
}
