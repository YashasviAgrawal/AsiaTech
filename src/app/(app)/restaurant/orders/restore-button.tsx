'use client';

import { RotateCcw } from 'lucide-react';
import { restoreOrderAction } from '@/server/actions/pos';
import { useRun } from '@/components/ui/use-run';
import { tx } from '@/i18n/tx';

/** Undo a voided order (same business day, before the restaurant day is closed). */
export function RestoreOrderButton({ orderId }: { orderId: string }) {
  const { run, pending } = useRun();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => run(() => restoreOrderAction(orderId), { success: (r) => `${r.orderNo} restored` })}
      className="ml-2 inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-semibold text-brand-600 transition hover:bg-brand-50 disabled:opacity-50"
    >
      <RotateCcw className="h-3 w-3" /> {tx('Restore')}
    </button>
  );
}
