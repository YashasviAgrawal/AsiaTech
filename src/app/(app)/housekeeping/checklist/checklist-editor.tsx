'use client';

import { useState } from 'react';
import { ArrowRight, GripVertical, Import, Pencil, Plus, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  applyLegacyImportAction,
  deleteChecklistItemAction,
  previewLegacyImportAction,
  reorderChecklistAction,
  saveChecklistItemAction,
} from '@/server/actions/housekeeping';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog } from '@/components/ui/dialog';
import { Checkbox, Field, Input, Select, Textarea } from '@/components/ui/fields';
import { useRun } from '@/components/ui/use-run';
import { useToast } from '@/components/ui/toast';

type Category = 'cleaning' | 'amenities' | 'maintenance';
interface Item {
  id: string;
  name: string;
  nameHi: string | null;
  category: Category;
  roomTypeIds: string[];
  isActive: boolean;
}

const CATEGORIES: { key: Category; label: string; hint: string; tone: string }[] = [
  { key: 'cleaning', label: 'Cleaning', hint: 'सफ़ाई', tone: 'bg-sky-500' },
  { key: 'amenities', label: 'Amenities', hint: 'सामान', tone: 'bg-violet-500' },
  { key: 'maintenance', label: 'Maintenance', hint: 'मरम्मत', tone: 'bg-amber-500' },
];

const LEGACY_SAMPLE = `AC
AC
Ac is not working
Ac is not working
Ac is Working
AC PROBLEM
AC remote
AC Remote
All Mirrors cleaned
Balcony Cleaning
Balcony sliding door
BANQUET CLEAN
BATH MAT
bath soap
bath soap
bath soap`;

export function ChecklistEditor({ items: initial, roomTypes }: { items: Item[]; roomTypes: { id: string; name: string; code: string }[] }) {
  const [items, setItems] = useState(initial);
  const [editing, setEditing] = useState<Item | { category: Category } | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const { run } = useRun();

  const [seen, setSeen] = useState(initial);
  if (seen !== initial) {
    setSeen(initial);
    setItems(initial);
  }

  function onDrop(target: Item) {
    if (!dragId || dragId === target.id) return;
    const dragged = items.find((i) => i.id === dragId);
    if (!dragged) return;
    const without = items.filter((i) => i.id !== dragId);
    const index = without.findIndex((i) => i.id === target.id);
    const next = [...without.slice(0, index), { ...dragged, category: target.category }, ...without.slice(index)];
    setItems(next);
    setDragId(null);
    if (dragged.category !== target.category) void saveChecklistItemAction({ ...dragged, category: target.category });
    void run(() => reorderChecklistAction(next.map((i) => i.id)), { success: 'Order saved', refresh: false });
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-ink-600">
          <strong className="text-ink-900">{items.length}</strong> items · drag <GripVertical className="inline h-3.5 w-3.5" /> to reorder or move between groups. Duplicates are blocked, whatever the capital letters.
        </p>
        <Button variant="outline" onClick={() => setImportOpen(true)}>
          <Import className="h-4 w-4" /> Clean up old AsiaTech list
        </Button>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        {CATEGORIES.map((cat) => {
          const list = items.filter((i) => i.category === cat.key);
          return (
            <Card key={cat.key} className="flex flex-col">
              <div className="flex items-center justify-between border-b border-ink-100 px-4 py-3">
                <p className="flex items-center gap-2 font-bold text-ink-900">
                  <span className={cn('h-2.5 w-2.5 rounded-full', cat.tone)} /> {cat.label} <span className="text-sm font-medium text-ink-400">{cat.hint}</span>
                </p>
                <Badge>{list.length}</Badge>
              </div>
              <ul className="flex-1 space-y-1.5 p-3" onDragOver={(e) => e.preventDefault()}>
                {list.map((item) => (
                  <li
                    key={item.id}
                    draggable
                    onDragStart={() => setDragId(item.id)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => onDrop(item)}
                    className={cn(
                      'group flex items-center gap-2 rounded-lg border border-ink-200 bg-white px-2.5 py-2 transition',
                      dragId === item.id && 'opacity-40',
                      !item.isActive && 'opacity-50',
                    )}
                  >
                    <GripVertical className="h-4 w-4 shrink-0 cursor-grab text-ink-300" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-ink-900">{item.name}</span>
                      <span className="block truncate text-xs text-ink-400">
                        {item.nameHi ?? 'Add Hindi name'} · {item.roomTypeIds.length ? item.roomTypeIds.map((id) => roomTypes.find((t) => t.id === id)?.code).join(', ') : 'All rooms'}
                      </span>
                    </span>
                    <button onClick={() => setEditing(item)} className="rounded p-1 text-ink-300 opacity-0 transition group-hover:opacity-100 hover:bg-ink-100 hover:text-ink-700" aria-label="Edit">
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
              <div className="border-t border-ink-100 p-3">
                <Button variant="ghost" size="sm" className="w-full" onClick={() => setEditing({ category: cat.key })}>
                  <Plus className="h-3.5 w-3.5" /> Add item
                </Button>
              </div>
            </Card>
          );
        })}
      </div>

      {editing && <ItemDialog item={editing} roomTypes={roomTypes} onClose={() => setEditing(null)} />}
      {importOpen && <LegacyImportDialog onClose={() => setImportOpen(false)} />}
    </div>
  );
}

function ItemDialog({ item, roomTypes, onClose }: { item: Item | { category: Category }; roomTypes: { id: string; name: string }[]; onClose: () => void }) {
  const existing = 'id' in item ? item : null;
  const [form, setForm] = useState({
    name: existing?.name ?? '',
    nameHi: existing?.nameHi ?? '',
    category: item.category,
    roomTypeIds: existing?.roomTypeIds ?? [],
    isActive: existing?.isActive ?? true,
  });
  const { run, pending } = useRun();
  return (
    <Dialog
      open
      onClose={onClose}
      title={existing ? `Edit “${existing.name}”` : 'Add checklist item'}
      footer={
        <>
          {existing && (
            <Button variant="ghost" className="mr-auto text-rose-600" onClick={() => run(() => deleteChecklistItemAction(existing.id), { onSuccess: onClose })}>
              <Trash2 className="h-4 w-4" /> Delete
            </Button>
          )}
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={pending} onClick={() => run(() => saveChecklistItemAction({ ...form, id: existing?.id }), { onSuccess: onClose })}>
            Save
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Item (English)" hint="Name the thing, not the result: “AC”, not “AC is working”.">
          <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus />
        </Field>
        <Field label="Item (हिंदी)">
          <Input value={form.nameHi} onChange={(e) => setForm({ ...form, nameHi: e.target.value })} placeholder="एसी" />
        </Field>
      </div>
      <Field label="Group" className="mt-4">
        <Select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value as Category })}>
          {CATEGORIES.map((c) => (
            <option key={c.key} value={c.key}>
              {c.label}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Room types" hint="Leave all unticked to use it in every room." className="mt-4">
        <div className="grid gap-1.5 sm:grid-cols-2">
          {roomTypes.map((t) => (
            <Checkbox
              key={t.id}
              label={t.name}
              checked={form.roomTypeIds.includes(t.id)}
              onChange={(e) => setForm({ ...form, roomTypeIds: e.target.checked ? [...form.roomTypeIds, t.id] : form.roomTypeIds.filter((x) => x !== t.id) })}
            />
          ))}
        </div>
      </Field>
      {existing && <Checkbox className="mt-4" label="Active" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} />}
    </Dialog>
  );
}

function LegacyImportDialog({ onClose }: { onClose: () => void }) {
  const [text, setText] = useState(LEGACY_SAMPLE);
  const [plan, setPlan] = useState<{ name: string; sources: string[]; exists: boolean; category: Category }[] | null>(null);
  const [loading, setLoading] = useState(false);
  const { run, pending } = useRun();
  const toast = useToast();
  const guess = (name: string): Category => (/ac|tv|door|light|switch|geyser|fan|remote|tap|lock/i.test(name) ? 'maintenance' : /soap|mat|towel|water|shampoo|tea|coffee|slipper/i.test(name) ? 'amenities' : 'cleaning');

  async function preview() {
    setLoading(true);
    const result = await previewLegacyImportAction(text);
    setLoading(false);
    if (result.ok) setPlan(result.data.map((p) => ({ ...p, category: guess(p.name) })));
    else toast.error(result.error);
  }

  const toAdd = plan?.filter((p) => !p.exists) ?? [];

  return (
    <Dialog
      open
      onClose={onClose}
      size="lg"
      title="Clean up the old checklist"
      description="Paste the AsiaTech list. Repeats and result words (is working, not working, problem) are merged into one master item."
      footer={
        plan ? (
          <>
            <Button variant="outline" onClick={() => setPlan(null)}>
              Back
            </Button>
            <Button loading={pending} disabled={toAdd.length === 0} onClick={() => run(() => applyLegacyImportAction(toAdd.map((p) => ({ name: p.name, category: p.category }))), { success: (d) => `Added ${d.added} items`, onSuccess: onClose })}>
              Add {toAdd.length} new item{toAdd.length === 1 ? '' : 's'}
            </Button>
          </>
        ) : (
          <>
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button loading={loading} onClick={preview}>
              Preview <ArrowRight className="h-4 w-4" />
            </Button>
          </>
        )
      }
    >
      {!plan ? (
        <Textarea value={text} onChange={(e) => setText(e.target.value)} className="min-h-72 font-mono text-xs" />
      ) : (
        <div>
          <p className="mb-3 text-sm text-ink-600">
            {plan.reduce((t, p) => t + p.sources.length, 0)} lines → <strong className="text-ink-900">{plan.length} master items</strong> ({toAdd.length} new).
          </p>
          <ul className="scrollbar-thin max-h-[50vh] divide-y divide-ink-100 overflow-y-auto rounded-xl border border-ink-200">
            {plan.map((p, i) => (
              <li key={p.name} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-ink-900">
                    {p.name} {p.exists && <Badge tone="success" className="ml-1">Already on list</Badge>}
                  </span>
                  <span className="block truncate text-xs text-ink-400">← {p.sources.join(' · ')}</span>
                </span>
                {!p.exists && (
                  <Select value={p.category} onChange={(e) => setPlan(plan.map((x, j) => (j === i ? { ...x, category: e.target.value as Category } : x)))} className="h-8 w-36 py-1 text-xs">
                    {CATEGORIES.map((c) => (
                      <option key={c.key} value={c.key}>
                        {c.label}
                      </option>
                    ))}
                  </Select>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </Dialog>
  );
}
