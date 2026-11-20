'use server';

import { revalidatePath } from 'next/cache';
import { and, eq, gte, inArray, lte, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/db';
import { activityLog, inventory, ratePlans, rates, roomTypes } from '@/db/schema';
import { formatDayShort, parseDay, stayDates, addDay } from '@/lib/format';
import { round2 } from '@/lib/utils';
import { actionContext } from '../context';
import { runAction } from '../action';
import { UserError } from '../errors';
import { logActivity } from '../audit';
import { ensureInventory, queueAriPush } from '../services/inventory';

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Pick a date');

/* ───────────────────────── single calendar cell ───────────────────────── */

const cellSchema = z.object({
  roomTypeId: z.string().uuid(),
  date: day,
  available: z.number().int().min(0),
  stopSell: z.boolean(),
});

/** Click a calendar cell → set how many rooms to sell (the rest become "blocked") and stop-sell. */
export async function updateInventoryCellAction(input: z.infer<typeof cellSchema>) {
  return runAction(async () => {
    const ctx = await actionContext('inventory.edit');
    const data = cellSchema.parse(input);
    return db.transaction(async (tx) => {
      await ensureInventory(tx, ctx.propertyId, data.date, data.date, data.roomTypeId);
      const [row] = await tx
        .select()
        .from(inventory)
        .where(and(eq(inventory.propertyId, ctx.propertyId), eq(inventory.roomTypeId, data.roomTypeId), eq(inventory.date, data.date)))
        .for('update');
      if (!row) throw new UserError('Inventory row not found.');
      const maxSellable = row.total - row.booked;
      if (data.available > maxSellable) throw new UserError(`At most ${maxSellable} can be sold: ${row.booked} already booked out of ${row.total}.`);
      const blocked = maxSellable - data.available;
      await tx.update(inventory).set({ blocked, stopSell: data.stopSell }).where(eq(inventory.id, row.id));
      const [type] = await tx.select({ name: roomTypes.name }).from(roomTypes).where(eq(roomTypes.id, data.roomTypeId));
      const logId = await logActivity(
        {
          propertyId: ctx.propertyId,
          userId: ctx.userId,
          entityType: 'inventory_bulk',
          entityId: data.roomTypeId,
          action: 'update',
          summary: `${type.name} on ${formatDayShort(data.date)}: ${row.total - row.booked - row.blocked} → ${data.available} to sell${data.stopSell !== row.stopSell ? (data.stopSell ? ', stop-sell on' : ', stop-sell off') : ''}`,
          before: [{ id: row.id, blocked: row.blocked, stopSell: row.stopSell }],
          after: [{ id: row.id, blocked, stopSell: data.stopSell }],
        },
        tx,
      );
      await queueAriPush(tx, ctx.propertyId, { roomTypeId: data.roomTypeId, from: data.date, to: data.date, kind: 'availability' });
      revalidatePath('/rooms/calendar');
      return { logId };
    });
  }, 'Saved. OTAs will be updated in a few seconds.');
}

/* ───────────────────────── bulk update (preview → apply → undo) ───────────────────────── */

const bulkSchema = z
  .object({
    from: day,
    to: day,
    weekdays: z.array(z.number().int().min(0).max(6)).min(1, 'Pick at least one weekday'),
    roomTypeIds: z.array(z.string().uuid()).min(1, 'Pick at least one room type'),
    mode: z.enum(['set_available', 'block', 'unblock_all', 'stop_sell', 'open_sale']),
    value: z.number().int().min(0).default(0),
  })
  .refine((v) => v.to >= v.from, { message: 'The end date must be after the start date', path: ['to'] })
  .refine((v) => stayDates(v.from, addDay(v.to, 1)).length <= 366, { message: 'Pick a range of one year or less', path: ['to'] });

export type BulkInput = z.input<typeof bulkSchema>;

export interface BulkPreviewRow {
  id: string;
  roomTypeName: string;
  date: string;
  total: number;
  booked: number;
  before: { available: number; blocked: number; stopSell: boolean };
  after: { available: number; blocked: number; stopSell: boolean };
  note?: string;
}

async function computeBulk(propertyId: string, raw: BulkInput, lock: boolean, tx: Parameters<Parameters<typeof db.transaction>[0]>[0] | typeof db = db) {
  const input = bulkSchema.parse(raw);
  await ensureInventory(tx, propertyId, input.from, input.to);
  const query = tx
    .select({
      id: inventory.id,
      roomTypeId: inventory.roomTypeId,
      roomTypeName: roomTypes.name,
      date: inventory.date,
      total: inventory.total,
      booked: inventory.booked,
      blocked: inventory.blocked,
      stopSell: inventory.stopSell,
    })
    .from(inventory)
    .innerJoin(roomTypes, eq(roomTypes.id, inventory.roomTypeId))
    .where(
      and(
        eq(inventory.propertyId, propertyId),
        inArray(inventory.roomTypeId, input.roomTypeIds),
        gte(inventory.date, input.from),
        lte(inventory.date, input.to),
      ),
    )
    .orderBy(roomTypes.sortOrder, inventory.date);
  const rows = lock ? await query.for('update', { of: inventory }) : await query;

  const preview: BulkPreviewRow[] = [];
  for (const row of rows) {
    if (!input.weekdays.includes(parseDay(row.date).getDay())) continue;
    const maxSellable = row.total - row.booked;
    const before = { available: maxSellable - row.blocked, blocked: row.blocked, stopSell: row.stopSell };
    const after = { ...before };
    let note: string | undefined;
    switch (input.mode) {
      case 'set_available': {
        const target = Math.min(input.value, maxSellable);
        if (target < input.value) note = `Only ${maxSellable} can be sold (${row.booked} booked)`;
        after.available = target;
        after.blocked = maxSellable - target;
        break;
      }
      case 'block': {
        const blocked = Math.min(row.blocked + input.value, maxSellable);
        if (blocked < row.blocked + input.value) note = 'Capped: cannot block booked rooms';
        after.blocked = blocked;
        after.available = maxSellable - blocked;
        break;
      }
      case 'unblock_all':
        after.blocked = 0;
        after.available = maxSellable;
        break;
      case 'stop_sell':
        after.stopSell = true;
        break;
      case 'open_sale':
        after.stopSell = false;
        break;
    }
    if (after.blocked === before.blocked && after.stopSell === before.stopSell) continue;
    preview.push({ id: row.id, roomTypeName: row.roomTypeName, date: row.date, total: row.total, booked: row.booked, before, after, note });
  }
  return { input, preview };
}

export async function previewBulkUpdateAction(raw: BulkInput) {
  return runAction(async () => {
    const ctx = await actionContext('inventory.edit');
    const { preview } = await computeBulk(ctx.propertyId, raw, false);
    return { rows: preview.slice(0, 400), total: preview.length };
  });
}

export async function applyBulkUpdateAction(raw: BulkInput) {
  return runAction(async () => {
    const ctx = await actionContext('inventory.edit');
    return db.transaction(async (tx) => {
      const { input, preview } = await computeBulk(ctx.propertyId, raw, true, tx);
      if (preview.length === 0) throw new UserError('Nothing to change for these dates.');
      for (const row of preview) {
        await tx.update(inventory).set({ blocked: row.after.blocked, stopSell: row.after.stopSell }).where(eq(inventory.id, row.id));
      }
      const label = {
        set_available: `set rooms to sell to ${input.value}`,
        block: `blocked ${input.value} room(s)`,
        unblock_all: 'removed all blocks',
        stop_sell: 'stopped sale',
        open_sale: 'opened sale',
      }[input.mode];
      const logId = await logActivity(
        {
          propertyId: ctx.propertyId,
          userId: ctx.userId,
          entityType: 'inventory_bulk',
          action: 'bulk_update',
          summary: `Bulk update: ${label} on ${preview.length} date(s), ${formatDayShort(input.from)} → ${formatDayShort(input.to)}`,
          before: preview.map((r) => ({ id: r.id, blocked: r.before.blocked, stopSell: r.before.stopSell })),
          after: preview.map((r) => ({ id: r.id, blocked: r.after.blocked, stopSell: r.after.stopSell })),
        },
        tx,
      );
      for (const typeId of input.roomTypeIds) {
        await queueAriPush(tx, ctx.propertyId, { roomTypeId: typeId, from: input.from, to: input.to, kind: 'availability' });
      }
      revalidatePath('/rooms/calendar');
      return { logId, changed: preview.length };
    });
  });
}

/* ───────────────────────── undo (inventory + rates) ───────────────────────── */

/** Undo a bulk or single change using the activity-log snapshot (rule 8: safe actions can be undone). */
export async function undoChangeAction(logId: string) {
  return runAction(async () => {
    const ctx = await actionContext();
    return db.transaction(async (tx) => {
      const [log] = await tx
        .select()
        .from(activityLog)
        .where(and(eq(activityLog.id, logId), eq(activityLog.propertyId, ctx.propertyId)))
        .for('update');
      if (!log) throw new UserError('That change could not be found.');
      if (log.undoneAt) throw new UserError('That change was already undone.');
      if (log.entityType === 'inventory_bulk') {
        if (!ctx.can('inventory.edit')) throw new UserError('You do not have permission to do this.');
        const before = log.before as { id: string; blocked: number; stopSell: boolean }[];
        for (const row of before) {
          // Never block rooms that have been booked since: cap at what is still free.
          await tx
            .update(inventory)
            .set({ blocked: sql`LEAST(${row.blocked}, ${inventory.total} - ${inventory.booked})`, stopSell: row.stopSell })
            .where(and(eq(inventory.id, row.id), eq(inventory.propertyId, ctx.propertyId)));
        }
        const touched = await tx
          .select({ roomTypeId: inventory.roomTypeId, from: sql<string>`min(${inventory.date})::text`, to: sql<string>`max(${inventory.date})::text` })
          .from(inventory)
          .where(inArray(inventory.id, before.map((b) => b.id)))
          .groupBy(inventory.roomTypeId);
        for (const t of touched) await queueAriPush(tx, ctx.propertyId, { roomTypeId: t.roomTypeId, from: t.from, to: t.to, kind: 'availability' });
        revalidatePath('/rooms/calendar');
      } else if (log.entityType === 'rates_bulk') {
        if (!ctx.can('rates.edit')) throw new UserError('You do not have permission to do this.');
        const before = log.before as RateSnapshot[];
        for (const snap of before) {
          if (snap.existed) {
            await tx
              .update(rates)
              .set({ price1: snap.price1, price2: snap.price2, price3: snap.price3, extraBed: snap.extraBed, minStay: snap.minStay, stopSell: snap.stopSell })
              .where(and(eq(rates.ratePlanId, snap.ratePlanId), eq(rates.date, snap.date), eq(rates.propertyId, ctx.propertyId)));
          } else {
            await tx.delete(rates).where(and(eq(rates.ratePlanId, snap.ratePlanId), eq(rates.date, snap.date), eq(rates.propertyId, ctx.propertyId)));
          }
        }
        if (before.length) {
          const dates = before.map((b) => b.date).sort();
          await queueAriPush(tx, ctx.propertyId, { from: dates[0], to: dates[dates.length - 1], kind: 'rates' });
        }
        revalidatePath('/rooms/rates');
      } else {
        throw new UserError('This change cannot be undone automatically.');
      }
      await tx.update(activityLog).set({ undoneAt: new Date() }).where(eq(activityLog.id, logId));
      await logActivity({ propertyId: ctx.propertyId, userId: ctx.userId, entityType: log.entityType, action: 'undo', summary: `Undid: ${log.summary}` }, tx);
      return { ok: true };
    });
  }, 'Change undone.');
}

/* ───────────────────────── rates ───────────────────────── */

interface RateSnapshot {
  ratePlanId: string;
  date: string;
  existed: boolean;
  price1: number;
  price2: number;
  price3: number;
  extraBed: number;
  minStay: number;
  stopSell: boolean;
}

const money = z.number().min(0).max(1_000_000);

const rateBulkSchema = z
  .object({
    ratePlanIds: z.array(z.string().uuid()).min(1, 'Pick at least one rate plan'),
    from: day,
    to: day,
    weekdays: z.array(z.number().int().min(0).max(6)).min(1, 'Pick at least one weekday'),
    priceMode: z.enum(['keep', 'set', 'increase_percent', 'decrease_percent', 'increase_flat', 'decrease_flat']),
    price1: money.optional(),
    price2: money.optional(),
    price3: money.optional(),
    extraBed: money.optional(),
    amount: z.number().min(0).max(100000).optional(),
    minStay: z.number().int().min(1).max(30).optional(),
    stopSell: z.enum(['keep', 'on', 'off']).default('keep'),
  })
  .refine((v) => v.to >= v.from, { message: 'The end date must be after the start date', path: ['to'] })
  .refine((v) => stayDates(v.from, addDay(v.to, 1)).length <= 366, { message: 'Pick a range of one year or less', path: ['to'] });

export type RateBulkInput = z.input<typeof rateBulkSchema>;

export interface RatePreviewRow {
  ratePlanId: string;
  label: string;
  date: string;
  before: RateSnapshot;
  after: RateSnapshot;
}

async function computeRateBulk(propertyId: string, raw: RateBulkInput, tx: Parameters<Parameters<typeof db.transaction>[0]>[0] | typeof db = db) {
  const input = rateBulkSchema.parse(raw);
  const plans = await tx
    .select({ id: ratePlans.id, name: ratePlans.name, mealPlan: ratePlans.mealPlan, typeName: roomTypes.name, price1: ratePlans.price1, price2: ratePlans.price2, price3: ratePlans.price3, extraBed: ratePlans.extraBed })
    .from(ratePlans)
    .innerJoin(roomTypes, eq(roomTypes.id, ratePlans.roomTypeId))
    .where(and(eq(ratePlans.propertyId, propertyId), inArray(ratePlans.id, input.ratePlanIds)));
  const existing = await tx
    .select()
    .from(rates)
    .where(and(eq(rates.propertyId, propertyId), inArray(rates.ratePlanId, input.ratePlanIds), gte(rates.date, input.from), lte(rates.date, input.to)));
  const map = new Map(existing.map((r) => [`${r.ratePlanId}|${r.date}`, r]));
  const dates = stayDates(input.from, addDay(input.to, 1)).filter((d) => input.weekdays.includes(parseDay(d).getDay()));

  const adjust = (value: number, explicit: number | undefined) => {
    switch (input.priceMode) {
      case 'keep':
        return value;
      case 'set':
        return explicit ?? value;
      case 'increase_percent':
        return round2(value * (1 + (input.amount ?? 0) / 100));
      case 'decrease_percent':
        return round2(Math.max(0, value * (1 - (input.amount ?? 0) / 100)));
      case 'increase_flat':
        return round2(value + (input.amount ?? 0));
      case 'decrease_flat':
        return round2(Math.max(0, value - (input.amount ?? 0)));
    }
  };

  const preview: RatePreviewRow[] = [];
  for (const plan of plans) {
    for (const date of dates) {
      const row = map.get(`${plan.id}|${date}`);
      const before: RateSnapshot = row
        ? { ratePlanId: plan.id, date, existed: true, price1: row.price1, price2: row.price2, price3: row.price3, extraBed: row.extraBed, minStay: row.minStay, stopSell: row.stopSell }
        : { ratePlanId: plan.id, date, existed: false, price1: plan.price1, price2: plan.price2, price3: plan.price3, extraBed: plan.extraBed, minStay: 1, stopSell: false };
      const after: RateSnapshot = {
        ...before,
        existed: true,
        price1: adjust(before.price1, input.price1),
        price2: adjust(before.price2, input.price2),
        price3: adjust(before.price3, input.price3),
        extraBed: input.priceMode === 'set' ? input.extraBed ?? before.extraBed : before.extraBed,
        minStay: input.minStay ?? before.minStay,
        stopSell: input.stopSell === 'keep' ? before.stopSell : input.stopSell === 'on',
      };
      const changed = (['price1', 'price2', 'price3', 'extraBed', 'minStay', 'stopSell'] as const).some((k) => after[k] !== before[k]);
      if (!changed) continue;
      preview.push({ ratePlanId: plan.id, label: `${plan.typeName} · ${plan.name} (${plan.mealPlan})`, date, before, after });
    }
  }
  return { input, preview };
}

export async function previewRateBulkAction(raw: RateBulkInput) {
  return runAction(async () => {
    const ctx = await actionContext('rates.edit');
    const { preview } = await computeRateBulk(ctx.propertyId, raw);
    return { rows: preview.slice(0, 400), total: preview.length };
  });
}

export async function applyRateBulkAction(raw: RateBulkInput) {
  return runAction(async () => {
    const ctx = await actionContext('rates.edit');
    return db.transaction(async (tx) => {
      const { input, preview } = await computeRateBulk(ctx.propertyId, raw, tx);
      if (preview.length === 0) throw new UserError('Nothing to change for these dates.');
      for (const row of preview) {
        const a = row.after;
        await tx
          .insert(rates)
          .values({ propertyId: ctx.propertyId, ratePlanId: a.ratePlanId, date: a.date, price1: a.price1, price2: a.price2, price3: a.price3, extraBed: a.extraBed, minStay: a.minStay, stopSell: a.stopSell })
          .onConflictDoUpdate({
            target: [rates.ratePlanId, rates.date],
            set: { price1: a.price1, price2: a.price2, price3: a.price3, extraBed: a.extraBed, minStay: a.minStay, stopSell: a.stopSell },
          });
      }
      const logId = await logActivity(
        {
          propertyId: ctx.propertyId,
          userId: ctx.userId,
          entityType: 'rates_bulk',
          action: 'bulk_update',
          summary: `Rates updated on ${preview.length} plan-date(s), ${formatDayShort(input.from)} → ${formatDayShort(input.to)}`,
          before: preview.map((r) => r.before),
          after: preview.map((r) => r.after),
        },
        tx,
      );
      await queueAriPush(tx, ctx.propertyId, { from: input.from, to: input.to, kind: 'rates' });
      revalidatePath('/rooms/rates');
      return { logId, changed: preview.length };
    });
  });
}

const rateCellSchema = z.object({
  ratePlanId: z.string().uuid(),
  date: day,
  price1: money,
  price2: money,
  price3: money,
  extraBed: money,
  minStay: z.number().int().min(1).max(30),
  stopSell: z.boolean(),
});

export async function updateRateCellAction(input: z.infer<typeof rateCellSchema>) {
  return runAction(async () => {
    const ctx = await actionContext('rates.edit');
    const data = rateCellSchema.parse(input);
    return applyRateBulkActionInternal(ctx, data);
  }, 'Rate saved. OTAs will be updated in a few seconds.');
}

async function applyRateBulkActionInternal(ctx: Awaited<ReturnType<typeof actionContext>>, data: z.infer<typeof rateCellSchema>) {
  return db.transaction(async (tx) => {
    const { preview } = await computeRateBulk(
      ctx.propertyId,
      {
        ratePlanIds: [data.ratePlanId],
        from: data.date,
        to: data.date,
        weekdays: [0, 1, 2, 3, 4, 5, 6],
        priceMode: 'set',
        price1: data.price1,
        price2: data.price2,
        price3: data.price3,
        extraBed: data.extraBed,
        minStay: data.minStay,
        stopSell: data.stopSell ? 'on' : 'off',
      },
      tx,
    );
    if (preview.length === 0) return { logId: null };
    const a = preview[0].after;
    await tx
      .insert(rates)
      .values({ propertyId: ctx.propertyId, ratePlanId: a.ratePlanId, date: a.date, price1: a.price1, price2: a.price2, price3: a.price3, extraBed: a.extraBed, minStay: a.minStay, stopSell: a.stopSell })
      .onConflictDoUpdate({
        target: [rates.ratePlanId, rates.date],
        set: { price1: a.price1, price2: a.price2, price3: a.price3, extraBed: a.extraBed, minStay: a.minStay, stopSell: a.stopSell },
      });
    const logId = await logActivity(
      {
        propertyId: ctx.propertyId,
        userId: ctx.userId,
        entityType: 'rates_bulk',
        action: 'update',
        summary: `${preview[0].label} on ${formatDayShort(data.date)}: ₹${preview[0].before.price2} → ₹${a.price2} (2 adults)`,
        before: [preview[0].before],
        after: [a],
      },
      tx,
    );
    await queueAriPush(tx, ctx.propertyId, { from: data.date, to: data.date, kind: 'rates' });
    revalidatePath('/rooms/rates');
    return { logId };
  });
}
