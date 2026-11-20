'use client';

import { Fragment, useState } from 'react';
import { Ban } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatDayShort, formatINR, isWeekend, MEAL_PLAN_LABELS, parseDay } from '@/lib/format';
import type { RateCell, RateRow } from '@/server/services/rates';
import { updateRateCellAction } from '@/server/actions/inventory';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Field, Input, Stepper, Switch } from '@/components/ui/fields';
import { Badge } from '@/components/ui/badge';
import { useRun } from '@/components/ui/use-run';

export function RateGrid({ rows, today, canEdit }: { rows: RateRow[]; today: string; canEdit: boolean }) {
  const [editing, setEditing] = useState<{ row: RateRow; cell: RateCell } | null>(null);
  const dates = rows[0]?.cells.map((c) => c.date) ?? [];
  let lastType = '';

  return (
    <div className="card overflow-hidden">
      <div className="scrollbar-thin overflow-x-auto">
        <table className="w-full border-separate border-spacing-0 text-sm" style={{ minWidth: 280 + dates.length * 78 }}>
          <thead>
            <tr>
              <th className="sticky left-0 z-20 w-64 border-r border-b border-ink-200 bg-ink-50 px-5 py-3 text-left text-[11px] font-semibold tracking-wide text-ink-500 uppercase">
                Room type · Rate plan
              </th>
              {dates.map((date) => {
                const d = parseDay(date);
                const isToday = date === today;
                return (
                  <th key={date} className={cn('border-b border-ink-200 px-1 py-2 text-center', isToday ? 'bg-brand-50' : isWeekend(date) ? 'bg-ink-100/70' : 'bg-ink-50')}>
                    <div className={cn('text-[10px] font-semibold tracking-wider uppercase', isToday ? 'text-brand-600' : 'text-ink-400')}>
                      {d.toLocaleDateString('en-IN', { weekday: 'short' })}
                    </div>
                    <div className={cn('num text-[15px] font-extrabold', isToday ? 'text-brand-700' : 'text-ink-900')}>
                      {d.getDate()} <span className="text-[10px] font-medium text-ink-400">{d.toLocaleDateString('en-IN', { month: 'short' })}</span>
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const showType = row.roomType.id !== lastType;
              lastType = row.roomType.id;
              return (
                <Fragment key={row.plan.id}>
                  {showType && (
                    <tr>
                      <td colSpan={dates.length + 1} className="sticky left-0 border-b border-ink-100 bg-white px-5 pt-4 pb-2">
                        <span className="flex items-center gap-2 text-[13px] font-bold text-ink-900">
                          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: row.roomType.color }} />
                          {row.roomType.name}
                        </span>
                      </td>
                    </tr>
                  )}
                  <tr className="group">
                    <td className="sticky left-0 z-10 border-r border-b border-ink-100 bg-white px-5 py-2.5 group-hover:bg-ink-50">
                      <p className="font-medium text-ink-800">{row.plan.name}</p>
                      <p className="text-[11px] text-ink-500">
                        <Badge tone="neutral" className="mr-1 px-1.5 py-0 text-[10px]">
                          {row.plan.mealPlan}
                        </Badge>
                        Standard {formatINR(row.plan.price2)}
                      </p>
                    </td>
                    {row.cells.map((cell) => {
                      const changed = cell.custom && (cell.price2 !== row.plan.price2 || cell.price1 !== row.plan.price1 || cell.price3 !== row.plan.price3);
                      return (
                        <td key={cell.date} className={cn('border-b border-ink-100 px-1 py-2 text-center', cell.date === today ? 'bg-brand-50/40' : isWeekend(cell.date) && 'bg-ink-50/70')}>
                          <button
                            type="button"
                            disabled={!canEdit}
                            onClick={() => setEditing({ row, cell })}
                            className={cn(
                              'relative mx-auto flex w-[68px] flex-col items-center rounded-lg px-1 py-1.5 ring-1 transition-all',
                              cell.stopSell ? 'bg-rose-50 ring-rose-300' : changed ? 'bg-brand-50/70 ring-brand-200' : 'bg-white ring-ink-200',
                              canEdit && 'hover:-translate-y-px hover:shadow-lift',
                            )}
                            title={`1A ${formatINR(cell.price1)} · 2A ${formatINR(cell.price2)} · 3A ${formatINR(cell.price3)} · extra bed ${formatINR(cell.extraBed)}`}
                          >
                            <span className={cn('num text-[13px] font-bold', cell.stopSell ? 'text-rose-700 line-through' : changed ? 'text-brand-700' : 'text-ink-900')}>
                              {cell.price2.toLocaleString('en-IN')}
                            </span>
                            <span className="text-[10px] text-ink-400">{cell.minStay > 1 ? `min ${cell.minStay}N` : ' '}</span>
                            {cell.stopSell && (
                              <span className="absolute -top-1.5 -right-1.5 grid h-4 w-4 place-items-center rounded-full bg-rose-600 text-white ring-2 ring-white">
                                <Ban className="h-2.5 w-2.5" />
                              </span>
                            )}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      {editing && <RateEditor key={`${editing.row.plan.id}-${editing.cell.date}`} row={editing.row} cell={editing.cell} onClose={() => setEditing(null)} />}
    </div>
  );
}

function RateEditor({ row, cell, onClose }: { row: RateRow; cell: RateCell; onClose: () => void }) {
  const [form, setForm] = useState({ price1: cell.price1, price2: cell.price2, price3: cell.price3, extraBed: cell.extraBed, minStay: cell.minStay, stopSell: cell.stopSell });
  const { run, pending } = useRun();
  const num = (key: 'price1' | 'price2' | 'price3' | 'extraBed') => ({
    value: String(form[key]),
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [key]: Number(e.target.value) || 0 }),
    type: 'number',
    min: 0,
    inputMode: 'decimal' as const,
    leading: <span className="text-sm">₹</span>,
    className: 'no-spinner num',
  });

  return (
    <Dialog
      open
      onClose={onClose}
      title={`${row.roomType.name} · ${row.plan.name}`}
      description={`${formatDayShort(cell.date)} · ${MEAL_PLAN_LABELS[row.plan.mealPlan]}`}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={pending} onClick={() => run(() => updateRateCellAction({ ratePlanId: row.plan.id, date: cell.date, ...form }), { undoable: true, onSuccess: onClose })}>
            Save rate
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-4">
        <Field label="1 adult">
          <Input {...num('price1')} />
        </Field>
        <Field label="2 adults">
          <Input {...num('price2')} />
        </Field>
        <Field label="3 adults">
          <Input {...num('price3')} />
        </Field>
        <Field label="Extra bed">
          <Input {...num('extraBed')} />
        </Field>
      </div>
      <div className="mt-4 flex items-center justify-between rounded-lg bg-ink-50 p-3">
        <p className="text-sm font-medium text-ink-800">Minimum stay (nights)</p>
        <Stepper value={form.minStay} onChange={(minStay) => setForm({ ...form, minStay })} min={1} max={30} />
      </div>
      <div className="mt-3 flex items-center justify-between rounded-lg border border-ink-200 p-3">
        <div>
          <p className="text-sm font-medium text-ink-800">Stop-sell this rate</p>
          <p className="text-xs text-ink-500">Hide this rate plan on OTAs for this date.</p>
        </div>
        <Switch checked={form.stopSell} onChange={(stopSell) => setForm({ ...form, stopSell })} label="Stop-sell" />
      </div>
    </Dialog>
  );
}
