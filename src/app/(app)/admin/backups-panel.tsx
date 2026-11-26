'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { CloudUpload, DatabaseBackup, Download, HardDrive } from 'lucide-react';
import { formatDateTime, timeAgo } from '@/lib/format';
import { queueBackupAction } from '@/server/actions/admin';
import { Button } from '@/components/ui/button';
import { Alert, Card, CardHeader } from '@/components/ui/card';
import { Badge, type Tone } from '@/components/ui/badge';
import { useRun } from '@/components/ui/use-run';
import { tx } from '@/i18n/tx';
import { useT } from '@/i18n/client';

type BackupFile = { name: string; kind: 'database' | 'uploads'; bytes: number; onDisk: boolean };
type Run = {
  id: string;
  status: 'queued' | 'running' | 'ok' | 'failed';
  trigger: 'schedule' | 'manual' | 'console';
  files: BackupFile[];
  offsite: { ok: boolean; target: string; error?: string } | null;
  error: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
};
export type BackupOverview = {
  scheduled: boolean;
  hour: number;
  keepDays: number;
  dir: string;
  uploads: boolean;
  offsite: string | null;
  lastOk: Run | null;
  overdue: boolean;
  /** "Back up now" has waited over 3 minutes: the worker is probably not running. */
  waitingLong: boolean;
  runs: Run[];
};

const size = (bytes: number) => (bytes >= 1024 * 1024 * 1024 ? `${(bytes / 1024 ** 3).toFixed(1)} GB` : bytes >= 1024 * 1024 ? `${(bytes / 1024 ** 2).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);
const TRIGGER: Record<Run['trigger'], string> = { schedule: 'Nightly', manual: 'Command line', console: 'Back up now' };
const STATUS: Record<Run['status'], { label: string; tone: Tone }> = {
  queued: { label: 'Waiting', tone: 'info' },
  running: { label: 'Running', tone: 'info' },
  ok: { label: 'Done', tone: 'success' },
  failed: { label: 'Failed', tone: 'danger' },
};

/** Platform console → Backups: is there a recent good backup, where are the copies, and "Back up now". */
export function BackupsPanel({ data }: { data: BackupOverview }) {
  const { tr } = useT();
  const router = useRouter();
  const { run, pending } = useRun();
  const active = data.runs.find((r) => r.status === 'queued' || r.status === 'running');
  const lastFailed = data.runs.find((r) => r.status === 'failed');
  const last = data.lastOk;
  const lastBytes = (kind: BackupFile['kind']) => last?.files.find((f) => f.kind === kind)?.bytes;

  // While a backup waits or runs, look again every few seconds so it turns to Done by itself.
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => router.refresh(), 4000);
    return () => clearInterval(timer);
  }, [active, router]);

  const hour = `${String(data.hour).padStart(2, '0')}:00`;
  return (
    <div className="space-y-4">
      {data.overdue ? (
        <Alert tone="error" title={last ? `No backup since ${timeAgo(last.finishedAt ?? last.createdAt)}` : 'No backup has been made yet'}>
          {lastFailed?.error ? `Last try: ${lastFailed.error}` : 'The worker makes it every night. Check that the worker is running: docker compose ps'}
        </Alert>
      ) : !data.scheduled ? (
        <Alert tone="warning" title="Nightly backups are off on this server">
          Set BACKUP_DIR for the worker to turn them on (the Docker setup does this). Back up now still works while the worker runs.
        </Alert>
      ) : last?.offsite && !last.offsite.ok ? (
        <Alert tone="warning" title="The last backup was not copied off the server">
          {last.offsite.error ?? ''}
        </Alert>
      ) : null}
      {data.waitingLong && (
        <Alert tone="warning" title="Waiting for the worker">
          Backups are made by the worker. If this does not start in a minute, check that the worker is running.
        </Alert>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="card p-4">
          <p className="text-xs text-ink-500">{tx('Last good backup')}</p>
          <p className="mt-1 text-2xl font-extrabold text-ink-900">{last ? tr(timeAgo(last.finishedAt ?? last.createdAt)) : '—'}</p>
          <p className="mt-0.5 text-xs text-ink-500">
            {last
              ? [lastBytes('database') !== undefined && `${tr('Database')} ${size(lastBytes('database')!)}`, lastBytes('uploads') !== undefined && `${tr('Uploads')} ${size(lastBytes('uploads')!)}`].filter(Boolean).join(' · ')
              : tr('None yet')}
          </p>
        </div>
        <div className="card p-4">
          <p className="flex items-center gap-1.5 text-xs text-ink-500">
            <HardDrive className="h-3.5 w-3.5" /> {tx('On this server')}
          </p>
          <p className="mt-1 text-sm font-semibold text-ink-900">{data.scheduled ? tr(`Every night at ${hour}`) : tr('Only when asked')}</p>
          <p className="mt-0.5 text-xs text-ink-500">
            {tr(`Kept ${data.keepDays} days`)} · <span className="font-mono">{data.dir}</span>
          </p>
        </div>
        <div className="card p-4">
          <p className="flex items-center gap-1.5 text-xs text-ink-500">
            <CloudUpload className="h-3.5 w-3.5" /> {tx('Copy off the server')}
          </p>
          <p className="mt-1 text-sm font-semibold text-ink-900">{data.offsite ? <span className="font-mono">{data.offsite}</span> : tr('Not set up')}</p>
          <p className="mt-0.5 text-xs text-ink-500">{data.offsite ? tr('Every backup is copied there too') : tr('Set BACKUP_S3_BUCKET to keep copies in S3 or R2')}</p>
        </div>
      </div>

      <Card>
        <CardHeader
          icon={<DatabaseBackup className="h-4 w-4" />}
          title="Backups"
          description={data.uploads ? 'Each backup has the whole database (every hotel) and the uploaded files (guest IDs, bills, photos).' : 'Each backup has the whole database (every hotel). Uploaded files are already in S3 storage.'}
          action={
            <Button size="sm" loading={pending || Boolean(active)} onClick={() => run(() => queueBackupAction())}>
              <DatabaseBackup className="h-4 w-4" /> {active ? tr(active.status === 'running' ? 'Backing up…' : 'Waiting…') : tr('Back up now')}
            </Button>
          }
        />
        {data.runs.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-ink-500">{tx('No backups yet.')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="border-b border-ink-100 bg-ink-50/60 text-left text-[11px] tracking-wide text-ink-500 uppercase">
                <tr>
                  <th className="px-5 py-2">{tx('When')}</th>
                  <th className="px-3 py-2">{tx('Made by')}</th>
                  <th className="px-3 py-2">{tx('Files')}</th>
                  <th className="px-3 py-2">{tx('Off-site copy')}</th>
                  <th className="px-5 py-2">{tx('Status')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {data.runs.map((r) => (
                  <tr key={r.id} className="align-top">
                    <td className="px-5 py-2.5">
                      <p className="font-medium text-ink-900">{tr(timeAgo(r.startedAt ?? r.createdAt))}</p>
                      <p className="num text-xs text-ink-500">{formatDateTime(r.startedAt ?? r.createdAt)}</p>
                    </td>
                    <td className="px-3 py-2.5 text-ink-700">{tr(TRIGGER[r.trigger])}</td>
                    <td className="px-3 py-2.5">
                      {r.files.length === 0 && <span className="text-ink-400">—</span>}
                      <ul className="space-y-1">
                        {r.files.map((f) => (
                          <li key={f.name} className="flex items-center gap-2">
                            <span className="text-ink-700">{tr(f.kind === 'database' ? 'Database' : 'Uploads')}</span>
                            <span className="num text-xs text-ink-500">{size(f.bytes)}</span>
                            {f.onDisk ? (
                              <a href={`/api/admin/backups/${encodeURIComponent(f.name)}`} className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:underline" download title={f.name}>
                                <Download className="h-3.5 w-3.5" /> {tx('Download')}
                              </a>
                            ) : (
                              <span className="text-xs text-ink-400">{tx('Removed from server')}</span>
                            )}
                          </li>
                        ))}
                      </ul>
                    </td>
                    <td className="px-3 py-2.5 text-xs">
                      {!r.offsite ? <span className="text-ink-400">—</span> : r.offsite.ok ? <span className="text-emerald-700">{tx('Copied')}</span> : <span className="text-rose-700" title={r.offsite.error}>{tx('Not copied')}</span>}
                    </td>
                    <td className="px-5 py-2.5">
                      <Badge tone={STATUS[r.status].tone} dot>
                        {STATUS[r.status].label}
                      </Badge>
                      {r.status === 'failed' && r.error && <p className="mt-1 max-w-xs text-xs break-words text-rose-700">{r.error}</p>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="border-t border-ink-100 px-5 py-3 text-xs text-ink-500">{tx('To restore a backup, follow deploy/README.md → Backups. Restoring replaces everything in the database, for every hotel.')}</p>
      </Card>
    </div>
  );
}
