import { Receipt } from '@/lib/escpos';
import { formatDateTime } from '@/lib/format';

/** What a KOT or bill shows. Plain data, so tickets can be tested without a database. */
export interface KotTicketData {
  outletName: string;
  kotNo: number;
  orderNo: string;
  /** "TABLE T4", "ROOM 203", "TAKE-AWAY" */
  where: string;
  guestName?: string | null;
  covers?: number | null;
  by?: string | null;
  at: Date;
  items: { quantity: number; name: string; notes?: string | null; isVeg?: boolean | null }[];
  reprint?: boolean;
}

export function kotTicket(data: KotTicketData, paperWidth: 58 | 80): Buffer {
  const r = new Receipt(paperWidth);
  r.align('center').bold().size(2, 2).line(`KOT #${data.kotNo}`).size(1, 1).bold(false);
  if (data.reprint) r.bold().line('** REPRINT **').bold(false);
  r.line(`${data.outletName} - ${data.orderNo}`);
  r.bold().size(2, 2).line(data.where).size(1, 1).bold(false);
  if (data.guestName) r.line(data.guestName);
  r.line(formatDateTime(data.at) + (data.covers && data.covers > 1 ? ` - ${data.covers} guests` : ''));
  r.align('left').rule('=');
  for (const item of data.items) {
    // Double height keeps one item per glance from across the kitchen; width stays normal so names fit.
    r.bold().size(1, 2);
    const qty = String(item.quantity).padStart(2, ' ');
    const lines = wrapForQty(item.name, r.width - 4);
    lines.forEach((l, i) => r.line(`${i === 0 ? qty : '  '}  ${l}`));
    r.size(1, 1).bold(false);
    if (item.notes) r.line(`    * ${item.notes}`);
  }
  r.rule('=');
  r.line(`Items: ${data.items.reduce((t, i) => t + i.quantity, 0)}${data.by ? `   By: ${data.by}` : ''}`);
  return r.cut().bytes();
}

function wrapForQty(name: string, width: number) {
  const words = name.split(' ');
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    if (!line) line = w;
    else if ((line + ' ' + w).length <= width) line += ` ${w}`;
    else {
      lines.push(line);
      line = w;
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [''];
}

export interface BillTicketData {
  outletName: string;
  hotelName: string;
  address?: string | null;
  gstin?: string | null;
  phone?: string | null;
  billNo: string;
  at: Date;
  where: string;
  items: { name: string; quantity: number; price: number; amount: number }[];
  subtotal: number;
  discount: number;
  cgst: number;
  sgst: number;
  total: number;
  paidBy?: string | null;
  /** Shown as a QR while the bill is unpaid. */
  upiUri?: string | null;
  footer?: string | null;
}

const amount = (v: number) => v.toFixed(2);

export function billTicket(data: BillTicketData, paperWidth: 58 | 80): Buffer {
  const r = new Receipt(paperWidth);
  r.align('center').bold().size(2, 1).line(data.outletName).size(1, 1).bold(false);
  if (data.outletName !== data.hotelName) r.line(data.hotelName);
  if (data.address) r.line(data.address);
  if (data.phone) r.line(`Ph: ${data.phone}`);
  if (data.gstin) r.line(`GSTIN: ${data.gstin}`);
  r.bold().line('TAX INVOICE').bold(false);
  r.align('left').rule();
  r.row(`Bill: ${data.billNo}`, data.where);
  r.line(formatDateTime(data.at));
  r.rule();
  r.bold().row('Item', 'Amount').bold(false);
  for (const item of data.items) {
    r.row(item.name, amount(item.amount));
    r.line(`  ${item.quantity} x ${amount(item.price)}`);
  }
  r.rule();
  r.row('Subtotal', amount(data.subtotal));
  if (data.discount > 0) r.row('Discount', `-${amount(data.discount)}`);
  r.row('CGST', amount(data.cgst));
  r.row('SGST', amount(data.sgst));
  r.bold().size(1, 2).row('TOTAL', `Rs.${amount(data.total)}`).size(1, 1).bold(false);
  if (data.paidBy) r.line(`Paid by ${data.paidBy}`);
  if (data.upiUri) {
    r.align('center').feed(1).qr(data.upiUri, paperWidth <= 58 ? 4 : 6).line('Scan to pay by UPI').align('left');
  }
  r.rule();
  r.align('center').line('SAC 996331').line(data.footer || 'Thank you! Visit again.');
  return r.cut().bytes();
}

export function testTicket(printerName: string, paperWidth: 58 | 80, hotelName: string): Buffer {
  const r = new Receipt(paperWidth);
  r.align('center').bold().size(2, 2).line('Printer test').size(1, 1).bold(false);
  r.line(hotelName).line(printerName).line(formatDateTime(new Date()));
  r.align('left').rule();
  r.line(`${paperWidth} mm paper, ${r.columns} per line:`);
  r.line('1234567890'.repeat(Math.ceil(r.columns / 10)).slice(0, r.columns));
  r.row('Paneer Tikka', '240.00');
  r.row('Dal Makhani with extra butter and two butter naan', '380.00');
  r.bold().row('TOTAL', 'Rs.620.00').bold(false);
  r.rule();
  r.align('center').line('If this prints clearly, the printer is ready.');
  return r.cut().bytes();
}
