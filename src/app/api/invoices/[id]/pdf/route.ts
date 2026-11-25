import type { NextRequest } from 'next/server';
import { getContext } from '@/server/context';
import { invoiceFileName, loadInvoiceDocument } from '@/server/services/invoice-doc';
import { renderInvoicePdf } from '@/server/pdf/invoice-pdf';

/** Staff download of a GST invoice as PDF. `?inline=1` opens it in the browser instead of saving. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getContext();
  if (!ctx || !ctx.can('bookings.view')) return new Response('Unauthorised', { status: 401 });
  const { id } = await params;
  const doc = await loadInvoiceDocument(ctx.propertyId, id);
  if (!doc) return new Response('Not found', { status: 404 });
  const pdf = await renderInvoicePdf(doc);
  const disposition = request.nextUrl.searchParams.get('inline') ? 'inline' : 'attachment';
  return new Response(new Uint8Array(pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `${disposition}; filename="${invoiceFileName(doc.invoice.invoiceNo)}"`,
      'Cache-Control': 'private, no-store',
    },
  });
}
