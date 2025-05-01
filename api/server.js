import cors from 'cors';
import dotenv from 'dotenv';
import logger from './lib/logger.mjs';
import esMain from 'es-main';
import express, { json } from 'express';
import ApiV2Router from './Router.js';

dotenv.config(); // Load environment variables from .env file
const PORT = process.env.PORT || 8000;

async function main() {
    const app = express();
    app.use(logger);
    app.use(cors());
    app.use(json());

    app.use('/api', ApiV2Router);
    // Initialize middleware

    app.listen(PORT, () => {
        console.log(`Server is running on port ${PORT}.`);
        console.log('Press Ctrl+C to quit.');
    });
}

// Run the main function if this is a main module
if (esMain(import.meta)) {
    main();
}
