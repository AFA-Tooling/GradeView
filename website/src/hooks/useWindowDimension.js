import { useState, useEffect } from 'react';

export default function useWindowDimensions() {
  const [dimensions, setDimensions] = useState({
    width: window.innerWidth,
    height: window.innerHeight,
  });

  useEffect(() => {
    function handleResize() {
      setDimensions({
        width: window.innerWidth,
        height: window.innerHeight,
      });
    }

    window.addEventListener('resize', handleResize);
    // In case the component mounts after a resize
    handleResize();

    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return dimensions;
}
