import 'server-only';
import { and, asc, desc, eq, inArray, lte, or, sql } from 'drizzle-orm';
import { db } from '@/db';
import { bookings, channelMappings, channels, inventory, promotions, ratePlans, rates, reviews, roomTypes, syncLogs, tasks, type Ota } from '@/db/schema';
import { addDay, formatINR, OTA_LABELS } from '@/lib/format';
import { UserError } from '../errors';
import { logActivity, notify } from '../audit';
import type { Actor } from './actor';
import { queueAriPush } from './inventory';
import { createBooking, cancelBooking } from './bookings';
import { checkListing, pushToChannel } from '../adapters/channels';
import { systemActor } from './actor';

export async function listChannels(propertyId: string) {
  const rows = await db
    .select({
      channel: channels,
      mapped: sql<number>`(SELECT count(*)::int FROM channel_mappings m WHERE m.channel_id = "channels"."id")`,
      failed24h: sql<number>`(SELECT count(*)::int FROM sync_logs s WHERE s.channel_id = "channels"."id" AND s.status = 'failed' AND s.created_at > now() - interval '24 hours')`,
      queued: sql<number>`(SELECT count(*)::int FROM sync_logs s WHERE s.channel_id = "channels"."id" AND s.status IN ('queued','processing'))`,
      bookings30d: sql<number>`(SELECT count(*)::int FROM bookings b WHERE b.property_id = "channels"."property_id" AND b.channel = "channels"."ota" AND b.created_at > now() - interval '30 days')`,
    })
    .from(channels)
    .where(eq(channels.propertyId, propertyId))
    .orderBy(sql`${channels.status} = 'connected' DESC`, asc(channels.ota));
  return rows.map((r) => ({ ...r.channel, credentials: undefined, hasToken: Object.keys(r.channel.credentials ?? {}).length > 0, mapped: r.mapped, failed24h: r.failed24h, queued: r.queued, bookings30d: r.bookings30d }));
}

export async function connectChannel(actor: Actor, input: { ota: Ota; hotelCode: string; token: string; commissionPercent: number }) {
  if (input.hotelCode.trim().length < 3) throw new UserError('Enter the hotel code from the OTA extranet.');
  if (input.token.trim().length < 4) throw new UserError('Paste the access token or API key.');
  return db.transaction(async (tx) => {
    const [existing] = await tx.select().from(channels).where(and(eq(channels.propertyId, actor.propertyId), eq(channels.ota, input.ota)));
    const values = {
      hotelCode: input.hotelCode.trim(),
      credentials: { accessToken: input.token.trim() },
      status: 'connected' as const,
      listingStatus: existing?.listingStatus === 'unknown' || !existing ? ('open' as const) : existing.listingStatus,
      commissionPercent: input.commissionPercent,
      isActive: true,
    };
    let id = existing?.id;
    if (existing) await tx.update(channels).set(values).where(eq(channels.id, existing.id));
    else id = (await tx.insert(channels).values({ propertyId: actor.propertyId, ota: input.ota, ...values }).returning({ id: channels.id }))[0].id;

    // Auto-map room types and default rate plans so selling can start straight away (editable later).
    const mapped = await tx.select({ id: channelMappings.id }).from(channelMappings).where(eq(channelMappings.channelId, id!));
    if (mapped.length === 0) {
      const plans = await tx
        .select({ id: ratePlans.id, roomTypeId: ratePlans.roomTypeId, code: roomTypes.code, meal: ratePlans.mealPlan })
        .from(ratePlans)
        .innerJoin(roomTypes, eq(roomTypes.id, ratePlans.roomTypeId))
        .where(and(eq(ratePlans.propertyId, actor.propertyId), eq(ratePlans.isActive, true)));
      if (plans.length) {
        await tx.insert(channelMappings).values(plans.map((p) => ({ propertyId: actor.propertyId, channelId: id!, roomTypeId: p.roomTypeId, ratePlanId: p.id, otaRoomId: `${input.ota.toUpperCase()}-${p.code}`, otaRateId: `${p.code}-${p.meal}` })));
      }
    }
    await logActivity({ propertyId: actor.propertyId, userId: actor.userId, entityType: 'channel', entityId: id, action: 'connect', summary: `Connected ${OTA_LABELS[input.ota]} (hotel code ${input.hotelCode})` }, tx);
    await queueAriPush(tx, actor.propertyId, { from: actor.businessDate, to: addDay(actor.businessDate, 365), kind: 'availability' });
    await queueAriPush(tx, actor.propertyId, { from: actor.businessDate, to: addDay(actor.businessDate, 365), kind: 'rates' });
    return { id: id! };
  });
}

export async function disconnectChannel(actor: Actor, channelId: string) {
  const [ch] = await db.select().from(channels).where(and(eq(channels.id, channelId), eq(channels.propertyId, actor.propertyId)));
  if (!ch) throw new UserError('Channel not found.');
  await db.update(channels).set({ status: 'disconnected', credentials: {} }).where(eq(channels.id, channelId));
  await logActivity({ propertyId: actor.propertyId, userId: actor.userId, entityType: 'channel', entityId: channelId, action: 'disconnect', summary: `Disconnected ${OTA_LABELS[ch.ota]}` });
}

export async function getMappings(propertyId: string, channelId: string) {
  const plans = await db
    .select({ ratePlanId: ratePlans.id, roomTypeId: roomTypes.id, roomTypeName: roomTypes.name, planName: ratePlans.name, mealPlan: ratePlans.mealPlan })
    .from(ratePlans)
    .innerJoin(roomTypes, eq(roomTypes.id, ratePlans.roomTypeId))
    .where(and(eq(ratePlans.propertyId, propertyId), eq(ratePlans.isActive, true)))
    .orderBy(asc(roomTypes.sortOrder), asc(ratePlans.sortOrder));
  const maps = await db.select().from(channelMappings).where(eq(channelMappings.channelId, channelId));
  return plans.map((p) => {
    const m = maps.find((x) => x.ratePlanId === p.ratePlanId);
    return { ...p, otaRoomId: m?.otaRoomId ?? '', otaRateId: m?.otaRateId ?? '' };
  });
}

export async function saveMappings(actor: Actor, channelId: string, rows: { roomTypeId: string; ratePlanId: string; otaRoomId: string; otaRateId: string }[]) {
  const [ch] = await db.select().from(channels).where(and(eq(channels.id, channelId), eq(channels.propertyId, actor.propertyId)));
  if (!ch) throw new UserError('Channel not found.');
  await db.transaction(async (tx) => {
    await tx.delete(channelMappings).where(eq(channelMappings.channelId, channelId));
    const valid = rows.filter((r) => r.otaRoomId.trim());
    if (valid.length) await tx.insert(channelMappings).values(valid.map((r) => ({ propertyId: actor.propertyId, channelId, roomTypeId: r.roomTypeId, ratePlanId: r.ratePlanId, otaRoomId: r.otaRoomId.trim(), otaRateId: r.otaRateId.trim() || null })));
    await logActivity({ propertyId: actor.propertyId, userId: actor.userId, entityType: 'channel', entityId: channelId, action: 'mapping', summary: `Saved ${valid.length} room/rate mappings for ${OTA_LABELS[ch.ota]}` }, tx);
  });
}

/** "Fix listing": re-check the OTA listing after the hotel has fixed it in the extranet. */
export async function fixListing(actor: Actor, channelId: string) {
  const [ch] = await db.select().from(channels).where(and(eq(channels.id, channelId), eq(channels.propertyId, actor.propertyId)));
  if (!ch) throw new UserError('Channel not found.');
  const result = await checkListing({ ota: ch.ota, hotelCode: ch.hotelCode, listingStatus: ch.listingStatus, credentials: ch.credentials, fixRequested: true });
  await db.update(channels).set({ listingStatus: result.status, listingMessage: result.message }).where(eq(channels.id, channelId));
  if (result.status === 'open') {
    await db.update(tasks).set({ status: 'done' }).where(and(eq(tasks.propertyId, actor.propertyId), eq(tasks.entityId, channelId), eq(tasks.status, 'open')));
    // Re-send everything that failed while the listing was blocked.
    await db
      .update(syncLogs)
      .set({ status: 'queued', nextRetryAt: null })
      .where(and(eq(syncLogs.channelId, channelId), eq(syncLogs.status, 'failed')));
  }
  await logActivity({ propertyId: actor.propertyId, userId: actor.userId, entityType: 'channel', entityId: channelId, action: 'fix_listing', summary: `${OTA_LABELS[ch.ota]} listing re-checked: ${result.status.replace('_', ' ')}` });
  return result;
}

/* ───────────────────────────── ARI queue ───────────────────────────── */

async function buildValues(propertyId: string, payload: { roomTypeId?: string | null; from: string; to: string }, kind: string, channelId: string) {
  const maps = await db.select().from(channelMappings).where(eq(channelMappings.channelId, channelId));
  const typeFilter = payload.roomTypeId ? [payload.roomTypeId] : [...new Set(maps.map((m) => m.roomTypeId))];
  if (typeFilter.length === 0) return [];
  if (kind === 'availability') {
    const rows = await db
      .select()
      .from(inventory)
      .where(and(eq(inventory.propertyId, propertyId), inArray(inventory.roomTypeId, typeFilter), sql`${inventory.date} BETWEEN ${payload.from}::date AND ${payload.to}::date`));
    return rows.flatMap((r) =>
      maps
        .filter((m) => m.roomTypeId === r.roomTypeId)
        .slice(0, 1)
        .map((m) => ({ room_type_id: m.otaRoomId, date: r.date, availability: Math.max(0, r.total - r.booked - r.blocked), stop_sell: r.stopSell })),
    );
  }
  const planIds = maps.filter((m) => m.ratePlanId && typeFilter.includes(m.roomTypeId)).map((m) => m.ratePlanId!);
  if (planIds.length === 0) return [];
  const rows = await db
    .select()
    .from(rates)
    .where(and(eq(rates.propertyId, propertyId), inArray(rates.ratePlanId, planIds), sql`${rates.date} BETWEEN ${payload.from}::date AND ${payload.to}::date`));
  return rows.map((r) => {
    const m = maps.find((x) => x.ratePlanId === r.ratePlanId)!;
    return { rate_plan_id: m.otaRateId ?? m.otaRoomId, date: r.date, rate: r.price2, min_stay_arrival: r.minStay, stop_sell: r.stopSell };
  });
}

/** Drain the outbox: push queued ARI updates to each OTA, retrying failures with back-off (max 5 tries). */
export async function processSyncQueue(propertyId?: string, limit = 50) {
  const due = await db
    .select({ log: syncLogs, channel: channels })
    .from(syncLogs)
    .innerJoin(channels, eq(channels.id, syncLogs.channelId))
    .where(
      and(
        propertyId ? eq(syncLogs.propertyId, propertyId) : undefined,
        eq(syncLogs.direction, 'push'),
        or(eq(syncLogs.status, 'queued'), and(eq(syncLogs.status, 'failed'), lte(syncLogs.nextRetryAt, new Date()), sql`${syncLogs.retries} < 5`)),
      ),
    )
    .orderBy(asc(syncLogs.createdAt))
    .limit(limit);
  let ok = 0;
  let failed = 0;
  // Coalesce: many queued updates for the same channel + kind + room type become one push over the merged
  // date range (a busy day can queue hundreds of tiny availability changes).
  const merged = new Map<string, { first: (typeof due)[number]; others: string[] }>();
  for (const item of due) {
    const payload = (item.log.payload ?? {}) as { roomTypeId?: string | null; from?: string; to?: string };
    if (item.log.status !== 'queued' || !['availability', 'rates', 'restrictions'].includes(item.log.kind) || !payload.from) continue;
    const key = `${item.channel.id}|${item.log.kind}|${payload.roomTypeId ?? 'all'}`;
    const group = merged.get(key);
    if (!group) merged.set(key, { first: item, others: [] });
    else {
      const fp = group.first.log.payload as { from: string; to: string };
      group.first.log.payload = { ...fp, from: payload.from < fp.from ? payload.from : fp.from, to: (payload.to ?? payload.from) > fp.to ? payload.to ?? payload.from : fp.to };
      group.others.push(item.log.id);
    }
  }
  const skip = new Set([...merged.values()].flatMap((g) => g.others));
  for (const g of merged.values()) {
    if (g.others.length) {
      await db
        .update(syncLogs)
        .set({ status: 'success', processedAt: new Date(), response: { message: `Merged into one push with ${g.others.length + 1} updates` } })
        .where(inArray(syncLogs.id, g.others));
    }
  }
  for (const { log, channel } of due) {
    if (skip.has(log.id)) {
      ok++;
      continue;
    }
    if (channel.status !== 'connected') {
      await db.update(syncLogs).set({ status: 'failed', response: { error: 'Channel not connected' }, processedAt: new Date(), retries: 5 }).where(eq(syncLogs.id, log.id));
      failed++;
      continue;
    }
    await db.update(syncLogs).set({ status: 'processing' }).where(eq(syncLogs.id, log.id));
    const payload = (log.payload ?? {}) as { roomTypeId?: string | null; from: string; to: string };
    const values = log.kind === 'promotion' ? [log.payload as Record<string, unknown>] : await buildValues(log.propertyId, payload, log.kind, channel.id);
    const result = await pushToChannel({ ota: channel.ota, hotelCode: channel.hotelCode, listingStatus: channel.listingStatus, credentials: channel.credentials }, { kind: log.kind as 'availability', hotelCode: channel.hotelCode, values });
    const retries = log.status === 'failed' ? log.retries + 1 : log.retries;
    await db
      .update(syncLogs)
      .set({
        status: result.ok ? 'success' : 'failed',
        response: result.ok ? { ok: true, message: result.message, values: values.length } : { error: result.message },
        processedAt: new Date(),
        retries,
        nextRetryAt: result.ok || !result.retryable ? null : new Date(Date.now() + Math.min(60, 2 ** retries) * 60_000),
      })
      .where(eq(syncLogs.id, log.id));
    if (result.ok) {
      ok++;
      await db.update(channels).set({ lastSyncAt: new Date() }).where(eq(channels.id, channel.id));
    } else {
      failed++;
      if (log.status === 'queued') {
        const recent = await db
          .select({ n: sql<number>`count(*)::int` })
          .from(syncLogs)
          .where(and(eq(syncLogs.channelId, channel.id), eq(syncLogs.status, 'failed'), sql`${syncLogs.processedAt} > now() - interval '1 hour'`));
        if ((recent[0]?.n ?? 0) <= 1) {
          await notify(db, { propertyId: log.propertyId, type: 'sync_error', title: `${OTA_LABELS[channel.ota]} sync failed`, body: result.message, href: '/channels/sync-log?status=failed' });
        }
      }
    }
  }
  return { processed: due.length, ok, failed };
}

export async function retrySync(actor: Actor, id: string) {
  await db
    .update(syncLogs)
    .set({ status: 'queued', nextRetryAt: null })
    .where(and(eq(syncLogs.id, id), eq(syncLogs.propertyId, actor.propertyId)));
}

/* ───────────────────────────── inbound OTA bookings ───────────────────────────── */

export interface OtaBookingPayload {
  type: 'new' | 'cancel';
  hotelCode: string;
  otaRef: string;
  guest?: { name: string; mobile?: string | null; email?: string | null; city?: string | null; nationality?: string | null };
  checkIn?: string;
  checkOut?: string;
  rooms?: { otaRoomId: string; otaRateId?: string | null; adults: number; children?: number }[];
  total?: number;
}

/**
 * An OTA booking goes through the SAME locked reservation path as the front desk, so a room can never be sold
 * twice (overbooking guard). If the room type is sold out, the booking is refused and the team is alerted.
 */
export async function receiveOtaBooking(ota: Ota, payload: OtaBookingPayload) {
  const [channel] = await db.select().from(channels).where(and(eq(channels.ota, ota), eq(channels.hotelCode, payload.hotelCode)));
  if (!channel) throw new UserError(`Unknown ${ota} hotel code ${payload.hotelCode}`);
  const actor = await systemActor(channel.propertyId);
  const log = async (status: 'success' | 'failed', message: string, response?: unknown) =>
    db.insert(syncLogs).values({ propertyId: channel.propertyId, channelId: channel.id, direction: 'webhook', kind: 'booking', message, payload: payload as unknown as Record<string, unknown>, response: (response ?? null) as Record<string, unknown> | null, status, processedAt: new Date() });

  if (payload.type === 'cancel') {
    const [b] = await db.select({ id: bookings.id }).from(bookings).where(and(eq(bookings.propertyId, channel.propertyId), eq(bookings.otaRef, payload.otaRef)));
    if (!b) throw new UserError(`Booking ${payload.otaRef} not found`);
    await cancelBooking(actor, b.id, `Cancelled on ${OTA_LABELS[ota]}`);
    await notify(db, { propertyId: channel.propertyId, type: 'booking_cancelled', title: `${OTA_LABELS[ota]} cancellation ${payload.otaRef}`, href: `/front-desk/bookings/${b.id}` });
    await log('success', `Cancellation ${payload.otaRef}`);
    return { bookingId: b.id, cancelled: true };
  }

  const maps = await db.select().from(channelMappings).where(eq(channelMappings.channelId, channel.id));
  const roomsInput = (payload.rooms ?? []).map((r) => {
    const m = maps.find((x) => x.otaRoomId === r.otaRoomId && (!r.otaRateId || x.otaRateId === r.otaRateId)) ?? maps.find((x) => x.otaRoomId === r.otaRoomId);
    if (!m || !m.ratePlanId) throw new UserError(`Room ${r.otaRoomId} is not mapped. Map it under Channels.`);
    return { roomTypeId: m.roomTypeId, ratePlanId: m.ratePlanId, adults: r.adults, children: r.children ?? 0, extraBeds: 0 };
  });
  try {
    const result = await createBooking(actor, {
      source: 'ota',
      channel: ota,
      otaRef: payload.otaRef,
      guest: { name: payload.guest?.name ?? 'OTA Guest', mobile: payload.guest?.mobile, email: payload.guest?.email, city: payload.guest?.city, nationality: payload.guest?.nationality },
      checkIn: payload.checkIn!,
      checkOut: payload.checkOut!,
      rooms: roomsInput,
      importedTotal: payload.total ?? null,
      billTo: 'ota',
    });
    await log('success', `New booking ${payload.otaRef} → ${result.bookingNo}`, { bookingNo: result.bookingNo });
    return { bookingId: result.id, bookingNo: result.bookingNo };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed';
    await log('failed', `Refused ${payload.otaRef}: ${message}`);
    await notify(db, { propertyId: channel.propertyId, type: 'sync_error', title: `Overbooking prevented on ${OTA_LABELS[ota]}`, body: `${payload.otaRef}: ${message} Contact the OTA to relocate the guest.`, href: '/channels/sync-log?status=failed' });
    throw error;
  }
}

/* ───────────────────────────── promotions & reviews ───────────────────────────── */

export async function listPromotions(propertyId: string) {
  return db.select().from(promotions).where(eq(promotions.propertyId, propertyId)).orderBy(desc(promotions.isActive), desc(promotions.createdAt));
}

export async function pushPromotion(actor: Actor, promotionId: string) {
  const [promo] = await db.select().from(promotions).where(and(eq(promotions.id, promotionId), eq(promotions.propertyId, actor.propertyId)));
  if (!promo) throw new UserError('Promotion not found.');
  const targets = await db
    .select()
    .from(channels)
    .where(and(eq(channels.propertyId, actor.propertyId), eq(channels.status, 'connected'), inArray(channels.ota, (promo.channels.filter((c) => c !== 'web') as Ota[]).length ? (promo.channels.filter((c) => c !== 'web') as Ota[]) : ['makemytrip'])));
  if (targets.length) {
    await db.insert(syncLogs).values(
      targets.map((ch) => ({
        propertyId: actor.propertyId,
        channelId: ch.id,
        direction: 'push' as const,
        kind: 'promotion' as const,
        message: `Promotion "${promo.name}" (${promo.discountType === 'percent' ? `${promo.value}%` : formatINR(promo.value)} off)`,
        payload: { name: promo.name, type: promo.type, discount: promo.value, discountType: promo.discountType, condition: promo.conditionValue, active: promo.isActive },
      })),
    );
  }
  await db.update(promotions).set({ pushedAt: new Date() }).where(eq(promotions.id, promotionId));
  await logActivity({ propertyId: actor.propertyId, userId: actor.userId, entityType: 'promotion', entityId: promotionId, action: 'push', summary: `Pushed promotion "${promo.name}" to ${targets.map((t) => OTA_LABELS[t.ota]).join(', ') || 'booking engine'}` });
  return { channels: targets.length };
}

export async function listReviews(propertyId: string, channel?: string) {
  const rows = await db
    .select()
    .from(reviews)
    .where(and(eq(reviews.propertyId, propertyId), channel ? eq(reviews.channel, channel) : undefined))
    .orderBy(desc(reviews.createdAt));
  const all = channel ? await db.select().from(reviews).where(eq(reviews.propertyId, propertyId)) : rows;
  const avg = all.length ? all.reduce((t, r) => t + r.rating, 0) / all.length : 0;
  const byChannel = Object.entries(
    all.reduce<Record<string, { n: number; sum: number }>>((acc, r) => {
      acc[r.channel] = { n: (acc[r.channel]?.n ?? 0) + 1, sum: (acc[r.channel]?.sum ?? 0) + r.rating };
      return acc;
    }, {}),
  ).map(([ch, v]) => ({ channel: ch, count: v.n, average: Math.round((v.sum / v.n) * 10) / 10 }));
  return { rows, average: Math.round(avg * 10) / 10, total: all.length, unreplied: all.filter((r) => !r.reply).length, byChannel };
}
