// /api/Router.js
import { Router } from 'express';

// Import the routers for different endpoints
console.log("Trying to import studentsRouter...");
import studentsRouter from './v2/Routes/students/index.js';
console.log("studentsRouter imported successfully!");
import isAdminRouter from './v2/Routes/isadmin/index.js';
import eventsRouter from './v2/Routes/events/index.js';
import loginRouter      from './v2/Routes/login/index.js';
const router = Router();

// Setup route handlers
router.use('/students', studentsRouter);  // Handle requests to /api/v2/students
router.use('/isadmin', isAdminRouter);    // Handle requests to /api/v2/isadmin
router.use('/events', eventsRouter);      // Handle requests to /api/v2/events
router.use('/login',     loginRouter);   // Handle requests to /api/v2/login
// Error handling middleware (optional)
router.use((err, _, res, next) => {
  res.status(err.status ?? 500).send(err.message); // Respond with error message if something goes wrong
  next(err);  // Pass error to the next middleware (if any)
});

export default router;
