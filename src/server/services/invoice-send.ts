import 'server-only';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { guests } from '@/db/schema';
import { normaliseMobile } from '@/lib/utils';
import { logActivity } from '../audit';
import { UserError } from '../errors';
import { renderInvoicePdf } from '../pdf/invoice-pdf';
import { invoiceShareUrl } from '../share-links';
import type { Actor } from './actor';
import { invoiceFileName, loadInvoiceDocument } from './invoice-doc';
import { sendMessage } from './messaging';
import { invoiceEmailText, invoiceText } from './templates';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * Send a GST invoice to the guest: WhatsApp gets a short message with the signed PDF link, email gets the PDF
 * attached. A mobile or email typed here is saved on the guest when they had none, so next time it is filled in.
 */
export async function sendInvoice(actor: Actor, input: { invoiceId: string; whatsapp?: string | null; email?: string | null }) {
  const doc = await loadInvoiceDocument(actor.propertyId, input.invoiceId);
  if (!doc) throw new UserError('Invoice not found.');
  if (doc.invoice.status === 'cancelled') throw new UserError('This invoice is cancelled. Send the new one instead.');

  const mobile = input.whatsapp?.trim() ? normaliseMobile(input.whatsapp) : null;
  if (input.whatsapp?.trim() && !mobile) throw new UserError('Enter a 10-digit mobile number for WhatsApp.');
  const email = input.email?.trim().toLowerCase() || null;
  if (email && !EMAIL_PATTERN.test(email)) throw new UserError('Enter a valid email address.');
  if (!mobile && !email) throw new UserError('Add a WhatsApp number or an email address.');

  const { invoice, property, guest } = doc;
  const guestName = guest?.name ?? invoice.buyerName;
  const url = invoiceShareUrl(invoice.id);
  const results: { channel: 'whatsapp' | 'email'; to: string; status: 'sent' | 'failed' }[] = [];

  if (mobile) {
    const r = await sendMessage({
      propertyId: actor.propertyId,
      channel: 'whatsapp',
      to: mobile,
      template: 'invoice',
      body: invoiceText({ hotelName: property.name, guestName, invoiceNo: invoice.invoiceNo, total: invoice.total, due: doc.due, url }),
      entityType: 'invoice',
      entityId: invoice.id,
      sentBy: actor.userId,
    });
    results.push({ channel: 'whatsapp', to: mobile, status: r.status });
  }

  if (email) {
    const pdf = await renderInvoicePdf(doc);
    const r = await sendMessage({
      propertyId: actor.propertyId,
      channel: 'email',
      to: email,
      template: 'invoice',
      subject: `Tax invoice ${invoice.invoiceNo} · ${property.name}`,
      body: invoiceEmailText({ hotelName: property.name, hotelPhone: property.phone, guestName, invoiceNo: invoice.invoiceNo, total: invoice.total, due: doc.due, upiId: doc.upiId, url }),
      attachments: [{ filename: invoiceFileName(invoice.invoiceNo), content: pdf, contentType: 'application/pdf' }],
      fromName: property.name,
      replyTo: property.email,
      entityType: 'invoice',
      entityId: invoice.id,
      sentBy: actor.userId,
    });
    results.push({ channel: 'email', to: email, status: r.status });
  }

  if (guest) {
    const patch: { mobile?: string; email?: string } = {};
    if (mobile && !guest.mobile) patch.mobile = mobile;
    if (email && !guest.email) patch.email = email;
    if (Object.keys(patch).length) await db.update(guests).set(patch).where(eq(guests.id, guest.id));
  }

  const sent = results.filter((r) => r.status === 'sent');
  if (doc.booking && sent.length) {
    await logActivity({
      propertyId: actor.propertyId,
      userId: actor.userId,
      entityType: 'booking',
      entityId: doc.booking.id,
      action: 'invoice_sent',
      summary: `Invoice ${invoice.invoiceNo} sent by ${sent.map((r) => (r.channel === 'whatsapp' ? `WhatsApp to ${r.to}` : `email to ${r.to}`)).join(' and ')}`,
    });
  }
  return { results, url };
}
