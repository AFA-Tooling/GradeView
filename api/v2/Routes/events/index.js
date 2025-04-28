// // /api/v2/Routes/events/index.js
// import { Router } from 'express';
// import { getClient } from '../../../lib/redisHelper.mjs';

// const router = Router();

// router.get("/", async (req, res) => {
//   res.setHeader("Content-Type", "text/event-stream");
//   res.setHeader("Cache-Control", "no-cache");
//   res.setHeader("Connection", "keep-alive");

//   const subscriber = getClient(); // This is your custom Redis client
//   await subscriber.connect();

//   await subscriber.subscribe("outline_updated", (message) => {
//     res.write(`data: ${message}\n\n`);
//   });

//   // Cleanup if the browser closes
//   req.on("close", async () => {
//     await subscriber.unsubscribe();
//     await subscriber.quit();
//   });
// });

// export default router;
// /api/v2/Routes/events/index.js
import { Router } from 'express';

const router = Router();

// Define the route for /events
router.get("/", async (req, res) => {
    console.log('Received request for /api/v2/events');
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
  
    res.write('data: Super Success\n\n');
    res.end();
  });
  

export default router;
