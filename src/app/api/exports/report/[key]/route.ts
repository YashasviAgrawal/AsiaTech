import type { NextRequest } from 'next/server';
import { getContext } from '@/server/context';
import { formatCell, getReport } from '@/server/services/reports';
import { buildWorkbook, NUM_FMT, xlsxResponse } from '@/server/exports/excel';
import { addDay, formatDay } from '@/lib/format';

export async function GET(request: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  const ctx = await getContext();
  if (!ctx || !ctx.can('reports.view')) return new Response('Unauthorised', { status: 401 });
  const { key } = await params;
  const report = getReport(key);
  if (!report) return new Response('Not found', { status: 404 });
  const to = request.nextUrl.searchParams.get('to') ?? ctx.property.businessDate;
  const from = request.nextUrl.searchParams.get('from') ?? addDay(to, -29);
  const result = await report.run(ctx.propertyId, from, to);
  const rows = [...result.rows, ...(result.totals ? [result.totals] : [])].map((r) =>
    Object.fromEntries(result.columns.map((c) => [c.key, c.type === 'date' ? formatCell(r[c.key], 'date') : r[c.key]])),
  );
  const buffer = await buildWorkbook([
    {
      name: report.title.slice(0, 31),
      title: `${ctx.property.name} · ${report.title} · ${formatDay(from)} to ${formatDay(to)}`,
      columns: result.columns.map((c) => ({ header: c.label, key: c.key, width: c.type === 'text' || !c.type ? 24 : 14, numFmt: c.type === 'money' ? NUM_FMT.inr : c.type === 'number' ? NUM_FMT.int : undefined })),
      rows,
    },
  ]);
  return xlsxResponse(buffer, `${key}-${from}-to-${to}.xlsx`);
}
