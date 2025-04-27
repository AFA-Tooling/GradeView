// website/src/components/ConceptMapTree.js

import '../css/ConceptMapTree.css';
import React, { useRef, useEffect } from 'react';
import Tree from 'react-d3-tree';
import PropTypes from 'prop-types';

export default function ConceptMapTree({ outlineData, dimensions = { width: window.innerWidth, height: window.innerHeight }, currWeek = 0 }) {
  const containerRef = useRef(null);

  // center in container
  const translate = { x: dimensions.width / 2, y: dimensions.height / 2 };

  // style links by week
  const pathClassFunc = link => {
    const cls = ['path'];
    if (link.target.data.data.week < currWeek) cls.push('taught');
    return cls.join(' ');
  };

  // auto‐resize container height
  useEffect(() => {
    const c = containerRef.current;
    if (!c) return;
    const onResize = () => { c.style.height = `${window.innerHeight}px`; };
    window.addEventListener('resize', onResize);
    onResize();
    return () => window.removeEventListener('resize', onResize);
  }, []);

  return (
    <div ref={containerRef} style={{ width: '100%', height: '100%' }}>
      <Tree
        data={{
          name: outlineData.name,
          children: outlineData.children || []
        }}
        translate={translate}
        orientation="horizontal"
        nodeSize={{ x: 200, y: 80 }}
        pathClassFunc={pathClassFunc}
        separation={{ siblings: 1, nonSiblings: 2 }}
        collapsible
        draggable={false}
        zoomable={false}
      />
    </div>
  );
}

ConceptMapTree.propTypes = {
  outlineData: PropTypes.shape({
    name: PropTypes.string.isRequired,
    children: PropTypes.array,
  }).isRequired,
  dimensions: PropTypes.shape({
    width: PropTypes.number,
    height: PropTypes.number,
  }),
  currWeek: PropTypes.number,
};
