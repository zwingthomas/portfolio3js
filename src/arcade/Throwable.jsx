import { useRef, useEffect, useMemo } from 'react';
import { RigidBody } from '@react-three/rapier';
import { useHeldObject } from './useHeldObject';

// A single dynamic, throwable prop. While free it is a normal rapier dynamic
// body. While held it switches to kinematicPosition and its translation is
// driven by the Player every frame (see Player.jsx -> holdHandle). On throw it
// switches back to dynamic and receives an impulse.
//
// `kind` selects an ORIGINAL low-poly "office-supplies"-style primitive — these
// are abstract shapes, NOT any real-world / The Office IP.

let UID = 0;

function MugMesh({ color }) {
  // body + handle, built from primitives
  return (
    <group>
      <mesh castShadow receiveShadow>
        <cylinderGeometry args={[0.16, 0.13, 0.3, 16]} />
        <meshStandardMaterial color={color} roughness={0.4} metalness={0.1} />
      </mesh>
      <mesh castShadow position={[0.19, 0, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.09, 0.03, 8, 16, Math.PI]} />
        <meshStandardMaterial color={color} roughness={0.4} />
      </mesh>
    </group>
  );
}

function StaplerMesh({ color }) {
  return (
    <group>
      <mesh castShadow receiveShadow>
        <boxGeometry args={[0.5, 0.12, 0.16]} />
        <meshStandardMaterial color={color} roughness={0.3} metalness={0.3} />
      </mesh>
      <mesh castShadow position={[-0.03, 0.11, 0]} rotation={[0, 0, -0.08]}>
        <boxGeometry args={[0.44, 0.1, 0.14]} />
        <meshStandardMaterial color={color} roughness={0.3} metalness={0.3} />
      </mesh>
    </group>
  );
}

function CubeMesh({ color }) {
  return (
    <mesh castShadow receiveShadow>
      <boxGeometry args={[0.4, 0.4, 0.4]} />
      <meshStandardMaterial color={color} roughness={0.5} />
    </mesh>
  );
}

function BallMesh({ color }) {
  return (
    <mesh castShadow receiveShadow>
      <sphereGeometry args={[0.25, 24, 24]} />
      <meshStandardMaterial color={color} roughness={0.25} metalness={0.2} />
    </mesh>
  );
}

const MESHES = {
  mug: MugMesh,
  stapler: StaplerMesh,
  cube: CubeMesh,
  ball: BallMesh,
};

const COLLIDERS = {
  mug: 'hull',
  stapler: 'cuboid',
  cube: 'cuboid',
  ball: 'ball',
};

export default function Throwable({ kind = 'cube', position = [0, 1, 0], color = '#ff5cf4' }) {
  const bodyRef = useRef(null);
  const { register } = useHeldObject();
  const id = useMemo(() => `throwable-${UID++}`, []);

  const Mesh = MESHES[kind] || CubeMesh;
  const colliders = COLLIDERS[kind] || 'cuboid';

  useEffect(() => {
    // Imperative handle consumed by the held-object system + the Player loop.
    const handle = {
      id,
      kind,
      getBody: () => bodyRef.current,
      getPosition: () => {
        const b = bodyRef.current;
        if (!b) return null;
        return b.translation(); // {x,y,z}
      },
      onPickUp: () => {
        const b = bodyRef.current;
        if (!b) return;
        // Freeze physics while carried; Player drives the kinematic position.
        b.setBodyType(2, true); // 2 = KinematicPositionBased
        b.setLinvel({ x: 0, y: 0, z: 0 }, true);
        b.setAngvel({ x: 0, y: 0, z: 0 }, true);
      },
      // Called every frame by Player while this object is held.
      setHeldTransform: (pos, rot) => {
        const b = bodyRef.current;
        if (!b) return;
        b.setNextKinematicTranslation(pos);
        if (rot) b.setNextKinematicRotation(rot);
      },
      onDrop: () => {
        const b = bodyRef.current;
        if (!b) return;
        b.setBodyType(0, true); // 0 = Dynamic
        b.setLinvel({ x: 0, y: 0, z: 0 }, true);
      },
      onThrow: (impulse) => {
        const b = bodyRef.current;
        if (!b) return;
        b.setBodyType(0, true); // back to Dynamic
        b.setLinvel({ x: 0, y: 0, z: 0 }, true);
        b.setAngvel({ x: 0, y: 0, z: 0 }, true);
        b.applyImpulse(impulse, true);
        // a little spin for flavour
        b.applyTorqueImpulse({ x: impulse.z * 0.02, y: 0, z: -impulse.x * 0.02 }, true);
      },
    };
    const unregister = register(id, handle);
    return unregister;
  }, [id, kind, register]);

  return (
    <RigidBody
      ref={bodyRef}
      position={position}
      colliders={colliders}
      restitution={0.35}
      friction={0.8}
      linearDamping={0.2}
      angularDamping={0.3}
      canSleep
    >
      <Mesh color={color} />
    </RigidBody>
  );
}
