'use client';

import { useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, Check, ChevronRight, Lock, Mail, Moon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatDay, formatINR, sourceLabel } from '@/lib/format';
import type { getAuditState } from '@/server/services/nightaudit';
import { auditCashAction, auditLockAction, auditNoShowsAction, auditPosAction, auditRoomChargesAction } from '@/server/actions/money';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Checkbox, Input } from '@/components/ui/fields';
import { Alert } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/dialog';
import { useRun } from '@/components/ui/use-run';

type State = Awaited<ReturnType<typeof getAuditState>>;
type StepKey = 'no_shows' | 'room_charges' | 'pos_closed' | 'cash_match' | 'lock_day' | 'email_report';

interface HistoryRow {
  id: string;
  businessDate: string;
  status: string;
  summary: Record<string, number | string>;
  runBy: string | null;
}

export function NightAuditWizard({
  state,
  steps,
  businessDate,
  history,
  emails,
}: {
  state: State;
  steps: { key: StepKey; title: string; description: string }[];
  businessDate: string;
  history: HistoryRow[];
  emails: string[];
}) {
  const statusOf = (key: StepKey) => state.audit?.steps.find((s) => s.key === key);
  const firstPending = steps.find((s) => statusOf(s.key)?.status !== 'done' && statusOf(s.key)?.status !== 'skipped')?.key ?? 'email_report';
  const [active, setActive] = useState<StepKey>(firstPending);
  const [noShows, setNoShows] = useState<string[]>(state.pendingArrivals.filter((a) => a.checkIn < businessDate || a.paid === 0).map((a) => a.id));
  const [counted, setCounted] = useState('');
  const [note, setNote] = useState('');
  const [lockOpen, setLockOpen] = useState(false);
  const { run, pending } = useRun();
  const expectedCash = state.cash.frontDesk + state.cash.restaurant - state.cash.pettyExpenses;
  const next = (key: StepKey) => {
    const i = steps.findIndex((s) => s.key === key);
    setActive(steps[Math.min(i + 1, steps.length - 1)].key);
  };

  return (
    <div className="grid gap-6 xl:grid-cols-[300px_minmax(0,1fr)]">
      {/* Steps */}
      <Card className="h-fit p-2">
        <ol>
          {steps.map((step, i) => {
            const s = statusOf(step.key);
            const done = s?.status === 'done' || s?.status === 'skipped';
            return (
              <li key={step.key}>
                <button onClick={() => setActive(step.key)} className={cn('flex w-full items-start gap-3 rounded-xl p-3 text-left transition', active === step.key ? 'bg-brand-50' : 'hover:bg-ink-50')}>
                  <span className={cn('grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-bold', done ? 'bg-emerald-500 text-white' : active === step.key ? 'bg-brand-600 text-white' : 'bg-ink-100 text-ink-500')}>
                    {done ? <Check className="h-4 w-4" /> : i + 1}
                  </span>
                  <span className="min-w-0">
                    <span className={cn('block text-sm font-semibold', active === step.key ? 'text-brand-700' : 'text-ink-900')}>{step.title}</span>
                    <span className="block text-xs text-ink-500">{s?.detail ?? step.description}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      </Card>

      <div className="space-y-6">
        <Card className="p-6">
          {active === 'no_shows' && (
            <div>
              <h2 className="text-lg font-bold text-ink-900">Mark no-shows</h2>
              <p className="mt-1 text-sm text-ink-500">These guests were due today or earlier and have not checked in. Tick the ones who will not come. Untick anyone still expected tonight.</p>
              {state.pendingArrivals.length === 0 ? (
                <Alert tone="success" className="mt-4">
                  Every arrival has checked in.
                </Alert>
              ) : (
                <ul className="mt-4 divide-y divide-ink-100 rounded-xl border border-ink-200">
                  {state.pendingArrivals.map((a) => (
                    <li key={a.id} className="flex items-center gap-3 px-4 py-3">
                      <Checkbox
                        label={a.guestName}
                        description={`${a.bookingNo} · ${sourceLabel(a.source, a.channel)} · arriving ${formatDay(a.checkIn)}${a.paid > 0 ? ` · ${formatINR(a.paid)} paid` : ''}`}
                        checked={noShows.includes(a.id)}
                        onChange={(e) => setNoShows(e.target.checked ? [...noShows, a.id] : noShows.filter((x) => x !== a.id))}
                      />
                    </li>
                  ))}
                </ul>
              )}
              {state.dueOuts.length > 0 && (
                <Alert tone="warning" icon={<AlertTriangle className="h-4 w-4" />} className="mt-4" title={`${state.dueOuts.length} guest(s) were due to leave today and are still in house`}>
                  Check them out or extend their stay from <Link href="/front-desk/today?tab=departures" className="font-semibold underline">Today Check (In-Out)</Link> before locking the day.
                </Alert>
              )}
              <div className="mt-5 flex justify-end">
                <Button loading={pending} onClick={() => run(() => auditNoShowsAction(noShows), { success: (d) => `${d.count} no-show(s) marked`, onSuccess: () => next('no_shows') })}>
                  {noShows.length ? `Mark ${noShows.length} no-show(s)` : 'Nobody is a no-show'} <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}

          {active === 'room_charges' && (
            <div>
              <h2 className="text-lg font-bold text-ink-900">Post room charges</h2>
              <p className="mt-1 text-sm text-ink-500">Tonight&apos;s room rent (with GST) is added to every in-house guest&apos;s bill.</p>
              <div className="mt-5 flex items-center gap-6 rounded-xl bg-ink-50 p-5">
                <div>
                  <p className="num text-3xl font-extrabold text-ink-900">{state.roomCharges.total}</p>
                  <p className="text-xs text-ink-500">rooms in house tonight</p>
                </div>
                <div>
                  <p className="num text-3xl font-extrabold text-emerald-600">{state.roomCharges.posted}</p>
                  <p className="text-xs text-ink-500">already posted</p>
                </div>
              </div>
              <div className="mt-5 flex justify-end">
                <Button loading={pending} onClick={() => run(() => auditRoomChargesAction(), { success: (d) => `${d.posted} room night(s) posted`, onSuccess: () => next('room_charges') })}>
                  Post room charges <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}

          {active === 'pos_closed' && (
            <div>
              <h2 className="text-lg font-bold text-ink-900">Restaurant day closed</h2>
              <ul className="mt-4 space-y-2">
                {state.outlets.map((o) => (
                  <li key={o.id} className="flex items-center justify-between rounded-xl border border-ink-200 px-4 py-3">
                    <span className="font-medium text-ink-800">{o.name}</span>
                    {o.closed ? (
                      <span className="flex items-center gap-1 text-sm font-semibold text-emerald-600">
                        <Check className="h-4 w-4" /> Closed
                      </span>
                    ) : (
                      <Link href="/restaurant/orders" className="text-sm font-semibold text-brand-600">
                        Close it →
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
              {state.openPosOrders > 0 && (
                <Alert tone="warning" className="mt-4">
                  {state.openPosOrders} restaurant order(s) are still open.
                </Alert>
              )}
              <div className="mt-5 flex justify-end">
                <Button loading={pending} onClick={() => run(() => auditPosAction(), { success: 'Restaurant checked', onSuccess: () => next('pos_closed') })}>
                  Continue <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}

          {active === 'cash_match' && (
            <div>
              <h2 className="text-lg font-bold text-ink-900">Match cash</h2>
              <p className="mt-1 text-sm text-ink-500">Count the cash drawer. The system expects:</p>
              <dl className="mt-4 space-y-2 rounded-xl bg-ink-50 p-4 text-sm">
                <div className="flex justify-between">
                  <dt className="text-ink-600">Front desk cash</dt>
                  <dd className="num font-semibold">{formatINR(state.cash.frontDesk)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-ink-600">Restaurant cash</dt>
                  <dd className="num font-semibold">{formatINR(state.cash.restaurant)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-ink-600">Petty cash spent</dt>
                  <dd className="num font-semibold text-rose-600">−{formatINR(state.cash.pettyExpenses)}</dd>
                </div>
                <div className="flex justify-between border-t border-ink-200 pt-2 text-base font-bold">
                  <dt>Expected in drawer</dt>
                  <dd className="num">{formatINR(expectedCash)}</dd>
                </div>
              </dl>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <Input type="number" value={counted} onChange={(e) => setCounted(e.target.value)} placeholder="Cash counted" leading={<span className="text-sm">₹</span>} className="num text-lg font-semibold" />
                <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (if it does not match)" />
              </div>
              {counted !== '' && (
                <p className={cn('mt-3 text-sm font-semibold', Math.abs(Number(counted) - expectedCash) < 1 ? 'text-emerald-600' : 'text-amber-700')}>
                  {Math.abs(Number(counted) - expectedCash) < 1 ? 'Cash matches ✓' : `${Number(counted) > expectedCash ? 'Excess' : 'Short'} by ${formatINR(Math.abs(Number(counted) - expectedCash))}`}
                </p>
              )}
              <div className="mt-5 flex justify-end">
                <Button loading={pending} disabled={counted === ''} onClick={() => run(() => auditCashAction(Number(counted), note || null), { success: 'Cash recorded', onSuccess: () => next('cash_match') })}>
                  Save cash count <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}

          {(active === 'lock_day' || active === 'email_report') && (
            <div>
              <h2 className="flex items-center gap-2 text-lg font-bold text-ink-900">
                <Moon className="h-5 w-5 text-brand-600" /> Lock {formatDay(businessDate)}
              </h2>
              <p className="mt-1 text-sm text-ink-500">The business date moves to tomorrow. Nothing more can be posted to this day. The report is emailed to {emails.length ? emails.join(', ') : 'nobody yet (add an email in Settings → Notifications)'}.</p>
              {state.audit?.status === 'completed' ? (
                <Alert tone="success" className="mt-4">
                  This day is closed.
                </Alert>
              ) : (
                <div className="mt-5 flex justify-end">
                  <Button size="lg" onClick={() => setLockOpen(true)}>
                    <Lock className="h-4 w-4" /> Lock day & email report
                  </Button>
                </div>
              )}
            </div>
          )}
        </Card>

        <Card>
          <p className="border-b border-ink-100 px-5 py-3.5 font-bold text-ink-900">Recent audits</p>
          <ul className="divide-y divide-ink-100">
            {history.map((h) => (
              <li key={h.id} className="flex flex-wrap items-center gap-x-6 gap-y-1 px-5 py-3 text-sm">
                <span className="w-32 font-semibold text-ink-900">{formatDay(h.businessDate)}</span>
                <span className="text-ink-500">Occupancy {h.summary.occupancy ?? '—'}%</span>
                <span className="text-ink-500">Rooms {formatINR(Number(h.summary.roomRevenue ?? 0))}</span>
                <span className="text-ink-500">Restaurant {formatINR(Number(h.summary.restaurantRevenue ?? 0))}</span>
                <span className="ml-auto flex items-center gap-1.5 text-xs text-ink-400">
                  <Mail className="h-3.5 w-3.5" /> {h.runBy ?? '—'}
                </span>
              </li>
            ))}
            {history.length === 0 && <li className="px-5 py-8 text-center text-sm text-ink-500">No audits yet.</li>}
          </ul>
        </Card>
      </div>

      <ConfirmDialog
        open={lockOpen}
        onClose={() => setLockOpen(false)}
        variant="primary"
        title={`Lock ${formatDay(businessDate)}?`}
        description="The business date moves forward by one day and the report is emailed. This cannot be undone from the app."
        confirmLabel="Lock the day"
        loading={pending}
        onConfirm={async () => void (await run(() => auditLockAction(), { success: (d) => `Day closed. Business date is now ${formatDay(d.nextBusinessDate)}`, onSuccess: () => setLockOpen(false) }))}
      />
    </div>
  );
}
