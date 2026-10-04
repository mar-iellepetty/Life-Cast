import { DragEvent, FormEvent, useEffect, useRef, useState } from 'react';
import { calculatePlan, eventImpact } from '../lib/calc';
import { parseEvent } from '../lib/parseEvent';
import { EVENT_DEFS, ImpactCategory, LifeEvent, Plan, STANDARD_EVENTS, makeEvent, uid } from '../lib/model';
import { money } from '../lib/format';
import { estimateEvent } from '../lib/insights';
import { CHART_DRAG_MIME, ChartDrop, NeedChart } from './NeedChart';
import { EventIcon, MoneyField, NumberField } from './ui';

interface Props {
  plan: Plan;
  focusKey: number;
  customKey: number;
  onAdd: (e: LifeEvent) => void;
  onUpdate: (id: string, patch: Partial<LifeEvent>) => void;
  onRemove: (id: string) => void;
}

const dragData = (e: DragEvent, data: ChartDrop) => {
  e.dataTransfer.setData(CHART_DRAG_MIME, JSON.stringify(data));
  e.dataTransfer.effectAllowed = 'copyMove';
};

export function LifeEventsPage({ plan, focusKey, customKey, onAdd, onUpdate, onRemove }: Props) {
  const [text, setText] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const [showCustom, setShowCustom] = useState(false);
  // Custom events Lincoln is estimating right now, and the ones shown under the chart.
  const [pending, setPending] = useState<string[]>([]);
  const [recent, setRecent] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const calc = calculatePlan(plan);
  const now = plan.financialInputs.age;
  const parsed = parseEvent(text, now);
  const events = [...plan.lifeEvents].sort((a, b) => a.age - b.age);
  const atEventLimit = events.length >= 64;
  const clampAge = (a: number) => Math.min(calc.endAge, Math.max(calc.startAge, a));

  useEffect(() => {
    if (focusKey) inputRef.current?.focus();
  }, [focusKey]);
  useEffect(() => {
    if (customKey) setShowCustom(true);
  }, [customKey]);

  /** Ask Lincoln to estimate a custom event's cost, then update the event and the timeline. */
  const analyze = (ev: LifeEvent, useAiTitle = false) => {
    setPending((ids) => [...ids, ev.id]);
    setRecent((ids) => [ev.id, ...ids.filter((id) => id !== ev.id)].slice(0, 3));
    estimateEvent(plan, ev)
      .then((est) => onUpdate(ev.id, {
        ...(useAiTitle ? { title: est.title } : {}),
        financialImpact: est.amount,
        category: est.category,
        years: est.years,
        ai: { summary: est.summary, status: 'ready' },
      }))
      .catch((err) => onUpdate(ev.id, { ai: { summary: err instanceof Error ? err.message : 'Lincoln could not estimate this event.', status: 'error' } }))
      .finally(() => setPending((ids) => ids.filter((id) => id !== ev.id)));
  };

  const addEvent = (ev: LifeEvent, options: { estimate?: boolean; aiTitle?: boolean } = {}) => {
    if (atEventLimit) return;
    const placed = { ...ev, age: clampAge(ev.age) };
    onAdd(placed);
    setOpen(placed.id);
    if (placed.type === 'custom' && options.estimate !== false) analyze(placed, options.aiTitle);
  };

  const submitText = (e?: FormEvent) => {
    e?.preventDefault();
    const p = parseEvent(text, now);
    if (!p) return;
    addEvent(p.event, { aiTitle: true });
    setText('');
  };

  // Something dropped on the chart: a card (by type), a suggestion (by text), or an existing event.
  const onChartDrop = (drop: ChartDrop, age: number) => {
    if (drop.kind === 'move') {
      onUpdate(drop.id, { age });
      setOpen(drop.id);
      return;
    }
    if (atEventLimit) return;
    if (drop.text === 'custom') {
      setShowCustom(true);
      return;
    }
    const type = STANDARD_EVENTS.find((t) => t === drop.text);
    const ev = type ? makeEvent(type, age) : parseEvent(drop.text, now)?.event;
    if (ev) addEvent({ ...ev, age }, { aiTitle: true });
  };

  // Chart: total need from a little before the earliest event to when the need ends.
  const from = Math.min(now, ...events.map((e) => e.age));
  const lastNeed = calc.projection.filter((p) => p.estimatedCoverageNeed > 0).pop()?.age ?? now + 20;
  const to = Math.max(now + 20, lastNeed + 3, ...events.map((e) => e.age + 2));
  const points = calc.projection.filter((p) => p.age >= from && p.age <= to).map((p) => ({ age: p.age, year: p.year, value: p.estimatedCoverageNeed }));

  return (
    <div className="events-layout fade">
      <div className="events-main">
        <header>
          <p className="eyebrow">{plan.name}</p>
          <h1 className="page-title">Life events</h1>
          <p className="page-sub">Explore changes in your life, past or planned. Each event updates your illustrative timeline projection.</p>
          {atEventLimit && <p className="muted small" role="status">You can add up to 64 life events. Remove one before adding another.</p>}
        </header>

        <form className="panel add-event" onSubmit={submitText}>
          <label htmlFor="event-text" className="add-event-label">
            What life event would you like to add?
          </label>
          <div className="add-event-row">
            <input id="event-text" ref={inputRef} className="add-event-input" value={text} onChange={(e) => setText(e.target.value)} placeholder="For example: I’m planning to buy a home in 2 years" autoComplete="off" />
            <button className="btn primary lg" type="submit" disabled={!parsed || atEventLimit}>
              Add event
            </button>
          </div>
          {parsed && (
            <p className="add-event-preview">
              We’ll add: <strong>{parsed.understood}</strong>. You can adjust the details after adding it.
            </p>
          )}

          <div className="drag-cards" aria-label="Drag an event onto the chart">
            <span className="drag-hint">Or drag one onto the chart:</span>
            {STANDARD_EVENTS.map((type) => (
              <button
                key={type}
                type="button"
                className="drag-card"
                draggable={!atEventLimit}
                disabled={atEventLimit}
                onDragStart={(e) => dragData(e, { kind: 'new', text: type })}
                onClick={() => addEvent(makeEvent(type, type === 'retirement' ? plan.financialInputs.retirementAge : now + 2))}
                title="Drag onto the chart, or click to add at a suggested age"
              >
                <EventIcon type={type} size={16} />
                {EVENT_DEFS[type].label}
              </button>
            ))}
            <button type="button" disabled={atEventLimit} className={`drag-card custom ${showCustom ? 'on' : ''}`} onClick={() => setShowCustom(!showCustom)} aria-expanded={showCustom}>
              <EventIcon type="custom" size={16} />
              Create a custom event
            </button>
          </div>
        </form>

        {showCustom && !atEventLimit && <CustomEventForm defaultAge={now + 2} minAge={calc.startAge} maxAge={calc.endAge} onAdd={(ev, estimate) => { addEvent(ev, { estimate }); setShowCustom(false); }} onCancel={() => setShowCustom(false)} />}

        <section className="panel chart-panel">
          <p className="projection-label">Illustrative timeline projection</p>
          <h2 className="chart-title">Your need over time</h2>
          <p className="chart-sub">Drag an event onto any age. Drag a dot left or right to change when it happens.</p>
          <NeedChart points={points} now={now} height={320} markers={events.map((e) => ({ id: e.id, age: e.age, label: e.title }))} endLabel="Need ends" onDrop={onChartDrop} onMarkerClick={(id) => setOpen(id)} />
          <EventInsights plan={plan} ids={recent} pending={pending} onOpen={setOpen} onRemove={onRemove} />
        </section>
      </div>

      <aside className="panel events-list">
        <h2 className="panel-heading">Your life events</h2>
        <p className="muted small">Amounts show the modeled effect on this illustrative timeline.</p>
        {events.length === 0 && <p className="muted small">No events yet. Type one, drag one onto the chart, or create a custom event.</p>}
        <ul>
          {events.map((e) => {
            const impact = eventImpact(plan, e.id).total;
            const def = e.type === 'custom' ? undefined : EVENT_DEFS[e.type];
            const isOpen = open === e.id;
            return (
              <li key={e.id} className={`ev-item ${isOpen ? 'open' : ''}`} draggable onDragStart={(ev) => dragData(ev, { kind: 'move', id: e.id })}>
                <div className="ev-row">
                <button className="ev-summary" onClick={() => setOpen(isOpen ? null : e.id)} aria-expanded={isOpen}>
                  <span className="ev-check" aria-hidden="true">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                      <path d="m5 12 5 5L20 7" />
                    </svg>
                  </span>
                  <span className="ev-text">
                    <strong>{e.title}</strong>
                    <span>
                      {e.age < now ? 'Past · ' : ''}Age {e.age} · {calc.at(e.age).year}
                    </span>
                  </span>
                  <span className={`ev-impact ${impact > 0 ? 'up' : ''}`}>{impact === 0 ? 'No change' : `${impact > 0 ? '+' : '−'}${money(Math.abs(impact))}`}</span>
                </button>
                <button className="ev-delete" onClick={() => onRemove(e.id)} aria-label={`Delete ${e.title}`} title="Delete event">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
                </button>
                </div>
                {isOpen && (
                  <div className="ev-edit fade">
                    {e.isCustom && (
                      <div className="mf">
                        <span>Name</span>
                        <input className="text-input" maxLength={120} aria-label="Event name" value={e.title} onChange={(x) => onUpdate(e.id, { title: x.target.value.slice(0, 120) || 'Custom event' })} />
                        {e.title.length >= 120 && <span className="muted small" role="status">Event names can contain up to 120 characters.</span>}
                      </div>
                    )}
                    <div className="mf">
                      <span>Age</span>
                      <NumberField stepper label="Event age" value={e.age} min={calc.startAge} max={calc.endAge} onChange={(age) => onUpdate(e.id, { age })} />
                    </div>
                    {(e.isCustom || def?.impactKind === 'money') && (
                      <div className="mf">
                        <span>{e.isCustom ? 'Cost' : def!.impactLabel}</span>
                        <MoneyField label="Amount" value={e.financialImpact} onChange={(financialImpact) => onUpdate(e.id, { financialImpact })} />
                      </div>
                    )}
                    {def?.impactKind === 'percent' && (
                      <div className="mf">
                        <span>Income change</span>
                        <NumberField label="Income change" value={e.financialImpact} min={-90} max={200} suffix="%" onChange={(financialImpact) => onUpdate(e.id, { financialImpact })} />
                      </div>
                    )}
                    {e.age < now && <p className="note">Past event: skip it if it is already included in your financial information.</p>}
                    {e.isCustom && e.ai && <p className={`ai-note ${e.ai.status}`}><strong>Lincoln:</strong> {e.ai.summary}</p>}
                    <div className="ev-edit-actions">
                      {e.isCustom && (
                        <button className="btn link" disabled={pending.includes(e.id)} onClick={() => analyze(e)}>
                          {pending.includes(e.id) ? 'Lincoln is estimating…' : e.ai ? 'Ask Lincoln to estimate again' : 'Ask Lincoln to estimate'}
                        </button>
                      )}
                      <button className="btn danger-link" onClick={() => onRemove(e.id)}>
                        Remove event
                      </button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
        <button className="btn secondary block" disabled={atEventLimit} onClick={() => setShowCustom(true)}>
          + Create a custom event
        </button>
      </aside>
    </div>
  );
}

const CATEGORIES: { value: ImpactCategory; label: string }[] = [
  { value: 'other', label: 'Other cost' },
  { value: 'education', label: 'Education' },
  { value: 'mortgage', label: 'Housing' },
];

/** Inline form (not a popup) for an event that is not in the standard list. */
function CustomEventForm({ defaultAge, minAge, maxAge, onAdd, onCancel }: { defaultAge: number; minAge: number; maxAge: number; onAdd: (e: LifeEvent, estimate: boolean) => void; onCancel: () => void }) {
  const [title, setTitle] = useState('');
  const [age, setAge] = useState(defaultAge);
  const [cost, setCost] = useState(25000);
  const [years, setYears] = useState(5);
  const [category, setCategory] = useState<ImpactCategory>('other');
  const [description, setDescription] = useState('');
  const [estimate, setEstimate] = useState(true);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => ref.current?.focus(), []);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    onAdd({ id: uid(), type: 'custom', title: title.trim(), age, financialImpact: estimate ? 0 : cost, description: description.trim(), isCustom: true, category, years }, estimate);
  };

  return (
    <form className="panel custom-form fade" onSubmit={submit} aria-label="Create a custom event">
      <h2 className="sub-heading">Create a custom event</h2>
      <div className="custom-grid">
        <label className="mf span-2">
          <span>Event name</span>
          <input ref={ref} className="text-input" maxLength={120} placeholder="For example: Caring for a parent" value={title} onChange={(e) => setTitle(e.target.value.slice(0, 120))} />
          {title.length >= 120 && <span className="muted small" role="status">Event names can contain up to 120 characters.</span>}
        </label>
        <div className="mf">
          <span>Age</span>
          <NumberField stepper label="Age" value={age} min={minAge} max={maxAge} onChange={setAge} />
        </div>
        <label className="estimate-toggle span-2">
          <input type="checkbox" checked={estimate} onChange={(e) => setEstimate(e.target.checked)} />
          <span>
            <strong>Let Lincoln estimate the cost</strong>
            <span className="muted small"> Describe it in your own words, for example "hurricane damage to our house in Florida", and Lincoln will estimate what changes and why.</span>
          </span>
        </label>
        {!estimate && <>
        <div className="mf">
          <span>Total cost</span>
          <MoneyField label="Total cost" value={cost} onChange={setCost} />
        </div>
        <div className="mf">
          <span>Spread over</span>
          <NumberField stepper label="Years" value={years} min={1} max={40} suffix="years" onChange={setYears} />
        </div>
        <div className="mf">
          <span>Type of cost</span>
          <div className="seg small">
            {CATEGORIES.map((c) => (
              <button key={c.value} type="button" className={category === c.value ? 'on' : ''} onClick={() => setCategory(c.value)}>
                {c.label}
              </button>
            ))}
          </div>
        </div>
        </>}
        <label className="mf span-2">
          <span>Description (optional)</span>
          <input className="text-input" maxLength={2000} placeholder="For example: in-home care for my mother" value={description} onChange={(e) => setDescription(e.target.value.slice(0, 2000))} />
          {description.length >= 2000 && <span className="muted small" role="status">Descriptions can contain up to 2,000 characters.</span>}
        </label>
      </div>
      <div className="custom-actions">
        <button type="button" className="btn ghost" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="btn primary" disabled={!title.trim()}>
          Add event
        </button>
      </div>
    </form>
  );
}

const CATEGORY_LABEL: Record<ImpactCategory, string> = { mortgage: 'Housing', education: 'Education', other: 'Other cost' };

/** "What Lincoln expects" under the timeline for the latest custom events. */
function EventInsights({ plan, ids, pending, onOpen, onRemove }: { plan: Plan; ids: string[]; pending: string[]; onOpen: (id: string) => void; onRemove: (id: string) => void }) {
  const shown = ids.map((id) => plan.lifeEvents.find((e) => e.id === id)).filter((e): e is LifeEvent => Boolean(e));
  if (!shown.length) return null;
  const calc = calculatePlan(plan);
  return (
    <div className="event-insights" aria-live="polite">
      <p className="event-insights-title">What Lincoln expects</p>
      {shown.map((e) => {
        const busy = pending.includes(e.id);
        return (
          <div key={e.id} role="button" tabIndex={0} className={`event-insight ${busy ? 'busy' : ''} ${e.ai?.status === 'error' ? 'error' : ''}`} onClick={() => onOpen(e.id)} onKeyDown={(k) => { if (k.key === 'Enter') onOpen(e.id); }}>
            <span className="event-insight-head">
              <strong>{e.title}</strong>
              <span className="muted small">Age {e.age} · {calc.at(e.age).year}</span>
              <button type="button" className="ev-delete" onClick={(x) => { x.stopPropagation(); onRemove(e.id); }} aria-label={`Delete ${e.title}`} title="Delete event">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
              </button>
            </span>
            {busy ? (
              <span className="event-insight-body">Lincoln is reviewing this event and your timeline…</span>
            ) : e.ai ? (
              <>
                <span className="event-insight-body">{e.ai.summary}</span>
                {e.ai.status === 'ready' && (
                  <span className="event-insight-tags">
                    <span>{e.financialImpact > 0 ? `+${money(e.financialImpact)}` : 'No cost'}</span>
                    {e.financialImpact > 0 && <span>{CATEGORY_LABEL[e.category ?? 'other']}</span>}
                    {e.financialImpact > 0 && <span>over {e.years ?? 1} {(e.years ?? 1) === 1 ? 'year' : 'years'}</span>}
                  </span>
                )}
              </>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
