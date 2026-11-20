'use server';

import { revalidatePath } from 'next/cache';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/db';
import { channels, OTAS, PROMOTION_TYPES, promotions, reviews } from '@/db/schema';
import { addDay } from '@/lib/format';
import { actionContext } from '../context';
import { runAction } from '../action';
import { UserError } from '../errors';
import { logActivity } from '../audit';
import { actorFromContext } from '../services/actor';
import { connectChannel, disconnectChannel, fixListing, getMappings, processSyncQueue, pushPromotion, receiveOtaBooking, retrySync, saveMappings } from '../services/channels';

function refresh() {
  revalidatePath('/channels', 'layout');
  revalidatePath('/dashboard');
}

export async function connectChannelAction(input: { ota: (typeof OTAS)[number]; hotelCode: string; token: string; commissionPercent: number }) {
  return runAction(async () => {
    const ctx = await actionContext('channels.manage');
    const result = await connectChannel(actorFromContext(ctx), { ...input, ota: z.enum(OTAS).parse(input.ota) });
    await processSyncQueue(ctx.propertyId, 20);
    refresh();
    return result;
  }, 'Connected. Availability and rates are being sent.');
}

export async function disconnectChannelAction(channelId: string) {
  return runAction(async () => {
    const ctx = await actionContext('channels.manage');
    await disconnectChannel(actorFromContext(ctx), channelId);
    refresh();
    return { ok: true };
  }, 'Disconnected.');
}

export async function getMappingsAction(channelId: string) {
  return runAction(async () => {
    const ctx = await actionContext('channels.manage');
    return getMappings(ctx.propertyId, channelId);
  });
}

export async function saveMappingsAction(channelId: string, rows: { roomTypeId: string; ratePlanId: string; otaRoomId: string; otaRateId: string }[]) {
  return runAction(async () => {
    const ctx = await actionContext('channels.manage');
    await saveMappings(actorFromContext(ctx), channelId, rows);
    refresh();
    return { ok: true };
  }, 'Mapping saved.');
}

export async function fixListingAction(channelId: string) {
  return runAction(async () => {
    const ctx = await actionContext('channels.manage');
    const result = await fixListing(actorFromContext(ctx), channelId);
    if (result.status === 'open') await processSyncQueue(ctx.propertyId, 50);
    refresh();
    return result;
  });
}

export async function processQueueAction() {
  return runAction(async () => {
    const ctx = await actionContext('channels.manage');
    const result = await processSyncQueue(ctx.propertyId, 200);
    refresh();
    return result;
  });
}

export async function retrySyncAction(id: string) {
  return runAction(async () => {
    const ctx = await actionContext('channels.manage');
    await retrySync(actorFromContext(ctx), id);
    const result = await processSyncQueue(ctx.propertyId, 20);
    refresh();
    return result;
  });
}

/** Demo helper: send a realistic OTA booking through the real webhook path. */
export async function simulateOtaBookingAction(ota: (typeof OTAS)[number]) {
  return runAction(async () => {
    const ctx = await actionContext('channels.manage');
    const [channel] = await db.select().from(channels).where(and(eq(channels.propertyId, ctx.propertyId), eq(channels.ota, ota)));
    if (!channel || channel.status !== 'connected' || !channel.hotelCode) throw new UserError('Connect this channel first.');
    const mapping = (await getMappings(ctx.propertyId, channel.id)).find((m) => m.otaRoomId);
    if (!mapping) throw new UserError('Map at least one room first.');
    const names = ['Arjun Mehta', 'Kavya Reddy', 'Sameer Khan', 'Ananya Iyer', 'Rohan Desai'];
    const checkIn = addDay(ctx.property.businessDate, 3 + Math.floor(Math.random() * 10));
    const result = await receiveOtaBooking(ota, {
      type: 'new',
      hotelCode: channel.hotelCode,
      otaRef: `${ota.slice(0, 3).toUpperCase()}${Date.now().toString().slice(-9)}`,
      guest: { name: names[Math.floor(Math.random() * names.length)], mobile: `98${Math.floor(10000000 + Math.random() * 89999999)}` },
      checkIn,
      checkOut: addDay(checkIn, 2),
      rooms: [{ otaRoomId: mapping.otaRoomId, otaRateId: mapping.otaRateId, adults: 2 }],
    });
    revalidatePath('/', 'layout');
    return result;
  });
}

const promoSchema = z.object({
  id: z.string().uuid().nullable().optional(),
  name: z.string().trim().min(3, 'Name the promotion'),
  type: z.enum(PROMOTION_TYPES),
  discountType: z.enum(['percent', 'flat']),
  value: z.number().positive('Enter the discount'),
  conditionValue: z.number().int().min(0).nullable().optional(),
  couponCode: z.string().trim().max(20).nullable().optional(),
  stayFrom: z.string().nullable().optional(),
  stayTo: z.string().nullable().optional(),
  channels: z.array(z.string()),
  isActive: z.boolean(),
});

export async function savePromotionAction(input: z.input<typeof promoSchema>) {
  return runAction(async () => {
    const ctx = await actionContext('channels.manage');
    const data = promoSchema.parse(input);
    if (data.discountType === 'percent' && data.value > 90) throw new UserError('A discount above 90% looks like a mistake.');
    if (data.type === 'coupon' && !data.couponCode) throw new UserError('Enter the coupon code guests will type.');
    const values = { ...data, id: undefined, couponCode: data.couponCode?.toUpperCase() || null, stayFrom: data.stayFrom || null, stayTo: data.stayTo || null, conditionValue: data.conditionValue ?? null };
    let id = data.id;
    if (id) await db.update(promotions).set(values).where(and(eq(promotions.id, id), eq(promotions.propertyId, ctx.propertyId)));
    else id = (await db.insert(promotions).values({ ...values, propertyId: ctx.propertyId }).returning({ id: promotions.id }))[0].id;
    await logActivity({ propertyId: ctx.propertyId, userId: ctx.userId, entityType: 'promotion', entityId: id, action: data.id ? 'update' : 'create', summary: `${data.id ? 'Updated' : 'Created'} promotion "${data.name}"` });
    refresh();
    return { id };
  }, 'Promotion saved.');
}

export async function pushPromotionAction(id: string) {
  return runAction(async () => {
    const ctx = await actionContext('channels.manage');
    const result = await pushPromotion(actorFromContext(ctx), id);
    await processSyncQueue(ctx.propertyId, 20);
    refresh();
    return result;
  });
}

export async function replyReviewAction(id: string, reply: string) {
  return runAction(async () => {
    const ctx = await actionContext('channels.manage');
    if (reply.trim().length < 5) throw new UserError('Write a short reply.');
    await db.update(reviews).set({ reply: reply.trim(), repliedAt: new Date() }).where(and(eq(reviews.id, id), eq(reviews.propertyId, ctx.propertyId)));
    refresh();
    return { ok: true };
  }, 'Reply posted.');
}
