// src/components/ConceptMapTree.jsx
import React, {
  useRef,
  useMemo,
  useState,
  useLayoutEffect,
} from 'react';
import Tree from 'react-d3-tree';
import PropTypes from 'prop-types';
import '../css/ConceptMapTree.css';

export default function ConceptMapTree({
  outlineData,
  currWeek = Infinity,
  hasCurrWeek = false,
}) {
  /* ---------- 1. build treeData  ---------- */
  const transformNode = (node) => ({
    name: node.name,
    attributes: {
      week:            node.data.week,
      student_mastery: node.data.student_mastery,
      class_mastery:   node.data.class_mastery,
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

  /* ---------- 2. measure container ---------- */
  const containerRef = useRef(null);
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

  if (size.width === 0 || size.height === 0) {
    return <div ref={containerRef} className="concept-map-container" />;
  }

  /* ---------- 3. geometry helpers ---------- */
  const nodeSize   = { x: 200, y: 180 };
  const margin     = 40;   // breathing room on each edge
  const legendH    = 140;  // px consumed by the two legend rows

  const getDepth = (n) =>
    n.children?.length ? 1 + Math.max(...n.children.map(getDepth)) : 1;

  const countLeaves = (n) =>
    n.children?.length ? n.children.reduce((s, c) => s + countLeaves(c), 0) : 1;

  const depth     = getDepth(treeData);
  const leafCount = Math.max(1, countLeaves(treeData) - 1);

  const rawTreeW  = depth * nodeSize.x;
  const rawTreeH  = leafCount * nodeSize.y;

  /* ---------- 4. smart zoom + centring ---------- */
  const zoom = Math.min(
    (size.width  - margin)          / rawTreeW,
    (size.height - legendH - margin) / rawTreeH,
    1
  );

  let translate = {
    x: (size.width  - rawTreeW * zoom) / 2,
    y: legendH + (size.height - legendH - rawTreeH * zoom) / 2,
  };

  // keep at least 10 px under the legend
  if (translate.y < legendH + 10) translate.y = legendH + 10;

  /* ---------- 5. coloured links ---------- */
  const pathClassFunc = (link) => {
    if (!hasCurrWeek) return 'path';
    return link.target.data.attributes.week < currWeek ? 'path taught' : 'path';
  };

  /* ---------- 6. render ---------- */
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
        renderCustomNodeElement={(props) => (
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

/* ---------- 7. node renderer ---------- */
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
      <circle r={20} />
      <text
        x={26}
        dy=".35em"
        textAnchor="start"
      >
        {nodeDatum.name}
      </text>
    </g>
  );
}
