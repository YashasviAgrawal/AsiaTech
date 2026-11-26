'use client';

import { useState } from 'react';
import Link from 'next/link';
import { CheckCircle2, Copy, ExternalLink, Link2, MessageCircle, Send, Smartphone, XCircle } from 'lucide-react';
import { formatDateTime, formatINR } from '@/lib/format';
import { cancelRequestAction, markRequestPaidAction, requestMoneyAction } from '@/server/actions/money';
import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { StatusBadge } from '@/components/ui/badge';
import { Field, Input, Segmented, Select } from '@/components/ui/fields';
import { useRun } from '@/components/ui/use-run';
import { useToast } from '@/components/ui/toast';
import { tx } from '@/i18n/tx';

interface Req {
  id: string;
  amount: number;
  purpose: string | null;
  status: string;
  linkId: string | null;
  linkUrl: string | null;
  linkExpiresAt: string | null;
  payerName: string | null;
  payerMobile: string | null;
  createdAt: string;
  paidAt: string | null;
  bookingId: string | null;
  bookingNo: string | null;
}

export function RequestMoney({ prefill, requests }: { prefill: { bookingId: string; bookingNo: string; name: string; mobile: string; email: string; amount: number } | null; requests: Req[] }) {
  const [form, setForm] = useState({
    name: prefill?.name ?? '',
    mobile: prefill?.mobile ?? '',
    email: prefill?.email ?? '',
    amount: prefill?.amount ?? 0,
    purpose: prefill ? `Balance for booking ${prefill.bookingNo}` : '',
    channel: 'whatsapp' as 'whatsapp' | 'sms' | 'none',
    expiresInHours: 48,
  });
  const [last, setLast] = useState<string | null>(null);
  const { run, pending } = useRun();
  const toast = useToast();

  return (
    <div className="grid gap-6 xl:grid-cols-[420px_minmax(0,1fr)]">
      <Card className="h-fit overflow-hidden">
        <div className="bg-gradient-to-br from-brand-600 to-brand-800 p-5 text-white">
          <p className="text-sm font-medium text-brand-100">{prefill ? <>{tx('Booking')} {prefill.bookingNo}</> : tx('New payment request')}</p>
          <p className="num mt-1 text-4xl font-extrabold tracking-tight">{formatINR(form.amount || 0)}</p>
          <p className="mt-1 text-xs text-brand-100">{tx('UPI, cards and net banking')}</p>
        </div>
        <div className="space-y-4 p-5">
          <Field label="Amount">
            <Input type="number" min={1} value={form.amount || ''} onChange={(e) => setForm({ ...form, amount: Number(e.target.value) || 0 })} leading={<span className="text-sm">₹</span>} className="num text-lg font-semibold" />
          </Field>
          <Field label="For">
            <Input value={form.purpose} onChange={(e) => setForm({ ...form, purpose: e.target.value })} placeholder="Advance for 24–26 Dec stay" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Guest name">
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </Field>
            <Field label="Mobile">
              <Input value={form.mobile} onChange={(e) => setForm({ ...form, mobile: e.target.value.replace(/\D/g, '').slice(-10) })} inputMode="tel" placeholder="9829012345" />
            </Field>
          </div>
          <Field label="Send by">
            <Segmented
              value={form.channel}
              onChange={(channel) => setForm({ ...form, channel })}
              options={[
                { value: 'whatsapp', label: 'WhatsApp' },
                { value: 'sms', label: 'SMS' },
                { value: 'none', label: 'Just the link' },
              ]}
            />
          </Field>
          <Field label="Link valid for">
            <Select value={form.expiresInHours} onChange={(e) => setForm({ ...form, expiresInHours: Number(e.target.value) })}>
              <option value={6}>6 hours</option>
              <option value={24}>1 day</option>
              <option value={48}>2 days</option>
              <option value={168}>7 days</option>
            </Select>
          </Field>
          <Button
            size="lg"
            className="w-full"
            loading={pending}
            onClick={() =>
              run(() => requestMoneyAction({ ...form, bookingId: prefill?.bookingId ?? null, mobile: form.mobile || null, email: form.email || null }), {
                success: form.channel === 'none' ? 'Payment link created' : `Link sent on ${form.channel === 'whatsapp' ? 'WhatsApp' : 'SMS'}`,
                onSuccess: (d) => setLast(d.url),
              })
            }
          >
            {form.channel === 'whatsapp' ? <MessageCircle className="h-4 w-4" /> : form.channel === 'sms' ? <Smartphone className="h-4 w-4" /> : <Link2 className="h-4 w-4" />}
            {form.channel === 'none' ? 'Create link' : 'Send payment link'}
          </Button>
          {last && (
            <div className="flex items-center gap-2 rounded-xl bg-emerald-50 p-3 text-sm ring-1 ring-emerald-200">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
              <span className="min-w-0 flex-1 truncate font-mono text-xs text-emerald-900">{last}</span>
              <button onClick={() => (navigator.clipboard.writeText(last), toast.success('Link copied'))} className="text-emerald-700" aria-label="Copy link">
                <Copy className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
      </Card>

      <Card>
        <CardHeader icon={<Send className="h-4 w-4" />} title="Recent requests" description="Paid links are added to the guest's bill automatically" />
        <ul className="divide-y divide-ink-100">
          {requests.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-4 px-5 py-3.5">
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-ink-900">
                  {r.payerName} <span className="num ml-1 text-ink-900">{formatINR(r.amount)}</span>
                </p>
                <p className="text-xs text-ink-500">
                  {r.purpose}
                  {r.bookingNo && (
                    <>
                      {' · '}
                      <Link href={`/front-desk/bookings/${r.bookingId}`} className="font-mono text-brand-600 hover:underline">
                        {r.bookingNo}
                      </Link>
                    </>
                  )}
                </p>
                <p className="text-[11px] text-ink-400">
                  {tx(`Sent ${formatDateTime(r.createdAt)}`)}
                  {r.status === 'success' && r.paidAt ? <> · {tx(`paid ${formatDateTime(r.paidAt)}`)}</> : r.linkExpiresAt ? <> · {tx(`expires ${formatDateTime(r.linkExpiresAt)}`)}</> : null}
                </p>
              </div>
              <StatusBadge status={r.status} label={r.status === 'success' ? 'Paid' : undefined} />
              {r.status === 'pending' && r.linkId && (
                <div className="flex gap-1.5">
                  {r.linkUrl && (
                    <a href={r.linkUrl} target="_blank" rel="noreferrer" className="grid h-8 w-8 place-items-center rounded-lg text-ink-500 ring-1 ring-ink-200 hover:bg-ink-50" title="Open payment page">
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  )}
                  <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => markRequestPaidAction(r.linkId!, ''))}>
                    Mark paid
                  </Button>
                  <Button size="icon-sm" variant="ghost" disabled={pending} onClick={() => run(() => cancelRequestAction(r.id))} aria-label="Cancel link">
                    <XCircle className="h-4 w-4 text-ink-400" />
                  </Button>
                </div>
              )}
            </li>
          ))}
          {requests.length === 0 && <li className="px-5 py-10 text-center text-sm text-ink-500">{tx('No payment requests yet.')}</li>}
        </ul>
      </Card>
    </div>
  );
}
