import 'server-only';
import { randomBytes } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { UserError } from './errors';
import { s3ConfigFromEnv, s3Driver } from './storage-s3';

/**
 * File storage behind one small interface: local disk (`STORAGE_DIR`, default `.data/uploads`) or any S3-compatible
 * bucket (AWS S3, Cloudflare R2, MinIO) with `STORAGE_DRIVER=s3`. Files are always served through /files, so
 * private ones stay behind the app's permission check whichever driver stores them.
 *
 * Keys look like `prv/<propertyId>/ids/<random>.jpg`:
 * - `pub/…` files (room photos, logo, hero) are served to anyone, cached for a year (names never change).
 * - `prv/…` files (guest IDs, bills) are served only to signed-in staff of that property with the right permission.
 */
export const FOLDERS = {
  ids: 'prv',
  bills: 'prv',
  rooms: 'pub',
  branding: 'pub',
} as const;
export type Folder = keyof typeof FOLDERS;

interface StorageDriver {
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<Buffer | null>;
  remove(key: string): Promise<void>;
}

function localDriver(): StorageDriver {
  const root = path.resolve(process.env.STORAGE_DIR || path.join(process.cwd(), '.data', 'uploads'));
  const resolve = (key: string) => {
    const full = path.resolve(root, key);
    if (!full.startsWith(root + path.sep)) throw new Error('Bad storage key');
    return full;
  };
  return {
    async put(key, body) {
      const full = resolve(key);
      await mkdir(path.dirname(full), { recursive: true });
      await writeFile(full, body);
    },
    async get(key) {
      try {
        return await readFile(resolve(key));
      } catch {
        return null;
      }
    },
    async remove(key) {
      await rm(resolve(key), { force: true });
    },
  };
}

let driver: StorageDriver | null = null;
function storage(): StorageDriver {
  if (driver) return driver;
  const name = process.env.STORAGE_DRIVER || 'local';
  if (name === 's3') driver = s3Driver(s3ConfigFromEnv());
  else if (name === 'local') driver = localDriver();
  else throw new Error(`Unknown STORAGE_DRIVER "${name}". Use local or s3.`);
  return driver;
}

const KEY_PATTERN = /^(pub|prv)\/([0-9a-f-]{36})\/(ids|bills|rooms|branding)\/([A-Za-z0-9_-]{8,64}\.(jpg|png|webp))$/;

export const CONTENT_TYPES = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' } as const;

export function parseKey(key: string) {
  const match = KEY_PATTERN.exec(key);
  if (!match) return null;
  return { visibility: match[1] as 'pub' | 'prv', propertyId: match[2], folder: match[3] as Folder, ext: match[5] as keyof typeof CONTENT_TYPES };
}

/** Recognise the image from its first bytes; the browser's claimed type is not trusted. */
export function sniffImage(bytes: Buffer): keyof typeof CONTENT_TYPES | null {
  if (bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpg';
  if (bytes.length > 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (bytes.length > 12 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  return null;
}

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/** Save an uploaded image and return its URL (`/files/<key>`). */
export async function saveImage(propertyId: string, folder: Folder, file: File): Promise<string> {
  if (file.size === 0) throw new UserError('The file is empty.');
  if (file.size > MAX_IMAGE_BYTES) throw new UserError('Photo must be under 5 MB.');
  const bytes = Buffer.from(await file.arrayBuffer());
  const ext = sniffImage(bytes);
  if (!ext) throw new UserError('Upload a JPG, PNG or WebP photo. (iPhone HEIC photos: take the photo from this screen instead.)');
  const key = `${FOLDERS[folder]}/${propertyId}/${folder}/${Date.now().toString(36)}${randomBytes(6).toString('hex')}.${ext}`;
  await storage().put(key, bytes, CONTENT_TYPES[ext]);
  return `/files/${key}`;
}

export async function readStoredFile(key: string) {
  return storage().get(key);
}

/** Is this URL a file we stored for this property and folder? Used before saving a URL on a record. */
export function isOwnFile(url: string, propertyId: string, folder: Folder): boolean {
  if (!url.startsWith('/files/')) return false;
  const parsed = parseKey(url.slice('/files/'.length));
  return !!parsed && parsed.propertyId === propertyId && parsed.folder === folder;
}

/** Delete a stored file by URL (ignores URLs that are not ours). */
export async function removeFile(url: string, propertyId: string, folder: Folder) {
  if (!isOwnFile(url, propertyId, folder)) return;
  await storage().remove(url.slice('/files/'.length));
}
