import { useEffect, useRef, useState } from 'react';
import { useAvatarVoice } from '../../hooks/useAvatarVoice';
import { images } from '../config/content';
import { financialInputsFromHousehold } from '../lib/backend';
import { FinancialInputs, LifeEvent, makeEvent } from '../lib/model';
import { compact, money } from '../lib/format';
import { MoneyField, NumberField } from './ui';

type Step = 'age' | 'dependents' | 'children' | 'income' | 'debts' | 'debtAmounts' | 'coverage' | 'coverageAmount' | 'savings' | 'location' | 'events' | 'done';

interface Message {
  from: 'lincoln' | 'user';
  text: string;
  why?: string;
}

const PROMPTS: Record<Exclude<Step, 'done'>, { text: string; why: string }> = {
  age: { text: 'Hello, I’m Lincoln. I’ll ask a few quick questions about your life and finances. It takes about two minutes. First, how old are you?', why: 'Your age tells us how many working years your family would need to plan for.' },
  dependents: { text: 'Who depends on your income?', why: 'This tells us who would rely on your income if you were not here.' },
  children: { text: 'How many children do you have, and how old is your youngest?', why: 'Children need support until they are independent, so their ages shape your plan.' },
  income: { text: 'What is your yearly income before taxes?', why: 'This estimates how much income your family would need replaced.' },
  debts: { text: 'Do you have a mortgage or any other debts?', why: 'Debts can remain after a death. Coverage can pay them off so your family does not have to.' },
  debtAmounts: { text: 'About how much is left on each?', why: 'Approximate numbers are fine.' },
  coverage: { text: 'Do you already have life insurance, including any through work?', why: 'So we never recommend coverage you already have.' },
  coverageAmount: { text: 'How much coverage do you have in total?', why: 'Group coverage through an employer counts too.' },
  savings: { text: 'Roughly how much do you have in savings and investments?', why: 'Savings your family could use reduce the coverage you need.' },
  location: { text: 'Where do you live? A city and state, or a ZIP code, is enough.', why: 'Local risks such as hurricanes, floods or wildfires can affect your plan. We check FEMA’s National Risk Index for your county.' },
  events: { text: 'Last one. Are any big changes coming up in the next few years?', why: 'Life events like a new child or a new home change how much protection you need.' },
};

interface Props {
  initial: FinancialInputs;
  onComplete: (inputs: FinancialInputs, events: LifeEvent[]) => void;
  onExit: () => void;
}

export function IntakeChat({ initial, onComplete, onExit }: Props) {
  const [v, setV] = useState<FinancialInputs>({ ...initial, spouse: false, children: 0, childAges: undefined, otherDependents: false, mortgage: 0, otherDebts: 0, existingCoverage: 0 });
  const [step, setStep] = useState<Step>('age');
  const [messages, setMessages] = useState<Message[]>([{ from: 'lincoln', ...PROMPTS.age }]);
  const [deps, setDeps] = useState({ partner: false, children: false, other: false });
  const [plans, setPlans] = useState({ marriage: false, child: false, home: false });
  const [events, setEvents] = useState<LifeEvent[]>([]);
  const [descriptionOpen, setDescriptionOpen] = useState(false), [description, setDescription] = useState('');
  const [parsing, setParsing] = useState(false), [intakeError, setIntakeError] = useState('');
  const [review, setReview] = useState<FinancialInputs | null>(null);
  const descriptionRequest = useRef<AbortController | null>(null);
  const voice = useAvatarVoice();
  const logRef = useRef<HTMLDivElement>(null);
  const set = (patch: Partial<FinancialInputs>) => setV((p) => ({ ...p, ...patch, ...('children' in patch || 'youngestChildAge' in patch ? { childAges: undefined } : {}) }));
  const order: Step[] = ['age', 'dependents', 'income', 'debts', 'coverage', 'savings', 'location', 'events', 'done'];
  const progress = Math.min(1, order.indexOf(step === 'children' ? 'dependents' : step === 'debtAmounts' ? 'debts' : step === 'coverageAmount' ? 'coverage' : step) / (order.length - 1));

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);
  useEffect(() => () => { descriptionRequest.current?.abort(); }, []);

  const hearQuestion = () => {
    if (voice.isSpeaking) { voice.stopSpeech(); return; }
    voice.prepareAudio();
    const last = [...messages].reverse().find(message => message.from === 'lincoln');
    if (last) void voice.speak(last.text);
  };
  const readDescription = async () => {
    if (!description.trim() || parsing) return;
    descriptionRequest.current?.abort(); const controller = new AbortController(); descriptionRequest.current = controller;
    setParsing(true); setIntakeError(''); setReview(null);
    try {
      const response = await fetch('/api/intake', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: description.trim() }), signal: AbortSignal.any([controller.signal, AbortSignal.timeout(90000)]) });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.household) throw new Error(typeof data?.error === 'string' ? data.error : 'Lincoln could not read those details. Please try again or use the questions.');
      if (controller.signal.aborted || descriptionRequest.current !== controller) return;
      setReview(financialInputsFromHousehold(data.household, v));
    } catch (error) {
      if (!controller.signal.aborted) setIntakeError(error instanceof Error && error.name !== 'TypeError' ? error.message : 'The intake service could not connect. Please try again or use the questions.');
    } finally { if (descriptionRequest.current === controller) { descriptionRequest.current = null; setParsing(false); } }
  };
  const applyDescription = (continueToEvents: boolean) => {
    if (!review) return;
    voice.endVoice(); setV(review); setDeps({ partner: review.spouse, children: review.children > 0, other: review.otherDependents });
    setEvents([]); setReview(null); setDescriptionOpen(false);
    if (continueToEvents) {
      setMessages([{ from: 'user', text: description.trim() }, { from: 'lincoln', text: 'You have reviewed the details from your description. Before calculating, let’s check for upcoming changes.' }, { from: 'lincoln', ...PROMPTS.events }]);
      setStep('events');
    } else { setMessages([{ from: 'lincoln', ...PROMPTS.age }]); setStep('age'); }
  };

  const reply = (userText: string, next: Step) => {
    voice.stopSpeech();
    const out: Message[] = [{ from: 'user', text: userText }];
    if (next === 'done') {
      out.push({ from: 'lincoln', text: 'Thank you. Check your answers below before continuing. After you confirm them, CalcXML will calculate your insurance assessment, and we can explore the planning tabs together.' });
    } else out.push({ from: 'lincoln', ...PROMPTS[next] });
    setMessages((m) => [...m, ...out]);
    setStep(next);
  };

  const dependentsText = () => {
    const parts = [deps.partner && 'my partner', deps.children && 'my children', deps.other && 'other family'].filter(Boolean) as string[];
    return parts.length ? `${parts.join(', ').replace(/, ([^,]*)$/, ' and $1')}`.replace(/^./, (c) => c.toUpperCase()) : 'No one right now';
  };

  const submitDependents = () => {
    const none = !deps.partner && !deps.children && !deps.other;
    const next = { ...v, spouse: deps.partner, otherDependents: deps.other, children: deps.children ? Math.max(1, v.children) : 0, childAges: deps.children ? v.childAges : undefined, incomeReplacementYears: none ? 3 : 10 };
    setV(next);
    reply(dependentsText(), deps.children ? 'children' : 'income');
  };

  const submitEvents = () => {
    const evs: LifeEvent[] = [];
    if (plans.marriage) evs.push(makeEvent('marriage', v.age + 1));
    if (plans.child) evs.push(makeEvent('child', v.age + 2));
    if (plans.home) evs.push(makeEvent('home', v.age + 3));
    setEvents(evs);
    const text = evs.length ? evs.map((e) => e.title).join(', ') : 'Nothing planned right now';
    reply(text, 'done');
  };

  return (
    <div className="intake">
      <div className="intake-top">
        <button className="btn link" onClick={onExit}>
          ← Back to overview
        </button>
        <span className="intake-step">{step === 'done' ? 'All done' : `Question ${order.indexOf(step === 'children' ? 'dependents' : step === 'debtAmounts' ? 'debts' : step === 'coverageAmount' ? 'coverage' : step) + 1} of ${order.length - 1}`}</span>
      </div>
      <div className="intake-progress" aria-hidden="true">
        <span style={{ width: `${Math.max(4, progress * 100)}%` }} />
      </div>

      <div className="intake-voice">
        <button className="btn secondary" onClick={hearQuestion}>{voice.isSpeaking ? 'Stop voice' : 'Hear question'}</button>
        {voice.playbackBlocked && <button className="btn secondary" onClick={voice.retryPlayback}>Play audio</button>}
        <button className="btn link" onClick={() => setDescriptionOpen(value => !value)}>Describe in your own words</button>
        {voice.provider === 'local-sapi' && <span>Using Windows voice while Amazon Polly is unavailable.</span>}
      </div>
      {voice.error && <p className="intake-error" role="alert">{voice.error}</p>}
      {descriptionOpen && <section className="intake-description" aria-label="Describe your household">
        <label htmlFor="planner-description">Tell Lincoln about your household</label>
        <p>Include your age, income, dependents, debts, savings, and existing coverage. You will review the details before they are used.</p>
        <textarea id="planner-description" value={description} onChange={event => setDescription(event.target.value)} rows={4} maxLength={8000} placeholder="For example: I’m 36, married, earn $100,000 a year, and have two children aged 4 and 8…" />
        <button className="btn primary" disabled={parsing || !description.trim()} onClick={() => void readDescription()}>{parsing ? 'Reading with Bedrock…' : 'Read my description'}</button>
        {parsing && <button className="btn link" onClick={() => { descriptionRequest.current?.abort(); descriptionRequest.current = null; setParsing(false); }}>Cancel</button>}
        {intakeError && <p className="intake-error" role="alert">{intakeError}</p>}
        {review && <div className="intake-review">
          <h3>Review what Lincoln read</h3>
          <p>Check every amount. Unstated details may be zero or retain a displayed planning assumption.</p>
          <InputSummary inputs={review} />
          <button className="btn primary" onClick={() => applyDescription(true)}>Use reviewed details</button>
          <button className="btn secondary" onClick={() => applyDescription(false)}>Edit answers first</button>
        </div>}
      </section>}

      <div className="chat-card">
        <div className="chat-log" ref={logRef} aria-live="polite">
          {messages.map((m, i) => (
            <div key={i} className={`msg ${m.from}`}>
              {m.from === 'lincoln' && <img src={images.lincolnEmblem} alt="" className="msg-avatar" />}
              <div className="msg-bubble">
                <p>{m.text}</p>
                {m.why && <p className="msg-why">Why I ask: {m.why}</p>}
              </div>
            </div>
          ))}
        </div>

        <div className="chat-dock" key={step}>
          {step === 'age' && (
            <Row>
              <NumberField large stepper label="Your age" value={v.age} min={18} max={75} suffix="years" onChange={(age) => set({ age, retirementAge: Math.max(v.retirementAge, age + 1) })} />
              <Send onClick={() => reply(`I’m ${v.age}`, 'dependents')} />
            </Row>
          )}

          {step === 'dependents' && (
            <>
              <div className="reply-chips">
                <Chip on={deps.partner} label="Partner" onClick={() => setDeps({ ...deps, partner: !deps.partner })} />
                <Chip on={deps.children} label="Children" onClick={() => setDeps({ ...deps, children: !deps.children })} />
                <Chip on={deps.other} label="Other family" onClick={() => setDeps({ ...deps, other: !deps.other })} />
                <Chip on={false} label="No one right now" onClick={() => { setDeps({ partner: false, children: false, other: false }); }} />
              </div>
              <Send label="Continue" onClick={submitDependents} />
            </>
          )}

          {step === 'children' && (
            <Row>
              <label className="dock-field">
                <span>Children</span>
                <NumberField stepper label="Number of children" value={Math.max(1, v.children)} min={1} max={8} onChange={(children) => set({ children })} />
              </label>
              <label className="dock-field">
                <span>Youngest’s age</span>
                <NumberField stepper label="Age of youngest child" value={v.youngestChildAge} min={0} max={21} onChange={(youngestChildAge) => set({ youngestChildAge })} />
              </label>
              <Send onClick={() => reply(`${v.children} ${v.children === 1 ? 'child' : 'children'}, youngest is ${v.youngestChildAge}`, 'income')} />
            </Row>
          )}

          {step === 'income' && (
            <>
              <div className="reply-chips">
                {[50000, 75000, 100000, 150000, 200000].map((n) => (
                  <Chip key={n} on={v.annualIncome === n} label={compact(n)} onClick={() => set({ annualIncome: n })} />
                ))}
              </div>
              <Row>
                <MoneyField large label="Yearly income" value={v.annualIncome} onChange={(annualIncome) => set({ annualIncome })} />
                <Send onClick={() => reply(money(v.annualIncome), 'debts')} />
              </Row>
            </>
          )}

          {step === 'debts' && (
            <div className="reply-chips">
              <Chip on={false} label="Yes" onClick={() => reply('Yes', 'debtAmounts')} />
              <Chip on={false} label="No debts" onClick={() => { const n = { ...v, mortgage: 0, otherDebts: 0 }; setV(n); reply('No debts', 'coverage'); }} />
            </div>
          )}

          {step === 'debtAmounts' && (
            <Row>
              <label className="dock-field">
                <span>Mortgage</span>
                <MoneyField label="Mortgage balance" value={v.mortgage} onChange={(mortgage) => set({ mortgage })} />
              </label>
              <label className="dock-field">
                <span>Car, student, cards</span>
                <MoneyField label="Other debts" value={v.otherDebts} onChange={(otherDebts) => set({ otherDebts })} />
              </label>
              <Send onClick={() => reply(`Mortgage ${money(v.mortgage)}, other debts ${money(v.otherDebts)}`, 'coverage')} />
            </Row>
          )}

          {step === 'coverage' && (
            <div className="reply-chips">
              <Chip on={false} label="Yes" onClick={() => reply('Yes', 'coverageAmount')} />
              <Chip on={false} label="No" onClick={() => { const n = { ...v, existingCoverage: 0 }; setV(n); reply('No', 'savings'); }} />
            </div>
          )}

          {step === 'coverageAmount' && (
            <Row>
              <MoneyField large label="Existing coverage" value={v.existingCoverage} onChange={(existingCoverage) => set({ existingCoverage })} />
              <Send onClick={() => reply(money(v.existingCoverage), 'savings')} />
            </Row>
          )}

          {step === 'savings' && (
            <>
              <div className="reply-chips">
                {[0, 10000, 50000, 100000, 250000].map((n) => (
                  <Chip key={n} on={v.savings === n} label={n === 0 ? 'None' : compact(n)} onClick={() => set({ savings: n })} />
                ))}
              </div>
              <Row>
                <MoneyField large label="Savings" value={v.savings} onChange={(savings) => set({ savings })} />
                <Send onClick={() => reply(v.savings ? money(v.savings) : 'No savings yet', 'location')} />
              </Row>
            </>
          )}

          {step === 'location' && (
            <>
              <Row>
                <input
                  className="text-input dock-text"
                  value={v.location ?? ''}
                  maxLength={120}
                  placeholder="For example: Miami, FL or 33101"
                  aria-label="Where you live"
                  onChange={(e) => set({ location: e.target.value.slice(0, 120) })}
                  onKeyDown={(e) => { if (e.key === 'Enter' && v.location?.trim()) reply(v.location.trim(), 'events'); }}
                />
                <Send onClick={() => (v.location?.trim() ? reply(v.location.trim(), 'events') : undefined)} />
              </Row>
              <button className="btn link small" onClick={() => { set({ location: undefined }); reply('I’d rather not say', 'events'); }}>Skip this question</button>
            </>
          )}

          {step === 'events' && (
            <>
              <div className="reply-chips">
                {!v.spouse && <Chip on={plans.marriage} label="Getting married" onClick={() => setPlans({ ...plans, marriage: !plans.marriage })} />}
                <Chip on={plans.child} label="Having a child" onClick={() => setPlans({ ...plans, child: !plans.child })} />
                <Chip on={plans.home} label="Buying a home" onClick={() => setPlans({ ...plans, home: !plans.home })} />
              </div>
              <Send label={plans.marriage || plans.child || plans.home ? 'Continue' : 'Nothing planned'} onClick={submitEvents} />
              <p className="dock-hint">You can add other events, past or future, in the Life Events step.</p>
            </>
          )}

          {step === 'done' && (
            <div className="intake-review">
              <h3>Confirm your details</h3>
              <InputSummary inputs={v} />
              {v.location && <p>Location: {v.location}. We will check local environmental risk on the planning page.</p>}
              {events.length > 0 && <p>Planned events: {events.map(event => `${event.title} at age ${event.age}`).join(', ')}. You can edit their amounts in Life Events.</p>}
              <button className="btn primary xl" onClick={() => { voice.endVoice(); onComplete(v, events); }}>Confirm details and calculate →</button>
              <button className="btn link" onClick={() => { setStep('age'); setMessages([{ from: 'lincoln', ...PROMPTS.age }]); }}>Change my answers</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function InputSummary({ inputs }: { inputs: FinancialInputs }) {
  return <dl className="intake-review-grid">
    <div><dt>Age</dt><dd>{inputs.age}</dd></div>
    <div><dt>Annual income</dt><dd>{money(inputs.annualIncome)}</dd></div>
    <div><dt>Partner</dt><dd>{inputs.spouse ? 'Yes' : 'No'}</dd></div>
    <div><dt>Partner income</dt><dd>{money(inputs.spouseIncome || 0)}</dd></div>
    <div><dt>Children</dt><dd>{inputs.children}{inputs.children > 0 ? ` · ages ${inputs.childAges?.length ? inputs.childAges.join(', ') : `youngest ${inputs.youngestChildAge}`}` : ''}</dd></div>
    <div><dt>Other dependents</dt><dd>{inputs.otherDependents ? 'Yes' : 'No'}</dd></div>
    <div><dt>Mortgage</dt><dd>{money(inputs.mortgage)}</dd></div>
    <div><dt>Other debts</dt><dd>{money(inputs.otherDebts)}</dd></div>
    <div><dt>Existing coverage</dt><dd>{money(inputs.existingCoverage)}</dd></div>
    <div><dt>Savings</dt><dd>{money(inputs.savings)}</dd></div>
  </dl>;
}

function Row({ children }: { children: React.ReactNode }) {
  return <div className="dock-row">{children}</div>;
}

function Chip({ on, label, onClick }: { on: boolean; label: string; onClick: () => void }) {
  return (
    <button className={`reply-chip ${on ? 'on' : ''}`} onClick={onClick} aria-pressed={on}>
      {label}
    </button>
  );
}

function Send({ onClick, label = 'Send' }: { onClick: () => void; label?: string }) {
  return (
    <button className="btn primary lg" onClick={onClick}>
      {label}
    </button>
  );
}
