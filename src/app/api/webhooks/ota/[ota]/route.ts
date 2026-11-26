import { NextResponse, type NextRequest } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { OTAS } from '@/db/schema';
import { receiveOtaBooking } from '@/server/services/channels';
import { limitRequest } from '@/server/rate-limit';

const payloadSchema = z.object({
  type: z.enum(['new', 'cancel']),
  hotelCode: z.string().min(2),
  otaRef: z.string().min(3),
  guest: z.object({ name: z.string(), mobile: z.string().nullable().optional(), email: z.string().nullable().optional(), city: z.string().nullable().optional(), nationality: z.string().nullable().optional() }).optional(),
  checkIn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  checkOut: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  rooms: z.array(z.object({ otaRoomId: z.string(), otaRateId: z.string().nullable().optional(), adults: z.number().int().min(1), children: z.number().int().min(0).optional() })).optional(),
  total: z.number().positive().optional(),
});

function authorised(request: NextRequest) {
  const secret = process.env.OTA_WEBHOOK_SECRET;
  if (!secret) return process.env.NODE_ENV !== 'production';
  const given = request.headers.get('x-webhook-secret') ?? '';
  return given.length === secret.length && timingSafeEqual(Buffer.from(given), Buffer.from(secret));
}

/**
 * Inbound OTA reservations (new and cancelled). Bookings go through the same row-locked reserve() as the front
 * desk, so a sold-out room type is refused (409) instead of being double-sold.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ ota: string }> }) {
  const limited = await limitRequest(request, 'webhook:ota', 120, 60_000);
  if (limited) return limited;
  if (!authorised(request)) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  const { ota } = await params;
  const parsedOta = z.enum(OTAS).safeParse(ota);
  if (!parsedOta.success) return NextResponse.json({ error: 'Unknown OTA' }, { status: 404 });
  const body = payloadSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: 'Invalid payload', issues: body.error.issues }, { status: 400 });
  try {
    const result = await receiveOtaBooking(parsedOta.data, body.data);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : 'Failed' }, { status: 409 });
  }
}
