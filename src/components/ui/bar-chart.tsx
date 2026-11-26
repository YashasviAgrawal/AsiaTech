import { cn } from '@/lib/utils';
import { formatINR, formatNumber } from '@/lib/format';

/**
 * Minimal bar chart (no chart library): one series, value labels on hover via <title>, brand colour, highlighted
 * bar for "today". Rows that do not fit horizontally scroll.
 */
export function BarChart({ data, format = 'number', highlight, height = 180 }: { data: { label: string; value: number }[]; format?: 'money' | 'number' | 'percent'; highlight?: string; height?: number }) {
  const max = Math.max(...data.map((d) => d.value), 1);
  const fmt = (v: number) => (format === 'money' ? formatINR(v, { compact: true }) : format === 'percent' ? `${v}%` : formatNumber(v));
  const gridLines = [0.25, 0.5, 0.75, 1];
  return (
    <div className="scrollbar-thin overflow-x-auto pt-3">
      <div className="relative" style={{ minWidth: data.length * 36 }}>
        <div className="pointer-events-none absolute inset-x-0 top-0" style={{ height }}>
          {gridLines.map((g) => (
            <div key={g} className="absolute inset-x-0 border-t border-dashed border-ink-200" style={{ bottom: `${g * 100}%` }}>
              <span className="num absolute -top-2.5 right-0 bg-white pl-1 text-[10px] text-ink-400">{fmt(Math.round(max * g))}</span>
            </div>
          ))}
        </div>
        <div className="relative flex items-end gap-1.5 pr-12" style={{ height }}>
          {data.map((d) => {
            const h = Math.max((d.value / max) * 100, d.value > 0 ? 2 : 0);
            const isHighlight = highlight === d.label;
            return (
              <div key={d.label} className="group relative flex h-full flex-1 flex-col justify-end">
                <div
                  className={cn('w-full rounded-t-md transition-all duration-500 ease-smooth', isHighlight ? 'bg-brand-600' : 'bg-brand-300 group-hover:bg-brand-500')}
                  style={{ height: `${h}%` }}
                  title={`${d.label}: ${fmt(d.value)}`}
                />
                <span className="num pointer-events-none absolute -top-6 left-1/2 hidden -translate-x-1/2 rounded bg-ink-900 px-1.5 py-0.5 text-[10px] font-semibold whitespace-nowrap text-white group-hover:block">{fmt(d.value)}</span>
              </div>
            );
          })}
        </div>
        <div className="mt-2 flex gap-1.5 pr-12">
          {data.map((d, i) => {
            // Dates: show the day number, plus the month on the first bar and on the 1st of a month.
            const m = d.label.match(/^(\d{1,2}) (\w{3})/);
            const text = m ? (i === 0 || m[1] === '1' ? `${m[1]} ${m[2]}` : m[1]) : d.label;
            return (
              <span key={d.label} className={cn('flex-1 truncate text-center text-[10px]', highlight === d.label ? 'font-bold text-brand-700' : 'text-ink-400')} title={d.label}>
                {text}
              </span>
            );
          })}
        </div>
      </div>
    </div>
  );
}
