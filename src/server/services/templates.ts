import { formatDay, formatINR, MEAL_PLAN_LABELS } from '@/lib/format';
import { round2 } from '@/lib/utils';

/** Message templates. Kept short: WhatsApp messages are read on a phone. */
export function bookingConfirmationText(input: {
  hotelName: string;
  hotelPhone?: string | null;
  guestName: string;
  bookingNo: string;
  checkIn: string;
  checkOut: string;
  checkInTime: string;
  rooms: { typeName: string; mealPlan: string }[];
  total: number;
  paid: number;
  status: 'confirmed' | 'hold';
  holdUntil?: string | null;
}) {
  const roomsLine = input.rooms.map((r) => `${r.typeName} (${MEAL_PLAN_LABELS[r.mealPlan] ?? r.mealPlan})`).join(', ');
  const balance = round2(input.total - input.paid);
  return [
    `Namaste ${input.guestName.split(' ')[0]} 🙏`,
    input.status === 'hold'
      ? `Your rooms at *${input.hotelName}* are on hold until ${input.holdUntil}. Please confirm before then.`
      : `Your booking at *${input.hotelName}* is confirmed.`,
    ``,
    `Booking ID: *${input.bookingNo}*`,
    `Check-in: ${formatDay(input.checkIn)} from ${input.checkInTime}`,
    `Check-out: ${formatDay(input.checkOut)}`,
    `Rooms: ${roomsLine}`,
    `Total: ${formatINR(input.total)}${input.paid > 0 ? ` · Paid ${formatINR(input.paid)} · Balance ${formatINR(balance)}` : ''}`,
    ``,
    input.hotelPhone ? `Questions? Call us on ${input.hotelPhone}.` : `We look forward to welcoming you.`,
  ].join('\n');
}

export function paymentLinkText(input: { hotelName: string; guestName: string; amount: number; purpose: string; url: string }) {
  return [
    `Namaste ${input.guestName.split(' ')[0]} 🙏`,
    `Please pay ${formatINR(input.amount)} to *${input.hotelName}* for: ${input.purpose}.`,
    `Pay securely by UPI or card: ${input.url}`,
  ].join('\n');
}

export function invoiceText(input: { hotelName: string; guestName: string; invoiceNo: string; total: number; due: number; url: string }) {
  return [
    `Thank you for staying at *${input.hotelName}*, ${input.guestName.split(' ')[0]} 🙏`,
    `Your GST invoice *${input.invoiceNo}* for ${formatINR(input.total)}${input.due > 0.5 ? ` (balance due ${formatINR(input.due)})` : ''}:`,
    input.url,
  ].join('\n');
}

export function invoiceEmailText(input: { hotelName: string; hotelPhone?: string | null; guestName: string; invoiceNo: string; total: number; due: number; upiId?: string | null; url: string }) {
  return [
    `Dear ${input.guestName.split(' ')[0]},`,
    ``,
    `Thank you for staying at ${input.hotelName}. Your GST invoice ${input.invoiceNo} for ${formatINR(input.total)} is attached as a PDF.`,
    input.due > 0.5 ? `A balance of ${formatINR(input.due)} is due${input.upiId ? `; you can pay by UPI to ${input.upiId} or scan the QR code on the invoice` : ''}.` : `The invoice is fully paid.`,
    ``,
    `You can also open it online: ${input.url}`,
    ``,
    `Warm regards,`,
    input.hotelName,
    ...(input.hotelPhone ? [input.hotelPhone] : []),
  ].join('\n');
}
