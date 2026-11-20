import type { Metadata } from 'next';
import { and, desc, eq, sql } from 'drizzle-orm';
import { db } from '@/db';
import { messageLog, users } from '@/db/schema';
import { requireContext } from '@/server/context';
import { PageHeader } from '@/components/ui/card';
import { MessagesCentre } from './messages-centre';

export const metadata: Metadata = { title: 'WhatsApp' };

export default async function MessagesPage({ searchParams }: { searchParams: Promise<{ channel?: string }> }) {
  const ctx = await requireContext('bookings.view');
  const { channel } = await searchParams;
  const [rows, [stats]] = await Promise.all([
    db
      .select({ msg: messageLog, sentBy: users.name })
      .from(messageLog)
      .leftJoin(users, eq(users.id, messageLog.sentBy))
      .where(and(eq(messageLog.propertyId, ctx.propertyId), channel ? eq(messageLog.channel, channel as 'whatsapp') : undefined))
      .orderBy(desc(messageLog.createdAt))
      .limit(100),
    db
      .select({
        total: sql<number>`count(*)::int`,
        today: sql<number>`count(*) FILTER (WHERE (${messageLog.createdAt} AT TIME ZONE 'Asia/Kolkata')::date = (now() AT TIME ZONE 'Asia/Kolkata')::date)::int`,
        failed: sql<number>`count(*) FILTER (WHERE ${messageLog.status} = 'failed')::int`,
      })
      .from(messageLog)
      .where(eq(messageLog.propertyId, ctx.propertyId)),
  ]);
  return (
    <div>
      <PageHeader
        eyebrow="Communication"
        title="WhatsApp & messages"
        description="Confirmations, payment links and invoices sent to guests. In development messages are logged here instead of being sent; connect a WhatsApp Business API provider to go live."
      />
      <MessagesCentre rows={JSON.parse(JSON.stringify(rows.map((r) => ({ ...r.msg, sentBy: r.sentBy }))))} stats={stats} hotelName={ctx.property.name} />
    </div>
  );
}
