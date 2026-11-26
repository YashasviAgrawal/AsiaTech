import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { invoices } from '@/db/schema';
import { limitRequest } from '@/server/rate-limit';
import { readShareToken } from '@/server/share-links';
import { invoiceFileName, loadInvoiceDocument } from '@/server/services/invoice-doc';
import { renderInvoicePdf } from '@/server/pdf/invoice-pdf';

/**
 * The link sent to the guest on WhatsApp / email: opens their invoice PDF without signing in. Only a signed
 * token works (see share-links.ts), and requests are rate limited so tokens cannot be brute-forced.
 */
export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const limited = await limitRequest(request, 'invoice-link', 30, 60_000);
  if (limited) return limited;
  const { token } = await params;
  const id = readShareToken('invoice', token);
  if (!id) return new Response('This invoice link is not valid. Please ask the hotel to send it again.', { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  const [row] = await db.select({ propertyId: invoices.propertyId }).from(invoices).where(eq(invoices.id, id));
  const doc = row ? await loadInvoiceDocument(row.propertyId, id) : null;
  if (!doc) return new Response('Invoice not found.', { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  const pdf = await renderInvoicePdf(doc);
  return new Response(new Uint8Array(pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${invoiceFileName(doc.invoice.invoiceNo)}"`,
      'Cache-Control': 'private, max-age=300',
      'X-Robots-Tag': 'noindex',
    },
  });
}
