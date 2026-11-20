import { boolean, date, index, integer, jsonb, pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { createdAt, pk, ts, updatedAt } from './_shared';

/* ─────────────────────────────────────────────────────────────────────────────
 * Tenancy: organizations → properties. One login can run many hotels through
 * property_members (a role per property). Every business table carries
 * property_id; see PLAN.md §3.
 * ──────────────────────────────────────────────────────────────────────────── */

export const organizations = pgTable('organizations', {
  id: pk(),
  name: text('name').notNull(),
  plan: text('plan', { enum: ['trial', 'starter', 'pro', 'enterprise'] }).notNull().default('trial'),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: createdAt(),
});

export type TaxSlab = { upTo: number | null; rate: number };

export interface PropertySettings {
  tax: {
    /** Room GST slabs per room per night. Default: 5% up to ₹7,500 and 18% above (since 22 Sep 2025). */
    roomSlabs: TaxSlab[];
    /** Whether the rates entered on the front desk already include GST. */
    ratesIncludeTax: boolean;
    /** Default GST % for restaurant items. */
    posDefaultRate: number;
  };
  invoice: {
    prefix: string;
    footer: string;
    showUpiQr: boolean;
    upiId: string;
    bankDetails: string;
  };
  booking: {
    holdMinutesDefault: number;
    childAgeLimit: number;
    defaultArrivalTime: string;
  };
  notifications: {
    zeroBookingsAlert: boolean;
    zeroBookingsMonths: number;
    dailySummary: boolean;
    emails: string[];
  };
}

export interface PropertyBranding {
  logoUrl?: string;
  primaryColor: string;
  heroImageUrl?: string;
  tagline?: string;
  photos?: string[];
  aboutText?: string;
}

export const properties = pgTable(
  'properties',
  {
    id: pk(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    shortCode: text('short_code').notNull().default('HTL'),
    legalName: text('legal_name'),
    gstin: text('gstin'),
    stateCode: text('state_code'),
    addressLine1: text('address_line1'),
    addressLine2: text('address_line2'),
    city: text('city'),
    state: text('state'),
    pincode: text('pincode'),
    country: text('country').notNull().default('India'),
    phone: text('phone'),
    email: text('email'),
    website: text('website'),
    starRating: integer('star_rating'),
    checkInTime: text('check_in_time').notNull().default('12:00'),
    checkOutTime: text('check_out_time').notNull().default('11:00'),
    timezone: text('timezone').notNull().default('Asia/Kolkata'),
    currency: text('currency').notNull().default('INR'),
    /** The hotel's working day. Night Audit moves it forward. */
    businessDate: date('business_date', { mode: 'string' }).notNull(),
    status: text('status', { enum: ['setup', 'live', 'suspended'] }).notNull().default('setup'),
    onboardingStep: integer('onboarding_step').notNull().default(0),
    settings: jsonb('settings').$type<PropertySettings>().notNull(),
    branding: jsonb('branding').$type<PropertyBranding>().notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex('properties_slug_uq').on(t.slug), index('properties_org_idx').on(t.organizationId)],
);

export const users = pgTable(
  'users',
  {
    id: pk(),
    name: text('name').notNull(),
    email: text('email'),
    mobile: text('mobile'),
    passwordHash: text('password_hash').notNull(),
    language: text('language', { enum: ['en', 'hi'] }).notNull().default('en'),
    isSuperAdmin: boolean('is_super_admin').notNull().default(false),
    isActive: boolean('is_active').notNull().default(true),
    lastLoginAt: ts('last_login_at'),
    /** Bumped to invalidate every session of this user (logout everywhere, password reset). */
    sessionVersion: integer('session_version').notNull().default(1),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex('users_email_uq').on(t.email), uniqueIndex('users_mobile_uq').on(t.mobile)],
);

/** System roles have organization_id = null; custom roles (later) belong to an organization. */
export const roles = pgTable(
  'roles',
  {
    id: pk(),
    organizationId: uuid('organization_id').references(() => organizations.id, { onDelete: 'cascade' }),
    key: text('key').notNull(),
    name: text('name').notNull(),
    description: text('description'),
    permissions: text('permissions').array().notNull().default([]),
    isSystem: boolean('is_system').notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('roles_org_key_uq').on(t.organizationId, t.key)],
);

export const propertyMembers = pgTable(
  'property_members',
  {
    id: pk(),
    propertyId: uuid('property_id')
      .notNull()
      .references(() => properties.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    roleId: uuid('role_id')
      .notNull()
      .references(() => roles.id),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('property_members_uq').on(t.propertyId, t.userId), index('property_members_user_idx').on(t.userId)],
);

export const loginHistory = pgTable(
  'login_history',
  {
    id: pk(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
    identifier: text('identifier').notNull(),
    success: boolean('success').notNull(),
    ip: text('ip'),
    userAgent: text('user_agent'),
    createdAt: createdAt(),
  },
  (t) => [index('login_history_user_idx').on(t.userId, t.createdAt)],
);
