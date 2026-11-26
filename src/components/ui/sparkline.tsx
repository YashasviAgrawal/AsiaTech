import { useId } from 'react';

/** Tiny trend line with a soft area fill. Pure SVG, no library; colour comes from `currentColor`. */
export function Sparkline({ values, className, width = 96, height = 28 }: { values: number[]; className?: string; width?: number; height?: number }) {
  const id = useId();
  if (values.length < 2) return null;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const span = max - min || 1;
  const step = width / (values.length - 1);
  const points = values.map((v, i) => [i * step, height - 3 - ((v - min) / span) * (height - 6)] as const);
  const line = points.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const area = `${line} L${width},${height} L0,${height} Z`;
  const [lx, ly] = points[points.length - 1];
  return (
    <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height} className={className} aria-hidden>
      <defs>
        <linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.22" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${id})`} />
      <path d={line} fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={lx} cy={ly} r="2.5" fill="currentColor" />
      <circle cx={lx} cy={ly} r="5" fill="currentColor" opacity="0.18" />
    </svg>
  );
}
