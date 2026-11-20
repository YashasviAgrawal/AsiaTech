'use client';

import { useMemo, useState } from 'react';
import { CheckCheck, Mail, MessageCircle, Search, Send, Smartphone, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatDateTime, titleCase } from '@/lib/format';
import { sendCustomMessageAction } from '@/server/actions/messages';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input, Textarea } from '@/components/ui/fields';
import { useRun } from '@/components/ui/use-run';

interface Msg {
  id: string;
  channel: 'whatsapp' | 'sms' | 'email';
  recipient: string;
  template: string | null;
  body: string;
  status: string;
  createdAt: string;
  sentBy: string | null;
  error: string | null;
}

const CHANNEL_ICON = { whatsapp: MessageCircle, sms: Smartphone, email: Mail };

export function MessagesCentre({ rows, stats, hotelName }: { rows: Msg[]; stats: { total: number; today: number; failed: number }; hotelName: string }) {
  const [selected, setSelected] = useState<Msg | null>(rows[0] ?? null);
  const [q, setQ] = useState('');
  const [to, setTo] = useState('');
  const [body, setBody] = useState(`Namaste 🙏\nThis is ${hotelName}. `);
  const { run, pending } = useRun();
  const list = useMemo(() => rows.filter((r) => !q || r.recipient.includes(q) || r.body.toLowerCase().includes(q.toLowerCase())), [rows, q]);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Messages sent', value: stats.total },
          { label: 'Today', value: stats.today },
          { label: 'Failed', value: stats.failed },
        ].map((s) => (
          <div key={s.label} className="rounded-xl border border-ink-200 bg-white p-4 shadow-card">
            <p className="text-[11px] font-medium tracking-wide text-ink-400 uppercase">{s.label}</p>
            <p className="num mt-1 text-2xl font-bold text-ink-900">{s.value}</p>
          </div>
        ))}
      </div>
      <div className="grid gap-5 xl:grid-cols-[360px_minmax(0,1fr)_340px]">
        <Card className="flex max-h-[640px] flex-col overflow-hidden">
          <div className="border-b border-ink-100 p-3">
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search number or text" leading={<Search className="h-4 w-4" />} className="h-9" />
          </div>
          <ul className="scrollbar-thin flex-1 divide-y divide-ink-100 overflow-y-auto">
            {list.map((m) => {
              const Icon = CHANNEL_ICON[m.channel];
              return (
                <li key={m.id}>
                  <button onClick={() => setSelected(m)} className={cn('flex w-full items-start gap-3 px-4 py-3 text-left transition', selected?.id === m.id ? 'bg-brand-50/60' : 'hover:bg-ink-50')}>
                    <span className={cn('mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full', m.channel === 'whatsapp' ? 'bg-emerald-50 text-emerald-600' : 'bg-sky-50 text-sky-600')}>
                      <Icon className="h-4 w-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center justify-between gap-2">
                        <span className="num truncate text-sm font-semibold text-ink-900">{m.channel === 'email' ? m.recipient : `+91 ${m.recipient}`}</span>
                        {m.status === 'failed' ? <XCircle className="h-3.5 w-3.5 text-rose-500" /> : <CheckCheck className="h-3.5 w-3.5 text-sky-500" />}
                      </span>
                      <span className="block truncate text-xs text-ink-500">{m.body.split('\n').filter(Boolean)[1] ?? m.body}</span>
                      <span className="text-[10px] text-ink-400">{formatDateTime(m.createdAt)}</span>
                    </span>
                  </button>
                </li>
              );
            })}
            {list.length === 0 && <li className="p-6 text-center text-sm text-ink-500">No messages yet.</li>}
          </ul>
        </Card>

        {/* Phone-style preview */}
        <Card className="overflow-hidden">
          {selected ? (
            <div className="flex h-full flex-col">
              <div className="flex items-center gap-2 border-b border-ink-100 px-5 py-3">
                <Badge tone={selected.channel === 'whatsapp' ? 'success' : 'info'}>{titleCase(selected.channel)}</Badge>
                {selected.template && <Badge>{titleCase(selected.template)}</Badge>}
                <span className="ml-auto text-xs text-ink-400">{selected.sentBy ?? 'System'}</span>
              </div>
              <div className="flex-1 bg-[#efeae2] bg-[radial-gradient(#d9d2c5_1px,transparent_1px)] [background-size:16px_16px] p-6">
                <div className="ml-auto max-w-md rounded-2xl rounded-tr-sm bg-[#d9fdd3] p-3.5 text-sm whitespace-pre-wrap text-ink-900 shadow-sm">
                  {selected.body}
                  <p className="mt-1 flex items-center justify-end gap-1 text-[10px] text-ink-500">
                    {formatDateTime(selected.createdAt).split(', ')[1]} <CheckCheck className="h-3 w-3 text-sky-500" />
                  </p>
                </div>
                {selected.error && <p className="mt-3 text-xs font-medium text-rose-700">Not sent: {selected.error}</p>}
              </div>
            </div>
          ) : (
            <p className="p-10 text-center text-sm text-ink-500">Select a message</p>
          )}
        </Card>

        <Card className="h-fit p-5">
          <p className="mb-3 flex items-center gap-2 font-bold text-ink-900">
            <Send className="h-4 w-4 text-brand-600" /> New WhatsApp message
          </p>
          <Input value={to} onChange={(e) => setTo(e.target.value.replace(/\D/g, '').slice(-10))} placeholder="Mobile number" inputMode="tel" leading={<span className="text-xs font-semibold">+91</span>} className="pl-11" />
          <Textarea value={body} onChange={(e) => setBody(e.target.value)} className="mt-3 min-h-36" />
          <div className="mt-3 flex gap-2">
            <Button className="flex-1" loading={pending} disabled={to.length !== 10 || body.trim().length < 5} onClick={() => run(() => sendCustomMessageAction(to, body), { success: 'Message sent' })}>
              Send
            </Button>
            <a href={`https://wa.me/91${to}?text=${encodeURIComponent(body)}`} target="_blank" rel="noreferrer" className={cn('inline-flex h-10 items-center rounded-lg px-3 text-sm font-medium ring-1 ring-ink-300 hover:bg-ink-50', to.length !== 10 && 'pointer-events-none opacity-50')}>
              Open in WhatsApp
            </a>
          </div>
        </Card>
      </div>
    </div>
  );
}
