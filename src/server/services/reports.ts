import 'server-only';
import { and, desc, eq, gte, lte, ne, sql } from 'drizzle-orm';
import { db } from '@/db';
import { bookings, folioLines, hkTasks, invoices, maintenanceTickets, nightAudits, payments, posOrderItems, posOrders, rooms, users } from '@/db/schema';
import { dateRange, formatDay, nightsBetween, PAYMENT_MODE_LABELS, sourceLabel } from '@/lib/format';
import { round2 } from '@/lib/utils';

export type ColumnType = 'text' | 'number' | 'money' | 'percent' | 'date';
export interface ReportColumn {
  key: string;
  label: string;
  type?: ColumnType;
}
export interface ReportResult {
  columns: ReportColumn[];
  rows: Record<string, string | number | null>[];
  totals?: Record<string, string | number | null>;
  chart?: { label: string; valueKey: string; labelKey: string; type: ColumnType };
  note?: string;
}

export interface ReportDef {
  key: string;
  title: string;
  description: string;
  group: 'Rooms' | 'Money' | 'Restaurant' | 'Operations';
  run: (propertyId: string, from: string, to: string) => Promise<ReportResult>;
}

const sumKey = (rows: Record<string, unknown>[], key: string) => round2(rows.reduce((t, r) => t + Number(r[key] ?? 0), 0));

export const REPORTS: ReportDef[] = [
  {
    key: 'occupancy',
    title: 'Occupancy, ADR & RevPAR',
    description: 'Rooms sold, occupancy %, average rate and revenue per available room, day by day.',
    group: 'Rooms',
    async run(propertyId, from, to) {
      const inv = await db.execute<{ date: string; total: number; blocked: number; booked: number }>(sql`
        SELECT date::text, sum(total)::int AS total, sum(blocked)::int AS blocked, sum(booked)::int AS booked
        FROM inventory WHERE property_id = ${propertyId} AND date BETWEEN ${from}::date AND ${to}::date GROUP BY date ORDER BY date`);
      const rev = await db.execute<{ date: string; amount: number; nights: number }>(sql`
        SELECT n->>'date' AS date, COALESCE(sum((n->>'amount')::numeric), 0)::float AS amount, count(*)::int AS nights
        FROM booking_rooms br CROSS JOIN jsonb_array_elements(br.nightly) n
        WHERE br.property_id = ${propertyId} AND br.status IN ('reserved','in_house','departed')
          AND br.check_in <= ${to}::date AND br.check_out > ${from}::date
          AND (n->>'date')::date BETWEEN ${from}::date AND ${to}::date
        GROUP BY 1`);
      const revMap = new Map(rev.rows.map((r) => [r.date, r]));
      const rows = inv.rows.map((d) => {
        const sellable = Math.max(d.total - d.blocked, 0);
        const r = revMap.get(d.date);
        const amount = r?.amount ?? 0;
        return {
          date: d.date,
          sellable,
          sold: d.booked,
          occupancy: sellable ? Math.round((d.booked / sellable) * 1000) / 10 : 0,
          adr: r?.nights ? Math.round(amount / r.nights) : 0,
          revpar: sellable ? Math.round(amount / sellable) : 0,
          revenue: round2(amount),
        };
      });
      const sellable = rows.reduce((t, r) => t + r.sellable, 0);
      const sold = rows.reduce((t, r) => t + r.sold, 0);
      const revenue = sumKey(rows, 'revenue');
      return {
        columns: [
          { key: 'date', label: 'Date', type: 'date' },
          { key: 'sellable', label: 'Rooms to sell', type: 'number' },
          { key: 'sold', label: 'Rooms sold', type: 'number' },
          { key: 'occupancy', label: 'Occupancy', type: 'percent' },
          { key: 'adr', label: 'ADR', type: 'money' },
          { key: 'revpar', label: 'RevPAR', type: 'money' },
          { key: 'revenue', label: 'Room revenue', type: 'money' },
        ],
        rows,
        totals: { date: 'Total', sellable, sold, occupancy: sellable ? Math.round((sold / sellable) * 1000) / 10 : 0, adr: sold ? Math.round(revenue / sold) : 0, revpar: sellable ? Math.round(revenue / sellable) : 0, revenue },
        chart: { label: 'Occupancy %', valueKey: 'occupancy', labelKey: 'date', type: 'percent' },
      };
    },
  },
  {
    key: 'revenue-by-source',
    title: 'Revenue by source',
    description: 'Bookings, room nights and revenue from each OTA, the front desk and the booking engine.',
    group: 'Rooms',
    async run(propertyId, from, to) {
      const rows = await db
        .select({
          source: bookings.source,
          channel: bookings.channel,
          count: sql<number>`count(*)::int`,
          nights: sql<number>`sum(${bookings.nights})::int`,
          revenue: sql<number>`sum(${bookings.totalAmount})::float`,
        })
        .from(bookings)
        .where(and(eq(bookings.propertyId, propertyId), sql`${bookings.status} NOT IN ('cancelled','no_show')`, gte(bookings.checkIn, from), lte(bookings.checkIn, to)))
        .groupBy(bookings.source, bookings.channel);
      const total = rows.reduce((t, r) => t + r.revenue, 0);
      const out = rows
        .map((r) => ({ source: sourceLabel(r.source, r.channel), bookings: r.count, nights: r.nights, revenue: round2(r.revenue), share: total ? Math.round((r.revenue / total) * 1000) / 10 : 0, adr: r.nights ? Math.round(r.revenue / r.nights) : 0 }))
        .sort((a, b) => b.revenue - a.revenue);
      return {
        columns: [
          { key: 'source', label: 'Source' },
          { key: 'bookings', label: 'Bookings', type: 'number' },
          { key: 'nights', label: 'Room nights', type: 'number' },
          { key: 'adr', label: 'Avg / night', type: 'money' },
          { key: 'revenue', label: 'Revenue', type: 'money' },
          { key: 'share', label: 'Share', type: 'percent' },
        ],
        rows: out,
        totals: { source: 'Total', bookings: sumKey(out, 'bookings'), nights: sumKey(out, 'nights'), revenue: round2(total), share: 100 },
        chart: { label: 'Revenue', valueKey: 'revenue', labelKey: 'source', type: 'money' },
        note: 'By check-in date. Includes GST. Cancelled and no-show bookings are excluded.',
      };
    },
  },
  {
    key: 'collections',
    title: 'Collections',
    description: 'Money received each day by cash, UPI, card, bank and payment link.',
    group: 'Money',
    async run(propertyId, from, to) {
      const data = await db
        .select({ date: payments.businessDate, mode: payments.mode, kind: payments.kind, amount: sql<number>`sum(${payments.amount})::float` })
        .from(payments)
        .where(and(eq(payments.propertyId, propertyId), eq(payments.status, 'success'), gte(payments.businessDate, from), lte(payments.businessDate, to)))
        .groupBy(payments.businessDate, payments.mode, payments.kind);
      const modes = ['cash', 'upi', 'card', 'bank_transfer', 'link'];
      const rows = dateRange(from, nightsBetween(from, to) + 1).map((date) => {
        const row: Record<string, string | number> = { date };
        let total = 0;
        for (const m of modes) {
          const v = data.filter((d) => d.date === date && d.mode === m).reduce((t, d) => t + (d.kind === 'refund' ? -d.amount : d.amount), 0);
          row[m] = round2(v);
          total += v;
        }
        row.total = round2(total);
        return row;
      });
      return {
        columns: [{ key: 'date', label: 'Date', type: 'date' }, ...modes.map((m) => ({ key: m, label: PAYMENT_MODE_LABELS[m], type: 'money' as const })), { key: 'total', label: 'Total', type: 'money' }],
        rows,
        totals: Object.fromEntries([['date', 'Total'], ...[...modes, 'total'].map((m) => [m, sumKey(rows, m)])]),
        chart: { label: 'Collected', valueKey: 'total', labelKey: 'date', type: 'money' },
      };
    },
  },
  {
    key: 'gst',
    title: 'GST summary (GSTR-1 helper)',
    description: 'Every invoice and restaurant bill with taxable value, CGST and SGST. Hand this to your CA.',
    group: 'Money',
    async run(propertyId, from, to) {
      const inv = await db
        .select()
        .from(invoices)
        .where(and(eq(invoices.propertyId, propertyId), eq(invoices.status, 'issued'), gte(invoices.invoiceDate, from), lte(invoices.invoiceDate, to)))
        .orderBy(invoices.invoiceDate);
      const pos = await db
        .select()
        .from(posOrders)
        .where(and(eq(posOrders.propertyId, propertyId), eq(posOrders.status, 'settled'), ne(posOrders.settlementMode, 'room_transfer'), gte(posOrders.businessDate, from), lte(posOrders.businessDate, to)))
        .orderBy(posOrders.businessDate);
      const rows = [
        ...inv.map((i) => ({ date: i.invoiceDate, number: i.invoiceNo, type: 'Room invoice', buyer: i.buyerName, gstin: i.buyerGstin ?? 'B2C', taxable: i.subtotal, cgst: i.cgst, sgst: i.sgst, total: i.total })),
        ...pos.map((o) => ({ date: o.businessDate, number: o.billNo ?? o.orderNo, type: 'Restaurant bill', buyer: o.guestName ?? 'Walk-in', gstin: 'B2C', taxable: round2(o.subtotal - o.discount), cgst: o.cgst, sgst: o.sgst, total: o.total })),
      ].sort((a, b) => a.date.localeCompare(b.date));
      return {
        columns: [
          { key: 'date', label: 'Date', type: 'date' },
          { key: 'number', label: 'Invoice / bill no.' },
          { key: 'type', label: 'Type' },
          { key: 'buyer', label: 'Buyer' },
          { key: 'gstin', label: 'GSTIN' },
          { key: 'taxable', label: 'Taxable', type: 'money' },
          { key: 'cgst', label: 'CGST', type: 'money' },
          { key: 'sgst', label: 'SGST', type: 'money' },
          { key: 'total', label: 'Total', type: 'money' },
        ],
        rows,
        totals: { date: 'Total', taxable: sumKey(rows, 'taxable'), cgst: sumKey(rows, 'cgst'), sgst: sumKey(rows, 'sgst'), total: sumKey(rows, 'total') },
        note: 'Restaurant bills moved to a room are part of the room invoice and are not listed twice.',
      };
    },
  },
  {
    key: 'room-revenue',
    title: 'Room revenue posted',
    description: 'Room charges posted to folios by business date (what Night Audit closed).',
    group: 'Money',
    async run(propertyId, from, to) {
      const data = await db
        .select({ date: folioLines.businessDate, type: folioLines.type, amount: sql<number>`sum(${folioLines.amount})::float`, tax: sql<number>`sum(${folioLines.cgst} + ${folioLines.sgst})::float` })
        .from(folioLines)
        .where(and(eq(folioLines.propertyId, propertyId), eq(folioLines.isVoid, false), gte(folioLines.businessDate, from), lte(folioLines.businessDate, to)))
        .groupBy(folioLines.businessDate, folioLines.type);
      const rows = dateRange(from, nightsBetween(from, to) + 1).map((date) => {
        const room = data.find((d) => d.date === date && d.type === 'room');
        const pos = data.find((d) => d.date === date && d.type === 'pos');
        const extra = data.filter((d) => d.date === date && !['room', 'pos'].includes(d.type)).reduce((t, d) => t + d.amount, 0);
        const tax = data.filter((d) => d.date === date).reduce((t, d) => t + d.tax, 0);
        return { date, room: round2(room?.amount ?? 0), pos: round2(pos?.amount ?? 0), extra: round2(extra), tax: round2(tax), total: round2((room?.amount ?? 0) + (pos?.amount ?? 0) + extra + tax) };
      });
      return {
        columns: [
          { key: 'date', label: 'Business date', type: 'date' },
          { key: 'room', label: 'Room', type: 'money' },
          { key: 'pos', label: 'Restaurant to room', type: 'money' },
          { key: 'extra', label: 'Extras & discounts', type: 'money' },
          { key: 'tax', label: 'GST', type: 'money' },
          { key: 'total', label: 'Total', type: 'money' },
        ],
        rows,
        totals: { date: 'Total', room: sumKey(rows, 'room'), pos: sumKey(rows, 'pos'), extra: sumKey(rows, 'extra'), tax: sumKey(rows, 'tax'), total: sumKey(rows, 'total') },
        chart: { label: 'Room revenue', valueKey: 'room', labelKey: 'date', type: 'money' },
      };
    },
  },
  {
    key: 'restaurant-items',
    title: 'Restaurant sales by item',
    description: 'What sold, how many and for how much.',
    group: 'Restaurant',
    async run(propertyId, from, to) {
      const rows = await db
        .select({ item: posOrderItems.name, qty: sql<number>`sum(${posOrderItems.quantity})::int`, amount: sql<number>`sum(${posOrderItems.amount})::float`, orders: sql<number>`count(DISTINCT ${posOrderItems.orderId})::int` })
        .from(posOrderItems)
        .innerJoin(posOrders, eq(posOrders.id, posOrderItems.orderId))
        .where(and(eq(posOrderItems.propertyId, propertyId), ne(posOrderItems.status, 'void'), ne(posOrders.status, 'void'), gte(posOrders.businessDate, from), lte(posOrders.businessDate, to)))
        .groupBy(posOrderItems.name)
        .orderBy(desc(sql`sum(${posOrderItems.amount})`));
      const out = rows.map((r) => ({ ...r, amount: round2(r.amount) }));
      return {
        columns: [
          { key: 'item', label: 'Item' },
          { key: 'qty', label: 'Quantity', type: 'number' },
          { key: 'orders', label: 'Orders', type: 'number' },
          { key: 'amount', label: 'Sales (before GST)', type: 'money' },
        ],
        rows: out,
        totals: { item: 'Total', qty: sumKey(out, 'qty'), orders: '', amount: sumKey(out, 'amount') },
        chart: { label: 'Sales', valueKey: 'amount', labelKey: 'item', type: 'money' },
      };
    },
  },
  {
    key: 'restaurant-daily',
    title: 'Restaurant sales by day',
    description: 'Bills and revenue per day, split by payment mode.',
    group: 'Restaurant',
    async run(propertyId, from, to) {
      const data = await db
        .select({ date: posOrders.businessDate, mode: posOrders.settlementMode, n: sql<number>`count(*)::int`, total: sql<number>`sum(${posOrders.total})::float` })
        .from(posOrders)
        .where(and(eq(posOrders.propertyId, propertyId), eq(posOrders.status, 'settled'), gte(posOrders.businessDate, from), lte(posOrders.businessDate, to)))
        .groupBy(posOrders.businessDate, posOrders.settlementMode);
      const modes = ['cash', 'upi', 'card', 'room_transfer', 'complimentary'];
      const rows = dateRange(from, nightsBetween(from, to) + 1).map((date) => {
        const row: Record<string, string | number> = { date, bills: data.filter((d) => d.date === date).reduce((t, d) => t + d.n, 0) };
        for (const m of modes) row[m] = round2(data.find((d) => d.date === date && d.mode === m)?.total ?? 0);
        row.total = round2(modes.reduce((t, m) => t + Number(row[m]), 0));
        return row;
      });
      return {
        columns: [{ key: 'date', label: 'Date', type: 'date' }, { key: 'bills', label: 'Bills', type: 'number' }, ...modes.map((m) => ({ key: m, label: PAYMENT_MODE_LABELS[m], type: 'money' as const })), { key: 'total', label: 'Total', type: 'money' }],
        rows,
        totals: Object.fromEntries([['date', 'Total'], ['bills', sumKey(rows, 'bills')], ...[...modes, 'total'].map((m) => [m, sumKey(rows, m)])]),
        chart: { label: 'Sales', valueKey: 'total', labelKey: 'date', type: 'money' },
      };
    },
  },
  {
    key: 'housekeeping',
    title: 'Housekeeping productivity',
    description: 'Rooms cleaned and inspected per person, and repair tickets raised.',
    group: 'Operations',
    async run(propertyId, from, to) {
      const done = await db
        .select({ name: users.name, cleaned: sql<number>`count(*) FILTER (WHERE ${hkTasks.status} = 'done')::int`, inspected: sql<number>`count(*) FILTER (WHERE ${hkTasks.status} = 'verified')::int`, open: sql<number>`count(*) FILTER (WHERE ${hkTasks.status} IN ('pending','in_progress'))::int` })
        .from(hkTasks)
        .leftJoin(users, eq(users.id, hkTasks.assignedTo))
        .where(and(eq(hkTasks.propertyId, propertyId), gte(hkTasks.dueDate, from), lte(hkTasks.dueDate, to)))
        .groupBy(users.name);
      const tickets = await db
        .select({ room: rooms.number, n: sql<number>`count(*)::int` })
        .from(maintenanceTickets)
        .leftJoin(rooms, eq(rooms.id, maintenanceTickets.roomId))
        .where(and(eq(maintenanceTickets.propertyId, propertyId), sql`(${maintenanceTickets.createdAt} AT TIME ZONE 'Asia/Kolkata')::date BETWEEN ${from}::date AND ${to}::date`))
        .groupBy(rooms.number);
      const rows = done.map((d) => ({ staff: d.name ?? 'Unassigned', cleaned: d.cleaned, inspected: d.inspected, open: d.open }));
      return {
        columns: [
          { key: 'staff', label: 'Staff' },
          { key: 'cleaned', label: 'Rooms cleaned', type: 'number' },
          { key: 'inspected', label: 'Inspected', type: 'number' },
          { key: 'open', label: 'Still open', type: 'number' },
        ],
        rows,
        totals: { staff: 'Total', cleaned: sumKey(rows, 'cleaned'), inspected: sumKey(rows, 'inspected'), open: sumKey(rows, 'open') },
        note: `${tickets.reduce((t, r) => t + r.n, 0)} repair ticket(s) raised in this period.`,
      };
    },
  },
  {
    key: 'night-audit',
    title: 'Night Audit history',
    description: 'Every closed day with occupancy, revenue and cash difference.',
    group: 'Operations',
    async run(propertyId, from, to) {
      const list = await db
        .select({ audit: nightAudits, runBy: users.name })
        .from(nightAudits)
        .leftJoin(users, eq(users.id, nightAudits.runBy))
        .where(and(eq(nightAudits.propertyId, propertyId), gte(nightAudits.businessDate, from), lte(nightAudits.businessDate, to)))
        .orderBy(nightAudits.businessDate);
      const rows = list.map(({ audit, runBy }) => ({
        date: audit.businessDate,
        status: audit.status,
        occupancy: Number(audit.summary.occupancy ?? 0),
        roomRevenue: Number(audit.summary.roomRevenue ?? 0),
        restaurant: Number(audit.summary.restaurantRevenue ?? 0),
        cashDifference: Number(audit.summary.cashDifference ?? 0),
        runBy: runBy ?? '—',
      }));
      return {
        columns: [
          { key: 'date', label: 'Business date', type: 'date' },
          { key: 'status', label: 'Status' },
          { key: 'occupancy', label: 'Occupancy', type: 'percent' },
          { key: 'roomRevenue', label: 'Room revenue', type: 'money' },
          { key: 'restaurant', label: 'Restaurant', type: 'money' },
          { key: 'cashDifference', label: 'Cash difference', type: 'money' },
          { key: 'runBy', label: 'Run by' },
        ],
        rows,
      };
    },
  },
];

export function getReport(key: string) {
  return REPORTS.find((r) => r.key === key) ?? null;
}

export function formatCell(value: string | number | null | undefined, type: ColumnType = 'text') {
  if (value === null || value === undefined || value === '') return '';
  if (type === 'date' && typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return formatDay(value);
  return value;
}

