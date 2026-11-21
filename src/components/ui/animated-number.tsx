'use client';

import { useEffect, useRef, useState } from 'react';
import { formatINR, formatNumber } from '@/lib/format';

/**
 * Counts up to a value once, on first paint (about 0.7 s, ease-out). Respects reduced motion and always ends on
 * the exact, correctly formatted number.
 */
export function AnimatedNumber({ value, format = 'number' }: { value: number; format?: 'number' | 'inr' }) {
  const [shown, setShown] = useState(value);
  const started = useRef(false);
  useEffect(() => {
    if (started.current) {
      // Later updates (after a refresh) jump straight to the new value.
      const frame = requestAnimationFrame(() => setShown(value));
      return () => cancelAnimationFrame(frame);
    }
    started.current = true;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || value === 0) return;
    const duration = 700;
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setShown(t < 1 ? value * eased : value);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  const rounded = format === 'inr' ? Math.round(shown) : Math.round(shown);
  return <>{format === 'inr' ? formatINR(shown === value ? value : rounded) : formatNumber(rounded)}</>;
}
