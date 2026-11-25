import 'server-only';
import path from 'node:path';
import { Document, Font, Image, Page, StyleSheet, Text, View, renderToBuffer } from '@react-pdf/renderer';
import QRCode from 'qrcode';
import { formatDay, formatINR } from '@/lib/format';
import { amountInWords } from '@/lib/words';
import { readStoredFile, sniffImage } from '../storage';
import type { InvoiceDocument } from '../services/invoice-doc';

/**
 * The GST invoice as a real PDF (for email attachments, WhatsApp links and downloads), drawn on the server so
 * it looks the same on every phone. Same content as /print/invoice, in the app's own typeface (Geist has ₹).
 */
let fontsReady = false;
function registerFonts() {
  if (fontsReady) return;
  const dir = path.join(process.cwd(), 'node_modules', 'geist', 'dist', 'fonts');
  Font.register({
    family: 'Geist',
    fonts: [
      { src: path.join(dir, 'geist-sans', 'Geist-Regular.ttf'), fontWeight: 400 },
      { src: path.join(dir, 'geist-sans', 'Geist-Medium.ttf'), fontWeight: 500 },
      { src: path.join(dir, 'geist-sans', 'Geist-SemiBold.ttf'), fontWeight: 600 },
      { src: path.join(dir, 'geist-sans', 'Geist-Bold.ttf'), fontWeight: 700 },
    ],
  });
  Font.register({ family: 'GeistMono', fonts: [{ src: path.join(dir, 'geist-mono', 'GeistMono-Medium.ttf'), fontWeight: 500 }, { src: path.join(dir, 'geist-mono', 'GeistMono-Bold.ttf'), fontWeight: 700 }] });
  // Invoice text is names, numbers and short phrases: never hyphenate.
  Font.registerHyphenationCallback((word) => [word]);
  fontsReady = true;
}

const INK = { 900: '#0f172a', 800: '#1e293b', 700: '#334155', 600: '#475569', 500: '#64748b', 400: '#94a3b8', 200: '#e2e8f0', 100: '#f1f5f9', 50: '#f8fafc' };

const s = StyleSheet.create({
  page: { fontFamily: 'Geist', fontSize: 9, color: INK[800], paddingTop: 34, paddingBottom: 56, paddingHorizontal: 38, lineHeight: 1.35 },
  row: { flexDirection: 'row' },
  muted: { color: INK[600] },
  label: { fontSize: 7, fontWeight: 600, letterSpacing: 1.1, color: INK[400], textTransform: 'uppercase' },
  th: { fontSize: 7, fontWeight: 600, letterSpacing: 0.6, color: INK[500], textTransform: 'uppercase' },
  num: { textAlign: 'right' },
  mono: { fontFamily: 'GeistMono', fontWeight: 500 },
});

const COLUMNS = { desc: 3.3, sac: 0.9, qty: 0.55, taxable: 1.25, rate: 0.6, tax: 1.05, total: 1.3 };

function safeColor(value: string | undefined) {
  return value && /^#[0-9a-f]{6}$/i.test(value) ? value : '#4f46e5';
}

async function loadLogo(url: string | undefined) {
  if (!url?.startsWith('/files/')) return null;
  try {
    const bytes = await readStoredFile(url.slice('/files/'.length));
    const kind = bytes ? sniffImage(bytes) : null;
    // The PDF renderer draws JPG and PNG; a WebP logo is left out rather than failing the invoice.
    return bytes && (kind === 'jpg' || kind === 'png') ? { data: bytes, format: kind } : null;
  } catch {
    return null;
  }
}

function InvoicePdf({ doc, logo, qr }: { doc: InvoiceDocument; logo: { data: Buffer; format: 'jpg' | 'png' } | null; qr: string | null }) {
  const { invoice, property, booking, guest } = doc;
  const brand = safeColor(property.branding?.primaryColor);
  const interState = invoice.igst > 0 || invoice.lines.some((l) => l.igst > 0);
  const address = [property.legalName, property.addressLine1, property.addressLine2, [property.city, property.pincode].filter(Boolean).join(' '), property.state].filter(Boolean).join(', ');
  const contact = [property.phone, property.email, property.website].filter(Boolean).join('  ·  ');
  const money = (v: number) => formatINR(v, { paise: true });

  return (
    <Document title={`Tax invoice ${invoice.invoiceNo}`} author={property.name} subject={`GST invoice for ${invoice.buyerName}`} creator="AsiaTech" producer="AsiaTech">
      <Page size="A4" style={s.page}>
        {invoice.status === 'cancelled' && (
          <Text fixed style={{ position: 'absolute', top: 360, left: 90, fontSize: 84, lineHeight: 1.1, fontWeight: 700, color: '#e11d48', opacity: 0.12, transform: 'rotate(-28deg)' }}>
            CANCELLED
          </Text>
        )}
        <View style={{ height: 4, backgroundColor: brand, marginHorizontal: -38, marginTop: -34, marginBottom: 26 }} fixed />

        {/* Hotel and invoice number */}
        <View style={[s.row, { justifyContent: 'space-between', alignItems: 'flex-start' }]}>
          <View style={[s.row, { gap: 12, maxWidth: 330 }]}>
            {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image has no alt */}
            {logo && <Image src={logo} style={{ width: 44, height: 44, objectFit: 'contain' }} />}
            <View>
              <Text style={{ fontSize: 17, lineHeight: 1.25, fontWeight: 700, color: INK[900], letterSpacing: -0.3 }}>{property.name}</Text>
              {address ? <Text style={[s.muted, { marginTop: 3 }]}>{address}</Text> : null}
              {contact ? <Text style={[s.muted, { marginTop: 2 }]}>{contact}</Text> : null}
              {property.gstin ? <Text style={[s.mono, { marginTop: 4, fontWeight: 700, color: INK[900] }]}>GSTIN {property.gstin}</Text> : null}
            </View>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={{ fontSize: 7.5, fontWeight: 700, letterSpacing: 2.2, color: brand }}>TAX INVOICE</Text>
            <Text style={[s.mono, { fontSize: 13, lineHeight: 1.25, fontWeight: 700, color: INK[900], marginTop: 6 }]}>{invoice.invoiceNo}</Text>
            <Text style={[s.muted, { marginTop: 2 }]}>Date {formatDay(invoice.invoiceDate)}</Text>
            {invoice.status === 'cancelled' && <Text style={{ marginTop: 3, fontWeight: 700, color: '#e11d48' }}>CANCELLED</Text>}
          </View>
        </View>

        {/* Billed to / stay */}
        <View style={[s.row, { marginTop: 22, borderRadius: 8, backgroundColor: INK[50], borderWidth: 1, borderColor: INK[200], padding: 14, gap: 24 }]}>
          <View style={{ flex: 1 }}>
            <Text style={s.label}>Billed to</Text>
            <Text style={{ marginTop: 4, fontSize: 11, lineHeight: 1.3, fontWeight: 700, color: INK[900] }}>{invoice.buyerName}</Text>
            {invoice.buyerAddress ? <Text style={[s.muted, { marginTop: 2 }]}>{invoice.buyerAddress}</Text> : null}
            {invoice.buyerGstin ? <Text style={[s.mono, { marginTop: 2, color: INK[900] }]}>GSTIN {invoice.buyerGstin}</Text> : null}
            {guest?.mobile ? <Text style={[s.muted, { marginTop: 2 }]}>+91 {guest.mobile}</Text> : null}
          </View>
          <View style={{ flex: 1, alignItems: 'flex-end' }}>
            <Text style={s.label}>Stay</Text>
            {booking ? (
              <>
                <Text style={{ marginTop: 4, fontWeight: 600, color: INK[900] }}>Booking {booking.bookingNo}</Text>
                <Text style={[s.muted, { marginTop: 2 }]}>
                  {formatDay(booking.checkIn)} → {formatDay(booking.checkOut)} · {booking.nights} night{booking.nights === 1 ? '' : 's'}
                </Text>
                {guest && invoice.buyerName !== guest.name ? <Text style={[s.muted, { marginTop: 2 }]}>Guest: {guest.name}</Text> : null}
              </>
            ) : null}
            {invoice.placeOfSupply ? <Text style={[s.muted, { marginTop: 2 }]}>Place of supply: {invoice.placeOfSupply}</Text> : null}
          </View>
        </View>

        {/* Lines */}
        <View style={{ marginTop: 20 }}>
          <View style={[s.row, { borderBottomWidth: 1, borderBottomColor: INK[400], paddingBottom: 6 }]} fixed>
            <Text style={[s.th, { flex: COLUMNS.desc }]}>Description</Text>
            <Text style={[s.th, { flex: COLUMNS.sac }]}>SAC</Text>
            <Text style={[s.th, s.num, { flex: COLUMNS.qty }]}>Qty</Text>
            <Text style={[s.th, s.num, { flex: COLUMNS.taxable }]}>Taxable</Text>
            <Text style={[s.th, s.num, { flex: COLUMNS.rate }]}>GST</Text>
            {interState ? (
              <Text style={[s.th, s.num, { flex: COLUMNS.tax * 2 }]}>IGST</Text>
            ) : (
              <>
                <Text style={[s.th, s.num, { flex: COLUMNS.tax }]}>CGST</Text>
                <Text style={[s.th, s.num, { flex: COLUMNS.tax }]}>SGST</Text>
              </>
            )}
            <Text style={[s.th, s.num, { flex: COLUMNS.total }]}>Total</Text>
          </View>
          {invoice.lines.map((line, i) => (
            <View key={i} wrap={false} style={[s.row, { paddingVertical: 6.5, borderBottomWidth: 0.6, borderBottomColor: INK[200], backgroundColor: i % 2 ? INK[50] : '#ffffff' }]}>
              <Text style={{ flex: COLUMNS.desc, fontWeight: 500, color: INK[900], paddingRight: 6, paddingLeft: 2 }}>{line.description}</Text>
              <Text style={[s.mono, { flex: COLUMNS.sac, fontSize: 8, color: INK[500] }]}>{line.hsnSac}</Text>
              <Text style={[s.num, { flex: COLUMNS.qty }]}>{line.quantity}</Text>
              <Text style={[s.num, { flex: COLUMNS.taxable }]}>{money(line.amount)}</Text>
              <Text style={[s.num, { flex: COLUMNS.rate }]}>{line.taxRate}%</Text>
              {interState ? (
                <Text style={[s.num, { flex: COLUMNS.tax * 2 }]}>{money(line.igst)}</Text>
              ) : (
                <>
                  <Text style={[s.num, { flex: COLUMNS.tax }]}>{money(line.cgst)}</Text>
                  <Text style={[s.num, { flex: COLUMNS.tax }]}>{money(line.sgst)}</Text>
                </>
              )}
              <Text style={[s.num, { flex: COLUMNS.total, fontWeight: 600, color: INK[900], paddingRight: 2 }]}>{money(line.total)}</Text>
            </View>
          ))}
        </View>

        {/* Pay / totals */}
        <View wrap={false} style={[s.row, { marginTop: 18, justifyContent: 'space-between', gap: 24 }]}>
          <View style={[s.row, { flex: 1, gap: 14, alignItems: 'flex-start' }]}>
            {qr && (
              <View style={{ borderWidth: 1, borderColor: INK[200], borderRadius: 8, padding: 8, alignItems: 'center' }}>
                {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image has no alt */}
                <Image src={qr} style={{ width: 84, height: 84 }} />
                <Text style={{ marginTop: 5, fontSize: 7.5, fontWeight: 600, color: INK[700] }}>Scan to pay {formatINR(doc.due)}</Text>
                <Text style={[s.mono, { fontSize: 6.5, color: INK[400] }]}>{doc.upiId}</Text>
              </View>
            )}
            <View style={{ flex: 1 }}>
              <Text style={s.label}>Amount in words</Text>
              <Text style={{ marginTop: 3, fontWeight: 600, color: INK[700] }}>{amountInWords(invoice.total)}</Text>
              {property.settings.invoice.bankDetails ? (
                <>
                  <Text style={[s.label, { marginTop: 10 }]}>Bank details</Text>
                  <Text style={[s.muted, { marginTop: 3 }]}>{property.settings.invoice.bankDetails}</Text>
                </>
              ) : null}
              {property.settings.invoice.footer ? <Text style={[s.muted, { marginTop: 10 }]}>{property.settings.invoice.footer}</Text> : null}
            </View>
          </View>
          <View style={{ width: 200 }}>
            <Line label="Taxable value" value={money(invoice.subtotal)} />
            {interState ? (
              <Line label="IGST" value={money(invoice.igst)} />
            ) : (
              <>
                <Line label="CGST" value={money(invoice.cgst)} />
                <Line label="SGST" value={money(invoice.sgst)} />
              </>
            )}
            <View style={[s.row, { justifyContent: 'space-between', borderTopWidth: 1.6, borderTopColor: INK[900], marginTop: 4, paddingTop: 6 }]}>
              <Text style={{ fontSize: 11, lineHeight: 1.3, fontWeight: 700, color: INK[900] }}>Invoice total</Text>
              <Text style={{ fontSize: 11, lineHeight: 1.3, fontWeight: 700, color: INK[900] }}>{money(invoice.total)}</Text>
            </View>
            {booking && (
              <>
                <Line label="Paid" value={money(doc.paid)} color="#047857" />
                <View style={[s.row, { justifyContent: 'space-between', marginTop: 4, borderRadius: 6, paddingVertical: 5, paddingHorizontal: 7, backgroundColor: doc.due > 0.5 ? '#fff1f2' : '#ecfdf5' }]}>
                  <Text style={{ fontWeight: 700, color: doc.due > 0.5 ? '#be123c' : '#047857' }}>{doc.due > 0.5 ? 'Balance due' : 'Fully paid'}</Text>
                  <Text style={{ fontWeight: 700, color: doc.due > 0.5 ? '#be123c' : '#047857' }}>{money(Math.max(doc.due, 0))}</Text>
                </View>
              </>
            )}
          </View>
        </View>

        <View wrap={false} style={[s.row, { marginTop: 34, justifyContent: 'flex-end' }]}>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={s.muted}>For {property.name}</Text>
            <Text style={{ marginTop: 26, color: INK[600] }}>Authorised signatory</Text>
          </View>
        </View>

        <View fixed style={[s.row, { position: 'absolute', bottom: 24, left: 38, right: 38, justifyContent: 'space-between', borderTopWidth: 0.6, borderTopColor: INK[200], paddingTop: 7 }]}>
          <Text style={{ fontSize: 7, color: INK[400] }}>Computer-generated invoice. Accommodation SAC 996311, restaurant SAC 996331.</Text>
          <Text style={{ fontSize: 7, color: INK[400] }} render={({ pageNumber, totalPages }) => `${invoice.invoiceNo} · Page ${pageNumber} of ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}

function Line({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <View style={[s.row, { justifyContent: 'space-between', paddingVertical: 2.5 }]}>
      <Text style={{ color: color ?? INK[500] }}>{label}</Text>
      <Text style={{ color: color ?? INK[800] }}>{value}</Text>
    </View>
  );
}

/** Render the invoice to PDF bytes. */
export async function renderInvoicePdf(doc: InvoiceDocument): Promise<Buffer> {
  registerFonts();
  const [logo, qr] = await Promise.all([
    loadLogo(doc.property.branding?.logoUrl),
    doc.upiUri ? QRCode.toDataURL(doc.upiUri, { margin: 0, width: 360, color: { dark: '#0f172a', light: '#ffffff' } }) : Promise.resolve(null),
  ]);
  return renderToBuffer(<InvoicePdf doc={doc} logo={logo} qr={qr} />);
}
