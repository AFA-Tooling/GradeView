import '../css/ConceptMapTree.css';
import React, { useRef, useMemo } from 'react';
import Tree from 'react-d3-tree';
import PropTypes from 'prop-types';

export default function ConceptMapTree({
  outlineData,
  currWeek = Infinity,
  hasCurrWeek = false,
}) {
  const treeContainer = useRef(null);

  // Convert your outlineData into the shape react-d3-tree wants
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

  // 1) compute tree depth
  const getDepth = node =>
    node.children && node.children.length
      ? 1 + Math.max(...node.children.map(getDepth))
      : 1;
  const depth = getDepth(treeData);

  // 2) read container size
  const containerEl = treeContainer.current;
  const containerW = containerEl?.clientWidth ?? 800;
  const containerH = containerEl?.clientHeight ?? 600;

  // 3) compute a zoom that fits the full tree
  const initialZoom = Math.min(
    containerW / (depth * 200 + 50),
    containerH / (depth * 80 + 50),
    1
  );

  const pathClassFunc = linkDatum => {
    if (!hasCurrWeek) return 'path';
    const week = linkDatum.target.data.attributes.week;
    return week < currWeek ? 'path taught' : 'path';
  };

  return (
    <div ref={treeContainer} className="concept-map-container">
      <Tree
        data={treeData}
        orientation="horizontal"
        translate={{ x: containerW / 2, y: containerH / 2 }}
        nodeSize={{ x: 200, y: 80 }}
        pathClassFunc={pathClassFunc}
        separation={{ siblings: 1, nonSiblings: 2 }}
        collapsible
        draggable={true}
        panOnDrag={true}
        zoomable={true}
        initialZoom={initialZoom}
        scaleExtent={{ min: 0.1, max: 1 }}
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
      <circle r="10" />
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
