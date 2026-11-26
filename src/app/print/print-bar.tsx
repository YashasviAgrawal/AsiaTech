'use client';

import { Printer, X } from 'lucide-react';

export function PrintBar() {
  return (
    <div className="no-print fixed top-4 right-4 z-50 flex gap-2">
      <button onClick={() => window.close()} className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-white px-3.5 text-sm font-medium text-ink-700 shadow-lift ring-1 ring-ink-200 hover:bg-ink-50">
        <X className="h-4 w-4" /> Close
      </button>
      <button onClick={() => window.print()} className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-brand-600 px-4 text-sm font-semibold text-white shadow-lift hover:bg-brand-700">
        <Printer className="h-4 w-4" /> Print / Save PDF
      </button>
    </div>
  );
}
