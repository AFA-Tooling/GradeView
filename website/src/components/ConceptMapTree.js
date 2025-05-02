// src/components/ConceptMapTree.jsx
import '../css/ConceptMapTree.css';
import React, { useRef, useEffect, useMemo } from 'react';
import Tree from 'react-d3-tree';
import PropTypes from 'prop-types';

export default function ConceptMapTree({
  outlineData,
  dimensions,
  currWeek = Infinity,
  hasCurrWeek = false,
}) {
  const treeContainer = useRef(null);

  // build the correct shape for react-d3-tree
  const transformNode = node => ({
    name: node.name,
    // pull both week & mastery fields into attributes
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

  useEffect(() => {
    const el = treeContainer.current;
    if (!el) return;
    const onResize = () => (el.style.height = `${window.innerHeight}px`);
    window.addEventListener('resize', onResize);
    onResize();
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const pathClassFunc = linkDatum => {
    if (!hasCurrWeek) return 'path';
    const week = linkDatum.target.data.attributes.week;
    return week < currWeek ? 'path taught' : 'path';
  };

  const levelsCount = Array.isArray(outlineData['student levels'])
    ? outlineData['student levels'].length
    : 5;

  return (
    <div ref={treeContainer} style={{ width: '100%', height: '100%' }}>
      <Tree
        data={treeData}
        orientation="horizontal"
        translate={{ x: dimensions.width / 2, y: dimensions.height / 2 }}
        nodeSize={{ x: 200, y: 80 }}
        pathClassFunc={pathClassFunc}
        separation={{ siblings: 1, nonSiblings: 2 }}
        collapsible
        draggable={false}
        zoomable={false}
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
  dimensions: PropTypes.shape({
    width: PropTypes.number.isRequired,
    height: PropTypes.number.isRequired,
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
  // never blow up if attributes is missing:
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
      <circle r="10" />
      {/* <text x="20" y="-10" pointerEvents="none">
        {nodeDatum.name}
      </text> */}
      <text
        x="20"
        y="-10"
        pointerEvents="none"
        style={{
          fontFamily: 'sans-serif',
          fontSize: '12px',
          fontWeight: 'normal',
          fill: '#333',
          stroke: 'none',
        }}
      >
        {nodeDatum.name}
      </text>
    </g>
  );
}