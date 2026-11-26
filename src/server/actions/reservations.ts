'use server';

import { revalidatePath } from 'next/cache';
import { and, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/db';
import { BOOKING_SOURCES, bookingRooms, bookings, guests, ID_TYPES, PAYMENT_MODES, roomTypes } from '@/db/schema';
import { formatDateTime, formatINR, nightsBetween } from '@/lib/format';
import { nameKey, normaliseMobile } from '@/lib/utils';
import { actionContext } from '../context';
import { runAction } from '../action';
import { UserError } from '../errors';
import { actorFromContext } from '../services/actor';
import { confirmHold, createBooking, extendHold, restoreBooking } from '../services/bookings';
import { cancelWithAdvance, settleUnstayedAdvance } from '../services/cancellation';
import { findDuplicateGuests, lookupGuests, mergeGuests } from '../services/guests';
import { getStayAvailability } from '../services/inventory';
import { quote } from '../services/pricing';
import { modifyBooking, previewModification } from '../services/modify';
import { sendMessage } from '../services/messaging';
import { bookingConfirmationText } from '../services/templates';

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Pick a date');

const roomLine = z.object({
  roomTypeId: z.string().uuid(),
  ratePlanId: z.string().uuid(),
  adults: z.number().int().min(1).max(10),
  children: z.number().int().min(0).max(10),
  extraBeds: z.number().int().min(0).max(5),
  rateOverride: z.number().min(0).max(1_000_000).nullable().optional(),
  roomId: z.string().uuid().nullable().optional(),
});

const discount = z.object({ type: z.enum(['percent', 'flat']), value: z.number().min(0) }).nullable().optional();

export async function availabilityAction(checkIn: string, checkOut: string) {
  return runAction(async () => {
    const ctx = await actionContext('bookings.view');
    if (nightsBetween(checkIn, checkOut) <= 0) throw new UserError('Check-out must be after check-in.');
    const map = await getStayAvailability(ctx.propertyId, checkIn, checkOut);
    return Object.fromEntries(map);
  });
}

const quoteSchema = z.object({ checkIn: day, checkOut: day, rooms: z.array(roomLine).min(1), discount });

export async function quoteAction(input: z.input<typeof quoteSchema>) {
  return runAction(async () => {
    const ctx = await actionContext('bookings.view');
    const data = quoteSchema.parse(input);
    return quote(ctx.propertyId, ctx.property.settings, data);
  });
}

export async function lookupGuestAction(query: string) {
  return runAction(async () => {
    const ctx = await actionContext('bookings.view');
    return lookupGuests(ctx.propertyId, query);
  });
}

export async function duplicatesAction(name: string, mobile: string | null, excludeId?: string) {
  return runAction(async () => {
    const ctx = await actionContext('bookings.view');
    return findDuplicateGuests(ctx.propertyId, name, mobile, excludeId);
  });
}

const reservationSchema = z
  .object({
    source: z.enum(BOOKING_SOURCES),
    checkIn: day,
    checkOut: day,
    arrivalTime: z.string().max(10).optional().nullable(),
    rooms: z.array(roomLine).min(1, 'Add at least one room'),
    guest: z.object({
      id: z.string().uuid().nullable().optional(),
      name: z.string().trim().min(2, 'Enter the guest name'),
      mobile: z
        .string()
        .trim()
        .regex(/^(\+?91)?[\s-]?[6-9]\d{4}[\s-]?\d{5}$|^$/, 'Enter a valid 10-digit mobile number')
        .optional()
        .nullable(),
      email: z.string().trim().email('Enter a valid email').or(z.literal('')).optional().nullable(),
      city: z.string().trim().max(80).optional().nullable(),
      nationality: z.string().trim().max(60).optional().nullable(),
      company: z.string().trim().max(120).optional().nullable(),
      companyGstin: z.string().trim().max(15).optional().nullable(),
      idType: z.enum(ID_TYPES).optional().nullable(),
      idNumber: z.string().trim().max(30).optional().nullable(),
    }),
    discount,
    advance: z.object({ amount: z.number().min(0), mode: z.enum(PAYMENT_MODES), reference: z.string().max(60).optional().nullable() }).nullable().optional(),
    billTo: z.enum(['guest', 'company', 'agent']).default('guest'),
    billToName: z.string().trim().max(120).optional().nullable(),
    specialRequests: z.string().trim().max(1000).optional().nullable(),
    internalNotes: z.string().trim().max(1000).optional().nullable(),
    hold: z.object({ until: z.string() }).nullable().optional(),
    sendWhatsApp: z.boolean().default(true),
    allowOverbook: z.boolean().default(false),
  })
  .refine((v) => v.checkOut > v.checkIn, { message: 'Check-out must be after check-in', path: ['checkOut'] });

export type ReservationInput = z.input<typeof reservationSchema>;

export async function createReservationAction(input: ReservationInput) {
  return runAction(async () => {
    const ctx = await actionContext('bookings.create');
    const data = reservationSchema.parse(input);
    if (data.allowOverbook && !['owner', 'manager'].includes(ctx.role.key)) throw new UserError('Only a manager can overbook.');
    if (data.checkIn < ctx.property.businessDate) throw new UserError('Check-in cannot be before the business date.');
    const holdUntil = data.hold ? new Date(data.hold.until) : null;
    if (holdUntil && (Number.isNaN(holdUntil.getTime()) || holdUntil.getTime() <= Date.now())) throw new UserError('Hold time must be in the future.');

    const actor = actorFromContext(ctx);
    const result = await createBooking(actor, {
      source: data.source,
      status: holdUntil ? 'hold' : 'confirmed',
      holdUntil,
      guest: { ...data.guest, email: data.guest.email || null },
      checkIn: data.checkIn,
      checkOut: data.checkOut,
      rooms: data.rooms,
      discount: data.discount,
      advance: data.advance && data.advance.amount > 0 ? data.advance : null,
      billTo: data.billTo,
      billToName: data.billTo === 'company' ? data.billToName || data.guest.company || null : data.billToName || null,
      arrivalTime: data.arrivalTime,
      specialRequests: data.specialRequests,
      internalNotes: data.internalNotes,
      allowOverbook: data.allowOverbook,
    });

    if (data.sendWhatsApp && data.guest.mobile) {
      const typeRows = await db.select({ id: roomTypes.id, name: roomTypes.name }).from(roomTypes).where(inArray(roomTypes.id, data.rooms.map((r) => r.roomTypeId)));
      const brs = await db.select({ roomTypeId: bookingRooms.roomTypeId, mealPlan: bookingRooms.mealPlan }).from(bookingRooms).where(eq(bookingRooms.bookingId, result.id));
      await sendMessage({
        propertyId: ctx.propertyId,
        channel: 'whatsapp',
        to: data.guest.mobile,
        template: holdUntil ? 'booking_hold' : 'booking_confirmation',
        body: bookingConfirmationText({
          hotelName: ctx.property.name,
          guestName: data.guest.name,
          bookingNo: result.bookingNo,
          checkIn: data.checkIn,
          checkOut: data.checkOut,
          checkInTime: ctx.property.checkInTime,
          rooms: brs.map((b) => ({ typeName: typeRows.find((t) => t.id === b.roomTypeId)?.name ?? 'Room', mealPlan: b.mealPlan })),
          total: result.totalAmount,
          paid: data.advance?.amount ?? 0,
          status: holdUntil ? 'hold' : 'confirmed',
          holdUntil: holdUntil ? formatDateTime(holdUntil) : null,
        }),
        entityType: 'booking',
        entityId: result.id,
        sentBy: ctx.userId,
      });
    }

    revalidatePath('/dashboard');
    revalidatePath('/front-desk', 'layout');
    revalidatePath('/rooms/calendar');
    return result;
  });
}

/* ───────────────────────── booking lifecycle ───────────────────────── */

/** What to do with money already paid on a booking that is being cancelled (or is cancelled). */
const advanceDecision = z.object({
  keep: z.number().min(0).max(10_000_000),
  refund: z.number().min(0).max(10_000_000),
  mode: z.enum(PAYMENT_MODES),
  reference: z.string().trim().max(80).nullable().optional(),
});

function advanceMessage(bookingNo: string, done: string, money: { refunded: number; kept: number; invoiceNo: string | null } | null) {
  const parts = [`${bookingNo} ${done}`];
  if (money?.refunded) parts.push(`${formatINR(money.refunded)} refunded`);
  if (money?.kept) parts.push(`${formatINR(money.kept)} kept · invoice ${money.invoiceNo}`);
  return parts.join(' · ');
}

export async function cancelBookingAction(bookingId: string, reason: string, decision?: z.input<typeof advanceDecision> | null) {
  return runAction(async () => {
    const ctx = await actionContext('bookings.cancel');
    if (decision && !ctx.can('money.manage')) throw new UserError('Only staff who handle money can refund or keep an advance.');
    const result = await cancelWithAdvance(actorFromContext(ctx), bookingId, reason, {}, decision ? advanceDecision.parse(decision) : null);
    revalidatePath('/', 'layout');
    return { ...result, message: advanceMessage(result.bookingNo, 'cancelled', result.money) };
  });
}

export async function noShowAction(bookingId: string, decision?: z.input<typeof advanceDecision> | null) {
  return runAction(async () => {
    const ctx = await actionContext('bookings.cancel');
    if (decision && !ctx.can('money.manage')) throw new UserError('Only staff who handle money can refund or keep an advance.');
    const [b] = await db.select({ checkIn: bookings.checkIn }).from(bookings).where(and(eq(bookings.id, bookingId), eq(bookings.propertyId, ctx.propertyId)));
    if (!b) throw new UserError('Booking not found.');
    if (b.checkIn > ctx.property.businessDate) throw new UserError('A guest can only be a no-show on or after the arrival date.');
    const result = await cancelWithAdvance(actorFromContext(ctx), bookingId, 'Guest did not arrive', { status: 'no_show' }, decision ? advanceDecision.parse(decision) : null);
    revalidatePath('/', 'layout');
    return { ...result, message: advanceMessage(result.bookingNo, 'marked no-show', result.money) };
  });
}

/** Refund or keep the advance of a booking that was cancelled earlier (or by an OTA, or at Night Audit). */
export async function settleAdvanceAction(bookingId: string, decision: z.input<typeof advanceDecision>) {
  return runAction(async () => {
    const ctx = await actionContext('money.manage');
    const result = await settleUnstayedAdvance(actorFromContext(ctx), bookingId, advanceDecision.parse(decision));
    revalidatePath('/', 'layout');
    return { ...result, message: advanceMessage(result.bookingNo, 'settled', result) };
  });
}

export async function restoreBookingAction(bookingId: string) {
  return runAction(async () => {
    const ctx = await actionContext('bookings.cancel');
    const result = await restoreBooking(actorFromContext(ctx), bookingId);
    revalidatePath('/', 'layout');
    return result;
  }, 'Booking restored.');
}

export async function confirmHoldAction(bookingId: string) {
  return runAction(async () => {
    const ctx = await actionContext('bookings.create');
    const result = await confirmHold(actorFromContext(ctx), bookingId);
    revalidatePath('/', 'layout');
    return result;
  });
}

export async function extendHoldAction(bookingId: string, hours: number) {
  return runAction(async () => {
    const ctx = await actionContext('bookings.create');
    const [b] = await db.select({ holdUntil: bookings.holdUntil }).from(bookings).where(and(eq(bookings.id, bookingId), eq(bookings.propertyId, ctx.propertyId)));
    const base = b?.holdUntil && b.holdUntil.getTime() > Date.now() ? b.holdUntil.getTime() : Date.now();
    const result = await extendHold(actorFromContext(ctx), bookingId, new Date(base + hours * 3600_000));
    revalidatePath('/', 'layout');
    return result;
  });
}

export async function mergeGuestsAction(keepId: string, mergeId: string) {
  return runAction(async () => {
    const ctx = await actionContext('bookings.edit');
    await mergeGuests({ propertyId: ctx.propertyId, userId: ctx.userId }, keepId, mergeId);
    revalidatePath('/front-desk', 'layout');
    return { keepId };
  }, 'Guests merged.');
}

const guestUpdate = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(2),
  mobile: z.string().trim().max(15).nullable().optional(),
  email: z.string().trim().email().or(z.literal('')).nullable().optional(),
  city: z.string().trim().max(80).nullable().optional(),
  company: z.string().trim().max(120).nullable().optional(),
  companyGstin: z.string().trim().max(15).nullable().optional(),
  isVip: z.boolean().optional(),
  notes: z.string().trim().max(1000).nullable().optional(),
});

export async function updateGuestAction(input: z.input<typeof guestUpdate>) {
  return runAction(async () => {
    const ctx = await actionContext('bookings.edit');
    const data = guestUpdate.parse(input);
    await db
      .update(guests)
      .set({
        name: data.name,
        nameKey: nameKey(data.name),
        mobile: normaliseMobile(data.mobile),
        email: data.email || null,
        city: data.city || null,
        company: data.company || null,
        companyGstin: data.companyGstin?.toUpperCase() || null,
        isVip: data.isVip ?? false,
        notes: data.notes || null,
      })
      .where(and(eq(guests.id, data.id), eq(guests.propertyId, ctx.propertyId)));
    revalidatePath('/front-desk', 'layout');
    return { id: data.id };
  }, 'Guest saved.');
}

/* ───────────── modify booking (dates, rooms, room type, plan) ───────────── */

const modifySchema = z.object({
  bookingId: z.string().uuid(),
  checkIn: day,
  checkOut: day,
  rooms: z
    .array(
      z.object({
        id: z.string().uuid().nullable().optional(),
        roomTypeId: z.string().uuid(),
        ratePlanId: z.string().uuid(),
        adults: z.number().int().min(1).max(10),
        children: z.number().int().min(0).max(10),
        extraBeds: z.number().int().min(0).max(5),
      }),
    )
    .min(1, 'Keep at least one room.')
    .max(20),
  discount,
  pricing: z.enum(['keep', 'current']).default('keep'),
  allowOverbook: z.boolean().default(false),
});

export async function previewModifyAction(input: z.input<typeof modifySchema>) {
  return runAction(async () => {
    const ctx = await actionContext('bookings.edit');
    const data = modifySchema.parse(input);
    return previewModification(actorFromContext(ctx), data);
  });
}

export async function modifyBookingAction(input: z.input<typeof modifySchema>) {
  return runAction(async () => {
    const ctx = await actionContext('bookings.edit');
    const data = modifySchema.parse(input);
    if (data.allowOverbook && !['owner', 'manager'].includes(ctx.role.key)) throw new UserError('Only a manager can overbook.');
    const result = await modifyBooking(actorFromContext(ctx), data);
    revalidatePath('/', 'layout');
    return result;
  }, 'Booking updated');
}
