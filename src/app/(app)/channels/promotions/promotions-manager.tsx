'use client';

import { useState } from 'react';
import { CalendarClock, Hourglass, Moon, Pencil, Plus, Send, Tag, Ticket } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatINR, OTA_LABELS, timeAgo } from '@/lib/format';
import { pushPromotionAction, savePromotionAction } from '@/server/actions/channels';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog } from '@/components/ui/dialog';
import { Checkbox, Field, Input, Segmented, Switch } from '@/components/ui/fields';
import { useRun } from '@/components/ui/use-run';
import { tx } from '@/i18n/tx';

type PromoType = 'basic' | 'early_bird' | 'last_minute' | 'long_stay' | 'coupon';
interface Promo {
  id: string;
  name: string;
  type: PromoType;
  discountType: 'percent' | 'flat';
  value: number;
  couponCode: string | null;
  conditionValue: number | null;
  stayFrom: string | null;
  stayTo: string | null;
  channels: string[];
  isActive: boolean;
  pushedAt: string | null;
}

const TYPES: Record<PromoType, { label: string; icon: typeof Tag; condition?: string; tone: string }> = {
  basic: { label: 'Basic deal', icon: Tag, tone: 'from-ink-700 to-ink-900' },
  early_bird: { label: 'Early bird', icon: CalendarClock, condition: 'Book at least N days before arrival', tone: 'from-sky-500 to-sky-700' },
  last_minute: { label: 'Last minute', icon: Hourglass, condition: 'Book within N days of arrival', tone: 'from-amber-500 to-orange-600' },
  long_stay: { label: 'Long stay', icon: Moon, condition: 'Stay at least N nights', tone: 'from-violet-500 to-violet-700' },
  coupon: { label: 'Coupon code', icon: Ticket, tone: 'from-brand-500 to-brand-700' },
};

const CHANNELS = ['makemytrip', 'goibibo', 'booking_com', 'agoda', 'web'];

export function PromotionsManager({ promotions }: { promotions: Promo[] }) {
  const [editing, setEditing] = useState<Promo | 'new' | null>(null);
  const { run, pending } = useRun();
  return (
    <div>
      <div className="mb-4 flex justify-end">
        <Button onClick={() => setEditing('new')}>
          <Plus className="h-4 w-4" /> New promotion
        </Button>
      </div>
      <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
        {promotions.map((p) => {
          const meta = TYPES[p.type];
          return (
            <div key={p.id} className={cn('card overflow-hidden', !p.isActive && 'opacity-60')}>
              <div className={cn('flex items-center gap-3 bg-gradient-to-br p-4 text-white', meta.tone)}>
                <meta.icon className="h-5 w-5" />
                <span className="text-sm font-semibold">{tx(meta.label)}</span>
                <span className="num ml-auto text-2xl font-extrabold">{p.discountType === 'percent' ? `${p.value}%` : formatINR(p.value)}</span>
              </div>
              <div className="p-4">
                <p className="font-bold text-ink-900">{p.name}</p>
                <p className="mt-0.5 text-xs text-ink-500">
                  {p.type === 'coupon' ? <>{tx('Code')} {p.couponCode}</> : tx(meta.condition?.replace('N', String(p.conditionValue ?? '—')) ?? 'All dates')}
                </p>
                <div className="mt-3 flex flex-wrap gap-1">
                  {p.channels.map((c) => (
                    <Badge key={c} tone="neutral">
                      {c === 'web' ? 'Booking engine' : OTA_LABELS[c]}
                    </Badge>
                  ))}
                </div>
                <div className="mt-4 flex items-center gap-2 border-t border-ink-100 pt-3">
                  <Switch size="sm" checked={p.isActive} onChange={(isActive) => run(() => savePromotionAction({ ...p, isActive }))} label="Active" />
                  <span className="text-xs text-ink-500">{tx(p.pushedAt ? `Pushed ${timeAgo(p.pushedAt)}` : 'Not pushed yet')}</span>
                  <Button size="icon-sm" variant="ghost" className="ml-auto" onClick={() => setEditing(p)} aria-label="Edit">
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="sm" variant="secondary" disabled={pending || !p.isActive} onClick={() => run(() => pushPromotionAction(p.id), { success: (d) => `Pushed to ${d.channels} OTA(s)` })}>
                    <Send className="h-3.5 w-3.5" /> {tx('Push')}
                  </Button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      {editing && <PromoDialog promo={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function PromoDialog({ promo, onClose }: { promo: Promo | null; onClose: () => void }) {
  const [form, setForm] = useState({
    name: promo?.name ?? '',
    type: promo?.type ?? ('early_bird' as PromoType),
    discountType: promo?.discountType ?? ('percent' as 'percent' | 'flat'),
    value: promo?.value ?? 10,
    conditionValue: promo?.conditionValue ?? 15,
    couponCode: promo?.couponCode ?? '',
    stayFrom: promo?.stayFrom ?? '',
    stayTo: promo?.stayTo ?? '',
    channels: promo?.channels ?? ['makemytrip', 'goibibo', 'booking_com'],
    isActive: promo?.isActive ?? true,
  });
  const { run, pending } = useRun();
  const meta = TYPES[form.type];
  return (
    <Dialog
      open
      onClose={onClose}
      size="lg"
      title={promo ? `Edit ${promo.name}` : 'New promotion'}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={pending} onClick={() => run(() => savePromotionAction({ ...form, id: promo?.id, conditionValue: meta.condition ? form.conditionValue : null }), { onSuccess: onClose })}>
            Save promotion
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {(Object.keys(TYPES) as PromoType[]).map((t) => {
          const m = TYPES[t];
          return (
            <button key={t} type="button" onClick={() => setForm({ ...form, type: t })} className={cn('flex flex-col items-center gap-1.5 rounded-xl border p-3 text-xs font-semibold transition', form.type === t ? 'border-brand-500 bg-brand-50 text-brand-700 ring-4 ring-brand-100' : 'border-ink-200 text-ink-600 hover:border-ink-300')}>
              <m.icon className="h-5 w-5" /> {tx(m.label)}
            </button>
          );
        })}
      </div>
      <Field label="Name" className="mt-4">
        <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Early bird 10%" />
      </Field>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <Field label="Discount">
          <div className="flex gap-2">
            <Segmented
              size="sm"
              value={form.discountType}
              onChange={(discountType) => setForm({ ...form, discountType })}
              options={[
                { value: 'percent', label: '%' },
                { value: 'flat', label: '₹' },
              ]}
            />
            <Input type="number" value={form.value} onChange={(e) => setForm({ ...form, value: Number(e.target.value) || 0 })} />
          </div>
        </Field>
        {meta.condition && (
          <Field label={meta.condition.replace(' N ', ' (N) ')}>
            <Input type="number" value={form.conditionValue} onChange={(e) => setForm({ ...form, conditionValue: Number(e.target.value) || 0 })} />
          </Field>
        )}
        {form.type === 'coupon' && (
          <Field label="Coupon code">
            <Input value={form.couponCode} onChange={(e) => setForm({ ...form, couponCode: e.target.value.toUpperCase() })} placeholder="PORTICO300" className="font-mono" />
          </Field>
        )}
        <Field label="Stay from (optional)">
          <Input type="date" value={form.stayFrom} onChange={(e) => setForm({ ...form, stayFrom: e.target.value })} />
        </Field>
        <Field label="Stay to (optional)">
          <Input type="date" value={form.stayTo} onChange={(e) => setForm({ ...form, stayTo: e.target.value })} />
        </Field>
      </div>
      <Field label="Show on" className="mt-4">
        <div className="flex flex-wrap gap-4">
          {CHANNELS.map((c) => (
            <Checkbox key={c} label={c === 'web' ? 'Booking engine' : OTA_LABELS[c]} checked={form.channels.includes(c)} onChange={(e) => setForm({ ...form, channels: e.target.checked ? [...form.channels, c] : form.channels.filter((x) => x !== c) })} />
          ))}
        </div>
      </Field>
    </Dialog>
  );
}
