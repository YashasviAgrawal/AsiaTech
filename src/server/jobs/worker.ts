/**
 * Background worker: `npm run worker`. Drains the OTA push queue, releases expired holds and runs the monthly
 * zero-bookings check. Phase 1 uses the database as the queue; swap for Redis + BullMQ when volume grows.
 */
import 'dotenv/config';
import { and, eq, gte, sql } from 'drizzle-orm';
import { db, pool } from '../../db';
import { bookings, properties } from '../../db/schema';
import { processSyncQueue } from '../services/channels';
import { releaseExpiredHolds } from '../services/bookings';
import { systemActor } from '../services/actor';
import { sendMessage } from '../services/messaging';
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

async function main() {
  console.log('[worker] started');
  let lastDaily = '';
  while (running) {
    try {
      await tick();
      if (lastDaily !== todayIST()) {
        lastDaily = todayIST();
        await zeroBookingsCheck();
      }
    } catch (error) {
      console.error('[worker] tick failed', error);
    }
    await new Promise((r) => setTimeout(r, 5000));
  }
  await pool.end();
}

void main();
