import { DragEvent, FormEvent, useEffect, useRef, useState } from 'react';
import { calculatePlan, eventImpact } from '../lib/calc';
import { parseEvent } from '../lib/parseEvent';
import { EVENT_DEFS, ImpactCategory, LifeEvent, Plan, STANDARD_EVENTS, makeEvent, uid } from '../lib/model';
import { money } from '../lib/format';
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
  const inputRef = useRef<HTMLInputElement>(null);
  const calc = calculatePlan(plan);
  const now = plan.financialInputs.age;
  const parsed = parseEvent(text, now);
  const events = [...plan.lifeEvents].sort((a, b) => a.age - b.age);
  const clampAge = (a: number) => Math.min(calc.endAge, Math.max(calc.startAge, a));

  useEffect(() => {
    if (focusKey) inputRef.current?.focus();
  }, [focusKey]);
  useEffect(() => {
    if (customKey) setShowCustom(true);
  }, [customKey]);

  const addEvent = (ev: LifeEvent) => {
    const placed = { ...ev, age: clampAge(ev.age) };
    onAdd(placed);
    setOpen(placed.id);
  };

  const submitText = (e?: FormEvent) => {
    e?.preventDefault();
    const p = parseEvent(text, now);
    if (!p) return;
    addEvent(p.event);
    setText('');
  };

  // Something dropped on the chart: a card (by type), a suggestion (by text), or an existing event.
  const onChartDrop = (drop: ChartDrop, age: number) => {
    if (drop.kind === 'move') {
      onUpdate(drop.id, { age });
      setOpen(drop.id);
      return;
    }
    if (drop.text === 'custom') {
      setShowCustom(true);
      return;
    }
    const type = STANDARD_EVENTS.find((t) => t === drop.text);
    const ev = type ? makeEvent(type, age) : parseEvent(drop.text, now)?.event;
    if (ev) addEvent({ ...ev, age });
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
        </header>

        <form className="panel add-event" onSubmit={submitText}>
          <label htmlFor="event-text" className="add-event-label">
            What life event would you like to add?
          </label>
          <div className="add-event-row">
            <input id="event-text" ref={inputRef} className="add-event-input" value={text} onChange={(e) => setText(e.target.value)} placeholder="For example: I’m planning to buy a home in 2 years" autoComplete="off" />
            <button className="btn primary lg" type="submit" disabled={!parsed}>
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
                draggable
                onDragStart={(e) => dragData(e, { kind: 'new', text: type })}
                onClick={() => addEvent(makeEvent(type, type === 'retirement' ? plan.financialInputs.retirementAge : now + 2))}
                title="Drag onto the chart, or click to add at a suggested age"
              >
                <EventIcon type={type} size={16} />
                {EVENT_DEFS[type].label}
              </button>
            ))}
            <button type="button" className={`drag-card custom ${showCustom ? 'on' : ''}`} onClick={() => setShowCustom(!showCustom)} aria-expanded={showCustom}>
              <EventIcon type="custom" size={16} />
              Create a custom event
            </button>
          </div>
        </form>

        {showCustom && <CustomEventForm defaultAge={now + 2} minAge={calc.startAge} maxAge={calc.endAge} onAdd={(ev) => { addEvent(ev); setShowCustom(false); }} onCancel={() => setShowCustom(false)} />}

        <section className="panel chart-panel">
          <p className="projection-label">Illustrative timeline projection</p>
          <h2 className="chart-title">Your need over time</h2>
          <p className="chart-sub">Drag an event onto any age. Drag a dot left or right to change when it happens.</p>
          <NeedChart points={points} now={now} height={320} markers={events.map((e) => ({ id: e.id, age: e.age, label: e.title }))} onDrop={onChartDrop} onMarkerClick={(id) => setOpen(id)} />
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
                {isOpen && (
                  <div className="ev-edit fade">
                    {e.isCustom && (
                      <div className="mf">
                        <span>Name</span>
                        <input className="text-input" value={e.title} onChange={(x) => onUpdate(e.id, { title: x.target.value || 'Custom event' })} />
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
                    <button className="btn danger-link" onClick={() => onRemove(e.id)}>
                      Remove event
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
        <button className="btn secondary block" onClick={() => setShowCustom(true)}>
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
function CustomEventForm({ defaultAge, minAge, maxAge, onAdd, onCancel }: { defaultAge: number; minAge: number; maxAge: number; onAdd: (e: LifeEvent) => void; onCancel: () => void }) {
  const [title, setTitle] = useState('');
  const [age, setAge] = useState(defaultAge);
  const [cost, setCost] = useState(25000);
  const [years, setYears] = useState(5);
  const [category, setCategory] = useState<ImpactCategory>('other');
  const [description, setDescription] = useState('');
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => ref.current?.focus(), []);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    onAdd({ id: uid(), type: 'custom', title: title.trim(), age, financialImpact: cost, description: description.trim(), isCustom: true, category, years });
  };

  return (
    <form className="panel custom-form fade" onSubmit={submit} aria-label="Create a custom event">
      <h2 className="sub-heading">Create a custom event</h2>
      <div className="custom-grid">
        <label className="mf span-2">
          <span>Event name</span>
          <input ref={ref} className="text-input" placeholder="For example: Caring for a parent" value={title} onChange={(e) => setTitle(e.target.value)} />
        </label>
        <div className="mf">
          <span>Age</span>
          <NumberField stepper label="Age" value={age} min={minAge} max={maxAge} onChange={setAge} />
        </div>
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
        <label className="mf span-2">
          <span>Description (optional)</span>
          <input className="text-input" placeholder="For example: in-home care for my mother" value={description} onChange={(e) => setDescription(e.target.value)} />
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
