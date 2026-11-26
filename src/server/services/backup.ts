import { spawn } from 'node:child_process';
import { mkdir, readdir, rename, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { and, desc, eq, gte, inArray, lt } from 'drizzle-orm';
import { db, pool } from '../../db';
import { backupRuns } from '../../db/schema';
import { addDay, todayIST } from '../../lib/format';
import { s3ConfigFromEnv, s3PutFile, type S3Config } from '../storage-s3';

/**
 * Database backups. The worker makes one every night when BACKUP_DIR is set (Docker sets it), and whenever the
 * platform console asks ("Back up now"); `npm run backup` makes one by hand.
 *
 * Each backup is a `pg_dump` custom-format file of the whole database (every hotel) and, with local storage, a
 * .tar.gz of the uploads (guest IDs, bills, photos). Files older than BACKUP_KEEP_DAYS are deleted, but the newest
 * of each kind is always kept. With BACKUP_S3_BUCKET the files are also copied off the server.
 */
export interface BackupConfig {
  dir: string;
  /** Nightly backups are on (BACKUP_DIR is set). */
  scheduled: boolean;
  /** Hour of the night (India time) the nightly backup starts. */
  hour: number;
  keepDays: number;
  /** Uploads live on this server's disk, so they are archived too. */
  uploadsDir: string | null;
  offsite: S3Config | null;
  /** BACKUP_S3_BUCKET is set but the S3 settings are incomplete: shown as a failed copy, never a stopped worker. */
  offsiteProblem: { target: string; error: string } | null;
}

export const BACKUP_FILE = /^(hotel_os|uploads)-(\d{4}-\d{2}-\d{2})-(\d{4})(-\d+)?\.(dump|tar\.gz)$/;
const LOCK_KEY = 7_250_311; // pg advisory lock: one backup at a time across the worker and `npm run backup`

export function backupConfig(env: Record<string, string | undefined> = process.env): BackupConfig {
  const hour = Number(env.BACKUP_HOUR ?? 3);
  const keepDays = Number(env.BACKUP_KEEP_DAYS ?? 14);
  const local = (env.STORAGE_DRIVER || 'local') === 'local';
  let offsite: S3Config | null = null;
  let offsiteProblem: BackupConfig['offsiteProblem'] = null;
  if (env.BACKUP_S3_BUCKET) {
    try {
      offsite = s3ConfigFromEnv({ ...env, S3_BUCKET: env.BACKUP_S3_BUCKET });
    } catch (error) {
      offsiteProblem = { target: `${env.BACKUP_S3_BUCKET}/backups/`, error: (error as Error).message.replace('STORAGE_DRIVER=s3', 'BACKUP_S3_BUCKET') };
    }
  }
  return {
    dir: path.resolve(/*turbopackIgnore: true*/ env.BACKUP_DIR || path.join(/*turbopackIgnore: true*/ process.cwd(), '.data', 'backups')),
    scheduled: Boolean(env.BACKUP_DIR),
    hour: Number.isInteger(hour) && hour >= 0 && hour <= 23 ? hour : 3,
    keepDays: Number.isInteger(keepDays) && keepDays >= 1 ? keepDays : 14,
    uploadsDir: local ? path.resolve(/*turbopackIgnore: true*/ env.STORAGE_DIR || path.join(/*turbopackIgnore: true*/ process.cwd(), '.data', 'uploads')) : null,
    offsite,
    offsiteProblem,
  };
}

/** Where off-site copies go, for people to read ("hotel-backups/backups/"). */
export function offsiteLabel(config: S3Config) {
  return `${config.bucket}/backups/`;
}

/** "2026-11-26-0300" in India time. */
export function backupStamp(now: Date) {
  const ist = new Date(now.getTime() + 330 * 60_000);
  return `${ist.toISOString().slice(0, 10)}-${ist.toISOString().slice(11, 16).replace(':', '')}`;
}

/** The start of the most recent nightly slot: today at BACKUP_HOUR (India time), or yesterday's if that is still ahead. */
export function lastSlot(now: Date, hour: number): Date {
  const today = todayIST(now);
  const at = (day: string) => new Date(`${day}T${String(hour).padStart(2, '0')}:00:00+05:30`);
  const slot = at(today);
  return slot <= now ? slot : at(addDay(today, -1));
}

/** Files to delete: older than keepDays (by the date in the name), never the newest database dump or uploads archive. */
export function filesToPrune(names: string[], today: string, keepDays: number): string[] {
  const oldest = addDay(today, -keepDays + 1);
  const backups = names.filter((n) => BACKUP_FILE.test(n)).sort();
  const newest = new Set(['hotel_os', 'uploads'].map((kind) => backups.filter((n) => n.startsWith(`${kind}-`)).at(-1)).filter(Boolean));
  return backups.filter((n) => n.match(BACKUP_FILE)![2] < oldest && !newest.has(n));
}

function run(command: string, args: string[], env: NodeJS.ProcessEnv, timeoutMs: number) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, { env, stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (c: Buffer) => (stderr = (stderr + c.toString('utf8')).slice(-800)));
    const timer = setTimeout(() => child.kill('SIGTERM'), timeoutMs);
    child.on('error', (error: NodeJS.ErrnoException) => {
      clearTimeout(timer);
      reject(error.code === 'ENOENT' ? new Error(`${command} is not installed on this server. In Docker it comes with the tools image (the worker).`) : error);
    });
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(`${command} ${signal ? `was stopped (${signal})` : `failed (exit ${code})`}${stderr.trim() ? `: ${stderr.trim()}` : ''}`));
    });
  });
}

async function freeName(dir: string, base: string, ext: string) {
  const taken = new Set(await readdir(/*turbopackIgnore: true*/ dir));
  for (let i = 1; ; i++) {
    const name = `${base}${i > 1 ? `-${i}` : ''}${ext}`;
    if (!taken.has(name) && !taken.has(`${name}.partial`)) return name;
  }
}

async function dumpDatabase(dir: string, stamp: string) {
  const url = new URL(process.env.DATABASE_URL ?? 'postgresql://hotel:hotel@localhost:5432/hotel_os');
  const password = decodeURIComponent(url.password);
  url.password = '';
  const name = await freeName(dir, `hotel_os-${stamp}`, '.dump');
  const partial = path.join(/*turbopackIgnore: true*/ dir, `${name}.partial`);
  // The app's role owns the tables and row-level security is FORCEd for it; with no hotel stamped on the
  // connection the policies show every row, so --enable-row-security dumps everything without a superuser.
  // rate_limit_hits is UNLOGGED and throwaway: its rows are left out. So is the backup history: it describes this
  // server's backup files (and would show this very backup as still running after a restore).
  await run(
    'pg_dump',
    ['--format=custom', '--compress=6', '--enable-row-security', '--no-unlogged-table-data', '--exclude-table-data=backup_runs', `--file=${partial}`, `--dbname=${url.toString()}`],
    { ...process.env, PGPASSWORD: password, PGAPPNAME: 'asiatech-backup' },
    30 * 60_000,
  );
  await rename(/*turbopackIgnore: true*/ partial, path.join(/*turbopackIgnore: true*/ dir, name));
  return { name, kind: 'database' as const, bytes: (await stat(/*turbopackIgnore: true*/ path.join(/*turbopackIgnore: true*/ dir, name))).size };
}

async function archiveUploads(dir: string, uploadsDir: string, stamp: string) {
  const entries = await readdir(/*turbopackIgnore: true*/ uploadsDir).catch(() => [] as string[]);
  if (entries.length === 0) return null;
  const name = await freeName(dir, `uploads-${stamp}`, '.tar.gz');
  const partial = path.join(/*turbopackIgnore: true*/ dir, `${name}.partial`);
  await run('tar', ['-czf', partial, '-C', uploadsDir, '.'], process.env, 30 * 60_000);
  await rename(/*turbopackIgnore: true*/ partial, path.join(/*turbopackIgnore: true*/ dir, name));
  return { name, kind: 'uploads' as const, bytes: (await stat(/*turbopackIgnore: true*/ path.join(/*turbopackIgnore: true*/ dir, name))).size };
}

async function prune(dir: string, keepDays: number, now: Date) {
  const names = await readdir(/*turbopackIgnore: true*/ dir);
  const removed = filesToPrune(names, todayIST(now), keepDays);
  for (const name of removed) await rm(/*turbopackIgnore: true*/ path.join(/*turbopackIgnore: true*/ dir, name), { force: true });
  // A backup interrupted half-way (server restart) leaves a .partial behind.
  for (const name of names.filter((n) => n.endsWith('.partial'))) {
    const info = await stat(/*turbopackIgnore: true*/ path.join(/*turbopackIgnore: true*/ dir, name)).catch(() => null);
    if (info && now.getTime() - info.mtimeMs > 6 * 60 * 60_000) await rm(/*turbopackIgnore: true*/ path.join(/*turbopackIgnore: true*/ dir, name), { force: true });
  }
  // The list of runs in the console only needs a few months.
  await db.delete(backupRuns).where(lt(backupRuns.createdAt, new Date(now.getTime() - 90 * 86_400_000)));
  return removed;
}

export type BackupResult =
  | { status: 'busy' }
  | { status: 'ok' | 'failed'; id: string; files: { name: string; kind: 'database' | 'uploads'; bytes: number }[]; offsite: { ok: boolean; target: string; error?: string } | null; removed: string[]; error?: string };

/**
 * Makes one backup. `runId` is a queued row from the console; otherwise a new row is written. Only one backup runs at a
 * time (a Postgres advisory lock), so a nightly run and "Back up now" never overlap.
 */
export async function runBackup(trigger: 'schedule' | 'manual' | 'console', options: { runId?: string; config?: BackupConfig; now?: () => Date } = {}): Promise<BackupResult> {
  const config = options.config ?? backupConfig();
  const now = options.now ?? (() => new Date());
  const lock = await pool.connect();
  try {
    const { rows } = await lock.query<{ ok: boolean }>('SELECT pg_try_advisory_lock($1) AS ok', [LOCK_KEY]);
    if (!rows[0].ok) return { status: 'busy' };
    try {
      let id = options.runId;
      if (id) await db.update(backupRuns).set({ status: 'running', startedAt: now() }).where(eq(backupRuns.id, id));
      else [{ id }] = await db.insert(backupRuns).values({ status: 'running', trigger, startedAt: now() }).returning({ id: backupRuns.id });

      const files: { name: string; kind: 'database' | 'uploads'; bytes: number }[] = [];
      let offsite: { ok: boolean; target: string; error?: string } | null = null;
      let removed: string[] = [];
      try {
        await mkdir(/*turbopackIgnore: true*/ config.dir, { recursive: true });
        const stamp = backupStamp(now());
        files.push(await dumpDatabase(config.dir, stamp));
        if (config.uploadsDir) {
          const archive = await archiveUploads(config.dir, config.uploadsDir, stamp);
          if (archive) files.push(archive);
        }
        if (config.offsiteProblem) offsite = { ok: false, ...config.offsiteProblem };
        else if (config.offsite) {
          offsite = { ok: true, target: offsiteLabel(config.offsite) };
          try {
            for (const file of files) await s3PutFile(config.offsite, `backups/${file.name}`, path.join(/*turbopackIgnore: true*/ config.dir, file.name), file.kind === 'database' ? 'application/octet-stream' : 'application/gzip');
          } catch (error) {
            offsite = { ok: false, target: offsiteLabel(config.offsite), error: (error as Error).message.slice(0, 300) };
          }
        }
        removed = await prune(config.dir, config.keepDays, now());
        await db.update(backupRuns).set({ status: 'ok', files, offsite, finishedAt: now() }).where(eq(backupRuns.id, id!));
        return { status: 'ok', id: id!, files, offsite, removed };
      } catch (error) {
        const message = (error as Error).message.slice(0, 600);
        await db.update(backupRuns).set({ status: 'failed', files, offsite, error: message, finishedAt: now() }).where(eq(backupRuns.id, id!));
        return { status: 'failed', id: id!, files, offsite, removed, error: message };
      }
    } finally {
      await lock.query('SELECT pg_advisory_unlock($1)', [LOCK_KEY]);
    }
  } finally {
    lock.release();
  }
}

/**
 * For the worker, once a minute: a queued "Back up now", or tonight's backup if none has been made since the last
 * nightly slot. After a failure it tries again an hour later.
 */
export async function nextBackupDue(config: BackupConfig, now: Date = new Date()): Promise<{ trigger: 'console' | 'schedule'; runId?: string } | null> {
  const [queued] = await db.select({ id: backupRuns.id }).from(backupRuns).where(eq(backupRuns.status, 'queued')).orderBy(backupRuns.createdAt).limit(1);
  if (queued) return { trigger: 'console', runId: queued.id };
  if (!config.scheduled) return null;
  const since = lastSlot(now, config.hour);
  const recent = await db
    .select({ status: backupRuns.status, createdAt: backupRuns.createdAt })
    .from(backupRuns)
    .where(and(gte(backupRuns.createdAt, since), inArray(backupRuns.status, ['ok', 'running', 'failed'])))
    .orderBy(desc(backupRuns.createdAt));
  if (recent.some((r) => r.status === 'ok' || r.status === 'running')) return null;
  const lastFail = recent.find((r) => r.status === 'failed');
  if (lastFail && now.getTime() - lastFail.createdAt.getTime() < 60 * 60_000) return null;
  return { trigger: 'schedule' };
}

/**
 * A run left "running" by a worker that stopped mid-way (restart, deploy). If nobody holds the backup lock, nothing
 * is running, so such rows are marked failed and the next backup can start.
 */
export async function markInterruptedRuns(now: Date = new Date()) {
  const lock = await pool.connect();
  try {
    const { rows } = await lock.query<{ ok: boolean }>('SELECT pg_try_advisory_lock($1) AS ok', [LOCK_KEY]);
    if (!rows[0].ok) return 0;
    try {
      const stale = await db
        .update(backupRuns)
        .set({ status: 'failed', error: 'Interrupted: the worker stopped while this backup was running.', finishedAt: now })
        .where(eq(backupRuns.status, 'running'))
        .returning({ id: backupRuns.id });
      return stale.length;
    } finally {
      await lock.query('SELECT pg_advisory_unlock($1)', [LOCK_KEY]);
    }
  } finally {
    lock.release();
  }
}

/** "Back up now" in the platform console: the worker (which has pg_dump) picks it up within a minute. */
export async function queueBackup(userId: string) {
  const [pending] = await db.select({ id: backupRuns.id }).from(backupRuns).where(inArray(backupRuns.status, ['queued', 'running'])).limit(1);
  if (pending) return { id: pending.id, alreadyQueued: true };
  const [row] = await db.insert(backupRuns).values({ status: 'queued', trigger: 'console', requestedBy: userId }).returning({ id: backupRuns.id });
  return { id: row.id, alreadyQueued: false };
}

/**
 * Is there a good backup since last night? Overdue: a nightly slot has passed (with 2 hours for the backup to run)
 * and no good backup since. `lastError` is the latest failure after the last good backup.
 */
export async function backupHealth(config: BackupConfig = backupConfig(), now: Date = new Date()) {
  const [lastOk] = await db.select().from(backupRuns).where(eq(backupRuns.status, 'ok')).orderBy(desc(backupRuns.finishedAt)).limit(1);
  const [lastFailed] = await db
    .select({ error: backupRuns.error, createdAt: backupRuns.createdAt })
    .from(backupRuns)
    .where(and(eq(backupRuns.status, 'failed'), lastOk ? gte(backupRuns.createdAt, lastOk.createdAt) : undefined))
    .orderBy(desc(backupRuns.createdAt))
    .limit(1);
  const slot = lastSlot(now, config.hour);
  const overdue = config.scheduled && now.getTime() - slot.getTime() > 2 * 60 * 60_000 && (!lastOk?.finishedAt || lastOk.finishedAt < slot);
  return { lastOk: lastOk ?? null, lastError: lastFailed?.error ?? null, overdue };
}

/** For the platform console. `onDisk` says which files can still be downloaded from this server. */
export async function backupOverview(config: BackupConfig = backupConfig(), now: Date = new Date()) {
  const runs = await db.select().from(backupRuns).orderBy(desc(backupRuns.createdAt)).limit(12);
  const onDisk = new Set(await readdir(/*turbopackIgnore: true*/ config.dir).catch(() => [] as string[]));
  const { lastOk, overdue } = await backupHealth(config, now);
  return {
    scheduled: config.scheduled,
    hour: config.hour,
    keepDays: config.keepDays,
    dir: config.dir,
    uploads: Boolean(config.uploadsDir),
    offsite: config.offsite ? offsiteLabel(config.offsite) : (config.offsiteProblem?.target ?? null),
    lastOk,
    overdue,
    waitingLong: runs.some((r) => r.status === 'queued' && now.getTime() - r.createdAt.getTime() > 3 * 60_000),
    runs: runs.map((r) => ({ ...r, files: r.files.map((f) => ({ ...f, onDisk: onDisk.has(f.name) })) })),
  };
}

/** Full path of a backup file for download, or null when the name is not a backup or the file is gone. */
export async function backupFilePath(name: string, config: BackupConfig = backupConfig()) {
  if (!BACKUP_FILE.test(name)) return null;
  const full = path.join(/*turbopackIgnore: true*/ config.dir, name);
  const info = await stat(/*turbopackIgnore: true*/ full).catch(() => null);
  return info?.isFile() ? { full, bytes: info.size } : null;
}
