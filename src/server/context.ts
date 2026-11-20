import 'server-only';
import { cache } from 'react';
import { redirect } from 'next/navigation';
import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import { properties, propertyMembers, roles, users, type PropertySettings, type PropertyBranding } from '@/db/schema';
import { readSession } from './auth/session';
import { hasPermission, type Permission } from './auth/permissions';
import { ActionError } from './errors';

export interface PropertySummary {
  id: string;
  name: string;
  city: string | null;
  roleName: string;
}

export interface AppContext {
  user: { id: string; name: string; email: string | null; mobile: string | null; language: 'en' | 'hi'; isSuperAdmin: boolean };
  property: {
    id: string;
    name: string;
    slug: string;
    shortCode: string;
    city: string | null;
    state: string | null;
    stateCode: string | null;
    gstin: string | null;
    businessDate: string;
    checkInTime: string;
    checkOutTime: string;
    status: 'setup' | 'live' | 'suspended';
    onboardingStep: number;
    settings: PropertySettings;
    branding: PropertyBranding;
  };
  propertyId: string;
  userId: string;
  role: { key: string; name: string };
  permissions: string[];
  /** Every property this user can switch to (one login, many hotels). */
  memberships: PropertySummary[];
  can: (permission: Permission) => boolean;
}

/**
 * Resolve the signed-in user and their active property. Cached for the duration of one request, so layouts,
 * pages and server actions can all call it freely.
 */
export const getContext = cache(async (): Promise<AppContext | null> => {
  const session = await readSession();
  if (!session) return null;

  const [user] = await db.select().from(users).where(eq(users.id, session.sub)).limit(1);
  if (!user || !user.isActive || user.sessionVersion !== session.v) return null;

  const memberships = await db
    .select({
      propertyId: properties.id,
      propertyName: properties.name,
      city: properties.city,
      roleKey: roles.key,
      roleName: roles.name,
      permissions: roles.permissions,
    })
    .from(propertyMembers)
    .innerJoin(properties, eq(properties.id, propertyMembers.propertyId))
    .innerJoin(roles, eq(roles.id, propertyMembers.roleId))
    .where(and(eq(propertyMembers.userId, user.id), eq(propertyMembers.isActive, true)))
    .orderBy(properties.name);

  if (memberships.length === 0) return null;

  const active = memberships.find((m) => m.propertyId === session.pid) ?? memberships[0];
  const [property] = await db.select().from(properties).where(eq(properties.id, active.propertyId)).limit(1);
  if (!property) return null;

  const permissions = user.isSuperAdmin ? ['*'] : active.permissions;

  return {
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      mobile: user.mobile,
      language: user.language,
      isSuperAdmin: user.isSuperAdmin,
    },
    property: {
      id: property.id,
      name: property.name,
      slug: property.slug,
      shortCode: property.shortCode,
      city: property.city,
      state: property.state,
      stateCode: property.stateCode,
      gstin: property.gstin,
      businessDate: property.businessDate,
      checkInTime: property.checkInTime,
      checkOutTime: property.checkOutTime,
      status: property.status,
      onboardingStep: property.onboardingStep,
      settings: property.settings,
      branding: property.branding,
    },
    propertyId: property.id,
    userId: user.id,
    role: { key: active.roleKey, name: active.roleName },
    permissions,
    memberships: memberships.map((m) => ({ id: m.propertyId, name: m.propertyName, city: m.city, roleName: m.roleName })),
    can: (permission) => hasPermission(permissions, permission),
  };
});

/** For pages and layouts: redirect to /login when signed out, and to /dashboard when a permission is missing. */
export async function requireContext(permission?: Permission): Promise<AppContext> {
  const ctx = await getContext();
  if (!ctx) redirect('/login');
  if (permission && !ctx.can(permission)) redirect('/dashboard?denied=1');
  return ctx;
}

export { ActionError };

/** For server actions: throw a friendly error instead of redirecting. */
export async function actionContext(permission?: Permission): Promise<AppContext> {
  const ctx = await getContext();
  if (!ctx) throw new ActionError('Your session has expired. Please sign in again.');
  if (permission && !ctx.can(permission)) throw new ActionError('You do not have permission to do this.');
  return ctx;
}
