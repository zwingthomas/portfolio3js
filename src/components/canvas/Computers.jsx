import { Suspense, useEffect, useState } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls, Preload, useGLTF } from '@react-three/drei';

import CanvasLoader from '../Loader';

/* helper: pause render when tab is hidden (saves iOS context) */
const PauseOnBlur = () => {
  const invalidate = useThree((state) => state.invalidate);
  useEffect(() => {
    const onVisibility = () => !document.hidden && invalidate();
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [invalidate]);
  return null;
};

const Computers = ({ isMobile }) => {
  const computer = useGLTF('./desktop_pc/scene.gltf');
  return (
    <mesh>
      <hemisphereLight intensity={isMobile ? 3 : 1.5} groundColor="black" />
      <pointLight intensity={isMobile ? 2 : 1} />
      {/* TODO: Spotlight not working */}
      <spotLight
        position={[-20, 50, 10]}
        angle={0.12}
        penumbra={1}
        intensity={1}
        castShadow
        shadow-mapSize={1024}
      />
      <primitive
        object={computer.scene}
        scale={isMobile ? 0.2 : 0.75}
        position={isMobile ? [0, 0, -0.35] : [0, -3.25, -1.5]}
        rotation={[-0.01, -0.2, -0.1]}
      />
    </mesh>
  );
};

const ComputersCanvas = () => {
  const [isMobile, setIsMobile] = useState(
    window.innerWidth / window.devicePixelRatio <= 600
  );

  useEffect(() => {
    // listen for changes to screen size
    const update = () =>
      setIsMobile(window.innerWidth / window.devicePixelRatio <= 600);

    // set initial value
    update();

    // callback function definition
    window.addEventListener('resize', update);

    // remove on unmount
    return () => window.removeEventListener('resize', update);
  }, []);

  return (
    <Canvas
      onCreated={({ gl }) => {
        gl.domElement.addEventListener('webglcontextlost', (event) => {
          event.preventDefault();
          console.warn('WebGL context lost');
          window.location.reload(); // simplest recovery
        });
      }}
      frameloop="demand"
      shadows
      camera={{ position: [20, 3, 5], fov: 25 }}
      gl={{
        preserveDrawingBuffer: true,
        powerPreference: 'high-performance',
        precision: 'mediump',
        antialias: false, // save memory
      }}
      dpr={isMobile ? 1 : [1, 1.5]} // lower DPR on phones to save memory
    >
      <PauseOnBlur />

      <Suspense fallback={<CanvasLoader />}>
        <OrbitControls
          enableZoom={false}
          maxPolarAngle={Math.PI / 2}
          minPolarAngle={Math.PI / 2}
        />
        <Computers isMobile={isMobile} />
      </Suspense>

      <Preload all />
    </Canvas>
  );
};

export default ComputersCanvas;