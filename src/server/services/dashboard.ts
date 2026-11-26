import 'server-only';
import { and, asc, count, desc, eq, gt, gte, inArray, isNull, lte, ne, notInArray, sql, sum } from 'drizzle-orm';
import { db } from '@/db';
import {
  bookingRooms,
  bookings,
  channels,
  guests,
  inventory,
  posOrders,
  rooms,
  roomTypes,
  syncLogs,
  systemUpdates,
  tasks,
} from '@/db/schema';
import { addDay, formatINR, monthStart, OTA_LABELS, timeAgo, todayIST } from '@/lib/format';
import { backupHealth } from './backup';
import { heldAdvances } from './cancellation';
import { onIstDays } from '@/db/ist';
import { round2 } from '@/lib/utils';
import type { AppContext } from '../context';

/** Created-at falls on an IST calendar date (an index-friendly range, see db/ist). */
const createdOn = (column: typeof bookings.createdAt, date: string) => onIstDays(column, date);
const createdBetween = (column: typeof bookings.createdAt, from: string, to: string) => onIstDays(column, from, to);

export interface DashboardTiles {
  todaysBookings: number;
  todaysEarning: number;
  checkIns: number;
  checkInsDone: number;
  checkOuts: number;
  checkOutsDone: number;
  monthBookings: number;
  monthEarning: number;
  posOrders: number;
  posEarning: number;
  posRoomTransfer: number;
  posInHouse: number;
  monthPosOrders: number;
  monthPosEarning: number;
}

export async function getTiles(ctx: AppContext): Promise<DashboardTiles> {
  const pid = ctx.propertyId;
  const today = todayIST();
  const bizDate = ctx.property.businessDate;
  const mStart = monthStart(today);
  const notCancelled = notInArray(bookings.status, ['cancelled']);

  const [[created], [month], [arrivals], [departures], [pos], [posMonth]] = await Promise.all([
    db
      .select({ n: count(), total: sum(bookings.totalAmount) })
      .from(bookings)
      .where(and(eq(bookings.propertyId, pid), notCancelled, createdOn(bookings.createdAt, today))),
    db
      .select({ n: count(), total: sum(bookings.totalAmount) })
      .from(bookings)
      .where(and(eq(bookings.propertyId, pid), notCancelled, createdBetween(bookings.createdAt, mStart, today))),
    db
      .select({ n: count(), done: sql<number>`count(*) FILTER (WHERE ${bookingRooms.status} = 'in_house')::int` })
      .from(bookingRooms)
      .where(and(eq(bookingRooms.propertyId, pid), eq(bookingRooms.checkIn, bizDate), inArray(bookingRooms.status, ['reserved', 'in_house']))),
    db
      .select({ n: count(), done: sql<number>`count(*) FILTER (WHERE ${bookingRooms.status} = 'departed')::int` })
      .from(bookingRooms)
      .where(and(eq(bookingRooms.propertyId, pid), eq(bookingRooms.checkOut, bizDate), inArray(bookingRooms.status, ['in_house', 'departed']))),
    db
      .select({
        n: count(),
        total: sum(posOrders.total),
        transfer: sql<number>`count(*) FILTER (WHERE ${posOrders.settlementMode} = 'room_transfer')::int`,
        inHouse: sql<number>`count(*) FILTER (WHERE ${posOrders.orderType} = 'in_house')::int`,
      })
      .from(posOrders)
      .where(and(eq(posOrders.propertyId, pid), ne(posOrders.status, 'void'), eq(posOrders.businessDate, bizDate))),
    db
      .select({ n: count(), total: sum(posOrders.total) })
      .from(posOrders)
      .where(and(eq(posOrders.propertyId, pid), ne(posOrders.status, 'void'), gte(posOrders.businessDate, monthStart(bizDate)), lte(posOrders.businessDate, bizDate))),
  ]);

  return {
    todaysBookings: created.n,
    todaysEarning: Number(created.total ?? 0),
    checkIns: arrivals.n,
    checkInsDone: arrivals.done,
    checkOuts: departures.n,
    checkOutsDone: departures.done,
    monthBookings: month.n,
    monthEarning: Number(month.total ?? 0),
    posOrders: pos.n,
    posEarning: Number(pos.total ?? 0),
    posRoomTransfer: pos.transfer,
    posInHouse: pos.inHouse,
    monthPosOrders: posMonth.n,
    monthPosEarning: Number(posMonth.total ?? 0),
  };
}

export interface TaskItem {
  id: string;
  kind: 'checkin' | 'checkout' | 'assign' | 'listing' | 'sync' | 'balance' | 'hold' | 'custom';
  severity: 'info' | 'warning' | 'danger';
  title: string;
  detail?: string;
  action: { label: string; href: string };
}

/**
 * Today's Task (rule 2: every alert has a button). Most items are derived live from the data; system alerts
 * such as OTA listing problems also live in the `tasks` table.
 */
export async function getTodaysTasks(ctx: AppContext): Promise<TaskItem[]> {
  const pid = ctx.propertyId;
  const bizDate = ctx.property.businessDate;
  const items: TaskItem[] = [];

  const [pendingArrivals, pendingDepartures, unassigned, listingProblems, failedSyncs, holds, persisted, held] = await Promise.all([
    db
      .select({ id: bookings.id, bookingNo: bookings.bookingNo, name: guests.name, checkIn: bookings.checkIn })
      .from(bookings)
      .innerJoin(guests, eq(guests.id, bookings.guestId))
      .where(and(eq(bookings.propertyId, pid), eq(bookings.status, 'confirmed'), lte(bookings.checkIn, bizDate)))
      .orderBy(asc(bookings.checkIn), asc(guests.name))
      .limit(30),
    db
      .select({
        id: bookings.id,
        bookingNo: bookings.bookingNo,
        name: guests.name,
        balance: sql<number>`(${bookings.totalAmount} - ${bookings.paidAmount})::float`,
      })
      .from(bookings)
      .innerJoin(guests, eq(guests.id, bookings.guestId))
      .where(and(eq(bookings.propertyId, pid), eq(bookings.status, 'checked_in'), lte(bookings.checkOut, bizDate)))
      .limit(30),
    db
      .select({ bookingId: bookings.id, bookingNo: bookings.bookingNo, name: guests.name, checkIn: bookingRooms.checkIn, typeName: roomTypes.name })
      .from(bookingRooms)
      .innerJoin(bookings, eq(bookings.id, bookingRooms.bookingId))
      .innerJoin(guests, eq(guests.id, bookings.guestId))
      .innerJoin(roomTypes, eq(roomTypes.id, bookingRooms.roomTypeId))
      .where(
        and(
          eq(bookingRooms.propertyId, pid),
          eq(bookingRooms.status, 'reserved'),
          isNull(bookingRooms.roomId),
          lte(bookingRooms.checkIn, addDay(bizDate, 1)),
          inArray(bookings.status, ['confirmed']),
        ),
      )
      .limit(30),
    db
      .select()
      .from(channels)
      .where(and(eq(channels.propertyId, pid), inArray(channels.listingStatus, ['closed', 'parked_business', 'suspended']))),
    db
      .select({ channelId: syncLogs.channelId, ota: channels.ota, n: count() })
      .from(syncLogs)
      .innerJoin(channels, eq(channels.id, syncLogs.channelId))
      .where(and(eq(syncLogs.propertyId, pid), eq(syncLogs.status, 'failed'), gte(syncLogs.createdAt, new Date(Date.now() - 86400_000))))
      .groupBy(syncLogs.channelId, channels.ota),
    db
      .select({ id: bookings.id, bookingNo: bookings.bookingNo, name: guests.name, holdUntil: bookings.holdUntil })
      .from(bookings)
      .innerJoin(guests, eq(guests.id, bookings.guestId))
      .where(and(eq(bookings.propertyId, pid), eq(bookings.status, 'hold'), lte(bookings.holdUntil, new Date(Date.now() + 3 * 3600_000))))
      .orderBy(asc(bookings.holdUntil)),
    db
      .select()
      .from(tasks)
      .where(and(eq(tasks.propertyId, pid), eq(tasks.status, 'open')))
      .orderBy(desc(tasks.createdAt)),
    heldAdvances(pid),
  ]);

  const foreignInHouse = await db
    .select({ id: bookings.id, bookingNo: bookings.bookingNo, name: guests.name, checkedInAt: sql<Date>`min(${bookingRooms.checkedInAt})` })
    .from(bookings)
    .innerJoin(guests, eq(guests.id, bookings.guestId))
    .innerJoin(bookingRooms, eq(bookingRooms.bookingId, bookings.id))
    .where(and(eq(bookings.propertyId, pid), eq(bookings.status, 'checked_in'), eq(guests.isForeign, true), isNull(bookings.formCSubmittedAt)))
    .groupBy(bookings.id, guests.name);
  for (const f of foreignInHouse) {
    const hoursLeft = f.checkedInAt ? Math.round(24 - (Date.now() - new Date(f.checkedInAt).getTime()) / 3600_000) : 24;
    items.push({
      id: `formc-${f.id}`,
      kind: 'custom',
      severity: hoursLeft <= 6 ? 'danger' : 'warning',
      title: `Submit Form-C (FRRO) for ${f.name.toUpperCase()} (ID: ${f.bookingNo})`,
      detail: hoursLeft > 0 ? `${hoursLeft} h left of the 24-hour limit` : 'Overdue',
      action: { label: 'Open Form-III', href: `/front-desk/bookings/${f.id}` },
    });
  }

  for (const ch of listingProblems) {
    items.push({
      id: `listing-${ch.id}`,
      kind: 'listing',
      severity: 'danger',
      title: `Property not bookable on ${OTA_LABELS[ch.ota]}. Reason: ${ch.listingStatus === 'parked_business' ? 'Parked business' : ch.listingStatus}`,
      detail: ch.listingMessage ?? undefined,
      action: { label: 'Fix listing', href: `/channels?channel=${ch.id}` },
    });
  }
  for (const t of persisted) {
    if (t.type === 'ota_listing' && listingProblems.some((c) => c.id === t.entityId)) continue;
    items.push({
      id: `task-${t.id}`,
      kind: 'custom',
      severity: t.severity,
      title: t.title,
      detail: t.detail ?? undefined,
      action: { label: t.actionLabel ?? 'Open', href: t.actionHref ?? '/dashboard' },
    });
  }
  for (const s of failedSyncs) {
    items.push({
      id: `sync-${s.channelId}`,
      kind: 'sync',
      severity: 'warning',
      title: `${s.n} ${OTA_LABELS[s.ota]} update${s.n > 1 ? 's' : ''} failed in the last 24 hours`,
      action: { label: 'Retry', href: `/channels/sync-log?status=failed` },
    });
  }
  for (const h of holds) {
    const minutes = h.holdUntil ? Math.round((h.holdUntil.getTime() - Date.now()) / 60000) : 0;
    items.push({
      id: `hold-${h.id}`,
      kind: 'hold',
      severity: minutes < 60 ? 'danger' : 'warning',
      title: `Hold for ${h.name.toUpperCase()} expires ${minutes <= 0 ? 'now' : minutes < 60 ? `in ${minutes} min` : `in ${Math.round(minutes / 60)} h`}`,
      detail: h.bookingNo,
      action: { label: 'Confirm or extend', href: `/front-desk/holds` },
    });
  }
  for (const b of pendingDepartures) {
    items.push({
      id: `out-${b.id}`,
      kind: b.balance > 0.5 ? 'balance' : 'checkout',
      severity: b.balance > 0.5 ? 'warning' : 'info',
      title: `Check out ${b.name.toUpperCase()} (ID: ${b.bookingNo})`,
      detail: b.balance > 0.5 ? `Balance due ${formatINR(round2(b.balance))}` : 'Fully paid',
      action: { label: 'Check out', href: `/front-desk/bookings/${b.id}?do=checkout` },
    });
  }
  // Money paid on a stay that will not happen: refund it, or keep it as a charge with a GST invoice.
  for (const h of held) {
    items.push({
      id: `held-${h.id}`,
      kind: 'balance',
      severity: 'warning',
      title: `${formatINR(h.held)} advance held for ${h.name.toUpperCase()} (ID: ${h.bookingNo})`,
      detail: h.status === 'no_show' ? 'Guest did not arrive: refund it or keep it as a no-show charge' : 'Booking cancelled: refund it or keep it as a cancellation charge',
      action: { label: 'Refund or keep', href: `/front-desk/bookings/${h.id}?do=settle` },
    });
  }
  for (const b of pendingArrivals) {
    items.push({
      id: `in-${b.id}`,
      kind: 'checkin',
      severity: b.checkIn < bizDate ? 'warning' : 'info',
      title: `Create CHECKIN for: ${b.name.toUpperCase()} (ID: ${b.bookingNo})`,
      detail: b.checkIn < bizDate ? 'Arrival date has passed: check in or mark no-show' : undefined,
      action: { label: 'Check in now', href: `/front-desk/bookings/${b.id}?do=checkin` },
    });
  }
  // One task per booking and arrival date, however many of its rooms still need a number.
  const toAssign = new Map<string, { u: (typeof unassigned)[number]; types: string[] }>();
  for (const u of unassigned) {
    const key = `${u.bookingId}-${u.checkIn}`;
    const entry = toAssign.get(key) ?? { u, types: [] };
    entry.types.push(u.typeName);
    toAssign.set(key, entry);
  }
  for (const [key, { u, types }] of toAssign) {
    items.push({
      id: `assign-${key}`,
      kind: 'assign',
      severity: 'info',
      title: types.length > 1 ? `Assign ${types.length} rooms to ${u.name} (${u.bookingNo})` : `Assign a room to ${u.name} (${u.bookingNo})`,
      detail: `${[...new Set(types)].join(', ')} · arriving ${u.checkIn === bizDate ? 'today' : 'tomorrow'}`,
      action: { label: 'Assign', href: `/front-desk/bookings/${u.bookingId}?do=assign` },
    });
  }

  // The platform team (who run the server) also see a missed nightly backup here, not only in the console.
  if (ctx.user.isSuperAdmin) {
    const backups = await backupHealth();
    if (backups.overdue) {
      items.push({
        id: 'backup-overdue',
        kind: 'custom',
        severity: 'danger',
        title: backups.lastOk ? `No database backup since ${timeAgo(backups.lastOk.finishedAt ?? backups.lastOk.createdAt)}` : 'No database backup has been made yet',
        detail: backups.lastError ? `Last try: ${backups.lastError}` : 'Check that the worker is running',
        action: { label: 'Open backups', href: '/admin?tab=backups' },
      });
    }
  }

  const order = { danger: 0, warning: 1, info: 2 } as const;
  return items.sort((a, b) => order[a.severity] - order[b.severity]);
}

export async function getSystemUpdates() {
  return db.select().from(systemUpdates).where(eq(systemUpdates.isPublished, true)).orderBy(desc(systemUpdates.publishedAt)).limit(6);
}

export interface DashboardBookingRow {
  id: string;
  bookingNo: string;
  source: string;
  channel: string | null;
  guestName: string;
  checkIn: string;
  checkOut: string;
  roomTypeName: string;
  roomNumber: string | null;
  status: string;
  totalAmount: number;
  balance: number;
}

async function bookingRows(where: ReturnType<typeof and>, limit = 25): Promise<DashboardBookingRow[]> {
  const rows = await db
    .select({
      id: bookings.id,
      bookingNo: bookings.bookingNo,
      source: bookings.source,
      channel: bookings.channel,
      guestName: guests.name,
      checkIn: bookings.checkIn,
      checkOut: bookings.checkOut,
      status: bookings.status,
      totalAmount: bookings.totalAmount,
      paidAmount: bookings.paidAmount,
      roomTypeName: sql<string>`string_agg(DISTINCT ${roomTypes.name}, ', ')`,
      roomNumber: sql<string | null>`string_agg(${rooms.number}, ', ' ORDER BY ${rooms.number})`,
    })
    .from(bookings)
    .innerJoin(guests, eq(guests.id, bookings.guestId))
    .innerJoin(bookingRooms, eq(bookingRooms.bookingId, bookings.id))
    .innerJoin(roomTypes, eq(roomTypes.id, bookingRooms.roomTypeId))
    .leftJoin(rooms, eq(rooms.id, bookingRooms.roomId))
    .where(where)
    .groupBy(bookings.id, guests.name)
    .orderBy(desc(bookings.createdAt))
    .limit(limit);
  return rows.map((r) => ({ ...r, balance: round2(r.totalAmount - r.paidAmount) }));
}

export async function getTodaysBookings(ctx: AppContext) {
  const pid = ctx.propertyId;
  const bizDate = ctx.property.businessDate;
  const [createdToday, arriving, inHouse] = await Promise.all([
    bookingRows(and(eq(bookings.propertyId, pid), createdOn(bookings.createdAt, todayIST()))),
    bookingRows(and(eq(bookings.propertyId, pid), eq(bookings.checkIn, bizDate), notInArray(bookings.status, ['cancelled', 'no_show']))),
    bookingRows(and(eq(bookings.propertyId, pid), eq(bookings.status, 'checked_in')), 50),
  ]);
  return { createdToday, arriving, inHouse };
}

/** Tonight at a glance: occupancy, ADR, RevPAR and free rooms per type. */
export async function getTonight(ctx: AppContext) {
  const pid = ctx.propertyId;
  const bizDate = ctx.property.businessDate;
  const typeRows = await db
    .select({
      id: roomTypes.id,
      name: roomTypes.name,
      color: roomTypes.color,
      total: inventory.total,
      booked: inventory.booked,
      blocked: inventory.blocked,
    })
    .from(roomTypes)
    .leftJoin(inventory, and(eq(inventory.roomTypeId, roomTypes.id), eq(inventory.date, bizDate)))
    .where(and(eq(roomTypes.propertyId, pid), eq(roomTypes.isActive, true)))
    .orderBy(asc(roomTypes.sortOrder));

  const [revenue] = await db
    .select({
      amount: sql<number>`COALESCE(sum((n->>'amount')::numeric), 0)::float`,
      nights: sql<number>`count(*)::int`,
    })
    .from(bookingRooms)
    .innerJoin(sql`jsonb_array_elements(${bookingRooms.nightly}) AS n`, sql`true`)
    .where(
      and(
        eq(bookingRooms.propertyId, pid),
        inArray(bookingRooms.status, ['reserved', 'in_house', 'departed']),
        // Only stays covering the date are unpacked (nightly dates always lie within check-in … check-out).
        lte(bookingRooms.checkIn, bizDate),
        gt(bookingRooms.checkOut, bizDate),
        sql`n->>'date' = ${bizDate}`,
      ),
    );

  const total = typeRows.reduce((t, r) => t + (r.total ?? 0), 0);
  const blocked = typeRows.reduce((t, r) => t + (r.blocked ?? 0), 0);
  const booked = typeRows.reduce((t, r) => t + (r.booked ?? 0), 0);
  const sellable = Math.max(total - blocked, 0);
  const occupancy = sellable > 0 ? Math.round((booked / sellable) * 100) : 0;
  const adr = revenue.nights > 0 ? Math.round(revenue.amount / revenue.nights) : 0;
  const revpar = sellable > 0 ? Math.round(revenue.amount / sellable) : 0;

  return {
    occupancy,
    booked,
    sellable,
    blocked,
    adr,
    revpar,
    types: typeRows.map((t) => ({
      id: t.id,
      name: t.name,
      color: t.color,
      total: t.total ?? 0,
      available: (t.total ?? 0) - (t.booked ?? 0) - (t.blocked ?? 0),
    })),
  };
}

export interface TileTrend {
  /** Oldest → newest, ending today. */
  series: number[];
  /** % change against the comparison period; null when there is nothing to compare with. */
  delta: number | null;
  compare: string;
}

function pctChange(now: number, before: number): number | null {
  if (!before) return now ? null : 0;
  return Math.round(((now - before) / before) * 100);
}

/** 8-day series for the sparklines and week-on-week (or month-on-month) change for every tile. */
export async function getTileTrends(ctx: AppContext): Promise<Record<string, TileTrend>> {
  const pid = ctx.propertyId;
  const today = todayIST();
  const biz = ctx.property.businessDate;
  const from = addDay(today, -7);
  const bizFrom = addDay(biz, -7);
  const days = Array.from({ length: 8 }, (_, i) => addDay(today, i - 7));
  const bizDays = Array.from({ length: 8 }, (_, i) => addDay(biz, i - 7));

  const [created, arrivals, departures, pos, mtd, lastMtd, posMtd, posLastMtd] = await Promise.all([
    db.execute<{ d: string; n: number; total: number }>(sql`
      SELECT (created_at AT TIME ZONE 'Asia/Kolkata')::date::text AS d, count(*)::int AS n, COALESCE(sum(total_amount), 0)::float AS total
      FROM bookings WHERE property_id = ${pid} AND status <> 'cancelled'
        AND ${onIstDays(sql`created_at`, from, today)} GROUP BY 1`),
    db.execute<{ d: string; n: number }>(sql`
      SELECT check_in::text AS d, count(*)::int AS n FROM booking_rooms
      WHERE property_id = ${pid} AND status IN ('reserved','in_house','departed') AND check_in BETWEEN ${bizFrom}::date AND ${biz}::date GROUP BY 1`),
    db.execute<{ d: string; n: number }>(sql`
      SELECT check_out::text AS d, count(*)::int AS n FROM booking_rooms
      WHERE property_id = ${pid} AND status IN ('reserved','in_house','departed') AND check_out BETWEEN ${bizFrom}::date AND ${biz}::date GROUP BY 1`),
    db.execute<{ d: string; n: number; total: number; transfer: number; inhouse: number }>(sql`
      SELECT business_date::text AS d, count(*)::int AS n, COALESCE(sum(total), 0)::float AS total,
             count(*) FILTER (WHERE settlement_mode = 'room_transfer')::int AS transfer,
             count(*) FILTER (WHERE order_type = 'in_house')::int AS inhouse
      FROM pos_orders WHERE property_id = ${pid} AND status <> 'void' AND business_date BETWEEN ${bizFrom}::date AND ${biz}::date GROUP BY 1`),
    db.execute<{ n: number; total: number }>(sql`
      SELECT count(*)::int AS n, COALESCE(sum(total_amount), 0)::float AS total FROM bookings
      WHERE property_id = ${pid} AND status <> 'cancelled'
        AND ${onIstDays(sql`created_at`, sql`date_trunc('month', ${today}::date)`, today)}`),
    db.execute<{ n: number; total: number }>(sql`
      SELECT count(*)::int AS n, COALESCE(sum(total_amount), 0)::float AS total FROM bookings
      WHERE property_id = ${pid} AND status <> 'cancelled'
        AND ${onIstDays(sql`created_at`, sql`date_trunc('month', ${today}::date) - interval '1 month'`, sql`${today}::date - interval '1 month'`)}`),
    db.execute<{ n: number; total: number }>(sql`
      SELECT count(*)::int AS n, COALESCE(sum(total), 0)::float AS total FROM pos_orders
      WHERE property_id = ${pid} AND status <> 'void' AND business_date BETWEEN date_trunc('month', ${biz}::date)::date AND ${biz}::date`),
    db.execute<{ n: number; total: number }>(sql`
      SELECT count(*)::int AS n, COALESCE(sum(total), 0)::float AS total FROM pos_orders
      WHERE property_id = ${pid} AND status <> 'void'
        AND business_date BETWEEN (date_trunc('month', ${biz}::date) - interval '1 month')::date AND (${biz}::date - interval '1 month')::date`),
  ]);

  const series = <T extends { d: string }>(rows: T[], dates: string[], pick: (r: T) => number) => {
    const map = new Map(rows.map((r) => [r.d, r]));
    return dates.map((d) => (map.has(d) ? pick(map.get(d)!) : 0));
  };
  const weekly = (values: number[]): TileTrend => ({ series: values, delta: pctChange(values[7], values[0]), compare: 'vs same day last week' });
  const monthly = (values: number[], now: number, before: number): TileTrend => ({ series: values, delta: pctChange(now, before), compare: 'vs same point last month' });

  const createdN = series(created.rows, days, (r) => r.n);
  const createdT = series(created.rows, days, (r) => r.total);
  const posN = series(pos.rows, bizDays, (r) => r.n);
  const posT = series(pos.rows, bizDays, (r) => r.total);
  return {
    todaysBookings: weekly(createdN),
    todaysEarning: weekly(createdT),
    checkIns: weekly(series(arrivals.rows, bizDays, (r) => r.n)),
    checkOuts: weekly(series(departures.rows, bizDays, (r) => r.n)),
    monthBookings: monthly(createdN, mtd.rows[0]?.n ?? 0, lastMtd.rows[0]?.n ?? 0),
    monthEarning: monthly(createdT, mtd.rows[0]?.total ?? 0, lastMtd.rows[0]?.total ?? 0),
    posOrders: weekly(posN),
    posEarning: weekly(posT),
    posRoomTransfer: weekly(series(pos.rows, bizDays, (r) => r.transfer)),
    posInHouse: weekly(series(pos.rows, bizDays, (r) => r.inhouse)),
    monthPosOrders: monthly(posN, posMtd.rows[0]?.n ?? 0, posLastMtd.rows[0]?.n ?? 0),
    monthPosEarning: monthly(posT, posMtd.rows[0]?.total ?? 0, posLastMtd.rows[0]?.total ?? 0),
  };
}
