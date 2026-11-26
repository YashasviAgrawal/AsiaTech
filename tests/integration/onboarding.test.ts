import './helpers';
import bcrypt from 'bcryptjs';
import { and, eq, isNull } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { db } from '@/db';
import { hkChecklistItems, organizations, properties, propertyMembers, roles, users } from '@/db/schema';
import { syncSystemRoles } from '@/db/system-roles';
import { createHotel, shortCodeFor } from '@/server/services/onboarding';

/** A new hotel on a fresh install (`npm run create-hotel`) or for a new client (platform console). */
describe('create a hotel', () => {
  it('makes the organisation, a hotel in setup, the owner login and a starter checklist', async () => {
    const result = await createHotel({ hotelName: 'Hotel Sunrise Palace', city: 'Udaipur', ownerName: 'Asha Mehta', ownerEmail: 'Asha@Sunrise.Example', ownerMobile: '+91 98290 55555' });
    expect(result).toMatchObject({ slug: 'hotel-sunrise-palace', shortCode: 'HSP', login: 'asha@sunrise.example', existingUser: false });
    expect(result.generatedPassword).toMatch(/^[A-Za-z2-9]{12}$/);

    const [hotel] = await db.select().from(properties).where(eq(properties.id, result.propertyId));
    expect(hotel).toMatchObject({ status: 'setup', onboardingStep: 0, city: 'Udaipur', organizationId: result.organizationId });
    expect(hotel.settings.invoice.prefix).toBe('HSP');
    expect(hotel.settings.notifications.emails).toEqual(['asha@sunrise.example']);
    const [org] = await db.select().from(organizations).where(eq(organizations.id, result.organizationId));
    expect(org).toMatchObject({ name: 'Hotel Sunrise Palace', plan: 'trial', isActive: true });

    const [owner] = await db.select().from(users).where(eq(users.id, result.userId));
    expect(owner).toMatchObject({ email: 'asha@sunrise.example', mobile: '9829055555', isSuperAdmin: false });
    expect(await bcrypt.compare(result.generatedPassword!, owner.passwordHash)).toBe(true);
    const [membership] = await db
      .select({ key: roles.key })
      .from(propertyMembers)
      .innerJoin(roles, eq(roles.id, propertyMembers.roleId))
      .where(and(eq(propertyMembers.propertyId, result.propertyId), eq(propertyMembers.userId, result.userId)));
    expect(membership.key).toBe('owner');
    const checklist = await db.select().from(hkChecklistItems).where(eq(hkChecklistItems.propertyId, result.propertyId));
    expect(checklist.length).toBeGreaterThanOrEqual(10);
    expect(checklist.every((c) => c.nameHi)).toBe(true);
  });

  it('gives an existing owner the new hotel without touching their password, and picks a free web address', async () => {
    const [before] = await db.select().from(users).where(eq(users.email, 'asha@sunrise.example'));
    const result = await createHotel({ hotelName: 'Hotel Sunrise Palace', ownerName: 'Asha', ownerEmail: 'asha@sunrise.example', ownerPassword: 'ignored-password' });
    expect(result).toMatchObject({ slug: 'hotel-sunrise-palace-2', userId: before.id, existingUser: true });
    expect(result.generatedPassword).toBeUndefined();
    const [after] = await db.select().from(users).where(eq(users.id, before.id));
    expect(after.passwordHash).toBe(before.passwordHash);
    const hotels = await db.select({ id: propertyMembers.propertyId }).from(propertyMembers).where(eq(propertyMembers.userId, before.id));
    expect(hotels).toHaveLength(2);
  });

  it('adds a hotel to an existing organisation', async () => {
    const [portico] = await db.select().from(properties).where(eq(properties.slug, 'shri-ram-portico'));
    const result = await createHotel({ organizationId: portico.organizationId, hotelName: 'Shri Ram Inn', ownerName: 'Rajesh Agarwal', ownerEmail: 'owner@shriramportico.in' });
    expect(result.organizationId).toBe(portico.organizationId);
    expect(result.existingUser).toBe(true);
  });

  it('refuses an email and a mobile that belong to two different logins, and bad input', async () => {
    await expect(createHotel({ hotelName: 'Clash Hotel', ownerName: 'Someone', ownerEmail: 'owner@shriramportico.in', ownerMobile: '9876500002' })).rejects.toThrow('two different logins');
    await expect(createHotel({ hotelName: 'No Login Hotel', ownerName: 'Someone' })).rejects.toThrow('email or a mobile');
    await expect(createHotel({ hotelName: 'Bad Mobile Hotel', ownerName: 'Someone', ownerMobile: '12345' })).rejects.toThrow('10-digit');
    expect(await db.select().from(properties).where(eq(properties.slug, 'clash-hotel'))).toHaveLength(0);
  });

  it('keeps one copy of each built-in role, matching the code', async () => {
    await syncSystemRoles(db);
    await syncSystemRoles(db);
    const rows = await db.select({ key: roles.key, permissions: roles.permissions }).from(roles).where(isNull(roles.organizationId));
    expect(rows.map((r) => r.key).sort()).toEqual(['accountant', 'front_desk', 'housekeeping', 'manager', 'owner', 'restaurant']);
    expect(rows.find((r) => r.key === 'owner')!.permissions).toEqual(['*']);
  });

  it('makes short codes from the name', () => {
    expect(shortCodeFor('Hotel Sunrise Palace')).toBe('HSP');
    expect(shortCodeFor('Taj')).toBe('TAJ');
    expect(shortCodeFor('Sunrise')).toBe('SUN');
    expect(shortCodeFor('Shri Ram Portico & Banquets')).toBe('SRP');
  });
});
