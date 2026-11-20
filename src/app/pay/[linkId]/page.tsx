import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { eq } from 'drizzle-orm';
import QRCode from 'qrcode';
import { ShieldCheck } from 'lucide-react';
import { db } from '@/db';
import { payments, properties } from '@/db/schema';
import { formatDateTime, formatINR } from '@/lib/format';
import { PayButton } from './pay-button';

export const metadata: Metadata = { title: 'Pay securely' };

/** Public payment page for the mock provider. With Razorpay, guests land on Razorpay's own page instead. */
export default async function PayPage({ params }: { params: Promise<{ linkId: string }> }) {
  const { linkId } = await params;
  const [p] = await db.select().from(payments).where(eq(payments.linkId, linkId));
  if (!p) notFound();
  const [property] = await db.select().from(properties).where(eq(properties.id, p.propertyId));
  const upi = property.settings.invoice.upiId;
  const qr = await QRCode.toString(`upi://pay?pa=${upi}&pn=${encodeURIComponent(property.name)}&am=${p.amount.toFixed(2)}&cu=INR&tn=${encodeURIComponent(p.purpose ?? 'Payment')}`, { type: 'svg', margin: 0, width: 180 });
  // Server component: reading the clock once per request is intended.
  // eslint-disable-next-line react-hooks/purity
  const expired = p.status === 'pending' && p.linkExpiresAt && p.linkExpiresAt.getTime() < Date.now();

  return (
    <div className="flex min-h-screen items-center justify-center bg-ink-50 p-4">
      <div className="w-full max-w-sm overflow-hidden rounded-3xl bg-white shadow-lift ring-1 ring-ink-200">
        <div className="bg-gradient-to-br from-brand-600 to-brand-800 p-6 text-center text-white">
          <p className="text-sm font-semibold text-brand-100">{property.name}</p>
          <p className="num mt-2 text-4xl font-extrabold">{formatINR(p.amount)}</p>
          <p className="mt-1 text-sm text-brand-100">{p.purpose}</p>
        </div>
        <div className="p-6 text-center">
          {p.status === 'success' ? (
            <p className="text-lg font-bold text-emerald-600">Paid · thank you!</p>
          ) : expired || p.status !== 'pending' ? (
            <p className="font-semibold text-ink-600">This link has expired. Please ask the hotel for a new one.</p>
          ) : (
            <>
              <div className="mx-auto h-44 w-44" dangerouslySetInnerHTML={{ __html: qr }} />
              <p className="mt-3 text-sm text-ink-600">Scan with any UPI app, or tap below</p>
              <PayButton linkId={linkId} />
              {p.linkExpiresAt && <p className="mt-3 text-xs text-ink-400">Valid until {formatDateTime(p.linkExpiresAt)}</p>}
            </>
          )}
          <p className="mt-5 flex items-center justify-center gap-1.5 text-xs text-ink-400">
            <ShieldCheck className="h-3.5 w-3.5" /> Secure payment for {p.payerName ?? 'guest'}
          </p>
        </div>
      </div>
    </div>
  );
}
