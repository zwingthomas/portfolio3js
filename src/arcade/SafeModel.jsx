import React, { Suspense, useEffect, useState } from 'react';
import { useGLTF } from '@react-three/drei';
import { assetExists } from './assets';

// Wraps a GLTF load so a MISSING file never crashes the app. Three guards:
//  1. A HEAD check (assetExists) decides whether to even attempt the load.
//  2. A Suspense boundary covers the async load (renders `fallback` meanwhile).
//  3. An error boundary catches decode/parse errors and renders `fallback`.
//
// Net effect: with NO assets present the build is green and the scene renders
// `fallback` primitives. Drop a real .glb at the path and it appears.

class GLTFErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    // swallow — fallback is rendered instead.
  }
  render() {
    if (this.state.failed) return this.props.fallback || null;
    return this.props.children;
  }
}

function GLTFModel({ url, ...props }) {
  const { scene } = useGLTF(url);
  // clone so the same cached gltf can be placed multiple times safely.
  return <primitive object={scene.clone(true)} {...props} />;
}

export default function SafeModel({ url, fallback = null, ...props }) {
  const [exists, setExists] = useState(null); // null = checking

  useEffect(() => {
    let alive = true;
    assetExists(url).then((ok) => {
      if (alive) setExists(ok);
    });
    return () => { alive = false; };
  }, [url]);

  // While checking, or when the asset is absent, render the primitive fallback.
  if (!exists) return fallback;

  return (
    <GLTFErrorBoundary fallback={fallback}>
      <Suspense fallback={fallback}>
        <GLTFModel url={url} {...props} />
      </Suspense>
    </GLTFErrorBoundary>
  );
}
