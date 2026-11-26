import 'server-only';
import { desc, eq, sql } from 'drizzle-orm';
import { db } from '@/db';
import { organizations, properties, systemUpdates } from '@/db/schema';

/** Every organisation with its hotels and a little activity, for the platform console. */
export async function listOrganizations() {
  const orgs = await db.select().from(organizations).orderBy(desc(organizations.createdAt));
  const hotels = await db
    .select({
      id: properties.id,
      organizationId: properties.organizationId,
      name: properties.name,
      city: properties.city,
      status: properties.status,
      businessDate: properties.businessDate,
      rooms: sql<number>`(SELECT count(*)::int FROM rooms r WHERE r.property_id = "properties"."id" AND r.is_active)`,
      staff: sql<number>`(SELECT count(*)::int FROM property_members m WHERE m.property_id = "properties"."id" AND m.is_active)`,
      bookings30: sql<number>`(SELECT count(*)::int FROM bookings b WHERE b.property_id = "properties"."id" AND b.created_at > now() - interval '30 days')`,
      lastLogin: sql<string | null>`(SELECT max(u.last_login_at)::text FROM property_members m JOIN users u ON u.id = m.user_id WHERE m.property_id = "properties"."id")`,
    })
    .from(properties)
    .orderBy(properties.name);
  return orgs.map((o) => ({ ...o, hotels: hotels.filter((h) => h.organizationId === o.id) }));
}

export async function listAllSystemUpdates() {
  return db.select().from(systemUpdates).orderBy(desc(systemUpdates.publishedAt));
}

export async function saveSystemUpdate(input: { id?: string | null; title: string; body: string; tag?: string | null; isPublished: boolean }) {
  const values = { title: input.title.trim(), body: input.body.trim(), tag: input.tag?.trim() || null, isPublished: input.isPublished };
  if (input.id) {
    await db.update(systemUpdates).set(values).where(eq(systemUpdates.id, input.id));
    return { id: input.id };
  }
  const [row] = await db.insert(systemUpdates).values(values).returning({ id: systemUpdates.id });
  return { id: row.id };
}

export async function setOrganization(id: string, patch: { plan?: 'trial' | 'starter' | 'pro' | 'enterprise'; isActive?: boolean }) {
  await db.update(organizations).set(patch).where(eq(organizations.id, id));
}
