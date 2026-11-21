import { getContext } from '@/server/context';
import type { Permission } from '@/server/auth/permissions';
import { CONTENT_TYPES, parseKey, readStoredFile, type Folder } from '@/server/storage';

/** Who may open private files, by folder. */
const PRIVATE_PERMISSION: Partial<Record<Folder, Permission>> = { ids: 'bookings.view', bills: 'money.view' };

/**
 * Serves stored files. Public ones (room photos, logo, hero) to anyone with a long cache; private ones (guest IDs,
 * bills) only to signed-in staff of the same property, never cached by shared caches.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ key: string[] }> }) {
  const { key: parts } = await params;
  const key = parts.join('/');
  const parsed = parseKey(key);
  if (!parsed) return new Response('Not found', { status: 404 });

  if (parsed.visibility === 'prv') {
    const ctx = await getContext();
    const permission = PRIVATE_PERMISSION[parsed.folder];
    if (!ctx || ctx.propertyId !== parsed.propertyId || !permission || !ctx.can(permission)) return new Response('Not found', { status: 404 });
  }

  const body = await readStoredFile(key);
  if (!body) return new Response('Not found', { status: 404 });
  return new Response(new Uint8Array(body), {
    headers: {
      'Content-Type': CONTENT_TYPES[parsed.ext],
      'Content-Length': String(body.length),
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'",
      'Cache-Control': parsed.visibility === 'pub' ? 'public, max-age=31536000, immutable' : 'private, no-store',
    },
  });
}
