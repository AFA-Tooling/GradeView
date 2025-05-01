// /api/v2/Routes/students/conceptmap/index.js

import { Router } from 'express';
import { getCategories, getMaxScores, getStudentScores } from '../../../../lib/redisHelper.mjs';
import { getTopicsFromUser, getMasteryMapping }    from '../masterymapping/index.js';
import normalizeName from '../../../../lib/normalizeName.mjs';

const router = Router({ mergeParams: true });

function buildTree(rows) {
  const byId = {};
  rows.forEach(r => {
    byId[r.id] = {
      id:   Number(r.id),
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

async function fetchOutline() {
  const rows = await getCategories();
  return buildTree(rows);
}

function annotateNodes(node, mapping) {
  const norm = normalizeName(node.name);
    const entry = mapping[norm] || { student_mastery: 0, class_mastery: 0 };
    console.log('NODE:', node.name, '→', norm);
    if (!mapping[norm]) console.log('MISS:', norm);

    
    return {
      ...node,
      data: { ...node.data, ...entry },
      children: node.children.map(c => annotateNodes(c, mapping)),
    };
}

function cmNodes(mapping) {
  const annotated = roots.map(r => annotateNodes(r, mapping));
      res.json({
        name: 'CS10',
        term: 'Fall 2024',
        "student levels": [
          "First Steps",
          "Needs Practice",
          "In Progress",
          "Almost There",
          "Mastered",
        ],      
        nodes: annotated.length === 1 ? annotated[0] : { children: annotated }
    })
}

router.get('/', async (req, res) => {
  const { id } = req.params;
  try {
    const roots      = await fetchOutline();
    const maxScores  = await getMaxScores();
    studentScores = await getStudentScores(id);

    if (isAdmin(id)) {
      studentScores = maxScores;
      studentRoots = roots;
      mapping   =  getMasteryMapping(
        getTopicsFromUser(studentScores),
        getTopicsFromUser(maxScores)
      );
  
    } else {
      // Attempt to get student scores
      studentScores = await getStudentScores(id);
      studentRoots = await fetchOutline();
      mapping   =  await getMasteryMapping(
        await getTopicsFromUser(studentScores),
        await getTopicsFromUser(maxScores)
      );
    }
   return res.status(200).json(
      cmNodes(mapping)
   );
  } catch (err) {
    switch (err.name) {
      case 'StudentNotEnrolledError':
      case 'KeyNotFoundError':
          console.error("Error fetching scores for student with id %s", id, err);
          return res.status(404).json({ message: `Error fetching scores for student with id ${id}` });
      default:
          console.error("Internal service error for student with id %s", id, err);
          return res.status(500).json({ message: "Internal server error." });
  }
}
});


export default router;
