import { eq } from 'drizzle-orm';
import type { Database } from '../client.js';
import { paddleEvents } from '../schema/index.js';

export function paddleEventsRepository(db: Database) {
  return {
    async record(eventId: string, eventType: string, payload: unknown) {
      const [row] = await db
        .insert(paddleEvents)
        .values({
          eventId,
          eventType,
          payload,
        })
        .onConflictDoNothing()
        .returning();
      return !!row;
    },

    async findById(eventId: string) {
      const [row] = await db.select().from(paddleEvents).where(eq(paddleEvents.eventId, eventId));
      return row ?? null;
    },

    async markProcessed(eventId: string, error?: string) {
      await db
        .update(paddleEvents)
        .set({
          processedAt: new Date(),
          error: error ?? null,
        })
        .where(eq(paddleEvents.eventId, eventId));
    },
  };
}
