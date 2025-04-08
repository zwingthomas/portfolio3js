import { Suspense, useEffect, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Preload, useGLTF } from '@react-three/drei';

import CanvasLoader from '../Loader';

const Computers = ( {isMobile} ) => {
  const computer = useGLTF('./desktop_pc/scene.gltf');
  return (
    <mesh>
      <hemisphereLight intensity={isMobile ? 3 : 1.5} groundColor="black"/>
      <pointLight intensity={isMobile ? 2 : 1}/>
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
  )
}

const ComputersCanvas = () => {
  const [isMobile, setIsMobile] = useState(false);


  useEffect(() => {
    
    // listen for changes to screen size
    const mediaQuery = window.matchMedia('(max-width: 500px)');
    
    // set initial value
    setIsMobile(mediaQuery.matches);

    // callback function definition
    const handleMediaQueryChange = (event) => {
      setIsMobile(event.matches)
    }
    // add callback as listener for changes
    mediaQuery.addEventListener('change', handleMediaQueryChange)

    // remove on unmount
    return () => {
      mediaQuery.removeEventListener('change', handleMediaQueryChange);
    }
  }, [])

  return (
    <Canvas
      onCreated={({ gl }) => {
        gl.domElement.addEventListener('webglcontextlost', (event) => {
          event.preventDefault();
          console.warn("WebGL context lost");
        });
      }}
      frameLoop="demand"
      shadows
      camera={{position: [20, 3, 5], fov: 25}}
      gl={{ preserveDrawingBuffer: true, powerPreference: 'high-performance' }}
    >
      <Suspense fallback={<CanvasLoader />}>
        <OrbitControls 
          enableZoom={false}
          maxPolarAngle={Math.PI / 2}
          minPolarAngle={Math.PI / 2}
          />
        <Computers isMobile={isMobile}/>
      </ Suspense>

      <Preload all />
    </Canvas>
  )
}

export default ComputersCanvas;