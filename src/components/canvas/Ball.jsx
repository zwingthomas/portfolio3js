import React, { Suspense, useRef, useState } from 'react';
import * as THREE from 'three';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Decal, Float, OrbitControls, Preload, useTexture } from '@react-three/drei';
import CanvasLoader from '../Loader';

// The Ball component receives the global mouse state (in NDC) as a prop.
const Ball = ({ imgUrl, mouse }) => {
  const meshRef = useRef();
  const { camera } = useThree();
  const url = imgUrl || '/logo.svg';
  const [decal] = useTexture([url]);

  // Refs for tracking whether this ball is being dragged.
  const isDragging = useRef(false);
  const dragStart = useRef({ x: 0, initialYRotation: 0 });

  // When not dragging, have the ball point toward the mouse.
  useFrame((state, delta) => {
    if (!isDragging.current) {
      // Construct a target vector using the global mouse position.
      // We choose a fixed z value (here 0.5) then unproject into world space.
      const target = new THREE.Vector3(mouse.x, mouse.y, mouse.z);
      target.unproject(camera);
      // Force the target to lie on the same horizontal level as the ball.
      target.y = meshRef.current.getWorldPosition(new THREE.Vector3()).y;
      const ballPos = meshRef.current.getWorldPosition(new THREE.Vector3());
      const direction = target.sub(ballPos);
      // Compute the desired Y rotation so that the ball's front (+Z) points toward the target.
      const targetYRotation = Math.atan2(direction.x, direction.z);
      // Smoothly damp (interpolate) toward the target rotation.
      meshRef.current.rotation.y += (targetYRotation - meshRef.current.rotation.y) * delta * 5;
    }
  });

  // Pointer down: begin dragging.
  const handlePointerDown = (e) => {
    e.stopPropagation();
    isDragging.current = true;
    dragStart.current = {
      x: e.clientX,
      y: e.clientY,
      z: e.clientZ,
      initialYRotation: meshRef.current.rotation.y,
    };
  };

  // Pointer up: end dragging.
  const handlePointerUp = (e) => {
    e.stopPropagation();
    isDragging.current = false;
  };

  return (
    // Float wraps the ball to provide a subtle floating animation as well as original shadows.
    <Float speed={1.75} rotationIntensity={1}>
      <ambientLight intensity={0.25} />
      <directionalLight position={[0, 0, 0.05]} />
      <mesh
        ref={meshRef}
        castShadow
        receiveShadow
        scale={2.75}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
      >
        <icosahedronGeometry args={[1, 1]} />
        <meshStandardMaterial
          color="#fff8eb"
          polygonOffset
          polygonOffsetFactor={-5}
          flatShading
        />
        <Decal
          position={[0, 0, 1]}
          map={decal}
          rotation={[2 * Math.PI, 0, 6.25]}
          flatShading
        />
      </mesh>
    </Float>
  );
};

const BallCanvas = ({ icon }) => {
  // Global mouse state stored in NDC.
  const [globalMouse, setGlobalMouse] = useState({ x: 0, y: 0 });

  // Update the global mouse based on pointer move events on the canvas.
  const handlePointerMove = (e) => {
    const canvas = e.target;
    const rect = canvas.getBoundingClientRect();
    // Convert pointer position to normalized device coordinates (-1 to 1).
    const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    setGlobalMouse({ x, y });
  };

  return (
    <Canvas
      onPointerMove={handlePointerMove}
      onCreated={({ gl }) => {
        gl.domElement.addEventListener('webglcontextlost', (event) => {
          event.preventDefault();
          console.warn('WebGL context lost');
        });
      }}
      frameLoop="demand"
      gl={{ preserveDrawingBuffer: true, powerPreference: 'high-performance' }}
    >
      <Suspense fallback={<CanvasLoader />}>
        <OrbitControls enableZoom={false} />
        {/* Pass the global mouse prop to every Ball.
            If you render multiple Ball components, they’ll all point toward the same mouse. */}
        <Ball imgUrl={icon} mouse={globalMouse} />
      </Suspense>
      <Preload all />
    </Canvas>
  );
};

export default BallCanvas;