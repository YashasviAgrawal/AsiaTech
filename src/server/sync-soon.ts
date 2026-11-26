import 'server-only';
import { after } from 'next/server';

/**
 * "Every change is sent to all OTAs automatically within seconds": after the response is sent, drain this
 * property's outbox. The worker (`npm run worker`) still retries failures and catches anything missed.
 */
const scheduled = new Set<string>();

export function syncChannelsSoon(propertyId: string) {
  if (scheduled.has(propertyId)) return;
  try {
    scheduled.add(propertyId);
    after(async () => {
      scheduled.delete(propertyId);
      try {
        const { processSyncQueue } = await import('./services/channels');
        await processSyncQueue(propertyId, 100);
      } catch (error) {
        console.error('[sync-soon] failed', error);
      }
    });
  } catch {
    // Outside a request (seed, worker): the worker handles it.
    scheduled.delete(propertyId);
  }
}
