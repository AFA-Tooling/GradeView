import { Router } from 'express';

import BinsRouter from './Routes/bins/index.js';
import StudentsRouter from './Routes/students/index.js';
import VerifyAccessRouter from './Routes/verifyaccess/index.js';
import IsAdminRouter from './Routes/isadmin/index.js';
import LoginRouter from "./Routes/login/index.js";
import AdminRouter from './Routes/admin/index.js';

const router = Router();

router.use('/login', LoginRouter);
router.use('/bins', BinsRouter);
router.use('/verifyaccess', VerifyAccessRouter);
router.use('/isadmin', IsAdminRouter);
router.use('/admin', AdminRouter);
router.use('/students', StudentsRouter);

export default router;
