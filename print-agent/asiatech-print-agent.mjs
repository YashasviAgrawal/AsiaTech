#!/usr/bin/env node
/**
 * AsiaTech print agent.
 *
 * Runs on one PC in the hotel (front desk or restaurant counter) and prints KOTs and bills on the thermal
 * printers of the local network. The AsiaTech app is in the cloud and cannot reach those printers itself;
 * this agent asks the app for new tickets and sends them on. Needs Node.js 18 or newer, nothing else.
 *
 *   node asiatech-print-agent.mjs --server https://your-hotel.example.com --key hpa_xxxxxxxx
 *
 * The key can also come from the ASIATECH_PRINT_KEY environment variable (and the server from
 * ASIATECH_SERVER), which keeps it out of the process list.
 *
 * Check a printer without the app:
 *
 *   node asiatech-print-agent.mjs --test 192.168.1.50          (network printer, port 9100)
 *   node asiatech-print-agent.mjs --test \\localhost\KOT        (Windows shared printer, "Generic / Text Only" driver)
 *   node asiatech-print-agent.mjs --test /dev/usb/lp0           (USB printer on Linux)
 */
import net from 'node:net';
import { writeFile } from 'node:fs/promises';

const VERSION = '1.0.0';

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
}

const log = (...parts) => console.log(new Date().toLocaleTimeString('en-IN', { hour12: false }), ...parts);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Send raw bytes to a network printer (RAW / JetDirect, usually port 9100). */
function sendToNetwork(address, bytes) {
  const [host, portText] = address.split(':');
  const port = Number(portText) || 9100;
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host, port });
    let done = false;
    const finish = (error) => {
      if (done) return;
      done = true;
      socket.destroy();
      if (error) reject(error);
      else resolve();
    };
    socket.setTimeout(8000, () => finish(new Error(`No answer from ${host}:${port} (is the printer on and on this network?)`)));
    socket.on('error', (e) => finish(new Error(e.code === 'ECONNREFUSED' ? `${host}:${port} refused the connection (wrong port, or not a network printer)` : e.code === 'EHOSTUNREACH' || e.code === 'ENETUNREACH' ? `${host} is not reachable from this PC` : e.message)));
    socket.on('connect', () => {
      socket.end(bytes, () => setTimeout(() => finish(), 150));
    });
  });
}

/** Windows shared printer (\\localhost\KOT) or a USB device file (/dev/usb/lp0). */
async function sendToShared(address, bytes) {
  await writeFile(address, bytes);
}

function send(printer, bytes) {
  return printer.connection === 'shared' ? sendToShared(printer.address, bytes) : sendToNetwork(printer.address, bytes);
}

function testPage(target) {
  const ESC = 0x1b;
  const GS = 0x1d;
  const text = (s) => Buffer.from(`${s}\n`, 'ascii');
  return Buffer.concat([
    Buffer.from([ESC, 0x40, ESC, 0x61, 1, ESC, 0x45, 1, GS, 0x21, 0x11]),
    text('Printer test'),
    Buffer.from([GS, 0x21, 0x00, ESC, 0x45, 0]),
    text('AsiaTech print agent'),
    text(target),
    text(new Date().toLocaleString('en-IN')),
    text('If this prints clearly, the printer works.'),
    Buffer.from([ESC, 0x64, 4, GS, 0x56, 0x42, 0x00]),
  ]);
}

async function runTest(target) {
  const printer = /^[A-Za-z0-9.-]+(:\d+)?$/.test(target) ? { connection: 'network', address: target.includes(':') ? target : `${target}:9100` } : { connection: 'shared', address: target };
  try {
    await send(printer, testPage(printer.address));
    log(`✔ Test page sent to ${printer.address}`);
    process.exit(0);
  } catch (e) {
    log(`✘ ${e.message}`);
    process.exit(1);
  }
}

async function main() {
  const test = arg('test');
  if (test) return runTest(test);

  const server = (arg('server') || process.env.ASIATECH_SERVER || '').replace(/\/+$/, '');
  const key = arg('key') || process.env.ASIATECH_PRINT_KEY || '';
  if (!server || !key) {
    console.log('Usage: node asiatech-print-agent.mjs --server https://your-hotel.example.com --key hpa_xxxxxxxx');
    console.log('       (or set ASIATECH_SERVER and ASIATECH_PRINT_KEY)');
    process.exit(2);
  }
  if (Number(process.versions.node.split('.')[0]) < 18) {
    console.log(`Node.js 18 or newer is needed (this is ${process.versions.node}).`);
    process.exit(2);
  }

  const headers = { Authorization: `Bearer ${key}`, 'User-Agent': `asiatech-print-agent/${VERSION}` };
  let backoff = 2000;
  let connected = false;
  let stopping = false;
  process.on('SIGINT', () => {
    stopping = true;
    log('Stopping…');
    process.exit(0);
  });

  log(`AsiaTech print agent ${VERSION} · ${server}`);
  while (!stopping) {
    let jobs;
    try {
      const res = await fetch(`${server}/api/print-agent/jobs?wait=25`, { headers, signal: AbortSignal.timeout(40_000) });
      if (res.status === 401) {
        log('✘ The app does not know this key (revoked or mistyped). Create a new key in Restaurant → Printers.');
        process.exit(3);
      }
      if (!res.ok) throw new Error(`server answered ${res.status}`);
      ({ jobs } = await res.json());
      if (!connected) log('✔ Connected. Waiting for KOTs and bills…');
      connected = true;
      backoff = 2000;
    } catch (e) {
      if (connected) log(`Connection lost (${e.message}). Retrying…`);
      else log(`Cannot reach the app (${e.message}). Retrying in ${backoff / 1000} s…`);
      connected = false;
      await sleep(backoff);
      backoff = Math.min(backoff * 2, 30_000);
      continue;
    }

    for (const job of jobs) {
      let result;
      try {
        await send(job.printer, Buffer.from(job.payload, 'base64'));
        log(`🖨  ${job.label} → ${job.printer.name}`);
        result = { ok: true };
      } catch (e) {
        log(`✘ ${job.label} → ${job.printer.name}: ${e.message}`);
        result = { ok: false, error: e.message };
      }
      try {
        await fetch(`${server}/api/print-agent/jobs/${job.id}`, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify(result), signal: AbortSignal.timeout(15_000) });
      } catch (e) {
        log(`Could not report ${job.label}: ${e.message} (the app will offer it again in a minute)`);
      }
    }
  }
}

main();
