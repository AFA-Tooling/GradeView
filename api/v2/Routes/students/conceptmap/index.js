import { Router } from 'express';
import { getMaxScores, getStudentScores } from '../../../../lib/redisHelper.mjs';
import ProgressReportData from '../../../../assets/progressReport/CS10.json' assert { type: 'json' };
import { getTopicsFromUser, getMasteryMapping } from '../masterymapping/index.js';

const router = Router();

function annotateNodes(node, mapping) {
  const entry = mapping[node.name] || { student_mastery: 0, class_mastery: 0 };
  return {
    ...node,
    data: { ...node.data, ...entry },
    children: (node.children || []).map(child => annotateNodes(child, mapping)),
  };
}

/**
 * Matches GET /api/v2/students/:email/conceptmap
 */
router.get('/:email/conceptmap', async (req, res, next) => {
  const email = req.params.email;
  console.log('📣  [conceptmap] hit for student:', email);

  try {
    const maxScores     = await getMaxScores();
    console.log('📣  [conceptmap] maxScores fetched');
    const studentScores = await getStudentScores(email);
    console.log('📣  [conceptmap] studentScores fetched');

    const mapping       = getMasteryMapping(
      getTopicsFromUser(studentScores),
      getTopicsFromUser(maxScores)
    );
    console.log('📣  [conceptmap] mapping computed');

    const rootClone     = JSON.parse(JSON.stringify(ProgressReportData.nodes));
    const annotatedRoot = annotateNodes(rootClone, mapping);

    return res.json({ ...ProgressReportData, nodes: annotatedRoot });
  } catch (err) {
    console.error('❌ [conceptmap] error:', err);
    next(err);
  }
});

export default router;
