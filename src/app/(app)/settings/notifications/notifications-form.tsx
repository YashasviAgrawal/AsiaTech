'use client';

import { useState } from 'react';
import { BellRing, Mail, Plus, TrendingDown, X } from 'lucide-react';
import { saveNotificationsAction } from '@/server/actions/settings';
import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { Input, Select, Switch } from '@/components/ui/fields';
import { useRun } from '@/components/ui/use-run';

export function NotificationsForm({ initial }: { initial: { zeroBookingsAlert: boolean; zeroBookingsMonths: number; dailySummary: boolean; emails: string[] } }) {
  const [form, setForm] = useState(initial);
  const [email, setEmail] = useState('');
  const { run, pending } = useRun();
  return (
    <div className="grid max-w-4xl gap-6">
      <Card>
        <CardHeader icon={<BellRing className="h-4 w-4" />} title="Email alerts" />
        <ul className="divide-y divide-ink-100">
          <li className="flex items-start gap-4 p-5">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-amber-50 text-amber-600">
              <TrendingDown className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-ink-900">Zero-bookings alert</p>
              <p className="text-sm text-ink-500">
                Receive an email if the property gets no bookings for the past{' '}
                <Select value={form.zeroBookingsMonths} onChange={(e) => setForm({ ...form, zeroBookingsMonths: Number(e.target.value) })} className="inline-block h-8 w-auto py-0.5 text-sm">
                  {[1, 2, 3, 6].map((m) => (
                    <option key={m} value={m}>
                      {m} month{m > 1 ? 's' : ''}
                    </option>
                  ))}
                </Select>
                . Checked monthly.
              </p>
            </div>
            <Switch checked={form.zeroBookingsAlert} onChange={(zeroBookingsAlert) => setForm({ ...form, zeroBookingsAlert })} label="Zero-bookings alert" />
          </li>
          <li className="flex items-start gap-4 p-5">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-sky-50 text-sky-600">
              <Mail className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-ink-900">Daily summary (Night Audit report)</p>
              <p className="text-sm text-ink-500">Occupancy, ADR, revenue and cash after every Night Audit.</p>
            </div>
            <Switch checked={form.dailySummary} onChange={(dailySummary) => setForm({ ...form, dailySummary })} label="Daily summary" />
          </li>
        </ul>
      </Card>
      <Card>
        <CardHeader icon={<Mail className="h-4 w-4" />} title="Send alerts to" />
        <div className="p-5">
          <ul className="flex flex-wrap gap-2">
            {form.emails.map((e) => (
              <li key={e} className="flex items-center gap-1.5 rounded-full bg-ink-100 py-1 pr-1.5 pl-3 text-sm text-ink-800">
                {e}
                <button onClick={() => setForm({ ...form, emails: form.emails.filter((x) => x !== e) })} className="rounded-full p-0.5 hover:bg-ink-200" aria-label={`Remove ${e}`}>
                  <X className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
          <div className="mt-3 flex max-w-md gap-2">
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="owner@hotel.com" />
            <Button
              variant="outline"
              onClick={() => {
                if (email && !form.emails.includes(email)) setForm({ ...form, emails: [...form.emails, email.trim()] });
                setEmail('');
              }}
            >
              <Plus className="h-4 w-4" /> Add
            </Button>
          </div>
        </div>
      </Card>
      <div className="flex justify-end">
        <Button size="lg" loading={pending} onClick={() => run(() => saveNotificationsAction(form))}>
          Save notifications
        </Button>
      </div>
    </div>
  );
}
