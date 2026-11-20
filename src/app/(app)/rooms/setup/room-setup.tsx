'use client';

import { useState } from 'react';
import { BedDouble, Pencil, Plus, Ruler, Star, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatINR, MEAL_PLAN_LABELS } from '@/lib/format';
import { addRoomsAction, saveRatePlanAction, saveRoomTypeAction, updateRoomAction } from '@/server/actions/rooms';
import { Button } from '@/components/ui/button';
import { Card, EmptyState } from '@/components/ui/card';
import { Badge, StatusBadge } from '@/components/ui/badge';
import { Dialog } from '@/components/ui/dialog';
import { Checkbox, Field, Input, Select, Stepper, Textarea } from '@/components/ui/fields';
import { useRun } from '@/components/ui/use-run';

interface RoomRow {
  id: string;
  number: string;
  floor: string | null;
  hkStatus: string;
  isActive: boolean;
  notes: string | null;
  roomTypeId: string;
}
interface PlanRow {
  id: string;
  roomTypeId: string;
  name: string;
  mealPlan: 'EP' | 'CP' | 'MAP' | 'AP';
  price1: number;
  price2: number;
  price3: number;
  extraBed: number;
  childPrice: number;
  cancellationPolicy: string | null;
  isDefault: boolean;
  isActive: boolean;
}
interface TypeRow {
  id: string;
  name: string;
  code: string;
  description: string | null;
  baseOccupancy: number;
  maxAdults: number;
  maxChildren: number;
  maxExtraBeds: number;
  sizeSqft: number | null;
  bedType: string | null;
  amenities: string[];
  color: string;
  isActive: boolean;
  rooms: RoomRow[];
  plans: PlanRow[];
}

const HK_DOT: Record<string, string> = { clean: 'bg-emerald-500', dirty: 'bg-amber-500', inspected: 'bg-sky-500', out_of_order: 'bg-rose-500' };
const COLORS = ['#e11d48', '#7c3aed', '#0284c7', '#059669', '#d97706', '#db2777', '#0f766e', '#4f46e5'];
const AMENITIES = ['Air conditioning', 'Free Wi-Fi', 'LED TV', 'Hot water', 'Room service', 'Tea/coffee maker', 'Mini fridge', 'Balcony', 'Bathtub', 'Work desk', 'Wardrobe', 'Safe locker'];

type DialogState =
  | { kind: 'type'; type?: TypeRow }
  | { kind: 'rooms'; type: TypeRow }
  | { kind: 'room'; room: RoomRow }
  | { kind: 'plan'; type: TypeRow; plan?: PlanRow }
  | null;

export function RoomSetup({ types }: { types: TypeRow[] }) {
  const [dialog, setDialog] = useState<DialogState>(null);
  const close = () => setDialog(null);
  const totalRooms = types.reduce((t, x) => t + x.rooms.filter((r) => r.isActive).length, 0);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-ink-600">
          <strong className="text-ink-900">{types.length}</strong> room types · <strong className="text-ink-900">{totalRooms}</strong> active rooms
        </p>
        <Button onClick={() => setDialog({ kind: 'type' })}>
          <Plus className="h-4 w-4" /> Add room type
        </Button>
      </div>

      {types.length === 0 && (
        <EmptyState icon={<BedDouble className="h-6 w-6" />} title="No room types yet" description="Start with your most common room, e.g. Standard Double Bed Room." action={<Button onClick={() => setDialog({ kind: 'type' })}>Add room type</Button>} />
      )}

      {types.map((type) => (
        <Card key={type.id} className={cn('overflow-hidden', !type.isActive && 'opacity-60')}>
          <div className="flex flex-wrap items-start justify-between gap-4 border-b border-ink-100 p-5" style={{ backgroundImage: `linear-gradient(90deg, ${type.color}12, transparent 40%)` }}>
            <div className="flex items-start gap-3">
              <span className="mt-1 h-10 w-1.5 rounded-full" style={{ backgroundColor: type.color }} />
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-lg font-bold text-ink-900">{type.name}</h2>
                  <Badge tone="neutral">{type.code}</Badge>
                  {!type.isActive && <Badge tone="danger">Inactive</Badge>}
                </div>
                <p className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-500">
                  <span className="flex items-center gap-1">
                    <BedDouble className="h-3.5 w-3.5" /> {type.rooms.filter((r) => r.isActive).length} rooms{type.bedType ? ` · ${type.bedType}` : ''}
                  </span>
                  <span className="flex items-center gap-1">
                    <Users className="h-3.5 w-3.5" /> up to {type.maxAdults} adults, {type.maxChildren} children, {type.maxExtraBeds} extra bed
                  </span>
                  {type.sizeSqft ? (
                    <span className="flex items-center gap-1">
                      <Ruler className="h-3.5 w-3.5" /> {type.sizeSqft} sq ft
                    </span>
                  ) : null}
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => setDialog({ kind: 'rooms', type })}>
                <Plus className="h-3.5 w-3.5" /> Rooms
              </Button>
              <Button size="sm" variant="outline" onClick={() => setDialog({ kind: 'plan', type })}>
                <Plus className="h-3.5 w-3.5" /> Rate plan
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setDialog({ kind: 'type', type })}>
                <Pencil className="h-3.5 w-3.5" /> Edit
              </Button>
            </div>
          </div>

          <div className="grid gap-0 lg:grid-cols-[1fr_1.4fr]">
            <div className="border-b border-ink-100 p-5 lg:border-r lg:border-b-0">
              <p className="mb-3 text-[11px] font-semibold tracking-wider text-ink-400 uppercase">Rooms</p>
              <div className="flex flex-wrap gap-2">
                {type.rooms.map((room) => (
                  <button
                    key={room.id}
                    onClick={() => setDialog({ kind: 'room', room })}
                    className={cn(
                      'num group flex items-center gap-1.5 rounded-lg border border-ink-200 bg-white px-2.5 py-1.5 text-sm font-bold text-ink-800 transition hover:border-ink-300 hover:shadow-card',
                      !room.isActive && 'border-dashed text-ink-400 line-through',
                    )}
                    title={`Floor ${room.floor ?? '—'} · ${room.hkStatus.replace('_', ' ')}`}
                  >
                    <span className={cn('h-1.5 w-1.5 rounded-full', HK_DOT[room.hkStatus])} />
                    {room.number}
                  </button>
                ))}
                {type.rooms.length === 0 && <p className="text-sm text-ink-500">No rooms yet. Add room numbers to start selling.</p>}
              </div>
            </div>
            <div className="p-5">
              <p className="mb-3 text-[11px] font-semibold tracking-wider text-ink-400 uppercase">Rate plans (standard price per night)</p>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[460px] text-sm">
                  <thead className="text-left text-[11px] text-ink-500">
                    <tr>
                      <th className="pb-2 font-medium">Plan</th>
                      <th className="pb-2 text-right font-medium">1 adult</th>
                      <th className="pb-2 text-right font-medium">2 adults</th>
                      <th className="pb-2 text-right font-medium">3 adults</th>
                      <th className="pb-2 text-right font-medium">Extra bed</th>
                      <th className="pb-2" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ink-100">
                    {type.plans.map((plan) => (
                      <tr key={plan.id} className={cn(!plan.isActive && 'opacity-50')}>
                        <td className="py-2 pr-2">
                          <span className="flex items-center gap-1.5 font-medium text-ink-800">
                            {plan.name}
                            {plan.isDefault && <Star className="h-3 w-3 fill-amber-400 text-amber-400" />}
                          </span>
                          <span className="text-[11px] text-ink-500">{MEAL_PLAN_LABELS[plan.mealPlan]}</span>
                        </td>
                        <td className="num py-2 text-right text-ink-700">{formatINR(plan.price1)}</td>
                        <td className="num py-2 text-right font-semibold text-ink-900">{formatINR(plan.price2)}</td>
                        <td className="num py-2 text-right text-ink-700">{formatINR(plan.price3)}</td>
                        <td className="num py-2 text-right text-ink-700">{formatINR(plan.extraBed)}</td>
                        <td className="py-2 pl-2 text-right">
                          <Button size="icon-sm" variant="ghost" onClick={() => setDialog({ kind: 'plan', type, plan })} aria-label="Edit rate plan">
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {type.plans.length === 0 && <p className="text-sm text-ink-500">Add at least one rate plan so this room type can be sold.</p>}
            </div>
          </div>
        </Card>
      ))}

      {dialog?.kind === 'type' && <RoomTypeDialog type={dialog.type} onClose={close} />}
      {dialog?.kind === 'rooms' && <AddRoomsDialog type={dialog.type} onClose={close} />}
      {dialog?.kind === 'room' && <RoomDialog room={dialog.room} types={types} onClose={close} />}
      {dialog?.kind === 'plan' && <RatePlanDialog type={dialog.type} plan={dialog.plan} onClose={close} />}
    </div>
  );
}

function RoomTypeDialog({ type, onClose }: { type?: TypeRow; onClose: () => void }) {
  const [form, setForm] = useState({
    name: type?.name ?? '',
    code: type?.code ?? '',
    description: type?.description ?? '',
    baseOccupancy: type?.baseOccupancy ?? 2,
    maxAdults: type?.maxAdults ?? 2,
    maxChildren: type?.maxChildren ?? 1,
    maxExtraBeds: type?.maxExtraBeds ?? 1,
    sizeSqft: type?.sizeSqft ?? null,
    bedType: type?.bedType ?? '',
    amenities: type?.amenities ?? ['Air conditioning', 'Free Wi-Fi', 'LED TV', 'Hot water'],
    color: type?.color ?? COLORS[0],
    isActive: type?.isActive ?? true,
  });
  const { run, pending } = useRun();
  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => setForm((f) => ({ ...f, [key]: value }));

  return (
    <Dialog
      open
      onClose={onClose}
      size="lg"
      title={type ? `Edit ${type.name}` : 'Add room type'}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={pending} onClick={() => run(() => saveRoomTypeAction({ ...form, id: type?.id }), { onSuccess: onClose })}>
            Save room type
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-[1fr_140px]">
        <Field label="Name" required>
          <Input value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Deluxe Double Bed Room" autoFocus />
        </Field>
        <Field label="Short code" required hint="Shown on charts">
          <Input value={form.code} onChange={(e) => set('code', e.target.value.toUpperCase())} placeholder="DDB" maxLength={6} />
        </Field>
      </div>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <Field label="Bed type">
          <Input value={form.bedType} onChange={(e) => set('bedType', e.target.value)} placeholder="King / Queen + Single" />
        </Field>
        <Field label="Size (sq ft)">
          <Input type="number" value={form.sizeSqft ?? ''} onChange={(e) => set('sizeSqft', e.target.value ? Number(e.target.value) : null)} />
        </Field>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {(
          [
            ['baseOccupancy', 'Base guests', 1, 10],
            ['maxAdults', 'Max adults', 1, 10],
            ['maxChildren', 'Max children', 0, 10],
            ['maxExtraBeds', 'Extra beds', 0, 5],
          ] as const
        ).map(([key, label, min, max]) => (
          <div key={key} className="rounded-lg bg-ink-50 p-2.5 text-center">
            <p className="mb-1.5 text-[11px] font-medium text-ink-500">{label}</p>
            <Stepper size="sm" value={form[key]} onChange={(v) => set(key, v)} min={min} max={max} />
          </div>
        ))}
      </div>
      <Field label="Description" className="mt-4">
        <Textarea value={form.description} onChange={(e) => set('description', e.target.value)} placeholder="Shown on the booking engine" />
      </Field>
      <Field label="Amenities" className="mt-4">
        <div className="flex flex-wrap gap-1.5">
          {AMENITIES.map((a) => {
            const on = form.amenities.includes(a);
            return (
              <button
                key={a}
                type="button"
                onClick={() => set('amenities', on ? form.amenities.filter((x) => x !== a) : [...form.amenities, a])}
                className={cn('rounded-full px-3 py-1 text-xs font-medium ring-1 transition', on ? 'bg-ink-900 text-white ring-ink-900' : 'bg-white text-ink-600 ring-ink-300 hover:text-ink-900')}
              >
                {a}
              </button>
            );
          })}
        </div>
      </Field>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
        <Field label="Colour on charts">
          <div className="flex gap-2">
            {COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => set('color', c)}
                className={cn('h-7 w-7 rounded-full ring-offset-2 transition', form.color === c && 'ring-2 ring-ink-900')}
                style={{ backgroundColor: c }}
                aria-label={`Colour ${c}`}
              />
            ))}
          </div>
        </Field>
        <Checkbox label="Active (sellable)" checked={form.isActive} onChange={(e) => set('isActive', e.target.checked)} />
      </div>
    </Dialog>
  );
}

function AddRoomsDialog({ type, onClose }: { type: TypeRow; onClose: () => void }) {
  const [numbers, setNumbers] = useState('');
  const [floor, setFloor] = useState(type.rooms[0]?.floor ?? '');
  const { run, pending } = useRun();
  return (
    <Dialog
      open
      onClose={onClose}
      size="sm"
      title={`Add rooms to ${type.name}`}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={pending} onClick={() => run(() => addRoomsAction({ roomTypeId: type.id, numbers, floor }), { success: (d) => `Added ${d.added} room${d.added === 1 ? '' : 's'}`, onSuccess: onClose })}>
            Add rooms
          </Button>
        </>
      }
    >
      <Field label="Room numbers" hint="Ranges work: 201-205, 210" required>
        <Input value={numbers} onChange={(e) => setNumbers(e.target.value)} placeholder="201-205, 210" autoFocus />
      </Field>
      <Field label="Floor" className="mt-4">
        <Input value={floor} onChange={(e) => setFloor(e.target.value)} placeholder="2" />
      </Field>
    </Dialog>
  );
}

function RoomDialog({ room, types, onClose }: { room: RoomRow; types: TypeRow[]; onClose: () => void }) {
  const [form, setForm] = useState({ number: room.number, floor: room.floor ?? '', roomTypeId: room.roomTypeId, isActive: room.isActive, notes: room.notes ?? '' });
  const { run, pending } = useRun();
  return (
    <Dialog
      open
      onClose={onClose}
      size="sm"
      title={`Room ${room.number}`}
      description={<StatusBadge status={room.hkStatus} />}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={pending} onClick={() => run(() => updateRoomAction({ id: room.id, ...form }), { onSuccess: onClose })}>
            Save room
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-4">
        <Field label="Room number">
          <Input value={form.number} onChange={(e) => setForm({ ...form, number: e.target.value })} />
        </Field>
        <Field label="Floor">
          <Input value={form.floor} onChange={(e) => setForm({ ...form, floor: e.target.value })} />
        </Field>
      </div>
      <Field label="Room type" className="mt-4">
        <Select value={form.roomTypeId} onChange={(e) => setForm({ ...form, roomTypeId: e.target.value })}>
          {types.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Notes" className="mt-4">
        <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="e.g. Corner room, street view" />
      </Field>
      <Checkbox
        className="mt-4"
        label="Active"
        description="Inactive rooms are not counted in inventory or shown on the Room Chart."
        checked={form.isActive}
        onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
      />
    </Dialog>
  );
}

function RatePlanDialog({ type, plan, onClose }: { type: TypeRow; plan?: PlanRow; onClose: () => void }) {
  const [form, setForm] = useState({
    name: plan?.name ?? 'Room Only',
    mealPlan: plan?.mealPlan ?? ('EP' as PlanRow['mealPlan']),
    price1: plan?.price1 ?? 0,
    price2: plan?.price2 ?? 0,
    price3: plan?.price3 ?? 0,
    extraBed: plan?.extraBed ?? 0,
    childPrice: plan?.childPrice ?? 0,
    cancellationPolicy: plan?.cancellationPolicy ?? 'Free cancellation up to 24 hours before check-in.',
    isDefault: plan?.isDefault ?? type.plans.length === 0,
    isActive: plan?.isActive ?? true,
  });
  const { run, pending } = useRun();
  const price = (key: 'price1' | 'price2' | 'price3' | 'extraBed' | 'childPrice') => ({
    type: 'number',
    min: 0,
    value: String(form[key]),
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [key]: Number(e.target.value) || 0 }),
    leading: <span className="text-sm">₹</span>,
    className: 'no-spinner num',
  });
  return (
    <Dialog
      open
      onClose={onClose}
      size="lg"
      title={plan ? `Edit ${plan.name}` : `Add rate plan · ${type.name}`}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={pending} onClick={() => run(() => saveRatePlanAction({ ...form, id: plan?.id, roomTypeId: type.id }), { onSuccess: onClose })}>
            Save rate plan
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Plan name" required>
          <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </Field>
        <Field label="Meal plan">
          <Select value={form.mealPlan} onChange={(e) => setForm({ ...form, mealPlan: e.target.value as PlanRow['mealPlan'] })}>
            {Object.entries(MEAL_PLAN_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <p className="mt-5 mb-2 text-sm font-semibold text-ink-900">Standard price per night (excluding GST)</p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Field label="1 adult">
          <Input {...price('price1')} />
        </Field>
        <Field label="2 adults">
          <Input {...price('price2')} />
        </Field>
        <Field label="3 adults">
          <Input {...price('price3')} />
        </Field>
        <Field label="Extra bed">
          <Input {...price('extraBed')} />
        </Field>
        <Field label="Per child">
          <Input {...price('childPrice')} />
        </Field>
      </div>
      <Field label="Cancellation policy" className="mt-4">
        <Textarea value={form.cancellationPolicy} onChange={(e) => setForm({ ...form, cancellationPolicy: e.target.value })} />
      </Field>
      <div className="mt-4 flex flex-wrap gap-6">
        <Checkbox label="Default plan" description="Pre-selected on the reservation form" checked={form.isDefault} onChange={(e) => setForm({ ...form, isDefault: e.target.checked })} />
        <Checkbox label="Active" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} />
      </div>
    </Dialog>
  );
}
