import { desc, eq } from 'drizzle-orm';
import type { Database } from '../client.js';
import { invoices } from '../schema/index.js';
import type { OrgId } from './org-scope.js';

export interface UpsertInvoiceInput {
  orgId: OrgId;
  paddleTransactionId: string;
  amountCents: number;
  currency: string;
  status: string;
  billedAt: Date;
  invoiceUrl?: string | null;
}

export function invoicesRepository(db: Database) {
  return {
    async listByOrgId(orgId: OrgId, limit = 50) {
      return db
        .select()
        .from(invoices)
        .where(eq(invoices.orgId, orgId))
        .orderBy(desc(invoices.billedAt))
        .limit(limit);
    },

    async findByPaddleTransactionId(paddleTransactionId: string) {
      const [row] = await db
        .select()
        .from(invoices)
        .where(eq(invoices.paddleTransactionId, paddleTransactionId));
      return row ?? null;
    },

    async upsert(data: UpsertInvoiceInput) {
      const [row] = await db
        .insert(invoices)
        .values({
          orgId: data.orgId,
          paddleTransactionId: data.paddleTransactionId,
          amountCents: data.amountCents,
          currency: data.currency,
          status: data.status,
          billedAt: data.billedAt,
          invoiceUrl: data.invoiceUrl ?? null,
        })
        .onConflictDoUpdate({
          target: invoices.paddleTransactionId,
          set: {
            amountCents: data.amountCents,
            currency: data.currency,
            status: data.status,
            billedAt: data.billedAt,
            invoiceUrl: data.invoiceUrl ?? null,
            updatedAt: new Date(),
          },
        })
        .returning();
      if (!row) throw new Error('Failed to upsert invoice');
      return row;
    },
  };
}
