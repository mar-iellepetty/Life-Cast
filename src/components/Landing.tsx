import { useLayoutEffect, useRef, useState } from 'react';
import { askItems, hero, images, statistics, testimonials } from '../config/content';
import { calculateAt } from '../lib/calc';
import { LifeEvent, defaultInputs, makeEvent } from '../lib/model';
import { compact } from '../lib/format';

interface Props {
  onStart: () => void;
  savedAt: number | null;
  onResume: () => void;
}

export function Landing({ onStart, savedAt, onResume }: Props) {
  return (
    <div className="landing">
      <section className="hero">
        <img src={images.lincolnEmblemLarge} alt="Lincoln Financial Group" className="hero-emblem" />
        <p className="hero-brand">Lincoln Financial Group</p>
        <p className="hero-product">Life Insurance</p>
        <h1 className="hero-tagline">{hero.tagline}</h1>
        <p className="hero-value">{hero.valueProposition}</p>
        <button className="btn primary xl" onClick={onStart}>
          {hero.cta}
        </button>
        <p className="hero-meta">{hero.duration}</p>
        {savedAt && (
          <button className="btn link" onClick={onResume}>
            Continue your saved plan from {new Date(savedAt).toLocaleDateString()}
          </button>
        )}
      </section>

      <section className="ask" aria-labelledby="ask-title">
        <h2 id="ask-title" className="section-heading">
          What we’ll ask, and why
        </h2>
        <p className="section-lede">Lincoln will ask about five things in a short conversation. Rough numbers are fine, and your answers stay on this device.</p>
        <ol className="ask-list">
          {askItems.map((a, n) => (
            <li key={a.title}>
              <span className="ask-num">{n + 1}</span>
              <div>
                <h3>{a.title}</h3>
                <p>{a.why}</p>
              </div>
            </li>
          ))}
        </ol>
        <div className="ask-cta">
          <button className="btn primary xl" onClick={onStart}>
            {hero.cta}
          </button>
        </div>
      </section>

      <WhyItMatters />

      <section className="testimonials" aria-labelledby="t-title">
        <h2 id="t-title" className="section-heading">
          Client perspectives
        </h2>
        <div className="t-grid">
          {testimonials.map((t) => (
            <figure key={t.name} className="t-item">
              <blockquote>“{t.quote}”</blockquote>
              <figcaption>
                {t.portrait ? (
                  <img src={t.portrait} alt="" className="t-avatar" />
                ) : (
                  <span className="t-avatar initials">
                    {t.name
                      .split(' ')
                      .map((s) => s[0])
                      .join('')}
                  </span>
                )}
                <span>
                  <span className="t-name">{t.name}</span>
                  <span className="t-desc">{t.descriptor}</span>
                </span>
              </figcaption>
            </figure>
          ))}
        </div>
        <p className="disclaimer">Sample testimonials for layout purposes only. They do not represent actual Lincoln Financial clients.</p>
      </section>

      <section className="closing">
        <h2 className="section-heading">See what your family may need.</h2>
        <button className="btn primary xl" onClick={onStart}>
          {hero.cta}
        </button>
      </section>
    </div>
  );
}

// ---------- Why it matters ----------

const ILLUSTRATIVE = { ...defaultInputs, age: 25, annualIncome: 65000, savings: 5000, finalExpenses: 15000, incomeReplacementYears: 3 };
const ILLUSTRATIVE_EVENTS: LifeEvent[] = [
  makeEvent('marriage', 28),
  { ...makeEvent('home', 30), financialImpact: 320000 },
  makeEvent('child', 31),
  makeEvent('child', 34),
  makeEvent('retirement', 65),
];
const MILESTONES = [
  { age: 28, label: 'Marriage' },
  { age: 30, label: 'Home' },
  { age: 32, label: 'Children' },
  { age: 52, label: 'Education complete' },
  { age: 65, label: 'Retirement' },
];
const LAYERS = [
  { key: 'incomeReplacement', label: 'Income replacement', cls: 'l1' },
  { key: 'mortgageRequirement', label: 'Mortgage', cls: 'l2' },
  { key: 'educationRequirement', label: 'Education', cls: 'l3' },
  { key: 'otherRequirements', label: 'Other obligations', cls: 'l4' },
] as const;

function WhyItMatters() {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(900);
  useLayoutEffect(() => {
    const ro = new ResizeObserver(([e]) => setW(Math.max(320, e.contentRect.width)));
    if (ref.current) ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);

  const H = 300;
  const M = { l: 60, r: 16, t: 40, b: 30 };
  const ages = Array.from({ length: 46 }, (_, i) => 25 + i);
  const data = ages.map((age) => calculateAt(ILLUSTRATIVE, ILLUSTRATIVE_EVENTS, age));
  const totals = data.map((d) => LAYERS.reduce((s, l) => s + d[l.key], 0));
  const peak = Math.max(...totals);
  const step = peak > 1500000 ? 500000 : peak > 600000 ? 250000 : 100000;
  const max = Math.ceil((peak * 1.05) / step) * step;
  const ticks = Array.from({ length: Math.round(max / step) + 1 }, (_, i) => i * step);
  const x = (age: number) => M.l + ((age - 25) / 45) * (w - M.l - M.r);
  const y = (v: number) => M.t + (1 - v / max) * (H - M.t - M.b);
  const peakIdx = totals.indexOf(Math.max(...totals));

  const areas = LAYERS.map((layer, li) => {
    const lower = data.map((d) => LAYERS.slice(0, li).reduce((s, l) => s + d[l.key], 0));
    const upper = data.map((d, i) => lower[i] + d[layer.key]);
    const top = ages.map((a, i) => `${i ? 'L' : 'M'}${x(a).toFixed(1)},${y(upper[i]).toFixed(1)}`).join('');
    const bottom = [...ages].reverse().map((a, i) => `L${x(a).toFixed(1)},${y(lower[ages.length - 1 - i]).toFixed(1)}`).join('');
    return { ...layer, d: `${top}${bottom}Z` };
  });

  return (
    <section className="why" aria-labelledby="why-title">
      <div className="why-head">
        <p className="eyebrow">Why this matters</p>
        <h2 id="why-title" className="section-heading">
          Why planning ahead matters
        </h2>
        <p className="section-lede">Financial responsibilities change dramatically over a lifetime. They tend to peak when a family is young, with a new home and children at home, then decline as debts are paid and children become independent.</p>
      </div>

      <div className="panel why-chart" ref={ref}>
        <div className="why-legend">
          {LAYERS.map((l) => (
            <span key={l.key}>
              <i className={`sw ${l.cls}`} />
              {l.label}
            </span>
          ))}
        </div>
        <svg width={w} height={H} role="img" aria-label="Illustrative financial responsibilities by age">
          {ticks.map((v) => (
            <g key={v}>
              <line x1={M.l} x2={w - M.r} y1={y(v)} y2={y(v)} className={v === 0 ? 'axis' : 'gridline'} />
              <text x={M.l - 10} y={y(v) + 4} textAnchor="end" className="tick">
                {compact(v)}
              </text>
            </g>
          ))}
          {areas.map((a) => (
            <path key={a.key} d={a.d} className={`layer ${a.cls}`} />
          ))}
          {MILESTONES.map((m) => (
            <g key={m.label}>
              <line x1={x(m.age)} x2={x(m.age)} y1={M.t - 6} y2={H - M.b} className="milestone" />
              <text x={x(m.age)} y={M.t - 14} textAnchor="middle" className="milestone-label">
                {m.label}
              </text>
            </g>
          ))}
          <circle cx={x(ages[peakIdx])} cy={y(totals[peakIdx])} r={4.5} className="dot selected" />
          <text x={x(ages[peakIdx]) + 10} y={y(totals[peakIdx]) - 8} className="peak-label">
            Peak responsibility: {compact(totals[peakIdx])} at age {ages[peakIdx]}
          </text>
          {ages
            .filter((a) => a % 5 === 0)
            .map((a) => (
              <text key={a} x={x(a)} y={H - 8} textAnchor="middle" className="tick">
                {a}
              </text>
            ))}
        </svg>
        <p className="chart-note">Illustrative household: $65,000 income at age 25, marriage at 28, a $320,000 home at 30, children at 31 and 34. Generated by the same calculation used in your plan. Not based on customer data.</p>
      </div>

      <div className="stats">
        {statistics.map((s) => (
          <div key={s.value} className="stat">
            <span className="stat-value">{s.value}</span>
            <span className="stat-label">{s.label}</span>
            <a className="stat-source" href={s.sourceUrl} target="_blank" rel="noreferrer">
              Source: {s.source}
            </a>
          </div>
        ))}
      </div>

      <p className="takeaway">
        <strong>The takeaway:</strong> the right amount of coverage depends on where you are in life. A plan built around your milestones protects your family when they need it most, without paying for more than you need.
      </p>
    </section>
  );
}
