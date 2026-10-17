import { startFixtureSite } from './fixture-site.js';

// npm run fixtures:serve -- then: npm run scan -- http://127.0.0.1:4100 --allow-private
const port = Number(process.env.FIXTURE_PORT ?? 4100);
await startFixtureSite({ port });
console.log(`Fixture store on http://127.0.0.1:${port} (Ctrl+C to stop)`);
