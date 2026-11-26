'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  BedDouble,
  Building2,
  CalendarRange,
  ChevronDown,
  Clock,
  CreditCard,
  Loader2,
  MessageCircle,
  Minus,
  Plus,
  Sparkles,
  Trash2,
  User,
  UserCheck,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { tx } from '@/i18n/tx';
import { addDay, formatDay, formatDayShort, formatINR, MEAL_PLAN_LABELS, nightsBetween } from '@/lib/format';
import {
  availabilityAction,
  createReservationAction,
  duplicatesAction,
  lookupGuestAction,
  quoteAction,
  type ReservationInput,
} from '@/server/actions/reservations';
import type { Quote } from '@/server/services/pricing';
import type { DuplicateCandidate, GuestLookup } from '@/server/services/guests';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Checkbox, Field, Input, Segmented, Select, Stepper, Switch, Textarea } from '@/components/ui/fields';
import { useToast } from '@/components/ui/toast';

import type { RoomTypeOption } from '@/server/services/room-options';
export type { RoomTypeOption };

interface RoomLine {
  key: number;
  roomTypeId: string;
  ratePlanId: string;
  adults: number;
  children: number;
  extraBeds: number;
  rateOverride: number | null;
  roomId?: string | null;
}

type Availability = Record<string, { available: number; stopSell: boolean }>;

const SOURCES: { value: ReservationInput['source']; label: string }[] = [
  { value: 'front_desk', label: 'Front desk' },
  { value: 'walk_in', label: 'Walk-in' },
  { value: 'phone', label: 'Phone' },
  { value: 'corporate', label: 'Corporate' },
  { value: 'agent', label: 'Travel agent' },
];

const HOLD_PRESETS = [
  { hours: 1, label: '1 hour' },
  { hours: 2, label: '2 hours' },
  { hours: 6, label: '6 hours' },
  { hours: 24, label: '1 day' },
  { hours: 48, label: '2 days' },
];

let lineKey = 0;
const nextLineKey = () => ++lineKey;

function Step({ n, title, description, children, aside }: { n: number; title: string; description?: string; children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <Card className="p-5 sm:p-6">
      <div className="mb-5 flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-ink-900 text-xs font-bold text-white">{n}</span>
          <div>
            <h2 className="text-[15px] font-bold text-ink-900">{tx(title)}</h2>
            {description && <p className="mt-0.5 text-xs text-ink-500">{tx(description)}</p>}
          </div>
        </div>
        {aside}
      </div>
      {children}
    </Card>
  );
}

export function ReservationForm({
  roomTypes,
  initialAvailability,
  defaults,
  businessDate,
  holdMinutesDefault,
  canOverbook,
}: {
  roomTypes: RoomTypeOption[];
  initialAvailability: Availability;
  defaults: { checkIn: string; checkOut: string; source: ReservationInput['source']; guestName: string; roomTypeId: string | null; roomId: string | null; hold: boolean };
  businessDate: string;
  holdMinutesDefault: number;
  canOverbook: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const typeMap = useMemo(() => new Map(roomTypes.map((t) => [t.id, t])), [roomTypes]);

  const newLine = (typeId: string, roomId?: string | null): RoomLine => {
    const type = typeMap.get(typeId)!;
    const plan = type.plans.find((p) => p.isDefault) ?? type.plans[0];
    return { key: nextLineKey(), roomTypeId: typeId, ratePlanId: plan?.id ?? '', adults: Math.min(2, type.maxAdults), children: 0, extraBeds: 0, rateOverride: null, roomId: roomId ?? null };
  };

  // Stay
  const [checkIn, setCheckIn] = useState(defaults.checkIn);
  const [checkOut, setCheckOut] = useState(defaults.checkOut);
  const [source, setSource] = useState(defaults.source);
  const [arrivalTime, setArrivalTime] = useState('');
  const [availability, setAvailability] = useState<Availability>(initialAvailability);
  const [availabilityFor, setAvailabilityFor] = useState(`${defaults.checkIn}|${defaults.checkOut}`);
  // Rooms
  const [lines, setLines] = useState<RoomLine[]>(() => (defaults.roomTypeId && typeMap.has(defaults.roomTypeId) ? [newLine(defaults.roomTypeId, defaults.roomId)] : []));
  // Guest
  const [guestId, setGuestId] = useState<string | null>(null);
  const [mobile, setMobile] = useState('');
  const [name, setName] = useState(defaults.guestName);
  const [email, setEmail] = useState('');
  const [city, setCity] = useState('');
  const [nationality, setNationality] = useState('Indian');
  const [company, setCompany] = useState('');
  const [companyGstin, setCompanyGstin] = useState('');
  const [billToCompany, setBillToCompany] = useState(false);
  const [suggestions, setSuggestions] = useState<GuestLookup[]>([]);
  const [duplicates, setDuplicates] = useState<DuplicateCandidate[]>([]);
  // Money
  const [discountType, setDiscountType] = useState<'percent' | 'flat'>('percent');
  const [discountValue, setDiscountValue] = useState(0);
  const [advance, setAdvance] = useState(0);
  const [advanceMode, setAdvanceMode] = useState<'cash' | 'upi' | 'card' | 'bank_transfer'>('upi');
  const [advanceRef, setAdvanceRef] = useState('');
  const [specialRequests, setSpecialRequests] = useState('');
  const [internalNotes, setInternalNotes] = useState('');
  const [hold, setHold] = useState(defaults.hold);
  const [holdHours, setHoldHours] = useState(Math.max(1, Math.round(holdMinutesDefault / 60)));
  const [sendWhatsApp, setSendWhatsApp] = useState(true);
  const [allowOverbook, setAllowOverbook] = useState(false);
  const [showMore, setShowMore] = useState(false);
  // Quote
  const [quoteData, setQuoteData] = useState<Quote | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [saving, startSaving] = useTransition();
  const [showNightly, setShowNightly] = useState(false);

  const nights = nightsBetween(checkIn, checkOut);
  const loadingAvailability = availabilityFor !== `${checkIn}|${checkOut}`;

  // Availability for the chosen stay.
  useEffect(() => {
    if (nights <= 0) return;
    let cancelled = false;
    availabilityAction(checkIn, checkOut).then((result) => {
      if (cancelled) return;
      if (result.ok) setAvailability(result.data);
      setAvailabilityFor(`${checkIn}|${checkOut}`);
    });
    return () => {
      cancelled = true;
    };
  }, [checkIn, checkOut, nights]);

  // Live price (debounced).
  const quotable = nights > 0 && lines.length > 0 && lines.every((l) => l.ratePlanId);
  const quoteKey = JSON.stringify({ checkIn, checkOut, lines: lines.map(({ key: _k, roomId: _r, ...l }) => l), discountType, discountValue });
  useEffect(() => {
    if (!quotable) return;
    const timer = window.setTimeout(async () => {
      setQuoting(true);
      const result = await quoteAction({
        checkIn,
        checkOut,
        rooms: lines.map(({ key: _k, roomId: _r, ...l }) => l),
        discount: discountValue > 0 ? { type: discountType, value: discountValue } : null,
      });
      setQuoting(false);
      if (result.ok) {
        setQuoteData(result.data);
        setQuoteError(null);
      } else {
        setQuoteError(result.error);
      }
    }, 250);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quoteKey]);

  // Returning guest lookup by mobile (rule 5) or name.
  const lookupQuery = guestId ? '' : mobile.replace(/\D/g, '').length >= 6 ? mobile.replace(/\D/g, '') : name.trim().length >= 3 ? name.trim() : '';
  useEffect(() => {
    const q = lookupQuery;
    if (!q) return;
    const timer = window.setTimeout(async () => {
      const result = await lookupGuestAction(q);
      if (result.ok) setSuggestions(result.data);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [lookupQuery]);

  // Near-duplicate warning ("Vivek Agrawal" vs "Vivek Agewal").
  useEffect(() => {
    if (name.trim().length < 4) return;
    const timer = window.setTimeout(async () => {
      const result = await duplicatesAction(name, mobile || null, guestId ?? undefined);
      if (result.ok) setDuplicates(result.data);
    }, 500);
    return () => window.clearTimeout(timer);
  }, [name, mobile, guestId]);

  function applyGuest(g: GuestLookup) {
    setGuestId(g.id);
    setName(g.name);
    setMobile(g.mobile ?? '');
    setEmail(g.email ?? '');
    setCity(g.city ?? '');
    setNationality(g.nationality ?? 'Indian');
    setCompany(g.company ?? '');
    setCompanyGstin(g.companyGstin ?? '');
    setSuggestions([]);
  }

  function changeCheckIn(value: string) {
    setCheckIn(value);
    if (value >= checkOut) setCheckOut(addDay(value, Math.max(1, nights)));
  }

  function setNights(n: number) {
    setCheckOut(addDay(checkIn, Math.max(1, n)));
  }

  const updateLine = (key: number, patch: Partial<RoomLine>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const countOfType = (typeId: string) => lines.filter((l) => l.roomTypeId === typeId).length;

  const visibleSuggestions = lookupQuery ? suggestions : [];
  const visibleDuplicates = name.trim().length >= 4 && !guestId ? duplicates : [];
  const shownQuote = quotable ? quoteData : null;
  const shownQuoteError = quotable ? quoteError : null;
  const paidNow = Math.max(0, advance);
  const balance = shownQuote ? Math.max(0, shownQuote.totalAmount - paidNow) : 0;
  const shortOn = lines.length > 0 ? roomTypes.filter((t) => countOfType(t.id) > (availability[t.id]?.available ?? 0)) : [];
  const canSubmit = lines.length > 0 && name.trim().length >= 2 && nights > 0 && !shownQuoteError && (shortOn.length === 0 || allowOverbook);

  function submit() {
    startSaving(async () => {
      const result = await createReservationAction({
        source,
        checkIn,
        checkOut,
        arrivalTime: arrivalTime || null,
        rooms: lines.map(({ key: _k, ...l }) => l),
        guest: {
          id: guestId,
          name,
          mobile: mobile || null,
          email: email || null,
          city: city || null,
          nationality: nationality || null,
          company: company || null,
          companyGstin: companyGstin || null,
        },
        discount: discountValue > 0 ? { type: discountType, value: discountValue } : null,
        advance: paidNow > 0 ? { amount: paidNow, mode: advanceMode, reference: advanceRef || null } : null,
        billTo: billToCompany ? 'company' : 'guest',
        billToName: billToCompany ? company : null,
        specialRequests: specialRequests || null,
        internalNotes: internalNotes || null,
        hold: hold ? { until: new Date(Date.now() + holdHours * 3600_000).toISOString() } : null,
        sendWhatsApp: sendWhatsApp && Boolean(mobile),
        allowOverbook,
      });
      if (result.ok) {
        toast.success(`${hold ? 'Rooms held' : 'Booking confirmed'} · ${result.data.bookingNo}`, {
          description: sendWhatsApp && mobile ? 'Confirmation sent on WhatsApp.' : undefined,
        });
        router.push(`/front-desk/bookings/${result.data.id}`);
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
      <div className="space-y-5">
        {/* 1 · Stay */}
        <Step n={1} title="Stay" description="Dates start as today → tomorrow.">
          <div className="grid gap-4 sm:grid-cols-[1fr_1fr_auto]">
            <Field label="Check-in">
              <Input type="date" value={checkIn} min={businessDate} onChange={(e) => e.target.value && changeCheckIn(e.target.value)} />
            </Field>
            <Field label="Check-out">
              <Input type="date" value={checkOut} min={addDay(checkIn, 1)} onChange={(e) => e.target.value && setCheckOut(e.target.value)} />
            </Field>
            <Field label="Nights">
              <Stepper value={Math.max(nights, 1)} onChange={setNights} min={1} max={60} />
            </Field>
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field label="Booked via">
              <Segmented size="sm" value={source} onChange={setSource} options={SOURCES.map((s) => ({ value: s.value, label: s.label }))} className="flex-wrap" />
            </Field>
            <Field label="Expected arrival time">
              <Input type="time" value={arrivalTime} onChange={(e) => setArrivalTime(e.target.value)} />
            </Field>
          </div>
        </Step>

        {/* 2 · Rooms */}
        <Step
          n={2}
          title="Rooms"
          description={`${formatDayShort(checkIn)} → ${formatDayShort(checkOut)} · ${nights} night${nights === 1 ? '' : 's'}. Numbers show rooms free for every night.`}
          aside={loadingAvailability ? <Loader2 className="h-4 w-4 animate-spin text-ink-400" /> : null}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            {roomTypes.map((type) => {
              const avail = availability[type.id]?.available ?? 0;
              const left = avail - countOfType(type.id);
              const plan = type.plans.find((p) => p.isDefault) ?? type.plans[0];
              const tone = left <= 0 ? 'bg-rose-50 text-rose-700 ring-rose-200' : left <= 2 ? 'bg-amber-50 text-amber-800 ring-amber-200' : 'bg-emerald-50 text-emerald-700 ring-emerald-200';
              return (
                <div key={type.id} className="group relative flex items-center gap-3 overflow-hidden rounded-xl border border-ink-200 bg-white p-3.5 transition hover:border-ink-300 hover:shadow-card">
                  <span className="absolute inset-y-0 left-0 w-1" style={{ backgroundColor: type.color }} />
                  <div className="min-w-0 flex-1 pl-1.5">
                    <p className="truncate text-sm font-semibold text-ink-900">{type.name}</p>
                    <p className="mt-0.5 flex items-center gap-2 text-xs text-ink-500">
                      <span className={cn('badge px-2 py-0', tone)}>{tx(left <= 0 ? 'Sold out' : `${left} left`)}</span>
                      {plan && <span className="num">{tx(`from ${formatINR(plan.price2)}`)}</span>}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    {countOfType(type.id) > 0 && (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            const last = [...lines].reverse().find((l) => l.roomTypeId === type.id);
                            if (last) setLines((ls) => ls.filter((l) => l.key !== last.key));
                          }}
                          className="grid h-8 w-8 place-items-center rounded-lg text-ink-500 ring-1 ring-ink-200 transition hover:bg-ink-50"
                          aria-label={`Remove one ${type.name}`}
                        >
                          <Minus className="h-3.5 w-3.5" />
                        </button>
                        <span className="num w-6 text-center text-sm font-bold">{countOfType(type.id)}</span>
                      </>
                    )}
                    <button
                      type="button"
                      onClick={() => setLines((ls) => [...ls, newLine(type.id)])}
                      disabled={!plan || (left <= 0 && !canOverbook)}
                      className={cn(
                        'grid h-8 place-items-center rounded-lg text-xs font-semibold transition active:scale-95 disabled:cursor-not-allowed disabled:opacity-40',
                        countOfType(type.id) > 0 ? 'w-8 bg-ink-900 text-white hover:bg-ink-800' : 'bg-brand-600 px-3 text-white shadow-sm shadow-brand-600/20 hover:bg-brand-700',
                      )}
                      aria-label={`Add ${type.name}`}
                    >
                      {countOfType(type.id) > 0 ? <Plus className="h-3.5 w-3.5" /> : tx('Add')}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {lines.length > 0 && (
            <div className="mt-5 space-y-2.5">
              {lines.map((line, index) => {
                const type = typeMap.get(line.roomTypeId)!;
                const quoted = shownQuote?.rooms[index];
                return (
                  <div key={line.key} className="rounded-xl bg-ink-50/80 p-3.5 ring-1 ring-ink-200/70">
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
                      <div className="flex min-w-40 flex-1 items-center gap-2">
                        <BedDouble className="h-4 w-4 shrink-0" style={{ color: type.color }} />
                        <span className="text-sm font-semibold text-ink-900">
                          Room {index + 1} · {type.name}
                        </span>
                      </div>
                      <Select value={line.ratePlanId} onChange={(e) => updateLine(line.key, { ratePlanId: e.target.value })} className="h-9 w-auto min-w-48 py-1.5 text-[13px]">
                        {type.plans.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name} · {MEAL_PLAN_LABELS[p.mealPlan]}
                          </option>
                        ))}
                      </Select>
                      <button type="button" onClick={() => setLines((ls) => ls.filter((l) => l.key !== line.key))} className="rounded-md p-1.5 text-ink-400 transition hover:bg-rose-50 hover:text-rose-600" aria-label="Remove room">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2.5 text-xs text-ink-600">
                      <label className="flex items-center gap-2">
                        {tx('Adults')} <Stepper size="sm" value={line.adults} onChange={(v) => updateLine(line.key, { adults: v })} min={1} max={type.maxAdults} />
                      </label>
                      <label className="flex items-center gap-2">
                        {tx('Children')} <Stepper size="sm" value={line.children} onChange={(v) => updateLine(line.key, { children: v })} min={0} max={type.maxChildren} />
                      </label>
                      <label className="flex items-center gap-2">
                        {tx('Extra beds')} <Stepper size="sm" value={line.extraBeds} onChange={(v) => updateLine(line.key, { extraBeds: v })} min={0} max={type.maxExtraBeds} />
                      </label>
                      <label className="ml-auto flex items-center gap-2">
                        {tx('Rate / night')}
                        <input
                          type="number"
                          min={0}
                          placeholder={quoted ? String(quoted.nightly[0]?.rate ?? '') : 'Auto'}
                          value={line.rateOverride ?? ''}
                          onChange={(e) => updateLine(line.key, { rateOverride: e.target.value === '' ? null : Number(e.target.value) })}
                          className="num no-spinner h-8 w-24 rounded-md border border-ink-300 bg-white px-2 text-right text-[13px] font-semibold text-ink-900 focus:border-brand-500 focus:ring-2 focus:ring-brand-100 focus:outline-none"
                          aria-label="Override nightly rate"
                        />
                      </label>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          {shortOn.length > 0 && (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
              <span className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4" /> {tx(`Not enough ${shortOn.map((t) => t.name).join(', ')} for every night.`)}
              </span>
              {canOverbook && <Checkbox label="Overbook anyway (manager)" checked={allowOverbook} onChange={(e) => setAllowOverbook(e.target.checked)} />}
            </div>
          )}
        </Step>

        {/* 3 · Guest */}
        <Step n={3} title="Guest" description="Type the mobile number first: a returning guest fills in automatically.">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Mobile">
              <Input
                value={mobile}
                onChange={(e) => {
                  setMobile(e.target.value);
                  if (guestId) setGuestId(null);
                }}
                inputMode="tel"
                placeholder="98290 12345"
                leading={<span className="text-xs font-semibold">+91</span>}
                className="pl-11"
              />
            </Field>
            <Field label="Full name" required>
              <Input
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  if (guestId) setGuestId(null);
                }}
                placeholder="As on ID"
                leading={guestId ? <UserCheck className="h-4 w-4 text-emerald-600" /> : <User className="h-4 w-4" />}
              />
            </Field>
          </div>

          {visibleSuggestions.length > 0 && (
            <div className="mt-3 animate-fade-in space-y-1.5">
              {visibleSuggestions.slice(0, 3).map((g) => (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => applyGuest(g)}
                  className="flex w-full items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50/70 p-3 text-left transition hover:border-emerald-300 hover:bg-emerald-50"
                >
                  <span className="grid h-9 w-9 place-items-center rounded-full bg-emerald-100 text-emerald-700">
                    <Sparkles className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-ink-900">
                      Returning guest: {g.name} {g.isVip && <span className="badge ml-1 bg-amber-100 px-1.5 py-0 text-[10px] text-amber-800 ring-amber-200">VIP</span>}
                    </span>
                    <span className="block text-xs text-ink-600">
                      {[g.mobile, g.city, `${g.stays} stay${g.stays === 1 ? '' : 's'}`, g.lastStay && `last ${formatDay(g.lastStay)}`].filter(Boolean).join(' · ')}
                    </span>
                  </span>
                  <span className="text-xs font-semibold text-emerald-700">{tx('Use details →')}</span>
                </button>
              ))}
            </div>
          )}

          {visibleDuplicates.length > 0 && (
            <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3">
              <p className="flex items-center gap-2 text-sm font-semibold text-amber-900">
                <AlertTriangle className="h-4 w-4" /> {tx('Is this the same guest?')}
              </p>
              <ul className="mt-2 space-y-1.5">
                {visibleDuplicates.map((d) => (
                  <li key={d.id} className="flex items-center justify-between gap-3 text-sm">
                    <span className="text-amber-900">
                      <strong>{d.name}</strong> {d.mobile && <span className="text-amber-700">· {d.mobile}</span>} <span className="text-xs text-amber-700">({d.reason})</span>
                    </span>
                    <button type="button" className="text-xs font-semibold text-amber-900 underline underline-offset-2" onClick={() => applyGuest({ id: d.id, name: d.name, mobile: d.mobile, email: null, city: null, nationality: 'Indian', company: null, companyGstin: null, isVip: false, stays: 0, lastStay: null })}>
                      {tx('Use this guest')}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <Field label="Email">
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="optional" />
            </Field>
            <Field label="City">
              <Input value={city} onChange={(e) => setCity(e.target.value)} placeholder="Jaipur" />
            </Field>
            <Field label="Nationality" hint={nationality && !/^indian?$/i.test(nationality) ? 'Foreign guest: passport and visa are collected at check-in (Form-III).' : undefined}>
              <Input value={nationality} onChange={(e) => setNationality(e.target.value)} list="nationalities" />
              <datalist id="nationalities">
                {['Indian', 'Nepalese', 'Bangladeshi', 'American', 'British', 'German', 'French', 'Australian', 'Japanese', 'Russian'].map((n) => (
                  <option key={n} value={n} />
                ))}
              </datalist>
            </Field>
          </div>

          <div className="mt-4 rounded-xl border border-ink-200 p-3.5">
            <div className="flex items-center justify-between">
              <p className="flex items-center gap-2 text-sm font-medium text-ink-800">
                <Building2 className="h-4 w-4 text-ink-400" /> {tx('Bill to a company (GST invoice)')}
              </p>
              <Switch checked={billToCompany} onChange={setBillToCompany} label="Bill to company" size="sm" />
            </div>
            {billToCompany && (
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <Input value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Company name" />
                <Input value={companyGstin} onChange={(e) => setCompanyGstin(e.target.value.toUpperCase())} placeholder="GSTIN (15 characters)" maxLength={15} />
              </div>
            )}
          </div>
        </Step>

        {/* 4 · Payment & notes */}
        <Step n={4} title="Discount, advance and notes">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Discount">
              <div className="flex gap-2">
                <Segmented
                  size="sm"
                  value={discountType}
                  onChange={setDiscountType}
                  options={[
                    { value: 'percent', label: '%' },
                    { value: 'flat', label: '₹' },
                  ]}
                />
                <Input type="number" min={0} value={discountValue || ''} placeholder="0" onChange={(e) => setDiscountValue(Number(e.target.value) || 0)} className="num" />
              </div>
            </Field>
            <Field label="Advance received">
              <div className="flex gap-2">
                <Input type="number" min={0} value={advance || ''} placeholder="0" onChange={(e) => setAdvance(Number(e.target.value) || 0)} leading={<span className="text-sm">₹</span>} className="num" />
                <Select value={advanceMode} onChange={(e) => setAdvanceMode(e.target.value as typeof advanceMode)} className="w-32">
                  <option value="upi">UPI</option>
                  <option value="cash">Cash</option>
                  <option value="card">Card</option>
                  <option value="bank_transfer">Bank</option>
                </Select>
              </div>
            </Field>
          </div>
          {advance > 0 && advanceMode !== 'cash' && (
            <Field label="Payment reference" className="mt-3">
              <Input value={advanceRef} onChange={(e) => setAdvanceRef(e.target.value)} placeholder="UPI / card transaction ID" />
            </Field>
          )}
          <button type="button" onClick={() => setShowMore((v) => !v)} className="mt-4 flex items-center gap-1 text-sm font-medium text-brand-600 hover:text-brand-700">
            <ChevronDown className={cn('h-4 w-4 transition-transform', showMore && 'rotate-180')} /> {tx('Special requests and internal notes')}
          </button>
          {showMore && (
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              <Field label="Special requests (guest can see)">
                <Textarea value={specialRequests} onChange={(e) => setSpecialRequests(e.target.value)} placeholder="Early check-in, extra pillows…" />
              </Field>
              <Field label="Internal notes (staff only)">
                <Textarea value={internalNotes} onChange={(e) => setInternalNotes(e.target.value)} />
              </Field>
            </div>
          )}
        </Step>
      </div>

      {/* Summary */}
      <aside className="lg:sticky lg:top-24">
        <Card className="overflow-hidden">
          <div className="bg-ink-950 p-5 text-white">
            <p className="flex items-center gap-2 text-xs font-medium text-ink-400">
              <CalendarRange className="h-3.5 w-3.5" /> {tx(`${formatDayShort(checkIn)} → ${formatDayShort(checkOut)} · ${nights} night${nights === 1 ? '' : 's'}`)}
            </p>
            <p className="num mt-2 text-3xl font-extrabold tracking-tight">{shownQuote ? formatINR(shownQuote.totalAmount) : '₹0'}</p>
            <p className="mt-1 text-xs text-ink-400">
              {tx(`${lines.length} room${lines.length === 1 ? '' : 's'} · incl. GST`)} {quoting && <Loader2 className="ml-1 inline h-3 w-3 animate-spin" />}
            </p>
          </div>

          <div className="space-y-2.5 p-5 text-sm">
            {shownQuoteError && <p className="rounded-lg bg-rose-50 p-2.5 text-xs text-rose-700">{tx(shownQuoteError)}</p>}
            {shownQuote && shownQuote.restrictions.length > 0 && (
              <div className="rounded-lg bg-amber-50 p-2.5 text-xs text-amber-900 ring-1 ring-amber-200">
                <p className="font-semibold">{tx('Rate rules for these dates')}</p>
                <ul className="mt-1 list-disc space-y-0.5 pl-4">
                  {shownQuote.restrictions.map((r) => (
                    <li key={r.ratePlanId + r.kind}>{tx(r.message)}</li>
                  ))}
                </ul>
                <p className="mt-1 text-amber-700">{tx('The booking engine and OTAs follow these rules. The front desk can still book.')}</p>
              </div>
            )}
            {!shownQuote && !shownQuoteError && <p className="text-ink-500">{tx('Add a room to see the price.')}</p>}
            {shownQuote && (
              <>
                {shownQuote.rooms.map((room, i) => (
                  <div key={i} className="flex justify-between gap-3">
                    <span className="min-w-0 text-ink-600">
                      <span className="block truncate">{room.roomTypeName}</span>
                      <span className="text-xs text-ink-400">
                        {room.mealPlan} · {room.adults}A{room.children ? ` ${room.children}C` : ''}
                        {room.extraBeds ? <> + {room.extraBeds} {tx('bed')}</> : null}
                      </span>
                    </span>
                    <span className="num font-medium whitespace-nowrap text-ink-900">{formatINR(room.amount)}</span>
                  </div>
                ))}
                <button type="button" onClick={() => setShowNightly((v) => !v)} className="text-xs font-medium text-brand-600">
                  {tx(showNightly ? 'Hide night-by-night' : 'Show night-by-night')}
                </button>
                {showNightly && (
                  <div className="space-y-1 rounded-lg bg-ink-50 p-2.5 text-xs">
                    {shownQuote.rooms.flatMap((room, i) =>
                      room.nightly.map((n) => (
                        <div key={`${i}-${n.date}`} className="flex justify-between text-ink-600">
                          <span>
                            {tx(`${formatDayShort(n.date)} · Room ${i + 1}`)}
                          </span>
                          <span className="num">
                            {formatINR(n.amount)} <span className="text-ink-400">@{n.taxRate}%</span>
                          </span>
                        </div>
                      )),
                    )}
                  </div>
                )}
                <div className="space-y-1.5 border-t border-dashed border-ink-200 pt-2.5">
                  {shownQuote.discountAmount > 0 && (
                    <div className="flex justify-between text-emerald-700">
                      <span>{tx('Discount')}</span>
                      <span className="num">−{formatINR(shownQuote.discountAmount)}</span>
                    </div>
                  )}
                  {Object.entries(shownQuote.taxByRate).map(([rate, tax]) => (
                    <div key={rate} className="flex justify-between text-ink-600">
                      <span>GST @{rate}% (CGST + SGST)</span>
                      <span className="num">{formatINR(tax)}</span>
                    </div>
                  ))}
                  <div className="flex justify-between pt-1 text-[15px] font-bold text-ink-900">
                    <span>{tx('Total')}</span>
                    <span className="num">{formatINR(shownQuote.totalAmount)}</span>
                  </div>
                  {paidNow > 0 && (
                    <>
                      <div className="flex justify-between text-ink-600">
                        <span>{tx('Advance')}</span>
                        <span className="num">−{formatINR(paidNow)}</span>
                      </div>
                      <div className="flex justify-between font-semibold text-amber-700">
                        <span>{tx('Balance at check-in')}</span>
                        <span className="num">{formatINR(balance)}</span>
                      </div>
                    </>
                  )}
                </div>
              </>
            )}
          </div>

          <div className="space-y-3 border-t border-ink-100 bg-ink-50/60 p-5">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-sm font-medium text-ink-800">
                <Clock className="h-4 w-4 text-ink-400" /> {tx('Hold instead of confirm')}
              </span>
              <Switch checked={hold} onChange={setHold} size="sm" label="Hold booking" />
            </div>
            {hold && (
              <div className="flex flex-wrap gap-1.5">
                {HOLD_PRESETS.map((p) => (
                  <button
                    key={p.hours}
                    type="button"
                    onClick={() => setHoldHours(p.hours)}
                    className={cn('rounded-full px-2.5 py-1 text-xs font-semibold ring-1 transition', holdHours === p.hours ? 'bg-amber-500 text-white ring-amber-500' : 'bg-white text-ink-600 ring-ink-300')}
                  >
                    {tx(p.label)}
                  </button>
                ))}
              </div>
            )}
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-sm font-medium text-ink-800">
                <MessageCircle className="h-4 w-4 text-emerald-600" /> {tx('Send on WhatsApp')}
              </span>
              <Switch checked={sendWhatsApp && Boolean(mobile)} onChange={setSendWhatsApp} size="sm" disabled={!mobile} label="Send WhatsApp confirmation" />
            </div>
            <Button size="lg" className={cn('w-full', hold && 'bg-amber-500 shadow-amber-500/20 hover:bg-amber-600')} disabled={!canSubmit} loading={saving} onClick={submit}>
              {hold ? <Clock className="h-4 w-4" /> : <CreditCard className="h-4 w-4" />}
              {tx(hold ? `Hold for ${HOLD_PRESETS.find((p) => p.hours === holdHours)?.label ?? `${holdHours} h`}` : 'Confirm booking')}
            </Button>
            {!canSubmit && <p className="text-center text-xs text-ink-500">{tx(lines.length === 0 ? 'Add a room' : name.trim().length < 2 ? 'Enter the guest name' : (shownQuoteError ?? 'Not enough rooms'))}</p>}
          </div>
        </Card>
      </aside>
    </div>
  );
}
