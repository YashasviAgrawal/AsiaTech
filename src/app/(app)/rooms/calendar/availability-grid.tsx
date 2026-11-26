'use client';

import { Fragment, useState } from 'react';
import { Ban } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatDayShort, isWeekend, parseDay } from '@/lib/format';
import type { CalendarCell, CalendarRow } from '@/server/services/inventory';
import { updateInventoryCellAction } from '@/server/actions/inventory';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Stepper, Switch } from '@/components/ui/fields';
import { useRun } from '@/components/ui/use-run';
import { tx } from '@/i18n/tx';
import { useTr } from '@/i18n/client';

/** Colour rule (rule 6, read from the AsiaTech screenshot): red = 0 left, amber = partly used, green = all free. */
export function availabilityTone(cell: Pick<CalendarCell, 'available' | 'total'>) {
  if (cell.available <= 0) return 'bg-rose-500 text-white ring-rose-600 shadow-sm shadow-rose-500/30';
  if (cell.available < cell.total) return 'bg-amber-100 text-amber-900 ring-amber-300';
  return 'bg-emerald-100 text-emerald-900 ring-emerald-300';
}

export function AvailabilityGrid({ rows, today, canEdit }: { rows: CalendarRow[]; today: string; canEdit: boolean }) {
  const [editing, setEditing] = useState<{ row: CalendarRow; cell: CalendarCell } | null>(null);
  const tr = useTr();
  const dates = rows[0]?.cells.map((c) => c.date) ?? [];

  return (
    <div className="card overflow-hidden">
      <div className="scrollbar-thin overflow-x-auto">
        <table className="w-full border-separate border-spacing-0 text-sm" style={{ minWidth: 300 + dates.length * 64 }}>
          <thead>
            <tr>
              <th className="sticky left-0 z-20 w-56 border-b border-ink-200 bg-ink-50 px-5 py-3 text-left text-[11px] font-semibold tracking-wide text-ink-500 uppercase">
                {tx('Room category')}
              </th>
              <th className="sticky left-56 z-20 w-24 border-r border-b border-ink-200 bg-ink-50 px-3 py-3 text-left text-[11px] font-semibold tracking-wide text-ink-500 uppercase">
                {tx('Type')}
              </th>
              {dates.map((date) => {
                const d = parseDay(date);
                const isToday = date === today;
                return (
                  <th
                    key={date}
                    className={cn(
                      'border-b border-ink-200 px-1 py-2 text-center',
                      isToday ? 'bg-brand-50' : isWeekend(date) ? 'bg-ink-100/70' : 'bg-ink-50',
                    )}
                  >
                    <div className={cn('text-[10px] font-semibold tracking-wider uppercase', isToday ? 'text-brand-600' : 'text-ink-400')}>
                      {d.toLocaleDateString('en-IN', { weekday: 'short' })}
                    </div>
                    <div className={cn('num text-[17px] leading-tight font-extrabold', isToday ? 'text-brand-700' : 'text-ink-900')}>{d.getDate()}</div>
                    <div className={cn('text-[10px] font-medium', isToday ? 'text-brand-600' : 'text-ink-400')}>{d.toLocaleDateString('en-IN', { month: 'short' })}</div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIndex) => (
              <Fragment key={row.roomType.id}>
                {(['available', 'booked', 'blocked'] as const).map((kind, kindIndex) => (
                  <tr key={kind} className={cn(kindIndex === 2 && rowIndex < rows.length - 1 && '[&>td]:border-b [&>td]:border-ink-200')}>
                    {kindIndex === 0 && (
                      <td rowSpan={3} className={cn('sticky left-0 z-10 w-56 bg-white px-5 align-middle', rowIndex < rows.length - 1 && 'border-b border-ink-200')}>
                        <div className="flex items-start gap-2.5 py-3">
                          <span className="mt-1 h-8 w-1 shrink-0 rounded-full" style={{ backgroundColor: row.roomType.color }} />
                          <div>
                            <p className="leading-snug font-semibold text-ink-900">{row.roomType.name}</p>
                            <p className="mt-0.5 text-xs text-ink-500">
                              {row.roomType.totalRooms} room{row.roomType.totalRooms === 1 ? '' : 's'} · {row.roomType.code}
                            </p>
                          </div>
                        </div>
                      </td>
                    )}
                    <td className={cn('sticky left-56 z-10 w-24 border-r border-ink-200 bg-white px-3 text-[10px] font-bold tracking-wider uppercase', kind === 'available' ? 'pt-3 pb-1.5 text-ink-700' : 'py-1 text-ink-400', kind === 'blocked' && 'pb-3')}>
                      {tx(kind)}
                    </td>
                    {row.cells.map((cell) => {
                      const isToday = cell.date === today;
                      const bg = isToday ? 'bg-brand-50/50' : isWeekend(cell.date) ? 'bg-ink-50/80' : '';
                      if (kind === 'available') {
                        return (
                          <td key={cell.date} className={cn('px-1 pt-3 pb-1.5 text-center', bg)}>
                            <button
                              type="button"
                              disabled={!canEdit}
                              onClick={() => setEditing({ row, cell })}
                              title={`${row.roomType.name} · ${tr(formatDayShort(cell.date))}: ${tr(`${cell.available} to sell`)}${cell.stopSell ? ` · ${tr('Stop-sell')}` : ''}`}
                              className={cn(
                                'num relative mx-auto grid h-8 w-11 place-items-center rounded-lg text-sm font-bold ring-1 transition-all duration-150 ease-smooth',
                                availabilityTone(cell),
                                canEdit && 'hover:-translate-y-px hover:shadow-lift active:scale-95',
                                cell.stopSell && 'ring-2 ring-brand-600',
                              )}
                            >
                              {Math.max(cell.available, 0)}
                              {cell.stopSell && (
                                <span className="absolute -top-1.5 -right-1.5 grid h-4 w-4 place-items-center rounded-full bg-brand-600 text-white ring-2 ring-white">
                                  <Ban className="h-2.5 w-2.5" />
                                </span>
                              )}
                            </button>
                          </td>
                        );
                      }
                      const value = kind === 'booked' ? cell.booked : cell.blocked;
                      return (
                        <td key={cell.date} className={cn('num px-1 py-1 text-center text-[13px]', kind === 'blocked' && 'pb-3', bg, value > 0 ? 'font-semibold text-ink-800' : 'text-ink-300')}>
                          {value}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
      {editing && <CellEditor key={`${editing.row.roomType.id}-${editing.cell.date}`} row={editing.row} cell={editing.cell} onClose={() => setEditing(null)} />}
    </div>
  );
}

function CellEditor({ row, cell, onClose }: { row: CalendarRow; cell: CalendarCell; onClose: () => void }) {
  const maxSellable = cell.total - cell.booked;
  const [available, setAvailable] = useState(Math.max(0, cell.available));
  const [stopSell, setStopSell] = useState(cell.stopSell);
  const { run, pending } = useRun();
  const blocked = maxSellable - available;
  const preview = { ...cell, available, blocked };

  return (
    <Dialog
      open
      onClose={onClose}
      size="sm"
      title={row.roomType.name}
      description={formatDayShort(cell.date)}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            loading={pending}
            disabled={available === Math.max(0, cell.available) && stopSell === cell.stopSell}
            onClick={() =>
              run(() => updateInventoryCellAction({ roomTypeId: row.roomType.id, date: cell.date, available, stopSell }), {
                undoable: true,
                onSuccess: onClose,
              })
            }
          >
            Save
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-3 gap-2 text-center">
        {[
          { label: 'Total', value: cell.total },
          { label: 'Booked', value: cell.booked },
          { label: 'Blocked', value: blocked },
        ].map((stat) => (
          <div key={stat.label} className="rounded-lg bg-ink-50 py-2.5">
            <p className="num text-lg font-bold text-ink-900">{stat.value}</p>
            <p className="text-[11px] text-ink-500">{tx(stat.label)}</p>
          </div>
        ))}
      </div>

      <div className="mt-5 flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-ink-900">{tx('Rooms to sell')}</p>
          <p className="text-xs text-ink-500">{tx(`Up to ${maxSellable}. The rest are blocked.`)}</p>
        </div>
        <div className="flex items-center gap-3">
          <span className={cn('num grid h-8 w-10 place-items-center rounded-lg text-sm font-bold ring-1', availabilityTone(preview))}>{available}</span>
          <Stepper value={available} onChange={setAvailable} min={0} max={maxSellable} label="Rooms to sell" />
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between gap-3 rounded-lg border border-ink-200 p-3">
        <div>
          <p className="text-sm font-semibold text-ink-900">{tx('Stop-sell')}</p>
          <p className="text-xs text-ink-500">{tx('Close this date on all OTAs and the booking engine.')}</p>
        </div>
        <Switch checked={stopSell} onChange={setStopSell} label="Stop-sell" />
      </div>
    </Dialog>
  );
}
