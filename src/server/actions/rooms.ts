'use server';

import { revalidatePath } from 'next/cache';
import { and, eq, inArray, ne, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/db';
import { MEAL_PLANS, ratePlans, roomTypes, rooms } from '@/db/schema';
import { actionContext } from '../context';
import { runAction } from '../action';
import { isOwnFile } from '../storage';
import { UserError } from '../errors';
import { logActivity } from '../audit';
import { recountInventoryTotals, queueAriPush } from '../services/inventory';
import { addDay } from '@/lib/format';

function revalidateRooms() {
  revalidatePath('/rooms', 'layout');
  revalidatePath('/dashboard');
}

const roomTypeSchema = z.object({
  id: z.string().uuid().optional().nullable(),
  name: z.string().trim().min(2, 'Enter a name'),
  code: z.string().trim().min(2, 'Short code, e.g. DDB').max(6).transform((v) => v.toUpperCase()),
  description: z.string().trim().max(500).optional().nullable(),
  baseOccupancy: z.number().int().min(1).max(10),
  maxAdults: z.number().int().min(1).max(10),
  maxChildren: z.number().int().min(0).max(10),
  maxExtraBeds: z.number().int().min(0).max(5),
  sizeSqft: z.number().int().min(0).max(10000).optional().nullable(),
  bedType: z.string().trim().max(60).optional().nullable(),
  amenities: z.array(z.string().trim().min(1)).max(40),
  photos: z.array(z.string().max(200)).max(12).default([]),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  isActive: z.boolean(),
});

export async function saveRoomTypeAction(input: z.input<typeof roomTypeSchema>) {
  return runAction(async () => {
    const ctx = await actionContext('rooms.manage');
    const data = roomTypeSchema.parse(input);
    const [clash] = await db
      .select({ id: roomTypes.id })
      .from(roomTypes)
      .where(and(eq(roomTypes.propertyId, ctx.propertyId), eq(roomTypes.code, data.code), data.id ? ne(roomTypes.id, data.id) : undefined));
    if (clash) throw new UserError(`The code ${data.code} is already used by another room type.`);
    const values = {
      ...data,
      id: undefined,
      sizeSqft: data.sizeSqft ?? null,
      description: data.description ?? null,
      bedType: data.bedType ?? null,
      photos: data.photos.filter((url) => isOwnFile(url, ctx.propertyId, 'rooms')),
    };
    if (data.id) {
      const [before] = await db.select().from(roomTypes).where(and(eq(roomTypes.id, data.id), eq(roomTypes.propertyId, ctx.propertyId)));
      if (!before) throw new UserError('Room type not found.');
      await db.update(roomTypes).set(values).where(eq(roomTypes.id, data.id));
      await logActivity({ propertyId: ctx.propertyId, userId: ctx.userId, entityType: 'room_type', entityId: data.id, action: 'update', summary: `Updated room type ${data.name}`, before, after: values });
      revalidateRooms();
      return { id: data.id };
    }
    const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(roomTypes).where(eq(roomTypes.propertyId, ctx.propertyId));
    const [created] = await db
      .insert(roomTypes)
      .values({ ...values, propertyId: ctx.propertyId, sortOrder: count })
      .returning({ id: roomTypes.id });
    await logActivity({ propertyId: ctx.propertyId, userId: ctx.userId, entityType: 'room_type', entityId: created.id, action: 'create', summary: `Added room type ${data.name}` });
    revalidateRooms();
    return { id: created.id };
  }, 'Room type saved.');
}

/** Parse "201-205, 210, G1" into individual room numbers. */
function parseRoomNumbers(value: string): string[] {
  const out: string[] = [];
  for (const part of value.split(/[,\s]+/).filter(Boolean)) {
    const range = part.match(/^([A-Za-z]*)(\d+)-(?:[A-Za-z]*)(\d+)$/);
    if (range) {
      const [, prefix, a, b] = range;
      const start = Number(a);
      const end = Number(b);
      if (end < start || end - start > 200) throw new UserError(`"${part}" is not a valid range.`);
      for (let n = start; n <= end; n++) out.push(`${prefix}${String(n).padStart(a.length, '0')}`);
    } else {
      out.push(part.toUpperCase());
    }
  }
  return [...new Set(out)];
}

const addRoomsSchema = z.object({
  roomTypeId: z.string().uuid(),
  numbers: z.string().trim().min(1, 'Enter room numbers, e.g. 201-205, 210'),
  floor: z.string().trim().max(20).optional().nullable(),
});

export async function addRoomsAction(input: z.input<typeof addRoomsSchema>) {
  return runAction(async () => {
    const ctx = await actionContext('rooms.manage');
    const data = addRoomsSchema.parse(input);
    const numbers = parseRoomNumbers(data.numbers);
    return db.transaction(async (tx) => {
      const [type] = await tx.select().from(roomTypes).where(and(eq(roomTypes.id, data.roomTypeId), eq(roomTypes.propertyId, ctx.propertyId)));
      if (!type) throw new UserError('Room type not found.');
      const existing = await tx
        .select({ number: rooms.number })
        .from(rooms)
        .where(and(eq(rooms.propertyId, ctx.propertyId), inArray(rooms.number, numbers)));
      if (existing.length) throw new UserError(`Room ${existing.map((e) => e.number).join(', ')} already exists.`);
      await tx.insert(rooms).values(numbers.map((number, i) => ({ propertyId: ctx.propertyId, roomTypeId: type.id, number, floor: data.floor || null, sortOrder: 100 + i })));
      await recountInventoryTotals(tx, ctx.propertyId, type.id, ctx.property.businessDate);
      await queueAriPush(tx, ctx.propertyId, { roomTypeId: type.id, from: ctx.property.businessDate, to: addDay(ctx.property.businessDate, 365), kind: 'availability' });
      await logActivity({ propertyId: ctx.propertyId, userId: ctx.userId, entityType: 'room', action: 'create', summary: `Added room${numbers.length > 1 ? 's' : ''} ${numbers.join(', ')} to ${type.name}` }, tx);
      revalidateRooms();
      return { added: numbers.length };
    });
  });
}

const roomSchema = z.object({
  id: z.string().uuid(),
  number: z.string().trim().min(1).max(10),
  floor: z.string().trim().max(20).optional().nullable(),
  roomTypeId: z.string().uuid(),
  isActive: z.boolean(),
  notes: z.string().trim().max(300).optional().nullable(),
});

export async function updateRoomAction(input: z.input<typeof roomSchema>) {
  return runAction(async () => {
    const ctx = await actionContext('rooms.manage');
    const data = roomSchema.parse(input);
    return db.transaction(async (tx) => {
      const [before] = await tx.select().from(rooms).where(and(eq(rooms.id, data.id), eq(rooms.propertyId, ctx.propertyId)));
      if (!before) throw new UserError('Room not found.');
      const [clash] = await tx.select({ id: rooms.id }).from(rooms).where(and(eq(rooms.propertyId, ctx.propertyId), eq(rooms.number, data.number), ne(rooms.id, data.id)));
      if (clash) throw new UserError(`Room ${data.number} already exists.`);
      await tx
        .update(rooms)
        .set({ number: data.number, floor: data.floor || null, roomTypeId: data.roomTypeId, isActive: data.isActive, notes: data.notes || null })
        .where(eq(rooms.id, data.id));
      const affected = [...new Set([before.roomTypeId, data.roomTypeId])];
      if (before.roomTypeId !== data.roomTypeId || before.isActive !== data.isActive) {
        for (const typeId of affected) {
          await recountInventoryTotals(tx, ctx.propertyId, typeId, ctx.property.businessDate);
          await queueAriPush(tx, ctx.propertyId, { roomTypeId: typeId, from: ctx.property.businessDate, to: addDay(ctx.property.businessDate, 365), kind: 'availability' });
        }
      }
      await logActivity({ propertyId: ctx.propertyId, userId: ctx.userId, entityType: 'room', entityId: data.id, action: 'update', summary: `Updated room ${data.number}`, before, after: data }, tx);
      revalidateRooms();
      return { id: data.id };
    });
  }, 'Room saved.');
}

const money = z.number().min(0).max(1_000_000);
const ratePlanSchema = z.object({
  id: z.string().uuid().optional().nullable(),
  roomTypeId: z.string().uuid(),
  name: z.string().trim().min(2, 'Enter a name'),
  mealPlan: z.enum(MEAL_PLANS),
  price1: money,
  price2: money,
  price3: money,
  extraBed: money,
  childPrice: money,
  cancellationPolicy: z.string().trim().max(1000).optional().nullable(),
  isDefault: z.boolean(),
  isActive: z.boolean(),
});

export async function saveRatePlanAction(input: z.input<typeof ratePlanSchema>) {
  return runAction(async () => {
    const ctx = await actionContext('rooms.manage');
    const data = ratePlanSchema.parse(input);
    return db.transaction(async (tx) => {
      const [type] = await tx.select({ id: roomTypes.id, name: roomTypes.name }).from(roomTypes).where(and(eq(roomTypes.id, data.roomTypeId), eq(roomTypes.propertyId, ctx.propertyId)));
      if (!type) throw new UserError('Room type not found.');
      if (data.isDefault) await tx.update(ratePlans).set({ isDefault: false }).where(eq(ratePlans.roomTypeId, data.roomTypeId));
      const values = { ...data, id: undefined, cancellationPolicy: data.cancellationPolicy || null };
      let id = data.id;
      if (id) {
        const [before] = await tx.select().from(ratePlans).where(and(eq(ratePlans.id, id), eq(ratePlans.propertyId, ctx.propertyId)));
        if (!before) throw new UserError('Rate plan not found.');
        await tx.update(ratePlans).set(values).where(eq(ratePlans.id, id));
        await logActivity({ propertyId: ctx.propertyId, userId: ctx.userId, entityType: 'rate_plan', entityId: id, action: 'update', summary: `Updated rate plan ${type.name} · ${data.name}`, before, after: values }, tx);
      } else {
        const [created] = await tx.insert(ratePlans).values({ ...values, propertyId: ctx.propertyId }).returning({ id: ratePlans.id });
        id = created.id;
        await logActivity({ propertyId: ctx.propertyId, userId: ctx.userId, entityType: 'rate_plan', entityId: id, action: 'create', summary: `Added rate plan ${type.name} · ${data.name} (${data.mealPlan})` }, tx);
      }
      await queueAriPush(tx, ctx.propertyId, { roomTypeId: type.id, from: ctx.property.businessDate, to: addDay(ctx.property.businessDate, 365), kind: 'rates' });
      revalidateRooms();
      return { id };
    });
  }, 'Rate plan saved.');
}
