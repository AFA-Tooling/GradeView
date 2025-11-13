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

  // 1) Transform the raw outlineData into the format expected by react-d3-tree
  const transformNode = node => ({
    name: node.name,
    data: node.data || {},
    attributes: {
      week: node.data?.week ?? 0,
      student_mastery: node.data?.student_mastery ?? 0,
      class_mastery: node.data?.class_mastery ?? 0,
      taught: node.data?.taught ?? false,
    },
    children: (node.children || []).map(transformNode),
  });

  const treeData = useMemo(() => {
    const safeChildren = Array.isArray(outlineData.nodes.children)
      ? outlineData.nodes.children
      : [];
    
    // Use API's calculated root mastery (average of direct children, consistent with other parent nodes)
    // API calculates this in concept-structure endpoint using average for all parent nodes
    const rootMastery = outlineData.nodes?.data?.student_mastery ?? 0;
    
    return {
      name: outlineData.name || 'Concept Map',
      data: {
        student_mastery: rootMastery,
        isRoot: true,
      },
      attributes: {
        student_mastery: rootMastery,
      },
      children: safeChildren.map(transformNode),
    };
  }, [outlineData]);

  // 2) Track container size and update on window resize
  const [size, setSize] = useState({ width: 0, height: 0 });

  useLayoutEffect(() => {
    const update = () => {
      if (!containerRef.current) return;
      const { clientWidth, clientHeight } = containerRef.current;
      setSize({ width: clientWidth, height: clientHeight });
    };
    update(); // run once on mount
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update); // cleanup
  }, []);

  // If container size not yet measured, return empty container
  if (size.width === 0 || size.height === 0) {
    return <div ref={containerRef} className="concept-map-container" />;
  }

  // 3) Determine tree dimensions based on depth and leaf count
  const nodeSize = { x: 200, y: 180 };
  const margin = 50;

  const getDepth = node =>
    node.children && node.children.length
      ? 1 + Math.max(...node.children.map(getDepth))
      : 1;

  const countLeaves = node =>
    node.children && node.children.length
      ? node.children.reduce((sum, c) => sum + countLeaves(c), 0)
      : 1;

  const depth = getDepth(treeData);
  const leafCount = Math.max(1, countLeaves(treeData) - 1);

  const treeWidth = depth * nodeSize.x;
  const treeHeight = leafCount * nodeSize.y;

  // 4) Compute zoom and centering offsets for optimal fit
  const rawZoom = Math.min(
    (size.width - margin) / treeWidth,
    (size.height - margin) / treeHeight,
    1
  );

  const zoom = Math.min(rawZoom * 1.2, 1);
  const translate = {
    x: (size.width - treeWidth * zoom) / 2,
    y: 300,
  };

  // 5) Style the links based on whether concepts have been taught
  const pathClassFunc = linkDatum => {
    // Check if the target node has been taught (has grades)
    const taught = linkDatum.target?.data?.attributes?.taught ?? 
                   linkDatum.target?.data?.taught ?? 
                   false;
    
    console.log('Path Debug:', {
      nodeName: linkDatum.target?.data?.name,
      taught,
      result: taught ? 'taught' : 'not-taught'
    });
    
    return taught ? 'path taught' : 'path';
  };

  return (
    <div ref={containerRef} className="concept-map-container">
      <Tree
        key={JSON.stringify(treeData).slice(0, 100)}
        data={treeData}
        orientation="horizontal"
        translate={translate}
        nodeSize={nodeSize}
        separation={{ siblings: 0.5, nonSiblings: 0.5 }}
        pathClassFunc={pathClassFunc}
        collapsible
        draggable
        panOnDrag
        zoomable
        zoom={zoom}
        minZoom={0.1}
        maxZoom={2}
        transitionDuration={400}
        shouldCollapseNeighborNodes={false}
        initialDepth={Infinity}
        enableLegacyTransitions={true}
        renderCustomNodeElement={props => {
          console.log('=== ALL NODES DEBUG ===', {
            nodeName: props.nodeDatum.name,
            hasChildren: Array.isArray(props.nodeDatum.children) && props.nodeDatum.children.length > 0,
            studentMastery: props.nodeDatum.attributes?.student_mastery,
            data: props.nodeDatum.data
          });
          return (
            <ConceptMapNode
              {...props}
              levelNames={outlineData['student levels'] ?? []}
            />
          );
        }}
      />
    </div>
  );
}

// Prop type validation for the component
ConceptMapTree.propTypes = {
  outlineData: PropTypes.shape({
    name: PropTypes.string.isRequired,
    nodes: PropTypes.object.isRequired,
    'student levels': PropTypes.array,
  }).isRequired,
  currWeek: PropTypes.number,
  hasCurrWeek: PropTypes.bool,
};

// Custom node renderer for each concept in the tree
function ConceptMapNode({
  hierarchyPointNode,
  nodeDatum,
  toggleNode,
  levelNames,
}) {
  const { attributes = {}, data = {} } = nodeDatum;
  const sm = data.student_mastery ?? attributes.student_mastery ?? 0;

  // Assign CSS class based on mastery level
  let masteryClass = 'first-steps';
  
  // Use hardcoded mapping for now to ensure it works
  if (sm === 0) {
    masteryClass = 'first-steps';
  } else if (sm === 1) {
    masteryClass = 'needs-practice';
  } else if (sm === 2) {
    masteryClass = 'in-progress';
  } else if (sm === 3) {
    masteryClass = 'almost-there';
  } else if (sm >= 4) {
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
