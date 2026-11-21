'use server';

import { revalidatePath } from 'next/cache';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/db';
import { posCategories, posMenuItems, posTables } from '@/db/schema';
import { actionContext } from '../context';
import { runAction } from '../action';
import { UserError } from '../errors';
import { actorFromContext } from '../services/actor';
import { billOrder, closeDay, reopenOrder, restoreOrder, sendKot, setDiscount, settleOrder, voidItem, voidOrder } from '../services/pos';

function refresh() {
  revalidatePath('/restaurant', 'layout');
  revalidatePath('/dashboard');
}

const kotSchema = z.object({
  orderId: z.string().uuid().nullable().optional(),
  meta: z
    .object({
      outletId: z.string().uuid(),
      orderType: z.enum(['dine_in', 'take_away', 'room', 'in_house']),
      tableId: z.string().uuid().nullable().optional(),
      bookingId: z.string().uuid().nullable().optional(),
      roomId: z.string().uuid().nullable().optional(),
      guestName: z.string().max(80).nullable().optional(),
      covers: z.number().int().min(1).max(50).optional(),
    })
    .optional(),
  items: z.array(z.object({ menuItemId: z.string().uuid(), quantity: z.number().int().min(1).max(99), notes: z.string().max(120).nullable().optional() })),
});

export async function sendKotAction(input: z.input<typeof kotSchema>) {
  return runAction(async () => {
    const ctx = await actionContext('pos.use');
    const result = await sendKot(actorFromContext(ctx), kotSchema.parse(input));
    refresh();
    return result;
  });
}

export async function voidItemAction(itemId: string, reason: string) {
  return runAction(async () => {
    const ctx = await actionContext('pos.void');
    const result = await voidItem(actorFromContext(ctx), itemId, reason);
    refresh();
    return result;
  }, 'Item voided.');
}

export async function setDiscountAction(orderId: string, discount: number) {
  return runAction(async () => {
    const ctx = await actionContext('pos.manage');
    await setDiscount(actorFromContext(ctx), orderId, discount);
    refresh();
    return { ok: true };
  }, 'Discount applied.');
}

export async function billOrderAction(orderId: string) {
  return runAction(async () => {
    const ctx = await actionContext('pos.use');
    const result = await billOrder(actorFromContext(ctx), orderId);
    refresh();
    return result;
  });
}

export async function reopenOrderAction(orderId: string) {
  return runAction(async () => {
    const ctx = await actionContext('pos.use');
    await reopenOrder(actorFromContext(ctx), orderId);
    refresh();
    return { ok: true };
  });
}

export async function settleOrderAction(orderId: string, mode: 'cash' | 'card' | 'upi' | 'room_transfer' | 'complimentary', bookingId?: string | null) {
  return runAction(async () => {
    const ctx = await actionContext('pos.use');
    if (mode === 'complimentary' && !ctx.can('pos.manage')) throw new UserError('Only a manager can mark a bill complimentary.');
    const result = await settleOrder(actorFromContext(ctx), orderId, { mode, bookingId });
    refresh();
    revalidatePath('/front-desk', 'layout');
    return result;
  });
}

export async function voidOrderAction(orderId: string, reason: string) {
  return runAction(async () => {
    const ctx = await actionContext('pos.void');
    const result = await voidOrder(actorFromContext(ctx), orderId, reason);
    refresh();
    return result;
  }, 'Order voided.');
}

export async function restoreOrderAction(orderId: string) {
  return runAction(async () => {
    const ctx = await actionContext('pos.void');
    const result = await restoreOrder(actorFromContext(ctx), z.string().uuid().parse(orderId));
    refresh();
    return result;
  }, 'Order restored.');
}

export async function closeDayAction(outletId: string) {
  return runAction(async () => {
    const ctx = await actionContext('pos.manage');
    const totals = await closeDay(actorFromContext(ctx), outletId);
    refresh();
    revalidatePath('/money', 'layout');
    return totals;
  });
}

/* ───────── menu & tables ───────── */

const itemSchema = z.object({
  id: z.string().uuid().nullable().optional(),
  outletId: z.string().uuid(),
  categoryId: z.string().uuid().nullable().optional(),
  name: z.string().trim().min(2),
  price: z.number().min(0),
  taxRate: z.number().min(0).max(28),
  isVeg: z.boolean(),
  isAvailable: z.boolean(),
});

export async function saveMenuItemAction(input: z.input<typeof itemSchema>) {
  return runAction(async () => {
    const ctx = await actionContext('pos.manage');
    const data = itemSchema.parse(input);
    const values = { outletId: data.outletId, categoryId: data.categoryId || null, name: data.name, price: data.price, taxRate: data.taxRate, isVeg: data.isVeg, isAvailable: data.isAvailable };
    if (data.id) await db.update(posMenuItems).set(values).where(and(eq(posMenuItems.id, data.id), eq(posMenuItems.propertyId, ctx.propertyId)));
    else await db.insert(posMenuItems).values({ ...values, propertyId: ctx.propertyId, sortOrder: 999 });
    refresh();
    return { ok: true };
  }, 'Menu saved.');
}

export async function toggleAvailabilityAction(id: string, isAvailable: boolean) {
  return runAction(async () => {
    const ctx = await actionContext('pos.use');
    await db.update(posMenuItems).set({ isAvailable }).where(and(eq(posMenuItems.id, id), eq(posMenuItems.propertyId, ctx.propertyId)));
    refresh();
    return { ok: true };
  }, isAvailable ? 'Back on the menu.' : 'Marked as finished for today.');
}

export async function saveCategoryAction(outletId: string, name: string) {
  return runAction(async () => {
    const ctx = await actionContext('pos.manage');
    if (name.trim().length < 2) throw new UserError('Enter a category name.');
    await db.insert(posCategories).values({ propertyId: ctx.propertyId, outletId, name: name.trim(), sortOrder: 99 });
    refresh();
    return { ok: true };
  }, 'Category added.');
}

export async function saveTableAction(outletId: string, name: string, seats: number) {
  return runAction(async () => {
    const ctx = await actionContext('pos.manage');
    if (!name.trim()) throw new UserError('Enter a table name.');
    await db.insert(posTables).values({ propertyId: ctx.propertyId, outletId, name: name.trim(), seats, sortOrder: 99 });
    refresh();
    return { ok: true };
  }, 'Table added.');
}

export async function removeTableAction(id: string) {
  return runAction(async () => {
    const ctx = await actionContext('pos.manage');
    await db.update(posTables).set({ isActive: false }).where(and(eq(posTables.id, id), eq(posTables.propertyId, ctx.propertyId)));
    refresh();
    return { ok: true };
  }, 'Table removed.');
}
