'use client';

import { useState } from 'react';
import { CheckCircle2, Hammer, Plus, Wrench } from 'lucide-react';
import { cn } from '@/lib/utils';
import { timeAgo } from '@/lib/format';
import { createTicketAction, updateTicketAction } from '@/server/actions/housekeeping';
import { Button } from '@/components/ui/button';
import { Badge, StatusBadge } from '@/components/ui/badge';
import { Dialog } from '@/components/ui/dialog';
import { Field, Input, Segmented, Select, Textarea } from '@/components/ui/fields';
import { useRun } from '@/components/ui/use-run';

interface Ticket {
  id: string;
  title: string;
  description: string | null;
  status: 'open' | 'in_progress' | 'resolved';
  priority: 'low' | 'normal' | 'high';
  createdAt: string;
  roomNumber: string | null;
  reportedBy: string | null;
}

export function TicketList({ tickets }: { tickets: Ticket[] }) {
  const { run, pending } = useRun();
  return (
    <ul className="divide-y divide-ink-100">
      {tickets.map((t) => (
        <li key={t.id} className="flex flex-wrap items-center gap-4 px-5 py-4">
          <span className={cn('grid h-11 w-11 shrink-0 place-items-center rounded-xl', t.priority === 'high' ? 'bg-rose-50 text-rose-600' : 'bg-ink-100 text-ink-500')}>
            <Wrench className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="flex flex-wrap items-center gap-2 font-semibold text-ink-900">
              {t.roomNumber && <span className="num rounded-md bg-ink-900 px-1.5 py-0.5 text-xs font-bold text-white">{t.roomNumber}</span>}
              {t.title}
              {t.priority === 'high' && <Badge tone="danger">High</Badge>}
            </p>
            {t.description && <p className="mt-0.5 text-sm text-ink-600">{t.description}</p>}
            <p className="mt-0.5 text-xs text-ink-400">
              {t.reportedBy ?? 'Staff'} · {timeAgo(t.createdAt)}
            </p>
          </div>
          <StatusBadge status={t.status} />
          {t.status !== 'resolved' && (
            <div className="flex gap-2">
              {t.status === 'open' && (
                <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => updateTicketAction(t.id, 'in_progress'))}>
                  <Hammer className="h-3.5 w-3.5" /> Start
                </Button>
              )}
              <Button size="sm" variant="success" disabled={pending} onClick={() => run(() => updateTicketAction(t.id, 'resolved'))}>
                <CheckCircle2 className="h-3.5 w-3.5" /> Fixed
              </Button>
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}

export function NewTicketButton({ rooms }: { rooms: { id: string; number: string }[] }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ roomId: '', title: '', description: '', priority: 'normal' as 'low' | 'normal' | 'high' });
  const { run, pending } = useRun();
  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" /> New ticket
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Report a problem"
        footer={
          <>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button loading={pending} onClick={() => run(() => createTicketAction({ ...form, roomId: form.roomId || null }), { onSuccess: () => setOpen(false) })}>
              Create ticket
            </Button>
          </>
        }
      >
        <div className="grid gap-4 sm:grid-cols-[140px_1fr]">
          <Field label="Room">
            <Select value={form.roomId} onChange={(e) => setForm({ ...form, roomId: e.target.value })}>
              <option value="">Common area</option>
              {rooms.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.number}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Problem">
            <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Geyser not heating" autoFocus />
          </Field>
        </div>
        <Field label="Details" className="mt-4">
          <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </Field>
        <Field label="Priority" className="mt-4">
          <Segmented
            value={form.priority}
            onChange={(priority) => setForm({ ...form, priority })}
            options={[
              { value: 'low', label: 'Low' },
              { value: 'normal', label: 'Normal' },
              { value: 'high', label: 'High' },
            ]}
          />
        </Field>
      </Dialog>
    </>
  );
}
