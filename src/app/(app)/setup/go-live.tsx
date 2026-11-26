'use client';

import { Rocket } from 'lucide-react';
import { goLiveAction } from '@/server/actions/settings';
import { Button } from '@/components/ui/button';
import { useRun } from '@/components/ui/use-run';

export function GoLiveButton({ disabled }: { disabled: boolean }) {
  const { run, pending } = useRun();
  return (
    <Button disabled={disabled} loading={pending} onClick={() => run(() => goLiveAction())}>
      <Rocket className="h-4 w-4" /> Go live
    </Button>
  );
}
