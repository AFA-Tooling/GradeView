import dotenv from 'dotenv';
import esMain from 'es-main';
import { createApp } from './lib/app.mjs';

dotenv.config();
const PORT = process.env.PORT || 8000;
// Optional interface to listen on (make mock-up sets 127.0.0.1); all interfaces when unset,
// as Docker needs.
const LISTEN_HOST = process.env.LISTEN_HOST || undefined;

function main() {
  const app = createApp();

  app.listen(PORT, LISTEN_HOST, () => {
    console.log(`Server is running on ${LISTEN_HOST ? `${LISTEN_HOST}:` : 'port '}${PORT}.`);
    console.log('Press Ctrl+C to quit.');
  });
}

if (esMain(import.meta)) main();
