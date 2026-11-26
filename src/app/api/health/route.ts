import { connection } from 'next/server';
import { pool } from '@/db';

/**
 * Health check for Docker, load balancers and uptime monitors: 200 when the app can reach the database, 503 when
 * it cannot. Public (no sign-in) and says nothing about the hotel.
 */
export async function GET() {
  await connection();
  try {
    await Promise.race([pool.query('SELECT 1'), new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 3000))]);
    return Response.json({ status: 'ok' }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return Response.json({ status: 'database unreachable' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
