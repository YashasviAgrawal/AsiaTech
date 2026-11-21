'use server';

import { revalidatePath } from 'next/cache';
import { and, eq, ne, or, sql } from 'drizzle-orm';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { db } from '@/db';
import { properties, propertyMembers, roles, users } from '@/db/schema';
import { isValidGstin } from '@/lib/gst';
import { normaliseMobile } from '@/lib/utils';
import { actionContext } from '../context';
import { runAction } from '../action';
import { isOwnFile } from '../storage';
import { UserError } from '../errors';
import { logActivity } from '../audit';

function refresh() {
  revalidatePath('/', 'layout');
}

const hotelSchema = z.object({
  name: z.string().trim().min(2, 'Enter the hotel name'),
  legalName: z.string().trim().max(120).nullable().optional(),
  gstin: z
    .string()
    .trim()
    .toUpperCase()
    .refine((v) => !v || isValidGstin(v), 'GSTIN looks wrong: 15 characters, e.g. 08AAKCS1234F1Z5')
    .nullable()
    .optional(),
  stateCode: z.string().trim().max(2).nullable().optional(),
  state: z.string().trim().max(60).nullable().optional(),
  addressLine1: z.string().trim().max(160).nullable().optional(),
  addressLine2: z.string().trim().max(160).nullable().optional(),
  city: z.string().trim().max(60).nullable().optional(),
  pincode: z.string().trim().regex(/^\d{6}$|^$/, 'PIN code is 6 digits').nullable().optional(),
  phone: z.string().trim().max(20).nullable().optional(),
  email: z.string().trim().email().or(z.literal('')).nullable().optional(),
  website: z.string().trim().max(120).nullable().optional(),
  starRating: z.number().int().min(0).max(7).nullable().optional(),
  checkInTime: z.string().regex(/^\d{2}:\d{2}$/),
  checkOutTime: z.string().regex(/^\d{2}:\d{2}$/),
  shortCode: z.string().trim().min(2).max(5).transform((v) => v.toUpperCase()),
  tax: z.object({
    slabLimit: z.number().min(0),
    lowRate: z.number().min(0).max(28),
    highRate: z.number().min(0).max(28),
    ratesIncludeTax: z.boolean(),
    posDefaultRate: z.number().min(0).max(28),
  }),
  invoice: z.object({
    prefix: z.string().trim().min(1).max(6),
    footer: z.string().max(300),
    showUpiQr: z.boolean(),
    upiId: z.string().trim().max(80),
    bankDetails: z.string().max(200),
  }),
  booking: z.object({ holdMinutesDefault: z.number().int().min(15).max(10080), childAgeLimit: z.number().int().min(0).max(17) }),
});

export async function saveHotelDetailsAction(input: z.input<typeof hotelSchema>) {
  return runAction(async () => {
    const ctx = await actionContext('settings.manage');
    const data = hotelSchema.parse(input);
    if (data.gstin && data.stateCode && data.gstin.slice(0, 2) !== data.stateCode) throw new UserError(`GSTIN starts with ${data.gstin.slice(0, 2)} but the state code is ${data.stateCode}.`);
    const [current] = await db.select().from(properties).where(eq(properties.id, ctx.propertyId));
    const settings = {
      ...current.settings,
      tax: {
        roomSlabs: [
          { upTo: data.tax.slabLimit, rate: data.tax.lowRate },
          { upTo: null, rate: data.tax.highRate },
        ],
        ratesIncludeTax: data.tax.ratesIncludeTax,
        posDefaultRate: data.tax.posDefaultRate,
      },
      invoice: data.invoice,
      booking: { ...current.settings.booking, ...data.booking },
    };
    await db
      .update(properties)
      .set({
        name: data.name,
        legalName: data.legalName || null,
        gstin: data.gstin || null,
        stateCode: data.stateCode || null,
        state: data.state || null,
        addressLine1: data.addressLine1 || null,
        addressLine2: data.addressLine2 || null,
        city: data.city || null,
        pincode: data.pincode || null,
        phone: data.phone || null,
        email: data.email || null,
        website: data.website || null,
        starRating: data.starRating ?? null,
        checkInTime: data.checkInTime,
        checkOutTime: data.checkOutTime,
        shortCode: data.shortCode,
        settings,
        onboardingStep: Math.max(current.onboardingStep, 1),
      })
      .where(eq(properties.id, ctx.propertyId));
    await logActivity({ propertyId: ctx.propertyId, userId: ctx.userId, entityType: 'property', entityId: ctx.propertyId, action: 'update', summary: 'Updated hotel details and tax settings', before: { settings: current.settings, gstin: current.gstin }, after: { settings, gstin: data.gstin } });
    refresh();
    return { ok: true };
  }, 'Hotel details saved.');
}

const brandingSchema = z.object({
  primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  tagline: z.string().max(120).optional(),
  aboutText: z.string().max(1000).optional(),
  logoUrl: z.string().max(300).optional(),
  heroImageUrl: z.string().max(300).optional(),
});

/** Branding images must be our own uploads or a plain https link (they end up in CSS url(…) and <img>). */
function safeImageUrl(url: string | undefined, propertyId: string) {
  if (!url) return '';
  if (isOwnFile(url, propertyId, 'branding')) return url;
  if (/^https:\/\/[^\s"'()<>\\]+$/.test(url)) return url;
  throw new UserError('Upload the image, or paste a link that starts with https://');
}

export async function saveBrandingAction(input: z.input<typeof brandingSchema>) {
  return runAction(async () => {
    const ctx = await actionContext('settings.manage');
    const data = brandingSchema.parse(input);
    data.logoUrl = safeImageUrl(data.logoUrl, ctx.propertyId);
    data.heroImageUrl = safeImageUrl(data.heroImageUrl, ctx.propertyId);
    await db.update(properties).set({ branding: { ...ctx.property.branding, ...data } }).where(eq(properties.id, ctx.propertyId));
    refresh();
    return { ok: true };
  }, 'Branding saved.');
}

const notificationsSchema = z.object({
  zeroBookingsAlert: z.boolean(),
  zeroBookingsMonths: z.number().int().min(1).max(12),
  dailySummary: z.boolean(),
  emails: z.array(z.string().trim().email('One of the emails is not valid')).max(10),
});

export async function saveNotificationsAction(input: z.input<typeof notificationsSchema>) {
  return runAction(async () => {
    const ctx = await actionContext('settings.manage');
    const data = notificationsSchema.parse(input);
    await db
      .update(properties)
      .set({ settings: { ...ctx.property.settings, notifications: data } })
      .where(eq(properties.id, ctx.propertyId));
    refresh();
    return { ok: true };
  }, 'Notification settings saved.');
}

/* ───────── users ───────── */

const userSchema = z.object({
  id: z.string().uuid().nullable().optional(),
  name: z.string().trim().min(2, 'Enter the name'),
  email: z.string().trim().toLowerCase().email().or(z.literal('')).nullable().optional(),
  mobile: z.string().trim().regex(/^[6-9]\d{9}$/, '10-digit mobile number').nullable().optional(),
  roleKey: z.string().min(2),
  language: z.enum(['en', 'hi']),
  password: z.string().min(8, 'Password must be at least 8 characters').optional().or(z.literal('')),
  isActive: z.boolean(),
});

export async function saveUserAction(input: z.input<typeof userSchema>) {
  return runAction(async () => {
    const ctx = await actionContext('users.manage');
    const data = userSchema.parse(input);
    if (!data.email && !data.mobile) throw new UserError('Add an email or a mobile number to sign in with.');
    const mobile = normaliseMobile(data.mobile);
    const [role] = await db.select().from(roles).where(and(eq(roles.key, data.roleKey), eq(roles.isSystem, true)));
    if (!role) throw new UserError('Unknown role.');
    if (role.key === 'owner' && ctx.role.key !== 'owner') throw new UserError('Only an owner can add another owner.');

    const clash = await db
      .select({ id: users.id })
      .from(users)
      .where(and(or(data.email ? eq(users.email, data.email) : undefined, mobile ? eq(users.mobile, mobile) : undefined), data.id ? ne(users.id, data.id) : undefined));
    if (clash.length) throw new UserError('Someone already uses that email or mobile number.');

    return db.transaction(async (tx) => {
      let userId = data.id ?? null;
      if (userId) {
        const [member] = await tx.select().from(propertyMembers).where(and(eq(propertyMembers.userId, userId), eq(propertyMembers.propertyId, ctx.propertyId)));
        if (!member) throw new UserError('This person is not on your staff.');
        if (userId === ctx.userId && !data.isActive) throw new UserError('You cannot deactivate yourself.');
        await tx
          .update(users)
          .set({
            name: data.name,
            email: data.email || null,
            mobile,
            language: data.language,
            ...(data.password ? { passwordHash: await bcrypt.hash(data.password, 10), sessionVersion: sql`${users.sessionVersion} + 1` } : {}),
          })
          .where(eq(users.id, userId));
        await tx.update(propertyMembers).set({ roleId: role.id, isActive: data.isActive }).where(eq(propertyMembers.id, member.id));
      } else {
        if (!data.password) throw new UserError('Set a first password (they can change it later).');
        const [created] = await tx
          .insert(users)
          .values({ name: data.name, email: data.email || null, mobile, language: data.language, passwordHash: await bcrypt.hash(data.password, 10) })
          .returning({ id: users.id });
        userId = created.id;
        await tx.insert(propertyMembers).values({ propertyId: ctx.propertyId, userId, roleId: role.id, isActive: data.isActive });
      }
      await logActivity({ propertyId: ctx.propertyId, userId: ctx.userId, entityType: 'user', entityId: userId, action: data.id ? 'update' : 'create', summary: `${data.id ? 'Updated' : 'Added'} staff ${data.name} as ${role.name}${data.isActive ? '' : ' (inactive)'}` }, tx);
      refresh();
      return { id: userId };
    });
  }, 'Staff saved.');
}

export async function signOutEverywhereAction(userId: string) {
  return runAction(async () => {
    const ctx = await actionContext('users.manage');
    const [member] = await db.select().from(propertyMembers).where(and(eq(propertyMembers.userId, userId), eq(propertyMembers.propertyId, ctx.propertyId)));
    if (!member) throw new UserError('Not on your staff.');
    await db.update(users).set({ sessionVersion: sql`${users.sessionVersion} + 1` }).where(eq(users.id, userId));
    return { ok: true };
  }, 'Signed out on every device.');
}

/* ───────── setup wizard ───────── */

export async function setOnboardingStepAction(step: number) {
  return runAction(async () => {
    const ctx = await actionContext('settings.manage');
    await db.update(properties).set({ onboardingStep: step }).where(eq(properties.id, ctx.propertyId));
    refresh();
    return { ok: true };
  });
}

export async function goLiveAction() {
  return runAction(async () => {
    const ctx = await actionContext('settings.manage');
    await db.update(properties).set({ status: 'live', onboardingStep: 5 }).where(eq(properties.id, ctx.propertyId));
    await logActivity({ propertyId: ctx.propertyId, userId: ctx.userId, entityType: 'property', entityId: ctx.propertyId, action: 'go_live', summary: `${ctx.property.name} is live` });
    refresh();
    return { ok: true };
  }, 'You are live! 🎉');
}
