import dotenv from 'dotenv';

// Load ENV_FILE (e.g. .env.staging) before config is read; defaults to .env
dotenv.config({ path: process.env.ENV_FILE || '.env' });

import { loadConfig } from './config.js';
import { createServer } from './server.js';

const config = loadConfig();
const app = createServer(config);

app.listen(config.port, () => {
  console.log(`EveryVisitor Shopify App listening at ${config.host} (port ${config.port})`);
});
