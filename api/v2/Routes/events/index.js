// // /api/v2/Routes/events/index.js
// import { Router } from 'express';

// const router = Router();

// // Define the route for /events
// router.get("/", async (req, res) => {
//     console.log('Received request for /api/v2/events');
//     res.setHeader("Content-Type", "text/event-stream");
//     res.setHeader("Cache-Control", "no-cache");
//     res.setHeader("Connection", "keep-alive");
  
//     res.write('data: Super Success\n\n');
//     res.end();
//   });
  

// export default router;

// /api/v2/Routes/events/index.js
// /api/v2/Routes/events/index.js
import { Router } from 'express';
import { getClient } from '../../../lib/redisHelper.mjs';

const router = Router();

router.get('/', async (req, res) => {
  // 1) SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control',  'no-cache');
  res.setHeader('Connection',     'keep-alive');
  // optional heartbeat / comment
  res.write(': connected to outline updates\n\n');

  // 2) Create & connect a Redis subscriber
  const subscriber = getClient(/* default DB index 0 */);
  await subscriber.connect();

  // 3) Subscribe to "outline_updated"
  await subscriber.subscribe('outline_updated', (message) => {
    // message is your JSON string; send it directly
    res.write(`data: ${message}\n\n`);
  });

  // 4) Clean up on client disconnect
  req.on('close', async () => {
    try {
      await subscriber.unsubscribe('outline_updated');
      await subscriber.quit();
    } catch (err) {
      console.error('Error closing Redis subscriber', err);
    }
    res.end();
  });
});

export default router;
