// import cors from 'cors';
// import dotenv from 'dotenv';
// import logger from './lib/logger.mjs';
// import esMain from 'es-main';
// import express, { json } from 'express';
// import ApiV2Router from './Router.js';

// dotenv.config(); // Load environment variables from .env file
// const PORT = process.env.PORT || 8000;

// async function main() {
//     const app = express();
//     app.use(logger);
//     app.use(cors());
//     app.use(json());

//     app.use('/api', ApiV2Router);
//     // Initialize middleware

//     app.listen(PORT, () => {
//         console.log(`Server is running on port ${PORT}.`);
//         console.log('Press Ctrl+C to quit.');
//     });
// }

// // Run the main function if this is a main module
// if (esMain(import.meta)) {
//     main();
// }


import cors from 'cors';
import dotenv from 'dotenv';
import logger from './lib/logger.mjs';
import esMain from 'es-main';
import express, { json } from 'express';
import ApiV2Router from './Router.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from 'redis';

dotenv.config();
const PORT = process.env.PORT || 8000;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const redisClient = createClient({ url: process.env.REDIS_URL || `redis://${process.env.SERVER_HOST}:${process.env.SERVER_PORT}` });
redisClient.connect().catch(console.error);

async function metaEndpoint(req, res) {
  try {
    const metaData = await redisClient.get('metaData');
    if (!metaData) {
      return res.status(404).send('Meta data not found');
    }
    res.send(metaData);
  } catch (error) {
    console.error("Error fetching meta data from Redis:", error);
    res.status(500).send("Error fetching meta data");
  }
}

async function main() {
  const app = express();
  app.use(logger);
  app.use(cors());
  app.use(json());

  app.use('/api', ApiV2Router);
  app.get('/api/meta', metaEndpoint);

  app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}.`);
    console.log('Press Ctrl+C to quit.');
  });
}

if (esMain(import.meta)) {
  main();
}
