import { useEffect, useRef, useState } from 'react';
import { lincoln } from '../agent/lincoln';
import { images } from '../config/content';
import { calculateAt } from '../lib/calc';
import { FinancialInputs, LifeEvent, makeEvent } from '../lib/model';
import { compact, money } from '../lib/format';
import { MoneyField, NumberField } from './ui';

type Step = 'age' | 'dependents' | 'children' | 'income' | 'debts' | 'debtAmounts' | 'coverage' | 'coverageAmount' | 'savings' | 'events' | 'done';

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
  events: { text: 'Last one. Are any big changes coming up in the next few years?', why: 'Life events like a new child or a new home change how much protection you need.' },
};

interface Props {
  initial: FinancialInputs;
  onComplete: (inputs: FinancialInputs, events: LifeEvent[]) => void;
  onExit: () => void;
}

export function IntakeChat({ initial, onComplete, onExit }: Props) {
  const [v, setV] = useState<FinancialInputs>({ ...initial, spouse: false, children: 0, otherDependents: false, mortgage: 0, otherDebts: 0, existingCoverage: 0 });
  const [step, setStep] = useState<Step>('age');
  const [messages, setMessages] = useState<Message[]>([{ from: 'lincoln', ...PROMPTS.age }]);
  const [deps, setDeps] = useState({ partner: false, children: false, other: false });
  const [plans, setPlans] = useState({ marriage: false, child: false, home: false });
  const [events, setEvents] = useState<LifeEvent[]>([]);
  const logRef = useRef<HTMLDivElement>(null);
  const set = (patch: Partial<FinancialInputs>) => setV((p) => ({ ...p, ...patch }));
  const order: Step[] = ['age', 'dependents', 'income', 'debts', 'coverage', 'savings', 'events', 'done'];
  const progress = Math.min(1, order.indexOf(step === 'children' ? 'dependents' : step === 'debtAmounts' ? 'debts' : step === 'coverageAmount' ? 'coverage' : step) / (order.length - 1));

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: 'smooth' });
    const last = messages[messages.length - 1];
    if (last.from === 'lincoln') lincoln.speak(last.text);
  }, [messages]);

  const reply = (userText: string, next: Step, state: FinancialInputs = v, nextEvents: LifeEvent[] = events) => {
    const out: Message[] = [{ from: 'user', text: userText }];
    if (next === 'done') {
      const need = calculateAt(state, nextEvents, state.age).estimatedCoverageNeed;
      out.push({ from: 'lincoln', text: `Thank you, that is everything I need. Based on your answers, your family would need about ${money(need)} in coverage. Let’s look at what makes up that number.` });
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
    const next = { ...v, spouse: deps.partner, otherDependents: deps.other, children: deps.children ? Math.max(1, v.children) : 0, incomeReplacementYears: none ? 3 : 10 };
    setV(next);
    reply(dependentsText(), deps.children ? 'children' : 'income', next);
  };

  const submitEvents = () => {
    const evs: LifeEvent[] = [];
    if (plans.marriage) evs.push(makeEvent('marriage', v.age + 1));
    if (plans.child) evs.push(makeEvent('child', v.age + 2));
    if (plans.home) evs.push(makeEvent('home', v.age + 3));
    setEvents(evs);
    const text = evs.length ? evs.map((e) => e.title).join(', ') : 'Nothing planned right now';
    reply(text, 'done', v, evs);
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
              <Chip on={false} label="No debts" onClick={() => { const n = { ...v, mortgage: 0, otherDebts: 0 }; setV(n); reply('No debts', 'coverage', n); }} />
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
              <Chip on={false} label="No" onClick={() => { const n = { ...v, existingCoverage: 0 }; setV(n); reply('No', 'savings', n); }} />
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
                <Send onClick={() => reply(v.savings ? money(v.savings) : 'No savings yet', 'events')} />
              </Row>
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
            <button className="btn primary xl" onClick={() => onComplete(v, events)}>
              See my financial picture →
            </button>
          )}
        </div>
      </div>
    </div>
  );
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
