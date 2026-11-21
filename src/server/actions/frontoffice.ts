'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { ID_TYPES, PAYMENT_MODES } from '@/db/schema';
import { actionContext } from '../context';
import { runAction } from '../action';
import { UserError } from '../errors';
import { actorFromContext } from '../services/actor';
import { assignRoom, checkIn, checkOut, markFormC, moveStay, postCharge, recordPayment, roomOptions, updateGuestIdPhotos, voidFolioLine } from '../services/frontoffice';

function refresh() {
  revalidatePath('/', 'layout');
}

export async function roomOptionsAction(bookingRoomId: string) {
  return runAction(async () => {
    const ctx = await actionContext('bookings.view');
    return roomOptions(ctx.propertyId, bookingRoomId);
  });
}

export async function assignRoomAction(bookingRoomId: string, roomId: string | null) {
  return runAction(async () => {
    const ctx = await actionContext('frontdesk.checkin');
    const result = await assignRoom(actorFromContext(ctx), bookingRoomId, roomId);
    refresh();
    return result;
  });
}

const moveSchema = z.object({
  bookingRoomId: z.string().uuid(),
  roomId: z.string().uuid(),
  checkIn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  checkOut: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export async function moveStayAction(input: z.input<typeof moveSchema>) {
  return runAction(async () => {
    const ctx = await actionContext('frontdesk.checkin');
    const result = await moveStay(actorFromContext(ctx), moveSchema.parse(input));
    refresh();
    return result;
  });
}

const checkInSchema = z.object({
  bookingId: z.string().uuid(),
  assignments: z.array(z.object({ bookingRoomId: z.string().uuid(), roomId: z.string().uuid() })),
  idType: z.enum(ID_TYPES).nullable().optional(),
  idNumber: z.string().trim().max(30).nullable().optional(),
  idPhotos: z.array(z.string().max(200)).max(6).optional(),
  foreign: z
    .object({
      nationality: z.string().trim().min(2, 'Enter nationality'),
      passportNumber: z.string().trim().min(5, 'Enter the passport number'),
      passportExpiry: z.string().nullable().optional(),
      visaNumber: z.string().trim().nullable().optional(),
      visaType: z.string().trim().nullable().optional(),
      visaExpiry: z.string().nullable().optional(),
      arrivedFrom: z.string().trim().nullable().optional(),
      nextDestination: z.string().trim().nullable().optional(),
      arrivalInIndia: z.string().nullable().optional(),
      purposeOfVisit: z.string().trim().nullable().optional(),
    })
    .nullable()
    .optional(),
  advance: z.object({ amount: z.number().min(0), mode: z.enum(PAYMENT_MODES), reference: z.string().nullable().optional() }).nullable().optional(),
});

export async function checkInAction(input: z.input<typeof checkInSchema>) {
  return runAction(async () => {
    const ctx = await actionContext('frontdesk.checkin');
    const result = await checkIn(actorFromContext(ctx), checkInSchema.parse(input));
    refresh();
    return result;
  });
}

const chargeSchema = z.object({
  bookingId: z.string().uuid(),
  type: z.enum(['extra', 'discount', 'adjustment']),
  description: z.string().trim().min(2, 'Describe the charge'),
  amount: z.number().positive('Enter an amount'),
  taxRate: z.number().min(0).max(28),
  quantity: z.number().int().min(1).max(100).optional(),
});

export async function postChargeAction(input: z.input<typeof chargeSchema>) {
  return runAction(async () => {
    const ctx = await actionContext('frontdesk.checkin');
    const data = chargeSchema.parse(input);
    if (data.type === 'discount' && !ctx.can('bookings.edit')) throw new UserError('Only managers can give discounts.');
    const result = await postCharge(actorFromContext(ctx), data);
    refresh();
    return result;
  }, 'Posted to the bill.');
}

export async function voidFolioLineAction(lineId: string, reason: string) {
  return runAction(async () => {
    const ctx = await actionContext('bookings.edit');
    await voidFolioLine(actorFromContext(ctx), lineId, reason);
    refresh();
    return { ok: true };
  }, 'Line voided.');
}

const paymentSchema = z.object({
  bookingId: z.string().uuid(),
  amount: z.number().positive('Enter an amount'),
  mode: z.enum(PAYMENT_MODES),
  reference: z.string().trim().max(60).nullable().optional(),
  refund: z.boolean().optional(),
});

export async function recordPaymentAction(input: z.input<typeof paymentSchema>) {
  return runAction(async () => {
    const ctx = await actionContext('frontdesk.checkin');
    const result = await recordPayment(actorFromContext(ctx), paymentSchema.parse(input));
    refresh();
    return result;
  }, 'Payment recorded.');
}

const checkOutSchema = z.object({
  bookingId: z.string().uuid(),
  settle: z.object({ amount: z.number().min(0), mode: z.enum(PAYMENT_MODES), reference: z.string().nullable().optional() }).nullable().optional(),
  allowCredit: z.boolean().optional(),
});

export async function checkOutAction(input: z.input<typeof checkOutSchema>) {
  return runAction(async () => {
    const ctx = await actionContext('frontdesk.checkin');
    const result = await checkOut(actorFromContext(ctx), checkOutSchema.parse(input));
    refresh();
    return result;
  });
}

export async function markFormCAction(bookingId: string, reference: string) {
  return runAction(async () => {
    const ctx = await actionContext('frontdesk.checkin');
    if (reference.trim().length < 3) throw new UserError('Enter the FRRO acknowledgement number');
    await markFormC(actorFromContext(ctx), bookingId, reference.trim());
    refresh();
    return { ok: true };
  }, 'Form-C marked as submitted.');
}

export async function updateGuestIdPhotosAction(guestId: string, urls: string[]) {
  return runAction(async () => {
    const ctx = await actionContext('frontdesk.checkin');
    const data = z.object({ guestId: z.string().uuid(), urls: z.array(z.string().max(200)).max(6) }).parse({ guestId, urls });
    const result = await updateGuestIdPhotos(actorFromContext(ctx), data.guestId, data.urls);
    revalidatePath('/', 'layout');
    return result;
  }, 'ID photos saved');
}
