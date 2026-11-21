import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { encodePath, s3ConfigFromEnv, s3Driver, signV4 } from '../src/server/storage-s3';

describe('AWS Signature V4', () => {
  it('matches the AWS documentation example (GET object with a Range header)', () => {
    // https://docs.aws.amazon.com/AmazonS3/latest/API/sig-v4-header-based-auth.html — "Example: GET Object"
    const headers = signV4({
      method: 'GET',
      host: 'examplebucket.s3.amazonaws.com',
      path: '/test.txt',
      headers: { range: 'bytes=0-9' },
      payloadHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      region: 'us-east-1',
      accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
      secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
      date: new Date('2013-05-24T00:00:00Z'),
    });
    expect(headers.authorization).toBe(
      'AWS4-HMAC-SHA256 Credential=AKIAIOSFODNN7EXAMPLE/20130524/us-east-1/s3/aws4_request, SignedHeaders=host;range;x-amz-content-sha256;x-amz-date, Signature=f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41',
    );
    expect(headers['x-amz-date']).toBe('20130524T000000Z');
  });

  it('encodes object paths the S3 way', () => {
    expect(encodePath('prv/a b/(c)!.jpg')).toBe('prv/a%20b/%28c%29%21.jpg');
  });

  it('picks path style for non-AWS endpoints (R2, MinIO) and virtual hosts for AWS', () => {
    const base = { S3_BUCKET: 'b', S3_ACCESS_KEY_ID: 'k', S3_SECRET_ACCESS_KEY: 's' };
    expect(s3ConfigFromEnv({ ...base, S3_ENDPOINT: 'https://acc.r2.cloudflarestorage.com' }).forcePathStyle).toBe(true);
    expect(s3ConfigFromEnv({ ...base, S3_ENDPOINT: 'https://s3.ap-south-1.amazonaws.com', S3_REGION: 'ap-south-1' }).forcePathStyle).toBe(false);
    expect(() => s3ConfigFromEnv({ S3_ENDPOINT: 'https://x' })).toThrow(/S3_BUCKET/);
  });
});

describe('S3 driver against a local stand-in', () => {
  const objects = new Map<string, { body: Buffer; type: string }>();
  const seen: { method: string; url: string; auth: string }[] = [];
  let server: Server;
  let endpoint = '';

  beforeAll(async () => {
    server = createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on('data', (c) => chunks.push(c));
      req.on('end', () => {
        seen.push({ method: req.method!, url: req.url!, auth: String(req.headers.authorization ?? '') });
        if (!String(req.headers.authorization).startsWith('AWS4-HMAC-SHA256 Credential=test-key/')) return res.writeHead(403).end();
        const key = req.url!;
        if (req.method === 'PUT') objects.set(key, { body: Buffer.concat(chunks), type: String(req.headers['content-type']) });
        if (req.method === 'GET') {
          const obj = objects.get(key);
          if (!obj) return res.writeHead(404).end();
          return res.writeHead(200, { 'Content-Type': obj.type }).end(obj.body);
        }
        if (req.method === 'DELETE') objects.delete(key);
        res.writeHead(req.method === 'DELETE' ? 204 : 200).end();
      });
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    endpoint = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

  it('puts, gets and deletes a signed object (path style)', async () => {
    const driver = s3Driver({ endpoint, region: 'auto', bucket: 'hotel-files', accessKeyId: 'test-key', secretAccessKey: 'secret', forcePathStyle: true });
    const body = Buffer.from([0xff, 0xd8, 0xff, 1, 2, 3]);
    await driver.put('prv/p1/ids/abc.jpg', body, 'image/jpeg');
    expect(seen.at(-1)).toMatchObject({ method: 'PUT', url: '/hotel-files/prv/p1/ids/abc.jpg' });
    expect(objects.get('/hotel-files/prv/p1/ids/abc.jpg')?.type).toBe('image/jpeg');
    expect(await driver.get('prv/p1/ids/abc.jpg')).toEqual(body);
    await driver.remove('prv/p1/ids/abc.jpg');
    expect(await driver.get('prv/p1/ids/abc.jpg')).toBeNull();
  });
});
