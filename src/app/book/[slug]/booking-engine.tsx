'use client';

import { useEffect, useState, useTransition } from 'react';
import { BadgeCheck, BedDouble, Check, Clock, Loader2, MapPin, Minus, Phone, Plus, Ruler, ShieldCheck, Star, Ticket, Users, Wifi } from 'lucide-react';
import { cn } from '@/lib/utils';
import { addDay, formatDay, formatDayShort, formatINR, MEAL_PLAN_LABELS, nightsBetween } from '@/lib/format';
import { publicBookAction, searchStayAction } from '@/server/actions/public-booking';

type Results = Extract<Awaited<ReturnType<typeof searchStayAction>>, { ok: true }>['data'];
type Room = Results['results'][number];

interface Hotel {
  slug: string;
  name: string;
  city: string;
  address: string;
  phone: string | null;
  email: string | null;
  checkInTime: string;
  checkOutTime: string;
  starRating: number | null;
  branding: { primaryColor: string; tagline?: string; aboutText?: string; heroImageUrl?: string; logoUrl?: string };
}

export function BookingEngine({ hotel, defaults }: { hotel: Hotel; defaults: { checkIn: string; checkOut: string; today: string } }) {
  const brand = hotel.branding.primaryColor || '#e11d48';
  const [checkIn, setCheckIn] = useState(defaults.checkIn);
  const [checkOut, setCheckOut] = useState(defaults.checkOut);
  const [adults, setAdults] = useState(2);
  const [coupon, setCoupon] = useState('');
  const [results, setResults] = useState<Results | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [searching, startSearch] = useTransition();
  const [selected, setSelected] = useState<{ room: Room; option: Room['options'][number] } | null>(null);
  const [guest, setGuest] = useState({ name: '', mobile: '', email: '', city: '' });
  const [requests, setRequests] = useState('');
  const [payNow, setPayNow] = useState(true);
  const [booking, startBooking] = useTransition();
  const [done, setDone] = useState<{ bookingNo: string; total: number; paymentUrl: string | null } | null>(null);

  function search() {
    startSearch(async () => {
      setError(null);
      const r = await searchStayAction({ slug: hotel.slug, checkIn, checkOut, adults, coupon: coupon || null });
      if (r.ok) setResults(r.data);
      else setError(r.error);
    });
  }

  useEffect(() => {
    search();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function book() {
    if (!selected) return;
    setError(null);
    startBooking(async () => {
      const r = await publicBookAction({
        slug: hotel.slug,
        checkIn,
        checkOut,
        roomTypeId: selected.room.id,
        ratePlanId: selected.option.ratePlanId,
        rooms: selected.room.roomsNeeded,
        adultsPerRoom: selected.room.adultsPerRoom,
        coupon: coupon || null,
        guest,
        specialRequests: requests || null,
        payNow,
      });
      if (r.ok) {
        setDone(r.data);
        if (r.data.paymentUrl) window.location.href = r.data.paymentUrl;
      } else setError(r.error);
    });
  }

  const nights = nightsBetween(checkIn, checkOut);

  return (
    <div className="min-h-screen bg-ink-50" style={{ ['--brand' as string]: brand }}>
      {/* Hero */}
      <header className="relative h-72 bg-cover bg-center sm:h-80" style={{ backgroundImage: hotel.branding.heroImageUrl ? `url(${hotel.branding.heroImageUrl})` : `linear-gradient(135deg, ${brand}, #0f172a 85%)` }}>
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
        <div className="relative mx-auto flex h-full max-w-6xl flex-col justify-end px-4 pb-20 text-white sm:px-6">
          {hotel.starRating ? (
            <p className="flex gap-0.5">
              {Array.from({ length: hotel.starRating }).map((_, i) => (
                <Star key={i} className="h-4 w-4 fill-amber-400 text-amber-400" />
              ))}
            </p>
          ) : null}
          <h1 className="mt-2 text-3xl font-extrabold tracking-tight sm:text-4xl">{hotel.name}</h1>
          <p className="mt-1 flex items-center gap-1.5 text-sm text-white/85">
            <MapPin className="h-4 w-4" /> {hotel.address}
          </p>
          {hotel.branding.tagline && <p className="mt-1 text-sm text-white/70">{hotel.branding.tagline}</p>}
        </div>
      </header>

      {/* Search bar */}
      <div className="relative z-10 mx-auto -mt-12 max-w-6xl px-4 sm:px-6">
        <div className="grid gap-2 rounded-2xl bg-white p-3 shadow-lift ring-1 ring-ink-200 sm:grid-cols-[1fr_1fr_auto_1fr_auto]">
          <label className="rounded-xl bg-ink-50 px-3 py-2">
            <span className="block text-[11px] font-semibold text-ink-500 uppercase">Check-in</span>
            <input type="date" min={defaults.today} value={checkIn} onChange={(e) => (setCheckIn(e.target.value), e.target.value >= checkOut && setCheckOut(addDay(e.target.value, 1)))} className="w-full bg-transparent text-sm font-semibold text-ink-900 outline-none" />
          </label>
          <label className="rounded-xl bg-ink-50 px-3 py-2">
            <span className="block text-[11px] font-semibold text-ink-500 uppercase">Check-out</span>
            <input type="date" min={addDay(checkIn, 1)} value={checkOut} onChange={(e) => setCheckOut(e.target.value)} className="w-full bg-transparent text-sm font-semibold text-ink-900 outline-none" />
          </label>
          <div className="flex items-center gap-2 rounded-xl bg-ink-50 px-3 py-2">
            <Users className="h-4 w-4 text-ink-400" />
            <button onClick={() => setAdults(Math.max(1, adults - 1))} className="grid h-7 w-7 place-items-center rounded-md bg-white ring-1 ring-ink-200" aria-label="Fewer guests">
              <Minus className="h-3.5 w-3.5" />
            </button>
            <span className="num w-16 text-center text-sm font-semibold">{adults} adult{adults > 1 ? 's' : ''}</span>
            <button onClick={() => setAdults(Math.min(12, adults + 1))} className="grid h-7 w-7 place-items-center rounded-md bg-white ring-1 ring-ink-200" aria-label="More guests">
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>
          <label className="flex items-center gap-2 rounded-xl bg-ink-50 px-3 py-2">
            <Ticket className="h-4 w-4 text-ink-400" />
            <input value={coupon} onChange={(e) => setCoupon(e.target.value.toUpperCase())} placeholder="Coupon code" className="w-full bg-transparent font-mono text-sm outline-none placeholder:font-sans" />
          </label>
          <button onClick={search} disabled={searching} className="flex h-full min-h-12 items-center justify-center gap-2 rounded-xl px-6 text-sm font-bold text-white shadow-lg transition active:scale-[0.98] disabled:opacity-60" style={{ backgroundColor: brand }}>
            {searching && <Loader2 className="h-4 w-4 animate-spin" />} Check rates
          </button>
        </div>
      </div>

      <main className="mx-auto grid max-w-6xl gap-6 px-4 py-8 sm:px-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <section className="space-y-4">
          {error && <p className="rounded-xl bg-rose-50 p-3 text-sm font-medium text-rose-700 ring-1 ring-rose-200">{error}</p>}
          {results?.coupon && <p className="rounded-xl bg-emerald-50 p-3 text-sm font-medium text-emerald-800 ring-1 ring-emerald-200">Coupon applied: {results.coupon}</p>}
          {!results && searching && <Loader2 className="mx-auto mt-10 h-6 w-6 animate-spin text-ink-400" />}
          {results?.results.map((room) => {
            const soldOut = room.available < room.roomsNeeded;
            return (
              <article key={room.id} className={cn('overflow-hidden rounded-2xl bg-white shadow-card ring-1 ring-ink-200', soldOut && 'opacity-60')}>
                <div className="grid sm:grid-cols-[200px_1fr]">
                  <div className="grid min-h-36 place-items-center" style={{ background: `linear-gradient(135deg, ${room.color}22, ${room.color}55)` }}>
                    <BedDouble className="h-12 w-12" style={{ color: room.color }} />
                  </div>
                  <div className="p-5">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <h2 className="text-lg font-bold text-ink-900">{room.name}</h2>
                        <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-500">
                          {room.bedType && <span>{room.bedType} bed</span>}
                          {room.sizeSqft && (
                            <span className="flex items-center gap-1">
                              <Ruler className="h-3 w-3" /> {room.sizeSqft} sq ft
                            </span>
                          )}
                          <span className="flex items-center gap-1">
                            <Users className="h-3 w-3" /> up to {room.maxAdults}
                          </span>
                        </p>
                      </div>
                      <span className={cn('rounded-full px-2.5 py-1 text-xs font-bold', soldOut ? 'bg-rose-50 text-rose-700' : room.available <= 2 ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700')}>
                        {soldOut ? 'Sold out' : room.available <= 2 ? `Only ${room.available} left` : 'Available'}
                      </span>
                    </div>
                    <p className="mt-2 flex flex-wrap gap-1.5">
                      {room.amenities.slice(0, 5).map((a) => (
                        <span key={a} className="flex items-center gap-1 rounded-full bg-ink-50 px-2 py-0.5 text-[11px] text-ink-600">
                          {a === 'Free Wi-Fi' ? <Wifi className="h-3 w-3" /> : <Check className="h-3 w-3" />} {a}
                        </span>
                      ))}
                    </p>
                    {room.roomsNeeded > 1 && <p className="mt-2 text-xs font-medium text-ink-600">{room.roomsNeeded} rooms for {adults} adults</p>}
                    <ul className="mt-4 divide-y divide-ink-100 rounded-xl ring-1 ring-ink-200">
                      {room.options.map((opt) => {
                        const active = selected?.option.ratePlanId === opt.ratePlanId;
                        return (
                          <li key={opt.ratePlanId} className={cn('flex flex-wrap items-center gap-3 p-3', active && 'bg-ink-50')}>
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-semibold text-ink-900">{MEAL_PLAN_LABELS[opt.mealPlan]}</p>
                              <p className="text-xs text-ink-500">{opt.policy}</p>
                            </div>
                            <div className="text-right">
                              {opt.discount > 0 && <p className="num text-xs text-ink-400 line-through">{formatINR(opt.total + opt.discount)}</p>}
                              <p className="num text-lg font-extrabold text-ink-900">{formatINR(opt.total)}</p>
                              <p className="text-[11px] text-ink-500">
                                {nights} night{nights > 1 ? 's' : ''} · incl. GST
                              </p>
                            </div>
                            <button
                              disabled={soldOut}
                              onClick={() => setSelected({ room, option: opt })}
                              className={cn('h-10 rounded-xl px-4 text-sm font-bold transition active:scale-95 disabled:opacity-40', active ? 'text-white' : 'bg-white ring-1 ring-ink-300')}
                              style={active ? { backgroundColor: brand } : undefined}
                            >
                              {active ? 'Selected' : 'Select'}
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                </div>
              </article>
            );
          })}
          {hotel.branding.aboutText && (
            <div className="rounded-2xl bg-white p-5 text-sm leading-relaxed text-ink-600 ring-1 ring-ink-200">
              <h3 className="mb-1 font-bold text-ink-900">About {hotel.name}</h3>
              {hotel.branding.aboutText}
            </div>
          )}
        </section>

        <aside className="lg:sticky lg:top-6 lg:h-fit">
          <div className="overflow-hidden rounded-2xl bg-white shadow-lift ring-1 ring-ink-200">
            {done ? (
              <div className="p-6 text-center">
                <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-emerald-50 text-emerald-600">
                  <BadgeCheck className="h-8 w-8" />
                </span>
                <p className="mt-3 text-lg font-bold text-ink-900">Booking confirmed</p>
                <p className="font-mono text-sm text-ink-600">{done.bookingNo}</p>
                <p className="mt-3 text-sm text-ink-600">
                  We have sent the details on WhatsApp. {done.paymentUrl ? 'Taking you to payment…' : `Pay ${formatINR(done.total)} at the hotel.`}
                </p>
              </div>
            ) : (
              <>
                <div className="p-5 text-white" style={{ backgroundColor: '#0f172a' }}>
                  <p className="text-xs text-ink-400">
                    {formatDayShort(checkIn)} → {formatDayShort(checkOut)} · {nights} night{nights > 1 ? 's' : ''} · {adults} adult{adults > 1 ? 's' : ''}
                  </p>
                  <p className="num mt-1 text-3xl font-extrabold">{selected ? formatINR(selected.option.total) : '—'}</p>
                  <p className="text-xs text-ink-400">{selected ? `${selected.room.name} · ${selected.option.mealPlan}` : 'Choose a room'}</p>
                </div>
                {selected && (
                  <div className="space-y-3 p-5">
                    <input value={guest.name} onChange={(e) => setGuest({ ...guest, name: e.target.value })} placeholder="Full name" className="input" />
                    <input value={guest.mobile} onChange={(e) => setGuest({ ...guest, mobile: e.target.value.replace(/\D/g, '').slice(-10) })} placeholder="Mobile (WhatsApp)" inputMode="tel" className="input" />
                    <input type="email" value={guest.email} onChange={(e) => setGuest({ ...guest, email: e.target.value })} placeholder="Email" className="input" />
                    <textarea value={requests} onChange={(e) => setRequests(e.target.value)} placeholder="Special requests (optional)" className="input min-h-16" />
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        { v: true, label: 'Pay now', sub: 'UPI / card' },
                        { v: false, label: 'Pay at hotel', sub: 'On arrival' },
                      ].map((o) => (
                        <button key={o.label} onClick={() => setPayNow(o.v)} className={cn('rounded-xl p-2.5 text-left ring-1 transition', payNow === o.v ? 'ring-2' : 'ring-ink-200')} style={payNow === o.v ? { boxShadow: `0 0 0 2px ${brand}` } : undefined}>
                          <span className="block text-sm font-bold text-ink-900">{o.label}</span>
                          <span className="block text-[11px] text-ink-500">{o.sub}</span>
                        </button>
                      ))}
                    </div>
                    <button onClick={book} disabled={booking} className="flex h-12 w-full items-center justify-center gap-2 rounded-xl text-sm font-bold text-white shadow-lg transition active:scale-[0.98] disabled:opacity-60" style={{ backgroundColor: brand }}>
                      {booking && <Loader2 className="h-4 w-4 animate-spin" />} {payNow ? `Pay ${formatINR(selected.option.total)}` : 'Confirm booking'}
                    </button>
                    <p className="flex items-center justify-center gap-1.5 text-[11px] text-ink-400">
                      <ShieldCheck className="h-3.5 w-3.5" /> Best rate when you book direct
                    </p>
                  </div>
                )}
              </>
            )}
          </div>
          <div className="mt-4 space-y-1.5 rounded-2xl bg-white p-4 text-xs text-ink-600 ring-1 ring-ink-200">
            <p className="flex items-center gap-2">
              <Clock className="h-3.5 w-3.5" /> Check-in {hotel.checkInTime} · Check-out {hotel.checkOutTime}
            </p>
            {hotel.phone && (
              <p className="flex items-center gap-2">
                <Phone className="h-3.5 w-3.5" /> {hotel.phone}
              </p>
            )}
            <p className="text-ink-400">Arriving {formatDay(checkIn)}</p>
          </div>
        </aside>
      </main>
      <footer className="pb-8 text-center text-xs text-ink-400">Powered by AsiaTech Hotel OS</footer>
    </div>
  );
}
