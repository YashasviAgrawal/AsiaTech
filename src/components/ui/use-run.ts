'use client';

import { useCallback, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { ActionResult } from '@/server/action';
import { undoChangeAction } from '@/server/actions/inventory';
import { useToast } from './toast';

/**
 * Run a server action with consistent feedback: a pending flag, a success toast (with Undo when the action
 * returns a `logId`), an error toast, and a refresh so server components show the new data.
 */
export function useRun() {
  const [pending, startTransition] = useTransition();
  const toast = useToast();
  const router = useRouter();

  const run = useCallback(
    <T,>(
      action: () => Promise<ActionResult<T>>,
      options: { success?: string | ((data: T) => string); undoable?: boolean; onSuccess?: (data: T) => void; refresh?: boolean } = {},
    ) =>
      new Promise<ActionResult<T>>((resolve) => {
        startTransition(async () => {
          const result = await action();
          if (result.ok) {
            const message = typeof options.success === 'function' ? options.success(result.data) : options.success ?? result.message ?? 'Saved';
            const logId = (result.data as { logId?: string | null } | undefined)?.logId;
            toast.success(message, {
              action:
                options.undoable && logId
                  ? {
                      label: 'Undo',
                      onClick: async () => {
                        const undone = await undoChangeAction(logId);
                        if (undone.ok) toast.success('Change undone');
                        else toast.error(undone.error);
                        router.refresh();
                      },
                    }
                  : undefined,
            });
            options.onSuccess?.(result.data);
            if (options.refresh !== false) router.refresh();
          } else {
            toast.error(result.error);
          }
          resolve(result);
        });
      }),
    [router, toast],
  );

  return { run, pending };
}
