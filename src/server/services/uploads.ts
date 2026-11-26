import 'server-only';
import { inArray, sql } from 'drizzle-orm';
import { db } from '@/db';
import { uploads } from '@/db/schema';
import { deleteStoredFile } from '../storage';

/**
 * Delete uploads that no record uses: photos picked but never saved, ID copies staff removed, replaced logos.
 * Only files older than `olderThanHours`, so a form that is still open keeps its fresh uploads.
 */
export async function sweepUnusedUploads(olderThanHours = 24, batch = 200) {
  const { rows } = await db.execute<{ id: string; url: string }>(sql`
    SELECT u.id, u.url FROM uploads u
    WHERE u.created_at < now() - make_interval(hours => ${olderThanHours})
      AND NOT EXISTS (SELECT 1 FROM guests g WHERE u.url = ANY(g.id_photos))
      AND NOT EXISTS (SELECT 1 FROM room_types rt WHERE u.url = ANY(rt.photos))
      AND NOT EXISTS (SELECT 1 FROM properties p WHERE p.branding->>'logoUrl' = u.url OR p.branding->>'heroImageUrl' = u.url)
      AND NOT EXISTS (SELECT 1 FROM petty_cash pc WHERE pc.bill_photo_url = u.url)
    ORDER BY u.created_at
    LIMIT ${batch}`);
  const done: string[] = [];
  for (const row of rows) {
    try {
      await deleteStoredFile(row.url);
      done.push(row.id);
    } catch (error) {
      console.error('[uploads] could not delete', row.url, error);
    }
  }
  if (done.length) await db.delete(uploads).where(inArray(uploads.id, done));
  return { deleted: done.length };
}
