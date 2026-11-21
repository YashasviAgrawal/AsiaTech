'use client';

import { useState } from 'react';
import { Building2, Eye, EyeOff, Megaphone, Pencil, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatDay, timeAgo } from '@/lib/format';
import { saveSystemUpdateAction, setOrganizationAction } from '@/server/actions/admin';
import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { Badge, StatusBadge } from '@/components/ui/badge';
import { ConfirmDialog, Dialog } from '@/components/ui/dialog';
import { Checkbox, Field, Input, Select, Textarea } from '@/components/ui/fields';
import { Tabs } from '@/components/ui/tabs';
import { useRun } from '@/components/ui/use-run';

type Hotel = { id: string; name: string; city: string | null; status: string; businessDate: string; rooms: number; staff: number; bookings30: number; lastLogin: string | null };
type Org = { id: string; name: string; plan: 'trial' | 'starter' | 'pro' | 'enterprise'; isActive: boolean; createdAt: string; hotels: Hotel[] };
type Update = { id: string; title: string; body: string; tag: string | null; isPublished: boolean; publishedAt: string };

export function AdminConsole({ orgs, updates }: { orgs: Org[]; updates: Update[] }) {
  const [tab, setTab] = useState<'orgs' | 'updates'>('orgs');
  return (
    <div className="space-y-5">
      <Tabs
        value={tab}
        onChange={(v) => setTab(v as typeof tab)}
        items={[
          { value: 'orgs', label: 'Organisations', count: orgs.length },
          { value: 'updates', label: 'System updates', count: updates.length },
        ]}
      />
      {tab === 'orgs' ? <Organisations orgs={orgs} /> : <Updates updates={updates} />}
    </div>
  );
}

function Organisations({ orgs }: { orgs: Org[] }) {
  const { run, pending } = useRun();
  const [suspend, setSuspend] = useState<Org | null>(null);
  const hotels = orgs.flatMap((o) => o.hotels);
  return (
    <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          ['Organisations', orgs.length],
          ['Hotels', hotels.length],
          ['Rooms', hotels.reduce((t, h) => t + h.rooms, 0)],
          ['Bookings (30 days)', hotels.reduce((t, h) => t + h.bookings30, 0)],
        ].map(([label, value]) => (
          <div key={label} className="card p-4">
            <p className="text-xs text-ink-500">{label}</p>
            <p className="num mt-1 text-2xl font-extrabold text-ink-900">{value}</p>
          </div>
        ))}
      </div>
      {orgs.map((org) => (
        <Card key={org.id} className={cn(!org.isActive && 'opacity-75')}>
          <CardHeader
            icon={<Building2 className="h-4 w-4" />}
            title={
              <span className="flex items-center gap-2">
                {org.name}
                {!org.isActive && <Badge tone="danger">Suspended</Badge>}
              </span>
            }
            description={`Customer since ${formatDay(org.createdAt.slice(0, 10))} · ${org.hotels.length} hotel${org.hotels.length === 1 ? '' : 's'}`}
            action={
              <div className="flex items-center gap-2">
                <Select value={org.plan} onChange={(e) => run(() => setOrganizationAction({ id: org.id, plan: e.target.value as Org['plan'] }))} className="h-8 w-auto py-1 text-xs" aria-label={`Plan for ${org.name}`} disabled={pending}>
                  {['trial', 'starter', 'pro', 'enterprise'].map((p) => (
                    <option key={p} value={p}>
                      {p[0].toUpperCase() + p.slice(1)}
                    </option>
                  ))}
                </Select>
                {org.isActive ? (
                  <Button size="sm" variant="ghost" onClick={() => setSuspend(org)}>
                    Suspend
                  </Button>
                ) : (
                  <Button size="sm" variant="soft" loading={pending} onClick={() => run(() => setOrganizationAction({ id: org.id, isActive: true }))}>
                    Re-activate
                  </Button>
                )}
              </div>
            }
          />
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="border-b border-ink-100 bg-ink-50/60 text-left text-[11px] tracking-wide text-ink-500 uppercase">
                <tr>
                  <th className="px-5 py-2">Hotel</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2 text-right">Rooms</th>
                  <th className="px-3 py-2 text-right">Staff</th>
                  <th className="px-3 py-2 text-right">Bookings (30 d)</th>
                  <th className="px-3 py-2">Business date</th>
                  <th className="px-5 py-2">Last sign-in</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {org.hotels.map((h) => (
                  <tr key={h.id}>
                    <td className="px-5 py-2.5">
                      <p className="font-semibold text-ink-900">{h.name}</p>
                      <p className="text-xs text-ink-500">{h.city ?? '—'}</p>
                    </td>
                    <td className="px-3 py-2.5">
                      <StatusBadge status={h.status} />
                    </td>
                    <td className="num px-3 py-2.5 text-right">{h.rooms}</td>
                    <td className="num px-3 py-2.5 text-right">{h.staff}</td>
                    <td className="num px-3 py-2.5 text-right">{h.bookings30}</td>
                    <td className="num px-3 py-2.5">{formatDay(h.businessDate)}</td>
                    <td className="px-5 py-2.5 text-xs text-ink-500">{h.lastLogin ? timeAgo(h.lastLogin) : 'Never'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ))}
      <ConfirmDialog
        open={Boolean(suspend)}
        onClose={() => setSuspend(null)}
        title={`Suspend ${suspend?.name}?`}
        description="Its staff can no longer sign in to its hotels. Bookings, OTA connections and data are kept, and you can re-activate it any time."
        confirmLabel="Suspend"
        variant="danger"
        loading={pending}
        onConfirm={async () => {
          if (!suspend) return;
          const r = await run(() => setOrganizationAction({ id: suspend.id, isActive: false }));
          if (r.ok) setSuspend(null);
        }}
      />
    </>
  );
}

function Updates({ updates }: { updates: Update[] }) {
  const [editing, setEditing] = useState<Update | 'new' | null>(null);
  const { run } = useRun();
  return (
    <Card>
      <CardHeader
        icon={<Megaphone className="h-4 w-4" />}
        title="System updates"
        description="Shown on every hotel's dashboard, newest first. Hidden ones stay here as drafts."
        action={
          <Button size="sm" onClick={() => setEditing('new')}>
            <Plus className="h-4 w-4" /> New update
          </Button>
        }
      />
      <ul className="divide-y divide-ink-100">
        {updates.map((u) => (
          <li key={u.id} className={cn('flex items-start gap-3 px-5 py-3.5', !u.isPublished && 'bg-ink-50/60')}>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                {u.tag && <Badge tone="brand">{u.tag}</Badge>}
                {!u.isPublished && <Badge tone="neutral">Hidden</Badge>}
                <span className="text-[11px] text-ink-400">{timeAgo(u.publishedAt)}</span>
              </div>
              <p className="mt-1 text-sm font-semibold text-ink-900">{u.title}</p>
              <p className="mt-0.5 text-xs leading-relaxed text-ink-500">{u.body}</p>
            </div>
            <button
              type="button"
              onClick={() => run(() => saveSystemUpdateAction({ ...u, isPublished: !u.isPublished }), { success: u.isPublished ? 'Hidden from dashboards' : 'Published' })}
              className="grid h-8 w-8 place-items-center rounded-lg text-ink-400 hover:bg-ink-100 hover:text-ink-700"
              aria-label={u.isPublished ? `Hide ${u.title}` : `Publish ${u.title}`}
              title={u.isPublished ? 'Hide' : 'Publish'}
            >
              {u.isPublished ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
            <button type="button" onClick={() => setEditing(u)} className="grid h-8 w-8 place-items-center rounded-lg text-ink-400 hover:bg-ink-100 hover:text-ink-700" aria-label={`Edit ${u.title}`}>
              <Pencil className="h-4 w-4" />
            </button>
          </li>
        ))}
      </ul>
      {editing && <UpdateDialog update={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </Card>
  );
}

function UpdateDialog({ update, onClose }: { update: Update | null; onClose: () => void }) {
  const [form, setForm] = useState({ title: update?.title ?? '', body: update?.body ?? '', tag: update?.tag ?? 'New', isPublished: update?.isPublished ?? true });
  const { run, pending } = useRun();
  return (
    <Dialog
      open
      onClose={onClose}
      title={update ? 'Edit system update' : 'New system update'}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={pending} onClick={() => run(() => saveSystemUpdateAction({ ...form, id: update?.id }), { onSuccess: onClose })}>
            {form.isPublished ? 'Publish' : 'Save as hidden'}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-[1fr_120px]">
        <Field label="Title" required>
          <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Owner summary on your phone" autoFocus />
        </Field>
        <Field label="Tag">
          <Input value={form.tag} onChange={(e) => setForm({ ...form, tag: e.target.value })} placeholder="New" />
        </Field>
      </div>
      <Field label="What changed" hint={`${form.body.length}/600 · one or two short sentences`} className="mt-4">
        <Textarea value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value.slice(0, 600) })} placeholder="Open the account menu → Owner view to see today's earnings, occupancy and money owed on your phone." />
      </Field>
      <Checkbox className="mt-4" label="Show on every hotel's dashboard now" checked={form.isPublished} onChange={(e) => setForm({ ...form, isPublished: e.target.checked })} />
    </Dialog>
  );
}
