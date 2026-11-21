'use client';

import { useState } from 'react';
import { Lock, LockKeyhole } from 'lucide-react';
import { formatINR } from '@/lib/format';
import { closeDayAction } from '@/server/actions/pos';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/dialog';
import { useRun } from '@/components/ui/use-run';
import { tx } from '@/i18n/tx';

export function CloseDayButton({ outletId, closed, totals }: { outletId: string; closed: boolean; totals: Record<string, number> }) {
  const [open, setOpen] = useState(false);
  const { run, pending } = useRun();
  if (closed)
    return (
      <Button variant="outline" disabled>
        <Lock className="h-4 w-4" /> Day closed
      </Button>
    );
  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <LockKeyhole className="h-4 w-4" /> {tx('Close the day')}
      </Button>
      <ConfirmDialog
        open={open}
        onClose={() => setOpen(false)}
        variant="primary"
        title="Close today's restaurant day?"
        description="Totals are saved for the Night Audit. Orders cannot be added to this business date afterwards."
        confirmLabel="Close day"
        loading={pending}
        preview={
          <dl className="grid grid-cols-2 gap-2 text-sm">
            {(['cash', 'upi', 'card', 'room_transfer', 'complimentary'] as const).map((k) => (
              <div key={k} className="flex justify-between rounded-lg bg-ink-50 px-3 py-2">
                <dt className="text-ink-500 capitalize">{k.replace('_', ' ')}</dt>
                <dd className="num font-semibold">{formatINR(totals[k] ?? 0)}</dd>
              </div>
            ))}
            <div className="col-span-2 flex justify-between rounded-lg bg-ink-900 px-3 py-2 text-white">
              <dt>Total ({totals.orders} bills)</dt>
              <dd className="num font-bold">{formatINR(totals.total)}</dd>
            </div>
            {totals.open > 0 && <p className="col-span-2 text-sm font-semibold text-rose-600">{totals.open} order(s) are still open and must be settled first.</p>}
          </dl>
        }
        onConfirm={async () => void (await run(() => closeDayAction(outletId), { success: 'Restaurant day closed', onSuccess: () => setOpen(false) }))}
      />
    </>
  );
}
