import 'server-only';
import { and, desc, eq, ilike, isNotNull, sql } from 'drizzle-orm';
import { db } from '@/db';
import { activityLog, users } from '@/db/schema';

export interface ActivityFilter {
  q?: string;
  entity?: string;
  user?: string;
  limit?: number;
}

/** The Activity Log with the same filters on screen and in the Excel export. */
export async function listActivity(propertyId: string, filter: ActivityFilter) {
  return db
    .select({ log: activityLog, userName: users.name })
    .from(activityLog)
    .leftJoin(users, eq(users.id, activityLog.userId))
    .where(
      and(
        eq(activityLog.propertyId, propertyId),
        filter.q ? ilike(activityLog.summary, `%${filter.q.replace(/[%_\\]/g, '\\$&')}%`) : undefined,
        filter.entity ? eq(activityLog.entityType, filter.entity) : undefined,
        filter.user && /^[0-9a-f-]{36}$/i.test(filter.user) ? eq(activityLog.userId, filter.user) : undefined,
      ),
    )
    .orderBy(desc(activityLog.createdAt))
    .limit(filter.limit ?? 200);
}

export async function activityFilterOptions(propertyId: string) {
  const [people, entities] = await Promise.all([
    db
      .selectDistinct({ id: users.id, name: users.name })
      .from(activityLog)
      .innerJoin(users, eq(users.id, activityLog.userId))
      .where(and(eq(activityLog.propertyId, propertyId), isNotNull(activityLog.userId))),
    db.selectDistinct({ entity: activityLog.entityType }).from(activityLog).where(eq(activityLog.propertyId, propertyId)).orderBy(sql`1`),
  ]);
  return { people, entities };
}
