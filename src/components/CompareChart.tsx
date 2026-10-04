import { useLayoutEffect, useRef, useState } from 'react';
import { compact, money } from '../lib/format';

export interface Series {
  label: string;
  tone: 'primary' | 'secondary' | 'tertiary';
  points: { age: number; value: number }[];
}

function niceStep(max: number) {
  const raw = Math.max(max, 100000) / 4;
  const p = Math.pow(10, Math.floor(Math.log10(raw)));
  const n = raw / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p;
}

/** Coverage need by age for several plans or scenarios, labeled directly at each line. */
export function CompareChart({ series: input, height = 280 }: { series: Series[]; height?: number }) {
  let series = input;
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(720);
  const [hover, setHover] = useState<number | null>(null);
  useLayoutEffect(() => {
    const ro = new ResizeObserver(([e]) => setW(Math.max(320, e.contentRect.width)));
    if (ref.current) ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);

  const M = { l: 64, r: 24, t: 16, b: 30 };
  // Show ages up to five years after the last remaining need, so the lines fill the chart.
  const rawAll = series.flatMap((s) => s.points);
  const lastNeed = Math.max(...rawAll.filter((p) => p.value > 0).map((p) => p.age), Math.min(...rawAll.map((p) => p.age)) + 10);
  const cutoff = Math.min(Math.max(...rawAll.map((p) => p.age)), lastNeed + 5);
  series = series.map((s) => ({ ...s, points: s.points.filter((p) => p.age <= cutoff) }));
  const all = series.flatMap((s) => s.points);
  const a0 = Math.min(...all.map((p) => p.age));
  const a1 = Math.max(...all.map((p) => p.age));
  const maxV = Math.max(...all.map((p) => p.value));
  const step = niceStep(maxV * 1.05);
  const yMax = Math.max(1, Math.ceil((maxV * 1.05) / step)) * step;
  const x = (age: number) => M.l + ((age - a0) / Math.max(1, a1 - a0)) * (w - M.l - M.r);
  const y = (v: number) => M.t + (1 - v / yMax) * (height - M.t - M.b);
  const ticks = Array.from({ length: Math.round(yMax / step) + 1 }, (_, i) => i * step);

  return (
    <div ref={ref} className="cmp-chart">
      <div className="cmp-legend">
        {series.map((s) => (
          <span key={s.label}>
            <i className={`ln ${s.tone}`} />
            {s.label}
          </span>
        ))}
      </div>
      <svg
        width={w}
        height={height}
        role="img"
        aria-label="Coverage need comparison by age"
        onMouseMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          const age = Math.round(a0 + ((e.clientX - r.left - M.l) / (w - M.l - M.r)) * (a1 - a0));
          setHover(age >= a0 && age <= a1 ? age : null);
        }}
        onMouseLeave={() => setHover(null)}
      >
        {ticks.map((v) => (
          <g key={v}>
            <line x1={M.l} x2={w - M.r} y1={y(v)} y2={y(v)} className={v === 0 ? 'axis' : 'gridline'} />
            <text x={M.l - 10} y={y(v) + 4} textAnchor="end" className="tick">
              {compact(v)}
            </text>
          </g>
        ))}
        {Array.from({ length: a1 - a0 + 1 }, (_, i) => a0 + i)
          .filter((a) => a % (a1 - a0 > 30 ? 10 : 5) === 0)
          .map((a) => (
            <text key={a} x={x(a)} y={height - 8} textAnchor="middle" className="tick">
              {a}
            </text>
          ))}
        {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={M.t} y2={height - M.b} className="guide" />}
        {series.map((s) => (
          <path key={s.label} d={s.points.map((p, i) => `${i ? 'L' : 'M'}${x(p.age).toFixed(1)},${y(p.value).toFixed(1)}`).join('')} className={`cmp-line ${s.tone}`} />
        ))}
        {series.map((s) => {
          const p = hover !== null ? s.points.find((q) => q.age === hover) : undefined;
          return p ? <circle key={s.label} cx={x(p.age)} cy={y(p.value)} r={4} className={`cmp-dot ${s.tone}`} /> : null;
        })}
      </svg>
      {hover !== null && (
        <div className="cmp-readout">
          <strong>Age {hover}</strong>
          {series.map((s) => {
            const p = s.points.find((q) => q.age === hover);
            return (
              <span key={s.label}>
                <i className={`sw ${s.tone}`} />
                {s.label}: {p ? money(p.value) : '—'}
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function Sparkline({ values, width = 220, height = 56 }: { values: number[]; width?: number; height?: number }) {
  const max = Math.max(1, ...values);
  const d = values.map((v, i) => `${i ? 'L' : 'M'}${((i / Math.max(1, values.length - 1)) * width).toFixed(1)},${(height - 4 - (v / max) * (height - 8)).toFixed(1)}`).join('');
  return (
    <svg width={width} height={height} className="spark" aria-hidden="true">
      <path d={`${d}L${width},${height}L0,${height}Z`} className="spark-area" />
      <path d={d} className="spark-line" />
    </svg>
  );
}
