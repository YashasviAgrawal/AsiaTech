import './helpers';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db, pool } from '@/db';
import { backupRuns, users } from '@/db/schema';
import { backupHealth, backupOverview, markInterruptedRuns, nextBackupDue, queueBackup, runBackup, type BackupConfig } from '@/server/services/backup';

/** Nightly backups (worker) and "Back up now" (platform console), against the seeded test database. */
describe('backups', () => {
  let root = '';
  let config: BackupConfig;
  const objects = new Map<string, number>();
  let server: Server;
  let endpoint = '';

  beforeAll(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'hos-backup-'));
    const uploadsDir = path.join(root, 'uploads');
    await mkdir(path.join(uploadsDir, 'prv', 'p1', 'ids'), { recursive: true });
    await writeFile(path.join(uploadsDir, 'prv', 'p1', 'ids', 'id-front.jpg'), Buffer.from([0xff, 0xd8, 0xff, 1, 2, 3]));
    config = { dir: path.join(root, 'backups'), scheduled: true, hour: 3, keepDays: 14, uploadsDir, offsite: null, offsiteProblem: null };
    // A stand-in S3 bucket for the off-site copy.
    server = createServer((req, res) => {
      let bytes = 0;
      req.on('data', (c: Buffer) => (bytes += c.length));
      req.on('end', () => {
        if (!String(req.headers.authorization).includes('Credential=good-key/')) return res.writeHead(403).end('AccessDenied');
        objects.set(req.url!, bytes);
        res.writeHead(200).end();
      });
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    endpoint = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    await db.delete(backupRuns);
  });
  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(root, { recursive: true, force: true });
  });

  it('dumps every hotel with the app role (row-level security on) and archives the uploads', async () => {
    const result = await runBackup('manual', { config });
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.files.map((f) => f.kind)).toEqual(['database', 'uploads']);
    expect(await readdir(config.dir)).toEqual(expect.arrayContaining(result.files.map((f) => f.name)));

    const dump = path.join(config.dir, result.files[0].name);
    const list = execFileSync('pg_restore', ['--list', dump], { encoding: 'utf8' });
    expect(list).toMatch(/TABLE DATA public bookings /);
    expect(list).toMatch(/POLICY public bookings bookings_tenant/);
    expect(list).not.toMatch(/TABLE DATA public rate_limit_hits /);
    expect(list).not.toMatch(/TABLE DATA public backup_runs /);
    // Both hotels' rows are in it, not only one: nothing was stamped on the dump's connection.
    const properties = execFileSync('pg_restore', ['--data-only', '--table=properties', '--file=-', dump], { encoding: 'utf8' });
    expect(properties).toContain('shri-ram-portico');
    expect(properties).toContain('shri-ram-residency');
    const archive = execFileSync('tar', ['-tzf', path.join(config.dir, result.files[1].name)], { encoding: 'utf8' });
    expect(archive).toContain('prv/p1/ids/id-front.jpg');

    const [row] = await db.select().from(backupRuns).where(eq(backupRuns.id, result.id));
    expect(row).toMatchObject({ status: 'ok', trigger: 'manual', offsite: null, error: null });
    expect(row.finishedAt).toBeInstanceOf(Date);
  });

  it('runs one backup at a time', async () => {
    const other = await pool.connect();
    try {
      await other.query('SELECT pg_advisory_lock(7250311)');
      expect(await runBackup('manual', { config })).toEqual({ status: 'busy' });
      // Nothing is marked interrupted while a backup holds the lock.
      const [running] = await db.insert(backupRuns).values({ status: 'running', trigger: 'schedule', startedAt: new Date() }).returning();
      expect(await markInterruptedRuns()).toBe(0);
      await other.query('SELECT pg_advisory_unlock(7250311)');
      // Once nobody holds it, a run left "running" (worker restarted mid-way) is closed as failed.
      expect(await markInterruptedRuns()).toBe(1);
      const [after] = await db.select().from(backupRuns).where(eq(backupRuns.id, running.id));
      expect(after).toMatchObject({ status: 'failed', error: expect.stringContaining('Interrupted') });
    } finally {
      other.release();
    }
  });

  it('is due once per night, retries a failure after an hour, and takes "Back up now" first', async () => {
    const now = new Date();
    expect(await nextBackupDue(config, now)).toBeNull(); // the good backup above is after the last slot
    expect(await nextBackupDue({ ...config, scheduled: false }, new Date(now.getTime() + 2 * 86_400_000))).toBeNull();
    const tomorrow = new Date(now.getTime() + 26 * 60 * 60_000);
    expect(await nextBackupDue(config, tomorrow)).toEqual({ trigger: 'schedule' });

    const [fail] = await db.insert(backupRuns).values({ status: 'failed', trigger: 'schedule', error: 'disk full', createdAt: new Date(tomorrow.getTime() - 10 * 60_000) }).returning();
    expect(await nextBackupDue(config, tomorrow)).toBeNull();
    expect(await nextBackupDue(config, new Date(tomorrow.getTime() + 61 * 60_000))).toEqual({ trigger: 'schedule' });
    await db.delete(backupRuns).where(eq(backupRuns.id, fail.id));

    const [owner] = await db.select({ id: users.id }).from(users).where(eq(users.email, 'owner@shriramportico.in'));
    const queued = await queueBackup(owner.id);
    expect(queued.alreadyQueued).toBe(false);
    // Pressing it again while one waits does not queue a second.
    expect(await queueBackup(owner.id)).toEqual({ id: queued.id, alreadyQueued: true });
    const due = await nextBackupDue({ ...config, scheduled: false }, now);
    expect(due).toEqual({ trigger: 'console', runId: queued.id });
    const result = await runBackup(due!.trigger, { runId: due!.runId, config });
    expect(result).toMatchObject({ status: 'ok', id: queued.id });
    const [row] = await db.select().from(backupRuns).where(eq(backupRuns.id, queued.id));
    expect(row).toMatchObject({ status: 'ok', trigger: 'console' });
  });

  it('copies off the server, and a failed copy keeps the local backup', async () => {
    const offsite = { endpoint, region: 'auto', bucket: 'hotel-backups', accessKeyId: 'good-key', secretAccessKey: 's', forcePathStyle: true };
    const ok = await runBackup('manual', { config: { ...config, offsite } });
    if (ok.status !== 'ok') throw new Error('backup failed');
    expect(ok.offsite).toEqual({ ok: true, target: 'hotel-backups/backups/' });
    for (const file of ok.files) expect(objects.get(`/hotel-backups/backups/${file.name}`)).toBe(file.bytes);

    const refused = await runBackup('manual', { config: { ...config, offsite: { ...offsite, accessKeyId: 'bad-key' } } });
    expect(refused).toMatchObject({ status: 'ok', offsite: { ok: false, target: 'hotel-backups/backups/', error: expect.stringContaining('403') } });

    const halfSetUp = await runBackup('manual', { config: { ...config, offsiteProblem: { target: 'hotel-backups/backups/', error: 'BACKUP_S3_BUCKET needs S3_ENDPOINT.' } } });
    expect(halfSetUp).toMatchObject({ status: 'ok', offsite: { ok: false, error: 'BACKUP_S3_BUCKET needs S3_ENDPOINT.' } });
  });

  it('removes backups older than the kept days, never the newest', async () => {
    await writeFile(path.join(config.dir, 'hotel_os-2020-01-01-0300.dump'), 'old');
    await writeFile(path.join(config.dir, 'uploads-2020-01-01-0300.tar.gz'), 'old');
    await writeFile(path.join(config.dir, 'notes.txt'), 'kept: not a backup');
    const result = await runBackup('manual', { config });
    if (result.status !== 'ok') throw new Error('backup failed');
    expect(result.removed.sort()).toEqual(['hotel_os-2020-01-01-0300.dump', 'uploads-2020-01-01-0300.tar.gz']);
    expect(await readdir(config.dir)).toContain('notes.txt');
  });

  it('records a failure with the reason', async () => {
    const env = process.env.DATABASE_URL;
    process.env.DATABASE_URL = env!.replace(/\/[^/?]+(\?|$)/, '/no_such_database_test$1');
    try {
      const result = await runBackup('manual', { config });
      expect(result).toMatchObject({ status: 'failed', error: expect.stringContaining('no_such_database_test') });
    } finally {
      process.env.DATABASE_URL = env;
    }
  });

  it('tells the console when last night was missed', async () => {
    const fine = await backupOverview(config);
    expect(fine).toMatchObject({ scheduled: true, overdue: false, offsite: null, uploads: true });
    expect(fine.lastOk?.status).toBe('ok');
    expect(fine.runs.find((r) => r.status === 'ok')!.files.every((f) => f.onDisk)).toBe(true);
    // Two days on with no new backup: overdue, and the console shows the red alert.
    expect((await backupOverview(config, new Date(Date.now() + 2 * 86_400_000))).overdue).toBe(true);
    expect((await backupOverview({ ...config, scheduled: false }, new Date(Date.now() + 2 * 86_400_000))).overdue).toBe(false);
    // Home's Today's Task for the platform team uses the same check, with the reason of the last failure.
    const later = await backupHealth(config, new Date(Date.now() + 2 * 86_400_000));
    expect(later).toMatchObject({ overdue: true, lastError: expect.stringContaining('no_such_database_test') });
  });
});
