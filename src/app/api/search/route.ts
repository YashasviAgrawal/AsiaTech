import { NextResponse, type NextRequest } from 'next/server';
import { and, desc, eq, ilike, isNull, or } from 'drizzle-orm';
import { db } from '@/db';
import { bookings, guests, rooms, roomTypes } from '@/db/schema';
import { getContext } from '@/server/context';
import { formatDay, sourceLabel } from '@/lib/format';
import { normaliseMobile } from '@/lib/utils';
import type { SearchResult } from '@/components/shell/global-search';

/** Global search (rule 3): booking ID, guest name, mobile number or room number. */
export async function GET(request: NextRequest) {
  const ctx = await getContext();
  if (!ctx) return NextResponse.json({ results: [] }, { status: 401 });
  const q = (request.nextUrl.searchParams.get('q') ?? '').trim();
  if (q.length < 2) return NextResponse.json({ results: [] });

  const pid = ctx.propertyId;
  const like = `%${q}%`;
  const digits = normaliseMobile(q);

  const [bookingRows, guestRows, roomRows] = await Promise.all([
    db
      .select({
        id: bookings.id,
        bookingNo: bookings.bookingNo,
        otaRef: bookings.otaRef,
        status: bookings.status,
        checkIn: bookings.checkIn,
        checkOut: bookings.checkOut,
        source: bookings.source,
        channel: bookings.channel,
        guestName: guests.name,
        mobile: guests.mobile,
      })
      .from(bookings)
      .innerJoin(guests, eq(guests.id, bookings.guestId))
      .where(
        and(
          eq(bookings.propertyId, pid),
          or(
            ilike(bookings.bookingNo, like),
            ilike(bookings.otaRef, like),
            ilike(guests.name, like),
            digits && digits.length >= 4 ? ilike(guests.mobile, `%${digits}%`) : undefined,
          ),
        ),
      )
      .orderBy(desc(bookings.checkIn))
      .limit(6),
    db
      .select({ id: guests.id, name: guests.name, mobile: guests.mobile, city: guests.city })
      .from(guests)
      .where(
        and(
          eq(guests.propertyId, pid),
          isNull(guests.mergedIntoId),
          or(ilike(guests.name, like), digits && digits.length >= 4 ? ilike(guests.mobile, `%${digits}%`) : undefined, ilike(guests.email, like)),
        ),
      )
      .limit(5),
    db
      .select({ id: rooms.id, number: rooms.number, hkStatus: rooms.hkStatus, typeName: roomTypes.name })
      .from(rooms)
      .innerJoin(roomTypes, eq(roomTypes.id, rooms.roomTypeId))
      .where(and(eq(rooms.propertyId, pid), ilike(rooms.number, `${q}%`)))
      .limit(5),
  ]);

  const results: SearchResult[] = [
    ...bookingRows.map((b) => ({
      type: 'booking' as const,
      id: b.id,
      title: `${b.bookingNo} · ${b.guestName}`,
      subtitle: `${formatDay(b.checkIn)} → ${formatDay(b.checkOut)} · ${sourceLabel(b.source, b.channel)}${b.mobile ? ` · ${b.mobile}` : ''}`,
      href: `/front-desk/bookings/${b.id}`,
      meta: b.status.replace('_', ' '),
    })),
    ...guestRows.map((g) => ({
      type: 'guest' as const,
      id: g.id,
      title: g.name,
      subtitle: [g.mobile, g.city].filter(Boolean).join(' · ') || 'Guest profile',
      href: `/front-desk/guests/${g.id}`,
    })),
    ...roomRows.map((r) => ({
      type: 'room' as const,
      id: r.id,
      title: `Room ${r.number}`,
      subtitle: r.typeName,
      href: `/rooms/chart?room=${r.number}`,
      meta: r.hkStatus.replace('_', ' '),
    })),
  ];

  return NextResponse.json({ results });
}
