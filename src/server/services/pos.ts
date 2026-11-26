import 'server-only';
import { and, asc, desc, eq, inArray, ne, sql } from 'drizzle-orm';
import { db, type Tx } from '@/db';
import {
  activityLog,
  bookingRooms,
  bookings,
  folioLines,
  guests,
  posCategories,
  posDayCloses,
  posMenuItems,
  posOrderItems,
  posOrders,
  posOutlets,
  posTables,
  rooms,
  users,
} from '@/db/schema';
import { financialYear, formatINR } from '@/lib/format';
import { SAC_RESTAURANT, splitTax } from '@/lib/gst';
import { round2 } from '@/lib/utils';
import { UserError } from '../errors';
import { logActivity, nextCounter } from '../audit';
import type { Actor } from './actor';

export async function getPosTerminal(propertyId: string, outletId?: string) {
  const outlets = await db.select().from(posOutlets).where(and(eq(posOutlets.propertyId, propertyId), eq(posOutlets.isActive, true))).orderBy(asc(posOutlets.createdAt));
  const outlet = outlets.find((o) => o.id === outletId) ?? outlets[0];
  if (!outlet) return null;
  const [categories, items, tables, openOrders, inHouse] = await Promise.all([
    db.select().from(posCategories).where(eq(posCategories.outletId, outlet.id)).orderBy(asc(posCategories.sortOrder)),
    db.select().from(posMenuItems).where(eq(posMenuItems.outletId, outlet.id)).orderBy(asc(posMenuItems.sortOrder), asc(posMenuItems.name)),
    db.select().from(posTables).where(and(eq(posTables.outletId, outlet.id), eq(posTables.isActive, true))).orderBy(asc(posTables.sortOrder)),
    db
      .select({ order: posOrders, roomNumber: rooms.number, tableName: posTables.name })
      .from(posOrders)
      .leftJoin(rooms, eq(rooms.id, posOrders.roomId))
      .leftJoin(posTables, eq(posTables.id, posOrders.tableId))
      .where(and(eq(posOrders.outletId, outlet.id), inArray(posOrders.status, ['open', 'billed'])))
      .orderBy(asc(posOrders.createdAt)),
    db
      .select({ bookingId: bookings.id, bookingNo: bookings.bookingNo, roomId: rooms.id, roomNumber: rooms.number, guestName: guests.name })
      .from(bookingRooms)
      .innerJoin(bookings, eq(bookings.id, bookingRooms.bookingId))
      .innerJoin(guests, eq(guests.id, bookings.guestId))
      .innerJoin(rooms, eq(rooms.id, bookingRooms.roomId))
      .where(and(eq(bookingRooms.propertyId, propertyId), eq(bookingRooms.status, 'in_house')))
      .orderBy(asc(rooms.number)),
  ]);
  const orderIds = openOrders.map((o) => o.order.id);
  const orderItems = orderIds.length ? await db.select().from(posOrderItems).where(inArray(posOrderItems.orderId, orderIds)).orderBy(asc(posOrderItems.createdAt)) : [];
  return {
    outlets: outlets.map((o) => ({ id: o.id, name: o.name })),
    outlet,
    categories,
    items,
    tables,
    inHouse,
    orders: openOrders.map((o) => ({ ...o.order, roomNumber: o.roomNumber, tableName: o.tableName, items: orderItems.filter((i) => i.orderId === o.order.id) })),
  };
}

async function recalc(tx: Tx, orderId: string) {
  const items = await tx.select().from(posOrderItems).where(and(eq(posOrderItems.orderId, orderId), ne(posOrderItems.status, 'void')));
  const [order] = await tx.select().from(posOrders).where(eq(posOrders.id, orderId));
  const subtotal = round2(items.reduce((t, i) => t + i.amount, 0));
  const discount = Math.min(order.discount, subtotal);
  const factor = subtotal > 0 ? (subtotal - discount) / subtotal : 1;
  let cgst = 0;
  let sgst = 0;
  for (const item of items) {
    const split = splitTax(item.amount * factor, item.taxRate);
    cgst += split.cgst;
    sgst += split.sgst;
  }
  cgst = round2(cgst);
  sgst = round2(sgst);
  await tx.update(posOrders).set({ subtotal, cgst, sgst, total: round2(subtotal - discount + cgst + sgst) }).where(eq(posOrders.id, orderId));
}

export interface OrderMeta {
  outletId: string;
  orderType: 'dine_in' | 'take_away' | 'room' | 'in_house';
  tableId?: string | null;
  bookingId?: string | null;
  roomId?: string | null;
  guestName?: string | null;
  covers?: number;
}

/** Add items to an order (creating it if needed) and send them to the kitchen as one KOT. */
export async function sendKot(actor: Actor, input: { orderId?: string | null; meta?: OrderMeta; items: { menuItemId: string; quantity: number; notes?: string | null }[] }) {
  if (input.items.length === 0) throw new UserError('Add at least one item.');
  return db.transaction(async (tx) => {
    let orderId = input.orderId ?? null;
    if (!orderId) {
      const meta = input.meta;
      if (!meta) throw new UserError('Choose a table, room or take-away first.');
      if (meta.orderType === 'dine_in' && !meta.tableId) throw new UserError('Choose a table.');
      if (meta.orderType === 'room' && !meta.bookingId) throw new UserError('Choose the in-house guest.');
      const serial = await nextCounter(tx, actor.propertyId, 'kot');
      const [created] = await tx
        .insert(posOrders)
        .values({
          propertyId: actor.propertyId,
          outletId: meta.outletId,
          orderNo: `KOT${String(serial).padStart(5, '0')}`,
          orderType: meta.orderType,
          tableId: meta.tableId ?? null,
          bookingId: meta.bookingId ?? null,
          roomId: meta.roomId ?? null,
          guestName: meta.guestName ?? null,
          covers: meta.covers ?? 1,
          businessDate: actor.businessDate,
          createdBy: actor.userId,
        })
        .returning({ id: posOrders.id });
      orderId = created.id;
    }
    const [order] = await tx.select().from(posOrders).where(and(eq(posOrders.id, orderId), eq(posOrders.propertyId, actor.propertyId))).for('update');
    if (!order) throw new UserError('Order not found.');
    if (order.status !== 'open') throw new UserError('This order is already billed. Re-open it to add items.');
    const menu = await tx.select().from(posMenuItems).where(inArray(posMenuItems.id, input.items.map((i) => i.menuItemId)));
    const kotNo = order.kotCount + 1;
    for (const line of input.items) {
      const item = menu.find((m) => m.id === line.menuItemId);
      if (!item) throw new UserError('Menu item not found.');
      if (!item.isAvailable) throw new UserError(`${item.name} is not available right now.`);
      await tx.insert(posOrderItems).values({
        propertyId: actor.propertyId,
        orderId,
        menuItemId: item.id,
        name: item.name,
        quantity: line.quantity,
        price: item.price,
        taxRate: item.taxRate,
        amount: round2(item.price * line.quantity),
        notes: line.notes ?? null,
        kotNo,
        status: 'sent',
      });
    }
    await tx.update(posOrders).set({ kotCount: kotNo }).where(eq(posOrders.id, orderId));
    await recalc(tx, orderId);
    return { orderId, orderNo: order.orderNo, kotNo };
  });
}

export async function voidItem(actor: Actor, itemId: string, reason: string) {
  return db.transaction(async (tx) => {
    const [item] = await tx.select().from(posOrderItems).where(and(eq(posOrderItems.id, itemId), eq(posOrderItems.propertyId, actor.propertyId)));
    if (!item) throw new UserError('Item not found.');
    const [order] = await tx.select().from(posOrders).where(eq(posOrders.id, item.orderId)).for('update');
    if (order.status !== 'open') throw new UserError('Re-open the bill to change items.');
    await tx.update(posOrderItems).set({ status: 'void', notes: `VOID: ${reason}` }).where(eq(posOrderItems.id, itemId));
    await recalc(tx, order.id);
    const logId = await logActivity(
      {
        propertyId: actor.propertyId,
        userId: actor.userId,
        entityType: 'pos_order',
        entityId: order.id,
        action: 'void_item',
        summary: `Voided ${item.quantity} × ${item.name} on ${order.orderNo} · ${reason}`,
        before: { itemId: item.id, status: item.status, notes: item.notes },
      },
      tx,
    );
    return { logId };
  });
}

/** Undo a voided item while the order is still open. */
export async function restoreItem(actor: Actor, snapshot: { itemId: string; status: string; notes: string | null }, tx: Tx) {
  const [item] = await tx.select().from(posOrderItems).where(and(eq(posOrderItems.id, snapshot.itemId), eq(posOrderItems.propertyId, actor.propertyId)));
  if (!item || item.status !== 'void') throw new UserError('This item is not void any more.');
  const [order] = await tx.select().from(posOrders).where(eq(posOrders.id, item.orderId)).for('update');
  if (order.status !== 'open') throw new UserError('The bill is already printed or closed. Re-open it to change items.');
  await tx
    .update(posOrderItems)
    .set({ status: snapshot.status as typeof item.status, notes: snapshot.notes })
    .where(eq(posOrderItems.id, item.id));
  await recalc(tx, order.id);
  await logActivity({ propertyId: actor.propertyId, userId: actor.userId, entityType: 'pos_order', entityId: order.id, action: 'restore_item', summary: `Restored ${item.quantity} × ${item.name} on ${order.orderNo}` }, tx);
}

export async function setDiscount(actor: Actor, orderId: string, discount: number) {
  return db.transaction(async (tx) => {
    const [order] = await tx.select().from(posOrders).where(and(eq(posOrders.id, orderId), eq(posOrders.propertyId, actor.propertyId))).for('update');
    if (!order || order.status === 'settled' || order.status === 'void') throw new UserError('Order not found or already closed.');
    await tx.update(posOrders).set({ discount: round2(Math.max(0, discount)) }).where(eq(posOrders.id, orderId));
    await recalc(tx, orderId);
  });
}

/** Bill number: a separate GST series for the restaurant, per financial year. */
export async function billOrder(actor: Actor, orderId: string) {
  return db.transaction(async (tx) => {
    const [order] = await tx.select().from(posOrders).where(and(eq(posOrders.id, orderId), eq(posOrders.propertyId, actor.propertyId))).for('update');
    if (!order) throw new UserError('Order not found.');
    if (order.status === 'settled' || order.status === 'void') throw new UserError('This order is closed.');
    if (order.total <= 0) throw new UserError('The order is empty.');
    if (!order.billNo) {
      const fy = financialYear(actor.businessDate);
      const [outlet] = await tx.select({ code: posOutlets.code }).from(posOutlets).where(eq(posOutlets.id, order.outletId));
      // One consecutive bill series per outlet and financial year (GST).
      const serial = await nextCounter(tx, actor.propertyId, `posbill:${outlet.code}:${fy}`);
      await tx.update(posOrders).set({ billNo: `${outlet.code}/${fy.slice(2)}/${String(serial).padStart(5, '0')}`, status: 'billed' }).where(eq(posOrders.id, orderId));
    } else {
      await tx.update(posOrders).set({ status: 'billed' }).where(eq(posOrders.id, orderId));
    }
    const [updated] = await tx.select({ billNo: posOrders.billNo }).from(posOrders).where(eq(posOrders.id, orderId));
    return { billNo: updated.billNo! };
  });
}

export async function reopenOrder(actor: Actor, orderId: string) {
  await db
    .update(posOrders)
    .set({ status: 'open' })
    .where(and(eq(posOrders.id, orderId), eq(posOrders.propertyId, actor.propertyId), eq(posOrders.status, 'billed')));
}

/** Settle a bill. Room Transfer posts it to the in-house guest's folio, so it is paid at check-out. */
export async function settleOrder(actor: Actor, orderId: string, input: { mode: 'cash' | 'card' | 'upi' | 'room_transfer' | 'complimentary'; bookingId?: string | null }) {
  const { billNo } = await billOrder(actor, orderId);
  return db.transaction(async (tx) => {
    const [order] = await tx.select().from(posOrders).where(and(eq(posOrders.id, orderId), eq(posOrders.propertyId, actor.propertyId))).for('update');
    if (input.mode === 'room_transfer') {
      const bookingId = input.bookingId ?? order.bookingId;
      if (!bookingId) throw new UserError('Choose the in-house guest to transfer this bill to.');
      const [booking] = await tx.select().from(bookings).where(and(eq(bookings.id, bookingId), eq(bookings.propertyId, actor.propertyId)));
      if (!booking || booking.status !== 'checked_in') throw new UserError('Room transfer works only for in-house guests.');
      const subtotalAfterDiscount = round2(order.subtotal - order.discount);
      await tx.insert(folioLines).values({
        propertyId: actor.propertyId,
        bookingId,
        businessDate: actor.businessDate,
        type: 'pos',
        description: `Restaurant bill ${billNo}`,
        amount: subtotalAfterDiscount,
        taxRate: subtotalAfterDiscount > 0 ? round2(((order.cgst + order.sgst) / subtotalAfterDiscount) * 100) : 0,
        cgst: order.cgst,
        sgst: order.sgst,
        total: order.total,
        hsnSac: SAC_RESTAURANT,
        posOrderId: order.id,
        postedBy: actor.userId,
      });
      if (!order.bookingId) await tx.update(posOrders).set({ bookingId }).where(eq(posOrders.id, orderId));
    }
    await tx.update(posOrders).set({ status: 'settled', settlementMode: input.mode, settledAt: new Date() }).where(eq(posOrders.id, orderId));
    await logActivity(
      { propertyId: actor.propertyId, userId: actor.userId, entityType: 'pos_order', entityId: orderId, action: 'settle', summary: `Settled ${billNo} · ${formatINR(order.total)} by ${input.mode.replace('_', ' ')}` },
      tx,
    );
    return { billNo, total: order.total };
  });
}

export async function voidOrder(actor: Actor, orderId: string, reason: string) {
  return db.transaction(async (tx) => {
    const [order] = await tx.select().from(posOrders).where(and(eq(posOrders.id, orderId), eq(posOrders.propertyId, actor.propertyId))).for('update');
    if (!order) throw new UserError('Order not found.');
    if (order.status === 'void') throw new UserError('This order is already void.');
    const roomTransfer = order.status === 'settled' && order.settlementMode === 'room_transfer';
    if (roomTransfer) {
      await tx.update(folioLines).set({ isVoid: true, voidReason: `POS void: ${reason}` }).where(and(eq(folioLines.posOrderId, orderId), eq(folioLines.isVoid, false)));
    }
    await tx.update(posOrders).set({ status: 'void', voidReason: reason }).where(eq(posOrders.id, orderId));
    const logId = await logActivity(
      {
        propertyId: actor.propertyId,
        userId: actor.userId,
        entityType: 'pos_order',
        entityId: orderId,
        action: 'void',
        summary: `Voided ${order.orderNo} (${formatINR(order.total)}) · ${reason}`,
        before: { orderId, status: order.status, settlementMode: order.settlementMode, roomTransfer },
      },
      tx,
    );
    return { logId };
  });
}

/**
 * Undo a voided order: back to the state it had (open, billed or settled). Only on the same business day and before
 * the restaurant day is closed, so closed-day totals never change. A room-transfer bill goes back on the guest's bill.
 */
export async function restoreOrder(actor: Actor, orderId: string, tx?: Tx) {
  const run = async (t: Tx) => {
    const [order] = await t.select().from(posOrders).where(and(eq(posOrders.id, orderId), eq(posOrders.propertyId, actor.propertyId))).for('update');
    if (!order) throw new UserError('Order not found.');
    if (order.status !== 'void') throw new UserError('This order is not void.');
    if (order.businessDate !== actor.businessDate) throw new UserError('Only orders from today’s business date can be restored.');
    const [closed] = await t.select({ id: posDayCloses.id }).from(posDayCloses).where(and(eq(posDayCloses.outletId, order.outletId), eq(posDayCloses.businessDate, order.businessDate)));
    if (closed) throw new UserError('The restaurant day is already closed.');
    // What it was before the void: the last void log for this order holds the snapshot.
    const [log] = await t
      .select({ before: activityLog.before })
      .from(activityLog)
      .where(and(eq(activityLog.propertyId, actor.propertyId), eq(activityLog.entityType, 'pos_order'), eq(activityLog.entityId, order.id), eq(activityLog.action, 'void')))
      .orderBy(desc(activityLog.createdAt))
      .limit(1);
    const before = (log?.before ?? { status: order.billNo ? 'billed' : 'open', settlementMode: null, roomTransfer: false }) as { status: typeof order.status; settlementMode: typeof order.settlementMode; roomTransfer: boolean };
    if (before.roomTransfer) {
      const lines = await t.select({ bookingId: folioLines.bookingId }).from(folioLines).where(eq(folioLines.posOrderId, order.id));
      for (const { bookingId } of lines) {
        const [booking] = await t.select({ status: bookings.status, bookingNo: bookings.bookingNo }).from(bookings).where(eq(bookings.id, bookingId));
        if (booking?.status === 'checked_out') throw new UserError(`${booking.bookingNo} has checked out, so the bill cannot go back on the room.`);
      }
      await t.update(folioLines).set({ isVoid: false, voidReason: null }).where(and(eq(folioLines.posOrderId, order.id), sql`${folioLines.voidReason} LIKE 'POS void:%'`));
    }
    await t.update(posOrders).set({ status: before.status, settlementMode: before.settlementMode, voidReason: null }).where(eq(posOrders.id, order.id));
    await logActivity({ propertyId: actor.propertyId, userId: actor.userId, entityType: 'pos_order', entityId: order.id, action: 'restore', summary: `Restored ${order.orderNo} (${formatINR(order.total)})` }, t);
    return { orderNo: order.orderNo };
  };
  return tx ? run(tx) : db.transaction(run);
}

export async function dayTotals(outletId: string, businessDate: string) {
  const rows = await db
    .select({ mode: posOrders.settlementMode, status: posOrders.status, n: sql<number>`count(*)::int`, total: sql<number>`COALESCE(sum(${posOrders.total}), 0)::float` })
    .from(posOrders)
    .where(and(eq(posOrders.outletId, outletId), eq(posOrders.businessDate, businessDate)))
    .groupBy(posOrders.settlementMode, posOrders.status);
  const totals: Record<string, number> = { cash: 0, card: 0, upi: 0, room_transfer: 0, complimentary: 0, orders: 0, open: 0, void: 0, total: 0 };
  for (const r of rows) {
    if (r.status === 'void') totals.void += r.n;
    else if (r.status === 'settled' && r.mode) {
      totals[r.mode] = round2((totals[r.mode] ?? 0) + r.total);
      totals.total = round2(totals.total + r.total);
      totals.orders += r.n;
    } else totals.open += r.n;
  }
  return totals;
}

export async function closeDay(actor: Actor, outletId: string) {
  const totals = await dayTotals(outletId, actor.businessDate);
  if (totals.open > 0) throw new UserError(`${totals.open} order${totals.open === 1 ? ' is' : 's are'} still open. Settle or void them first.`);
  const [existing] = await db.select({ id: posDayCloses.id }).from(posDayCloses).where(and(eq(posDayCloses.outletId, outletId), eq(posDayCloses.businessDate, actor.businessDate)));
  if (existing) throw new UserError('This day is already closed for the outlet.');
  await db.insert(posDayCloses).values({ propertyId: actor.propertyId, outletId, businessDate: actor.businessDate, totals, closedBy: actor.userId });
  await logActivity({ propertyId: actor.propertyId, userId: actor.userId, entityType: 'pos_day', entityId: outletId, action: 'close', summary: `Restaurant day closed · ${formatINR(totals.total)} · ${totals.orders} bills` });
  return totals;
}

export async function listOrders(propertyId: string, filters: { from: string; to: string; mode?: string; type?: string; status?: string; outletId?: string }) {
  return db
    .select({
      id: posOrders.id,
      orderNo: posOrders.orderNo,
      billNo: posOrders.billNo,
      orderType: posOrders.orderType,
      status: posOrders.status,
      settlementMode: posOrders.settlementMode,
      total: posOrders.total,
      subtotal: posOrders.subtotal,
      cgst: posOrders.cgst,
      sgst: posOrders.sgst,
      discount: posOrders.discount,
      businessDate: posOrders.businessDate,
      createdAt: posOrders.createdAt,
      guestName: posOrders.guestName,
      tableName: posTables.name,
      roomNumber: rooms.number,
      createdBy: users.name,
      items: sql<string>`(SELECT string_agg(i.quantity || '× ' || i.name, ', ') FROM pos_order_items i WHERE i.order_id = "pos_orders"."id" AND i.status <> 'void')`,
    })
    .from(posOrders)
    .leftJoin(posTables, eq(posTables.id, posOrders.tableId))
    .leftJoin(rooms, eq(rooms.id, posOrders.roomId))
    .leftJoin(users, eq(users.id, posOrders.createdBy))
    .where(
      and(
        eq(posOrders.propertyId, propertyId),
        filters.outletId ? eq(posOrders.outletId, filters.outletId) : undefined,
        sql`${posOrders.businessDate} BETWEEN ${filters.from}::date AND ${filters.to}::date`,
        filters.mode ? sql`${posOrders.settlementMode} = ${filters.mode}` : undefined,
        filters.type ? sql`${posOrders.orderType} = ${filters.type}` : undefined,
        filters.status ? sql`${posOrders.status} = ${filters.status}` : undefined,
      ),
    )
    .orderBy(desc(posOrders.createdAt))
    .limit(500);
}

/** Add or rename an outlet (restaurant, rooftop café, bar…). Each outlet has its own menu, tables and bill series. */
export async function saveOutlet(actor: Actor, input: { id?: string | null; name: string; code: string; defaultTaxRate: number }) {
  const code = input.code.trim().toUpperCase();
  if (!/^[A-Z]{2,5}$/.test(code)) throw new UserError('Bill prefix: 2 to 5 capital letters, e.g. RST or CAFE.');
  return db.transaction(async (tx) => {
    const [clash] = await tx
      .select({ id: posOutlets.id })
      .from(posOutlets)
      .where(and(eq(posOutlets.propertyId, actor.propertyId), eq(posOutlets.code, code), input.id ? ne(posOutlets.id, input.id) : undefined));
    if (clash) throw new UserError(`Another outlet already uses the bill prefix ${code}.`);
    if (input.id) {
      const [before] = await tx.select().from(posOutlets).where(and(eq(posOutlets.id, input.id), eq(posOutlets.propertyId, actor.propertyId)));
      if (!before) throw new UserError('Outlet not found.');
      if (before.code !== code) {
        const [billed] = await tx.select({ n: sql<number>`count(*)::int` }).from(posOrders).where(and(eq(posOrders.outletId, before.id), sql`${posOrders.billNo} IS NOT NULL`));
        if (billed.n > 0) throw new UserError('Bills were already printed with this prefix, so it cannot change. Rename the outlet instead.');
      }
      await tx.update(posOutlets).set({ name: input.name.trim(), code, defaultTaxRate: input.defaultTaxRate }).where(eq(posOutlets.id, before.id));
      await logActivity({ propertyId: actor.propertyId, userId: actor.userId, entityType: 'pos_outlet', entityId: before.id, action: 'update', summary: `Updated outlet ${input.name}` }, tx);
      return { id: before.id };
    }
    const [created] = await tx.insert(posOutlets).values({ propertyId: actor.propertyId, name: input.name.trim(), code, defaultTaxRate: input.defaultTaxRate }).returning({ id: posOutlets.id });
    await logActivity({ propertyId: actor.propertyId, userId: actor.userId, entityType: 'pos_outlet', entityId: created.id, action: 'create', summary: `Added outlet ${input.name} (bills ${code}/…)` }, tx);
    return { id: created.id };
  });
}

export async function listOutlets(propertyId: string) {
  return db
    .select({ id: posOutlets.id, name: posOutlets.name, code: posOutlets.code, defaultTaxRate: posOutlets.defaultTaxRate })
    .from(posOutlets)
    .where(and(eq(posOutlets.propertyId, propertyId), eq(posOutlets.isActive, true)))
    .orderBy(asc(posOutlets.createdAt));
}
