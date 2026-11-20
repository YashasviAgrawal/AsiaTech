import 'server-only';
import { and, asc, desc, eq, gte, inArray, lt, ne, sql } from 'drizzle-orm';
import { db } from '@/db';
import {
  bookingRooms,
  bookings,
  guests,
  hkChecklistItems,
  hkTasks,
  inventory,
  maintenanceTickets,
  propertyMembers,
  roles,
  rooms,
  roomTypes,
  users,
  type ChecklistResult,
  type HkCategory,
  type HkStatus,
} from '@/db/schema';
import { addDay, formatDayShort, stayDates } from '@/lib/format';
import { nameKey } from '@/lib/utils';
import { UserError } from '../errors';
import { logActivity, notify } from '../audit';
import type { Actor } from './actor';
import { ensureInventory, queueAriPush } from './inventory';

/* ───────────────────────────── board ───────────────────────────── */

export async function getHousekeepingBoard(propertyId: string, bizDate: string) {
  const [roomRows, stays, tasks, tickets] = await Promise.all([
    db
      .select({
        id: rooms.id,
        number: rooms.number,
        floor: rooms.floor,
        hkStatus: rooms.hkStatus,
        oooReason: rooms.oooReason,
        oooUntil: rooms.oooUntil,
        roomTypeId: rooms.roomTypeId,
        typeName: roomTypes.name,
        typeCode: roomTypes.code,
        typeColor: roomTypes.color,
      })
      .from(rooms)
      .innerJoin(roomTypes, eq(roomTypes.id, rooms.roomTypeId))
      .where(and(eq(rooms.propertyId, propertyId), eq(rooms.isActive, true)))
      .orderBy(asc(rooms.floor), asc(rooms.sortOrder), asc(rooms.number)),
    db
      .select({ roomId: bookingRooms.roomId, status: bookingRooms.status, checkIn: bookingRooms.checkIn, checkOut: bookingRooms.checkOut, guestName: guests.name, isVip: guests.isVip })
      .from(bookingRooms)
      .innerJoin(bookings, eq(bookings.id, bookingRooms.bookingId))
      .innerJoin(guests, eq(guests.id, bookings.guestId))
      .where(
        and(
          eq(bookingRooms.propertyId, propertyId),
          sql`${bookingRooms.roomId} IS NOT NULL`,
          sql`(${bookingRooms.status} = 'in_house' OR (${bookingRooms.status} = 'reserved' AND ${bookingRooms.checkIn} = ${bizDate}))`,
        ),
      ),
    db
      .select({ id: hkTasks.id, roomId: hkTasks.roomId, status: hkTasks.status, type: hkTasks.type, priority: hkTasks.priority, assignedTo: hkTasks.assignedTo, assigneeName: users.name })
      .from(hkTasks)
      .leftJoin(users, eq(users.id, hkTasks.assignedTo))
      .where(and(eq(hkTasks.propertyId, propertyId), inArray(hkTasks.status, ['pending', 'in_progress']))),
    db
      .select({ roomId: maintenanceTickets.roomId, n: sql<number>`count(*)::int` })
      .from(maintenanceTickets)
      .where(and(eq(maintenanceTickets.propertyId, propertyId), inArray(maintenanceTickets.status, ['open', 'in_progress'])))
      .groupBy(maintenanceTickets.roomId),
  ]);

  return roomRows.map((room) => {
    const inHouse = stays.find((s) => s.roomId === room.id && s.status === 'in_house');
    const arriving = stays.find((s) => s.roomId === room.id && s.status === 'reserved');
    const task = tasks.find((t) => t.roomId === room.id);
    return {
      ...room,
      occupancy: inHouse
        ? { kind: inHouse.checkOut <= bizDate ? ('departing' as const) : ('occupied' as const), guestName: inHouse.guestName, checkOut: inHouse.checkOut, isVip: inHouse.isVip }
        : arriving
          ? { kind: 'arriving' as const, guestName: arriving.guestName, checkOut: arriving.checkOut, isVip: arriving.isVip }
          : { kind: 'vacant' as const, guestName: null, checkOut: null, isVip: false },
      task: task ?? null,
      openTickets: tickets.find((t) => t.roomId === room.id)?.n ?? 0,
    };
  });
}

export type BoardRoom = Awaited<ReturnType<typeof getHousekeepingBoard>>[number];

export async function housekeepingStaff(propertyId: string) {
  return db
    .select({ id: users.id, name: users.name, roleKey: roles.key })
    .from(propertyMembers)
    .innerJoin(users, eq(users.id, propertyMembers.userId))
    .innerJoin(roles, eq(roles.id, propertyMembers.roleId))
    .where(and(eq(propertyMembers.propertyId, propertyId), eq(propertyMembers.isActive, true), inArray(roles.key, ['housekeeping', 'manager', 'front_desk'])))
    .orderBy(asc(users.name));
}

/**
 * Change a room's housekeeping status. Out of order blocks the room in inventory until `until`, so OTAs stop
 * selling it; bringing it back releases the remaining nights.
 */
export async function setRoomStatus(actor: Actor, roomId: string, status: HkStatus, opts: { reason?: string | null; until?: string | null } = {}) {
  return db.transaction(async (tx) => {
    const [room] = await tx.select().from(rooms).where(and(eq(rooms.id, roomId), eq(rooms.propertyId, actor.propertyId))).for('update');
    if (!room) throw new UserError('Room not found.');
    if (room.hkStatus === status && status !== 'out_of_order') return { number: room.number };

    if (room.hkStatus === 'out_of_order' && status !== 'out_of_order' && room.oooUntil && room.oooUntil > actor.businessDate) {
      // Release remaining blocked nights.
      await tx
        .update(inventory)
        .set({ blocked: sql`GREATEST(${inventory.blocked} - 1, 0)` })
        .where(and(eq(inventory.roomTypeId, room.roomTypeId), gte(inventory.date, actor.businessDate), lt(inventory.date, room.oooUntil)));
      await queueAriPush(tx, actor.propertyId, { roomTypeId: room.roomTypeId, from: actor.businessDate, to: addDay(room.oooUntil, -1), kind: 'availability' });
    }

    if (status === 'out_of_order') {
      const until = opts.until && opts.until > actor.businessDate ? opts.until : addDay(actor.businessDate, 1);
      const occupied = await tx
        .select({ id: bookingRooms.id })
        .from(bookingRooms)
        .where(and(eq(bookingRooms.roomId, roomId), inArray(bookingRooms.status, ['reserved', 'in_house']), sql`${bookingRooms.checkIn} < ${until}`, sql`${bookingRooms.checkOut} > ${actor.businessDate}`));
      if (occupied.length) throw new UserError(`Room ${room.number} has a guest or booking in that period. Move them on the Room Chart first.`);
      await ensureInventory(tx, actor.propertyId, actor.businessDate, addDay(until, -1), room.roomTypeId);
      const previousUntil = room.hkStatus === 'out_of_order' && room.oooUntil ? room.oooUntil : actor.businessDate;
      for (const date of stayDates(previousUntil > actor.businessDate ? previousUntil : actor.businessDate, until)) {
        await tx
          .update(inventory)
          .set({ blocked: sql`LEAST(${inventory.blocked} + 1, ${inventory.total} - ${inventory.booked})` })
          .where(and(eq(inventory.roomTypeId, room.roomTypeId), eq(inventory.date, date)));
      }
      await queueAriPush(tx, actor.propertyId, { roomTypeId: room.roomTypeId, from: actor.businessDate, to: addDay(until, -1), kind: 'availability' });
      await tx.update(rooms).set({ hkStatus: status, oooReason: opts.reason || 'Maintenance', oooUntil: until }).where(eq(rooms.id, roomId));
    } else {
      await tx.update(rooms).set({ hkStatus: status, oooReason: null, oooUntil: null }).where(eq(rooms.id, roomId));
    }

    if (status === 'clean' || status === 'inspected') {
      await tx
        .update(hkTasks)
        .set({ status: status === 'inspected' ? 'verified' : 'done', completedAt: new Date() })
        .where(and(eq(hkTasks.roomId, roomId), inArray(hkTasks.status, ['pending', 'in_progress'])));
    }
    await logActivity(
      {
        propertyId: actor.propertyId,
        userId: actor.userId,
        entityType: 'room',
        entityId: roomId,
        action: 'hk_status',
        summary: `Room ${room.number}: ${room.hkStatus.replace('_', ' ')} → ${status.replace('_', ' ')}${status === 'out_of_order' ? ` (${opts.reason || 'Maintenance'})` : ''}`,
      },
      tx,
    );
    return { number: room.number };
  });
}

export async function createTask(actor: Actor, input: { roomId: string; type: (typeof hkTasks.$inferInsert)['type']; assignedTo?: string | null; priority?: 'low' | 'normal' | 'high'; notes?: string | null }) {
  const [room] = await db.select({ id: rooms.id }).from(rooms).where(and(eq(rooms.id, input.roomId), eq(rooms.propertyId, actor.propertyId)));
  if (!room) throw new UserError('Room not found.');
  const [existing] = await db.select({ id: hkTasks.id }).from(hkTasks).where(and(eq(hkTasks.roomId, input.roomId), inArray(hkTasks.status, ['pending', 'in_progress'])));
  if (existing) {
    await db.update(hkTasks).set({ assignedTo: input.assignedTo ?? null, priority: input.priority ?? 'normal', type: input.type ?? 'checkout_clean' }).where(eq(hkTasks.id, existing.id));
    return { id: existing.id };
  }
  const [task] = await db
    .insert(hkTasks)
    .values({ propertyId: actor.propertyId, roomId: input.roomId, type: input.type ?? 'checkout_clean', assignedTo: input.assignedTo ?? null, priority: input.priority ?? 'normal', dueDate: actor.businessDate, notes: input.notes ?? null })
    .returning({ id: hkTasks.id });
  return { id: task.id };
}

export async function startTask(actor: Actor, taskId: string) {
  await db
    .update(hkTasks)
    .set({ status: 'in_progress', startedAt: new Date(), assignedTo: sql`COALESCE(${hkTasks.assignedTo}, ${actor.userId})` })
    .where(and(eq(hkTasks.id, taskId), eq(hkTasks.propertyId, actor.propertyId)));
}

/**
 * Finish a cleaning/inspection: every checklist item gets OK / Problem / Missing. Problems and missing items
 * open a repair ticket automatically; the room becomes Clean (or Inspected when a supervisor inspects).
 */
export async function completeTask(actor: Actor, taskId: string, input: { results: ChecklistResult[]; notes?: string | null; inspect?: boolean }) {
  return db.transaction(async (tx) => {
    const [task] = await tx.select().from(hkTasks).where(and(eq(hkTasks.id, taskId), eq(hkTasks.propertyId, actor.propertyId))).for('update');
    if (!task) throw new UserError('Task not found.');
    const [room] = await tx.select().from(rooms).where(eq(rooms.id, task.roomId));
    const items = await tx.select().from(hkChecklistItems).where(eq(hkChecklistItems.propertyId, actor.propertyId));
    const itemMap = new Map(items.map((i) => [i.id, i]));
    const issues = input.results.filter((r) => r.result !== 'ok');
    for (const issue of issues) {
      const item = itemMap.get(issue.itemId);
      if (!item) continue;
      await tx.insert(maintenanceTickets).values({
        propertyId: actor.propertyId,
        roomId: room.id,
        checklistItemId: item.id,
        hkTaskId: task.id,
        title: `${item.name} ${issue.result === 'missing' ? 'missing' : 'problem'}`,
        description: issue.note || null,
        priority: item.category === 'maintenance' ? 'high' : 'normal',
        reportedBy: actor.userId,
      });
    }
    await tx.update(hkTasks).set({ status: input.inspect ? 'verified' : 'done', results: input.results, notes: input.notes ?? null, completedAt: new Date() }).where(eq(hkTasks.id, task.id));
    await tx.update(rooms).set({ hkStatus: input.inspect ? 'inspected' : 'clean' }).where(and(eq(rooms.id, room.id), ne(rooms.hkStatus, 'out_of_order')));
    if (issues.length) {
      await notify(tx, {
        propertyId: actor.propertyId,
        type: 'housekeeping',
        title: `Room ${room.number}: ${issues.length} issue${issues.length === 1 ? '' : 's'} reported`,
        body: issues.map((i) => itemMap.get(i.itemId)?.name).filter(Boolean).join(', '),
        href: '/housekeeping/tickets',
      });
    }
    await logActivity(
      {
        propertyId: actor.propertyId,
        userId: actor.userId,
        entityType: 'room',
        entityId: room.id,
        action: 'hk_done',
        summary: `Room ${room.number} ${input.inspect ? 'inspected' : 'cleaned'}${issues.length ? ` · ${issues.length} issue(s) → repair tickets` : ''}`,
      },
      tx,
    );
    return { number: room.number, tickets: issues.length };
  });
}

/** Tasks for the phone screen: mine (or everyone's for supervisors), with the checklist for each room type. */
export async function getMyTasks(propertyId: string, userId: string, all: boolean, bizDate: string) {
  const tasks = await db
    .select({
      id: hkTasks.id,
      status: hkTasks.status,
      type: hkTasks.type,
      priority: hkTasks.priority,
      notes: hkTasks.notes,
      roomId: rooms.id,
      roomNumber: rooms.number,
      floor: rooms.floor,
      roomTypeId: rooms.roomTypeId,
      typeName: roomTypes.name,
      assigneeName: users.name,
    })
    .from(hkTasks)
    .innerJoin(rooms, eq(rooms.id, hkTasks.roomId))
    .innerJoin(roomTypes, eq(roomTypes.id, rooms.roomTypeId))
    .leftJoin(users, eq(users.id, hkTasks.assignedTo))
    .where(
      and(
        eq(hkTasks.propertyId, propertyId),
        inArray(hkTasks.status, ['pending', 'in_progress']),
        lt(hkTasks.dueDate, addDay(bizDate, 1)),
        all ? undefined : eq(hkTasks.assignedTo, userId),
      ),
    )
    .orderBy(desc(sql`${hkTasks.priority} = 'high'`), asc(rooms.number));
  const items = await getChecklist(propertyId);
  return tasks.map((t) => ({
    ...t,
    items: items.filter((i) => i.isActive && (i.roomTypeIds.length === 0 || i.roomTypeIds.includes(t.roomTypeId))),
  }));
}

/* ───────────────────────────── checklist ───────────────────────────── */

export async function getChecklist(propertyId: string) {
  return db
    .select()
    .from(hkChecklistItems)
    .where(eq(hkChecklistItems.propertyId, propertyId))
    .orderBy(asc(hkChecklistItems.sortOrder), asc(hkChecklistItems.name));
}

export async function saveChecklistItem(
  actor: Actor,
  input: { id?: string | null; name: string; nameHi?: string | null; category: HkCategory; roomTypeIds: string[]; isActive?: boolean },
) {
  const key = nameKey(input.name);
  if (key.length < 2) throw new UserError('Enter an item name.');
  const [clash] = await db
    .select({ id: hkChecklistItems.id, name: hkChecklistItems.name })
    .from(hkChecklistItems)
    .where(and(eq(hkChecklistItems.propertyId, actor.propertyId), eq(hkChecklistItems.nameKey, key)));
  if (clash && clash.id !== input.id) throw new UserError(`"${clash.name}" is already on the checklist. Each thing appears once.`);
  if (input.id) {
    await db
      .update(hkChecklistItems)
      .set({ name: input.name.trim(), nameHi: input.nameHi?.trim() || null, nameKey: key, category: input.category, roomTypeIds: input.roomTypeIds, isActive: input.isActive ?? true })
      .where(and(eq(hkChecklistItems.id, input.id), eq(hkChecklistItems.propertyId, actor.propertyId)));
    return { id: input.id };
  }
  const [{ max }] = await db.select({ max: sql<number>`COALESCE(max(${hkChecklistItems.sortOrder}), 0)::int` }).from(hkChecklistItems).where(eq(hkChecklistItems.propertyId, actor.propertyId));
  const [row] = await db
    .insert(hkChecklistItems)
    .values({ propertyId: actor.propertyId, name: input.name.trim(), nameHi: input.nameHi?.trim() || null, nameKey: key, category: input.category, roomTypeIds: input.roomTypeIds, sortOrder: max + 1 })
    .returning({ id: hkChecklistItems.id });
  return { id: row.id };
}

export async function reorderChecklist(actor: Actor, ids: string[]) {
  await db.transaction(async (tx) => {
    for (const [index, id] of ids.entries()) {
      await tx.update(hkChecklistItems).set({ sortOrder: index }).where(and(eq(hkChecklistItems.id, id), eq(hkChecklistItems.propertyId, actor.propertyId)));
    }
  });
}

export async function deleteChecklistItem(actor: Actor, id: string) {
  await db.delete(hkChecklistItems).where(and(eq(hkChecklistItems.id, id), eq(hkChecklistItems.propertyId, actor.propertyId)));
}

/**
 * Clean-up for the legacy AsiaTech list, which mixed tasks with results ("AC", "AC", "Ac is working",
 * "Ac is not working", "AC PROBLEM") and repeated items ("bath soap" × 3). Each line maps to one master item.
 */
const RESULT_SUFFIX = /\s+(is\s+)?(not\s+)?(working|problem|missing|broken|ok|okay|fine)$/i;

export function normaliseLegacyItem(line: string): string {
  const cleaned = line.trim().replace(/\s+/g, ' ').replace(RESULT_SUFFIX, '').trim();
  if (!cleaned) return '';
  const lower = cleaned.toLowerCase();
  // Keep short acronyms in capitals (AC, TV), title-case the rest.
  return lower
    .split(' ')
    .map((word, i) => (word.length <= 2 && i === 0 ? word.toUpperCase() : i === 0 ? word[0].toUpperCase() + word.slice(1) : word))
    .join(' ');
}

export function planLegacyImport(lines: string[], existing: { nameKey: string; name: string }[]) {
  const groups = new Map<string, { name: string; sources: string[]; exists: boolean }>();
  for (const raw of lines) {
    const name = normaliseLegacyItem(raw);
    if (!name) continue;
    const key = nameKey(name);
    const hit = existing.find((e) => e.nameKey === key);
    const group = groups.get(key) ?? { name: hit?.name ?? name, sources: [], exists: Boolean(hit) };
    group.sources.push(raw.trim());
    groups.set(key, group);
  }
  return [...groups.values()];
}

/* ───────────────────────────── tickets ───────────────────────────── */

export async function getTickets(propertyId: string, status?: string) {
  return db
    .select({
      id: maintenanceTickets.id,
      title: maintenanceTickets.title,
      description: maintenanceTickets.description,
      status: maintenanceTickets.status,
      priority: maintenanceTickets.priority,
      createdAt: maintenanceTickets.createdAt,
      resolvedAt: maintenanceTickets.resolvedAt,
      roomId: maintenanceTickets.roomId,
      roomNumber: rooms.number,
      roomHk: rooms.hkStatus,
      reportedBy: users.name,
    })
    .from(maintenanceTickets)
    .leftJoin(rooms, eq(rooms.id, maintenanceTickets.roomId))
    .leftJoin(users, eq(users.id, maintenanceTickets.reportedBy))
    .where(
      and(
        eq(maintenanceTickets.propertyId, propertyId),
        status === 'all' ? undefined : status === 'resolved' ? eq(maintenanceTickets.status, 'resolved') : inArray(maintenanceTickets.status, ['open', 'in_progress']),
      ),
    )
    .orderBy(desc(sql`${maintenanceTickets.priority} = 'high'`), desc(maintenanceTickets.createdAt))
    .limit(200);
}

export async function updateTicket(actor: Actor, id: string, status: 'open' | 'in_progress' | 'resolved') {
  const [ticket] = await db.select().from(maintenanceTickets).where(and(eq(maintenanceTickets.id, id), eq(maintenanceTickets.propertyId, actor.propertyId)));
  if (!ticket) throw new UserError('Ticket not found.');
  await db.update(maintenanceTickets).set({ status, resolvedAt: status === 'resolved' ? new Date() : null }).where(eq(maintenanceTickets.id, id));
  await logActivity({ propertyId: actor.propertyId, userId: actor.userId, entityType: 'ticket', entityId: id, action: status, summary: `Repair ticket "${ticket.title}" → ${status.replace('_', ' ')}` });
}

export async function createTicket(actor: Actor, input: { roomId?: string | null; title: string; description?: string | null; priority: 'low' | 'normal' | 'high' }) {
  if (input.title.trim().length < 3) throw new UserError('Describe the problem.');
  const [row] = await db
    .insert(maintenanceTickets)
    .values({ propertyId: actor.propertyId, roomId: input.roomId || null, title: input.title.trim(), description: input.description || null, priority: input.priority, reportedBy: actor.userId })
    .returning({ id: maintenanceTickets.id });
  return { id: row.id };
}

export function describeOoo(room: { oooReason: string | null; oooUntil: string | null }) {
  return [room.oooReason, room.oooUntil ? `until ${formatDayShort(room.oooUntil)}` : null].filter(Boolean).join(' · ');
}
