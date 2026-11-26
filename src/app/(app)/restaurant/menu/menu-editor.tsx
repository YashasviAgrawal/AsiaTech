'use client';

import { useState } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatINR } from '@/lib/format';
import { removeTableAction, saveCategoryAction, saveMenuItemAction, saveTableAction, toggleAvailabilityAction } from '@/server/actions/pos';
import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { Checkbox, Field, Input, Select, Switch } from '@/components/ui/fields';
import { useRun } from '@/components/ui/use-run';
import { tx } from '@/i18n/tx';

interface Item {
  id: string;
  name: string;
  price: number;
  taxRate: number;
  isVeg: boolean;
  isAvailable: boolean;
  categoryId: string | null;
}

export function MenuEditor({ outletId, categories, items, tables }: { outletId: string; categories: { id: string; name: string }[]; items: Item[]; tables: { id: string; name: string; seats: number }[] }) {
  const [editing, setEditing] = useState<Item | 'new' | null>(null);
  const [category, setCategory] = useState('');
  const [table, setTable] = useState({ name: '', seats: 4 });
  const { run, pending } = useRun();

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
      <Card>
        <CardHeader
          title="Menu"
          description={`${items.length} items in ${categories.length} categories`}
          action={
            <Button size="sm" onClick={() => setEditing('new')}>
              <Plus className="h-3.5 w-3.5" /> {tx('Add item')}
            </Button>
          }
        />
        {categories.map((c) => {
          const list = items.filter((i) => i.categoryId === c.id);
          return (
            <section key={c.id} className="border-b border-ink-100 last:border-0">
              <p className="bg-ink-50/80 px-5 py-2 text-[11px] font-bold tracking-wider text-ink-500 uppercase">{c.name}</p>
              <ul className="divide-y divide-ink-100">
                {list.map((item) => (
                  <li key={item.id} className={cn('flex items-center gap-3 px-5 py-2.5', !item.isAvailable && 'opacity-60')}>
                    <span className={cn('grid h-3.5 w-3.5 place-items-center rounded-[3px] border', item.isVeg ? 'border-emerald-600' : 'border-rose-700')}>
                      <span className={cn('h-1.5 w-1.5 rounded-full', item.isVeg ? 'bg-emerald-600' : 'bg-rose-700')} />
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink-900">{item.name}</span>
                    <span className="text-xs text-ink-400">GST {item.taxRate}%</span>
                    <span className="num w-20 text-right text-sm font-semibold">{formatINR(item.price)}</span>
                    <Switch size="sm" checked={item.isAvailable} onChange={(v) => run(() => toggleAvailabilityAction(item.id, v))} label="Available" />
                    <Button size="icon-sm" variant="ghost" onClick={() => setEditing(item)} aria-label="Edit">
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </Card>

      <div className="space-y-6">
        <Card className="p-5">
          <p className="mb-3 text-sm font-bold text-ink-900">{tx('Categories')}</p>
          <div className="flex gap-2">
            <Input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="e.g. Chinese" />
            <Button loading={pending} onClick={() => run(() => saveCategoryAction(outletId, category), { onSuccess: () => setCategory('') })}>
              Add
            </Button>
          </div>
        </Card>
        <Card className="p-5">
          <p className="mb-3 text-sm font-bold text-ink-900">{tx('Tables')}</p>
          <ul className="mb-3 grid grid-cols-4 gap-2">
            {tables.map((t) => (
              <li key={t.id} className="group relative rounded-lg border border-ink-200 p-2 text-center">
                <p className="text-sm font-bold">{t.name}</p>
                <p className="text-[10px] text-ink-400">{tx(`${t.seats} seats`)}</p>
                <button onClick={() => run(() => removeTableAction(t.id))} className="absolute -top-1.5 -right-1.5 hidden rounded-full bg-white p-0.5 text-rose-500 shadow ring-1 ring-ink-200 group-hover:block" aria-label="Remove table">
                  <Trash2 className="h-3 w-3" />
                </button>
              </li>
            ))}
          </ul>
          <div className="flex gap-2">
            <Input value={table.name} onChange={(e) => setTable({ ...table, name: e.target.value })} placeholder="T9" />
            <Input type="number" min={1} value={table.seats} onChange={(e) => setTable({ ...table, seats: Number(e.target.value) || 1 })} className="w-20" />
            <Button loading={pending} onClick={() => run(() => saveTableAction(outletId, table.name, table.seats), { onSuccess: () => setTable({ name: '', seats: 4 }) })}>
              {tx('Add')}
            </Button>
          </div>
        </Card>
      </div>

      {editing && <ItemDialog outletId={outletId} categories={categories} item={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function ItemDialog({ outletId, categories, item, onClose }: { outletId: string; categories: { id: string; name: string }[]; item: Item | null; onClose: () => void }) {
  const [form, setForm] = useState({ name: item?.name ?? '', price: item?.price ?? 0, taxRate: item?.taxRate ?? 5, isVeg: item?.isVeg ?? true, isAvailable: item?.isAvailable ?? true, categoryId: item?.categoryId ?? categories[0]?.id ?? '' });
  const { run, pending } = useRun();
  return (
    <Dialog
      open
      onClose={onClose}
      title={item ? `Edit ${item.name}` : 'Add menu item'}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={pending} onClick={() => run(() => saveMenuItemAction({ ...form, id: item?.id, outletId }), { onSuccess: onClose })}>
            Save
          </Button>
        </>
      }
    >
      <Field label="Name">
        <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus />
      </Field>
      <div className="mt-4 grid grid-cols-3 gap-3">
        <Field label="Price (₹)">
          <Input type="number" min={0} value={form.price} onChange={(e) => setForm({ ...form, price: Number(e.target.value) || 0 })} />
        </Field>
        <Field label="GST %">
          <Select value={form.taxRate} onChange={(e) => setForm({ ...form, taxRate: Number(e.target.value) })}>
            {[0, 5, 12, 18].map((r) => (
              <option key={r} value={r}>
                {r}%
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Category">
          <Select value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })}>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <div className="mt-4 flex gap-6">
        <Checkbox label="Vegetarian" checked={form.isVeg} onChange={(e) => setForm({ ...form, isVeg: e.target.checked })} />
        <Checkbox label="Available" checked={form.isAvailable} onChange={(e) => setForm({ ...form, isAvailable: e.target.checked })} />
      </div>
    </Dialog>
  );
}
