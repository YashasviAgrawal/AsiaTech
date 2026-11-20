import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import { bookingRooms, bookings, guests, properties, rooms, roomTypes } from '@/db/schema';
import { requireContext } from '@/server/context';
import { formatDateTime, formatDay, formatINR, MEAL_PLAN_LABELS, sourceLabel } from '@/lib/format';

export const metadata: Metadata = { title: 'Registration Card' };

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="border-b border-dotted border-ink-300 py-2">
      <p className="text-[10px] font-semibold tracking-wider text-ink-400 uppercase">{label}</p>
      <p className="mt-0.5 min-h-5 font-medium text-ink-900">{value || ' '}</p>
    </div>
  );
}

export default async function RegistrationCard({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireContext('bookings.view');
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const [booking] = await db.select().from(bookings).where(and(eq(bookings.id, id), eq(bookings.propertyId, ctx.propertyId)));
  if (!booking) notFound();
  const [guest] = await db.select().from(guests).where(eq(guests.id, booking.guestId));
  const [property] = await db.select().from(properties).where(eq(properties.id, ctx.propertyId));
  const roomRows = await db
    .select({ br: bookingRooms, typeName: roomTypes.name, number: rooms.number })
    .from(bookingRooms)
    .innerJoin(roomTypes, eq(roomTypes.id, bookingRooms.roomTypeId))
    .leftJoin(rooms, eq(rooms.id, bookingRooms.roomId))
    .where(eq(bookingRooms.bookingId, id));

  return (
    <article className="mx-auto w-full max-w-[210mm] bg-white p-10 text-[13px] text-ink-800 shadow-lift print:max-w-none print:p-0 print:shadow-none">
      <header className="flex items-start justify-between border-b-2 border-ink-900 pb-4">
        <div>
          <h1 className="text-xl font-extrabold text-ink-900">{property.name}</h1>
          <p className="text-ink-600">{[property.addressLine1, property.city, property.state].filter(Boolean).join(', ')} · {property.phone}</p>
        </div>
        <div className="text-right">
          <p className="text-xs font-bold tracking-[0.2em] text-brand-600 uppercase">Guest registration card</p>
          <p className="mt-1 font-mono text-base font-bold">{booking.bookingNo}</p>
          <p className="text-ink-500">{sourceLabel(booking.source, booking.channel)}</p>
        </div>
      </header>

      <section className="mt-4 grid grid-cols-2 gap-x-8">
        <Row label="Guest name" value={guest.name} />
        <Row label="Mobile" value={guest.mobile ? `+91 ${guest.mobile}` : ''} />
        <Row label="Email" value={guest.email} />
        <Row label="Nationality" value={guest.nationality} />
        <Row label="Address" value={[guest.addressLine, guest.city, guest.state, guest.pincode].filter(Boolean).join(', ')} />
        <Row label="Company / GSTIN" value={[guest.company, guest.companyGstin].filter(Boolean).join(' · ')} />
        <Row label="ID proof" value={guest.idType ? `${guest.idType.replace('_', ' ')} · ${guest.idNumberMasked ?? ''}` : ''} />
        <Row label="Purpose of visit" value={guest.purposeOfVisit} />
        <Row label="Arrival" value={`${formatDay(booking.checkIn)} ${roomRows[0]?.br.checkedInAt ? `· ${formatDateTime(roomRows[0].br.checkedInAt).split(', ')[1]}` : ''}`} />
        <Row label="Departure" value={formatDay(booking.checkOut)} />
        <Row label="Room(s)" value={roomRows.map((r) => `${r.number ?? '—'} (${r.typeName}, ${MEAL_PLAN_LABELS[r.br.mealPlan]})`).join('; ')} />
        <Row label="Guests" value={`${booking.adults} adult${booking.adults === 1 ? '' : 's'}${booking.children ? `, ${booking.children} child` : ''}`} />
        <Row label="Room tariff (incl. GST)" value={formatINR(booking.totalAmount)} />
        <Row label="Advance paid" value={formatINR(booking.paidAmount)} />
      </section>

      {guest.isForeign && (
        <section className="mt-6 rounded-lg border border-ink-300 p-4">
          <p className="text-xs font-bold tracking-wider text-ink-700 uppercase">Form-C details (foreign national)</p>
          <div className="mt-2 grid grid-cols-3 gap-x-6">
            <Row label="Passport no." value={guest.passportNumber} />
            <Row label="Passport expiry" value={guest.passportExpiry ? formatDay(guest.passportExpiry) : ''} />
            <Row label="Visa no. / type" value={[guest.visaNumber, guest.visaType].filter(Boolean).join(' · ')} />
            <Row label="Visa expiry" value={guest.visaExpiry ? formatDay(guest.visaExpiry) : ''} />
            <Row label="Arrived from" value={guest.arrivedFrom} />
            <Row label="Next destination" value={guest.nextDestination} />
            <Row label="Date of arrival in India" value={guest.arrivalInIndia ? formatDay(guest.arrivalInIndia) : ''} />
          </div>
        </section>
      )}

      <section className="mt-6 text-[11px] leading-relaxed text-ink-500">
        <p className="font-semibold text-ink-700">Terms</p>
        <p>
          Check-in {property.checkInTime} · check-out {property.checkOutTime}. Valid photo ID is required for every adult guest. The hotel is not responsible for valuables not deposited at the front desk.
          Visitors are allowed in the lobby only. I agree to pay all charges incurred during my stay.
        </p>
      </section>

      <footer className="mt-14 grid grid-cols-2 gap-10 text-center text-xs text-ink-600">
        <div className="border-t border-ink-400 pt-2">Guest signature</div>
        <div className="border-t border-ink-400 pt-2">Front desk ({ctx.user.name})</div>
      </footer>
    </article>
  );
}
