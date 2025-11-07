import cors from 'cors';
import dotenv from 'dotenv';
import logger from './lib/logger.mjs';
import esMain from 'es-main';
import express, { json, urlencoded } from 'express';
import ApiV2Router from './Router.js';

dotenv.config();
const PORT = process.env.PORT || 8000;

async function main() {
  const app = express();

  // Critical when running behind Nginx/TLS
  app.set('trust proxy', 1);

  app.use(logger);

  // Allow your prod + local origins. Add others as needed.
  app.use(cors({
    origin: ['https://gradeview.eecs.berkeley.edu', 'http://localhost'],
    credentials: true,
  }));

  app.use(json());
  app.use(urlencoded({ extended: false }));

  // --- Health check (nice for sanity & uptime monitors)
  app.get(['/api/health', '/health'], (_, res) => res.json({ ok: true }));

  // --- Handle the query parameter format directly
  app.get('/api/v2/students/grades', (req, res, next) => {
    const email = req.query.email;
    if (!email) {
      return res.status(400).json({ message: 'Email parameter required' });
    }
    // Rewrite the URL to the path parameter format
    req.url = `/api/v2/students/${encodeURIComponent(email)}/grades`;
    next();
  });

  // Mount your real API
  app.use('/api', ApiV2Router);

  // (Optional) log unknown API routes
  app.use('/api', (req, res) => res.status(404).json({ message: 'Not found' }));

  app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}.`);
    console.log('Press Ctrl+C to quit.');
  });
}

if (esMain(import.meta)) main();
