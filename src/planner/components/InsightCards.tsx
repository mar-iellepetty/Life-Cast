import { FormEvent, useEffect, useRef, useState } from 'react';
import type { Adjustment, Plan } from '../lib/model';
import { readAppleHealthExport, SAMPLE_HEALTH, type HealthMetrics } from '../lib/appleHealth';
import { reviewHealth, reviewLocation } from '../lib/insights';

interface Props {
  plan: Plan;
  onAdjustment: (key: 'health' | 'location', value: Adjustment | null) => void;
  onLocation: (location: string) => void;
}

const signed = (p: number) => `${p > 0 ? '+' : p < 0 ? '−' : ''}${Math.abs(p)}%`;

/** Apple Health habits (left) and environmental risk for where you live (right). */
export function InsightCards({ plan, onAdjustment, onLocation }: Props) {
  return (
    <div className="insight-cards">
      <HealthCard value={plan.adjustments?.health} onChange={(v) => onAdjustment('health', v)} />
      <LocationCard value={plan.adjustments?.location} initial={plan.financialInputs.location ?? ''} onChange={(v) => onAdjustment('location', v)} onLocation={onLocation} />
    </div>
  );
}

function Effect({ value }: { value: Adjustment }) {
  return (
    <div className="insight-effect">
      <span className={`insight-percent ${value.percent > 0 ? 'up' : value.percent < 0 ? 'down' : ''}`}>{signed(value.percent)}</span>
      <div>
        <p className="insight-headline">{value.headline}</p>
        {value.reasons.length > 0 && (
          <ul className="insight-reasons">
            {value.reasons.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

const METRIC_LABELS: [keyof HealthMetrics, string, (v: number) => string][] = [
  ['avgDailySteps', 'Daily steps', (v) => v.toLocaleString('en-US')],
  ['restingHeartRate', 'Resting heart rate', (v) => `${v} bpm`],
  ['sleepHours', 'Sleep', (v) => `${v} h`],
  ['exerciseMinutes', 'Exercise', (v) => `${v} min/day`],
  ['bmi', 'BMI', (v) => String(v)],
];

function HealthCard({ value, onChange }: { value?: Adjustment; onChange: (v: Adjustment | null) => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const run = async (metrics: () => Promise<HealthMetrics>, sample: boolean) => {
    setError('');
    try {
      setBusy(sample ? 'Reviewing sample habits…' : 'Reading your export…');
      const m = await metrics();
      setBusy('Lincoln is reviewing your habits…');
      onChange(await reviewHealth(m, sample));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Your health data could not be reviewed.');
    } finally {
      setBusy(null);
    }
  };

  const onFile = (file?: File) => {
    if (!file) return;
    run(() => readAppleHealthExport(file, (f) => setBusy(`Reading your export… ${Math.round(f * 100)}%`)), false);
    if (fileRef.current) fileRef.current.value = '';
  };

  return (
    <section className="panel insight-card" aria-labelledby="health-title">
      <div className="insight-head">
        <span className="insight-icon health" aria-hidden="true">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M12 21s-7.5-4.6-9.6-9.3C.9 8.3 3.1 4.5 6.8 4.5c2 0 3.6 1.1 5.2 3 1.6-1.9 3.2-3 5.2-3 3.7 0 5.9 3.8 4.4 7.2C19.5 16.4 12 21 12 21Z" /></svg>
        </span>
        <div>
          <h2 id="health-title" className="insight-title">Apple Health</h2>
          <p className="insight-sub">Your activity, sleep and heart-rate habits</p>
        </div>
      </div>

      {value ? (
        <>
          <Effect value={value} />
          <dl className="insight-metrics">
            {METRIC_LABELS.filter(([k]) => typeof value.metrics?.[k] === 'number').map(([k, label, fmt]) => (
              <div key={k}>
                <dt>{label}</dt>
                <dd>{fmt(value.metrics![k] as number)}</dd>
              </div>
            ))}
          </dl>
          <p className="insight-note">{value.sample ? 'Sample data for demonstration. ' : 'Last 90 days from your Apple Health export. '}Only these averages were sent to Lincoln.</p>
          <div className="insight-actions">
            <button className="btn link" onClick={() => fileRef.current?.click()} disabled={!!busy}>Use a different export</button>
            <button className="btn link muted-link" onClick={() => onChange(null)}>Remove</button>
          </div>
        </>
      ) : (
        <>
          <p className="insight-body">Healthy habits can lower your illustrative need slightly; higher-risk habits can raise it. The change is capped at 10%.</p>
          <div className="insight-actions">
            <button className="btn primary sm" onClick={() => fileRef.current?.click()} disabled={!!busy}>Upload Apple Health export</button>
            <button className="btn secondary sm" onClick={() => run(async () => SAMPLE_HEALTH, true)} disabled={!!busy}>Try sample data</button>
          </div>
          <p className="insight-note">On your iPhone: Health app → your profile picture → Export All Health Data. Choose export.zip or export.xml. The file is read on this computer and is not uploaded.</p>
        </>
      )}
      <input ref={fileRef} type="file" accept=".zip,.xml,application/zip,text/xml" hidden onChange={(e) => onFile(e.target.files?.[0])} />
      {busy && <p className="insight-status" role="status">{busy}</p>}
      {error && <p className="insight-error" role="alert">{error}</p>}
    </section>
  );
}

// ---------------------------------------------------------------------------

function LocationCard({ value, initial, onChange, onLocation }: { value?: Adjustment; initial: string; onChange: (v: Adjustment | null) => void; onLocation: (l: string) => void }) {
  const [query, setQuery] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const run = async (where: string) => {
    setError('');
    setBusy(true);
    try {
      onChange(await reviewLocation({ query: where }));
      onLocation(where);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That location could not be checked.');
    } finally {
      setBusy(false);
    }
  };

  // A location from the intake conversation is checked automatically once.
  const autoChecked = useRef(false);
  useEffect(() => {
    if (!autoChecked.current && initial.trim() && !value) { autoChecked.current = true; run(initial.trim()); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (query.trim()) run(query.trim().slice(0, 120));
  };

  const top = value?.hazards?.slice(0, 2).map((h) => h.label.toLowerCase()).join(' and ');

  return (
    <section className="panel insight-card" aria-labelledby="location-title">
      <div className="insight-head">
        <span className="insight-icon location" aria-hidden="true">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.8 12 21 12 21Z" /><circle cx="12" cy="9.5" r="2.5" /></svg>
        </span>
        <div>
          <h2 id="location-title" className="insight-title">Where you live</h2>
          <p className="insight-sub">Local environmental risk</p>
        </div>
      </div>

      <form className="location-form" onSubmit={submit}>
        <input className="text-input" value={query} maxLength={120} onChange={(e) => setQuery(e.target.value)} placeholder="City and state, or ZIP code" aria-label="City and state, or ZIP code" />
        <button className="btn primary sm" type="submit" disabled={!query.trim() || busy}>{busy ? 'Checking…' : 'Check'}</button>
      </form>

      {value && !busy && (
        <div className="location-result">
          <span className={`insight-percent ${value.percent > 0 ? 'up' : ''}`}>{signed(value.percent)}</span>
          <p>
            <strong>{value.county}</strong>: {String(value.overall).toLowerCase()} risk{top ? `, mainly ${top}` : ''}.{' '}
            {value.source && (
              <a href={value.source.url} target="_blank" rel="noreferrer">
                FEMA data
              </a>
            )}
          </p>
          <button className="btn link muted-link small" onClick={() => onChange(null)} aria-label="Remove location adjustment">Remove</button>
        </div>
      )}
      {error && <p className="insight-error" role="alert">{error}</p>}
    </section>
  );
}
