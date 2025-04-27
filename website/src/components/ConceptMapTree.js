// src/components/ConceptMapTree.jsx
import '../css/ConceptMapTree.css';
import React, { useRef, useEffect } from 'react';
import Tree from 'react-d3-tree';
import PropTypes from 'prop-types';

/**
 * Renders a D3‐powered tree of your concept map data.
 *
 * @param {Object} outlineData
 *   { name: string, nodes: { children: RawNodeDatum[] }, currentWeek?: number }
 * @param {Object} dimensions
 *   { width: number, height: number }
 * @param {number} currWeek
 */
export default function ConceptMapTree({ outlineData, dimensions, currWeek }) {
  const treeContainer = useRef();

  // center the tree in the container
  const translate = {
    x: dimensions.width / 2,
    y: dimensions.height / 2,
  };

  // classify links based on week
  const pathClassFunc = (linkDatum) => {
    const classes = ['path'];
    if (linkDatum.target.data.data.week < currWeek) classes.push('taught');
    return classes.join(' ');
  };

  // optional: auto-fit to container on window resize
  useEffect(() => {
    const container = treeContainer.current;
    if (!container) return;
    const handleResize = () => container.style.height = `${window.innerHeight}px`;
    window.addEventListener('resize', handleResize);
    handleResize();
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return (
    <div ref={treeContainer} style={{ width: '100%', height: '100%' }}>
      <Tree
        data={{
          name: outlineData.name,
          children: outlineData.nodes?.children ?? [],
        }}
        orientation="horizontal"
        translate={translate}
        nodeSize={{ x: 200, y: 80 }}
        pathClassFunc={pathClassFunc}
        separation={{ siblings: 1, nonSiblings: 2 }}
        renderCustomNodeElement={props =>
            <ConceptMapNode
              {...props}
             levelsCount={outlineData['student levels'].length}
            />
          }
        collapsible={true}
        draggable={false}
        zoomable={false}
      />
    </div>
  );
}

ConceptMapTree.propTypes = {
  outlineData: PropTypes.shape({
    name: PropTypes.string.isRequired,
    nodes: PropTypes.shape({
      children: PropTypes.array,
    }),
    currentWeek: PropTypes.number,
  }).isRequired,
  dimensions: PropTypes.shape({
    width: PropTypes.number.isRequired,
    height: PropTypes.number.isRequired,
  }).isRequired,
  currWeek: PropTypes.number.isRequired,
};

function ConceptMapNode({ hierarchyPointNode, nodeDatum, toggleNode, levelsCount }) {
    // student mastery is a 1..levelsCount integer, or 0 if none
    const sm = nodeDatum.data.student_mastery ?? 0;
  
    // Map to your five level names:
    let masteryClass;
    switch (sm) {
      case 0: masteryClass = 'first-steps';   break;
      case 1: masteryClass = 'needs-practice';break;
      case 2: masteryClass = 'in-progress';   break;
      case 3: masteryClass = 'almost-there';  break;
      default: masteryClass = 'mastered';     break;
    }
  
    const hasChildren = hierarchyPointNode.data.children?.length > 0;
    const isCollapsed = hasChildren && hierarchyPointNode.children?.length === 0;
  
    return (
      <g
        className={`node ${masteryClass} ${isCollapsed ? 'collapsed' : ''}`}
        onClick={toggleNode}
        data-label={nodeDatum.name}
      >
        <circle r="10" />
        <text x="20" y="-10" pointerEvents="none">
          {nodeDatum.name}
        </text>
      </g>
    );
  }
  