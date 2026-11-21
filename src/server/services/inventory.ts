import 'server-only';
import { and, asc, eq, gte, inArray, lt, lte, sql } from 'drizzle-orm';
import { db, type DbOrTx, type Tx } from '@/db';
import { channels, inventory, roomTypes, rooms, syncLogs } from '@/db/schema';
import { addDay, dateRange, formatDayShort, stayDates } from '@/lib/format';
import { UserError } from '../errors';
import { syncChannelsSoon } from '../sync-soon';

/** How far ahead inventory rows are kept (and pushed to OTAs). */
export const INVENTORY_HORIZON_DAYS = 400;

/**
 * Make sure an inventory row exists for every room type and date in [from, to].
 * `total` starts as the number of active rooms of that type.
 */
export async function ensureInventory(tx: DbOrTx, propertyId: string, from: string, to: string, roomTypeId?: string) {
  await tx.execute(sql`
    INSERT INTO inventory (property_id, room_type_id, date, total)
    SELECT rt.property_id, rt.id, d::date,
           (SELECT count(*) FROM rooms r WHERE r.room_type_id = rt.id AND r.is_active)::int
    FROM room_types rt
    CROSS JOIN generate_series(${from}::date, ${to}::date, interval '1 day') AS d
    WHERE rt.property_id = ${propertyId}
      ${roomTypeId ? sql`AND rt.id = ${roomTypeId}` : sql``}
    ON CONFLICT (room_type_id, date) DO NOTHING
  `);
}

/** Recompute `total` from the number of active rooms (after rooms are added, removed or deactivated). */
export async function recountInventoryTotals(tx: DbOrTx, propertyId: string, roomTypeId: string, from: string) {
  const [{ n }] = await tx
    .select({ n: sql<number>`count(*)::int` })
    .from(rooms)
    .where(and(eq(rooms.roomTypeId, roomTypeId), eq(rooms.isActive, true)));
  await ensureInventory(tx, propertyId, from, addDay(from, INVENTORY_HORIZON_DAYS), roomTypeId);
  await tx
    .update(inventory)
    .set({ total: n })
    .where(and(eq(inventory.roomTypeId, roomTypeId), gte(inventory.date, from)));
}

export interface ReserveLine {
  roomTypeId: string;
  checkIn: string;
  checkOut: string;
  quantity: number;
}

/**
 * Lock the inventory rows a booking touches (SELECT … FOR UPDATE), check availability, and add to `booked`.
 * Must run inside a transaction together with the booking insert. Rows are locked in a fixed order
 * (room type, then date) so two concurrent bookings can never deadlock each other.
 */
export async function reserveInventory(
  tx: Tx,
  propertyId: string,
  lines: ReserveLine[],
  options: { allowOverbook?: boolean; respectStopSell?: boolean } = {},
) {
  const grouped = groupLines(lines);
  if (grouped.length === 0) return;
  const minDate = grouped.reduce((min, l) => (l.date < min ? l.date : min), grouped[0].date);
  const maxDate = grouped.reduce((max, l) => (l.date > max ? l.date : max), grouped[0].date);
  const typeIds = [...new Set(grouped.map((l) => l.roomTypeId))];

  await ensureInventory(tx, propertyId, minDate, maxDate);

  const locked = await tx
    .select({
      id: inventory.id,
      roomTypeId: inventory.roomTypeId,
      date: inventory.date,
      total: inventory.total,
      booked: inventory.booked,
      blocked: inventory.blocked,
      stopSell: inventory.stopSell,
    })
    .from(inventory)
    .where(and(eq(inventory.propertyId, propertyId), inArray(inventory.roomTypeId, typeIds), gte(inventory.date, minDate), lte(inventory.date, maxDate)))
    .orderBy(asc(inventory.roomTypeId), asc(inventory.date))
    .for('update');

  const typeNames = new Map(
    (await tx.select({ id: roomTypes.id, name: roomTypes.name }).from(roomTypes).where(inArray(roomTypes.id, typeIds))).map((t) => [t.id, t.name]),
  );
  const byKey = new Map(locked.map((row) => [`${row.roomTypeId}|${row.date}`, row]));

  for (const line of grouped) {
    const row = byKey.get(`${line.roomTypeId}|${line.date}`);
    if (!row) throw new UserError('Inventory is not set up for these dates.');
    const available = row.total - row.booked - row.blocked;
    if (options.respectStopSell && row.stopSell) {
      throw new UserError(`${typeNames.get(line.roomTypeId)} is closed for sale on ${formatDayShort(line.date)}.`);
    }
    if (!options.allowOverbook && available < line.quantity) {
      throw new UserError(
        available <= 0
          ? `${typeNames.get(line.roomTypeId)} is sold out on ${formatDayShort(line.date)}.`
          : `Only ${available} ${typeNames.get(line.roomTypeId)} left on ${formatDayShort(line.date)}.`,
      );
    }
  }

  for (const line of grouped) {
    const row = byKey.get(`${line.roomTypeId}|${line.date}`)!;
    await tx
      .update(inventory)
      .set({ booked: sql`${inventory.booked} + ${line.quantity}` })
      .where(eq(inventory.id, row.id));
  }

  for (const typeId of typeIds) {
    const dates = grouped.filter((l) => l.roomTypeId === typeId).map((l) => l.date).sort();
    await queueAriPush(tx, propertyId, { roomTypeId: typeId, from: dates[0], to: dates[dates.length - 1], kind: 'availability' });
  }
}

/** Give rooms back (cancellation, no-show, early check-out, shortened stay). Never lets `booked` go below 0. */
export async function releaseInventory(tx: Tx, propertyId: string, lines: ReserveLine[]) {
  const grouped = groupLines(lines);
  if (grouped.length === 0) return;
  for (const line of grouped) {
    await tx
      .update(inventory)
      .set({ booked: sql`GREATEST(${inventory.booked} - ${line.quantity}, 0)` })
      .where(and(eq(inventory.propertyId, propertyId), eq(inventory.roomTypeId, line.roomTypeId), eq(inventory.date, line.date)));
  }
  const typeIds = [...new Set(grouped.map((l) => l.roomTypeId))];
  for (const typeId of typeIds) {
    const dates = grouped.filter((l) => l.roomTypeId === typeId).map((l) => l.date).sort();
    await queueAriPush(tx, propertyId, { roomTypeId: typeId, from: dates[0], to: dates[dates.length - 1], kind: 'availability' });
  }
}

function groupLines(lines: ReserveLine[]) {
  const totals = new Map<string, { roomTypeId: string; date: string; quantity: number }>();
  for (const line of lines) {
    for (const date of stayDates(line.checkIn, line.checkOut)) {
      const key = `${line.roomTypeId}|${date}`;
      const existing = totals.get(key);
      if (existing) existing.quantity += line.quantity;
      else totals.set(key, { roomTypeId: line.roomTypeId, date, quantity: line.quantity });
    }
  }
  return [...totals.values()].sort((a, b) => (a.roomTypeId === b.roomTypeId ? a.date.localeCompare(b.date) : a.roomTypeId.localeCompare(b.roomTypeId)));
}

/**
 * Queue an ARI (availability, rates, inventory) push to every connected channel. The worker drains the queue;
 * see PLAN.md M9. Runs inside the caller's transaction, so a rolled-back booking never pushes anything.
 */
export async function queueAriPush(
  tx: DbOrTx,
  propertyId: string,
  input: { roomTypeId?: string; from: string; to: string; kind: 'availability' | 'rates' | 'restrictions' },
) {
  const connected = await tx
    .select({ id: channels.id, ota: channels.ota })
    .from(channels)
    .where(and(eq(channels.propertyId, propertyId), eq(channels.status, 'connected'), eq(channels.isActive, true)));
  if (connected.length === 0) return;
  syncChannelsSoon(propertyId);
  await tx.insert(syncLogs).values(
    connected.map((channel) => ({
      propertyId,
      channelId: channel.id,
      direction: 'push' as const,
      kind: input.kind,
      message: `Push ${input.kind} ${input.from === input.to ? input.from : `${input.from} → ${input.to}`}`,
      payload: { roomTypeId: input.roomTypeId ?? null, from: input.from, to: input.to },
    })),
  );
}

export interface CalendarCell {
  date: string;
  total: number;
  booked: number;
  blocked: number;
  available: number;
  stopSell: boolean;
}

export interface CalendarRow {
  roomType: { id: string; name: string; code: string; color: string; totalRooms: number };
  cells: CalendarCell[];
}

/** The Availability Calendar grid: room types × dates with Available / Booked / Blocked. */
export async function getAvailabilityGrid(propertyId: string, start: string, days: number): Promise<CalendarRow[]> {
  const end = addDay(start, days - 1);
  await ensureInventory(db, propertyId, start, end);
  const types = await db
    .select({ id: roomTypes.id, name: roomTypes.name, code: roomTypes.code, color: roomTypes.color })
    .from(roomTypes)
    .where(and(eq(roomTypes.propertyId, propertyId), eq(roomTypes.isActive, true)))
    .orderBy(asc(roomTypes.sortOrder), asc(roomTypes.name));
  const rows = await db
    .select()
    .from(inventory)
    .where(and(eq(inventory.propertyId, propertyId), gte(inventory.date, start), lt(inventory.date, addDay(end, 1))));
  const roomCounts = await db
    .select({ roomTypeId: rooms.roomTypeId, n: sql<number>`count(*)::int` })
    .from(rooms)
    .where(and(eq(rooms.propertyId, propertyId), eq(rooms.isActive, true)))
    .groupBy(rooms.roomTypeId);
  const countMap = new Map(roomCounts.map((r) => [r.roomTypeId, r.n]));
  const byKey = new Map(rows.map((r) => [`${r.roomTypeId}|${r.date}`, r]));
  const dates = dateRange(start, days);
  return types.map((type) => ({
    roomType: { ...type, totalRooms: countMap.get(type.id) ?? 0 },
    cells: dates.map((date) => {
      const row = byKey.get(`${type.id}|${date}`);
      const total = row?.total ?? 0;
      const booked = row?.booked ?? 0;
      const blocked = row?.blocked ?? 0;
      return { date, total, booked, blocked, available: total - booked - blocked, stopSell: row?.stopSell ?? false };
    }),
  }));
}

/** Minimum availability per room type across a stay (used by the reservation form and booking engine). */
export async function getStayAvailability(propertyId: string, checkIn: string, checkOut: string) {
  const lastNight = addDay(checkOut, -1);
  await ensureInventory(db, propertyId, checkIn, lastNight);
  const rows = await db
    .select({
      roomTypeId: inventory.roomTypeId,
      available: sql<number>`min(${inventory.total} - ${inventory.booked} - ${inventory.blocked})::int`,
      stopSell: sql<boolean>`bool_or(${inventory.stopSell})`,
    })
    .from(inventory)
    .where(and(eq(inventory.propertyId, propertyId), gte(inventory.date, checkIn), lte(inventory.date, lastNight)))
    .groupBy(inventory.roomTypeId);
  return new Map(rows.map((r) => [r.roomTypeId, { available: Math.max(0, r.available), stopSell: r.stopSell }]));
}
