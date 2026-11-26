import { NextResponse, type NextRequest } from 'next/server';
import { markLinkPaid } from '@/server/services/money';
import { verifyRazorpaySignature } from '@/server/adapters/payments';
import { limitRequest } from '@/server/rate-limit';

/**
 * Payment gateway webhooks. Razorpay sends `payment_link.paid`; the signature is verified against the raw body.
 * The "mock" provider is accepted only outside production.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  const limited = await limitRequest(request, 'webhook:pay', 60, 60_000);
  if (limited) return limited;
  const { provider } = await params;
  const raw = await request.text();
  try {
    if (provider === 'razorpay') {
      if (!verifyRazorpaySignature(raw, request.headers.get('x-razorpay-signature'))) return NextResponse.json({ error: 'Bad signature' }, { status: 401 });
      const event = JSON.parse(raw) as { event: string; payload: { payment_link?: { entity: { id: string } }; payment?: { entity: { id: string } } } };
      if (event.event === 'payment_link.paid' && event.payload.payment_link) {
        await markLinkPaid(event.payload.payment_link.entity.id, event.payload.payment?.entity.id ?? 'razorpay');
      }
      return NextResponse.json({ ok: true });
    }
    if (provider === 'mock' && process.env.NODE_ENV !== 'production' && (process.env.PAYMENTS_PROVIDER ?? 'mock') === 'mock') {
      const { linkId } = JSON.parse(raw) as { linkId: string };
      const result = await markLinkPaid(linkId, `UPI${Date.now().toString().slice(-10)}`);
      return NextResponse.json({ ok: true, ...result });
    }
    return NextResponse.json({ error: 'Unknown provider' }, { status: 404 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed' }, { status: 400 });
  }
}
