'use client';

import { useState } from 'react';
import { ArrowRight, Ban, Layers, LockKeyhole, LockKeyholeOpen, PackageCheck, PlayCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { addDay, formatDayShort } from '@/lib/format';
import { applyBulkUpdateAction, previewBulkUpdateAction, type BulkInput, type BulkPreviewRow } from '@/server/actions/inventory';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Checkbox, Field, Input, Stepper } from '@/components/ui/fields';
import { WeekdayPicker } from '@/components/ui/weekday-picker';
import { Alert } from '@/components/ui/card';
import { useRun } from '@/components/ui/use-run';
import { useToast } from '@/components/ui/toast';

const MODES: { value: BulkInput['mode']; label: string; description: string; icon: typeof Layers; needsValue?: boolean }[] = [
  { value: 'set_available', label: 'Set rooms to sell', description: 'Sell exactly this many', icon: PackageCheck, needsValue: true },
  { value: 'block', label: 'Block rooms', description: 'Hold back for repairs or groups', icon: LockKeyhole, needsValue: true },
  { value: 'unblock_all', label: 'Remove all blocks', description: 'Sell every free room', icon: LockKeyholeOpen },
  { value: 'stop_sell', label: 'Stop-sell', description: 'Close on OTAs and booking engine', icon: Ban },
  { value: 'open_sale', label: 'Open sale', description: 'Remove stop-sell', icon: PlayCircle },
];

export function BulkUpdateButton({ roomTypes, defaultFrom }: { roomTypes: { id: string; name: string; totalRooms: number }[]; defaultFrom: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Layers className="h-4 w-4" /> Bulk Update
      </Button>
      {open && <BulkUpdateDialog roomTypes={roomTypes} defaultFrom={defaultFrom} onClose={() => setOpen(false)} />}
    </>
  );
}

function BulkUpdateDialog({ roomTypes, defaultFrom, onClose }: { roomTypes: { id: string; name: string; totalRooms: number }[]; defaultFrom: string; onClose: () => void }) {
  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo] = useState(addDay(defaultFrom, 6));
  const [weekdays, setWeekdays] = useState([0, 1, 2, 3, 4, 5, 6]);
  const [typeIds, setTypeIds] = useState(roomTypes.map((t) => t.id));
  const [mode, setMode] = useState<BulkInput['mode']>('set_available');
  const [value, setValue] = useState(1);
  const [preview, setPreview] = useState<{ rows: BulkPreviewRow[]; total: number } | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const { run, pending } = useRun();
  const toast = useToast();

  const input: BulkInput = { from, to, weekdays, roomTypeIds: typeIds, mode, value };
  const reset = () => setPreview(null);
  const modeMeta = MODES.find((m) => m.value === mode)!;

  async function loadPreview() {
    setPreviewing(true);
    const result = await previewBulkUpdateAction(input);
    setPreviewing(false);
    if (result.ok) setPreview(result.data);
    else toast.error(result.error);
  }

  return (
    <Dialog
      open
      onClose={onClose}
      size="lg"
      title="Bulk Update"
      description="Change availability for many dates at once. You will see a preview before anything is saved."
      footer={
        preview ? (
          <>
            <Button variant="outline" onClick={reset}>
              Back to edit
            </Button>
            <Button
              loading={pending}
              disabled={preview.total === 0}
              onClick={() =>
                run(() => applyBulkUpdateAction(input), {
                  undoable: true,
                  success: (d) => `Updated ${d.changed} date${d.changed === 1 ? '' : 's'}. OTAs will sync in a few seconds.`,
                  onSuccess: onClose,
                })
              }
            >
              Apply {preview.total} change{preview.total === 1 ? '' : 's'}
            </Button>
          </>
        ) : (
          <>
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={loadPreview} loading={previewing} disabled={typeIds.length === 0 || weekdays.length === 0}>
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
              <Input type="date" value={from} onChange={(e) => (setFrom(e.target.value), reset())} />
            </Field>
            <Field label="To">
              <Input type="date" value={to} min={from} onChange={(e) => (setTo(e.target.value), reset())} />
            </Field>
          </div>
          <Field label="On these days">
            <WeekdayPicker value={weekdays} onChange={setWeekdays} />
          </Field>
          <Field label="Room types">
            <div className="grid gap-2 sm:grid-cols-2">
              {roomTypes.map((type) => (
                <Checkbox
                  key={type.id}
                  label={type.name}
                  description={`${type.totalRooms} rooms`}
                  checked={typeIds.includes(type.id)}
                  onChange={(e) => setTypeIds(e.target.checked ? [...typeIds, type.id] : typeIds.filter((id) => id !== type.id))}
                  className="rounded-lg border border-ink-200 p-3"
                />
              ))}
            </div>
          </Field>
          <Field label="What to change">
            <div className="grid gap-2 sm:grid-cols-3">
              {MODES.map((m) => (
                <button
                  key={m.value}
                  type="button"
                  onClick={() => setMode(m.value)}
                  className={cn(
                    'flex items-start gap-2.5 rounded-xl border p-3 text-left transition',
                    mode === m.value ? 'border-brand-500 bg-brand-50/60 ring-4 ring-brand-100' : 'border-ink-200 hover:border-ink-300',
                  )}
                >
                  <m.icon className={cn('mt-0.5 h-4 w-4 shrink-0', mode === m.value ? 'text-brand-600' : 'text-ink-400')} />
                  <span>
                    <span className="block text-sm font-semibold text-ink-900">{m.label}</span>
                    <span className="block text-xs text-ink-500">{m.description}</span>
                  </span>
                </button>
              ))}
            </div>
          </Field>
          {modeMeta.needsValue && (
            <div className="flex items-center justify-between rounded-xl bg-ink-50 p-3.5">
              <p className="text-sm font-medium text-ink-800">{mode === 'set_available' ? 'Rooms to sell per date' : 'Rooms to block per date'}</p>
              <Stepper value={value} onChange={setValue} min={0} max={50} />
            </div>
          )}
        </div>
      ) : preview.total === 0 ? (
        <Alert tone="info" title="Nothing to change">
          The selected dates already match. Go back and adjust the dates, room types or the change.
        </Alert>
      ) : (
        <div>
          <Alert tone="warning" className="mb-4">
            <strong>{preview.total}</strong> date{preview.total === 1 ? '' : 's'} will change. Check the list, then apply. You can undo it from the notification afterwards.
          </Alert>
          <div className="scrollbar-thin max-h-[48vh] overflow-y-auto rounded-xl border border-ink-200">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-ink-50 text-left text-[11px] tracking-wide text-ink-500 uppercase">
                <tr>
                  <th className="px-3 py-2 font-semibold">Room type</th>
                  <th className="px-3 py-2 font-semibold">Date</th>
                  <th className="px-3 py-2 text-center font-semibold">To sell</th>
                  <th className="px-3 py-2 text-center font-semibold">Blocked</th>
                  <th className="px-3 py-2 text-center font-semibold">Stop-sell</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {preview.rows.map((row) => (
                  <tr key={row.id}>
                    <td className="px-3 py-2 text-ink-800">
                      {row.roomTypeName}
                      {row.note && <p className="text-[11px] text-amber-700">{row.note}</p>}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-ink-600">{formatDayShort(row.date)}</td>
                    <td className="num px-3 py-2 text-center">
                      <Change before={row.before.available} after={row.after.available} />
                    </td>
                    <td className="num px-3 py-2 text-center">
                      <Change before={row.before.blocked} after={row.after.blocked} />
                    </td>
                    <td className="px-3 py-2 text-center text-xs">
                      <Change before={row.before.stopSell ? 'On' : 'Off'} after={row.after.stopSell ? 'On' : 'Off'} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {preview.total > preview.rows.length && <p className="mt-2 text-xs text-ink-500">Showing the first {preview.rows.length} of {preview.total}.</p>}
        </div>
      )}
    </Dialog>
  );
}

function Change({ before, after }: { before: number | string; after: number | string }) {
  if (before === after) return <span className="text-ink-400">{before}</span>;
  return (
    <span className="inline-flex items-center gap-1 font-semibold">
      <span className="text-ink-400 line-through">{before}</span>
      <ArrowRight className="h-3 w-3 text-ink-300" />
      <span className="text-brand-700">{after}</span>
    </span>
  );
}
