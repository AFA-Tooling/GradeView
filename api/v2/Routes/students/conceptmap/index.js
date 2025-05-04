import { Router } from 'express';
import { getCategories, getMaxScores, getLastSync } from '../../../../lib/redisHelper.mjs';
import axios from 'axios';
import { isAdmin } from '../../../../lib/userlib.mjs';

const router = Router({ mergeParams: true });

/**
 * Convert a flat list of { id, name, week, parentId } into a tree structure.
 */
function buildTree(rows) {
  const byId = {};
  rows.forEach(r => {
    byId[r.id] = {
      id: r.id,
      name: r.name,
      data: { week: Number(r.week) },
      children: [],
    };
  });
  rows.forEach(r => {
    if (r.parentId != null && byId[r.parentId]) {
      byId[r.parentId].children.push(byId[r.id]);
    }
  });
  return rows
    .filter(r => r.parentId == null)
    .map(r => byId[r.id]);
}

/**
 * Fetch category-to-topic mapping from Redis and flatten it into an array of nodes.
 */
const fetchOutline = async () => {
  const raw = await getCategories();
  let counter = 1;

  const rows = Object.entries(raw).flatMap(([catName, topics]) => {
    const parentId = counter++;
    const parentNode = {
      id: parentId,
      name: catName || 'Uncategorized',
      week: 0,
      parentId: null,
    };
    const childNodes = Object.entries(topics).map(([topicName, wk]) => ({
      id: counter++,
      name: topicName,
      week: Number(wk),
      parentId,
    }));
    return [parentNode, ...childNodes];
  });

  return buildTree(rows);
};

/**
 * Recursively attach mastery scores from `mapping` to leaf nodes only.
 */
function annotateNodes(node, mapping) {
  const isLeaf = node.children.length === 0;
  const entry = isLeaf
    ? (mapping[node.name] || { student_mastery: 0, class_mastery: 0 })
    : {};
  if (isLeaf && !mapping[node.name]) {
    console.log('MISS (leaf):', node.name);
  }
  return {
    ...node,
    data: { ...node.data, ...entry },
    children: node.children.map(c => annotateNodes(c, mapping)),
  };
}

/**
 * Create the final concept map object with levels and annotated nodes.
 */
function cmNodes(roots, mapping) {
  const annotatedRoots = roots.map(r => annotateNodes(r, mapping));
  return {
    name: 'CS10',
    term: 'Fall 2024',
    'student levels': [
      'First Steps',
      'Needs Practice',
      'In Progress',
      'Almost There',
      'Mastered',
    ],
    nodes:
      annotatedRoots.length === 1
        ? annotatedRoots[0]
        : { children: annotatedRoots },
  };
}

/**
 * Recursively compute the average mastery of immediate children and assign to parent.
 */
function aggregateMastery(node) {
  if (!node.children || node.children.length === 0) {
    return node.data.student_mastery || 0;
  }
  const childVals = node.children.map(aggregateMastery);
  const avg = Math.round(childVals.reduce((a, b) => a + b, 0) / childVals.length);
  node.data.student_mastery = avg;
  return avg;
}

/**
 * GET /api/v2/students/:id/conceptmap
 * Responds with the annotated concept map for a student (or max points view for admins).
 */
router.get('/', async (req, res) => {
  const { id } = req.params;
  try {
    const roots = await fetchOutline();
    const maxScores = await getMaxScores(); // currently unused but preserved

    const mappingUrl = isAdmin(id)
      ? `/api/v2/students/MAX%20POINTS/masterymapping`
      : `/api/v2/students/${encodeURIComponent(id)}/masterymapping`;

    const authHeader = req.headers['authorization'];
    const { data: mapping } = await axios.get(
      `${req.protocol}://${req.get('host')}${mappingUrl}`,
      { headers: { Authorization: authHeader } }
    );

    // Construct the tree with annotation and current week
    const tree = {
      ...cmNodes(roots, mapping),
      lastSync: await getLastSync(),
      currentWeek: (() => {
        const termStart = new Date('2025-01-21');
        const msWeek = 7 * 24 * 60 * 60 * 1000;
        return Math.max(1, Math.ceil((Date.now() - termStart) / msWeek));
      })(),
    };

    // Aggregate mastery up to category level
    if (tree.nodes.children) {
      tree.nodes.children.forEach(aggregateMastery);
    } else {
      aggregateMastery(tree.nodes);
    }

    return res.status(200).json(tree);
  } catch (err) {
    switch (err.name) {
      case 'StudentNotEnrolledError':
      case 'KeyNotFoundError':
        console.error('Error fetching for %s', id, err);
        return res.status(404).json({ message: `Error fetching for student ${id}` });
      default:
        console.error('Internal error for %s', id, err);
        return res.status(500).json({ message: 'Internal server error.' });
    }
  }
});

export default router;
