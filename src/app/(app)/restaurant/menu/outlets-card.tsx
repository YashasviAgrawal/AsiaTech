'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Pencil, Plus, Store } from 'lucide-react';
import { cn } from '@/lib/utils';
import { saveOutletAction } from '@/server/actions/pos';
import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { Field, Input, Segmented } from '@/components/ui/fields';
import { useRun } from '@/components/ui/use-run';

type Outlet = { id: string; name: string; code: string; defaultTaxRate: number };

/** Outlets of the hotel: each has its own menu, tables, day close and bill series (CODE/26-27/00001). */
export function OutletsCard({ outlets, current }: { outlets: Outlet[]; current: string }) {
  const [editing, setEditing] = useState<Outlet | 'new' | null>(null);
  return (
    <Card>
      <CardHeader
        icon={<Store className="h-4 w-4" />}
        title="Outlets"
        description="Restaurant, café, bar or room service: each has its own menu, tables and bill series."
        action={
          <Button size="sm" variant="soft" onClick={() => setEditing('new')}>
            <Plus className="h-4 w-4" /> Add outlet
          </Button>
        }
      />
      <ul className="divide-y divide-ink-100">
        {outlets.map((o) => (
          <li key={o.id} className={cn('flex items-center gap-3 px-5 py-3', o.id === current && 'bg-brand-50/40')}>
            <Link href={`/restaurant/menu?outlet=${o.id}`} className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-ink-900">{o.name}</p>
              <p className="font-mono text-[11px] text-ink-500">
                Bills {o.code}/… · GST {o.defaultTaxRate}%
              </p>
            </Link>
            {o.id === current && <span className="rounded-full bg-brand-100 px-2 py-0.5 text-[11px] font-semibold text-brand-700">Editing</span>}
            <button type="button" onClick={() => setEditing(o)} className="grid h-8 w-8 place-items-center rounded-lg text-ink-400 hover:bg-ink-100 hover:text-ink-700" aria-label={`Edit ${o.name}`}>
              <Pencil className="h-4 w-4" />
            </button>
          </li>
        ))}
      </ul>
      {editing && <OutletDialog outlet={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </Card>
  );
}

function OutletDialog({ outlet, onClose }: { outlet: Outlet | null; onClose: () => void }) {
  const [form, setForm] = useState({ name: outlet?.name ?? '', code: outlet?.code ?? '', defaultTaxRate: outlet?.defaultTaxRate ?? 5 });
  const { run, pending } = useRun();
  return (
    <Dialog
      open
      onClose={onClose}
      size="sm"
      title={outlet ? `Edit ${outlet.name}` : 'Add outlet'}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={pending} onClick={() => run(() => saveOutletAction({ ...form, id: outlet?.id }), { onSuccess: onClose })}>
            Save outlet
          </Button>
        </>
      }
    >
      <Field label="Name" required>
        <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Rooftop Café" autoFocus />
      </Field>
      <Field label="Bill prefix" hint="2–5 capital letters. Cannot change once bills are printed." className="mt-4">
        <Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 5) })} placeholder="CAFE" className="font-mono" />
      </Field>
      <Field label="GST on food" className="mt-4">
        <Segmented
          value={String(form.defaultTaxRate)}
          onChange={(v) => setForm({ ...form, defaultTaxRate: Number(v) })}
          options={[
            { value: '5', label: '5%' },
            { value: '12', label: '12%' },
            { value: '18', label: '18%' },
          ]}
        />
      </Field>
    </Dialog>
  );
}
