import fs from 'node:fs';
import { getDb, closeDb } from '../db/index.js';
import { createRepositories } from '../db/repositories/index.js';
import {
  replayPaddleEventById,
  replayFailedPaddleEvents,
  replayPaddlePayload,
  type PaddleEventPayload,
} from './paddle.js';

export { replayPaddleEventById, replayFailedPaddleEvents, replayPaddlePayload };

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    console.log(`
Plainsight Staff Tooling: Paddle Webhook Replay

Usage:
  npm run paddle:replay <eventId>              Replay an event by Paddle Event ID (e.g. evt_01h...)
  npm run paddle:replay -- --failed            Replay all failed webhook events
  npm run paddle:replay -- --file <path>       Replay payload from a local JSON file
  npm run paddle:replay -- --list              List recent 20 Paddle events

Options:
  -h, --help    Show this help message
`);
    return;
  }

  const { db } = getDb();
  const repos = createRepositories(db);

  try {
    if (args.includes('--list') || args.includes('-l')) {
      const recent = await repos.paddleEvents.listRecent(20);
      console.log(`\nRecent Paddle Webhook Events (${recent.length}):`);
      console.table(
        recent.map((e) => ({
          'Event ID': e.eventId,
          Type: e.eventType,
          'Received At': e.receivedAt.toISOString(),
          'Processed At': e.processedAt ? e.processedAt.toISOString() : 'Pending',
          Error: e.error || 'None',
        })),
      );
      return;
    }

    if (args.includes('--failed') || args.includes('-f')) {
      console.log('Fetching failed webhook events...');
      const summary = await replayFailedPaddleEvents(repos);
      console.log(
        `\nReplay Complete: ${summary.total} total, ${summary.succeeded} succeeded, ${summary.failed} failed.`,
      );
      console.table(
        summary.results.map((r) => ({
          Type: r.eventType,
          Handled: r.handled,
          'Org ID': r.orgId || 'N/A',
          Error: r.error || 'None',
        })),
      );
      if (summary.failed > 0) {
        process.exitCode = 1;
      }
      return;
    }

    const fileIdx = args.indexOf('--file');
    const filePath = fileIdx !== -1 ? args[fileIdx + 1] : undefined;
    if (filePath) {
      console.log(`Reading webhook payload from file: ${filePath}`);
      const content = fs.readFileSync(filePath, 'utf-8');
      const payload = JSON.parse(content) as PaddleEventPayload;
      const result = await replayPaddlePayload(repos, payload);
      console.log('\nPayload Replay Result:');
      console.table([
        {
          Type: result.eventType,
          Handled: result.handled,
          'Org ID': result.orgId || 'N/A',
          Error: result.error || 'None',
        },
      ]);
      if (!result.handled || result.error) {
        process.exitCode = 1;
      }
      return;
    }

    // Default: treat first non-flag arg as event ID
    const eventId = args.find((arg) => !arg.startsWith('-'));
    if (!eventId) {
      console.error('Error: No event ID specified.');
      process.exitCode = 1;
      return;
    }

    console.log(`Replaying Paddle webhook event "${eventId}"...`);
    const result = await replayPaddleEventById(repos, eventId);
    console.log('\nEvent Replay Result:');
    console.table([
      {
        'Event ID': eventId,
        Type: result.eventType,
        Handled: result.handled,
        'Org ID': result.orgId || 'N/A',
        Error: result.error || 'None',
      },
    ]);

    if (!result.handled || result.error) {
      process.exitCode = 1;
    }
  } finally {
    await closeDb();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error('Replay failed with unexpected error:', err);
    process.exit(1);
  });
}
