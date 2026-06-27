import { useRef, useState, useEffect, useMemo } from 'react';
import { Text } from '@react-three/drei';
import { RigidBody, CuboidCollider } from '@react-three/rapier';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import Cabinet from './Cabinet';
import Throwable from './Throwable';
import SafeModel from './SafeModel';
import Cycle from './Cycle';
import Decor from './Decor';
import { ASSET_SLOTS } from './assets';
import { GRASS_ZONES } from './cycleMath';

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

// A single solid neon block: fixed collider sized to the visible box. Used to
// build the mezzanine + its stairs.
function Block({ position, size, color = '#1b1140', edge = '#36d6ff', edgeIntensity = 0.9 }) {
  const [w, h, d] = size;
  return (
    <group position={position}>
      <RigidBody type="fixed" colliders={false}>
        <CuboidCollider args={[w / 2, h / 2, d / 2]} />
      </RigidBody>
      <mesh castShadow receiveShadow>
        <boxGeometry args={[w, h, d]} />
        <meshStandardMaterial color={color} roughness={0.55} metalness={0.25} />
      </mesh>
      {/* emissive top trim so the climbable surface reads clearly */}
      <mesh position={[0, h / 2 + 0.011, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[w * 0.96, d * 0.96]} />
        <meshStandardMaterial color={edge} emissive={edge} emissiveIntensity={edgeIntensity} transparent opacity={0.35} />
      </mesh>
    </group>
  );
}

// Mezzanine + stairs (M6): a climbable platform ~3 m up so the player can take
// a "big drop" and feel fall damage. The 0.6 m steps are each jumpable (jump
// apex ≈ 1.07 m). A sign warns of the drop. All boxes own fixed colliders.
function FallLedge({ x = -10 }) {
  const steps = [
    { topY: 0.6, z: 4.5, w: 3.0, d: 1.6 },
    { topY: 1.2, z: 5.8, w: 3.0, d: 1.6 },
    { topY: 1.8, z: 7.1, w: 3.0, d: 1.6 },
    { topY: 2.4, z: 8.4, w: 3.0, d: 1.6 },
  ];
  const platTop = 3.0;
  return (
    <group>
      {steps.map((s, i) => (
        <Block
          key={i}
          position={[x, s.topY - 0.2, s.z]}
          size={[s.w, 0.4, s.d]}
          edge={i % 2 ? '#ff5cf4' : '#36d6ff'}
        />
      ))}
      {/* the mezzanine platform itself */}
      <Block position={[x, platTop - 0.2, 10.5]} size={[4, 0.4, 4]} edge="#ffd23b" edgeIntensity={1.1} />
      {/* low railing on the two outer edges only (the room-facing edges stay
          open so you CAN walk off into the drop on purpose) */}
      <Block position={[x - 1.9, platTop + 0.35, 10.5]} size={[0.2, 0.7, 4]} color="#241652" edge="#ff5cf4" />
      <Block position={[x, platTop + 0.35, 12.4]} size={[4, 0.7, 0.2]} color="#241652" edge="#ff5cf4" />
      <Text position={[x, platTop + 1.0, 10.5]} fontSize={0.26} color="#ffd23b" anchorX="center" anchorY="middle" outlineWidth={0.012} outlineColor="#000">
        MEZZANINE
      </Text>
      <Text position={[x, platTop + 0.7, 10.5]} fontSize={0.13} color="#ff8a3b" anchorX="center" anchorY="middle">
        mind the drop — falls hurt
      </Text>
    </group>
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

// M7 "tall grass": an ORIGINAL glowing neon-grass patch. Riding into one can
// trigger a NEON RUNNER grid-duel (the encounter watcher only accumulates while
// riding — on foot you pass through; it lives in index.jsx, and the zone
// geometry is the shared GRASS_ZONES in cycleMath.js). No
// collider — you pass right through it. Blades are laid out deterministically
// (golden-ratio spiral) so there's no per-frame work and no PRNG dependency.
function TallGrass({ x, z, r }) {
  const blades = useMemo(() => {
    const arr = [];
    const n = 20;
    for (let i = 0; i < n; i++) {
      const a = i * 2.399963; // golden angle — even, non-repeating spread
      const rr = r * Math.sqrt((i + 0.5) / n) * 0.92;
      arr.push({
        bx: Math.cos(a) * rr,
        bz: Math.sin(a) * rr,
        h: 0.55 + ((i * 0.37) % 1) * 0.55,
        tilt: (((i * 0.23) % 1) - 0.5) * 0.5,
      });
    }
    return arr;
  }, [r]);
  return (
    <group position={[x, 0, z]}>
      {/* glowing ground disc marking the patch */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
        <circleGeometry args={[r, 40]} />
        <meshStandardMaterial color="#0a2a16" emissive="#1f7a3a" emissiveIntensity={0.4} transparent opacity={0.5} />
      </mesh>
      {blades.map((b, i) => (
        <mesh key={i} position={[b.bx, b.h / 2, b.bz]} rotation={[b.tilt, 0, b.tilt]} castShadow>
          <boxGeometry args={[0.05, b.h, 0.05]} />
          <meshStandardMaterial color="#1c6b32" emissive="#37ff7a" emissiveIntensity={0.7} roughness={0.7} />
        </mesh>
      ))}
      <Text position={[0, 1.25, 0]} fontSize={0.16} color="#37ff7a" anchorX="center" anchorY="middle" outlineWidth={0.008} outlineColor="#000">
        TALL GRASS
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
      <FallLedge x={-10} />

      {/* M9: ORIGINAL parody office-flavor decor + wayfinding signage (reception,
          directory signpost, posters, break room, bulletin board, plants). Purely
          visual (no colliders); makes the world discoverable through exploration. */}
      <Decor />

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

      {/* M7: rideable neon cycle + its bay (press E near the bay to ride). */}
      <Cycle paused={paused} />

      {/* M7: tall-grass patches — ride in to trigger a NEON RUNNER duel. */}
      {GRASS_ZONES.map((zn, i) => (
        <TallGrass key={i} x={zn.x} z={zn.z} r={zn.r} />
      ))}

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
