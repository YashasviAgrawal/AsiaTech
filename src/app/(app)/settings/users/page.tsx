import type { Metadata } from 'next';
import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import { db } from '@/db';
import { loginHistory, propertyMembers, roles, users } from '@/db/schema';
import { requireContext } from '@/server/context';
import { PERMISSION_GROUPS, PERMISSIONS } from '@/server/auth/permissions';
import { listRoles } from '@/server/services/roles';
import { UsersManager } from './users-manager';

export const metadata: Metadata = { title: 'User Management' };

export default async function UsersPage() {
  const ctx = await requireContext('users.manage');
  const staff = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      mobile: users.mobile,
      language: users.language,
      lastLoginAt: users.lastLoginAt,
      roleKey: roles.key,
      roleName: roles.name,
      isActive: propertyMembers.isActive,
    })
    .from(propertyMembers)
    .innerJoin(users, eq(users.id, propertyMembers.userId))
    .innerJoin(roles, eq(roles.id, propertyMembers.roleId))
    .where(eq(propertyMembers.propertyId, ctx.propertyId))
    .orderBy(asc(users.name));
  const logins = staff.length
    ? await db
        .select({ id: loginHistory.id, userId: loginHistory.userId, success: loginHistory.success, ip: loginHistory.ip, userAgent: loginHistory.userAgent, createdAt: loginHistory.createdAt, identifier: loginHistory.identifier })
        .from(loginHistory)
        .where(and(inArray(loginHistory.userId, staff.map((s) => s.id))))
        .orderBy(desc(loginHistory.createdAt))
        .limit(30)
    : [];
  return (
    <UsersManager
      staff={JSON.parse(JSON.stringify(staff))}
      logins={JSON.parse(JSON.stringify(logins.map((l) => ({ ...l, name: staff.find((s) => s.id === l.userId)?.name ?? l.identifier }))))}
      roles={await listRoles(ctx.propertyId)}
      permissions={Object.entries(PERMISSIONS).map(([key, label]) => ({ key, label }))}
      groups={PERMISSION_GROUPS}
      myPermissions={ctx.permissions}
      currentUserId={ctx.userId}
      isOwner={ctx.role.key === 'owner'}
    />
  );
}
