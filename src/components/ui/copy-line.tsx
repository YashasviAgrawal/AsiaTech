'use client';

import { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { useTr } from '@/i18n/client';

/** A value to hand over (agent key, sign-in details) with a copy button. */
export function CopyLine({ value, label }: { value: string; label: string }) {
  const tr = useTr();
  const [copied, setCopied] = useState(false);
  return (
    <div>
      <p className="mb-1 text-xs font-semibold text-ink-500">{tr(label)}</p>
      <div className="flex items-stretch gap-2">
        <code className="min-w-0 flex-1 rounded-lg bg-ink-950 px-3 py-2.5 font-mono text-xs break-all text-emerald-300">{value}</code>
        <button
          type="button"
          onClick={async () => {
            await navigator.clipboard.writeText(value).catch(() => undefined);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
          className="grid w-10 shrink-0 place-items-center rounded-lg bg-white ring-1 ring-ink-200 hover:bg-ink-50"
          aria-label={tr('Copy')}
        >
          {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4 text-ink-500" />}
        </button>
      </div>
    </div>
  );
}
