import React, { useRef, useMemo, useState, useLayoutEffect } from 'react';
import Tree from 'react-d3-tree';
import PropTypes from 'prop-types';
import '../css/ConceptMapTree.css';

export default function ConceptMapTree({
  outlineData,
  currWeek = Infinity,
  hasCurrWeek = false,
}) {
  const containerRef = useRef(null);

  // 1) Build treeData
  const transformNode = node => ({
    name: node.name,
    attributes: {
      week: node.data.week,
      student_mastery: node.data.student_mastery,
      class_mastery: node.data.class_mastery,
    },
    children: (node.children || []).map(transformNode),
  });
  const treeData = useMemo(() => {
    const safeChildren = Array.isArray(outlineData.nodes.children)
      ? outlineData.nodes.children
      : [];
    return {
      name: outlineData.name || 'Concept Map',
      children: safeChildren.map(transformNode),
    };
  }, [outlineData]);

  // 2) Measure wrapper size (and recalc on window resize)
  const [size, setSize] = useState({ width: 0, height: 0 });
  useLayoutEffect(() => {
    const update = () => {
      if (!containerRef.current) return;
      const { clientWidth, clientHeight } = containerRef.current;
      setSize({ width: clientWidth, height: clientHeight });
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  // don’t render Tree until we know real dimensions
  // if (size.width === 0 || size.height === 0) {
  //   return <div ref={containerRef} className="concept-map-container" />;
  // }

  if (size.width === 0 || size.height === 0) {
    return <div ref={containerRef} className="concept-map-container" />;
  }

  // 3) Calculate how big the raw tree would be
  const nodeSize = { x: 200, y: 180 };
  const margin = 50;

  const getDepth = node =>
    node.children && node.children.length
      ? 1 + Math.max(...node.children.map(getDepth))
      : 1;
  const depth = getDepth(treeData);

  const countLeaves = node =>
    node.children && node.children.length
      ? node.children.reduce((sum, c) => sum + countLeaves(c), 0)
      : 1;
  const leafCount = Math.max(1, countLeaves(treeData) - 1);

  const treeWidth = depth * nodeSize.x;
  const treeHeight = leafCount * nodeSize.y;

  // 4) Compute zoom & centering translate
  const rawZoom = Math.min(
    (size.width - margin) / treeWidth,
    (size.height - margin) / treeHeight,
    1
  );
  const zoom = Math.min(rawZoom * 1.2, 1)
  const translate = {
    x: (size.width - treeWidth * zoom) / 2,  // true horizontal centering
    y: 300,                    // vertical center
  };

  // 5) Path coloring
  const pathClassFunc = linkDatum => {
    if (!hasCurrWeek) return 'path';
    const week = linkDatum.target.data.attributes.week;
    return week < currWeek ? 'path taught' : 'path';
  };

  return (
    <div ref={containerRef} className="concept-map-container">
      <Tree
        data={treeData}
        orientation="horizontal"
        translate={translate}
        nodeSize={nodeSize}
        separation={{ siblings: 0.5, nonSiblings: 1.5 }}
        pathClassFunc={pathClassFunc}
        collapsible
        draggable
        panOnDrag
        zoomable
        zoom={zoom}
        minZoom={0.1}
        maxZoom={2}
        renderCustomNodeElement={props => (
          <ConceptMapNode
            {...props}
            levelNames={outlineData['student levels'] ?? []}
          />
        )}
      />
    </div>
  );
}

ConceptMapTree.propTypes = {
  outlineData: PropTypes.shape({
    name: PropTypes.string.isRequired,
    nodes: PropTypes.object.isRequired,
    'student levels': PropTypes.array,
  }).isRequired,
  currWeek: PropTypes.number,
  hasCurrWeek: PropTypes.bool,
};

function ConceptMapNode({
  hierarchyPointNode,
  nodeDatum,
  toggleNode,
  levelNames,
}) {
  const { attributes = {} } = nodeDatum;
  const sm = attributes.student_mastery ?? 0;

  let masteryClass = 'first-steps';
  if (levelNames[sm - 1]) {
    masteryClass = levelNames[sm - 1].toLowerCase().replace(/\s+/g, '-');
  } else if (sm > levelNames.length) {
    masteryClass = 'mastered';
  }

  const hasChildren =
    Array.isArray(nodeDatum.children) && nodeDatum.children.length > 0;
  const isCollapsed =
    hasChildren &&
    Array.isArray(hierarchyPointNode.children) &&
    hierarchyPointNode.children.length === 0;

  return (
    <g
      className={`node ${masteryClass} ${isCollapsed ? 'collapsed' : ''}`}
      onClick={toggleNode}
      data-label={nodeDatum.name}
    >
      <circle r={15} />
      <text
        x={20}
        y={-10}
        pointerEvents="none"
        style={{
          fontFamily: 'sans-serif',
          fontSize: '12px',
          fill: '#333',
        }}
      >
        {nodeDatum.name}
      </text>
    </g>
  );
}
