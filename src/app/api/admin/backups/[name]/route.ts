import { createReadStream } from 'node:fs';
import { Readable } from 'node:stream';
import { getContext } from '@/server/context';
import { logActivity } from '@/server/audit';
import { backupFilePath } from '@/server/services/backup';

/**
 * Platform team only: download a backup kept on this server (to keep a copy elsewhere, or to restore on another
 * machine). Everyone else gets a 404, as for the console itself. Each download is written to the activity log.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ name: string }> }) {
  const ctx = await getContext();
  if (!ctx) return new Response('Unauthorised', { status: 401 });
  if (!ctx.user.isSuperAdmin) return new Response('Not found', { status: 404 });
  const { name } = await params;
  const file = await backupFilePath(name);
  if (!file) return new Response('This backup is no longer on the server.', { status: 404 });
  await logActivity({ propertyId: ctx.propertyId, userId: ctx.userId, entityType: 'backup', entityId: null, action: 'export', summary: `Downloaded backup ${name}` });
  return new Response(Readable.toWeb(createReadStream(/*turbopackIgnore: true*/ file.full)) as ReadableStream, {
    headers: {
      'Content-Type': name.endsWith('.tar.gz') ? 'application/gzip' : 'application/octet-stream',
      'Content-Length': String(file.bytes),
      'Content-Disposition': `attachment; filename="${name}"`,
      'Cache-Control': 'no-store',
    },
  });
}
