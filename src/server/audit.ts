import 'server-only';
import { and, eq, sql } from 'drizzle-orm';
import { db, type DbOrTx } from '@/db';
import { activityLog, counters, notifications } from '@/db/schema';

export interface ActivityInput {
  propertyId: string;
  userId: string | null;
  entityType: string;
  entityId?: string | null;
  action: string;
  summary: string;
  before?: unknown;
  after?: unknown;
}

/** Record who changed what. Returns the log id (used for Undo). */
export async function logActivity(input: ActivityInput, tx: DbOrTx = db): Promise<string> {
  const [row] = await tx
    .insert(activityLog)
    .values({
      propertyId: input.propertyId,
      userId: input.userId,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      action: input.action,
      summary: input.summary,
      before: input.before ?? null,
      after: input.after ?? null,
    })
    .returning({ id: activityLog.id });
  return row.id;
}

/**
 * Next number in a per-property series, e.g. bookings ('booking'), invoices ('invoice:2026-27').
 * The upsert takes a row lock, so two front-desk PCs can never get the same number.
 */
export async function nextCounter(tx: DbOrTx, propertyId: string, key: string, start = 1): Promise<number> {
  const [row] = await tx
    .insert(counters)
    .values({ propertyId, key, value: start })
    .onConflictDoUpdate({
      target: [counters.propertyId, counters.key],
      set: { value: sql`${counters.value} + 1` },
    })
    .returning({ value: counters.value });
  return row.value;
}

export async function peekCounter(propertyId: string, key: string): Promise<number> {
  const [row] = await db
    .select({ value: counters.value })
    .from(counters)
    .where(and(eq(counters.propertyId, propertyId), eq(counters.key, key)));
  return row?.value ?? 0;
}

export async function notify(
  tx: DbOrTx,
  input: { propertyId: string; type: (typeof notifications.$inferInsert)['type']; title: string; body?: string; href?: string; userId?: string | null },
): Promise<void> {
  await tx.insert(notifications).values({
    propertyId: input.propertyId,
    type: input.type,
    title: input.title,
    body: input.body ?? null,
    href: input.href ?? null,
    userId: input.userId ?? null,
  });
}
