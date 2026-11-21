'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, BedDouble, Check, Loader2, Printer } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatDay, formatINR } from '@/lib/format';
import type { BookingDetail } from '@/server/services/frontoffice';
import { assignRoomAction, checkInAction, checkOutAction, markFormCAction, postChargeAction, recordPaymentAction, roomOptionsAction } from '@/server/actions/frontoffice';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Checkbox, Field, Input, Segmented, Select } from '@/components/ui/fields';
import { Alert } from '@/components/ui/card';
import { StatusBadge } from '@/components/ui/badge';
import { useRun } from '@/components/ui/use-run';
import { PhotoGrid } from '@/components/ui/photo-upload';
import { useToast } from '@/components/ui/toast';

type RoomOption = { id: string; number: string; floor: string | null; hkStatus: 'clean' | 'dirty' | 'inspected' | 'out_of_order'; free: boolean; current: boolean };

const HK_RING: Record<string, string> = {
  inspected: 'ring-sky-300 bg-sky-50',
  clean: 'ring-emerald-300 bg-emerald-50',
  dirty: 'ring-amber-300 bg-amber-50',
  out_of_order: 'ring-rose-300 bg-rose-50',
};

function useRoomOptions(bookingRoomId: string) {
  const [options, setOptions] = useState<RoomOption[] | null>(null);
  useEffect(() => {
    roomOptionsAction(bookingRoomId).then((r) => setOptions(r.ok ? (r.data as RoomOption[]) : []));
  }, [bookingRoomId]);
  return options;
}

/** Room picker: free rooms of the right type, inspected/clean first; the colour shows housekeeping status. */
function RoomPicker({ bookingRoomId, value, onChange, requireClean }: { bookingRoomId: string; value: string | null; onChange: (id: string) => void; requireClean?: boolean }) {
  const options = useRoomOptions(bookingRoomId);
  useEffect(() => {
    if (!value && options) {
      const best = options.find((o) => o.free && (o.hkStatus === 'inspected' || o.hkStatus === 'clean'));
      if (best) onChange(best.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options]);
  if (!options) return <Loader2 className="h-5 w-5 animate-spin text-ink-400" />;
  if (options.length === 0) return <p className="text-sm text-ink-500">No rooms of this type.</p>;
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => {
        const disabled = !o.free || (requireClean && o.hkStatus === 'dirty');
        return (
          <button
            key={o.id}
            type="button"
            disabled={disabled && !o.current}
            onClick={() => onChange(o.id)}
            title={`${o.hkStatus.replace('_', ' ')}${!o.free ? ' · taken' : ''}`}
            className={cn(
              'num relative flex h-12 w-16 flex-col items-center justify-center rounded-xl text-sm font-extrabold ring-1 transition',
              HK_RING[o.hkStatus],
              value === o.id && 'ring-2 ring-brand-600 ring-offset-2',
              disabled && !o.current ? 'cursor-not-allowed opacity-35' : 'hover:-translate-y-px hover:shadow-card',
            )}
          >
            {o.number}
            <span className="text-[9px] font-semibold tracking-wide text-ink-500 uppercase">{!o.free ? 'taken' : o.hkStatus === 'out_of_order' ? 'OOO' : o.hkStatus}</span>
            {value === o.id && (
              <span className="absolute -top-1.5 -right-1.5 grid h-4 w-4 place-items-center rounded-full bg-brand-600 text-white">
                <Check className="h-3 w-3" />
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export function AssignDialog({ room, onClose }: { room: BookingDetail['rooms'][number]; onClose: () => void }) {
  const [roomId, setRoomId] = useState<string | null>(room.roomId);
  const { run, pending } = useRun();
  return (
    <Dialog
      open
      onClose={onClose}
      title={room.roomId ? `Change room · ${room.typeName}` : `Assign room · ${room.typeName}`}
      description={`${formatDay(room.checkIn)} → ${formatDay(room.checkOut)}. Inspected and clean rooms are shown first.`}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={pending} disabled={!roomId || roomId === room.roomId} onClick={() => run(() => assignRoomAction(room.id, roomId), { success: (d) => `Room ${d.number} assigned`, onSuccess: onClose })}>
            Assign room
          </Button>
        </>
      }
    >
      <RoomPicker bookingRoomId={room.id} value={roomId} onChange={setRoomId} />
      <Legend />
    </Dialog>
  );
}

function Legend() {
  return (
    <div className="mt-4 flex flex-wrap gap-3 text-[11px] text-ink-500">
      {[
        ['bg-sky-400', 'Inspected'],
        ['bg-emerald-400', 'Clean'],
        ['bg-amber-400', 'Dirty'],
        ['bg-rose-400', 'Out of order'],
      ].map(([cls, label]) => (
        <span key={label} className="flex items-center gap-1.5">
          <span className={cn('h-2 w-2 rounded-full', cls)} /> {label}
        </span>
      ))}
    </div>
  );
}

const ID_TYPES = [
  { value: 'aadhaar', label: 'Aadhaar' },
  { value: 'driving_licence', label: 'Driving licence' },
  { value: 'voter_id', label: 'Voter ID' },
  { value: 'passport', label: 'Passport' },
  { value: 'pan', label: 'PAN' },
  { value: 'other', label: 'Other' },
] as const;

export function CheckInDialog({ data, onClose }: { data: BookingDetail; onClose: () => void }) {
  const { booking: b, guest: g, totals } = data;
  const reserved = data.rooms.filter((r) => r.status === 'reserved');
  const [assign, setAssign] = useState<Record<string, string | null>>(Object.fromEntries(reserved.map((r) => [r.id, r.roomId])));
  const [idType, setIdType] = useState<(typeof ID_TYPES)[number]['value']>(g.isForeign ? 'passport' : (g.idType as 'aadhaar') ?? 'aadhaar');
  const [idNumber, setIdNumber] = useState('');
  const [idPhotos, setIdPhotos] = useState<string[]>(g.idPhotos ?? []);
  const [foreign, setForeign] = useState(g.isForeign);
  const [f, setF] = useState({
    nationality: g.isForeign ? g.nationality : '',
    passportNumber: g.passportNumber ?? '',
    passportExpiry: g.passportExpiry ?? '',
    visaNumber: g.visaNumber ?? '',
    visaType: g.visaType ?? 'Tourist',
    visaExpiry: g.visaExpiry ?? '',
    arrivedFrom: g.arrivedFrom ?? '',
    nextDestination: g.nextDestination ?? '',
    arrivalInIndia: g.arrivalInIndia ?? '',
    purposeOfVisit: g.purposeOfVisit ?? 'Tourism',
  });
  const [advance, setAdvance] = useState(0);
  const [mode, setMode] = useState<'cash' | 'upi' | 'card'>('upi');
  const { run, pending } = useRun();
  const router = useRouter();
  const ready = reserved.every((r) => assign[r.id]) && (!foreign || (f.nationality.length > 1 && f.passportNumber.length > 4));

  return (
    <Dialog
      open
      onClose={onClose}
      size="lg"
      title={`Check in ${g.name}`}
      description={`${b.bookingNo} · ${b.nights} night${b.nights === 1 ? '' : 's'} · balance ${formatINR(totals.balance)}`}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            loading={pending}
            disabled={!ready}
            onClick={() =>
              run(
                () =>
                  checkInAction({
                    bookingId: b.id,
                    assignments: reserved.map((r) => ({ bookingRoomId: r.id, roomId: assign[r.id]! })),
                    idType: foreign ? 'passport' : idType,
                    idNumber: foreign ? f.passportNumber : idNumber || null,
                    idPhotos,
                    foreign: foreign ? f : null,
                    advance: advance > 0 ? { amount: advance, mode } : null,
                  }),
                {
                  success: (d) => `Checked in · room ${d.rooms.join(', ')}`,
                  onSuccess: () => {
                    onClose();
                    window.open(`/print/registration/${b.id}`, '_blank');
                    router.refresh();
                  },
                },
              )
            }
          >
            Check in & print card
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        {reserved.map((r, i) => (
          <div key={r.id}>
            <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-ink-900">
              <BedDouble className="h-4 w-4" style={{ color: r.typeColor }} /> Room {i + 1} · {r.typeName}
            </p>
            <RoomPicker bookingRoomId={r.id} value={assign[r.id]} onChange={(id) => setAssign((a) => ({ ...a, [r.id]: id }))} requireClean />
          </div>
        ))}
        <Legend />

        <div className="rounded-xl border border-ink-200 p-4">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-semibold text-ink-900">Guest ID</p>
            <Checkbox label="Foreign national (Form-III)" checked={foreign} onChange={(e) => setForeign(e.target.checked)} />
          </div>
          {!foreign ? (
            <div className="grid gap-3 sm:grid-cols-[180px_1fr]">
              <Select value={idType} onChange={(e) => setIdType(e.target.value as typeof idType)}>
                {ID_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </Select>
              <Input value={idNumber} onChange={(e) => setIdNumber(e.target.value)} placeholder={g.idNumberMasked ? `On file: ${g.idNumberMasked}` : 'ID number (only the last 4 digits are stored)'} />
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Nationality" required>
                <Input value={f.nationality} onChange={(e) => setF({ ...f, nationality: e.target.value })} />
              </Field>
              <Field label="Passport no." required>
                <Input value={f.passportNumber} onChange={(e) => setF({ ...f, passportNumber: e.target.value.toUpperCase() })} />
              </Field>
              <Field label="Passport expiry">
                <Input type="date" value={f.passportExpiry} onChange={(e) => setF({ ...f, passportExpiry: e.target.value })} />
              </Field>
              <Field label="Visa no.">
                <Input value={f.visaNumber} onChange={(e) => setF({ ...f, visaNumber: e.target.value })} />
              </Field>
              <Field label="Visa type">
                <Select value={f.visaType} onChange={(e) => setF({ ...f, visaType: e.target.value })}>
                  {['Tourist', 'e-Tourist', 'Business', 'e-Business', 'Employment', 'Student', 'Medical', 'OCI'].map((v) => (
                    <option key={v}>{v}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Visa expiry">
                <Input type="date" value={f.visaExpiry} onChange={(e) => setF({ ...f, visaExpiry: e.target.value })} />
              </Field>
              <Field label="Arrived from">
                <Input value={f.arrivedFrom} onChange={(e) => setF({ ...f, arrivedFrom: e.target.value })} placeholder="City, country" />
              </Field>
              <Field label="Next destination">
                <Input value={f.nextDestination} onChange={(e) => setF({ ...f, nextDestination: e.target.value })} />
              </Field>
              <Field label="Arrival in India">
                <Input type="date" value={f.arrivalInIndia} onChange={(e) => setF({ ...f, arrivalInIndia: e.target.value })} />
              </Field>
              <p className="text-xs text-amber-700 sm:col-span-3">Form-C must be filed on the FRRO portal within 24 hours. A countdown appears on the booking.</p>
            </div>
          )}
          <div className="mt-4 border-t border-ink-100 pt-3">
            <p className="mb-2 text-xs font-medium text-ink-500">
              {foreign ? 'Passport and visa pages' : 'ID photo, front and back'}
              {(g.idPhotos?.length ?? 0) > 0 && <span className="text-emerald-700"> · on file from an earlier stay</span>}
              <span className="text-ink-400"> · kept private, staff only</span>
            </p>
            <PhotoGrid folder="ids" value={idPhotos} onChange={setIdPhotos} max={4} webcam scanLabel={foreign ? 'Scan passport' : 'Scan ID'} tileClassName="h-20 w-28" />
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-3 rounded-xl bg-ink-50 p-4">
          <Field label="Advance at check-in" className="flex-1">
            <Input type="number" min={0} value={advance || ''} placeholder={totals.balance > 0 ? String(Math.round(totals.balance)) : '0'} onChange={(e) => setAdvance(Number(e.target.value) || 0)} leading={<span className="text-sm">₹</span>} />
          </Field>
          <Segmented
            value={mode}
            onChange={setMode}
            options={[
              { value: 'upi', label: 'UPI' },
              { value: 'cash', label: 'Cash' },
              { value: 'card', label: 'Card' },
            ]}
          />
        </div>
      </div>
    </Dialog>
  );
}

export function CheckOutDialog({ data, businessDate, onClose }: { data: BookingDetail; businessDate: string; onClose: () => void }) {
  const { booking: b, guest: g, totals } = data;
  const [amount, setAmount] = useState(Math.max(0, Math.round(totals.balance * 100) / 100));
  const [mode, setMode] = useState<'cash' | 'upi' | 'card' | 'bank_transfer'>('upi');
  const [reference, setReference] = useState('');
  const [credit, setCredit] = useState(false);
  const { run, pending } = useRun();
  const toast = useToast();
  const router = useRouter();
  const early = businessDate < b.checkOut;
  const remaining = Math.round((totals.balance - amount) * 100) / 100;

  return (
    <Dialog
      open
      onClose={onClose}
      title={`Check out ${g.name}`}
      description={`${b.bookingNo} · room ${data.rooms.map((r) => r.roomNumber).filter(Boolean).join(', ')}`}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            loading={pending}
            disabled={remaining > 0.5 && !credit}
            onClick={() =>
              run(() => checkOutAction({ bookingId: b.id, settle: amount > 0 ? { amount, mode, reference: reference || null } : null, allowCredit: credit }), {
                success: (d) => `Checked out · invoice ${d.invoiceNo}`,
                onSuccess: (d) => {
                  onClose();
                  toast.show({ tone: 'info', title: 'Room sent to housekeeping', description: 'It is marked dirty and a cleaning task was created.', action: { label: 'Print invoice', onClick: () => void window.open(`/print/invoice/${d.invoiceId}`, '_blank') } });
                  router.refresh();
                },
              })
            }
          >
            <Printer className="h-4 w-4" /> Check out & create invoice
          </Button>
        </>
      }
    >
      {early && (
        <Alert tone="warning" icon={<AlertTriangle className="h-4 w-4" />} className="mb-4">
          Leaving early: the booking was until {formatDay(b.checkOut)}. Unused nights are removed from the bill and go back on sale.
        </Alert>
      )}
      <dl className="space-y-2 rounded-xl bg-ink-50 p-4 text-sm">
        <div className="flex justify-between">
          <dt className="text-ink-500">Room charges</dt>
          <dd className="num font-medium">{formatINR(totals.room)}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-ink-500">Restaurant & extras</dt>
          <dd className="num font-medium">{formatINR(totals.extras)}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-ink-500">Paid</dt>
          <dd className="num font-medium text-emerald-700">−{formatINR(totals.paid)}</dd>
        </div>
        <div className="flex justify-between border-t border-ink-200 pt-2 text-base font-bold">
          <dt>Balance</dt>
          <dd className="num">{formatINR(totals.balance)}</dd>
        </div>
      </dl>
      {totals.balance > 0.5 && (
        <div className="mt-4 space-y-3">
          <div className="flex flex-wrap items-end gap-3">
            <Field label="Collect now" className="flex-1">
              <Input type="number" min={0} value={amount} onChange={(e) => setAmount(Number(e.target.value) || 0)} leading={<span className="text-sm">₹</span>} className="num" />
            </Field>
            <Segmented
              value={mode}
              onChange={setMode}
              options={[
                { value: 'upi', label: 'UPI' },
                { value: 'cash', label: 'Cash' },
                { value: 'card', label: 'Card' },
                { value: 'bank_transfer', label: 'Bank' },
              ]}
            />
          </div>
          {mode !== 'cash' && <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Transaction reference (optional)" />}
          {remaining > 0.5 && (
            <Checkbox
              label={`Leave ${formatINR(remaining)} on credit`}
              description={`Bill to ${b.billToName ?? 'the guest'}. It will appear on the Credit Report.`}
              checked={credit}
              onChange={(e) => setCredit(e.target.checked)}
            />
          )}
        </div>
      )}
    </Dialog>
  );
}

export function PaymentDialog({ bookingId, balance, onClose }: { bookingId: string; balance: number; onClose: () => void }) {
  const [amount, setAmount] = useState(Math.max(0, Math.round(balance)));
  const [mode, setMode] = useState<'cash' | 'upi' | 'card' | 'bank_transfer'>('upi');
  const [reference, setReference] = useState('');
  const [refund, setRefund] = useState(false);
  const { run, pending } = useRun();
  return (
    <Dialog
      open
      onClose={onClose}
      size="sm"
      title={refund ? 'Record refund' : 'Record payment'}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={pending} disabled={amount <= 0} onClick={() => run(() => recordPaymentAction({ bookingId, amount, mode, reference: reference || null, refund }), { onSuccess: onClose })}>
            {refund ? 'Record refund' : `Receive ${formatINR(amount)}`}
          </Button>
        </>
      }
    >
      <Field label="Amount">
        <Input type="number" min={0} value={amount || ''} onChange={(e) => setAmount(Number(e.target.value) || 0)} leading={<span className="text-sm">₹</span>} className="num text-lg font-semibold" autoFocus />
      </Field>
      <Field label="Mode" className="mt-4">
        <Segmented
          value={mode}
          onChange={setMode}
          options={[
            { value: 'upi', label: 'UPI' },
            { value: 'cash', label: 'Cash' },
            { value: 'card', label: 'Card' },
            { value: 'bank_transfer', label: 'Bank' },
          ]}
        />
      </Field>
      {mode !== 'cash' && (
        <Field label="Reference" className="mt-4">
          <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="UPI / card transaction ID" />
        </Field>
      )}
      <Checkbox className="mt-4" label="This is a refund to the guest" checked={refund} onChange={(e) => setRefund(e.target.checked)} />
    </Dialog>
  );
}

const QUICK_CHARGES = [
  { label: 'Laundry', amount: 150, tax: 18 },
  { label: 'Extra bed', amount: 600, tax: 5 },
  { label: 'Early check-in', amount: 800, tax: 5 },
  { label: 'Late check-out', amount: 800, tax: 5 },
  { label: 'Airport pickup', amount: 900, tax: 5 },
  { label: 'Mini bar', amount: 100, tax: 18 },
];

export function ChargeDialog({ bookingId, onClose }: { bookingId: string; onClose: () => void }) {
  const [type, setType] = useState<'extra' | 'discount'>('extra');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState(0);
  const [quantity, setQuantity] = useState(1);
  const [taxRate, setTaxRate] = useState(18);
  const { run, pending } = useRun();
  const tax = Math.round(amount * quantity * taxRate) / 100;
  return (
    <Dialog
      open
      onClose={onClose}
      title="Post to the bill"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={pending} disabled={!description || amount <= 0} onClick={() => run(() => postChargeAction({ bookingId, type, description, amount, quantity, taxRate }), { onSuccess: onClose })}>
            Post {formatINR((type === 'discount' ? -1 : 1) * (amount * quantity + tax))}
          </Button>
        </>
      }
    >
      <Segmented
        value={type}
        onChange={setType}
        options={[
          { value: 'extra', label: 'Charge' },
          { value: 'discount', label: 'Discount' },
        ]}
      />
      {type === 'extra' && (
        <div className="mt-4 flex flex-wrap gap-1.5">
          {QUICK_CHARGES.map((c) => (
            <button
              key={c.label}
              type="button"
              onClick={() => (setDescription(c.label), setAmount(c.amount), setTaxRate(c.tax))}
              className="rounded-full bg-white px-3 py-1 text-xs font-medium text-ink-700 ring-1 ring-ink-300 transition hover:text-brand-700 hover:ring-brand-300"
            >
              {c.label}
            </button>
          ))}
        </div>
      )}
      <Field label="Description" className="mt-4">
        <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder={type === 'discount' ? 'Goodwill discount' : 'Laundry (3 shirts)'} />
      </Field>
      <div className="mt-4 grid grid-cols-3 gap-3">
        <Field label="Amount">
          <Input type="number" min={0} value={amount || ''} onChange={(e) => setAmount(Number(e.target.value) || 0)} className="num" />
        </Field>
        <Field label="Qty">
          <Input type="number" min={1} value={quantity} onChange={(e) => setQuantity(Math.max(1, Number(e.target.value) || 1))} className="num" />
        </Field>
        <Field label="GST %">
          <Select value={taxRate} onChange={(e) => setTaxRate(Number(e.target.value))}>
            {[0, 5, 12, 18].map((r) => (
              <option key={r} value={r}>
                {r}%
              </option>
            ))}
          </Select>
        </Field>
      </div>
    </Dialog>
  );
}

export function FormCDialog({ bookingId, onClose }: { bookingId: string; onClose: () => void }) {
  const [reference, setReference] = useState('');
  const { run, pending } = useRun();
  return (
    <Dialog
      open
      onClose={onClose}
      size="sm"
      title="Form-C submitted"
      description="Enter the acknowledgement number from the FRRO portal."
      footer={
        <>
          <a href="https://indianfrro.gov.in/frro/FormC" target="_blank" rel="noreferrer" className="mr-auto text-sm font-medium text-brand-600 hover:text-brand-700">
            Open FRRO portal ↗
          </a>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={pending} disabled={reference.length < 3} onClick={() => run(() => markFormCAction(bookingId, reference), { onSuccess: onClose })}>
            Save
          </Button>
        </>
      }
    >
      <Field label="Acknowledgement / application ID">
        <Input value={reference} onChange={(e) => setReference(e.target.value)} autoFocus />
      </Field>
      <div className="mt-3">
        <StatusBadge status="pending" label="Due within 24 hours of arrival" />
      </div>
    </Dialog>
  );
}
