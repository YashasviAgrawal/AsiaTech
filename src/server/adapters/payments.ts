import 'server-only';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { appUrl } from '../app-url';

/**
 * Payment links behind one interface. "mock" (default) creates a local /pay/<id> page that simulates a UPI
 * payment, so Request Money works end to end in development. "razorpay" uses the Payment Links API.
 */
export interface PaymentLinkInput {
  amount: number;
  description: string;
  customer: { name: string; contact?: string | null; email?: string | null };
  referenceId: string;
  expiresAt: Date;
}

export interface PaymentLink {
  id: string;
  url: string;
}

export async function createPaymentLink(input: PaymentLinkInput): Promise<PaymentLink> {
  const provider = process.env.PAYMENTS_PROVIDER ?? 'mock';
  if (provider === 'razorpay') {
    const key = process.env.RAZORPAY_KEY_ID;
    const secret = process.env.RAZORPAY_KEY_SECRET;
    if (!key || !secret) throw new Error('Razorpay keys are not configured');
    const response = await fetch('https://api.razorpay.com/v1/payment_links', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Basic ${Buffer.from(`${key}:${secret}`).toString('base64')}` },
      body: JSON.stringify({
        amount: Math.round(input.amount * 100),
        currency: 'INR',
        description: input.description.slice(0, 2048),
        reference_id: input.referenceId,
        expire_by: Math.floor(input.expiresAt.getTime() / 1000),
        customer: { name: input.customer.name, contact: input.customer.contact ?? undefined, email: input.customer.email ?? undefined },
        notify: { sms: false, email: false },
        reminder_enable: true,
        callback_url: appUrl('/pay/thanks'),
        callback_method: 'get',
      }),
    });
    if (!response.ok) throw new Error(`Razorpay: ${response.status} ${await response.text()}`);
    const data = (await response.json()) as { id: string; short_url: string };
    return { id: data.id, url: data.short_url };
  }
  const id = `plink_${randomBytes(8).toString('hex')}`;
  return { id, url: appUrl(`/pay/${id}`) };
}

/** Verify a Razorpay webhook (X-Razorpay-Signature = HMAC-SHA256 of the raw body). */
export function verifyRazorpaySignature(rawBody: string, signature: string | null): boolean {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret || !signature) return false;
  const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
  return expected.length === signature.length && timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}
