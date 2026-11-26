import { tx } from '@/i18n/tx';

/** Donut showing tonight's occupancy. The number sits inside, so the colour never stands alone (rule 6). */
export function OccupancyRing({ value, size = 96 }: { value: number; size?: number }) {
  const stroke = 9;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(100, value));
  const color = clamped >= 95 ? '#e11d48' : clamped >= 60 ? '#f59e0b' : '#10b981';
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} role="img" aria-label={`Occupancy ${clamped}%`}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#f1f5f9" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - clamped / 100)}
          style={{ transition: 'stroke-dashoffset 0.8s cubic-bezier(0.16,1,0.3,1)' }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">
        <div>
          <p className="num text-xl leading-none font-extrabold text-ink-900">{clamped}%</p>
          <p className="mt-1 text-[10px] font-medium tracking-wide text-ink-400 uppercase">{tx('occupied')}</p>
        </div>
      </div>
    </div>
  );
}
