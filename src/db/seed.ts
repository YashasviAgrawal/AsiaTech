/**
 * Demo data for Shri Ram Portico (matches the AsiaTech screenshots) plus a second small property to show the
 * property switcher. Run with `npm run db:seed` (or `npm run db:reset` for a clean database).
 *
 * Bookings are created through the real booking service, so inventory, prices and GST are consistent.
 */
import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { and, eq, sql } from 'drizzle-orm';
import { db, pool } from './index';
import {
  activityLog,
  bookingRooms,
  bookings,
  channelMappings,
  channels,
  counters,
  folioLines,
  guests,
  hkChecklistItems,
  hkTasks,
  inventory,
  maintenanceTickets,
  notifications,
  organizations,
  payments,
  pettyCash,
  posCategories,
  posMenuItems,
  posOrderItems,
  posOrders,
  posOutlets,
  posTables,
  promotions,
  properties,
  propertyMembers,
  ratePlans,
  reviews,
  roles,
  roomTypes,
  rooms,
  syncLogs,
  systemUpdates,
  tasks,
  users,
  type PropertySettings,
} from './schema';
import { SYSTEM_ROLES } from '../server/auth/permissions';
import { DEFAULT_ROOM_SLABS, splitTax } from '../lib/gst';
import { addDay, financialYear, stayDates, todayIST } from '../lib/format';
import { nameKey, round2 } from '../lib/utils';
import { ensureInventory, INVENTORY_HORIZON_DAYS } from '../server/services/inventory';
import { createBooking, insertPayment } from '../server/services/bookings';
import type { Actor } from '../server/services/actor';
import { sealSecrets } from '../server/secrets';

const PASSWORD = 'Hotel@123';

/* Deterministic pseudo-random numbers so every seed run produces the same hotel. */
let seedState = 20261120;
function rand() {
  seedState |= 0;
  seedState = (seedState + 0x6d2b79f5) | 0;
  let t = Math.imul(seedState ^ (seedState >>> 15), 1 | seedState);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const pick = <T,>(items: T[]) => items[Math.floor(rand() * items.length)];
const chance = (p: number) => rand() < p;

const FIRST = ['Rahul', 'Priya', 'Amit', 'Neha', 'Rohit', 'Anjali', 'Vikas', 'Pooja', 'Sanjay', 'Kavita', 'Arjun', 'Sneha', 'Manish', 'Ritu', 'Deepak', 'Swati', 'Karan', 'Meera', 'Ajay', 'Divya', 'Suresh', 'Nisha', 'Gaurav', 'Shalini', 'Harsh', 'Tanvi', 'Nikhil', 'Isha', 'Mohit', 'Payal'];
const LAST = ['Sharma', 'Verma', 'Gupta', 'Agarwal', 'Jain', 'Singh', 'Mehta', 'Patel', 'Joshi', 'Mathur', 'Saxena', 'Bansal', 'Khandelwal', 'Rathore', 'Chauhan', 'Shekhawat', 'Malhotra', 'Kapoor', 'Reddy', 'Iyer'];
const CITIES = ['Jaipur', 'Delhi', 'Mumbai', 'Ahmedabad', 'Indore', 'Lucknow', 'Pune', 'Bengaluru', 'Kota', 'Udaipur', 'Ajmer', 'Chandigarh', 'Kolkata', 'Bhopal'];

function settings(prefix: string): PropertySettings {
  return {
    tax: { roomSlabs: DEFAULT_ROOM_SLABS, ratesIncludeTax: false, posDefaultRate: 5 },
    invoice: {
      prefix,
      footer: 'Thank you for staying with us. Check-out time is 11:00 AM.',
      showUpiQr: true,
      upiId: 'shriramportico@okhdfcbank',
      bankDetails: 'HDFC Bank · A/c 50200012345678 · IFSC HDFC0001234',
    },
    booking: { holdMinutesDefault: 120, childAgeLimit: 6, defaultArrivalTime: '12:00' },
    notifications: { zeroBookingsAlert: true, zeroBookingsMonths: 3, dailySummary: true, emails: ['owner@shriramportico.in'] },
  };
}

async function main() {
  const existing = await db.select({ id: properties.id }).from(properties).limit(1);
  if (existing.length > 0) {
    console.log('Database already has data. Run `npm run db:reset` for a fresh seed.');
    await pool.end();
    return;
  }

  const today = todayIST();
  console.log(`Seeding for business date ${today}…`);

  /* ── roles, organisation, properties ─────────────────────────────── */
  const roleRows = await db
    .insert(roles)
    .values(SYSTEM_ROLES.map((r) => ({ key: r.key, name: r.name, description: r.description, permissions: r.permissions as string[], isSystem: true })))
    .returning();
  const role = (key: string) => roleRows.find((r) => r.key === key)!.id;

  const [org] = await db.insert(organizations).values({ name: 'Shri Ram Hospitality', plan: 'pro' }).returning();

  const [portico] = await db
    .insert(properties)
    .values({
      organizationId: org.id,
      name: 'Shri Ram Portico',
      slug: 'shri-ram-portico',
      shortCode: 'SRP',
      legalName: 'Shri Ram Hospitality Pvt Ltd',
      gstin: '08AAKCS1234F1Z5',
      stateCode: '08',
      addressLine1: 'Plot 12, Station Road',
      addressLine2: 'Near Railway Station',
      city: 'Jaipur',
      state: 'Rajasthan',
      pincode: '302006',
      phone: '+91 98290 12345',
      email: 'stay@shriramportico.in',
      website: 'https://shriramportico.in',
      starRating: 3,
      checkInTime: '12:00',
      checkOutTime: '11:00',
      businessDate: today,
      status: 'live',
      onboardingStep: 5,
      settings: settings('SRP'),
      branding: {
        primaryColor: '#e11d48',
        tagline: 'Comfort stays near Jaipur Junction',
        aboutText: 'A friendly 23-room hotel two minutes from Jaipur Junction, with a family restaurant, free Wi-Fi and 24-hour front desk.',
      },
    })
    .returning();

  const [residency] = await db
    .insert(properties)
    .values({
      organizationId: org.id,
      name: 'Shri Ram Residency',
      slug: 'shri-ram-residency',
      shortCode: 'SRR',
      gstin: '08AAKCS1234F2Z4',
      stateCode: '08',
      addressLine1: 'MI Road',
      city: 'Ajmer',
      state: 'Rajasthan',
      pincode: '305001',
      businessDate: today,
      status: 'setup',
      onboardingStep: 2,
      settings: settings('SRR'),
      branding: { primaryColor: '#e11d48', tagline: 'Simple, clean rooms in Ajmer' },
    })
    .returning();

  /* ── users ──────────────────────────────────────────────────────── */
  const hash = await bcrypt.hash(PASSWORD, 10);
  const userRows = await db
    .insert(users)
    .values([
      { name: 'Rajesh Agarwal', email: 'owner@shriramportico.in', mobile: '9876500001', passwordHash: hash, isSuperAdmin: true },
      { name: 'Sunita Sharma', email: 'manager@shriramportico.in', mobile: '9876500005', passwordHash: hash },
      { name: 'Vikram Singh', email: 'frontdesk@shriramportico.in', mobile: '9876500002', passwordHash: hash },
      { name: 'Ramesh Kumar', email: null, mobile: '9876500003', passwordHash: hash, language: 'hi' as const },
      { name: 'Geeta Devi', email: null, mobile: '9876500006', passwordHash: hash, language: 'hi' as const },
      { name: 'Mohan Lal', email: 'restaurant@shriramportico.in', mobile: '9876500004', passwordHash: hash },
      { name: 'Anil Jain', email: 'accounts@shriramportico.in', mobile: '9876500007', passwordHash: hash },
    ])
    .returning();
  const [owner, manager, frontDesk, hk1, hk2, restaurantUser, accountant] = userRows;

  await db.insert(propertyMembers).values([
    { propertyId: portico.id, userId: owner.id, roleId: role('owner') },
    { propertyId: residency.id, userId: owner.id, roleId: role('owner') },
    { propertyId: portico.id, userId: manager.id, roleId: role('manager') },
    { propertyId: portico.id, userId: frontDesk.id, roleId: role('front_desk') },
    { propertyId: portico.id, userId: hk1.id, roleId: role('housekeeping') },
    { propertyId: portico.id, userId: hk2.id, roleId: role('housekeeping') },
    { propertyId: portico.id, userId: restaurantUser.id, roleId: role('restaurant') },
    { propertyId: portico.id, userId: accountant.id, roleId: role('accountant') },
  ]);

  /* ── room types, rooms, rate plans (Shri Ram Portico) ───────────── */
  const typeDefs = [
    { name: 'Deluxe Double Bed Room', code: 'DDB', rooms: ['101', '102', '103'], floor: '1', color: '#e11d48', maxAdults: 3, sqft: 220, bed: 'King', ep: [2200, 2500, 2900], extra: 600 },
    { name: 'Deluxe Family Room', code: 'DFR', rooms: ['104', '105', '106', '107'], floor: '1', color: '#7c3aed', maxAdults: 4, sqft: 320, bed: 'King + Single', ep: [3000, 3400, 3800], extra: 600 },
    { name: 'Standard Double Bed Room', code: 'SDB', rooms: ['201', '202', '203', '204', '205', '206', '207', '208', '209', '210', '211', '212'], floor: '2', color: '#0284c7', maxAdults: 3, sqft: 180, bed: 'Queen', ep: [1500, 1800, 2200], extra: 500 },
    { name: 'Standard Family Bed Room', code: 'SFB', rooms: ['301', '302', '303', '304'], floor: '3', color: '#059669', maxAdults: 4, sqft: 260, bed: 'Queen + Single', ep: [2400, 2700, 3100], extra: 500 },
  ];
  const amenities = ['Air conditioning', 'Free Wi-Fi', 'LED TV', 'Hot water', 'Room service', 'Tea/coffee maker'];

  const types: { id: string; name: string; code: string; roomIds: { id: string; number: string }[]; plans: { id: string; meal: string }[] }[] = [];
  for (const [index, def] of typeDefs.entries()) {
    const [type] = await db
      .insert(roomTypes)
      .values({
        propertyId: portico.id,
        name: def.name,
        code: def.code,
        description: `${def.bed} bed · ${def.sqft} sq ft`,
        baseOccupancy: 2,
        maxAdults: def.maxAdults,
        maxChildren: 2,
        maxExtraBeds: 1,
        sizeSqft: def.sqft,
        bedType: def.bed,
        amenities,
        color: def.color,
        sortOrder: index,
      })
      .returning();
    const roomRows = await db
      .insert(rooms)
      .values(def.rooms.map((number, i) => ({ propertyId: portico.id, roomTypeId: type.id, number, floor: def.floor, sortOrder: i })))
      .returning({ id: rooms.id, number: rooms.number });
    const planRows = await db
      .insert(ratePlans)
      .values([
        {
          propertyId: portico.id,
          roomTypeId: type.id,
          name: 'Room Only',
          mealPlan: 'EP' as const,
          price1: def.ep[0],
          price2: def.ep[1],
          price3: def.ep[2],
          extraBed: def.extra,
          childPrice: 0,
          isDefault: true,
          cancellationPolicy: 'Free cancellation up to 24 hours before check-in. After that, one night is charged.',
          sortOrder: 0,
        },
        {
          propertyId: portico.id,
          roomTypeId: type.id,
          name: 'With Breakfast',
          mealPlan: 'CP' as const,
          price1: def.ep[0] + 250,
          price2: def.ep[1] + 500,
          price3: def.ep[2] + 750,
          extraBed: def.extra + 250,
          childPrice: 150,
          cancellationPolicy: 'Free cancellation up to 24 hours before check-in. After that, one night is charged.',
          sortOrder: 1,
        },
        {
          propertyId: portico.id,
          roomTypeId: type.id,
          name: 'Breakfast + Dinner',
          mealPlan: 'MAP' as const,
          price1: def.ep[0] + 650,
          price2: def.ep[1] + 1300,
          price3: def.ep[2] + 1950,
          extraBed: def.extra + 650,
          childPrice: 400,
          cancellationPolicy: 'Non-refundable within 48 hours of check-in.',
          sortOrder: 2,
        },
      ])
      .returning({ id: ratePlans.id, meal: ratePlans.mealPlan });
    types.push({ id: type.id, name: type.name, code: def.code, roomIds: roomRows, plans: planRows });
  }

  // Residency: a smaller second hotel still in setup.
  const [resType] = await db
    .insert(roomTypes)
    .values({ propertyId: residency.id, name: 'Standard Room', code: 'STD', maxAdults: 3, amenities: ['Air conditioning', 'Free Wi-Fi'], color: '#0284c7' })
    .returning();
  await db.insert(rooms).values(['G1', 'G2', 'G3', 'G4', 'G5', 'G6'].map((n, i) => ({ propertyId: residency.id, roomTypeId: resType.id, number: n, floor: 'G', sortOrder: i })));
  await db.insert(ratePlans).values({ propertyId: residency.id, roomTypeId: resType.id, name: 'Room Only', mealPlan: 'EP', price1: 1200, price2: 1400, price3: 1700, extraBed: 400, isDefault: true });

  const seedStart = addDay(today, -25);
  await ensureInventory(db, portico.id, seedStart, addDay(today, INVENTORY_HORIZON_DAYS));
  await ensureInventory(db, residency.id, today, addDay(today, INVENTORY_HORIZON_DAYS));

  /* ── channels (with the Booking.com "Parked business" problem from the screenshot) ─ */
  const channelRows = await db
    .insert(channels)
    .values([
      { propertyId: portico.id, ota: 'makemytrip' as const, hotelCode: 'MMT-208411', credentials: sealSecrets({ accessToken: 'demo-mmt-token' }), status: 'connected' as const, listingStatus: 'open' as const, commissionPercent: 18, lastSyncAt: new Date() },
      { propertyId: portico.id, ota: 'goibibo' as const, hotelCode: 'GI-208411', credentials: sealSecrets({ accessToken: 'demo-mmt-token' }), status: 'connected' as const, listingStatus: 'open' as const, commissionPercent: 18, lastSyncAt: new Date() },
      {
        propertyId: portico.id,
        ota: 'booking_com' as const,
        hotelCode: '9182736',
        credentials: sealSecrets({ apiKey: 'demo-channex-key' }),
        status: 'connected' as const,
        listingStatus: 'parked_business' as const,
        listingMessage: 'Contract or bank details are pending in the Booking.com extranet.',
        commissionPercent: 15,
        lastSyncAt: new Date(Date.now() - 1000 * 60 * 42),
      },
      { propertyId: portico.id, ota: 'agoda' as const, status: 'disconnected' as const },
      { propertyId: portico.id, ota: 'expedia' as const, status: 'disconnected' as const },
      { propertyId: portico.id, ota: 'airbnb' as const, status: 'disconnected' as const },
    ])
    .returning();

  // Room/rate mapping for the connected OTAs.
  for (const ch of channelRows.filter((c) => c.status === 'connected')) {
    await db.insert(channelMappings).values(
      types.flatMap((t) =>
        t.plans.map((plan) => ({ propertyId: portico.id, channelId: ch.id, roomTypeId: t.id, ratePlanId: plan.id, otaRoomId: `${ch.ota.toUpperCase()}-${t.code}`, otaRateId: `${t.code}-${plan.meal}` })),
      ),
    );
  }

  /* ── bookings: ~25 days back to ~30 days ahead, created through the booking service ─ */
  const actorBase: Actor = { propertyId: portico.id, userId: frontDesk.id, businessDate: today, settings: portico.settings, shortCode: 'SRP' };

  type Made = { id: string; checkIn: string; checkOut: string; typeIndex: number; source: string };
  const made: Made[] = [];
  const sources: { source: 'front_desk' | 'walk_in' | 'ota' | 'web' | 'phone' | 'corporate'; channel?: string; weight: number }[] = [
    { source: 'ota', channel: 'makemytrip', weight: 30 },
    { source: 'ota', channel: 'goibibo', weight: 15 },
    { source: 'ota', channel: 'booking_com', weight: 12 },
    { source: 'front_desk', weight: 18 },
    { source: 'walk_in', weight: 10 },
    { source: 'phone', weight: 6 },
    { source: 'web', weight: 5 },
    { source: 'corporate', weight: 4 },
  ];
  const totalWeight = sources.reduce((t, s) => t + s.weight, 0);
  const pickSource = () => {
    let r = rand() * totalWeight;
    for (const s of sources) {
      r -= s.weight;
      if (r <= 0) return s;
    }
    return sources[0];
  };

  async function make(input: {
    guestName: string;
    mobile?: string;
    city?: string;
    checkIn: string;
    nights: number;
    typeIndex: number;
    planIndex?: number;
    adults?: number;
    source?: ReturnType<typeof pickSource>;
    status?: 'confirmed' | 'hold';
    holdUntil?: Date;
    advance?: number;
    otaRef?: string;
  }) {
    const type = types[input.typeIndex];
    const src = input.source ?? pickSource();
    const result = await createBooking(actorBase, {
      source: src.source,
      channel: src.channel ?? null,
      otaRef: input.otaRef ?? (src.source === 'ota' ? `${(src.channel ?? 'OTA').slice(0, 3).toUpperCase()}${Math.floor(1e9 + rand() * 8e9)}` : null),
      status: input.status ?? 'confirmed',
      holdUntil: input.holdUntil ?? null,
      guest: {
        name: input.guestName,
        mobile: input.mobile ?? `9${Math.floor(100000000 + rand() * 899999999)}`,
        city: input.city ?? pick(CITIES),
        email: chance(0.5) ? `${input.guestName.split(' ')[0].toLowerCase()}${Math.floor(rand() * 90 + 10)}@gmail.com` : null,
      },
      checkIn: input.checkIn,
      checkOut: addDay(input.checkIn, input.nights),
      rooms: [
        {
          roomTypeId: type.id,
          ratePlanId: type.plans[input.planIndex ?? (chance(0.6) ? 0 : 1)].id,
          adults: input.adults ?? (chance(0.75) ? 2 : 1),
          children: 0,
          extraBeds: 0,
        },
      ],
      advance: input.advance ? { amount: input.advance, mode: pick(['upi', 'cash', 'card'] as const) } : null,
    });
    made.push({ id: result.id, checkIn: input.checkIn, checkOut: addDay(input.checkIn, input.nights), typeIndex: input.typeIndex, source: src.source });
    return result;
  }

  // Deluxe 103 is out of order and blocked for the next two weeks (AsiaTech shows "Blocked 1").
  // Blocked before bookings are generated, so the booking service never sells it.
  const room103 = types[0].roomIds.find((r) => r.number === '103')!;
  await db.update(rooms).set({ hkStatus: 'out_of_order', oooReason: 'AC compressor replacement', oooUntil: addDay(today, 15) }).where(eq(rooms.id, room103.id));
  for (const d of stayDates(today, addDay(today, 15))) {
    await db
      .update(inventory)
      .set({ blocked: 1 })
      .where(and(eq(inventory.roomTypeId, types[0].id), eq(inventory.date, d)));
  }

  // Specific bookings that appear in the screenshots.
  await make({ guestName: 'Abhishek Singh', city: 'Delhi', checkIn: addDay(today, 22), nights: 1, typeIndex: 0, source: { source: 'ota', channel: 'makemytrip', weight: 0 }, otaRef: 'MMT1159501932' });
  const vivek1 = await make({ guestName: 'Vivek Agrawal', mobile: '9829011223', city: 'Jaipur', checkIn: today, nights: 2, typeIndex: 2, source: { source: 'front_desk', weight: 0 }, advance: 1000 });
  const vivek2 = await make({ guestName: 'Vivek Agewal', mobile: '9829011224', city: 'Jaipur', checkIn: today, nights: 2, typeIndex: 2, source: { source: 'front_desk', weight: 0 } });

  // Fill the hotel day by day.
  for (let offset = -25; offset <= 30; offset++) {
    const day = addDay(today, offset);
    const intensity = offset < 0 ? 0.85 : offset === 0 ? 1 : offset < 7 ? 0.7 : offset < 15 ? 0.45 : 0.25;
    for (let typeIndex = 0; typeIndex < types.length; typeIndex++) {
      const roomsOfType = types[typeIndex].roomIds.length;
      const arrivals = Math.round((roomsOfType / 3) * intensity * (0.5 + rand() * 0.8));
      for (let i = 0; i < arrivals; i++) {
        const nights = pick([1, 1, 1, 2, 2, 3]);
        try {
          await make({
            guestName: `${pick(FIRST)} ${pick(LAST)}`,
            checkIn: day,
            nights,
            typeIndex,
            advance: chance(0.4) ? pick([500, 1000, 1500, 2000]) : undefined,
          });
        } catch {
          // Sold out for these dates; the booking service refused it, exactly as it should.
        }
      }
    }
  }

  // Two holds (one expiring soon) for the Hold Booking screen.
  await make({ guestName: 'Mahesh Khandelwal', city: 'Kota', checkIn: addDay(today, 3), nights: 2, typeIndex: 1, status: 'hold', holdUntil: new Date(Date.now() + 1000 * 60 * 50), source: { source: 'phone', weight: 0 } }).catch(() => null);
  await make({ guestName: 'Seema Rathore', city: 'Udaipur', checkIn: addDay(today, 6), nights: 3, typeIndex: 3, status: 'hold', holdUntil: new Date(Date.now() + 1000 * 60 * 60 * 20), source: { source: 'phone', weight: 0 } }).catch(() => null);

  /* ── move each booking to the state it would be in today ───────────── */
  const occupancy = new Map<string, Set<string>>(); // roomId → occupied dates
  const roomFree = (roomId: string, from: string, to: string) => stayDates(from, to).every((d) => !occupancy.get(roomId)?.has(d));
  const occupy = (roomId: string, from: string, to: string) => {
    const set = occupancy.get(roomId) ?? new Set<string>();
    for (const d of stayDates(from, to)) set.add(d);
    occupancy.set(roomId, set);
  };

  for (const d of stayDates(today, addDay(today, 15))) occupancy.set(room103.id, (occupancy.get(room103.id) ?? new Set()).add(d));

  const sorted = [...made].sort((a, b) => a.checkIn.localeCompare(b.checkIn));
  let noShows = 0;
  for (const b of sorted) {
    const [row] = await db.select().from(bookings).where(eq(bookings.id, b.id));
    if (!row || row.status === 'hold') continue;
    const [br] = await db.select().from(bookingRooms).where(eq(bookingRooms.bookingId, b.id));
    const candidates = types[b.typeIndex].roomIds;
    const free = candidates.find((r) => roomFree(r.id, b.checkIn, b.checkOut));

    const createdAt = new Date(`${addDay(b.checkIn, -Math.floor(rand() * 12) - (b.source === 'walk_in' ? 0 : 1))}T${String(8 + Math.floor(rand() * 12)).padStart(2, '0')}:${String(Math.floor(rand() * 60)).padStart(2, '0')}:00+05:30`);
    await db.update(bookings).set({ createdAt: createdAt > new Date() ? new Date(Date.now() - 3600_000 * 5) : createdAt }).where(eq(bookings.id, b.id));

    const past = b.checkOut <= today;
    const inHouse = b.checkIn < today && b.checkOut >= today;

    if ((past || inHouse) && b.checkIn < today) {
      if (past && noShows < 2 && chance(0.04)) {
        noShows++;
        await db.update(bookings).set({ status: 'no_show', cancelledAt: new Date(`${b.checkIn}T23:30:00+05:30`), cancelReason: 'Guest did not arrive' }).where(eq(bookings.id, b.id));
        await db.update(bookingRooms).set({ status: 'no_show' }).where(eq(bookingRooms.id, br.id));
        await db.execute(sql`UPDATE inventory SET booked = GREATEST(booked - 1, 0) WHERE room_type_id = ${br.roomTypeId} AND date >= ${b.checkIn} AND date < ${b.checkOut}`);
        continue;
      }
      if (!free) continue;
      occupy(free.id, b.checkIn, b.checkOut);
      const checkedInAt = new Date(`${b.checkIn}T${String(12 + Math.floor(rand() * 8)).padStart(2, '0')}:15:00+05:30`);
      // Departing today: still in house until they check out at the desk.
      const departed = b.checkOut < today || (b.checkOut === today && chance(0.4));
      await db
        .update(bookingRooms)
        .set({ roomId: free.id, status: departed ? 'departed' : 'in_house', checkedInAt, checkedOutAt: departed ? new Date(`${b.checkOut}T10:40:00+05:30`) : null })
        .where(eq(bookingRooms.id, br.id));
      await db.update(bookings).set({ status: departed ? 'checked_out' : 'checked_in' }).where(eq(bookings.id, b.id));

      // Post room charges for nights already passed (what Night Audit does) and settle departed stays.
      for (const night of br.nightly.filter((n) => n.date < today)) {
        const split = splitTax(night.amount, night.taxRate);
        await db.insert(folioLines).values({
          propertyId: portico.id,
          bookingId: b.id,
          bookingRoomId: br.id,
          businessDate: night.date,
          type: 'room',
          description: `Room charge · ${types[b.typeIndex].name}`,
          amount: split.taxable,
          taxRate: night.taxRate,
          cgst: split.cgst,
          sgst: split.sgst,
          total: split.total,
          hsnSac: '996311',
          postedBy: null,
        });
      }
      if (departed) {
        const due = round2(row.totalAmount - row.paidAmount);
        if (due > 0) {
          await db.transaction((tx) =>
            insertPayment(tx, { ...actorBase, businessDate: b.checkOut }, { bookingId: b.id, guestId: row.guestId, amount: due, mode: pick(['cash', 'upi', 'upi', 'card']), kind: 'settlement' }),
          );
        }
      }
      continue;
    }

    // Arrivals today and future stays: assign rooms to most, leave some for the "Assign" button.
    if (free && (b.checkIn > today ? chance(0.35) : chance(0.6))) {
      occupy(free.id, b.checkIn, b.checkOut);
      await db.update(bookingRooms).set({ roomId: free.id }).where(eq(bookingRooms.id, br.id));
    }
  }

  // Two of today's arrivals have already checked in.
  const arrivalsToday = await db
    .select({ id: bookings.id, brId: bookingRooms.id, roomId: bookingRooms.roomId })
    .from(bookings)
    .innerJoin(bookingRooms, eq(bookingRooms.bookingId, bookings.id))
    .where(and(eq(bookings.propertyId, portico.id), eq(bookings.checkIn, today), eq(bookings.status, 'confirmed'), sql`${bookingRooms.roomId} IS NOT NULL`))
    .limit(2);
  for (const a of arrivalsToday) {
    await db.update(bookings).set({ status: 'checked_in' }).where(eq(bookings.id, a.id));
    await db.update(bookingRooms).set({ status: 'in_house', checkedInAt: new Date(Date.now() - 3600_000 * 2) }).where(eq(bookingRooms.id, a.brId));
  }

  // One cancellation for the activity log and notifications.
  const future = made.filter((m) => m.checkIn > addDay(today, 4));
  if (future[0]) {
    const [b] = await db.select().from(bookings).where(eq(bookings.id, future[0].id));
    const [br] = await db.select().from(bookingRooms).where(eq(bookingRooms.bookingId, b.id));
    await db.update(bookings).set({ status: 'cancelled', cancelledAt: new Date(), cancelReason: 'Guest changed travel plans' }).where(eq(bookings.id, b.id));
    await db.update(bookingRooms).set({ status: 'cancelled', roomId: null }).where(eq(bookingRooms.id, br.id));
    await db.execute(sql`UPDATE inventory SET booked = GREATEST(booked - 1, 0) WHERE room_type_id = ${br.roomTypeId} AND date >= ${b.checkIn} AND date < ${b.checkOut}`);
  }

  // Two bookings were created today (the "Today's Bookings" tile).
  await db.update(bookings).set({ createdAt: new Date(Date.now() - 3600_000 * 3) }).where(eq(bookings.id, vivek1.id));
  await db.update(bookings).set({ createdAt: new Date(Date.now() - 3600_000 * 2) }).where(eq(bookings.id, vivek2.id));

  /* ── housekeeping ──────────────────────────────────────────────── */
  const departedToday = await db
    .select({ roomId: bookingRooms.roomId })
    .from(bookingRooms)
    .where(and(eq(bookingRooms.propertyId, portico.id), eq(bookingRooms.checkOut, today), eq(bookingRooms.status, 'departed')));
  const dirtyIds = departedToday.map((d) => d.roomId!).filter(Boolean);
  const inHouseRooms = await db
    .select({ roomId: bookingRooms.roomId })
    .from(bookingRooms)
    .where(and(eq(bookingRooms.propertyId, portico.id), eq(bookingRooms.status, 'in_house')));
  for (const r of inHouseRooms.slice(0, 3)) if (r.roomId) dirtyIds.push(r.roomId);
  for (const id of dirtyIds) await db.update(rooms).set({ hkStatus: 'dirty' }).where(eq(rooms.id, id));
  const allRooms = types.flatMap((t) => t.roomIds);
  const inspected = allRooms.filter((r) => !dirtyIds.includes(r.id) && r.id !== room103.id).slice(0, 4);
  for (const r of inspected) await db.update(rooms).set({ hkStatus: 'inspected' }).where(eq(rooms.id, r.id));

  const checklist: { name: string; nameHi: string; category: 'cleaning' | 'amenities' | 'maintenance' }[] = [
    { name: 'Bed sheets changed', nameHi: 'बेडशीट बदली', category: 'cleaning' },
    { name: 'Floor mopped', nameHi: 'फ़र्श पोंछा', category: 'cleaning' },
    { name: 'All mirrors cleaned', nameHi: 'सभी शीशे साफ़', category: 'cleaning' },
    { name: 'Bathroom cleaned', nameHi: 'बाथरूम साफ़', category: 'cleaning' },
    { name: 'Balcony cleaning', nameHi: 'बालकनी सफ़ाई', category: 'cleaning' },
    { name: 'Dustbin emptied', nameHi: 'कूड़ेदान खाली', category: 'cleaning' },
    { name: 'Bath soap', nameHi: 'नहाने का साबुन', category: 'amenities' },
    { name: 'Bath mat', nameHi: 'बाथ मैट', category: 'amenities' },
    { name: 'Towels (2)', nameHi: 'तौलिये (2)', category: 'amenities' },
    { name: 'Drinking water (2 bottles)', nameHi: 'पीने का पानी (2 बोतल)', category: 'amenities' },
    { name: 'Tea/coffee sachets', nameHi: 'चाय/कॉफ़ी पाउच', category: 'amenities' },
    { name: 'AC', nameHi: 'एसी', category: 'maintenance' },
    { name: 'AC remote', nameHi: 'एसी रिमोट', category: 'maintenance' },
    { name: 'TV and remote', nameHi: 'टीवी और रिमोट', category: 'maintenance' },
    { name: 'Balcony sliding door', nameHi: 'बालकनी स्लाइडिंग दरवाज़ा', category: 'maintenance' },
    { name: 'Geyser / hot water', nameHi: 'गीज़र / गर्म पानी', category: 'maintenance' },
    { name: 'Lights and switches', nameHi: 'लाइट और स्विच', category: 'maintenance' },
  ];
  const itemRows = await db
    .insert(hkChecklistItems)
    .values(checklist.map((c, i) => ({ propertyId: portico.id, name: c.name, nameHi: c.nameHi, nameKey: nameKey(c.name), category: c.category, sortOrder: i })))
    .returning();
  for (const [i, roomId] of dirtyIds.entries()) {
    await db.insert(hkTasks).values({ propertyId: portico.id, roomId, type: 'checkout_clean', status: i === 0 ? 'in_progress' : 'pending', assignedTo: i % 2 === 0 ? hk1.id : hk2.id, dueDate: today, priority: i < 2 ? 'high' : 'normal' });
  }
  await db.insert(maintenanceTickets).values([
    { propertyId: portico.id, roomId: room103.id, checklistItemId: itemRows.find((i) => i.name === 'AC')!.id, title: 'AC not cooling', description: 'Compressor replacement booked with vendor.', status: 'in_progress', priority: 'high', reportedBy: hk1.id },
    { propertyId: portico.id, roomId: types[2].roomIds[4].id, checklistItemId: itemRows.find((i) => i.name === 'AC remote')!.id, title: 'AC remote missing', status: 'open', priority: 'normal', reportedBy: hk2.id },
  ]);

  /* ── restaurant ────────────────────────────────────────────────── */
  const [outlet] = await db.insert(posOutlets).values({ propertyId: portico.id, name: 'Portico Family Restaurant', code: 'RST', defaultTaxRate: 5 }).returning();
  const cats = await db
    .insert(posCategories)
    .values(['Breakfast', 'Starters', 'Main Course', 'Breads', 'Beverages', 'Desserts'].map((name, i) => ({ propertyId: portico.id, outletId: outlet.id, name, sortOrder: i })))
    .returning();
  const cat = (name: string) => cats.find((c) => c.name === name)!.id;
  const menu: [string, string, number, boolean][] = [
    ['Breakfast', 'Aloo Paratha with Curd', 120, true],
    ['Breakfast', 'Poha', 80, true],
    ['Breakfast', 'Masala Omelette', 90, false],
    ['Breakfast', 'Continental Breakfast', 250, true],
    ['Starters', 'Paneer Tikka', 260, true],
    ['Starters', 'Veg Manchurian', 210, true],
    ['Starters', 'Chicken Tikka', 320, false],
    ['Main Course', 'Dal Makhani', 220, true],
    ['Main Course', 'Paneer Butter Masala', 260, true],
    ['Main Course', 'Rajasthani Thali', 350, true],
    ['Main Course', 'Butter Chicken', 340, false],
    ['Main Course', 'Jeera Rice', 140, true],
    ['Breads', 'Tandoori Roti', 25, true],
    ['Breads', 'Butter Naan', 50, true],
    ['Beverages', 'Masala Chai', 35, true],
    ['Beverages', 'Cold Coffee', 110, true],
    ['Beverages', 'Fresh Lime Soda', 80, true],
    ['Beverages', 'Mineral Water', 20, true],
    ['Desserts', 'Gulab Jamun (2)', 70, true],
    ['Desserts', 'Ice Cream', 90, true],
  ];
  const items = await db
    .insert(posMenuItems)
    .values(menu.map(([c, name, price, veg], i) => ({ propertyId: portico.id, outletId: outlet.id, categoryId: cat(c), name, price, taxRate: 5, isVeg: veg, sortOrder: i })))
    .returning();
  const tables = await db
    .insert(posTables)
    .values(['T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'T8'].map((name, i) => ({ propertyId: portico.id, outletId: outlet.id, name, seats: i < 4 ? 4 : 2, sortOrder: i })))
    .returning();

  const inHouse = await db
    .select({ bookingId: bookingRooms.bookingId, roomId: bookingRooms.roomId, guestName: guests.name })
    .from(bookingRooms)
    .innerJoin(bookings, eq(bookings.id, bookingRooms.bookingId))
    .innerJoin(guests, eq(guests.id, bookings.guestId))
    .where(and(eq(bookingRooms.propertyId, portico.id), eq(bookingRooms.status, 'in_house')));

  let orderSerial = 0;
  let billSerial = 0;
  async function posOrder(day: string, type: 'dine_in' | 'take_away' | 'room' | 'in_house', mode: 'cash' | 'upi' | 'card' | 'room_transfer' | 'complimentary' | null, lines: [number, number][], guest?: (typeof inHouse)[number]) {
    orderSerial++;
    const subtotal = round2(lines.reduce((t, [idx, qty]) => t + items[idx].price * qty, 0));
    const split = splitTax(subtotal, 5);
    const settled = mode !== null;
    const [order] = await db
      .insert(posOrders)
      .values({
        propertyId: portico.id,
        outletId: outlet.id,
        orderNo: `KOT${String(orderSerial).padStart(5, '0')}`,
        billNo: settled ? `RST/${financialYear(day).slice(2)}/${String(++billSerial).padStart(5, '0')}` : null,
        orderType: type,
        tableId: type === 'dine_in' ? pick(tables).id : null,
        bookingId: guest?.bookingId ?? null,
        roomId: guest?.roomId ?? null,
        guestName: guest?.guestName ?? null,
        status: settled ? 'settled' : 'open',
        subtotal,
        cgst: split.cgst,
        sgst: split.sgst,
        total: split.total,
        settlementMode: mode,
        settledAt: settled ? new Date(`${day}T${String(9 + Math.floor(rand() * 12)).padStart(2, '0')}:30:00+05:30`) : null,
        businessDate: day,
        kotCount: 1,
        createdBy: restaurantUser.id,
        createdAt: new Date(`${day}T${String(8 + Math.floor(rand() * 12)).padStart(2, '0')}:10:00+05:30`),
      })
      .returning();
    await db.insert(posOrderItems).values(
      lines.map(([idx, qty]) => ({
        propertyId: portico.id,
        orderId: order.id,
        menuItemId: items[idx].id,
        name: items[idx].name,
        quantity: qty,
        price: items[idx].price,
        taxRate: 5,
        amount: round2(items[idx].price * qty),
        kotNo: 1,
        status: 'sent' as const,
      })),
    );
    if (mode === 'room_transfer' && guest) {
      await db.insert(folioLines).values({
        propertyId: portico.id,
        bookingId: guest.bookingId,
        businessDate: day,
        type: 'pos',
        description: `Restaurant bill ${order.billNo}`,
        amount: subtotal,
        taxRate: 5,
        cgst: split.cgst,
        sgst: split.sgst,
        total: split.total,
        hsnSac: '996331',
        posOrderId: order.id,
      });
    }
  }

  for (let offset = -19; offset <= -1; offset++) {
    const day = addDay(today, offset);
    const count = 4 + Math.floor(rand() * 6);
    for (let i = 0; i < count; i++) {
      const lines: [number, number][] = [[Math.floor(rand() * items.length), 1 + Math.floor(rand() * 2)], [Math.floor(rand() * items.length), 1]];
      await posOrder(day, pick(['dine_in', 'dine_in', 'take_away', 'room']), pick(['cash', 'upi', 'upi', 'card']), lines);
    }
  }
  // Today: 2 settled orders and 2 room transfers to in-house guests.
  await posOrder(today, 'dine_in', 'upi', [[14, 2], [1, 1]]);
  await posOrder(today, 'take_away', 'cash', [[15, 1]]);
  if (inHouse[0]) await posOrder(today, 'room', 'room_transfer', [[0, 2], [14, 2]], inHouse[0]);
  if (inHouse[1]) await posOrder(today, 'room', 'room_transfer', [[9, 2], [13, 4], [17, 2]], inHouse[1]);
  await posOrder(today, 'dine_in', null, [[4, 1], [13, 3], [8, 1]]);

  // Number series continue after the seeded orders.
  await db.insert(counters).values([
    { propertyId: portico.id, key: 'kot', value: orderSerial },
    { propertyId: portico.id, key: `posbill:RST:${financialYear(today)}`, value: billSerial },
  ]);

  /* ── money ─────────────────────────────────────────────────────── */
  await db.insert(pettyCash).values([
    { propertyId: portico.id, entryDate: addDay(today, -6), type: 'opening', amount: 10000, description: 'Opening balance for the month', createdBy: accountant.id, approvedBy: owner.id },
    { propertyId: portico.id, entryDate: addDay(today, -5), type: 'expense', amount: 450, category: 'Housekeeping supplies', paidTo: 'Gupta General Store', description: 'Phenyl, brooms, garbage bags', createdBy: frontDesk.id, approvedBy: manager.id },
    { propertyId: portico.id, entryDate: addDay(today, -3), type: 'expense', amount: 1200, category: 'Repairs', paidTo: 'Ramesh Electrician', description: 'Switchboard repair room 208', createdBy: frontDesk.id, approvedBy: manager.id },
    { propertyId: portico.id, entryDate: addDay(today, -2), type: 'top_up', amount: 5000, description: 'Top-up from main cash', createdBy: accountant.id, approvedBy: owner.id },
    { propertyId: portico.id, entryDate: addDay(today, -1), type: 'expense', amount: 320, category: 'Guest amenities', paidTo: 'Local vendor', description: 'Drinking water bottles (2 crates)', createdBy: frontDesk.id, approvedBy: manager.id },
    { propertyId: portico.id, entryDate: today, type: 'expense', amount: 180, category: 'Transport', paidTo: 'Auto rickshaw', description: 'Linen to laundry', createdBy: frontDesk.id, status: 'pending' },
  ]);

  // A pending payment link (Request Money).
  const [someFuture] = made.filter((m) => m.checkIn > today && m.source !== 'ota');
  if (someFuture) {
    const [b] = await db.select().from(bookings).where(eq(bookings.id, someFuture.id));
    await db.insert(payments).values({
      propertyId: portico.id,
      bookingId: b.id,
      guestId: b.guestId,
      mode: 'link',
      kind: 'request',
      amount: round2(b.totalAmount / 2),
      purpose: 'Advance for confirmed booking',
      status: 'pending',
      linkId: 'plink_demo_001',
      linkUrl: `${process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'}/pay/plink_demo_001`,
      linkExpiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 2),
      businessDate: today,
      receivedBy: frontDesk.id,
    });
  }

  /* ── channels: sync log, promotions, reviews ─────────────────────── */
  const [mmt, gi, bdc] = channelRows;
  await db.insert(syncLogs).values([
    { propertyId: portico.id, channelId: mmt.id, direction: 'push', kind: 'availability', message: `Push availability ${today} → ${addDay(today, 30)}`, status: 'success', processedAt: new Date(Date.now() - 60_000 * 12), response: { ok: true } },
    { propertyId: portico.id, channelId: gi.id, direction: 'push', kind: 'rates', message: `Push rates ${today} → ${addDay(today, 30)}`, status: 'success', processedAt: new Date(Date.now() - 60_000 * 11), response: { ok: true } },
    { propertyId: portico.id, channelId: bdc.id, direction: 'push', kind: 'availability', message: `Push availability ${today} → ${addDay(today, 30)}`, status: 'failed', retries: 3, processedAt: new Date(Date.now() - 60_000 * 42), response: { error: 'Property is parked (business). Updates are not accepted.' } },
    { propertyId: portico.id, channelId: mmt.id, direction: 'webhook', kind: 'booking', message: 'New booking MMT1159501932 (Abhishek Singh)', status: 'success', processedAt: new Date(Date.now() - 60_000 * 90) },
  ]);

  await db.insert(promotions).values([
    { propertyId: portico.id, name: 'Early bird 10%', type: 'early_bird', discountType: 'percent', value: 10, conditionValue: 15, channels: ['makemytrip', 'goibibo', 'booking_com', 'web'], isActive: true, pushedAt: new Date(Date.now() - 86400_000 * 4) },
    { propertyId: portico.id, name: 'Weekend last-minute 15%', type: 'last_minute', discountType: 'percent', value: 15, conditionValue: 2, channels: ['makemytrip', 'goibibo'], isActive: true },
    { propertyId: portico.id, name: 'Stay 3, save 12%', type: 'long_stay', discountType: 'percent', value: 12, conditionValue: 3, channels: ['makemytrip', 'goibibo', 'booking_com'], isActive: false },
    { propertyId: portico.id, name: 'Direct booking coupon', type: 'coupon', discountType: 'flat', value: 300, couponCode: 'PORTICO300', channels: ['web'], isActive: true },
  ]);

  await db.insert(reviews).values([
    { propertyId: portico.id, channel: 'makemytrip', reviewerName: 'Ankit S.', rating: 4.5, title: 'Great location near the station', text: 'Clean rooms, polite staff and the breakfast parathas were excellent. Walking distance from Jaipur Junction.', stayDate: addDay(today, -6), createdAt: new Date(Date.now() - 86400_000 * 4) },
    { propertyId: portico.id, channel: 'goibibo', reviewerName: 'Pooja M.', rating: 3, title: 'Good value, AC was noisy', text: 'Value for money. The AC in our room was noisy at night, but the front desk changed our room quickly.', stayDate: addDay(today, -9), createdAt: new Date(Date.now() - 86400_000 * 7) },
    { propertyId: portico.id, channel: 'booking_com', reviewerName: 'James W.', rating: 4.2, title: 'Friendly and helpful', text: 'Staff helped us book a cab to Amber Fort. Room was spacious. Wi-Fi a bit slow.', stayDate: addDay(today, -12), reply: 'Thank you James! We have upgraded our Wi-Fi since your stay. Hope to welcome you again.', repliedAt: new Date(Date.now() - 86400_000 * 8), createdAt: new Date(Date.now() - 86400_000 * 10) },
    { propertyId: portico.id, channel: 'makemytrip', reviewerName: 'Rohit K.', rating: 5, title: 'Perfect family stay', text: 'Family room was big enough for 4 of us. Restaurant food was tasty and reasonably priced.', stayDate: addDay(today, -3), createdAt: new Date(Date.now() - 86400_000 * 1) },
    { propertyId: portico.id, channel: 'agoda', reviewerName: 'Meena T.', rating: 2.5, title: 'Check-in was slow', text: 'We waited 25 minutes at check-in. Room was fine.', stayDate: addDay(today, -15), createdAt: new Date(Date.now() - 86400_000 * 13) },
  ]);

  /* ── platform: tasks, system updates, notifications, activity ─────── */
  // Bookings created above raised their own notifications; keep only a curated set for the demo.
  await db.delete(notifications);
  await db.insert(tasks).values({
    propertyId: portico.id,
    type: 'ota_listing',
    title: 'Property not bookable on Booking.com. Reason: Parked business',
    detail: 'Booking.com has parked the listing until the contract or bank details are completed in the extranet.',
    severity: 'danger',
    entityType: 'channel',
    entityId: bdc.id,
    actionLabel: 'Fix listing',
    actionHref: `/channels?channel=${bdc.id}`,
  });

  await db.insert(systemUpdates).values([
    { title: 'Welcome to the new AsiaTech Hotel OS', body: 'Fewer menus, one search box (press Ctrl + K), and every alert now has a button. Your old screens are all still here under clearer names.', tag: 'New', publishedAt: new Date() },
    { title: 'Zero-booking alerts', body: 'Receive emails if the property gets zero bookings for the past 3 months. Frequency: monthly. Turn it on under Settings → Notifications.', tag: 'Alerts', publishedAt: new Date('2026-11-01T10:00:00+05:30') },
    { title: 'Hindi on every screen', body: 'Switch between English and हिंदी from the top bar. Housekeeping staff can now update rooms from their phone.', tag: 'Language', publishedAt: new Date('2026-11-05T10:00:00+05:30') },
    { title: 'One-click promotions on Goibibo and Booking.com', body: 'Update discounts (Promotions) on Goibibo and Booking.com from a single click.', tag: 'Channels', publishedAt: new Date('2024-01-09T10:00:00+05:30') },
  ]);

  const recentOta = await db
    .select({ id: bookings.id, bookingNo: bookings.bookingNo, channel: bookings.channel, name: guests.name, checkIn: bookings.checkIn })
    .from(bookings)
    .innerJoin(guests, eq(guests.id, bookings.guestId))
    .where(and(eq(bookings.propertyId, portico.id), eq(bookings.source, 'ota')))
    .orderBy(sql`${bookings.checkIn} DESC`)
    .limit(7);
  const otaNames: Record<string, string> = { makemytrip: 'MakeMyTrip', goibibo: 'Goibibo', booking_com: 'Booking.com' };
  await db.insert(notifications).values([
    ...recentOta.map((b, i) => ({
      propertyId: portico.id,
      type: 'booking_new' as const,
      title: `New ${otaNames[b.channel ?? ''] ?? 'OTA'} booking ${b.bookingNo}`,
      body: `${b.name} · arriving ${b.checkIn}`,
      href: `/front-desk/bookings/${b.id}`,
      createdAt: new Date(Date.now() - 1000 * 60 * (20 + i * 95)),
    })),
    { propertyId: portico.id, type: 'sync_error' as const, title: 'Booking.com sync failed', body: 'Listing is parked (business). Updates are not accepted.', href: '/channels/sync-log', createdAt: new Date(Date.now() - 1000 * 60 * 42) },
    { propertyId: portico.id, type: 'booking_cancelled' as const, title: 'Booking cancelled', body: 'Guest changed travel plans', href: '/front-desk/bookings?status=cancelled', createdAt: new Date(Date.now() - 1000 * 60 * 300) },
    { propertyId: portico.id, type: 'housekeeping' as const, title: 'Room 103 is out of order', body: 'AC compressor replacement', href: '/housekeeping/tickets', createdAt: new Date(Date.now() - 1000 * 60 * 600) },
  ]);

  await db.insert(activityLog).values([
    { propertyId: portico.id, userId: manager.id, entityType: 'inventory', action: 'block', summary: `Blocked 1 Deluxe Double Bed Room from ${today} for 15 days (room 103 out of order)` },
    { propertyId: portico.id, userId: owner.id, entityType: 'promotion', action: 'create', summary: 'Created promotion "Early bird 10%" and pushed to MakeMyTrip, Goibibo, Booking.com' },
  ]);

  // Pushes queued while generating history are already "sent".
  await db.execute(sql`UPDATE sync_logs SET status = 'success', processed_at = created_at, response = '{"message":"Accepted (seed)"}'::jsonb WHERE status = 'queued'`);

  const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(bookings);
  const [{ guestCount }] = await db.select({ guestCount: sql<number>`count(*)::int` }).from(guests);
  console.log(`✔ Seeded Shri Ram Portico: ${types.reduce((t, x) => t + x.roomIds.length, 0)} rooms, ${count} bookings, ${guestCount} guests`);
  console.log(`  Sign in with owner@shriramportico.in / ${PASSWORD}`);
  await pool.end();
}

main().catch(async (error) => {
  console.error(error);
  await pool.end();
  process.exit(1);
});
