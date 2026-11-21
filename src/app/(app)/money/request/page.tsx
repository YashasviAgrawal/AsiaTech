import type { Metadata } from 'next';
import { and, desc, eq } from 'drizzle-orm';
import { db } from '@/db';
import { bookings, payments } from '@/db/schema';
import { requireContext } from '@/server/context';
import { getBookingDetail } from '@/server/services/frontoffice';
import { PageHeader } from '@/components/ui/card';
import { RequestMoney } from './request-money';

export const metadata: Metadata = { title: 'Request Money' };

export default async function RequestMoneyPage({ searchParams }: { searchParams: Promise<{ booking?: string }> }) {
  const ctx = await requireContext('money.manage');
  const { booking } = await searchParams;
  const detail = booking && /^[0-9a-f-]{36}$/i.test(booking) ? await getBookingDetail(ctx.propertyId, booking) : null;
  const requests = await db
    .select({
      id: payments.id,
      amount: payments.amount,
      purpose: payments.purpose,
      status: payments.status,
      linkId: payments.linkId,
      linkUrl: payments.linkUrl,
      linkExpiresAt: payments.linkExpiresAt,
      payerName: payments.payerName,
      payerMobile: payments.payerMobile,
      createdAt: payments.createdAt,
      paidAt: payments.paidAt,
      bookingId: payments.bookingId,
      bookingNo: bookings.bookingNo,
    })
    .from(payments)
    .leftJoin(bookings, eq(bookings.id, payments.bookingId))
    .where(and(eq(payments.propertyId, ctx.propertyId), eq(payments.mode, 'link')))
    .orderBy(desc(payments.createdAt))
    .limit(50);

  return (
    <div>
      <PageHeader
        eyebrow="Money"
        title="Request Money"
        description="Send a UPI / card payment link on WhatsApp or SMS. When the guest pays, the money is added to their bill automatically."
      />
      <RequestMoney
        prefill={
          detail
            ? {
                bookingId: detail.booking.id,
                bookingNo: detail.booking.bookingNo,
                name: detail.guest.name,
                mobile: detail.guest.mobile ?? '',
                email: detail.guest.email ?? '',
                amount: Math.max(0, Math.round(detail.totals.balance)),
              }
            : null
        }
        requests={JSON.parse(JSON.stringify(requests))}
      />
    </div>
  );
}

