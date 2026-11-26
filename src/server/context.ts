import 'server-only';
import { cache } from 'react';
import { notFound, redirect } from 'next/navigation';
import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import { currentScope, openTenantScope } from '@/db/tenant';
import { organizations, properties, propertyMembers, roles, users, type PropertySettings, type PropertyBranding } from '@/db/schema';
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
 * Resolve the signed-in user and their active property, and limit the database to that property for the rest
 * of the request (row-level security, see src/db/tenant.ts). The lookup is cached for the request, so layouts,
 * pages, server actions and API routes can all call it freely.
 */
export async function getContext(): Promise<AppContext | null> {
  // Opened before the first await, so the caller's code after `await getContext()` runs inside this scope.
  const scope = openTenantScope();
  const ctx = await loadContext();
  scope.propertyId = ctx?.propertyId ?? null;
  return ctx;
}

const loadContext = cache(async (): Promise<AppContext | null> => {
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
      orgActive: organizations.isActive,
    })
    .from(propertyMembers)
    .innerJoin(properties, eq(properties.id, propertyMembers.propertyId))
    .innerJoin(organizations, eq(organizations.id, properties.organizationId))
    .innerJoin(roles, eq(roles.id, propertyMembers.roleId))
    .where(and(eq(propertyMembers.userId, user.id), eq(propertyMembers.isActive, true)))
    .orderBy(properties.name)
    // A suspended organisation locks its staff out; the platform team can still look in.
    .then((rows) => rows.filter((m) => m.orgActive || user.isSuperAdmin));

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

/** Platform console pages: only super admins; everyone else gets a plain 404 (the page "does not exist"). */
export async function requireSuperAdmin(): Promise<AppContext> {
  const ctx = await requireContext();
  if (!ctx.user.isSuperAdmin) notFound();
  platformScope();
  return ctx;
}

export async function superAdminActionContext(): Promise<AppContext> {
  const ctx = await actionContext();
  if (!ctx.user.isSuperAdmin) throw new ActionError('Only the platform team can do this.');
  platformScope();
  return ctx;
}

/** The platform console looks across hotels on purpose: lift the per-hotel database limit for this request. */
function platformScope() {
  const scope = currentScope();
  if (scope) scope.platform = true;
}
