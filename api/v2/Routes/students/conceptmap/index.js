// /api/v2/Routes/students/conceptmap/index.js

import { Router } from 'express';
import { getEntry, getMaxScores, getStudentScores } from '../../../../lib/redisHelper.mjs';
import { getTopicsFromUser, getMasteryMapping }    from '../masterymapping/index.js';
import normalizeName from '../../../../lib/normalizeName.mjs';

const router = Router();

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
  const rows = await getEntry('outline:v1', /*dbIndex=*/0);
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

router.get('/:email/conceptmap', async (req, res, next) => {
  try {
    const email      = req.params.email;
    const roots      = await fetchOutline();
    const maxScores  = await getMaxScores();

    let studentScores;
    try {
      studentScores = await getStudentScores(email);
    } catch (err) {
      studentScores = err.name === 'KeyNotFoundError' ? {} : (() => { throw err })();
    }


    const mapping   =  await getMasteryMapping(
      await getTopicsFromUser(studentScores),
      await getTopicsFromUser(maxScores)
    );


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
      nodes: annotated.length === 1 ? annotated[0] : { children: annotated },


    });
  } catch (err) {
    next(err);
  }
});

export default router;
