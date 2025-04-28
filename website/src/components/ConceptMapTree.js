// src/components/ConceptMapTree.jsx
import "../css/ConceptMapTree.css";
import React, { useRef, useEffect, useMemo } from "react";
import Tree from "react-d3-tree";
import PropTypes from "prop-types";

/**
 * Renders a D3‑powered tree of your concept‑map data.
 */
export default function ConceptMapTree({ outlineData, dimensions, currWeek = 1 }) {
  const treeContainer = useRef(null);

  /* ───────────────── guard: data ready? ────────── */
  if (!outlineData || !outlineData.nodes) return null; // parent shows its own loader

  /* ───────────────── positioning ───────────────── */
  const translate = {
    x: dimensions.width / 2,
    y: dimensions.height / 2,
  };

  const pathClassFunc = linkDatum => {
    const classes = ["path"];
    if (linkDatum.target.data.data.week < currWeek) classes.push("taught");
    return classes.join(" ");
  };

  /* ───────────────── resize on window change ───── */
  useEffect(() => {
    const el = treeContainer.current;
    if (!el) return;
    const onResize = () => (el.style.height = `${window.innerHeight}px`);
    window.addEventListener("resize", onResize);
    onResize();
    return () => window.removeEventListener("resize", onResize);
  }, []);

  /* ───────────────── student‑level colours ─────── */
  const levelsCount = Array.isArray(outlineData["student levels"])
    ? outlineData["student levels"].length
    : 5;

  /* ───────────────── safe data for react‑d3‑tree ─ */
  const treeData = useMemo(() => {
    const safeChildren = Array.isArray(outlineData.nodes.children)
      ? outlineData.nodes.children
      : [];
    return {
      name: outlineData.name || "root",
      children: safeChildren,
    };
  }, [outlineData]);

  return (
    <div ref={treeContainer} style={{ width: "100%", height: "100%" }}>
      <Tree
        data={treeData}
        orientation="horizontal"
        translate={translate}
        nodeSize={{ x: 200, y: 80 }}
        pathClassFunc={pathClassFunc}
        separation={{ siblings: 1, nonSiblings: 2 }}
        renderCustomNodeElement={props => (
          <ConceptMapNode
            {...props}
            levelsCount={levelsCount}
            levelNames={outlineData["student levels"] ?? []}
          />
        )}
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
    nodes: PropTypes.object.isRequired,
  }).isRequired,
  dimensions: PropTypes.shape({
    width: PropTypes.number.isRequired,
    height: PropTypes.number.isRequired,
  }).isRequired,
  currWeek: PropTypes.number,
};

function ConceptMapNode({ hierarchyPointNode, nodeDatum, toggleNode, levelsCount, levelNames }) {
  const sm = nodeDatum.data.student_mastery ?? 0;

  let masteryClass = "";
  if (Array.isArray(levelNames) && sm > 0 && sm <= levelNames.length) {
    masteryClass = levelNames[sm - 1].toLowerCase().replace(/\s+/g, "-");
  } else {
    switch (sm) {
      case 0:
        masteryClass = "first-steps";
        break;
      case 1:
        masteryClass = "needs-practice";
        break;
      case 2:
        masteryClass = "in-progress";
        break;
      case 3:
        masteryClass = "almost-there";
        break;
      default:
        masteryClass = "mastered";
        break;
    }
  }

  const hasChildren = hierarchyPointNode.data.children?.length > 0;
  const isCollapsed = hasChildren && hierarchyPointNode.children?.length === 0;

  return (
    <g
      className={`node ${masteryClass} ${isCollapsed ? "collapsed" : ""}`}
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
