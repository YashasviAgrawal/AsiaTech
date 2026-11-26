'use client';

import { useState } from 'react';
import { Crown } from 'lucide-react';
import { formatINR } from '@/lib/format';
import { initials } from '@/lib/utils';
import { updateGuestAction } from '@/server/actions/reservations';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox, Field, Input, Textarea } from '@/components/ui/fields';
import { useRun } from '@/components/ui/use-run';
import { tx } from '@/i18n/tx';

interface GuestData {
  id: string;
  name: string;
  mobile: string | null;
  email: string | null;
  city: string | null;
  company: string | null;
  companyGstin: string | null;
  isVip: boolean;
  notes: string | null;
}

export function GuestEditor({ guest, stats, canEdit, meta }: { guest: GuestData; stats: { stays: number; spend: number }; canEdit: boolean; meta: { nationality: string; id: string | null; passport: string | null } }) {
  const [form, setForm] = useState({ ...guest, mobile: guest.mobile ?? '', email: guest.email ?? '', city: guest.city ?? '', company: guest.company ?? '', companyGstin: guest.companyGstin ?? '', notes: guest.notes ?? '' });
  const { run, pending } = useRun();
  const set = (key: keyof typeof form, value: string | boolean) => setForm((f) => ({ ...f, [key]: value }));
  return (
    <Card className="overflow-hidden">
      <div className="bg-gradient-to-br from-ink-900 to-ink-950 p-5 text-white">
        <div className="flex items-center gap-3">
          <span className="grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 text-lg font-bold">{initials(guest.name)}</span>
          <div>
            <h1 className="flex items-center gap-2 text-xl font-bold">
              {guest.name} {guest.isVip && <Crown className="h-4 w-4 text-amber-400" />}
            </h1>
            <p className="text-xs text-ink-400">
              {meta.nationality}
              {meta.id ? ` · ${meta.id}` : ''}
              {meta.passport ? ` · Passport ${meta.passport}` : ''}
            </p>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <div className="rounded-xl bg-white/5 p-3 ring-1 ring-white/10">
            <p className="num text-xl font-extrabold">{stats.stays}</p>
            <p className="text-[11px] text-ink-400">{tx('stays')}</p>
          </div>
          <div className="rounded-xl bg-white/5 p-3 ring-1 ring-white/10">
            <p className="num text-xl font-extrabold">{formatINR(stats.spend)}</p>
            <p className="text-[11px] text-ink-400">{tx('paid to date')}</p>
          </div>
        </div>
      </div>
      <div className="space-y-3.5 p-5">
        <Field label="Name">
          <Input value={form.name} onChange={(e) => set('name', e.target.value)} disabled={!canEdit} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Mobile">
            <Input value={form.mobile} onChange={(e) => set('mobile', e.target.value)} disabled={!canEdit} />
          </Field>
          <Field label="City">
            <Input value={form.city} onChange={(e) => set('city', e.target.value)} disabled={!canEdit} />
          </Field>
        </div>
        <Field label="Email">
          <Input value={form.email} onChange={(e) => set('email', e.target.value)} disabled={!canEdit} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Company">
            <Input value={form.company} onChange={(e) => set('company', e.target.value)} disabled={!canEdit} />
          </Field>
          <Field label="GSTIN">
            <Input value={form.companyGstin} onChange={(e) => set('companyGstin', e.target.value.toUpperCase())} disabled={!canEdit} />
          </Field>
        </div>
        <Field label="Notes (preferences, allergies)">
          <Textarea value={form.notes} onChange={(e) => set('notes', e.target.value)} disabled={!canEdit} />
        </Field>
        <Checkbox label="VIP guest" description="Shown with a crown on every list" checked={form.isVip} onChange={(e) => set('isVip', e.target.checked)} disabled={!canEdit} />
        {canEdit && (
          <Button className="w-full" loading={pending} onClick={() => run(() => updateGuestAction({ ...form, mobile: form.mobile || null }))}>
            Save guest
          </Button>
        )}
      </div>
    </Card>
  );
}
