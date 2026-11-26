import './helpers';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { db } from '@/db';
import { properties, propertyMembers, roles, users } from '@/db/schema';
import { canGrant, PERMISSIONS } from '@/server/auth/permissions';
import { deleteRole, findAssignableRole, listRoles, saveRole } from '@/server/services/roles';

/** Custom roles: made per organisation, never a way to give away more than you have. */
async function setup() {
  const [hotel] = await db.select({ id: properties.id }).from(properties).where(eq(properties.slug, 'shri-ram-portico'));
  const [owner] = await db.select({ id: users.id }).from(users).where(eq(users.email, 'owner@shriramportico.in'));
  return { propertyId: hotel.id, userId: owner.id };
}

const ALL = Object.keys(PERMISSIONS);

describe('custom roles', () => {
  it('only lets you hand out permissions you hold', () => {
    expect(canGrant(['*'], ['users.manage', 'money.manage'])).toBe(true);
    expect(canGrant(['users.manage', 'bookings.view'], ['bookings.view'])).toBe(true);
    expect(canGrant(['users.manage', 'bookings.view'], ['bookings.view', 'money.manage'])).toBe(false);
    expect(canGrant(ALL, ['*'])).toBe(false);
  });

  it('creates a role for the organisation and lists it after the system roles', async () => {
    const owner = await setup();
    const created = await saveRole({ ...owner, permissions: ['*'] }, { name: 'Night auditor', description: 'Closes the day', permissions: ['dashboard.view', 'nightaudit.run', 'money.view'] });
    expect(created.key).toBe('custom_night_auditor');
    const list = await listRoles(owner.propertyId);
    expect(list.slice(0, 6).map((r) => r.key)).toEqual(['owner', 'manager', 'front_desk', 'housekeeping', 'restaurant', 'accountant']);
    const mine = list.find((r) => r.key === 'custom_night_auditor')!;
    expect(mine).toMatchObject({ isSystem: false, members: 0, permissions: ['dashboard.view', 'nightaudit.run', 'money.view'] });
    expect(await findAssignableRole(owner.propertyId, 'custom_night_auditor')).not.toBeNull();
  });

  it('refuses duplicate names (system roles included), unknown permissions and "everything"', async () => {
    const owner = await setup();
    const editor = { ...owner, permissions: ['*'] };
    await expect(saveRole(editor, { name: 'night AUDITOR', permissions: ['dashboard.view'] })).rejects.toThrow('already a role with that name');
    await expect(saveRole(editor, { name: 'Manager', permissions: ['dashboard.view'] })).rejects.toThrow('already a role with that name');
    await expect(saveRole(editor, { name: 'Odd', permissions: ['bookings.fly'] })).rejects.toThrow('Unknown permission');
    await expect(saveRole(editor, { name: 'Everything', permissions: ['*'] })).rejects.toThrow('Unknown permission');
    await expect(saveRole(editor, { name: 'Empty', permissions: [] })).rejects.toThrow();
  });

  it('does not let a staff manager create, edit or remove a role with more than they have', async () => {
    const owner = await setup();
    const limited = { ...owner, permissions: ['users.manage', 'dashboard.view', 'bookings.view'] };
    await expect(saveRole(limited, { name: 'Cashier plus', permissions: ['bookings.view', 'money.manage'] })).rejects.toThrow('permissions you have yourself');
    const role = (await listRoles(owner.propertyId)).find((r) => r.key === 'custom_night_auditor')!;
    await expect(saveRole(limited, { id: role.id, name: 'Night auditor', permissions: ['bookings.view'] })).rejects.toThrow('permissions you do not have');
    await expect(deleteRole(limited, role.id)).rejects.toThrow('permissions you do not have');
  });

  it('leaves system roles alone', async () => {
    const owner = await setup();
    const manager = (await listRoles(owner.propertyId)).find((r) => r.key === 'manager')!;
    await expect(saveRole({ ...owner, permissions: ['*'] }, { id: manager.id, name: 'Manager', permissions: ['dashboard.view'] })).rejects.toThrow('System roles stay as they are');
    await expect(deleteRole({ ...owner, permissions: ['*'] }, manager.id)).rejects.toThrow('Only your own roles');
  });

  it('will not remove a role someone still has, then removes it once nobody does', async () => {
    const owner = await setup();
    const editor = { ...owner, permissions: ['*'] };
    const role = (await listRoles(owner.propertyId)).find((r) => r.key === 'custom_night_auditor')!;
    const [member] = await db.select().from(propertyMembers).where(eq(propertyMembers.propertyId, owner.propertyId)).limit(1);
    const before = member.roleId;
    await db.update(propertyMembers).set({ roleId: role.id }).where(eq(propertyMembers.id, member.id));
    expect((await listRoles(owner.propertyId)).find((r) => r.id === role.id)?.members).toBe(1);
    await expect(deleteRole(editor, role.id)).rejects.toThrow('still has this role');
    await db.update(propertyMembers).set({ roleId: before }).where(eq(propertyMembers.id, member.id));
    await deleteRole(editor, role.id);
    expect(await db.select().from(roles).where(eq(roles.id, role.id))).toHaveLength(0);
  });
});
