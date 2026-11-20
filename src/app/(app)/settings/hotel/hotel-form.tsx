'use client';

import { useState } from 'react';
import { BadgeCheck, Building2, Clock, FileText, Percent, Receipt } from 'lucide-react';
import { INDIAN_STATES, isValidGstin } from '@/lib/gst';
import { formatINR } from '@/lib/format';
import { saveHotelDetailsAction } from '@/server/actions/settings';
import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { Checkbox, Field, Input, Select, Textarea } from '@/components/ui/fields';
import { useRun } from '@/components/ui/use-run';

type Form = Parameters<typeof saveHotelDetailsAction>[0] & {
  legalName: string;
  gstin: string;
  stateCode: string;
  state: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  pincode: string;
  phone: string;
  email: string;
  website: string;
  starRating: number;
};

export function HotelForm({ initial }: { initial: Form }) {
  const [form, setForm] = useState<Form>(initial);
  const { run, pending } = useRun();
  const set = <K extends keyof Form>(key: K, value: Form[K]) => setForm((f) => ({ ...f, [key]: value }));
  const gstOk = !form.gstin || isValidGstin(form.gstin);

  return (
    <form
      className="grid gap-6 xl:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        void run(() => saveHotelDetailsAction({ ...form, starRating: form.starRating || null }));
      }}
    >
      <Card>
        <CardHeader icon={<Building2 className="h-4 w-4" />} title="Hotel profile" description="Shown on invoices, registration cards and the booking engine" />
        <div className="grid gap-4 p-5 sm:grid-cols-2">
          <Field label="Hotel name" required className="sm:col-span-2">
            <Input value={form.name} onChange={(e) => set('name', e.target.value)} />
          </Field>
          <Field label="Legal name (as on GST)">
            <Input value={form.legalName} onChange={(e) => set('legalName', e.target.value)} />
          </Field>
          <Field label="GSTIN" error={gstOk ? undefined : '15 characters, e.g. 08AAKCS1234F1Z5'} hint={form.gstin && gstOk ? 'Looks valid' : undefined}>
            <Input
              value={form.gstin}
              onChange={(e) => {
                const v = e.target.value.toUpperCase();
                set('gstin', v);
                if (v.length >= 2 && INDIAN_STATES.some((s) => s.code === v.slice(0, 2))) {
                  const st = INDIAN_STATES.find((s) => s.code === v.slice(0, 2))!;
                  setForm((f) => ({ ...f, gstin: v, stateCode: st.code, state: st.name }));
                }
              }}
              maxLength={15}
              invalid={!gstOk}
              trailing={form.gstin && gstOk ? <BadgeCheck className="h-4 w-4 text-emerald-600" /> : undefined}
              className="font-mono"
            />
          </Field>
          <Field label="Address line 1" className="sm:col-span-2">
            <Input value={form.addressLine1} onChange={(e) => set('addressLine1', e.target.value)} />
          </Field>
          <Field label="Address line 2" className="sm:col-span-2">
            <Input value={form.addressLine2} onChange={(e) => set('addressLine2', e.target.value)} />
          </Field>
          <Field label="City">
            <Input value={form.city} onChange={(e) => set('city', e.target.value)} />
          </Field>
          <Field label="PIN code">
            <Input value={form.pincode} onChange={(e) => set('pincode', e.target.value)} maxLength={6} inputMode="numeric" />
          </Field>
          <Field label="State">
            <Select
              value={form.stateCode}
              onChange={(e) => {
                const st = INDIAN_STATES.find((s) => s.code === e.target.value);
                setForm((f) => ({ ...f, stateCode: e.target.value, state: st?.name ?? '' }));
              }}
            >
              <option value="">Choose…</option>
              {INDIAN_STATES.map((s) => (
                <option key={s.code} value={s.code}>
                  {s.code} · {s.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Star rating">
            <Select value={form.starRating} onChange={(e) => set('starRating', Number(e.target.value))}>
              {[0, 1, 2, 3, 4, 5].map((n) => (
                <option key={n} value={n}>
                  {n === 0 ? 'Not rated' : `${n} star`}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Phone">
            <Input value={form.phone} onChange={(e) => set('phone', e.target.value)} />
          </Field>
          <Field label="Email">
            <Input type="email" value={form.email} onChange={(e) => set('email', e.target.value)} />
          </Field>
        </div>
      </Card>

      <div className="space-y-6">
        <Card>
          <CardHeader icon={<Percent className="h-4 w-4" />} title="GST on rooms" description="Rule since 22 Sep 2025: 5% up to ₹7,500 per room per night, 18% above. Kept here so it can change without new code." />
          <div className="grid gap-4 p-5 sm:grid-cols-3">
            <Field label="Slab limit (₹/night)">
              <Input type="number" value={form.tax.slabLimit} onChange={(e) => set('tax', { ...form.tax, slabLimit: Number(e.target.value) || 0 })} />
            </Field>
            <Field label="GST up to limit">
              <Input type="number" value={form.tax.lowRate} onChange={(e) => set('tax', { ...form.tax, lowRate: Number(e.target.value) || 0 })} trailing={<span className="text-sm">%</span>} />
            </Field>
            <Field label="GST above limit">
              <Input type="number" value={form.tax.highRate} onChange={(e) => set('tax', { ...form.tax, highRate: Number(e.target.value) || 0 })} trailing={<span className="text-sm">%</span>} />
            </Field>
            <Field label="Restaurant GST (default)">
              <Input type="number" value={form.tax.posDefaultRate} onChange={(e) => set('tax', { ...form.tax, posDefaultRate: Number(e.target.value) || 0 })} trailing={<span className="text-sm">%</span>} />
            </Field>
            <div className="sm:col-span-2 sm:pt-7">
              <Checkbox label="Room rates already include GST" description="Leave off if front-desk prices are before tax (most common)." checked={form.tax.ratesIncludeTax} onChange={(e) => set('tax', { ...form.tax, ratesIncludeTax: e.target.checked })} />
            </div>
            <p className="rounded-lg bg-ink-50 p-3 text-xs text-ink-600 sm:col-span-3">
              Example: a {formatINR(form.tax.slabLimit)} room pays {form.tax.lowRate}% = {formatINR((form.tax.slabLimit * form.tax.lowRate) / 100)} GST. A {formatINR(form.tax.slabLimit + 1)} room pays {form.tax.highRate}%.
            </p>
          </div>
        </Card>

        <Card>
          <CardHeader icon={<Receipt className="h-4 w-4" />} title="Invoices" />
          <div className="grid gap-4 p-5 sm:grid-cols-2">
            <Field label="Invoice prefix" hint={`Numbers look like ${form.invoice.prefix}/26-27/0001`}>
              <Input value={form.invoice.prefix} onChange={(e) => set('invoice', { ...form.invoice, prefix: e.target.value.toUpperCase() })} maxLength={6} />
            </Field>
            <Field label="Short code" hint="Used in booking and bill numbers">
              <Input value={form.shortCode} onChange={(e) => set('shortCode', e.target.value.toUpperCase())} maxLength={5} />
            </Field>
            <Field label="UPI ID for the QR code">
              <Input value={form.invoice.upiId} onChange={(e) => set('invoice', { ...form.invoice, upiId: e.target.value })} placeholder="hotel@okhdfcbank" />
            </Field>
            <div className="sm:pt-7">
              <Checkbox label="Print UPI QR on invoices" checked={form.invoice.showUpiQr} onChange={(e) => set('invoice', { ...form.invoice, showUpiQr: e.target.checked })} />
            </div>
            <Field label="Bank details" className="sm:col-span-2">
              <Input value={form.invoice.bankDetails} onChange={(e) => set('invoice', { ...form.invoice, bankDetails: e.target.value })} />
            </Field>
            <Field label="Footer note" className="sm:col-span-2">
              <Textarea value={form.invoice.footer} onChange={(e) => set('invoice', { ...form.invoice, footer: e.target.value })} className="min-h-16" />
            </Field>
          </div>
        </Card>

        <Card>
          <CardHeader icon={<Clock className="h-4 w-4" />} title="Timings and defaults" />
          <div className="grid gap-4 p-5 sm:grid-cols-2">
            <Field label="Check-in time">
              <Input type="time" value={form.checkInTime} onChange={(e) => set('checkInTime', e.target.value)} />
            </Field>
            <Field label="Check-out time">
              <Input type="time" value={form.checkOutTime} onChange={(e) => set('checkOutTime', e.target.value)} />
            </Field>
            <Field label="Default hold time (minutes)">
              <Input type="number" value={form.booking.holdMinutesDefault} onChange={(e) => set('booking', { ...form.booking, holdMinutesDefault: Number(e.target.value) || 60 })} />
            </Field>
            <Field label="Children free up to age">
              <Input type="number" value={form.booking.childAgeLimit} onChange={(e) => set('booking', { ...form.booking, childAgeLimit: Number(e.target.value) || 0 })} />
            </Field>
          </div>
        </Card>
        <div className="flex justify-end">
          <Button type="submit" size="lg" loading={pending}>
            <FileText className="h-4 w-4" /> Save hotel details
          </Button>
        </div>
      </div>
    </form>
  );
}
