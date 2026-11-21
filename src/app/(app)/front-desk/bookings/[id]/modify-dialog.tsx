'use client';

import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, BedDouble, CalendarRange, Loader2, Plus, Sparkles, Trash2, TriangleAlert } from 'lucide-react';
import { cn } from '@/lib/utils';
import { addDay, formatDayShort, formatINR, MEAL_PLAN_LABELS, nightsBetween } from '@/lib/format';
import type { BookingDetail } from '@/server/services/frontoffice';
import type { RoomTypeOption } from '@/server/services/room-options';
import type { ModificationPreview } from '@/server/services/modify';
import { modifyBookingAction, previewModifyAction } from '@/server/actions/reservations';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field, Input, Segmented, Select, Stepper } from '@/components/ui/fields';
import { useRun } from '@/components/ui/use-run';

interface Line {
  key: string;
  id: string | null;
  roomTypeId: string;
  ratePlanId: string;
  adults: number;
  children: number;
  extraBeds: number;
  inHouse: boolean;
  roomNumber: string | null;
}

function planLabel(plan: { name: string; mealPlan: string }) {
  const meal = MEAL_PLAN_LABELS[plan.mealPlan as keyof typeof MEAL_PLAN_LABELS] ?? plan.mealPlan;
  return meal.toLowerCase().startsWith(plan.name.toLowerCase()) ? meal : `${plan.name} · ${meal}`;
}

function defaultPlan(type: RoomTypeOption | undefined) {
  return type?.plans.find((p) => p.isDefault)?.id ?? type?.plans[0]?.id ?? '';
}

/**
 * Change a booking in one place: dates, rooms, room type (upgrade), rate plan and occupancy. The new price and the
 * availability are checked live; saving re-reserves inventory in one transaction, so it either all happens or nothing does.
 */
export function ModifyDialog({
  data,
  roomTypes,
  businessDate,
  onClose,
}: {
  data: BookingDetail;
  roomTypes: RoomTypeOption[];
  businessDate: string;
  onClose: () => void;
}) {
  const b = data.booking;
  const inHouse = b.status === 'checked_in';
  const typeById = useMemo(() => new Map(roomTypes.map((t) => [t.id, t])), [roomTypes]);

  const [checkIn, setCheckIn] = useState(b.checkIn);
  const [checkOut, setCheckOut] = useState(b.checkOut);
  const [lines, setLines] = useState<Line[]>(() =>
    data.rooms
      .filter((r) => r.status === 'reserved' || r.status === 'in_house')
      .map((r) => ({
        key: r.id,
        id: r.id,
        roomTypeId: r.roomTypeId,
        ratePlanId: r.ratePlanId ?? defaultPlan(typeById.get(r.roomTypeId)),
        adults: r.adults,
        children: r.children,
        extraBeds: r.extraBeds,
        inHouse: r.status === 'in_house',
        roomNumber: r.roomNumber,
      })),
  );
  const [pricing, setPricing] = useState<'keep' | 'current'>('keep');
  const [discount, setDiscount] = useState(Math.round(b.discountAmount));
  const [preview, setPreview] = useState<ModificationPreview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewKey, setPreviewKey] = useState('');
  const { run, pending } = useRun();

  const nights = nightsBetween(checkIn, checkOut);
  const payload = {
    bookingId: b.id,
    checkIn,
    checkOut,
    rooms: lines.map(({ id, roomTypeId, ratePlanId, adults, children, extraBeds }) => ({ id, roomTypeId, ratePlanId, adults, children, extraBeds })),
    discount: discount > 0 ? { type: 'flat' as const, value: discount } : null,
    pricing,
  };
  const key = JSON.stringify(payload);
  const loading = previewKey !== key;

  useEffect(() => {
    if (nights <= 0 || lines.some((l) => !l.ratePlanId)) return;
    const timer = window.setTimeout(async () => {
      const result = await previewModifyAction(JSON.parse(key));
      if (result.ok) {
        setPreview(result.data);
        setPreviewError(null);
      } else {
        setPreviewError(result.error);
      }
      setPreviewKey(key);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [key, nights, lines]);

  const unchanged =
    checkIn === b.checkIn &&
    checkOut === b.checkOut &&
    discount === Math.round(b.discountAmount) &&
    pricing === 'keep' &&
    lines.length === data.rooms.filter((r) => r.status === 'reserved' || r.status === 'in_house').length &&
    lines.every((l) => {
      const r = data.rooms.find((x) => x.id === l.id);
      return r && r.roomTypeId === l.roomTypeId && (r.ratePlanId ?? l.ratePlanId) === l.ratePlanId && r.adults === l.adults && r.children === l.children && r.extraBeds === l.extraBeds;
    });

  const blocked = Boolean(previewError) || (preview?.problems.length ?? 0) > 0;
  const extras = data.totals.extras;
  const balanceAfter = preview ? preview.after + extras - preview.paid : null;

  function update(lineKey: string, patch: Partial<Line>) {
    setLines((list) => list.map((l) => (l.key === lineKey ? { ...l, ...patch } : l)));
  }

  function changeType(line: Line, roomTypeId: string) {
    const type = typeById.get(roomTypeId);
    update(line.key, {
      roomTypeId,
      ratePlanId: defaultPlan(type),
      adults: Math.min(line.adults, type?.maxAdults ?? line.adults),
      children: Math.min(line.children, type?.maxChildren ?? line.children),
      extraBeds: Math.min(line.extraBeds, type?.maxExtraBeds ?? line.extraBeds),
    });
  }

  function addRoom() {
    const last = lines[lines.length - 1];
    const type = typeById.get(last?.roomTypeId ?? '') ?? roomTypes[0];
    setLines((list) => [
      ...list,
      { key: `new-${Date.now()}`, id: null, roomTypeId: type.id, ratePlanId: defaultPlan(type), adults: Math.min(2, type.maxAdults), children: 0, extraBeds: 0, inHouse: false, roomNumber: null },
    ]);
  }

  function changeCheckIn(value: string) {
    const length = Math.max(nights, 1);
    setCheckIn(value);
    if (checkOut <= value) setCheckOut(addDay(value, length));
  }

  const difference = preview?.difference ?? 0;

  return (
    <Dialog
      open
      onClose={onClose}
      size="xl"
      icon={<CalendarRange className="h-5 w-5" />}
      title={`Change ${b.bookingNo}`}
      description={inHouse ? 'The guest is in house: change the check-out date, plan or occupancy.' : 'Dates, rooms, room type and plan. Availability is checked before anything is saved.'}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            loading={pending}
            disabled={unchanged || loading || blocked || !preview}
            onClick={() =>
              run(() => modifyBookingAction(payload), {
                success: (r) => (r.unassigned.length ? `Booking updated. Assign a room again for ${r.unassigned.join(', ')}` : 'Booking updated'),
                onSuccess: onClose,
              })
            }
          >
            {unchanged ? 'No changes yet' : difference > 0.5 ? `Save · +${formatINR(difference)}` : difference < -0.5 ? `Save · −${formatINR(-difference)}` : 'Save changes'}
          </Button>
        </>
      }
    >
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="space-y-5">
          {/* Dates */}
          <section className="grid grid-cols-2 gap-3 sm:grid-cols-[1fr_1fr_auto]">
            <Field label="Check-in">
              <Input type="date" value={checkIn} min={businessDate} disabled={inHouse} onChange={(e) => e.target.value && changeCheckIn(e.target.value)} />
            </Field>
            <Field label="Check-out">
              <Input type="date" value={checkOut} min={inHouse ? addDay(businessDate, 1) : addDay(checkIn, 1)} onChange={(e) => e.target.value && setCheckOut(e.target.value)} />
            </Field>
            <Field label="Nights" className="col-span-2 sm:col-span-1">
              <Stepper
                value={Math.max(nights, 1)}
                min={inHouse ? Math.max(1, nightsBetween(checkIn, addDay(businessDate, 1))) : 1}
                max={90}
                onChange={(n) => setCheckOut(addDay(checkIn, n))}
                label="Nights"
              />
            </Field>
          </section>

          {/* Rooms */}
          <section className="space-y-2.5">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-ink-900">Rooms</h3>
              {!inHouse && lines.length < 20 && (
                <Button size="sm" variant="soft" onClick={addRoom}>
                  <Plus className="h-4 w-4" /> Add room
                </Button>
              )}
            </div>
            {lines.map((line, index) => {
              const type = typeById.get(line.roomTypeId);
              const original = line.id ? data.rooms.find((r) => r.id === line.id) : null;
              const upgraded = original && original.roomTypeId !== line.roomTypeId;
              return (
                <div key={line.key} className={cn('rounded-xl border p-3.5 transition', line.id ? 'border-ink-200 bg-white' : 'border-brand-200 bg-brand-50/40')}>
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-xs font-extrabold text-white" style={{ backgroundColor: type?.color ?? '#94a3b8' }}>
                      {line.roomNumber ?? <BedDouble className="h-4 w-4" />}
                    </span>
                    <div className="grid min-w-0 flex-1 grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
                      <Select value={line.roomTypeId} disabled={line.inHouse} onChange={(e) => changeType(line, e.target.value)} aria-label={`Room ${index + 1} type`}>
                        {roomTypes.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name}
                          </option>
                        ))}
                      </Select>
                      <Select value={line.ratePlanId} onChange={(e) => update(line.key, { ratePlanId: e.target.value })} aria-label={`Room ${index + 1} plan`}>
                        {type?.plans.map((p) => (
                          <option key={p.id} value={p.id}>
                            {planLabel(p)}
                          </option>
                        ))}
                      </Select>
                    </div>
                    {!line.inHouse && !inHouse && lines.length > 1 && (
                      <button
                        type="button"
                        onClick={() => setLines((list) => list.filter((l) => l.key !== line.key))}
                        className="grid h-9 w-9 place-items-center rounded-lg text-ink-400 transition hover:bg-rose-50 hover:text-rose-600"
                        aria-label={`Remove room ${index + 1}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-ink-600">
                    <span className="flex items-center gap-2">
                      Adults <Stepper size="sm" value={line.adults} min={1} max={type?.maxAdults ?? 4} onChange={(v) => update(line.key, { adults: v })} label="Adults" />
                    </span>
                    <span className="flex items-center gap-2">
                      Children <Stepper size="sm" value={line.children} min={0} max={type?.maxChildren ?? 2} onChange={(v) => update(line.key, { children: v })} label="Children" />
                    </span>
                    <span className="flex items-center gap-2">
                      Extra beds <Stepper size="sm" value={line.extraBeds} min={0} max={type?.maxExtraBeds ?? 1} onChange={(v) => update(line.key, { extraBeds: v })} label="Extra beds" />
                    </span>
                    {!line.id && <span className="rounded-full bg-brand-100 px-2 py-0.5 font-semibold text-brand-700">New room</span>}
                    {upgraded && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-violet-100 px-2 py-0.5 font-semibold text-violet-700">
                        <Sparkles className="h-3 w-3" /> {original.typeName} → {type?.name}
                      </span>
                    )}
                    {line.inHouse && <span className="rounded-full bg-emerald-100 px-2 py-0.5 font-semibold text-emerald-700">In house</span>}
                  </div>
                </div>
              );
            })}
          </section>

          {/* Price rules */}
          <section className="grid gap-4 sm:grid-cols-2">
            <Field label="Price for nights already booked" hint={pricing === 'keep' ? 'Agreed prices stay; only new nights and changed rooms use today’s rates.' : 'Every night is priced again at today’s rates.'}>
              <Segmented
                value={pricing}
                onChange={setPricing}
                options={[
                  { value: 'keep', label: 'Keep agreed' },
                  { value: 'current', label: 'Today’s rates' },
                ]}
              />
            </Field>
            <Field label="Discount" hint="Flat amount off the room charges">
              <Input type="number" min={0} value={discount || ''} onChange={(e) => setDiscount(Math.max(0, Number(e.target.value) || 0))} leading={<span className="text-sm">₹</span>} className="num" placeholder="0" />
            </Field>
          </section>
          {b.source === 'ota' && (
            <p className="rounded-lg bg-violet-50 px-3 py-2 text-xs text-violet-800">
              This is an OTA booking. Room availability is pushed to the channels automatically, but the OTA’s own copy of the booking is not changed. Ask the guest to change it on the OTA too, or note it here.
            </p>
          )}
        </div>

        {/* Live summary */}
        <aside className="h-fit space-y-4 rounded-2xl border border-ink-200/80 bg-gradient-to-b from-ink-50/80 to-white p-4 lg:sticky lg:top-0">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-ink-900">New price</h3>
            {loading && nights > 0 && <Loader2 className="h-4 w-4 animate-spin text-ink-400" />}
          </div>
          <div className="flex items-center gap-2 text-sm">
            <span className="num text-ink-500 line-through decoration-ink-300">{formatINR(b.totalAmount)}</span>
            <ArrowRight className="h-4 w-4 text-ink-300" />
            <span className="num text-2xl font-bold tracking-tight text-ink-900">{preview ? formatINR(preview.after) : '—'}</span>
          </div>
          {preview && Math.abs(difference) > 0.5 && (
            <span className={cn('inline-flex rounded-full px-2.5 py-1 text-xs font-bold', difference > 0 ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800')}>
              {difference > 0 ? `Guest pays ${formatINR(difference)} more` : `${formatINR(-difference)} less than before`}
            </span>
          )}
          <div className="rounded-xl bg-white px-3 py-2.5 ring-1 ring-ink-100">
            <p className="num text-sm font-semibold text-ink-900">
              {formatDayShort(checkIn)} → {formatDayShort(checkOut)}
            </p>
            <p className="mt-0.5 text-xs text-ink-500">
              {Math.max(nights, 0)} night{nights === 1 ? '' : 's'} · {lines.length} room{lines.length === 1 ? '' : 's'}
            </p>
          </div>
          <dl className="space-y-1.5 text-sm">
            {preview && (
              <>
                <div className="flex justify-between">
                  <dt className="text-ink-500">Room charges</dt>
                  <dd className="num text-ink-800">{formatINR(preview.quote.roomAmount)}</dd>
                </div>
                {preview.quote.discountAmount > 0 && (
                  <div className="flex justify-between">
                    <dt className="text-ink-500">Discount</dt>
                    <dd className="num text-emerald-700">−{formatINR(preview.quote.discountAmount)}</dd>
                  </div>
                )}
                <div className="flex justify-between">
                  <dt className="text-ink-500">GST</dt>
                  <dd className="num text-ink-800">{formatINR(preview.quote.taxAmount)}</dd>
                </div>
                {extras > 0 && (
                  <div className="flex justify-between">
                    <dt className="text-ink-500">Bill extras (unchanged)</dt>
                    <dd className="num text-ink-800">{formatINR(extras)}</dd>
                  </div>
                )}
                <div className="flex justify-between">
                  <dt className="text-ink-500">Paid so far</dt>
                  <dd className="num text-ink-800">{formatINR(preview.paid)}</dd>
                </div>
                {balanceAfter !== null && (
                  <div className="flex justify-between border-t border-ink-100 pt-1.5 font-semibold">
                    <dt className="text-ink-700">{balanceAfter < -0.5 ? 'Refund due' : 'Balance after change'}</dt>
                    <dd className={cn('num', balanceAfter < -0.5 ? 'text-emerald-700' : 'text-ink-900')}>{formatINR(Math.abs(balanceAfter))}</dd>
                  </div>
                )}
              </>
            )}
          </dl>
          {(previewError || (preview && preview.problems.length > 0)) && (
            <div className="space-y-1 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800">
              <p className="flex items-center gap-1.5 font-semibold">
                <TriangleAlert className="h-3.5 w-3.5" /> Cannot save yet
              </p>
              {previewError ? <p>{previewError}</p> : preview!.problems.map((p) => <p key={p}>{p}</p>)}
            </div>
          )}
          {preview && preview.quote.restrictions.length > 0 && (
            <div className="space-y-1 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
              <p className="font-semibold">Rate rules for these dates</p>
              {preview.quote.restrictions.map((r) => (
                <p key={r.ratePlanId + r.kind}>{r.message}</p>
              ))}
            </div>
          )}
        </aside>
      </div>
    </Dialog>
  );
}
