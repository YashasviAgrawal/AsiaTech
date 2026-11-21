import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Download } from 'lucide-react';
import { requireContext } from '@/server/context';
import { formatCell, getReport, type ColumnType } from '@/server/services/reports';
import { addDay, formatINR, formatNumber } from '@/lib/format';
import { Card, EmptyState, PageHeader } from '@/components/ui/card';
import { buttonClasses } from '@/components/ui/button-styles';
import { Table, TBody, Td, Th, THead, Tr } from '@/components/ui/table';
import { FilterBar } from '@/components/ui/filter-bar';
import { BarChart } from '@/components/ui/bar-chart';

export async function generateMetadata({ params }: { params: Promise<{ key: string }> }): Promise<Metadata> {
  const { key } = await params;
  return { title: getReport(key)?.title ?? 'Report' };
}

function display(value: string | number | null | undefined, type: ColumnType = 'text') {
  if (typeof value === 'number') {
    if (type === 'money') return formatINR(value);
    if (type === 'percent') return `${value}%`;
    if (type === 'number') return formatNumber(value);
  }
  return formatCell(value, type);
}

export default async function ReportPage({ params, searchParams }: { params: Promise<{ key: string }>; searchParams: Promise<{ from?: string; to?: string }> }) {
  const ctx = await requireContext('reports.view');
  const { key } = await params;
  const report = getReport(key);
  if (!report) notFound();
  const sp = await searchParams;
  const biz = ctx.property.businessDate;
  const defaultBack = key === 'occupancy' ? -13 : -29;
  const from = sp.from ?? addDay(biz, defaultBack);
  const to = sp.to ?? (key === 'occupancy' ? addDay(biz, 14) : biz);
  const result = await report.run(ctx.propertyId, from, to);
  const numeric = (t?: ColumnType) => t === 'money' || t === 'number' || t === 'percent';

  return (
    <div>
      <Link href="/reports" className="mb-3 inline-flex items-center gap-1 text-sm font-medium text-ink-500 hover:text-ink-800">
        <ArrowLeft className="h-4 w-4" /> All reports
      </Link>
      <PageHeader
        eyebrow={`Reports · ${report.group}`}
        title={report.title}
        description={report.description}
        actions={
          <a href={`/api/exports/report/${key}?from=${from}&to=${to}`} className={buttonClasses('primary')}>
            <Download className="h-4 w-4" /> Export Excel
          </a>
        }
      />
      <FilterBar className="mb-4" fields={[{ key: 'from', type: 'date', label: 'From' }, { key: 'to', type: 'date', label: 'To' }]} />
      {result.chart && result.rows.length > 0 && (
        <Card className="mb-5 p-5">
          <p className="mb-4 text-sm font-semibold text-ink-700">{result.chart.label}</p>
          <BarChart
            data={result.rows.slice(0, 40).map((r) => ({ label: String(display(r[result.chart!.labelKey], result.columns.find((c) => c.key === result.chart!.labelKey)?.type)), value: Number(r[result.chart!.valueKey] ?? 0) }))}
            format={result.chart.type === 'money' ? 'money' : result.chart.type === 'percent' ? 'percent' : 'number'}
            highlight={result.chart.labelKey === 'date' ? String(display(biz, 'date')) : undefined}
          />
        </Card>
      )}
      <Card>
        {result.rows.length === 0 ? (
          <div className="p-6">
            <EmptyState title="No data for these dates" />
          </div>
        ) : (
          <Table minWidth={Math.max(640, result.columns.length * 120)}>
            <THead>
              <tr>
                {result.columns.map((c) => (
                  <Th key={c.key} className={numeric(c.type) ? 'text-right' : undefined}>
                    {c.label}
                  </Th>
                ))}
              </tr>
            </THead>
            <TBody>
              {result.rows.map((row, i) => (
                <Tr key={i}>
                  {result.columns.map((c) => (
                    <Td key={c.key} className={numeric(c.type) ? 'num text-right' : c.type === 'date' ? 'whitespace-nowrap' : undefined}>
                      {display(row[c.key], c.type)}
                    </Td>
                  ))}
                </Tr>
              ))}
              {result.totals && (
                <tr className="border-t-2 border-ink-200 bg-ink-50 font-bold text-ink-900">
                  {result.columns.map((c) => (
                    <td key={c.key} className={`px-4 py-3 first:pl-5 last:pr-5 ${numeric(c.type) ? 'num text-right' : ''}`}>
                      {display(result.totals![c.key], c.type)}
                    </td>
                  ))}
                </tr>
              )}
            </TBody>
          </Table>
        )}
        {result.note && <p className="border-t border-ink-100 px-5 py-3 text-xs text-ink-500">{result.note}</p>}
      </Card>
    </div>
  );
}
