'use client';

import { useState } from 'react';
import { ArrowRight, Layers } from 'lucide-react';
import { addDay, formatDayShort, formatINR } from '@/lib/format';
import { applyRateBulkAction, previewRateBulkAction, type RateBulkInput, type RatePreviewRow } from '@/server/actions/inventory';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Checkbox, Field, Input, Segmented, Select } from '@/components/ui/fields';
import { WeekdayPicker } from '@/components/ui/weekday-picker';
import { Alert } from '@/components/ui/card';
import { useRun } from '@/components/ui/use-run';
import { useToast } from '@/components/ui/toast';
import { tx } from '@/i18n/tx';

export function BulkRateButton({ plans, defaultFrom }: { plans: { id: string; label: string; mealPlan: string }[]; defaultFrom: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Layers className="h-4 w-4" /> Bulk rate update
      </Button>
      {open && <BulkRateDialog plans={plans} defaultFrom={defaultFrom} onClose={() => setOpen(false)} />}
    </>
  );
}

type PriceMode = RateBulkInput['priceMode'];

function BulkRateDialog({ plans, defaultFrom, onClose }: { plans: { id: string; label: string; mealPlan: string }[]; defaultFrom: string; onClose: () => void }) {
  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo] = useState(addDay(defaultFrom, 13));
  const [weekdays, setWeekdays] = useState([0, 1, 2, 3, 4, 5, 6]);
  const [planIds, setPlanIds] = useState(plans.map((p) => p.id));
  const [direction, setDirection] = useState<'set' | 'change'>('change');
  const [changeMode, setChangeMode] = useState<Exclude<PriceMode, 'set' | 'keep'>>('increase_percent');
  const [amount, setAmount] = useState(10);
  const [prices, setPrices] = useState({ price1: '', price2: '', price3: '', extraBed: '' });
  const [minStay, setMinStay] = useState('');
  const [stopSell, setStopSell] = useState<'keep' | 'on' | 'off'>('keep');
  const [preview, setPreview] = useState<{ rows: RatePreviewRow[]; total: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const { run, pending } = useRun();
  const toast = useToast();

  const toNum = (v: string) => (v === '' ? undefined : Number(v));
  const input: RateBulkInput = {
    ratePlanIds: planIds,
    from,
    to,
    weekdays,
    priceMode: direction === 'set' ? (Object.values(prices).some((v) => v !== '') ? 'set' : 'keep') : amount > 0 ? changeMode : 'keep',
    price1: toNum(prices.price1),
    price2: toNum(prices.price2),
    price3: toNum(prices.price3),
    extraBed: toNum(prices.extraBed),
    amount,
    minStay: toNum(minStay),
    stopSell,
  };

  async function loadPreview() {
    setLoading(true);
    const result = await previewRateBulkAction(input);
    setLoading(false);
    if (result.ok) setPreview(result.data);
    else toast.error(result.error);
  }

  return (
    <Dialog
      open
      onClose={onClose}
      size="lg"
      title="Bulk rate update"
      description="Change prices and restrictions for many dates and plans. Preview first, then apply."
      footer={
        preview ? (
          <>
            <Button variant="outline" onClick={() => setPreview(null)}>
              Back to edit
            </Button>
            <Button
              loading={pending}
              disabled={preview.total === 0}
              onClick={() => run(() => applyRateBulkAction(input), { undoable: true, success: (d) => `Updated ${d.changed} rates. OTAs will sync shortly.`, onSuccess: onClose })}
            >
              Apply {preview.total} change{preview.total === 1 ? '' : 's'}
            </Button>
          </>
        ) : (
          <>
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={loadPreview} loading={loading} disabled={planIds.length === 0}>
              Preview changes <ArrowRight className="h-4 w-4" />
            </Button>
          </>
        )
      }
    >
      {!preview ? (
        <div className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="From">
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </Field>
            <Field label="To">
              <Input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} />
            </Field>
          </div>
          <Field label="On these days">
            <WeekdayPicker value={weekdays} onChange={setWeekdays} />
          </Field>
          <Field label={`Rate plans (${planIds.length} of ${plans.length})`}>
            <div className="scrollbar-thin grid max-h-44 gap-1.5 overflow-y-auto rounded-xl border border-ink-200 p-2 sm:grid-cols-2">
              {plans.map((plan) => (
                <Checkbox
                  key={plan.id}
                  label={plan.label}
                  description={plan.mealPlan}
                  checked={planIds.includes(plan.id)}
                  onChange={(e) => setPlanIds(e.target.checked ? [...planIds, plan.id] : planIds.filter((id) => id !== plan.id))}
                  className="rounded-md p-1.5 hover:bg-ink-50"
                />
              ))}
            </div>
          </Field>

          <div className="rounded-xl border border-ink-200 p-4">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm font-semibold text-ink-900">{tx('Price')}</p>
              <Segmented
                size="sm"
                value={direction}
                onChange={setDirection}
                options={[
                  { value: 'change', label: 'Raise / lower' },
                  { value: 'set', label: 'Set exact price' },
                ]}
              />
            </div>
            {direction === 'change' ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <Select value={changeMode} onChange={(e) => setChangeMode(e.target.value as typeof changeMode)}>
                  <option value="increase_percent">Increase by %</option>
                  <option value="decrease_percent">Decrease by %</option>
                  <option value="increase_flat">Increase by ₹</option>
                  <option value="decrease_flat">Decrease by ₹</option>
                </Select>
                <Input type="number" min={0} value={amount} onChange={(e) => setAmount(Number(e.target.value) || 0)} className="num" />
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {(['price1', 'price2', 'price3', 'extraBed'] as const).map((key) => (
                  <Field key={key} label={{ price1: '1 adult', price2: '2 adults', price3: '3 adults', extraBed: 'Extra bed' }[key]}>
                    <Input type="number" min={0} placeholder="Keep" value={prices[key]} onChange={(e) => setPrices({ ...prices, [key]: e.target.value })} className="num" />
                  </Field>
                ))}
              </div>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Minimum stay" hint="Leave empty to keep">
              <Input type="number" min={1} max={30} placeholder="Keep" value={minStay} onChange={(e) => setMinStay(e.target.value)} />
            </Field>
            <Field label="Stop-sell">
              <Segmented
                value={stopSell}
                onChange={setStopSell}
                options={[
                  { value: 'keep', label: 'Keep' },
                  { value: 'on', label: 'Close' },
                  { value: 'off', label: 'Open' },
                ]}
              />
            </Field>
          </div>
        </div>
      ) : preview.total === 0 ? (
        <Alert tone="info" title="Nothing to change">
          These dates already have these prices.
        </Alert>
      ) : (
        <div>
          <Alert tone="warning" className="mb-4">
            {tx(`${preview.total} ${preview.total === 1 ? 'rate' : 'rates'} will change. You can undo afterwards.`)}
          </Alert>
          <div className="scrollbar-thin max-h-[48vh] overflow-y-auto rounded-xl border border-ink-200">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-ink-50 text-left text-[11px] tracking-wide text-ink-500 uppercase">
                <tr>
                  <th className="px-3 py-2 font-semibold">{tx('Plan')}</th>
                  <th className="px-3 py-2 font-semibold">{tx('Date')}</th>
                  <th className="px-3 py-2 text-right font-semibold">{tx('2 adults')}</th>
                  <th className="px-3 py-2 text-center font-semibold">{tx('Min stay')}</th>
                  <th className="px-3 py-2 text-center font-semibold">{tx('Stop-sell')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {preview.rows.map((row) => (
                  <tr key={`${row.ratePlanId}-${row.date}`}>
                    <td className="max-w-56 truncate px-3 py-2 text-ink-800">{row.label}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-ink-600">{formatDayShort(row.date)}</td>
                    <td className="num px-3 py-2 text-right whitespace-nowrap">
                      {row.before.price2 === row.after.price2 ? (
                        <span className="text-ink-400">{formatINR(row.before.price2)}</span>
                      ) : (
                        <span className="font-semibold">
                          <span className="text-ink-400 line-through">{formatINR(row.before.price2)}</span> <span className="text-brand-700">{formatINR(row.after.price2)}</span>
                        </span>
                      )}
                    </td>
                    <td className="num px-3 py-2 text-center">{row.before.minStay === row.after.minStay ? row.after.minStay : `${row.before.minStay} → ${row.after.minStay}`}</td>
                    <td className="px-3 py-2 text-center text-xs">{row.before.stopSell === row.after.stopSell ? (row.after.stopSell ? 'On' : '—') : row.after.stopSell ? 'Closing' : 'Opening'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Dialog>
  );
}
