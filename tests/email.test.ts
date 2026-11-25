import net from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { resetEmailTransport, sendEmail } from '@/server/services/email';

/** A tiny SMTP server that keeps the last message, so the real nodemailer path is exercised. */
let server: net.Server;
let lastMessage = '';
let port = 0;

beforeAll(async () => {
  server = net.createServer((sock) => {
    let data = false;
    let buf = '';
    let mail = '';
    sock.write('220 test ESMTP\r\n');
    sock.on('data', (chunk) => {
      buf += chunk.toString('binary');
      for (;;) {
        if (data) {
          const end = buf.indexOf('\r\n.\r\n');
          if (end === -1) return;
          mail += buf.slice(0, end);
          buf = buf.slice(end + 5);
          data = false;
          lastMessage = mail;
          sock.write('250 OK\r\n');
          continue;
        }
        const nl = buf.indexOf('\r\n');
        if (nl === -1) return;
        const cmd = buf.slice(0, 4).toUpperCase();
        buf = buf.slice(nl + 2);
        if (cmd === 'EHLO') sock.write('250-test\r\n250 8BITMIME\r\n');
        else if (cmd === 'DATA') {
          data = true;
          sock.write('354 go\r\n');
        } else if (cmd === 'QUIT') {
          sock.write('221 bye\r\n');
          sock.end();
        } else sock.write('250 OK\r\n');
      }
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  port = (server.address() as net.AddressInfo).port;
  process.env.SMTP_URL = `smtp://127.0.0.1:${port}`;
  process.env.EMAIL_FROM = 'bills@hotel.example';
  resetEmailTransport();
});

afterAll(() => {
  server.close();
  delete process.env.SMTP_URL;
  delete process.env.EMAIL_FROM;
  resetEmailTransport();
});

describe('SMTP email', () => {
  it('sends the hotel name as sender, reply-to and the PDF as an attachment', async () => {
    const pdf = Buffer.from('%PDF-1.4 test invoice');
    await sendEmail({
      to: 'guest@example.com',
      subject: 'Tax invoice SRP/26-27/0001 · Shri Ram Portico',
      text: 'Dear Guest,\nYour invoice is attached.',
      attachments: [{ filename: 'SRP-26-27-0001.pdf', content: pdf, contentType: 'application/pdf' }],
      fromName: 'Shri Ram "Portico" <x>',
      replyTo: 'stay@hotel.example',
    });
    expect(lastMessage).toMatch(/^From: "?Shri Ram Portico x"? <bills@hotel\.example>/m);
    expect(lastMessage).toMatch(/^To: guest@example\.com/m);
    expect(lastMessage).toMatch(/^Reply-To: stay@hotel\.example/m);
    expect(lastMessage).toMatch(/Content-Type: application\/pdf; name=SRP-26-27-0001\.pdf/);
    const b64 = lastMessage.split('Content-Disposition: attachment; filename=SRP-26-27-0001.pdf')[1].trim().split(/\r\n\r\n|\r\n--/)[0];
    expect(Buffer.from(b64.replace(/\s+/g, ''), 'base64').toString()).toBe('%PDF-1.4 test invoice');
  });

  it('explains what is missing when EMAIL_FROM is not set', async () => {
    const from = process.env.EMAIL_FROM;
    delete process.env.EMAIL_FROM;
    await expect(sendEmail({ to: 'a@b.co', subject: 's', text: 't' })).rejects.toThrow('EMAIL_FROM');
    process.env.EMAIL_FROM = from;
  });
});
