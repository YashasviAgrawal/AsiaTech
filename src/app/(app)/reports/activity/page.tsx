import type { Metadata } from 'next';
import Link from 'next/link';
import { History, Undo2 } from 'lucide-react';
import { requireContext } from '@/server/context';
import { activityFilterOptions, listActivity } from '@/server/services/activity';
import { ExportButton } from '@/components/ui/export-button';
import { formatDateTime, titleCase } from '@/lib/format';
import { initials } from '@/lib/utils';
import { Card, EmptyState, PageHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { FilterBar } from '@/components/ui/filter-bar';

export const metadata: Metadata = { title: 'Activity Log' };

const ENTITY_LINK: Record<string, (id: string) => string> = {
  booking: (id) => `/front-desk/bookings/${id}`,
  guest: (id) => `/front-desk/guests/${id}`,
};

export default async function ActivityPage({ searchParams }: { searchParams: Promise<{ q?: string; entity?: string; user?: string }> }) {
  const ctx = await requireContext('activity.view');
  const { q, entity, user } = await searchParams;
  const [rows, { people, entities }] = await Promise.all([listActivity(ctx.propertyId, { q, entity, user }), activityFilterOptions(ctx.propertyId)]);
  const exportQuery = new URLSearchParams(Object.entries({ q, entity, user }).filter((e): e is [string, string] => Boolean(e[1]))).toString();

  return (
    <div>
      <PageHeader
        eyebrow="Reports"
        title="Activity Log"
        description="Who changed which rate, discount or booking, and when. Changes with a snapshot can be undone from where they were made."
        actions={<ExportButton href={`/api/exports/money/activity${exportQuery ? `?${exportQuery}` : ''}`} />}
      />
      <FilterBar
        className="mb-4"
        fields={[
          { key: 'q', type: 'search', placeholder: 'Search changes…' },
          { key: 'entity', type: 'select', placeholder: 'Anything', options: entities.map((e) => ({ value: e.entity, label: titleCase(e.entity) })) },
          { key: 'user', type: 'select', placeholder: 'Anyone', options: people.map((p) => ({ value: p.id, label: p.name })) },
        ]}
      />
      {rows.length === 0 ? (
        <EmptyState icon={<History className="h-6 w-6" />} title="No activity found" />
      ) : (
        <Card>
          <ul className="divide-y divide-ink-100">
            {rows.map(({ log, userName }) => {
              const href = log.entityId && ENTITY_LINK[log.entityType]?.(log.entityId);
              return (
                <li key={log.id} className="flex items-start gap-3 px-5 py-3">
                  <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-ink-100 text-[11px] font-bold text-ink-600">{userName ? initials(userName) : 'SYS'}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-ink-800">
                      {href ? (
                        <Link href={href} className="hover:text-brand-600">
                          {log.summary}
                        </Link>
                      ) : (
                        log.summary
                      )}
                    </p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-ink-400">
                      <span>{userName ?? 'System'}</span>·<span>{formatDateTime(log.createdAt)}</span>
                      <Badge tone="neutral" className="py-0 text-[10px]">
                        {titleCase(log.entityType)}
                      </Badge>
                      {log.undoneAt && (
                        <Badge tone="warning" className="py-0 text-[10px]">
                          <Undo2 className="h-2.5 w-2.5" /> Undone
                        </Badge>
                      )}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </div>
  );
}
