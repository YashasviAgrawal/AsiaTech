/**
 * Background worker: `npm run worker`. Drains the OTA push queue, releases expired holds, removes unused uploads
 * every hour, runs the monthly zero-bookings check and makes the nightly backup (when BACKUP_DIR is set). Phase 1 uses the database as the queue; swap for Redis + BullMQ when volume grows.
 */
import 'dotenv/config';
import { and, eq, gte, sql } from 'drizzle-orm';
import { db, pool } from '../../db';
import { bookings, properties } from '../../db/schema';
import { processSyncQueue } from '../services/channels';
import { releaseExpiredHolds } from '../services/bookings';
import { systemActor } from '../services/actor';
import { sendMessage } from '../services/messaging';
import { sweepUnusedUploads } from '../services/uploads';
import { backupConfig, markInterruptedRuns, nextBackupDue, runBackup } from '../services/backup';
import { addDay, todayIST } from '../../lib/format';

let running = true;
process.on('SIGINT', () => (running = false));
process.on('SIGTERM', () => (running = false));

async function zeroBookingsCheck() {
  const today = todayIST();
  if (!today.endsWith('-01')) return;
  const props = await db.select().from(properties).where(eq(properties.status, 'live'));
  for (const p of props) {
    const n = p.settings.notifications;
    if (!n.zeroBookingsAlert || n.emails.length === 0) continue;
    const since = addDay(today, -30 * n.zeroBookingsMonths);
    const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(bookings).where(and(eq(bookings.propertyId, p.id), gte(bookings.createdAt, new Date(since))));
    if (count > 0) continue;
    for (const email of n.emails) {
      await sendMessage({ propertyId: p.id, channel: 'email', to: email, template: 'zero_bookings', body: `${p.name} has received zero bookings in the past ${n.zeroBookingsMonths} month(s). Check rates, OTA listings and promotions.` });
    }
  }
}

async function tick() {
  const sync = await processSyncQueue(undefined, 200);
  const props = await db.select({ id: properties.id }).from(properties);
  let released = 0;
  for (const p of props) released += await releaseExpiredHolds(await systemActor(p.id));
  if (sync.processed || released) console.log(`[worker] sync ${sync.ok} ok / ${sync.failed} failed · holds released ${released}`);
}

const backups = backupConfig();
let backupRunning = false;

/** Once a minute: a queued "Back up now" or tonight's backup. Runs beside the queue, which keeps draining. */
async function backupCheck() {
  if (backupRunning) return;
  await markInterruptedRuns();
  const due = await nextBackupDue(backups);
  if (!due) return;
  backupRunning = true;
  console.log(`[worker] backup started (${due.trigger === 'console' ? 'asked for in the platform console' : 'nightly'})`);
  runBackup(due.trigger, { runId: due.runId, config: backups })
    .then((result) => {
      if (result.status === 'busy') return console.log('[worker] backup skipped: another backup is running');
      if (result.status === 'failed') return console.error(`[worker] backup failed: ${result.error}`);
      const size = result.files.reduce((sum, f) => sum + f.bytes, 0);
      const offsite = result.offsite ? (result.offsite.ok ? ` · copied to ${result.offsite.target}` : ` · off-site copy failed: ${result.offsite.error}`) : '';
      console.log(`[worker] backup done: ${result.files.map((f) => f.name).join(', ')} (${(size / 1024 / 1024).toFixed(1)} MB)${offsite}`);
    })
    .catch((error) => console.error('[worker] backup failed', error))
    .finally(() => (backupRunning = false));
}

async function main() {
  console.log(`[worker] started${backups.scheduled ? ` · nightly backup at ${String(backups.hour).padStart(2, '0')}:00 to ${backups.dir}` : ''}`);
  let lastDaily = '';
  let lastSweep = 0;
  let lastBackupCheck = 0;
  while (running) {
    try {
      await tick();
      if (Date.now() - lastBackupCheck > 60_000) {
        lastBackupCheck = Date.now();
        await backupCheck();
      }
      if (Date.now() - lastSweep > 60 * 60_000) {
        lastSweep = Date.now();
        const { deleted } = await sweepUnusedUploads();
        if (deleted) console.log(`[worker] removed ${deleted} unused upload(s)`);
      }
      if (lastDaily !== todayIST()) {
        lastDaily = todayIST();
        await zeroBookingsCheck();
      }
    } catch (error) {
      console.error('[worker] tick failed', error);
    }
    await new Promise((r) => setTimeout(r, 5000));
  }
  while (backupRunning) await new Promise((r) => setTimeout(r, 1000));
  await pool.end();
}

void main();
