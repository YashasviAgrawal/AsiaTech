import type { NextRequest } from 'next/server';
import { getContext } from '@/server/context';
import { creditReport, listPayments, pettyCashLedger } from '@/server/services/money';
import { listActivity } from '@/server/services/activity';
import { buildWorkbook, NUM_FMT, xlsxResponse, type SheetSpec } from '@/server/exports/excel';
import { addDay, formatDateTime, formatDay, monthStart, PAYMENT_MODE_LABELS, titleCase } from '@/lib/format';

const day = (v: string | null) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);

/**
 * Excel for the money screens and the Activity Log. Each export uses the same filters (from the URL) and the
 * same service as the screen, so the file always matches what the user sees.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ kind: string }> }) {
  const ctx = await getContext();
  if (!ctx) return new Response('Unauthorised', { status: 401 });
  const { kind } = await params;
  const q = request.nextUrl.searchParams;
  const hotel = ctx.property.name;
  let sheets: SheetSpec[];
  let filename: string;

  if (kind === 'payments') {
    if (!ctx.can('money.view')) return new Response('Forbidden', { status: 403 });
    const to = day(q.get('to')) ?? ctx.property.businessDate;
    const from = day(q.get('from')) ?? addDay(to, -6);
    const { rows, byMode, total } = await listPayments(ctx.propertyId, { from, to, mode: q.get('mode') ?? undefined, kind: q.get('kind') ?? undefined });
    sheets = [
      {
        name: 'Payments',
        title: `${hotel} · Payments · ${formatDay(from)} to ${formatDay(to)}`,
        columns: [
          { header: 'Date', key: 'date', width: 14 },
          { header: 'Time', key: 'time', width: 18 },
          { header: 'Booking', key: 'bookingNo', width: 14 },
          { header: 'Kind', key: 'kind', width: 12 },
          { header: 'Mode', key: 'mode', width: 14 },
          { header: 'Amount', key: 'amount', width: 14, numFmt: NUM_FMT.inr },
          { header: 'Status', key: 'status', width: 12 },
          { header: 'Reference', key: 'reference', width: 24 },
          { header: 'For', key: 'purpose', width: 28 },
          { header: 'Received by', key: 'receivedBy', width: 18 },
        ],
        rows: rows.map((r) => ({
          date: formatDay(r.businessDate),
          time: formatDateTime(r.paidAt ?? r.createdAt),
          bookingNo: r.bookingNo ?? '',
          kind: titleCase(r.kind),
          mode: PAYMENT_MODE_LABELS[r.mode] ?? r.mode,
          amount: r.kind === 'refund' ? -r.amount : r.amount,
          status: titleCase(r.status),
          reference: r.reference ?? '',
          purpose: r.purpose ?? '',
          receivedBy: r.receivedBy ?? '',
        })),
        fill: (row, key) => (key === 'status' && row.status !== 'Success' ? 'FFFEF3C7' : undefined),
      },
      {
        name: 'By mode',
        columns: [
          { header: 'Mode', key: 'mode', width: 18 },
          { header: 'Collected', key: 'amount', width: 16, numFmt: NUM_FMT.inr },
        ],
        rows: [...Object.entries(byMode).map(([mode, amount]) => ({ mode: PAYMENT_MODE_LABELS[mode] ?? mode, amount })), { mode: 'Total', amount: total }],
      },
    ];
    filename = `payments-${from}-to-${to}.xlsx`;
  } else if (kind === 'credit') {
    if (!ctx.can('money.view')) return new Response('Forbidden', { status: 403 });
    const report = await creditReport(ctx.propertyId, ctx.property.businessDate);
    const GROUP = { guest: 'Guest', company: 'Company', agent: 'Travel agent', ota: 'OTA' } as const;
    const rows = report.groups.flatMap((g) => g.list.map((l) => ({ ...l, group: GROUP[g.billTo] })));
    sheets = [
      {
        name: 'Credit Report',
        title: `${hotel} · Credit Report (money owed) · as on ${formatDay(ctx.property.businessDate)}`,
        columns: [
          { header: 'Owed by', key: 'debtor', width: 26 },
          { header: 'Type', key: 'group', width: 12 },
          { header: 'Booking', key: 'bookingNo', width: 14 },
          { header: 'Guest', key: 'guestName', width: 22 },
          { header: 'Mobile', key: 'mobile', width: 14 },
          { header: 'Stay', key: 'stay', width: 26 },
          { header: 'Bill', key: 'bill', width: 14, numFmt: NUM_FMT.inr },
          { header: 'Paid', key: 'paid', width: 14, numFmt: NUM_FMT.inr },
          { header: 'Balance', key: 'balance', width: 14, numFmt: NUM_FMT.inr },
          { header: 'Days', key: 'days', width: 8, numFmt: NUM_FMT.int },
          { header: 'Age', key: 'bucket', width: 10 },
        ],
        rows: [
          ...rows.map((r) => ({
            debtor: r.debtor,
            group: r.group,
            bookingNo: r.bookingNo,
            guestName: r.guestName,
            mobile: r.mobile ?? '',
            stay: `${formatDay(r.checkIn)} – ${formatDay(r.checkOut)}`,
            bill: r.totalAmount + r.extras,
            paid: r.paidAmount,
            balance: r.balance,
            days: r.days,
            bucket: r.bucket,
          })),
          { debtor: 'Total', balance: report.total },
        ],
        fill: (row, key) => (key === 'bucket' && (row.bucket === '61–90' || row.bucket === '90+') ? 'FFFECACA' : undefined),
      },
      {
        name: 'Ageing',
        columns: [
          { header: 'Owed by', key: 'group', width: 14 },
          ...Object.keys(report.buckets).map((b) => ({ header: `${b} days`, key: b, width: 14, numFmt: NUM_FMT.inr })),
          { header: 'Total', key: 'total', width: 14, numFmt: NUM_FMT.inr },
        ],
        rows: [...report.groups.map((g) => ({ group: GROUP[g.billTo], ...g.buckets, total: g.total })), { group: 'All', ...report.buckets, total: report.total }],
      },
    ];
    filename = `credit-report-${ctx.property.businessDate}.xlsx`;
  } else if (kind === 'petty-cash') {
    if (!ctx.can('money.view')) return new Response('Forbidden', { status: 403 });
    const to = day(q.get('to')) ?? ctx.property.businessDate;
    const from = day(q.get('from')) ?? monthStart(to);
    const ledger = await pettyCashLedger(ctx.propertyId, from, to);
    sheets = [
      {
        name: 'Petty Cash',
        title: `${hotel} · Petty Cash · ${formatDay(from)} to ${formatDay(to)}`,
        columns: [
          { header: 'Date', key: 'date', width: 14 },
          { header: 'Type', key: 'type', width: 12 },
          { header: 'Category', key: 'category', width: 16 },
          { header: 'Paid to', key: 'paidTo', width: 20 },
          { header: 'What for', key: 'description', width: 30 },
          { header: 'Cash in', key: 'in', width: 13, numFmt: NUM_FMT.inr },
          { header: 'Cash out', key: 'out', width: 13, numFmt: NUM_FMT.inr },
          { header: 'Balance', key: 'balance', width: 13, numFmt: NUM_FMT.inr },
          { header: 'Status', key: 'status', width: 11 },
          { header: 'Entered by', key: 'by', width: 18 },
        ],
        rows: [
          { date: formatDay(from), type: 'Opening', balance: ledger.openingBalance },
          ...ledger.entries.map((e) => ({
            date: formatDay(e.entryDate),
            type: e.type === 'top_up' ? 'Cash added' : titleCase(e.type),
            category: e.category ?? '',
            paidTo: e.paidTo ?? '',
            description: e.description ?? '',
            in: e.type === 'expense' ? null : e.amount,
            out: e.type === 'expense' ? e.amount : null,
            balance: e.balance,
            status: titleCase(e.status),
            by: e.createdByName ?? '',
          })),
          { date: formatDay(to), type: 'Closing', in: ledger.added, out: ledger.spent, balance: ledger.closingBalance },
        ],
        fill: (row, key) => (key === 'status' && row.status === 'Pending' ? 'FFFEF3C7' : key === 'status' && row.status === 'Rejected' ? 'FFFECACA' : undefined),
      },
    ];
    filename = `petty-cash-${from}-to-${to}.xlsx`;
  } else if (kind === 'activity') {
    if (!ctx.can('activity.view')) return new Response('Forbidden', { status: 403 });
    const rows = await listActivity(ctx.propertyId, { q: q.get('q') ?? undefined, entity: q.get('entity') ?? undefined, user: q.get('user') ?? undefined, limit: 5000 });
    sheets = [
      {
        name: 'Activity Log',
        title: `${hotel} · Activity Log`,
        columns: [
          { header: 'When', key: 'when', width: 20 },
          { header: 'Who', key: 'who', width: 18 },
          { header: 'What', key: 'entity', width: 14 },
          { header: 'Action', key: 'action', width: 14 },
          { header: 'Change', key: 'summary', width: 80 },
        ],
        rows: rows.map(({ log, userName }) => ({
          when: formatDateTime(log.createdAt),
          who: userName ?? 'System',
          entity: titleCase(log.entityType.replace(/^pos_/, 'restaurant_')),
          action: titleCase(log.action),
          summary: log.summary + (log.undoneAt ? ' (undone)' : ''),
        })),
      },
    ];
    filename = `activity-log-${ctx.property.businessDate}.xlsx`;
  } else {
    return new Response('Not found', { status: 404 });
  }

  return xlsxResponse(await buildWorkbook(sheets), filename);
}
