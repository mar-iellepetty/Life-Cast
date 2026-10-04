import { DragEvent, PointerEvent, useLayoutEffect, useRef, useState } from 'react';
import { compact, money } from '../lib/format';

export interface ChartPoint {
  age: number;
  year: number;
  value: number;
}

export interface ChartMarker {
  id?: string;
  age: number;
  label: string;
}

/** Data carried when something is dragged onto the chart. */
export type ChartDrop = { kind: 'new'; text: string } | { kind: 'move'; id: string };
export const CHART_DRAG_MIME = 'application/x-lincoln-event';

interface Props {
  points: ChartPoint[];
  now: number;
  markers?: ChartMarker[];
  endLabel?: string;
  height?: number;
  /** Enables dropping events onto the chart and dragging event dots to a new age. */
  onDrop?: (drop: ChartDrop, age: number) => void;
  onMarkerClick?: (id: string) => void;
  /** Optional dashed line, e.g. the timeline after health and location adjustments. */
  adjusted?: { points: ChartPoint[]; label: string };
}

function niceStep(max: number) {
  const raw = Math.max(max, 50000) / 3;
  const p = Math.pow(10, Math.floor(Math.log10(raw)));
  const n = raw / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p;
}

/** One line, one shaded area, a "today" marker and minimal labels. */
export function NeedChart({ points, now, markers = [], endLabel, height = 380, onDrop, onMarkerClick, adjusted }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(800);
  const [hover, setHover] = useState<ChartPoint | null>(null);
  const [dropAge, setDropAge] = useState<number | null>(null);
  const [moving, setMovingState] = useState<{ id: string; age: number; startX: number; moved: boolean } | null>(null);
  // Mirror in a ref so fast drags never read a stale value between renders.
  const movingRef = useRef(moving);
  const setMoving = (m: typeof moving) => {
    movingRef.current = m;
    setMovingState(m);
  };
  useLayoutEffect(() => {
    const ro = new ResizeObserver(([e]) => setW(Math.max(300, e.contentRect.width)));
    if (ref.current) ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);

  const a0 = points[0].age;
  const a1 = points[points.length - 1].age;
  const span = a1 - a0;
  const max = Math.max(...points.map((p) => p.value), ...(adjusted?.points.map((p) => p.value) ?? []));
  const step = niceStep(max * 1.08);
  const yMax = Math.max(1, Math.ceil((max * 1.08) / step)) * step;
  const ML = 56, MR = 20;
  const x = (age: number) => ML + ((age - a0) / Math.max(1, span)) * (w - ML - MR);
  const point = (age: number) => points.find((p) => p.age === age);

  // Every label (Today, life events, the adjusted line) is centered over its point and placed in the
  // lowest row where it does not overlap a neighbour. The chart reserves top space for those rows.
  type Label = { key: string; age: number; text: string; value: number; cls: string };
  const labels: Label[] = [];
  const todayPoint = point(now);
  if (todayPoint) labels.push({ key: 'today', age: now, text: `Today: ${money(todayPoint.value)}`, value: todayPoint.value, cls: 'nc-today-label' });
  for (const m of markers) {
    const age = moving && moving.id === m.id && moving.moved ? moving.age : m.age;
    const p = point(age);
    if (p) labels.push({ key: `ev-${m.id ?? m.label}-${m.age}`, age, text: m.label.length > 22 ? `${m.label.slice(0, 21)}…` : m.label, value: p.value, cls: `nc-marker-label ${age < now ? 'past' : ''}` });
  }
  if (adjusted) {
    const future = adjusted.points.filter((p) => p.age >= Math.max(now, a0));
    const at = future[Math.floor(future.length / 3)];
    if (at) labels.push({ key: 'adjusted', age: at.age, text: adjusted.label, value: at.value, cls: 'nc-adjusted-label' });
  }
  const placed = (() => {
    const rowsEnd: number[] = [];
    return [...labels]
      .sort((a, b) => a.age - b.age || (a.key === 'today' ? -1 : 1))
      .map((l) => {
        const half = l.text.length * 3.5 + 8;
        const left = x(l.age) - half;
        let row = rowsEnd.findIndex((end) => end < left);
        if (row === -1) row = rowsEnd.length;
        rowsEnd[row] = x(l.age) + half;
        return { ...l, row };
      });
  })();
  const rows = placed.length ? Math.max(...placed.map((l) => l.row)) + 1 : 0;
  const M = { l: ML, r: MR, t: 20 + rows * 16, b: 30 };
  const y = (v: number) => M.t + (1 - v / yMax) * (height - M.t - M.b);
  // Labels live in a reserved band above the plot (row 0 closest to it), joined to their point by a thin line.
  const labelY = (l: { row: number }) => M.t - 8 - l.row * 16;
  const ageAt = (clientX: number) => {
    const r = ref.current!.getBoundingClientRect();
    return Math.min(a1, Math.max(a0, Math.round(a0 + ((clientX - r.left - M.l) / (w - M.l - M.r)) * span)));
  };
  const ticks = Array.from({ length: Math.round(yMax / step) + 1 }, (_, i) => i * step);
  const ageStep = span > 40 ? 10 : 5;
  const line = (from: number, to: number) =>
    points
      .filter((p) => p.age >= from && p.age <= to)
      .map((p, i) => `${i ? 'L' : 'M'}${x(p.age).toFixed(1)},${y(p.value).toFixed(1)}`)
      .join('');
  const futureLine = line(Math.max(now, a0), a1);
  const area = `${futureLine}L${x(a1)},${y(0)}L${x(Math.max(now, a0))},${y(0)}Z`;
  const today = todayPoint;
  const hoverEvents = hover ? markers.filter((m) => m.age === hover.age).map((m) => m.label) : [];
  const hoverAdjusted = hover && adjusted ? adjusted.points.find((p) => p.age === hover.age)?.value : undefined;
  const end = endLabel ? points.find((p, i) => i > 0 && p.value === 0 && points[i - 1].value > 0) : undefined;
  const targetAge = moving?.moved ? moving.age : dropAge;

  // ---- Drag from outside (cards, suggestions, list items)
  const dragOver = (e: DragEvent) => {
    if (!onDrop || !e.dataTransfer.types.includes(CHART_DRAG_MIME)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    setDropAge(ageAt(e.clientX));
  };
  const drop = (e: DragEvent) => {
    if (!onDrop) return;
    const raw = e.dataTransfer.getData(CHART_DRAG_MIME);
    setDropAge(null);
    if (!raw) return;
    e.preventDefault();
    onDrop(JSON.parse(raw) as ChartDrop, ageAt(e.clientX));
  };

  // ---- Drag an event dot sideways to move it
  const startMove = (e: PointerEvent, id: string, age: number) => {
    if (!onDrop) return;
    e.stopPropagation();
    try {
      // Keep receiving moves even if the pointer leaves the dot.
      ((e.currentTarget as SVGElement).ownerSVGElement ?? (e.currentTarget as Element)).setPointerCapture(e.pointerId);
    } catch {
      /* capture is a nicety; dragging still works without it */
    }
    setMoving({ id, age, startX: e.clientX, moved: false });
  };
  const moveMove = (e: PointerEvent) => {
    const m = movingRef.current;
    if (!m) return;
    const moved = m.moved || Math.abs(e.clientX - m.startX) > 4;
    setMoving({ ...m, age: ageAt(e.clientX), moved });
  };
  const endMove = () => {
    const m = movingRef.current;
    if (!m) return;
    if (m.moved) onDrop?.({ kind: 'move', id: m.id }, m.age);
    else onMarkerClick?.(m.id);
    setMoving(null);
  };

  return (
    <div
      ref={ref}
      className={`need-chart ${onDrop ? 'droppable' : ''} ${dropAge !== null ? 'drop-active' : ''}`}
      onDragOver={dragOver}
      onDragLeave={(e) => {
        if (!ref.current?.contains(e.relatedTarget as Node)) setDropAge(null);
      }}
      onDrop={drop}
    >
      <svg
        width={w}
        height={height}
        role="img"
        aria-label="Coverage need over time"
        onPointerMove={(e) => {
          if (movingRef.current) return moveMove(e);
          setHover(point(ageAt(e.clientX)) ?? null);
        }}
        onPointerUp={endMove}
        onPointerLeave={() => !movingRef.current && setHover(null)}
      >
        {ticks.map((v) => (
          <g key={v}>
            <line x1={M.l} x2={w - M.r} y1={y(v)} y2={y(v)} className={v === 0 ? 'axis' : 'gridline'} />
            <text x={M.l - 10} y={y(v) + 4} textAnchor="end" className="tick">
              {compact(v)}
            </text>
          </g>
        ))}
        {points
          .filter((p) => p.age % ageStep === 0)
          .map((p) => (
            <text key={p.age} x={x(p.age)} y={height - 8} textAnchor="middle" className="tick">
              {p.age}
            </text>
          ))}

        {/* Drop target: highlight every age, and the one under the pointer */}
        {targetAge !== null && (
          <g pointerEvents="none">
            {points.map((p) => (
              <line key={p.age} x1={x(p.age)} x2={x(p.age)} y1={height - M.b} y2={height - M.b + 5} className={`slot ${p.age === targetAge ? 'on' : ''}`} />
            ))}
            <rect x={x(targetAge) - (w - M.l - M.r) / Math.max(1, span) / 2} y={M.t} width={(w - M.l - M.r) / Math.max(1, span)} height={height - M.t - M.b} className="drop-col" />
          </g>
        )}

        {now > a0 && <path d={line(a0, now)} className="nc-line past" />}
        <path d={area} className="nc-area" />
        <path d={futureLine} className="nc-line" />
        {adjusted && adjusted.points.length > 1 && (
          <g pointerEvents="none">
            <path d={adjusted.points.filter((p) => p.age >= Math.max(now, a0)).map((p, i) => `${i ? 'L' : 'M'}${x(p.age).toFixed(1)},${y(p.value).toFixed(1)}`).join('')} className="nc-adjusted" />

          </g>
        )}

        {placed.map((l) => {
          const ly = labelY(l);
          const dotY = y(l.value);
          return (
            <g key={`label-${l.key}`} pointerEvents="none">
              {dotY - ly > 10 && <line x1={x(l.age)} x2={x(l.age)} y1={ly + 4} y2={dotY - 8} className="nc-label-stem" />}
              <text x={Math.min(w - MR - (l.text.length * 3.5 + 4), Math.max(ML + l.text.length * 3.5 + 4, x(l.age)))} y={ly} textAnchor="middle" className={l.cls}>
                {l.text}
              </text>
            </g>
          );
        })}
        {markers.map((m) => {
          const age = moving && moving.id === m.id && moving.moved ? moving.age : m.age;
          const p = point(age);
          if (!p) return null;
          return (
            <g key={m.id ?? `${m.label}-${m.age}`}>
              <line x1={x(age)} x2={x(age)} y1={y(p.value)} y2={height - M.b} className="nc-marker-stem" />
              <circle
                cx={x(age)}
                cy={y(p.value)}
                r={onDrop ? 8 : 6}
                className={`nc-dot ${age < now ? 'past' : ''} ${onDrop && m.id ? 'grab' : ''}`}
                onPointerDown={m.id ? (e) => startMove(e, m.id!, m.age) : undefined}
              >
                <title>{onDrop ? `${m.label}: drag to change the age` : m.label}</title>
              </circle>
            </g>
          );
        })}

        {today && (
          <g pointerEvents="none">
            <circle cx={x(now)} cy={y(today.value)} r={7} className="nc-today" />
          </g>
        )}
        {end && (
          <g pointerEvents="none">
            <circle cx={x(end.age)} cy={y(0)} r={5} className="nc-dot" />
            <text x={x(end.age)} y={y(0) - 14} textAnchor="middle" className="nc-end-label">
              {endLabel} · {end.year}
            </text>
          </g>
        )}

        {targetAge !== null ? (
          <g transform={`translate(${Math.min(w - M.r - 190, x(targetAge) + 12)},${M.t})`} className="hover-tag" pointerEvents="none">
            <rect width={180} height={28} rx={6} />
            <text x={10} y={19} className="hover-strong">
              {moving ? 'Move to' : 'Drop at'} age {targetAge} · {point(targetAge)?.year}
            </text>
          </g>
        ) : (
          hover && (
            <g pointerEvents="none">
              <line x1={x(hover.age)} x2={x(hover.age)} y1={M.t} y2={height - M.b} className="guide" />
              <g transform={`translate(${Math.min(w - M.r - 190, x(hover.age) + 10)},${Math.max(M.t, y(hover.value) - 54)})`} className="hover-tag">
                <rect width={180} height={42 + (hoverEvents.length ? 16 : 0) + (hoverAdjusted !== undefined ? 16 : 0)} rx={6} />
                <text x={10} y={16} className="hover-sub">
                  Age {hover.age} · {hover.year}
                </text>
                <text x={10} y={33} className="hover-strong">
                  {money(hover.value)}
                </text>
                {hoverAdjusted !== undefined && (
                  <text x={10} y={50} className="hover-sub adjusted">
                    Adjusted: {money(hoverAdjusted)}
                  </text>
                )}
                {hoverEvents.length > 0 && (
                  <text x={10} y={hoverAdjusted !== undefined ? 66 : 50} className="hover-sub event">
                    {hoverEvents.join(', ')}
                  </text>
                )}
              </g>
            </g>
          )
        )}
      </svg>
    </div>
  );
}
