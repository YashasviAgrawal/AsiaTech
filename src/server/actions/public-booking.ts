'use server';

import { and, asc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/db';
import { promotions, properties, ratePlans, roomTypes } from '@/db/schema';
import { nightsBetween, todayIST } from '@/lib/format';
import { runAction } from '../action';
import { UserError } from '../errors';
import { systemActor } from '../services/actor';
import { createBooking } from '../services/bookings';
import { getStayAvailability } from '../services/inventory';
import { quoteStay } from '../services/pricing';
import { requestMoney } from '../services/money';
import { sendMessage } from '../services/messaging';
import { bookingConfirmationText } from '../services/templates';
import { bestPromotion } from '../services/promotions';

/*
 * Public booking engine actions. No login: everything is looked up by the property slug and validated strictly.
 * In production, put these behind rate limiting / bot protection at the edge.
 */

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

async function propertyBySlug(slug: string) {
  const [p] = await db.select().from(properties).where(eq(properties.slug, slug));
  if (!p || p.status === 'suspended') throw new UserError('This hotel is not taking online bookings.');
  return p;
}

/**
 * The discount a web guest gets: the bigger of their coupon and the best automatic promotion
 * (early bird, last minute, long stay). Worked out on the server, never trusted from the browser.
 */
async function webDiscount(
  propertyId: string,
  input: { checkIn: string; checkOut: string; roomTypeId: string; coupon?: string | null; estimatedTotal: number },
): Promise<{ type: 'percent' | 'flat'; value: number; name: string } | null> {
  const coupon = await couponDiscount(propertyId, input.coupon);
  const promo = await bestPromotion(propertyId, { checkIn: input.checkIn, checkOut: input.checkOut, bookedOn: todayIST(), channel: 'web', roomTypeId: input.roomTypeId, estimatedTotal: input.estimatedTotal });
  const value = (d: { type: 'percent' | 'flat'; value: number } | null) => (!d ? 0 : d.type === 'percent' ? (input.estimatedTotal * d.value) / 100 : d.value);
  const candidates = [coupon && { ...coupon }, promo && { ...promo.discount, name: promo.name }].filter(Boolean) as { type: 'percent' | 'flat'; value: number; name: string }[];
  return candidates.sort((a, b) => value(b) - value(a))[0] ?? null;
}

async function couponDiscount(propertyId: string, code?: string | null) {
  if (!code) return null;
  const [promo] = await db
    .select()
    .from(promotions)
    .where(and(eq(promotions.propertyId, propertyId), eq(promotions.isActive, true), eq(promotions.type, 'coupon'), sql`upper(${promotions.couponCode}) = ${code.trim().toUpperCase()}`));
  if (!promo || !promo.channels.includes('web')) throw new UserError('That coupon code is not valid.');
  return { type: promo.discountType, value: promo.value, name: promo.name };
}

export async function searchStayAction(input: { slug: string; checkIn: string; checkOut: string; adults: number; coupon?: string | null }) {
  return runAction(async () => {
    const data = z.object({ slug: z.string().min(2), checkIn: day, checkOut: day, adults: z.number().int().min(1).max(12), coupon: z.string().max(20).nullable().optional() }).parse(input);
    const nights = nightsBetween(data.checkIn, data.checkOut);
    if (data.checkIn < todayIST()) throw new UserError('Choose a check-in date from today.');
    if (nights <= 0 || nights > 30) throw new UserError('Choose between 1 and 30 nights.');
    const p = await propertyBySlug(data.slug);
    await couponDiscount(p.id, data.coupon); // validates the code early with a clear message
    const availability = await getStayAvailability(p.id, data.checkIn, data.checkOut);
    const types = await db.select().from(roomTypes).where(and(eq(roomTypes.propertyId, p.id), eq(roomTypes.isActive, true))).orderBy(asc(roomTypes.sortOrder));
    const plans = await db.select().from(ratePlans).where(and(eq(ratePlans.propertyId, p.id), eq(ratePlans.isActive, true))).orderBy(asc(ratePlans.sortOrder));

    const results = [];
    for (const type of types) {
      const avail = availability.get(type.id);
      const free = avail && !avail.stopSell ? avail.available : 0;
      const roomsNeeded = Math.ceil(data.adults / Math.max(1, type.maxAdults));
      const adultsPerRoom = Math.min(type.maxAdults, Math.ceil(data.adults / roomsNeeded));
      const options = [];
      for (const plan of plans.filter((pl) => pl.roomTypeId === type.id)) {
        const rooms = Array.from({ length: roomsNeeded }, () => ({ roomTypeId: type.id, ratePlanId: plan.id, adults: adultsPerRoom, children: 0, extraBeds: 0 }));
        const base = await quoteStay(db, p.id, p.settings, { checkIn: data.checkIn, checkOut: data.checkOut, rooms });
        const discount = await webDiscount(p.id, { checkIn: data.checkIn, checkOut: data.checkOut, roomTypeId: type.id, coupon: data.coupon, estimatedTotal: base.roomAmount });
        const q = discount ? await quoteStay(db, p.id, p.settings, { checkIn: data.checkIn, checkOut: data.checkOut, rooms, discount }) : base;
        options.push({
          ratePlanId: plan.id,
          name: plan.name,
          mealPlan: plan.mealPlan,
          policy: plan.cancellationPolicy,
          total: q.totalAmount,
          tax: q.taxAmount,
          discount: q.discountAmount,
          promotion: discount && q.discountAmount > 0 ? discount.name : null,
          restriction: q.restrictions[0] ? capitalise(q.restrictions[0].message.replace(`${type.name} · ${plan.name} `, '')) : null,
          perNight: Math.round(q.totalAmount / nights / roomsNeeded),
        });
      }
      results.push({
        id: type.id,
        name: type.name,
        description: type.description,
        amenities: type.amenities,
        photos: type.photos,
        maxAdults: type.maxAdults,
        sizeSqft: type.sizeSqft,
        bedType: type.bedType,
        color: type.color,
        available: free,
        roomsNeeded,
        adultsPerRoom,
        options,
      });
    }
    return { nights, results, coupon: data.coupon ? data.coupon.toUpperCase() : null };
  });
}

const bookSchema = z.object({
  slug: z.string().min(2),
  checkIn: day,
  checkOut: day,
  roomTypeId: z.string().uuid(),
  ratePlanId: z.string().uuid(),
  rooms: z.number().int().min(1).max(5),
  adultsPerRoom: z.number().int().min(1).max(6),
  coupon: z.string().max(20).nullable().optional(),
  guest: z.object({
    name: z.string().trim().min(2, 'Enter your full name'),
    mobile: z.string().trim().regex(/^[6-9]\d{9}$/, 'Enter a 10-digit Indian mobile number'),
    email: z.string().trim().email('Enter a valid email'),
    city: z.string().trim().max(60).optional().nullable(),
  }),
  specialRequests: z.string().max(500).optional().nullable(),
  payNow: z.boolean(),
});

export async function publicBookAction(input: z.input<typeof bookSchema>) {
  return runAction(async () => {
    const data = bookSchema.parse(input);
    if (data.checkIn < todayIST()) throw new UserError('Check-in cannot be in the past.');
    const p = await propertyBySlug(data.slug);
    const rooms = Array.from({ length: data.rooms }, () => ({ roomTypeId: data.roomTypeId, ratePlanId: data.ratePlanId, adults: data.adultsPerRoom, children: 0, extraBeds: 0 }));
    const base = await quoteStay(db, p.id, p.settings, { checkIn: data.checkIn, checkOut: data.checkOut, rooms });
    const discount = await webDiscount(p.id, { checkIn: data.checkIn, checkOut: data.checkOut, roomTypeId: data.roomTypeId, coupon: data.coupon, estimatedTotal: base.roomAmount });
    const actor = { ...(await systemActor(p.id)), userId: null };
    const result = await createBooking(actor, {
      source: 'web',
      guest: { name: data.guest.name, mobile: data.guest.mobile, email: data.guest.email, city: data.guest.city ?? null },
      checkIn: data.checkIn,
      checkOut: data.checkOut,
      rooms,
      discount: discount ? { type: discount.type, value: discount.value } : null,
      specialRequests: data.specialRequests ?? null,
      internalNotes: discount ? `Booking engine discount: ${discount.name}` : null,
    });
    const [type] = await db.select({ name: roomTypes.name }).from(roomTypes).where(eq(roomTypes.id, data.roomTypeId));
    const [plan] = await db.select({ mealPlan: ratePlans.mealPlan }).from(ratePlans).where(eq(ratePlans.id, data.ratePlanId));
    await sendMessage({
      propertyId: p.id,
      channel: 'whatsapp',
      to: data.guest.mobile,
      template: 'booking_confirmation',
      body: bookingConfirmationText({
        hotelName: p.name,
        hotelPhone: p.phone,
        guestName: data.guest.name,
        bookingNo: result.bookingNo,
        checkIn: data.checkIn,
        checkOut: data.checkOut,
        checkInTime: p.checkInTime,
        rooms: Array.from({ length: data.rooms }, () => ({ typeName: type.name, mealPlan: plan.mealPlan })),
        total: result.totalAmount,
        paid: 0,
        status: 'confirmed',
      }),
      entityType: 'booking',
      entityId: result.id,
    });
    let paymentUrl: string | null = null;
    if (data.payNow) {
      const link = await requestMoney(
        { ...actor, hotelName: p.name },
        { bookingId: result.id, name: data.guest.name, mobile: data.guest.mobile, email: data.guest.email, amount: result.totalAmount, purpose: `Booking ${result.bookingNo}`, channel: 'none', expiresInHours: 2 },
      );
      paymentUrl = link.url;
    }
    return { bookingNo: result.bookingNo, total: result.totalAmount, paymentUrl };
  });
}

function capitalise(text: string) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
