import 'server-only';
import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import { bookings, guests, invoices, properties } from '@/db/schema';
import { round2 } from '@/lib/utils';

/**
 * Everything an invoice shows, loaded once for the print page, the PDF and the "Send invoice" dialog,
 * so the three never disagree on the balance or the buyer.
 */
export async function loadInvoiceDocument(propertyId: string, invoiceId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(invoiceId)) return null;
  const [invoice] = await db.select().from(invoices).where(and(eq(invoices.id, invoiceId), eq(invoices.propertyId, propertyId)));
  if (!invoice) return null;
  const [property] = await db.select().from(properties).where(eq(properties.id, propertyId));
  const [booking] = invoice.bookingId ? await db.select().from(bookings).where(eq(bookings.id, invoice.bookingId)) : [];
  const [guest] = booking ? await db.select().from(guests).where(eq(guests.id, booking.guestId)) : [];
  const paid = booking?.paidAmount ?? invoice.paid;
  const due = round2(invoice.total - paid);
  const upi = property.settings.invoice.showUpiQr && property.settings.invoice.upiId ? property.settings.invoice.upiId : null;
  return {
    invoice,
    property,
    booking: booking ?? null,
    guest: guest ?? null,
    paid,
    due,
    /** UPI deep link for the "Scan to pay" QR, only while money is owed. */
    upiUri: upi && due > 0 ? `upi://pay?pa=${upi}&pn=${encodeURIComponent(property.name)}&am=${due.toFixed(2)}&cu=INR&tn=${encodeURIComponent(invoice.invoiceNo)}` : null,
    upiId: upi,
  };
}

export type InvoiceDocument = NonNullable<Awaited<ReturnType<typeof loadInvoiceDocument>>>;

/** "SRP/26-27/0001" → "SRP-26-27-0001.pdf" */
export function invoiceFileName(invoiceNo: string) {
  return `${invoiceNo.replace(/[^A-Za-z0-9-]+/g, '-').replace(/^-+|-+$/g, '')}.pdf`;
}
