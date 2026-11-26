import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { getContext } from '@/server/context';

/** Staff download of the print agent (one file, no install beyond Node.js). */
export async function GET() {
  const ctx = await getContext();
  if (!ctx || !ctx.can('pos.manage')) return new Response('Unauthorised', { status: 401 });
  const script = await readFile(path.join(/*turbopackIgnore: true*/ process.cwd(), 'print-agent', 'asiatech-print-agent.mjs'));
  return new Response(new Uint8Array(script), {
    headers: { 'Content-Type': 'text/javascript; charset=utf-8', 'Content-Disposition': 'attachment; filename="asiatech-print-agent.mjs"', 'Cache-Control': 'no-store' },
  });
}
