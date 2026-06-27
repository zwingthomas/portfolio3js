import { useMemo } from 'react';
import { Text } from '@react-three/drei';
import SafeModel from './SafeModel';
import { ASSET_SLOTS } from './assets';
import { LANDMARKS } from './questMath';

// ===========================================================================
// M9 — Office-flavor decor + wayfinding (the "adventure layer" set dressing).
//
// Turns the neon hub into a cohesive ORIGINAL parody "workplace-sitcom" office:
// a reception desk, a directory signpost that points the way to every
// attraction, motivational posters with ORIGINAL slogans, a break-room (water
// cooler + coffee station), filing cabinets, a bulletin board of original
// sticky-notes, and potted plants. Together with the <QuestHud> objective
// tracker (index.jsx) this makes the 3 games + threat + cycle DISCOVERABLE
// THROUGH EXPLORATION (M9 acceptance).
//
// PERFORMANCE: everything here is STATIC — no useFrame, no per-frame allocation,
// all layouts precomputed in useMemo. Decor is purely visual (NO physics
// colliders) so it can never trap the player; the room walls already bound the
// play space. Because nothing animates, reduced-motion is honored by
// construction (there is no motion to reduce).
//
// LEGAL: 100% ORIGINAL parody. No real "The Office" IP — no Dunder Mifflin, no
// real character names/likeness, no studio logos. Every slogan/label is original.
// An optional baked decor model can drop into ASSET_SLOTS.models.decor and is
// rendered on top via <SafeModel> with a null fallback (see ASSETS.md M9); the
// procedural set dressing below is the always-present default.
// ===========================================================================

const PALETTE = {
  cyan: '#36d6ff',
  magenta: '#ff5cf4',
  gold: '#ffd23b',
  green: '#36ff9e',
  teal: '#00e0c6',
  purple: '#9b5cff',
  orange: '#ff8a3b',
};

// 8-point compass abbreviation for a planar offset. Room convention: -z is
// "north" (the cabinet wall), +z is "south" (spawn/reception), +x east, -x west.
function compass(dx, dz) {
  const ns = dz < -0.6 ? 'N' : dz > 0.6 ? 'S' : '';
  const ew = dx > 0.6 ? 'E' : dx < -0.6 ? 'W' : '';
  return (ns + ew) || 'HERE';
}

// Representative XZ point for a landmark (zone landmarks use their centroid).
function landmarkPoint(lm) {
  if (lm.zones && lm.zones.length) {
    let sx = 0;
    let sz = 0;
    for (const z of lm.zones) { sx += z.x; sz += z.z; }
    return { x: sx / lm.zones.length, z: sz / lm.zones.length };
  }
  return { x: lm.x, z: lm.z };
}

// ----------------------------- reception desk ------------------------------
// An L-less front counter against the south wall, a back kick-panel, a nameplate
// and a service bell. Visual only.
function ReceptionDesk({ position = [-4.5, 0, 11.8] }) {
  return (
    <group position={position} rotation={[0, Math.PI, 0]}>
      {/* counter top + body */}
      <mesh castShadow receiveShadow position={[0, 0.55, 0]}>
        <boxGeometry args={[3.0, 1.1, 0.7]} />
        <meshStandardMaterial color="#171033" roughness={0.6} metalness={0.2} />
      </mesh>
      {/* glowing front fascia strip */}
      <mesh position={[0, 0.55, 0.36]}>
        <boxGeometry args={[2.9, 0.16, 0.04]} />
        <meshStandardMaterial color={PALETTE.teal} emissive={PALETTE.teal} emissiveIntensity={1.1} toneMapped={false} />
      </mesh>
      {/* raised back ledge */}
      <mesh castShadow position={[0, 1.18, -0.18]}>
        <boxGeometry args={[3.0, 0.16, 0.34]} />
        <meshStandardMaterial color="#100a26" roughness={0.7} />
      </mesh>
      {/* service bell: dome + button */}
      <mesh castShadow position={[1.05, 1.32, -0.05]}>
        <sphereGeometry args={[0.1, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial color={PALETTE.gold} emissive={PALETTE.gold} emissiveIntensity={0.5} metalness={0.6} roughness={0.3} />
      </mesh>
      <mesh position={[1.05, 1.38, -0.05]}>
        <cylinderGeometry args={[0.02, 0.02, 0.05, 8]} />
        <meshStandardMaterial color="#ff3b6b" emissive="#ff3b6b" emissiveIntensity={0.6} />
      </mesh>
      {/* guest log book */}
      <mesh position={[-0.7, 1.27, 0.0]} rotation={[-Math.PI / 2, 0, 0.2]}>
        <boxGeometry args={[0.5, 0.36, 0.05]} />
        <meshStandardMaterial color="#241652" roughness={0.8} />
      </mesh>
      {/* nameplate — faces into the room (group already rotated PI). Text default
          normal is +z, which after the rotation points toward room interior. */}
      <Text position={[0, 1.78, 0]} fontSize={0.3} color={PALETTE.teal} anchorX="center" anchorY="middle" outlineWidth={0.012} outlineColor="#000">
        RECEPTION
      </Text>
      <Text position={[0, 1.5, 0]} fontSize={0.12} color="#bfe9ff" anchorX="center" anchorY="middle">
        welcome, player one — sign the guest log (or don&apos;t)
      </Text>
    </group>
  );
}

// ------------------------------ directory post -----------------------------
// The wayfinding hub near spawn: a glowing post topped with "DIRECTORY", a stack
// of colored signboards naming each attraction + its compass bearing, and a ring
// of floor cones that physically point toward each landmark. This is what makes
// the world discoverable on first glance.
function Directory({ position = [2.6, 0, 5.2] }) {
  const [px, , pz] = position;
  const signs = useMemo(() => {
    const colors = [PALETTE.cyan, PALETTE.teal, PALETTE.magenta, PALETTE.green, PALETTE.gold, PALETTE.purple, PALETTE.orange];
    return LANDMARKS.map((lm, i) => {
      const p = landmarkPoint(lm);
      const dx = p.x - px;
      const dz = p.z - pz;
      const bearing = Math.atan2(dx, dz); // yaw so local +z points at the landmark
      return {
        id: lm.id,
        label: lm.label,
        dir: compass(dx, dz),
        color: colors[i % colors.length],
        bearing,
        y: 2.35 - i * 0.26,
      };
    });
  }, [px, pz]);

  return (
    <group position={position}>
      {/* central post */}
      <mesh castShadow position={[0, 1.3, 0]}>
        <cylinderGeometry args={[0.07, 0.09, 2.6, 10]} />
        <meshStandardMaterial color="#15102e" emissive={PALETTE.cyan} emissiveIntensity={0.25} metalness={0.5} roughness={0.4} />
      </mesh>
      {/* base disc */}
      <mesh receiveShadow position={[0, 0.04, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.5, 0.62, 28]} />
        <meshStandardMaterial color={PALETTE.cyan} emissive={PALETTE.cyan} emissiveIntensity={0.6} transparent opacity={0.7} />
      </mesh>

      {/* topper */}
      <Text position={[0, 2.75, 0]} fontSize={0.22} color={PALETTE.cyan} anchorX="center" anchorY="middle" outlineWidth={0.012} outlineColor="#000">
        DIRECTORY
      </Text>
      <Text position={[0, 2.55, 0]} fontSize={0.1} color="#8aa0c8" anchorX="center" anchorY="middle">
        you are here
      </Text>

      {signs.map((s) => (
        <group key={s.id}>
          {/* signboard plank + readable label (faces +z toward spawn approach) */}
          <mesh position={[0, s.y, 0.06]}>
            <boxGeometry args={[1.7, 0.2, 0.04]} />
            <meshStandardMaterial color="#0d0820" emissive={s.color} emissiveIntensity={0.35} roughness={0.5} />
          </mesh>
          <Text position={[0, s.y, 0.09]} fontSize={0.12} color={s.color} anchorX="center" anchorY="middle" outlineWidth={0.006} outlineColor="#000">
            {`${s.label}  ${s.dir}`}
          </Text>
          {/* floor cone that points toward the landmark (lies flat, tip = +z,
              yawed by the bearing). Unambiguous even when text faces away. */}
          <group rotation={[0, s.bearing, 0]}>
            <mesh position={[0, 0.06, 0.62]} rotation={[Math.PI / 2, 0, 0]}>
              <coneGeometry args={[0.11, 0.34, 4]} />
              <meshStandardMaterial color={s.color} emissive={s.color} emissiveIntensity={0.9} toneMapped={false} />
            </mesh>
          </group>
        </group>
      ))}
    </group>
  );
}

// ------------------------------ wall posters -------------------------------
// ORIGINAL parody "motivational" posters. A framed panel, an emblem of emissive
// bars, and a wrapped original slogan.
function Poster({ position, rotation = [0, 0, 0], slogan, accent }) {
  return (
    <group position={position} rotation={rotation}>
      {/* frame */}
      <mesh position={[0, 0, -0.02]}>
        <boxGeometry args={[1.7, 1.15, 0.05]} />
        <meshStandardMaterial color="#0a0620" roughness={0.6} />
      </mesh>
      {/* mat / face */}
      <mesh>
        <planeGeometry args={[1.55, 1.0]} />
        <meshStandardMaterial color="#120a2e" emissive={accent} emissiveIntensity={0.12} roughness={0.8} />
      </mesh>
      {/* emblem bars */}
      {[-0.35, 0, 0.35].map((x, i) => (
        <mesh key={i} position={[x, 0.26, 0.01]}>
          <boxGeometry args={[0.18, 0.34 - i * 0.06, 0.02]} />
          <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={1.0} toneMapped={false} />
        </mesh>
      ))}
      <Text
        position={[0, -0.18, 0.02]}
        fontSize={0.12}
        color="#eaf4ff"
        anchorX="center"
        anchorY="middle"
        maxWidth={1.35}
        textAlign="center"
        outlineWidth={0.005}
        outlineColor="#000"
      >
        {slogan}
      </Text>
    </group>
  );
}

// --------------------------- break-room props ------------------------------
function WaterCooler({ position = [11.6, 0, 9.6] }) {
  return (
    <group position={position}>
      {/* base cabinet */}
      <mesh castShadow position={[0, 0.55, 0]}>
        <boxGeometry args={[0.5, 1.1, 0.5]} />
        <meshStandardMaterial color="#e8f6ff" roughness={0.5} metalness={0.1} />
      </mesh>
      {/* tap nub */}
      <mesh position={[0, 0.78, 0.27]}>
        <boxGeometry args={[0.1, 0.1, 0.08]} />
        <meshStandardMaterial color="#2a7cff" emissive="#2a7cff" emissiveIntensity={0.4} />
      </mesh>
      {/* inverted water bottle */}
      <mesh position={[0, 1.42, 0]}>
        <cylinderGeometry args={[0.22, 0.3, 0.6, 16]} />
        <meshStandardMaterial color="#9fe8ff" transparent opacity={0.55} roughness={0.1} metalness={0.1} />
      </mesh>
    </group>
  );
}

function CoffeeStation({ position = [12.3, 0, 7.0] }) {
  return (
    <group position={position} rotation={[0, -Math.PI / 2, 0]}>
      {/* counter */}
      <mesh castShadow receiveShadow position={[0, 0.5, 0]}>
        <boxGeometry args={[1.6, 1.0, 0.6]} />
        <meshStandardMaterial color="#171033" roughness={0.7} />
      </mesh>
      {/* coffee machine */}
      <mesh castShadow position={[-0.4, 1.2, 0]}>
        <boxGeometry args={[0.4, 0.4, 0.35]} />
        <meshStandardMaterial color="#241652" emissive={PALETTE.orange} emissiveIntensity={0.25} roughness={0.5} />
      </mesh>
      <mesh position={[-0.4, 1.2, 0.18]}>
        <boxGeometry args={[0.12, 0.06, 0.02]} />
        <meshStandardMaterial color={PALETTE.orange} emissive={PALETTE.orange} emissiveIntensity={1.0} toneMapped={false} />
      </mesh>
      {/* two mugs */}
      {[[0.25, PALETTE.magenta], [0.5, PALETTE.green]].map(([x, c], i) => (
        <mesh key={i} position={[x, 1.06, 0.1]}>
          <cylinderGeometry args={[0.08, 0.07, 0.12, 12]} />
          <meshStandardMaterial color={c} emissive={c} emissiveIntensity={0.3} roughness={0.5} />
        </mesh>
      ))}
      <Text position={[0, 1.62, 0]} fontSize={0.13} color={PALETTE.orange} anchorX="center" anchorY="middle" outlineWidth={0.006} outlineColor="#000">
        BREAK ROOM
      </Text>
    </group>
  );
}

function OfficePlant({ position = [0, 0, 0], scale = 1 }) {
  return (
    <group position={position} scale={scale}>
      {/* pot */}
      <mesh castShadow position={[0, 0.22, 0]}>
        <cylinderGeometry args={[0.22, 0.16, 0.44, 12]} />
        <meshStandardMaterial color="#241652" roughness={0.8} />
      </mesh>
      {/* foliage — a couple of low-poly blobs */}
      <mesh castShadow position={[0, 0.62, 0]}>
        <icosahedronGeometry args={[0.32, 0]} />
        <meshStandardMaterial color="#1c6b32" emissive="#37ff7a" emissiveIntensity={0.25} roughness={0.8} flatShading />
      </mesh>
      <mesh castShadow position={[0.12, 0.84, 0.04]}>
        <icosahedronGeometry args={[0.2, 0]} />
        <meshStandardMaterial color="#1c6b32" emissive="#37ff7a" emissiveIntensity={0.25} roughness={0.8} flatShading />
      </mesh>
    </group>
  );
}

function FilingCabinets({ position = [-13.1, 0, 1], rotation = [0, Math.PI / 2, 0] }) {
  return (
    <group position={position} rotation={rotation}>
      {[0, 1].map((col) => (
        <group key={col} position={[col * 0.62 - 0.31, 0, 0]}>
          <mesh castShadow position={[0, 0.7, 0]}>
            <boxGeometry args={[0.56, 1.4, 0.5]} />
            <meshStandardMaterial color="#1a1338" roughness={0.6} metalness={0.3} />
          </mesh>
          {/* drawer handle lines */}
          {[0.35, 0.75, 1.15].map((y, i) => (
            <mesh key={i} position={[0, y, 0.26]}>
              <boxGeometry args={[0.3, 0.04, 0.02]} />
              <meshStandardMaterial color={PALETTE.cyan} emissive={PALETTE.cyan} emissiveIntensity={0.5} toneMapped={false} />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  );
}

// ------------------------------ bulletin board -----------------------------
// ORIGINAL parody sticky-notes. Mounted flat on the west wall.
const STICKIES = [
  { t: 'EMPLOYEE OF\nTHE MONTH:\nYOU', c: PALETTE.gold, x: -0.62, y: 0.34 },
  { t: 'STATUS REPORTS\nDUE: NEVER', c: PALETTE.green, x: 0.0, y: 0.42 },
  { t: 'MINOTAUR\nSIGHTINGS: 0\n(so far)', c: PALETTE.magenta, x: 0.62, y: 0.3 },
  { t: 'BREAK ROOM:\nBYO COFFEE', c: PALETTE.cyan, x: -0.4, y: -0.34 },
  { t: 'RIDE INTO\nTHE GRASS', c: PALETTE.orange, x: 0.4, y: -0.36 },
];

function BulletinBoard({ position = [-13.55, 2.3, -2.2], rotation = [0, Math.PI / 2, 0] }) {
  return (
    <group position={position} rotation={rotation}>
      {/* cork backing + frame */}
      <mesh position={[0, 0, -0.03]}>
        <boxGeometry args={[2.0, 1.5, 0.06]} />
        <meshStandardMaterial color="#2a1d10" roughness={0.9} />
      </mesh>
      <Text position={[0, 0.62, 0.02]} fontSize={0.13} color="#ffd9a0" anchorX="center" anchorY="middle">
        — STAFF BOARD —
      </Text>
      {STICKIES.map((s, i) => (
        <group key={i} position={[s.x, s.y, 0.02]}>
          <mesh>
            <planeGeometry args={[0.5, 0.5]} />
            <meshStandardMaterial color={s.c} emissive={s.c} emissiveIntensity={0.2} roughness={0.9} />
          </mesh>
          <Text position={[0, 0, 0.01]} fontSize={0.066} color="#0a0620" anchorX="center" anchorY="middle" textAlign="center" maxWidth={0.45} lineHeight={1.1}>
            {s.t}
          </Text>
        </group>
      ))}
    </group>
  );
}

// Wall posters: position + inward-facing yaw + ORIGINAL slogan + accent.
const POSTERS = [
  // north wall (z=-13.6, faces +z)
  { position: [-5.2, 3.0, -13.6], rotation: [0, 0, 0], slogan: 'STACK YOUR DEADLINES — THEN CLEAR THEM', accent: PALETTE.gold },
  { position: [5.2, 3.0, -13.6], rotation: [0, 0, 0], slogan: 'FEEL THE BEAT — HIT YOUR QUOTA', accent: PALETTE.magenta },
  // east wall (x=13.6, faces -x)
  { position: [13.6, 2.7, -3.0], rotation: [0, -Math.PI / 2, 0], slogan: 'THE EXTRA MILE HAS NO GRIDLOCK', accent: PALETTE.cyan },
  { position: [13.6, 2.7, 6.0], rotation: [0, -Math.PI / 2, 0], slogan: 'SYNERGY IS A SOLO SPORT HERE', accent: PALETTE.teal },
  // west wall (x=-13.6, faces +x)
  { position: [-13.6, 2.7, -7.0], rotation: [0, Math.PI / 2, 0], slogan: 'TOUCH GRASS. THEN OUTRUN IT.', accent: PALETTE.green },
  // south wall (z=13.6, faces -z)
  { position: [6.0, 2.7, 13.6], rotation: [0, Math.PI, 0], slogan: 'EVERY RESPAWN IS A GROWTH OPPORTUNITY', accent: PALETTE.orange },
  { position: [-10.0, 2.7, 13.6], rotation: [0, Math.PI, 0], slogan: 'ADEQUATE IS A SUPERPOWER', accent: PALETTE.purple },
];

const PLANTS = [
  { position: [-12.6, 0, -12.2], scale: 1.1 },
  { position: [12.6, 0, -12.2], scale: 1.0 },
  { position: [-12.4, 0, 12.4], scale: 0.95 },
  { position: [12.6, 0, 12.4], scale: 1.15 },
];

export default function Decor() {
  return (
    <group>
      {/* Optional ORIGINAL baked decor model layered on top of the procedural
          set dressing; null fallback keeps the build green with no asset. */}
      <SafeModel url={ASSET_SLOTS.models.decor} fallback={null} />

      <Directory />
      <ReceptionDesk />
      <WaterCooler />
      <CoffeeStation />
      <FilingCabinets />
      <BulletinBoard />

      {POSTERS.map((p, i) => (
        <Poster key={i} position={p.position} rotation={p.rotation} slogan={p.slogan} accent={p.accent} />
      ))}
      {PLANTS.map((p, i) => (
        <OfficePlant key={i} position={p.position} scale={p.scale} />
      ))}
    </group>
  );
}
