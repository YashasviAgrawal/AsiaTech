import type { Metadata } from 'next';
import { requireContext } from '@/server/context';
import { listOutlets } from '@/server/services/pos';
import { listPrinting, STALE_AFTER_MINUTES } from '@/server/services/printing';
import { PageHeader } from '@/components/ui/card';
import { PrintersManager } from './printers-manager';

export const metadata: Metadata = { title: 'Printers' };

export default async function PrintersPage() {
  const ctx = await requireContext('pos.manage');
  const [data, outlets] = await Promise.all([listPrinting(ctx.propertyId), listOutlets(ctx.propertyId)]);
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Restaurant"
        title="Printers"
        description="KOTs print in the kitchen and bills at the counter by themselves, with no print window. A small print agent on one hotel PC sends them to the printers."
      />
      <PrintersManager
        printers={data.printers.map((p) => ({ ...p, createdAt: p.createdAt.toISOString() }))}
        agents={data.agents.map((a) => ({ ...a, lastSeenAt: a.lastSeenAt?.toISOString() ?? null, createdAt: a.createdAt.toISOString() }))}
        jobs={data.jobs.map((j) => ({ ...j, createdAt: j.createdAt.toISOString(), printedAt: j.printedAt?.toISOString() ?? null }))}
        outlets={outlets.map((o) => ({ id: o.id, name: o.name }))}
        staleMinutes={STALE_AFTER_MINUTES}
      />
    </div>
  );
}
