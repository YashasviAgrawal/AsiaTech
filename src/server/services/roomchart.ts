import 'server-only';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/db';
import { bookingRooms, bookings, guests, rooms, roomTypes } from '@/db/schema';
import { addDay } from '@/lib/format';
import { round2 } from '@/lib/utils';

export interface ChartStay {
  id: string;
  bookingId: string;
  bookingNo: string;
  roomId: string | null;
  roomTypeId: string;
  checkIn: string;
  checkOut: string;
  status: 'reserved' | 'in_house' | 'departed';
  bookingStatus: string;
  guestName: string;
  source: string;
  channel: string | null;
  adults: number;
  balance: number;
}

export async function getRoomChart(propertyId: string, start: string, days: number) {
  const end = addDay(start, days);
  const [roomRows, stayRows] = await Promise.all([
    db
      .select({
        id: rooms.id,
        number: rooms.number,
        floor: rooms.floor,
        hkStatus: rooms.hkStatus,
        roomTypeId: rooms.roomTypeId,
        typeName: roomTypes.name,
        typeCode: roomTypes.code,
        typeColor: roomTypes.color,
      })
      .from(rooms)
      .innerJoin(roomTypes, eq(roomTypes.id, rooms.roomTypeId))
      .where(and(eq(rooms.propertyId, propertyId), eq(rooms.isActive, true), eq(roomTypes.isActive, true)))
      .orderBy(asc(roomTypes.sortOrder), asc(rooms.sortOrder), asc(rooms.number)),
    db
      .select({
        id: bookingRooms.id,
        bookingId: bookings.id,
        bookingNo: bookings.bookingNo,
        roomId: bookingRooms.roomId,
        roomTypeId: bookingRooms.roomTypeId,
        checkIn: bookingRooms.checkIn,
        checkOut: bookingRooms.checkOut,
        status: bookingRooms.status,
        bookingStatus: bookings.status,
        guestName: guests.name,
        source: bookings.source,
        channel: bookings.channel,
        adults: bookingRooms.adults,
        totalAmount: bookings.totalAmount,
        paidAmount: bookings.paidAmount,
        extras: sql<number>`(SELECT COALESCE(sum(f.total), 0)::float FROM folio_lines f WHERE f.booking_id = "bookings"."id" AND f.type <> 'room' AND NOT f.is_void)`,
      })
      .from(bookingRooms)
      .innerJoin(bookings, eq(bookings.id, bookingRooms.bookingId))
      .innerJoin(guests, eq(guests.id, bookings.guestId))
      .where(
        and(
          eq(bookingRooms.propertyId, propertyId),
          inArray(bookingRooms.status, ['reserved', 'in_house', 'departed']),
          sql`${bookingRooms.checkIn} < ${end}`,
          sql`${bookingRooms.checkOut} > ${start}`,
        ),
      ),
  ]);

  const stays: ChartStay[] = stayRows.map((s) => ({
    id: s.id,
    bookingId: s.bookingId,
    bookingNo: s.bookingNo,
    roomId: s.roomId,
    roomTypeId: s.roomTypeId,
    checkIn: s.checkIn,
    checkOut: s.checkOut,
    status: s.status as ChartStay['status'],
    bookingStatus: s.bookingStatus,
    guestName: s.guestName,
    source: s.source,
    channel: s.channel,
    adults: s.adults,
    balance: round2(s.totalAmount + s.extras - s.paidAmount),
  }));

  return {
    rooms: roomRows,
    stays: stays.filter((s) => s.roomId),
    unassigned: stays.filter((s) => !s.roomId && s.status === 'reserved'),
  };
}

