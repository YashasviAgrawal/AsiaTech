'use client';

import { RefreshCw, RotateCcw } from 'lucide-react';
import { processQueueAction, retrySyncAction } from '@/server/actions/channels';
import { Button } from '@/components/ui/button';
import { useRun } from '@/components/ui/use-run';

export function RetryButton({ id }: { id: string }) {
  const { run, pending } = useRun();
  return (
    <Button size="xs" variant="outline" loading={pending} onClick={() => run(() => retrySyncAction(id), { success: (d) => (d.ok ? 'Sent' : 'Still failing; will retry automatically') })}>
      <RotateCcw className="h-3 w-3" /> Retry
    </Button>
  );
}

export function SendNowButton() {
  const { run, pending } = useRun();
  return (
    <Button variant="outline" loading={pending} onClick={() => run(() => processQueueAction(), { success: (d) => `${d.processed} processed · ${d.ok} sent · ${d.failed} failed` })}>
      <RefreshCw className="h-4 w-4" /> Send waiting updates
    </Button>
  );
}
