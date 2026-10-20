import { logger } from '../../lib/logger.js';
import { processPaddleEvent, type PaddleEventPayload } from '../../billing/paddle.js';
import type { PaddleProcessJobPayload, WorkerContext } from '../types.js';

export async function handlePaddleProcess(
  payload: PaddleProcessJobPayload,
  ctx: WorkerContext,
): Promise<void> {
  const { eventId } = payload;
  logger.info({ eventId }, 'Worker starting paddle.process job');

  const eventRecord = await ctx.repos.paddleEvents.findById(eventId);
  if (!eventRecord) {
    logger.warn({ eventId }, 'Paddle event not found in paddle_events table');
    return;
  }

  if (eventRecord.processedAt && !eventRecord.error) {
    logger.info({ eventId }, 'Paddle event already processed; skipping');
    return;
  }

  try {
    const result = await processPaddleEvent(eventRecord.payload as PaddleEventPayload, ctx.repos, {
      alreadyRecorded: true,
      boss: ctx.boss,
      emailSender: ctx.emailSender,
      appUrl: process.env.APP_URL,
    });

    await ctx.repos.paddleEvents.markProcessed(eventId);
    logger.info(
      { eventId, eventType: result.eventType },
      'Successfully processed Paddle event in worker',
    );
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    logger.error({ eventId, err }, 'Failed to process Paddle event in worker');
    await ctx.repos.paddleEvents.markProcessed(eventId, errorMsg);
    throw err;
  }
}
