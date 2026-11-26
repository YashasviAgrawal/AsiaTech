import { createHash, createHmac } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';

/**
 * Minimal S3-compatible client (AWS S3, Cloudflare R2, MinIO, DigitalOcean Spaces) for the storage layer:
 * PUT, GET and DELETE of one object, signed with AWS Signature Version 4. No SDK, so nothing large to install.
 */
export interface S3Config {
  /** e.g. https://s3.ap-south-1.amazonaws.com or https://<account>.r2.cloudflarestorage.com */
  endpoint: string;
  /** e.g. ap-south-1; Cloudflare R2 uses "auto". */
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  /** Bucket in the path (https://host/bucket/key) instead of the host name. R2 and MinIO want true. */
  forcePathStyle: boolean;
}

const sha256Hex = (data: string | Buffer) => createHash('sha256').update(data).digest('hex');
const hmac = (key: Buffer | string, data: string) => createHmac('sha256', key).update(data).digest();

/** RFC 3986 encoding as SigV4 wants it; "/" is kept in object paths. */
export function encodePath(path: string) {
  return path
    .split('/')
    .map((segment) => encodeURIComponent(segment).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`))
    .join('/');
}

export interface SignInput {
  method: string;
  /** Host header value (no scheme). */
  host: string;
  /** Already-encoded absolute path, e.g. /bucket/prv/abc.jpg */
  path: string;
  /** Extra headers to sign (lowercase names), e.g. { range: 'bytes=0-9', 'content-type': 'image/jpeg' } */
  headers?: Record<string, string>;
  payloadHash: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  /** For tests; defaults to now. */
  date?: Date;
  service?: string;
}

/** AWS Signature Version 4: returns the headers to send (Authorization, x-amz-date, x-amz-content-sha256 and the signed ones). */
export function signV4(input: SignInput): Record<string, string> {
  const service = input.service ?? 's3';
  const amzDate = (input.date ?? new Date()).toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);
  const headers: Record<string, string> = {
    host: input.host,
    ...Object.fromEntries(Object.entries(input.headers ?? {}).map(([k, v]) => [k.toLowerCase(), v.trim()])),
    'x-amz-content-sha256': input.payloadHash,
    'x-amz-date': amzDate,
  };
  const names = Object.keys(headers).sort();
  const canonicalHeaders = names.map((n) => `${n}:${headers[n]}\n`).join('');
  const signedHeaders = names.join(';');
  const canonicalRequest = [input.method, input.path, '', canonicalHeaders, signedHeaders, input.payloadHash].join('\n');
  const scope = `${dateStamp}/${input.region}/${service}/aws4_request`;
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256Hex(canonicalRequest)].join('\n');
  const signingKey = hmac(hmac(hmac(hmac(`AWS4${input.secretAccessKey}`, dateStamp), input.region), service), 'aws4_request');
  const signature = createHmac('sha256', signingKey).update(stringToSign).digest('hex');
  const { host: _host, ...rest } = headers;
  return { ...rest, authorization: `AWS4-HMAC-SHA256 Credential=${input.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}` };
}

function target(config: S3Config, key: string) {
  const base = new URL(config.endpoint);
  const objectPath = encodePath(key);
  if (config.forcePathStyle) return { url: `${base.origin}/${config.bucket}/${objectPath}`, host: base.host, path: `/${config.bucket}/${objectPath}` };
  const host = `${config.bucket}.${base.host}`;
  return { url: `${base.protocol}//${host}/${objectPath}`, host, path: `/${objectPath}` };
}

async function send(config: S3Config, method: 'PUT' | 'GET' | 'DELETE', key: string, body?: Buffer, contentType?: string) {
  const { url, host, path } = target(config, key);
  const payloadHash = sha256Hex(body ?? '');
  const headers = signV4({
    method,
    host,
    path,
    headers: contentType ? { 'content-type': contentType } : undefined,
    payloadHash,
    region: config.region,
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
  });
  return fetch(url, { method, headers, body: body ? new Uint8Array(body) : undefined });
}

export function s3Driver(config: S3Config) {
  return {
    async put(key: string, body: Buffer, contentType: string) {
      const res = await send(config, 'PUT', key, body, contentType);
      if (!res.ok) throw new Error(`Storage upload failed (${res.status}): ${(await res.text()).slice(0, 200)}`);
    },
    async get(key: string): Promise<Buffer | null> {
      const res = await send(config, 'GET', key);
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`Storage read failed (${res.status})`);
      return Buffer.from(await res.arrayBuffer());
    },
    async remove(key: string) {
      const res = await send(config, 'DELETE', key);
      if (!res.ok && res.status !== 404) throw new Error(`Storage delete failed (${res.status})`);
    },
  };
}

/**
 * Streams a file from disk to one object (backups can be larger than is sensible to hold in memory). The body is
 * sent as UNSIGNED-PAYLOAD over the signed request, which S3, R2 and MinIO accept; one PUT takes up to 5 GB.
 */
export async function s3PutFile(config: S3Config, key: string, filePath: string, contentType = 'application/octet-stream') {
  const { url, host, path } = target(config, key);
  const { size } = await stat(/*turbopackIgnore: true*/ filePath);
  const headers = signV4({
    method: 'PUT',
    host,
    path,
    headers: { 'content-type': contentType, 'content-length': String(size) },
    payloadHash: 'UNSIGNED-PAYLOAD',
    region: config.region,
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
  });
  const send = url.startsWith('https:') ? httpsRequest : httpRequest;
  await new Promise<void>((resolve, reject) => {
    const req = send(url, { method: 'PUT', headers: { host, ...headers } }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => {
        const status = res.statusCode ?? 0;
        if (status >= 200 && status < 300) resolve();
        else reject(new Error(`Upload failed (${status}): ${Buffer.concat(chunks).toString('utf8').slice(0, 200)}`));
      });
    });
    req.setTimeout(10 * 60_000, () => req.destroy(new Error('Upload timed out')));
    req.on('error', reject);
    createReadStream(/*turbopackIgnore: true*/ filePath).on('error', reject).pipe(req);
  });
  return { key, bytes: size };
}

export function s3ConfigFromEnv(env: Record<string, string | undefined> = process.env): S3Config {
  const missing = ['S3_ENDPOINT', 'S3_BUCKET', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY'].filter((name) => !env[name]);
  if (missing.length) throw new Error(`STORAGE_DRIVER=s3 needs ${missing.join(', ')}.`);
  const endpoint = env.S3_ENDPOINT!;
  return {
    endpoint,
    region: env.S3_REGION || 'auto',
    bucket: env.S3_BUCKET!,
    accessKeyId: env.S3_ACCESS_KEY_ID!,
    secretAccessKey: env.S3_SECRET_ACCESS_KEY!,
    // AWS supports virtual-hosted buckets; R2 / MinIO / custom endpoints are simplest with path style.
    forcePathStyle: env.S3_FORCE_PATH_STYLE ? env.S3_FORCE_PATH_STYLE === 'true' : !/amazonaws\.com/.test(endpoint),
  };
}
