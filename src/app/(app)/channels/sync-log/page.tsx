import type { Metadata } from 'next';
import { and, desc, eq } from 'drizzle-orm';
import { db } from '@/db';
import { channels, syncLogs } from '@/db/schema';
import { requireContext } from '@/server/context';
import { formatDateTime, OTA_LABELS } from '@/lib/format';
import { Card, EmptyState, PageHeader } from '@/components/ui/card';
import { Tabs } from '@/components/ui/tabs';
import { StatusBadge } from '@/components/ui/badge';
import { Table, TBody, Td, Th, THead, Tr } from '@/components/ui/table';
import { RetryButton, SendNowButton } from './sync-buttons';

export const metadata: Metadata = { title: 'Sync Log' };

export default async function SyncLogPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const ctx = await requireContext('channels.manage');
  const { status = 'all' } = await searchParams;
  const rows = await db
    .select({ log: syncLogs, ota: channels.ota })
    .from(syncLogs)
    .leftJoin(channels, eq(channels.id, syncLogs.channelId))
    .where(and(eq(syncLogs.propertyId, ctx.propertyId), status === 'all' ? undefined : eq(syncLogs.status, status as 'failed')))
    .orderBy(desc(syncLogs.createdAt))
    .limit(200);
  return (
    <div>
      <PageHeader eyebrow="Channels" title="Sync Log" description="Every message sent to or received from an OTA. Failed pushes retry automatically; you can also retry by hand." actions={<SendNowButton />} />
      <Tabs
        className="mb-4"
        value={status}
        items={[
          { value: 'all', label: 'All', href: '/channels/sync-log' },
          { value: 'queued', label: 'Waiting', href: '/channels/sync-log?status=queued' },
          { value: 'failed', label: 'Failed', href: '/channels/sync-log?status=failed' },
          { value: 'success', label: 'Sent', href: '/channels/sync-log?status=success' },
        ]}
      />
      <Card>
        {rows.length === 0 ? (
          <div className="p-6">
            <EmptyState title="Nothing here" />
          </div>
        ) : (
          <Table minWidth={900}>
            <THead>
              <tr>
                <Th>When</Th>
                <Th>OTA</Th>
                <Th>Direction</Th>
                <Th>What</Th>
                <Th>Result</Th>
                <Th>Status</Th>
                <Th />
              </tr>
            </THead>
            <TBody>
              {rows.map(({ log, ota }) => {
                const response = log.response as { error?: string; message?: string } | null;
                return (
                  <Tr key={log.id}>
                    <Td className="text-xs whitespace-nowrap">{formatDateTime(log.processedAt ?? log.createdAt)}</Td>
                    <Td className="font-medium">{ota ? OTA_LABELS[ota] : '—'}</Td>
                    <Td className="text-xs capitalize">{log.direction}</Td>
                    <Td className="max-w-72 truncate text-[13px]">{log.message}</Td>
                    <Td className="max-w-72 truncate text-xs text-ink-500">
                      {response?.error ?? response?.message ?? '—'}
                      {log.retries > 0 && <span className="ml-1 text-ink-400">({log.retries} retries)</span>}
                    </Td>
                    <Td>
                      <StatusBadge status={log.status} />
                    </Td>
                    <Td className="text-right">{log.status === 'failed' && log.direction === 'push' && <RetryButton id={log.id} />}</Td>
                  </Tr>
                );
              })}
            </TBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
