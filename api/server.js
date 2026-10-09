import dotenv from 'dotenv';
import esMain from 'es-main';
import { createApp } from './lib/app.mjs';

dotenv.config();
const PORT = process.env.PORT || 8000;

function main() {
  const app = createApp();

  app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}.`);
    console.log('Press Ctrl+C to quit.');
  });
}

if (esMain(import.meta)) main();
