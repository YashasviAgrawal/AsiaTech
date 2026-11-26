import { and, eq, isNull } from 'drizzle-orm';
import type { DbOrTx } from './index';
import { roles } from './schema';
import { SYSTEM_ROLES } from '../server/auth/permissions';

/**
 * Make the built-in roles in the database match the code: missing ones are added, and a permission added to a
 * built-in role in a later version reaches existing installs. Runs on every `db:migrate` and when a hotel is created.
 */
export async function syncSystemRoles(tx: DbOrTx): Promise<Map<string, string>> {
  const existing = await tx.select({ id: roles.id, key: roles.key }).from(roles).where(and(isNull(roles.organizationId), eq(roles.isSystem, true)));
  const ids = new Map(existing.map((r) => [r.key, r.id]));
  for (const role of SYSTEM_ROLES) {
    const values = { name: role.name, description: role.description, permissions: role.permissions as string[] };
    const id = ids.get(role.key);
    if (id) await tx.update(roles).set(values).where(eq(roles.id, id));
    else {
      const [row] = await tx.insert(roles).values({ ...values, key: role.key, isSystem: true }).returning({ id: roles.id });
      ids.set(role.key, row.id);
    }
  }
  return ids;
}
