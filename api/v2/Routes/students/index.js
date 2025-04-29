// /api/v2/Routes/students/index.js

console.log("studentsRouter module loaded.");

import { Router } from 'express';
import RateLimit from 'express-rate-limit';
import GradesRouter from './grades/index.js';
import ProjectionsRouter from './projections/index.js';
import ProgressQueryStringRouter from './progressquerystring/index.js';
import MasteryMappingRouter from './masterymapping/index.js';
import conceptmapRouter from './conceptmap/index.js';
import { validateAdminOrStudentMiddleware, validateAdminMiddleware } from '../../../lib/authlib.mjs';
import { getStudents, getStudent } from '../../../lib/redisHelper.mjs';

const router = Router({ mergeParams: true });

// Rate limit calls to 100 per 5 minutes
router.use(
  RateLimit({
    windowMs: 5 * 60 * 1000, // 5 minutes
    max: 100,                // 100 requests
  }),
);

// GET /api/v2/students/:email
// Returns a single student's full record (including .Assignments)
router.get(
  '/:email',
  validateAdminOrStudentMiddleware,
  async (req, res, next) => {
    try {
      const student = await getStudent(req.params.email);
      res.status(200).json(student);
    } catch (err) {
      next(err);
    }
  }
);

// Protect all sub‐routes under /:email
router.use('/:email', validateAdminOrStudentMiddleware);

// Mount sub‐routers under /api/v2/students/:email/*
router.use('/:email/grades', GradesRouter);
router.use('/:email/projections', ProjectionsRouter);
router.use('/:email/progressquerystring', ProgressQueryStringRouter);
router.use('/:email/masterymapping', MasteryMappingRouter);

// (Optional) conceptmapRouter if you need /api/v2/students/conceptmap
router.use('/', conceptmapRouter);

// GET /api/v2/students
// Returns list of all students (admin only)
router.get(
  '/',
  validateAdminMiddleware,
  async (_, res) => {
    try {
      const students = await getStudents();
      res.status(200).json({ students });
    } catch (err) {
      switch (err.name) {
        case 'StudentNotEnrolledError':
        case 'KeyNotFoundError':
          console.error(`Error fetching all students.`, err);
          res.status(404).json({ message: "Error fetching students." });
          break;
        default:
          console.error(`Internal service error fetching all students.`, err);
          res.status(500).json({ message: "Internal server error." });
      }
    }
  }
);

export default router;
