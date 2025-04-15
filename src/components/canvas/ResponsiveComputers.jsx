import React, { useEffect, useState } from 'react';
import { ComputersCanvas } from '.';

const ResponsiveComputersCanvas = () => {
  const [shouldLoadCanvas, setShouldLoadCanvas] = useState(false);

  useEffect(() => {
    // Function to check if window height is over 200px
    const checkHeight = () => {
      setShouldLoadCanvas(window.innerHeight > 800 || (window.innerWidth > 850 && window.innerHeight > 500));
    };

    // Run the check when component mounts
    checkHeight();

    // Listen for window resize events
    window.addEventListener('resize', checkHeight);

    // Cleanup listener on unmount
    return () => {
      window.removeEventListener('resize', checkHeight);
    };
  }, []);

  // Render nothing if page height is under 200px
  if (!shouldLoadCanvas) {
    return null;
  }

  return <ComputersCanvas />;
};

export default ResponsiveComputersCanvas;