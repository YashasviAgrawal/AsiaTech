import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { renderInvoicePdf } from '@/server/pdf/invoice-pdf';
import { invoiceFileName, type InvoiceDocument } from '@/server/services/invoice-doc';

function fakeDoc(overrides: { igst?: boolean; due?: number; cancelled?: boolean } = {}): InvoiceDocument {
  const line = overrides.igst
    ? { description: 'Deluxe Room · 2 nights', hsnSac: '996311', quantity: 2, amount: 9000, taxRate: 18, cgst: 0, sgst: 0, igst: 1620, total: 10620 }
    : { description: 'Deluxe Room · 2 nights', hsnSac: '996311', quantity: 2, amount: 6000, taxRate: 5, cgst: 150, sgst: 150, igst: 0, total: 6300 };
  const total = line.total;
  const due = overrides.due ?? 0;
  return {
    invoice: {
      id: '3f1c2b4a-9d8e-4f7a-b6c5-0123456789ab',
      invoiceNo: 'SRP/26-27/0042',
      invoiceDate: '2026-11-21',
      buyerName: 'Acme Travels Pvt Ltd',
      buyerGstin: '27AAACA1234A1Z5',
      buyerAddress: 'Andheri East, Mumbai',
      placeOfSupply: overrides.igst ? '27 - Maharashtra' : '08 - Rajasthan',
      lines: [line],
      subtotal: line.amount,
      cgst: line.cgst,
      sgst: line.sgst,
      igst: line.igst,
      total,
      paid: total - due,
      status: overrides.cancelled ? 'cancelled' : 'issued',
    },
    property: {
      name: 'Shri Ram Portico',
      legalName: 'Shri Ram Hospitality Pvt Ltd',
      addressLine1: 'Plot 12, Station Road',
      city: 'Jaipur',
      pincode: '302006',
      state: 'Rajasthan',
      phone: '+91 98290 12345',
      email: 'stay@shriramportico.in',
      gstin: '08AAKCS1234F1Z5',
      branding: { primaryColor: '#e11d48' },
      settings: { invoice: { bankDetails: 'HDFC Bank', footer: 'Thank you!', showUpiQr: true, upiId: 'hotel@okhdfcbank', prefix: 'SRP' } },
    },
    booking: { id: 'b', bookingNo: 'FDR100200', checkIn: '2026-11-19', checkOut: '2026-11-21', nights: 2, paidAmount: total - due },
    guest: { name: 'Rahul Mehta', mobile: '9876543210' },
    paid: total - due,
    due,
    upiUri: due > 0 ? `upi://pay?pa=hotel@okhdfcbank&am=${due}` : null,
    upiId: 'hotel@okhdfcbank',
  } as unknown as InvoiceDocument;
}

const hasPdftotext = (() => {
  try {
    execFileSync('pdftotext', ['-v'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
})();

function text(pdf: Buffer) {
  const dir = mkdtempSync(path.join(tmpdir(), 'inv-'));
  const file = path.join(dir, 'x.pdf');
  writeFileSync(file, pdf);
  return execFileSync('pdftotext', [file, '-']).toString();
}

describe('invoice PDF', () => {
  it('renders a real PDF with the GST split', async () => {
    const pdf = await renderInvoicePdf(fakeDoc());
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(existsSync(path.join(process.cwd(), 'node_modules/geist/dist/fonts/geist-sans/Geist-Regular.ttf'))).toBe(true);
    if (hasPdftotext) {
      const t = text(pdf);
      for (const s of ['Shri Ram Portico', 'SRP/26-27/0042', 'Acme Travels Pvt Ltd', '27AAACA1234A1Z5', 'CGST', 'SGST', '₹6,300.00', 'Fully paid']) expect(t).toContain(s);
      expect(t).not.toContain('IGST');
    }
  }, 30000);

  it('shows IGST for inter-state bills and the UPI QR while money is owed', async () => {
    const pdf = await renderInvoicePdf(fakeDoc({ igst: true, due: 3000 }));
    if (hasPdftotext) {
      const t = text(pdf);
      expect(t).toContain('IGST');
      expect(t).toContain('₹1,620.00');
      expect(t).toContain('Scan to pay ₹3,000');
      expect(t).toContain('Balance due');
    }
  }, 30000);

  it('marks cancelled invoices', async () => {
    const pdf = await renderInvoicePdf(fakeDoc({ cancelled: true }));
    if (hasPdftotext) expect(text(pdf)).toContain('CANCELLED');
  }, 30000);

  it('makes a safe file name from the invoice number', () => {
    expect(invoiceFileName('SRP/26-27/0042')).toBe('SRP-26-27-0042.pdf');
  });
});
