import 'server-only';
import { and, asc, eq, isNull, ne, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/db';
import { properties, propertyMembers, roles } from '@/db/schema';
import { canGrant, PERMISSIONS, type Permission } from '../auth/permissions';
import { logActivity } from '../audit';
import { UserError } from '../errors';

/**
 * Roles: the six system roles every hotel shares, plus custom roles an organisation makes for itself
 * ("Night auditor", "Senior receptionist"). Custom roles belong to the organisation, so all its hotels can use them.
 */
export interface RoleEditor {
  propertyId: string;
  userId: string;
  /** What the editor holds; they can only hand out permissions from this list. */
  permissions: readonly string[];
}

export interface RoleRow {
  id: string;
  key: string;
  name: string;
  description: string | null;
  permissions: string[];
  isSystem: boolean;
  /** Staff at this hotel with the role. */
  members: number;
}

async function organizationOf(propertyId: string) {
  const [p] = await db.select({ organizationId: properties.organizationId }).from(properties).where(eq(properties.id, propertyId));
  if (!p) throw new UserError('Hotel not found.');
  return p.organizationId;
}

/** System roles first (in their usual order), then the organisation's own roles by name. */
export async function listRoles(propertyId: string): Promise<RoleRow[]> {
  const organizationId = await organizationOf(propertyId);
  const rows = await db
    .select({
      id: roles.id,
      key: roles.key,
      name: roles.name,
      description: roles.description,
      permissions: roles.permissions,
      isSystem: roles.isSystem,
    })
    .from(roles)
    .where(or(and(isNull(roles.organizationId), eq(roles.isSystem, true)), eq(roles.organizationId, organizationId)))
    .orderBy(asc(roles.name));
  const counts = await db
    .select({ roleId: propertyMembers.roleId, n: sql<number>`count(*)::int` })
    .from(propertyMembers)
    .where(eq(propertyMembers.propertyId, propertyId))
    .groupBy(propertyMembers.roleId);
  const members = new Map(counts.map((c) => [c.roleId, c.n]));
  const order = ['owner', 'manager', 'front_desk', 'housekeeping', 'restaurant', 'accountant'];
  const rank = (r: RoleRow) => (r.isSystem ? order.indexOf(r.key) : order.length);
  return rows.map((r) => ({ ...r, members: members.get(r.id) ?? 0 })).sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
}

/** A role this hotel may assign: a system role or one of its organisation's own. */
export async function findAssignableRole(propertyId: string, key: string) {
  const organizationId = await organizationOf(propertyId);
  const [role] = await db
    .select()
    .from(roles)
    .where(and(eq(roles.key, key), or(and(isNull(roles.organizationId), eq(roles.isSystem, true)), eq(roles.organizationId, organizationId))));
  return role ?? null;
}

export const roleInput = z.object({
  id: z.string().uuid().nullable().optional(),
  name: z.string().trim().min(2, 'Give the role a name').max(40, 'Keep the name under 40 characters'),
  description: z.string().trim().max(160).optional().default(''),
  permissions: z.array(z.string()).min(1, 'Tick at least one permission'),
});

function keyFor(name: string) {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 32);
  return `custom_${slug || 'role'}`;
}

export async function saveRole(editor: RoleEditor, input: z.input<typeof roleInput>) {
  const data = roleInput.parse(input);
  const organizationId = await organizationOf(editor.propertyId);
  const permissions = [...new Set(data.permissions)];
  const unknown = permissions.filter((p) => !(p in PERMISSIONS));
  if (unknown.length) throw new UserError('Unknown permission. Reload the page and try again.');
  if (!canGrant(editor.permissions, permissions)) throw new UserError('You can only give a role permissions you have yourself.');

  // Names must be unique among the roles this hotel can pick from, system roles included.
  const sameName = await db
    .select({ id: roles.id })
    .from(roles)
    .where(
      and(
        sql`lower(${roles.name}) = lower(${data.name})`,
        or(and(isNull(roles.organizationId), eq(roles.isSystem, true)), eq(roles.organizationId, organizationId)),
        data.id ? ne(roles.id, data.id) : undefined,
      ),
    );
  if (sameName.length) throw new UserError('There is already a role with that name.');

  return db.transaction(async (tx) => {
    if (data.id) {
      const [existing] = await tx.select().from(roles).where(and(eq(roles.id, data.id), eq(roles.organizationId, organizationId)));
      if (!existing) throw new UserError('Only your own roles can be changed. System roles stay as they are.');
      // Editing must not take away access the editor could not give back, nor touch more than they hold.
      if (!canGrant(editor.permissions, existing.permissions)) throw new UserError('This role has permissions you do not have, so you cannot change it.');
      await tx.update(roles).set({ name: data.name, description: data.description || null, permissions }).where(eq(roles.id, existing.id));
      const added = permissions.filter((p) => !existing.permissions.includes(p));
      const removed = existing.permissions.filter((p) => !permissions.includes(p));
      const change = [added.length ? `+${added.length}` : '', removed.length ? `−${removed.length}` : ''].filter(Boolean).join(' ');
      await logActivity(
        { propertyId: editor.propertyId, userId: editor.userId, entityType: 'role', entityId: existing.id, action: 'update', summary: `Updated role ${data.name}${change ? ` (permissions ${change})` : ''}`, before: { name: existing.name, permissions: existing.permissions }, after: { name: data.name, permissions } },
        tx,
      );
      return { id: existing.id, key: existing.key };
    }
    // A unique key per organisation; a second "Night auditor" after a rename gets _2, _3…
    const base = keyFor(data.name);
    const taken = await tx
      .select({ key: roles.key })
      .from(roles)
      .where(and(eq(roles.organizationId, organizationId), sql`${roles.key} LIKE ${base + '%'}`));
    let key = base;
    for (let n = 2; taken.some((t) => t.key === key); n++) key = `${base}_${n}`;
    const [created] = await tx
      .insert(roles)
      .values({ organizationId, key, name: data.name, description: data.description || null, permissions, isSystem: false })
      .returning({ id: roles.id, key: roles.key });
    await logActivity(
      { propertyId: editor.propertyId, userId: editor.userId, entityType: 'role', entityId: created.id, action: 'create', summary: `Created role ${data.name} with ${permissions.length} permission${permissions.length === 1 ? '' : 's'}`, after: { name: data.name, permissions } },
      tx,
    );
    return created;
  });
}

export async function deleteRole(editor: RoleEditor, id: string) {
  const organizationId = await organizationOf(editor.propertyId);
  const [role] = await db.select().from(roles).where(and(eq(roles.id, id), eq(roles.organizationId, organizationId)));
  if (!role) throw new UserError('Only your own roles can be removed.');
  if (!canGrant(editor.permissions, role.permissions)) throw new UserError('This role has permissions you do not have, so you cannot remove it.');
  // Counted across every hotel of the organisation: property_members is not limited by row-level security.
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(propertyMembers).where(eq(propertyMembers.roleId, id));
  if (n > 0) throw new UserError(`${n} staff ${n === 1 ? 'member still has' : 'members still have'} this role. Give them another role first.`);
  await db.transaction(async (tx) => {
    await tx.delete(roles).where(eq(roles.id, id));
    await logActivity({ propertyId: editor.propertyId, userId: editor.userId, entityType: 'role', entityId: id, action: 'delete', summary: `Removed role ${role.name}`, before: { name: role.name, permissions: role.permissions } }, tx);
  });
}

export type { Permission };
