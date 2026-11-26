'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertOctagon, ArrowRight, CheckCircle2, Link2, Loader2, Map, PlugZap, RefreshCw, Send, Unplug, Wrench } from 'lucide-react';
import { cn } from '@/lib/utils';
import { OTA_LABELS, timeAgo } from '@/lib/format';
import { connectChannelAction, disconnectChannelAction, fixListingAction, getMappingsAction, processQueueAction, saveMappingsAction, simulateOtaBookingAction } from '@/server/actions/channels';
import { Button } from '@/components/ui/button';
import { Badge, StatusBadge } from '@/components/ui/badge';
import { Dialog } from '@/components/ui/dialog';
import { Field, Input } from '@/components/ui/fields';
import { useRun } from '@/components/ui/use-run';
import { useToast } from '@/components/ui/toast';
import { tx } from '@/i18n/tx';
import { useTr } from '@/i18n/client';

interface Channel {
  id: string;
  ota: keyof typeof OTA_LABELS;
  hotelCode: string | null;
  status: 'disconnected' | 'pending' | 'connected' | 'error';
  listingStatus: string;
  listingMessage: string | null;
  commissionPercent: number;
  lastSyncAt: string | null;
  hasToken: boolean;
  mapped: number;
  failed24h: number;
  queued: number;
  bookings30d: number;
}

const OTA_STYLE: Record<string, { bg: string; text: string; letter: string }> = {
  makemytrip: { bg: 'bg-[#e8f1fd]', text: 'text-[#0b5cd5]', letter: 'MMT' },
  goibibo: { bg: 'bg-[#fff1e6]', text: 'text-[#ec5b24]', letter: 'go' },
  booking_com: { bg: 'bg-[#e6eef9]', text: 'text-[#003580]', letter: 'B.' },
  agoda: { bg: 'bg-[#fdeaf1]', text: 'text-[#d6336c]', letter: 'ag' },
  expedia: { bg: 'bg-[#fff8db]', text: 'text-[#1a2b49]', letter: 'Ex' },
  airbnb: { bg: 'bg-[#ffecee]', text: 'text-[#ff385c]', letter: 'ab' },
  cleartrip: { bg: 'bg-[#fff0e6]', text: 'text-[#e8590c]', letter: 'ct' },
  easemytrip: { bg: 'bg-[#e7f5ff]', text: 'text-[#1971c2]', letter: 'EMT' },
};

export function ChannelManager({ channels, focus }: { channels: Channel[]; focus: string | null }) {
  const [connecting, setConnecting] = useState<Channel | null>(null);
  const [mapping, setMapping] = useState<Channel | null>(null);
  const { run, pending } = useRun();
  const tr = useTr();
  const queued = channels.reduce((t, c) => t + c.queued, 0);
  const problems = channels.filter((c) => c.status === 'connected' && ['parked_business', 'closed', 'suspended'].includes(c.listingStatus));

  return (
    <div className="space-y-5">
      {problems.map((c) => (
        <div key={c.id} className={cn('flex flex-wrap items-center gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4', focus === c.id && 'ring-4 ring-rose-100')}>
          <AlertOctagon className="h-5 w-5 text-rose-600" />
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-rose-900">
              {tr(`Property not bookable on ${OTA_LABELS[c.ota]}. Reason: ${c.listingStatus === 'parked_business' ? 'Parked business' : c.listingStatus}`)}
            </p>
            <p className="text-sm text-rose-800">
              {tr(c.listingMessage ?? 'Fix it in the OTA extranet, then re-check here.')} {tr('Updates to this OTA are paused and will be re-sent once it is open.')}
            </p>
          </div>
          <Button variant="danger" loading={pending} onClick={() => run(() => fixListingAction(c.id), { success: (d) => (d.status === 'open' ? 'Listing is open again. Updates re-sent.' : `Still ${d.status}`) })}>
            <Wrench className="h-4 w-4" /> {tx('Fix listing')}
          </Button>
        </div>
      ))}

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-ink-200 bg-white px-4 py-3 shadow-card">
        <p className="flex items-center gap-2 text-sm text-ink-600">
          {queued > 0 ? <Loader2 className="h-4 w-4 animate-spin text-brand-600" /> : <CheckCircle2 className="h-4 w-4 text-emerald-600" />}
          {tr(queued > 0 ? `${queued} update(s) waiting to be sent` : 'All updates sent')}
          <Link href="/channels/sync-log" className="ml-2 font-semibold text-brand-600 hover:text-brand-700">
            {tx('Sync log →')}
          </Link>
        </p>
        <Button size="sm" variant="outline" loading={pending} onClick={() => run(() => processQueueAction(), { success: (d) => `${d.ok} sent, ${d.failed} failed` })}>
          <RefreshCw className="h-3.5 w-3.5" /> {tx('Send now')}
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
        {channels.map((c) => {
          const style = OTA_STYLE[c.ota];
          const connected = c.status === 'connected';
          return (
            <div key={c.id} className={cn('card flex flex-col p-5 transition', focus === c.id && 'ring-2 ring-brand-500')}>
              <div className="flex items-start gap-3">
                <span className={cn('grid h-12 w-12 shrink-0 place-items-center rounded-xl text-sm font-black', style.bg, style.text)}>{style.letter}</span>
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-ink-900">{OTA_LABELS[c.ota]}</p>
                  <p className="text-xs text-ink-500">{c.hotelCode ? `${tr('Hotel code')} ${c.hotelCode}` : tr('Not connected yet')}</p>
                </div>
                <StatusBadge status={c.status} />
              </div>
              {connected ? (
                <>
                  <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
                    <div className="rounded-lg bg-ink-50 py-2">
                      <dd className="num text-lg font-bold text-ink-900">{c.bookings30d}</dd>
                      <dt className="text-[10px] text-ink-500">{tr('bookings / 30d')}</dt>
                    </div>
                    <div className="rounded-lg bg-ink-50 py-2">
                      <dd className="num text-lg font-bold text-ink-900">{c.mapped}</dd>
                      <dt className="text-[10px] text-ink-500">{tr('rates mapped')}</dt>
                    </div>
                    <div className={cn('rounded-lg py-2', c.failed24h ? 'bg-rose-50' : 'bg-ink-50')}>
                      <dd className={cn('num text-lg font-bold', c.failed24h ? 'text-rose-600' : 'text-ink-900')}>{c.failed24h}</dd>
                      <dt className="text-[10px] text-ink-500">{tr('failed / 24h')}</dt>
                    </div>
                  </dl>
                  <div className="mt-3 flex items-center justify-between text-xs text-ink-500">
                    <span>
                      {tr('Listing:')}{' '}
                      <Badge tone={c.listingStatus === 'open' ? 'success' : c.listingStatus === 'unknown' ? 'neutral' : 'danger'} dot>
                        {c.listingStatus === 'parked_business' ? 'Parked business' : c.listingStatus}
                      </Badge>
                    </span>
                    <span>{tr(c.lastSyncAt ? `Synced ${timeAgo(c.lastSyncAt)}` : 'Never synced')}</span>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2 border-t border-ink-100 pt-4">
                    <Button size="sm" variant="outline" onClick={() => setMapping(c)}>
                      <Map className="h-3.5 w-3.5" /> {tr('Mapping')}
                    </Button>
                    <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => simulateOtaBookingAction(c.ota as Parameters<typeof simulateOtaBookingAction>[0]), { success: (d) => ('bookingNo' in d && d.bookingNo ? `Test booking ${d.bookingNo} received` : 'Received') })} title={tr('Send a test booking through the webhook')}>
                      <Send className="h-3.5 w-3.5" /> {tx('Test booking')}
                    </Button>
                    <Button size="sm" variant="ghost" className="ml-auto text-ink-500" disabled={pending} onClick={() => run(() => disconnectChannelAction(c.id))}>
                      <Unplug className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </>
              ) : (
                <div className="mt-4 flex flex-1 flex-col justify-end">
                  <p className="mb-3 text-xs text-ink-500">{tr(c.ota === 'makemytrip' || c.ota === 'goibibo' ? 'Select AsiaTech as your channel manager in the InGo-MMT extranet, then paste the hotel code and access token.' : 'Connected through the Channex channel API.')}</p>
                  <Button variant="soft" onClick={() => setConnecting(c)}>
                    <PlugZap className="h-4 w-4" /> {tr('Connect')}
                  </Button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {connecting && <ConnectDialog channel={connecting} onClose={() => setConnecting(null)} />}
      {mapping && <MappingDialog channel={mapping} onClose={() => setMapping(null)} />}
    </div>
  );
}

function ConnectDialog({ channel, onClose }: { channel: Channel; onClose: () => void }) {
  const [form, setForm] = useState({ hotelCode: channel.hotelCode ?? '', token: '', commissionPercent: channel.commissionPercent || 18 });
  const { run, pending } = useRun();
  return (
    <Dialog
      open
      onClose={onClose}
      title={`Connect ${OTA_LABELS[channel.ota]}`}
      description="Room types are mapped automatically; you can adjust the mapping afterwards."
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={pending} onClick={() => run(() => connectChannelAction({ ota: channel.ota as 'makemytrip', ...form }), { onSuccess: onClose })}>
            <Link2 className="h-4 w-4" /> Connect
          </Button>
        </>
      }
    >
      <ol className="mb-4 space-y-1.5 rounded-xl bg-ink-50 p-4 text-sm text-ink-700">
        <li>{tx(`1. Open the ${OTA_LABELS[channel.ota]} extranet.`)}</li>
        <li>{tx('2. Choose AsiaTech as the channel manager.')}</li>
        <li>{tx('3. Copy the hotel code and access token here.')}</li>
      </ol>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Hotel code">
          <Input value={form.hotelCode} onChange={(e) => setForm({ ...form, hotelCode: e.target.value })} />
        </Field>
        <Field label="Commission %">
          <Input type="number" value={form.commissionPercent} onChange={(e) => setForm({ ...form, commissionPercent: Number(e.target.value) || 0 })} />
        </Field>
      </div>
      <Field label="Access token / API key" className="mt-4" hint="Stored encrypted in production. Never share it on WhatsApp.">
        <Input type="password" value={form.token} onChange={(e) => setForm({ ...form, token: e.target.value })} autoComplete="off" />
      </Field>
    </Dialog>
  );
}

function MappingDialog({ channel, onClose }: { channel: Channel; onClose: () => void }) {
  const [rows, setRows] = useState<{ ratePlanId: string; roomTypeId: string; roomTypeName: string; planName: string; mealPlan: string; otaRoomId: string; otaRateId: string }[] | null>(null);
  const { run, pending } = useRun();
  const toast = useToast();
  useEffect(() => {
    getMappingsAction(channel.id).then((r) => (r.ok ? setRows(r.data) : toast.error(r.error)));
  }, [channel.id, toast]);
  return (
    <Dialog
      open
      onClose={onClose}
      size="xl"
      title={`${OTA_LABELS[channel.ota]} mapping`}
      description="Match each of your room types and rate plans to the IDs used on the OTA."
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={pending} disabled={!rows} onClick={() => rows && run(() => saveMappingsAction(channel.id, rows), { onSuccess: onClose })}>
            Save mapping
          </Button>
        </>
      }
    >
      {!rows ? (
        <Loader2 className="h-5 w-5 animate-spin text-ink-400" />
      ) : (
        <table className="w-full text-sm">
          <thead className="text-left text-[11px] tracking-wide text-ink-500 uppercase">
            <tr>
              <th className="pb-2 font-semibold">{tx('Your room & rate')}</th>
              <th className="pb-2 font-semibold" />
              <th className="pb-2 font-semibold">{tx('OTA room ID')}</th>
              <th className="pb-2 font-semibold">{tx('OTA rate ID')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-100">
            {rows.map((row, i) => (
              <tr key={row.ratePlanId}>
                <td className="py-2 pr-2">
                  <p className="font-medium text-ink-900">{row.roomTypeName}</p>
                  <p className="text-xs text-ink-500">
                    {row.planName} · {row.mealPlan}
                  </p>
                </td>
                <td className="px-2 text-ink-300">
                  <ArrowRight className="h-4 w-4" />
                </td>
                <td className="py-2 pr-2">
                  <Input value={row.otaRoomId} onChange={(e) => setRows(rows.map((r, j) => (j === i ? { ...r, otaRoomId: e.target.value } : r)))} className="h-9 font-mono text-xs" placeholder="Not sold" />
                </td>
                <td className="py-2">
                  <Input value={row.otaRateId} onChange={(e) => setRows(rows.map((r, j) => (j === i ? { ...r, otaRateId: e.target.value } : r)))} className="h-9 font-mono text-xs" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Dialog>
  );
}
