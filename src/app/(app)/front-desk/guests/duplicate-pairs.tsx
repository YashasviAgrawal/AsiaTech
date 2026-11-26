'use client';

import { useState } from 'react';
import { ArrowLeftRight, Merge, UsersRound } from 'lucide-react';
import { mergeGuestsAction } from '@/server/actions/reservations';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/dialog';
import { useRun } from '@/components/ui/use-run';
import { useTr } from '@/i18n/client';

type G = { id: string; name: string; mobile: string | null };

export function DuplicatePairs({ pairs, total }: { pairs: { a: G; b: G; reason: string }[]; total: number }) {
  const [merging, setMerging] = useState<{ keep: G; merge: G } | null>(null);
  const { run, pending } = useRun();
  const tr = useTr();
  return (
    <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50/70 p-4">
      <p className="flex items-center gap-2 text-sm font-semibold text-amber-900">
        <UsersRound className="h-4 w-4" /> {tr(`${total} possible duplicate guest${total === 1 ? '' : 's'}`)}
      </p>
      <p className="mt-0.5 text-xs text-amber-800">{tr('Merging keeps one profile and moves every booking and payment onto it.')}</p>
      <ul className="mt-3 space-y-2">
        {pairs.map(({ a, b, reason }) => (
          <li key={`${a.id}-${b.id}`} className="flex flex-wrap items-center gap-3 rounded-lg bg-white p-2.5 ring-1 ring-amber-200">
            <span className="min-w-0 flex-1 text-sm">
              <strong className="text-ink-900">{a.name}</strong> <span className="text-ink-400">{a.mobile}</span>
              <ArrowLeftRight className="mx-2 inline h-3.5 w-3.5 text-ink-300" />
              <strong className="text-ink-900">{b.name}</strong> <span className="text-ink-400">{b.mobile}</span>
              <span className="ml-2 text-xs text-amber-700">· {tr(reason)}</span>
            </span>
            <Button size="xs" variant="outline" onClick={() => setMerging({ keep: a, merge: b })}>
              <Merge className="h-3 w-3" /> {tr(`Keep “${a.name}”`)}
            </Button>
            <Button size="xs" variant="outline" onClick={() => setMerging({ keep: b, merge: a })}>
              <Merge className="h-3 w-3" /> {tr(`Keep “${b.name}”`)}
            </Button>
          </li>
        ))}
      </ul>
      <ConfirmDialog
        open={Boolean(merging)}
        onClose={() => setMerging(null)}
        variant="primary"
        title={merging ? `Merge “${merging.merge.name}” into “${merging.keep.name}”?` : ''}
        description="All bookings and payments move to the kept profile. Missing details (email, ID) are copied across."
        confirmLabel="Merge guests"
        loading={pending}
        onConfirm={async () => {
          if (merging) await run(() => mergeGuestsAction(merging.keep.id, merging.merge.id), { onSuccess: () => setMerging(null) });
        }}
      />
    </div>
  );
}
