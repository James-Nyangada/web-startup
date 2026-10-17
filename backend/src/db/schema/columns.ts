import { sql } from 'drizzle-orm';
import { customType, timestamp, uuid } from 'drizzle-orm/pg-core';
import { newId } from '../../lib/ids.js';

/** Case-insensitive text (Postgres `citext` extension). */
export const citext = customType<{ data: string }>({ dataType: () => 'citext' });

export const id = () =>
  uuid('id')
    .primaryKey()
    .$defaultFn(() => newId());

export const createdAt = () =>
  timestamp('created_at', { withTimezone: true }).notNull().defaultNow();

/** Kept current by the `set_updated_at` trigger (see drizzle/0001_*.sql). */
export const updatedAt = () =>
  timestamp('updated_at', { withTimezone: true }).notNull().defaultNow();

export const timestamps = () => ({ createdAt: createdAt(), updatedAt: updatedAt() });

export const inList = (values: readonly string[]) =>
  sql.raw(values.map((v) => `'${v}'`).join(', '));
