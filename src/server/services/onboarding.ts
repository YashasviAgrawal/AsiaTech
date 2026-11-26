import 'server-only';
import { randomInt } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { eq, or } from 'drizzle-orm';
import { z } from 'zod';
import { db, type DbOrTx } from '@/db';
import { hkChecklistItems, organizations, properties, propertyMembers, users, type PropertySettings } from '@/db/schema';
import { syncSystemRoles } from '@/db/system-roles';
import { DEFAULT_ROOM_SLABS } from '@/lib/gst';
import { todayIST } from '@/lib/format';
import { nameKey, normaliseMobile, slugify } from '@/lib/utils';

/**
 * A new hotel on a fresh install or for a new client: organisation, hotel (in setup, so the owner lands on the
 * setup wizard), owner login and a starter housekeeping checklist. Used by `npm run create-hotel` and the
 * platform console.
 */

export function defaultPropertySettings(prefix: string, ownerEmail?: string | null): PropertySettings {
  return {
    tax: { roomSlabs: DEFAULT_ROOM_SLABS, ratesIncludeTax: false, posDefaultRate: 5 },
    invoice: { prefix, footer: 'Thank you for staying with us.', showUpiQr: false, upiId: '', bankDetails: '' },
    booking: { holdMinutesDefault: 120, childAgeLimit: 6, defaultArrivalTime: '12:00' },
    notifications: { zeroBookingsAlert: true, zeroBookingsMonths: 3, dailySummary: true, emails: ownerEmail ? [ownerEmail] : [] },
  };
}

const STARTER_CHECKLIST: { name: string; nameHi: string; category: 'cleaning' | 'amenities' | 'maintenance' }[] = [
  { name: 'Bed sheets changed', nameHi: 'बेडशीट बदली', category: 'cleaning' },
  { name: 'Floor mopped', nameHi: 'फ़र्श पोंछा', category: 'cleaning' },
  { name: 'Bathroom cleaned', nameHi: 'बाथरूम साफ़', category: 'cleaning' },
  { name: 'All mirrors cleaned', nameHi: 'सभी शीशे साफ़', category: 'cleaning' },
  { name: 'Dustbin emptied', nameHi: 'कूड़ेदान खाली', category: 'cleaning' },
  { name: 'Towels (2)', nameHi: 'तौलिये (2)', category: 'amenities' },
  { name: 'Bath soap', nameHi: 'नहाने का साबुन', category: 'amenities' },
  { name: 'Drinking water (2 bottles)', nameHi: 'पीने का पानी (2 बोतल)', category: 'amenities' },
  { name: 'AC', nameHi: 'एसी', category: 'maintenance' },
  { name: 'TV and remote', nameHi: 'टीवी और रिमोट', category: 'maintenance' },
  { name: 'Geyser / hot water', nameHi: 'गीज़र / गर्म पानी', category: 'maintenance' },
  { name: 'Lights and switches', nameHi: 'लाइट और स्विच', category: 'maintenance' },
];

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => v || undefined);

export const newHotelInput = z
  .object({
    /** Add the hotel to an existing organisation (a group adding a property) instead of starting a new one. */
    organizationId: z.string().uuid().optional(),
    organizationName: optionalText(80),
    plan: z.enum(['trial', 'starter', 'pro', 'enterprise']).default('trial'),
    hotelName: z.string().trim().min(2, 'Hotel name is too short').max(80),
    city: optionalText(60),
    ownerName: z.string().trim().min(2, "Owner's name is too short").max(80),
    ownerEmail: z
      .string()
      .trim()
      .toLowerCase()
      .email('Owner email is not valid')
      .optional()
      .or(z.literal(''))
      .transform((v) => v || undefined),
    ownerMobile: z
      .string()
      .trim()
      .optional()
      .transform((v) => normaliseMobile(v) ?? undefined)
      .refine((v) => !v || /^[6-9]\d{9}$/.test(v), 'Owner mobile must be a 10-digit Indian number'),
    /** Left empty: a password is made up and shown once. Ignored when the owner already has a login. */
    ownerPassword: z.string().min(8, 'Password must be at least 8 characters').optional().or(z.literal('')).transform((v) => v || undefined),
    /** The platform team's own login (can open /admin). */
    platformAdmin: z.boolean().default(false),
  })
  .refine((v) => v.ownerEmail || v.ownerMobile, { message: 'Give the owner an email or a mobile number to sign in with', path: ['ownerEmail'] });

export type NewHotelInput = z.input<typeof newHotelInput>;

export interface NewHotelResult {
  organizationId: string;
  propertyId: string;
  slug: string;
  shortCode: string;
  userId: string;
  /** Sign in with this (email, or mobile when there is no email). */
  login: string;
  /** Only when a new login was made without a chosen password: show it once. */
  generatedPassword?: string;
  /** The owner already had a login: they keep their password and see the new hotel in the switcher. */
  existingUser: boolean;
}

export class OnboardingError extends Error {}

/** "Hotel Sunrise Palace" → "HSP", "Taj" → "TAJ", "Sunrise" → "SUN". */
export function shortCodeFor(name: string): string {
  const words = name
    .toUpperCase()
    .replace(/[^A-Z0-9 ]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
  const initials = words.map((w) => w[0]).join('');
  const code = initials.length >= 2 ? initials : (words[0] ?? 'HTL');
  return (code.length >= 2 ? code : `${code}HTL`).slice(0, 3);
}

function makePassword(): string {
  // No look-alike characters (0/O, 1/l/I), easy to read out on the phone.
  const alphabet = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 12 }, () => alphabet[randomInt(alphabet.length)]).join('');
}

async function freeSlug(tx: DbOrTx, name: string): Promise<string> {
  const base = slugify(name).slice(0, 48) || 'hotel';
  for (let n = 1; n < 100; n++) {
    const slug = n === 1 ? base : `${base}-${n}`;
    const [taken] = await tx.select({ id: properties.id }).from(properties).where(eq(properties.slug, slug)).limit(1);
    if (!taken) return slug;
  }
  throw new OnboardingError('Could not find a free web address for this hotel name.');
}

export async function createHotel(raw: NewHotelInput): Promise<NewHotelResult> {
  const input = newHotelInput.parse(raw);
  return db.transaction(async (tx) => {
    const roleIds = await syncSystemRoles(tx);

    let organizationId = input.organizationId;
    if (organizationId) {
      const [org] = await tx.select({ id: organizations.id }).from(organizations).where(eq(organizations.id, organizationId));
      if (!org) throw new OnboardingError('That organisation does not exist.');
    } else {
      const [org] = await tx
        .insert(organizations)
        .values({ name: input.organizationName ?? input.hotelName, plan: input.plan })
        .returning({ id: organizations.id });
      organizationId = org.id;
    }

    // An owner who already has a login (by email or mobile) keeps it and gets the new hotel in their switcher.
    const matches = await tx
      .select({ id: users.id, email: users.email, mobile: users.mobile, isSuperAdmin: users.isSuperAdmin })
      .from(users)
      .where(or(input.ownerEmail ? eq(users.email, input.ownerEmail) : undefined, input.ownerMobile ? eq(users.mobile, input.ownerMobile) : undefined));
    if (matches.length > 1) throw new OnboardingError('That email and that mobile number belong to two different logins. Use one of them.');
    let user = matches[0];
    let generatedPassword: string | undefined;
    if (!user) {
      const password = input.ownerPassword ?? (generatedPassword = makePassword());
      [user] = await tx
        .insert(users)
        .values({ name: input.ownerName, email: input.ownerEmail ?? null, mobile: input.ownerMobile ?? null, passwordHash: await bcrypt.hash(password, 10), isSuperAdmin: input.platformAdmin })
        .returning({ id: users.id, email: users.email, mobile: users.mobile, isSuperAdmin: users.isSuperAdmin });
    } else if (input.platformAdmin && !user.isSuperAdmin) {
      await tx.update(users).set({ isSuperAdmin: true }).where(eq(users.id, user.id));
    }

    const shortCode = shortCodeFor(input.hotelName);
    const slug = await freeSlug(tx, input.hotelName);
    const [property] = await tx
      .insert(properties)
      .values({
        organizationId,
        name: input.hotelName,
        slug,
        shortCode,
        city: input.city ?? null,
        email: input.ownerEmail ?? null,
        businessDate: todayIST(),
        status: 'setup',
        onboardingStep: 0,
        settings: defaultPropertySettings(shortCode, input.ownerEmail),
        branding: { primaryColor: '#e11d48' },
      })
      .returning({ id: properties.id });

    await tx.insert(propertyMembers).values({ propertyId: property.id, userId: user.id, roleId: roleIds.get('owner')! });
    await tx
      .insert(hkChecklistItems)
      .values(STARTER_CHECKLIST.map((c, i) => ({ propertyId: property.id, name: c.name, nameHi: c.nameHi, nameKey: nameKey(c.name), category: c.category, sortOrder: i })));

    return {
      organizationId,
      propertyId: property.id,
      slug,
      shortCode,
      userId: user.id,
      login: user.email ?? user.mobile ?? '',
      generatedPassword,
      existingUser: matches.length > 0,
    };
  });
}
