import 'server-only';
import { and, asc, desc, eq, gte, ilike, inArray, lte, or, sql, type SQL } from 'drizzle-orm';
import { istDayStart, onIstDays } from '@/db/ist';
import { db } from '@/db';
import { bookings, guests, roomTypes, type BookingSource, type BookingStatus } from '@/db/schema';
import { bookingBalance } from '@/lib/booking-money';
import { monthStart, todayIST } from '@/lib/format';
import { normaliseMobile, round2 } from '@/lib/utils';

export interface BookingFilters {
  q?: string;
  status?: BookingStatus | 'active' | '';
  source?: BookingSource | '';
  channel?: string;
  roomTypeId?: string;
  dateField?: 'check_in' | 'check_out' | 'created' | 'stay';
  from?: string;
  to?: string;
  created?: 'today' | 'month' | '';
  sort?: 'check_in' | 'created' | 'amount';
}

/** Booking Report: one query for the screen and the Excel export. */
export async function searchBookings(propertyId: string, f: BookingFilters, limit = 200) {
  const where: SQL[] = [eq(bookings.propertyId, propertyId)];
  if (f.status === 'active') where.push(inArray(bookings.status, ['confirmed', 'checked_in', 'hold']));
  else if (f.status) where.push(eq(bookings.status, f.status));
  if (f.source) where.push(eq(bookings.source, f.source));
  if (f.channel) where.push(eq(bookings.channel, f.channel));
  if (f.roomTypeId) where.push(sql`EXISTS (SELECT 1 FROM booking_rooms br WHERE br.booking_id = "bookings"."id" AND br.room_type_id = ${f.roomTypeId})`);
  if (f.created === 'today') where.push(onIstDays(bookings.createdAt, todayIST()));
  if (f.created === 'month') where.push(sql`${bookings.createdAt} >= ${istDayStart(monthStart(todayIST()))}`);
  if (f.from || f.to) {
    const from = f.from ?? '1900-01-01';
    const to = f.to ?? '2999-12-31';
    switch (f.dateField ?? 'check_in') {
      case 'check_in':
        where.push(gte(bookings.checkIn, from), lte(bookings.checkIn, to));
        break;
      case 'check_out':
        where.push(gte(bookings.checkOut, from), lte(bookings.checkOut, to));
        break;
      case 'created':
        where.push(onIstDays(bookings.createdAt, from, to));
        break;
      case 'stay':
        where.push(sql`${bookings.checkIn} <= ${to}::date AND ${bookings.checkOut} > ${from}::date`);
        break;
    }
  }
  if (f.q?.trim()) {
    const q = f.q.trim();
    const m = normaliseMobile(q);
    where.push(
      or(
        ilike(bookings.bookingNo, `%${q}%`),
        ilike(bookings.otaRef, `%${q}%`),
        ilike(guests.name, `%${q}%`),
        m && m.length >= 4 ? ilike(guests.mobile, `%${m}%`) : undefined,
      )!,
    );
  }

  const order = f.sort === 'created' ? desc(bookings.createdAt) : f.sort === 'amount' ? desc(bookings.totalAmount) : desc(bookings.checkIn);
  const rows = await db
    .select({
      id: bookings.id,
      bookingNo: bookings.bookingNo,
      otaRef: bookings.otaRef,
      source: bookings.source,
      channel: bookings.channel,
      status: bookings.status,
      checkIn: bookings.checkIn,
      checkOut: bookings.checkOut,
      nights: bookings.nights,
      adults: bookings.adults,
      totalAmount: bookings.totalAmount,
      paidAmount: bookings.paidAmount,
      discountAmount: bookings.discountAmount,
      taxAmount: bookings.taxAmount,
      createdAt: bookings.createdAt,
      guestName: guests.name,
      mobile: guests.mobile,
      roomTypes: sql<string>`(SELECT string_agg(DISTINCT rt.name, ', ') FROM booking_rooms br JOIN room_types rt ON rt.id = br.room_type_id WHERE br.booking_id = "bookings"."id")`,
      roomNumbers: sql<string | null>`(SELECT string_agg(r.number, ', ' ORDER BY r.number) FROM booking_rooms br JOIN rooms r ON r.id = br.room_id WHERE br.booking_id = "bookings"."id")`,
      roomCount: sql<number>`(SELECT count(*)::int FROM booking_rooms br WHERE br.booking_id = "bookings"."id")`,
      extras: sql<number>`(SELECT COALESCE(sum(fl.total), 0)::float FROM folio_lines fl WHERE fl.booking_id = "bookings"."id" AND fl.type <> 'room' AND NOT fl.is_void)`,
    })
    .from(bookings)
    .innerJoin(guests, eq(guests.id, bookings.guestId))
    .where(and(...where))
    .orderBy(order, asc(bookings.bookingNo))
    .limit(limit);

  const withBalance = rows.map((r) => ({ ...r, balance: bookingBalance(r) }));
  const counted = withBalance.filter((r) => !['cancelled', 'no_show'].includes(r.status));
  const summary = {
    count: withBalance.length,
    roomNights: counted.reduce((t, r) => t + r.nights * r.roomCount, 0),
    revenue: round2(counted.reduce((t, r) => t + r.totalAmount, 0)),
    paid: round2(counted.reduce((t, r) => t + r.paidAmount, 0)),
    balance: round2(counted.reduce((t, r) => t + Math.max(0, r.balance), 0)),
  };
  return { rows: withBalance, summary, truncated: rows.length === limit };
}

export async function roomTypeList(propertyId: string) {
  return db.select({ id: roomTypes.id, name: roomTypes.name }).from(roomTypes).where(eq(roomTypes.propertyId, propertyId)).orderBy(asc(roomTypes.sortOrder));
}

