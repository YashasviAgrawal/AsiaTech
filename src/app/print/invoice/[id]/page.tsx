import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Download } from 'lucide-react';
import QRCode from 'qrcode';
import { requireContext } from '@/server/context';
import { loadInvoiceDocument } from '@/server/services/invoice-doc';
import { formatDay, formatINR } from '@/lib/format';
import { amountInWords } from '@/lib/words';

export const metadata: Metadata = { title: 'Tax Invoice' };

export default async function InvoicePrint({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireContext('bookings.view');
  const { id } = await params;
  const doc = await loadInvoiceDocument(ctx.propertyId, id);
  if (!doc) notFound();
  const { invoice, property, booking, guest, due } = doc;
  const upi = doc.upiId;
  const qr = doc.upiUri ? await QRCode.toString(doc.upiUri, { type: 'svg', margin: 0, width: 112, color: { dark: '#0f172a', light: '#ffffff' } }) : null;

  return (
    <>
      <a
        href={`/api/invoices/${invoice.id}/pdf`}
        className="no-print fixed top-4 left-4 z-50 inline-flex h-10 items-center gap-1.5 rounded-lg bg-white px-3.5 text-sm font-medium text-ink-700 shadow-lift ring-1 ring-ink-200 hover:bg-ink-50"
      >
        <Download className="h-4 w-4" /> Download PDF
      </a>
      <article className="mx-auto w-full max-w-[210mm] bg-white p-10 text-[13px] text-ink-800 shadow-lift print:max-w-none print:p-0 print:shadow-none">
        <header className="flex items-start justify-between gap-6 border-b-2 border-ink-900 pb-5">
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight text-ink-900">{property.name}</h1>
            <p className="mt-1 max-w-sm text-ink-600">{[property.legalName, property.addressLine1, property.addressLine2, `${property.city ?? ''} ${property.pincode ?? ''}`, property.state].filter(Boolean).join(', ')}</p>
            <p className="mt-1 text-ink-600">
              {property.phone} · {property.email}
            </p>
            {property.gstin && <p className="mt-1 font-mono font-semibold text-ink-900">GSTIN {property.gstin}</p>}
          </div>
          <div className="text-right">
            <p className="text-xs font-bold tracking-[0.2em] text-brand-600 uppercase">Tax invoice</p>
            <p className="mt-2 font-mono text-lg font-bold text-ink-900">{invoice.invoiceNo}</p>
            <p className="text-ink-600">Date {formatDay(invoice.invoiceDate)}</p>
            {invoice.status === 'cancelled' && <p className="mt-1 font-bold text-rose-600">CANCELLED</p>}
          </div>
        </header>

        <section className="grid grid-cols-2 gap-6 border-b border-ink-200 py-5">
          <div>
            <p className="text-[11px] font-semibold tracking-wider text-ink-400 uppercase">Billed to</p>
            <p className="mt-1 text-base font-bold text-ink-900">{invoice.buyerName}</p>
            {invoice.buyerAddress && <p className="text-ink-600">{invoice.buyerAddress}</p>}
            {invoice.buyerGstin && <p className="font-mono text-ink-900">GSTIN {invoice.buyerGstin}</p>}
            {guest?.mobile && <p className="text-ink-600">+91 {guest.mobile}</p>}
          </div>
          <div className="text-right">
            <p className="text-[11px] font-semibold tracking-wider text-ink-400 uppercase">Stay</p>
            {booking && (
              <>
                <p className="mt-1 font-semibold text-ink-900">Booking {booking.bookingNo}</p>
                <p className="text-ink-600">
                  {formatDay(booking.checkIn)} → {formatDay(booking.checkOut)} · {booking.nights} night{booking.nights === 1 ? '' : 's'}
                </p>
                {guest && invoice.buyerName !== guest.name && <p className="text-ink-600">Guest: {guest.name}</p>}
              </>
            )}
            {invoice.placeOfSupply && <p className="text-ink-600">Place of supply: {invoice.placeOfSupply}</p>}
          </div>
        </section>

        <table className="mt-5 w-full">
          <thead>
            <tr className="border-b border-ink-300 text-left text-[11px] tracking-wide text-ink-500 uppercase">
              <th className="py-2 font-semibold">Description</th>
              <th className="py-2 font-semibold">SAC</th>
              <th className="py-2 text-right font-semibold">Qty</th>
              <th className="py-2 text-right font-semibold">Taxable</th>
              <th className="py-2 text-right font-semibold">GST</th>
              <th className="py-2 text-right font-semibold">CGST</th>
              <th className="py-2 text-right font-semibold">SGST</th>
              <th className="py-2 text-right font-semibold">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-100">
            {invoice.lines.map((line, i) => (
              <tr key={i}>
                <td className="py-2.5 pr-2 font-medium text-ink-900">{line.description}</td>
                <td className="py-2.5 font-mono text-xs text-ink-500">{line.hsnSac}</td>
                <td className="num py-2.5 text-right">{line.quantity}</td>
                <td className="num py-2.5 text-right">{formatINR(line.amount, { paise: true })}</td>
                <td className="num py-2.5 text-right">{line.taxRate}%</td>
                <td className="num py-2.5 text-right">{formatINR(line.cgst, { paise: true })}</td>
                <td className="num py-2.5 text-right">{formatINR(line.sgst, { paise: true })}</td>
                <td className="num py-2.5 text-right font-semibold text-ink-900">{formatINR(line.total, { paise: true })}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <section className="mt-6 flex items-start justify-between gap-8">
          <div className="flex items-start gap-4">
            {qr && due > 0 && (
              <div className="rounded-xl border border-ink-200 p-3 text-center">
                <div className="h-28 w-28" dangerouslySetInnerHTML={{ __html: qr }} />
                <p className="mt-1.5 text-[10px] font-semibold text-ink-600">Scan to pay {formatINR(due)}</p>
                <p className="font-mono text-[9px] text-ink-400">{upi}</p>
              </div>
            )}
            <div className="max-w-xs text-xs text-ink-500">
              <p className="font-semibold text-ink-700">{amountInWords(invoice.total)}</p>
              {property.settings.invoice.bankDetails && <p className="mt-2">{property.settings.invoice.bankDetails}</p>}
              <p className="mt-2">{property.settings.invoice.footer}</p>
            </div>
          </div>
          <dl className="w-64 space-y-1.5">
            <div className="flex justify-between">
              <dt className="text-ink-500">Taxable value</dt>
              <dd className="num">{formatINR(invoice.subtotal, { paise: true })}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-ink-500">CGST</dt>
              <dd className="num">{formatINR(invoice.cgst, { paise: true })}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-ink-500">SGST</dt>
              <dd className="num">{formatINR(invoice.sgst, { paise: true })}</dd>
            </div>
            <div className="flex justify-between border-t-2 border-ink-900 pt-2 text-base font-extrabold text-ink-900">
              <dt>Invoice total</dt>
              <dd className="num">{formatINR(invoice.total, { paise: true })}</dd>
            </div>
            {booking && (
              <>
                <div className="flex justify-between text-emerald-700">
                  <dt>Paid</dt>
                  <dd className="num">{formatINR(booking.paidAmount, { paise: true })}</dd>
                </div>
                <div className="flex justify-between font-bold">
                  <dt>{due > 0 ? 'Balance due' : 'Balance'}</dt>
                  <dd className="num">{formatINR(Math.max(due, 0), { paise: true })}</dd>
                </div>
              </>
            )}
          </dl>
        </section>

        <footer className="mt-12 flex items-end justify-between border-t border-ink-200 pt-4 text-[11px] text-ink-400">
          <p>This is a computer-generated invoice. Accommodation SAC 996311, restaurant SAC 996331.</p>
          <p className="text-right">
            For {property.name}
            <br />
            <span className="mt-8 inline-block text-ink-600">Authorised signatory</span>
          </p>
        </footer>
      </article>
    </>
  );
}
