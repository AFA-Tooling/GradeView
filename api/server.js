// /api/server.js
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
    app.use(logger);   // Logging middleware
    app.use(cors());    // Enable Cross-Origin Resource Sharing
    app.use(json());    // Automatically parse incoming JSON requests

    app.use('/api', ApiV2Router);  // Use ApiV2Router for the /api path

    // Start the server
    app.listen(PORT, () => {
        console.log(`Server is running on port ${PORT}.`);
        console.log('Press Ctrl+C to quit.');
    });
}

// Run the main function if this is the entry point (not imported)
if (esMain(import.meta)) {
    main();
}
