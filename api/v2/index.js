import { Router } from 'express';

import BinsRouter from './Routes/bins/index.js';
import StudentsRouter from './Routes/students/index.js';
import IsAdminRouter from './Routes/isadmin/index.js';
import LoginRouter from "./Routes/login/index.js";
import AdminRouter from './Routes/admin/index.js';

const router = Router();

// Access control (enforced inside each router):
//   /login      public: verifies the caller's token, answers { status: true | false }
//   /bins       public: grade cutoffs and point totals only, no student data
//   /isadmin    any valid Berkeley token (401 otherwise): answers { isAdmin }
//   /admin/**   admins only: validateAdminMiddleware runs before every admin sub-router
//   /students   the list is admins only; /students/:email/** is admins or that student
//               (the legacy /students/grades?email=X is rewritten to /students/X/grades in
//               lib/app.mjs before it reaches this router, so it gets the same check)
router.use('/login', LoginRouter);
router.use('/bins', BinsRouter);
router.use('/isadmin', IsAdminRouter);
router.use('/admin', AdminRouter);
router.use('/students', StudentsRouter);

export default router;
