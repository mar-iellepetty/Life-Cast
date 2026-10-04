import { useEffect, useReducer, useState } from 'react';
import { calculatePlan, createPlan } from './lib/calc';
import { FinancialInputs, LifeEvent, Plan, defaultInputs, makeEvent } from './lib/model';
import { PlanningState, emptyState, loadSavedPlans, reducer, savePlans } from './state/store';
import { ExampleScenario } from './data/templates';
import { STAGES, TopNav } from './components/TopNav';
import { Landing } from './components/Landing';
import { IntakeChat } from './components/IntakeChat';
import { GuideChat } from './components/GuideChat';
import { NeedChart } from './components/NeedChart';
import { TotalPanel } from './components/TotalPanel';
import { LifeEventsPage } from './components/LifeEventsPage';
import { PlansBar } from './components/PlansBar';
import { ExampleModal } from './components/ExampleModal';
import { Review } from './components/Review';
import { ComparePlansModal } from './components/ComparePlansModal';

// Open with ?demo, ?demo=events or ?demo=review to skip the introduction with sample answers.
const DEMO = new URLSearchParams(location.search).get('demo');
const DEMO_STAGE = DEMO === 'review' ? 3 : DEMO === 'events' ? 2 : 1;
const DEMO_INPUTS: FinancialInputs = { ...defaultInputs, age: 38, annualIncome: 125000, savings: 75000, existingCoverage: 250000, mortgage: 300000, otherDebts: 18000, spouse: true, children: 2, youngestChildAge: 4, incomeReplacementYears: 10 };

function initialState(): PlanningState {
  if (DEMO === null) return emptyState;
  return reducer(emptyState, { type: 'start', inputs: DEMO_INPUTS, events: DEMO_STAGE > 1 ? [makeEvent('home', 42)] : [] });
}

export default function App() {
  const [state, dispatch] = useReducer(reducer, undefined, initialState);
  const [stage, setStage] = useState(DEMO === null ? 0 : DEMO_STAGE);
  const [maxReached, setMaxReached] = useState(DEMO === null ? 0 : 3);
  const [chatting, setChatting] = useState(false);
  const [answers, setAnswers] = useState<FinancialInputs>(DEMO === null ? defaultInputs : DEMO_INPUTS);
  const [example, setExample] = useState<ExampleScenario | null>(null);
  const [focusEvents] = useState(0);
  const [customKey, setCustomKey] = useState(0);
  const [comparing, setComparing] = useState(false);
  const [saved] = useState(() => loadSavedPlans());
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const active = state.plans.find((p) => p.id === state.activeId);

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [stage, chatting]);

  useEffect(() => setSavedAt(null), [state]);

  const go = (s: number) => {
    setStage(s);
    setChatting(false);
    setMaxReached((m) => Math.max(m, s));
  };

  const complete = (inputs: FinancialInputs, events: LifeEvent[]) => {
    setAnswers(inputs);
    dispatch({ type: 'start', inputs, events });
    go(1);
  };

  const addPlan = (plan: Plan) => {
    dispatch({ type: 'addPlan', plan });
    setExample(null);
    if (stage === 0 || stage === 3) go(1);
  };

  const resume = () => {
    if (!saved) return;
    dispatch({ type: 'load', state: { plans: saved.plans, activeId: saved.activeId } });
    setMaxReached(3);
    go(1);
  };

  const restart = () => {
    dispatch({ type: 'reset' });
    setMaxReached(0);
    go(0);
  };

  return (
    <div className="app">
      <TopNav stage={stage} maxReached={active ? maxReached : 0} onNavigate={go} />

      <main className={`container page ${stage > 0 ? 'with-bar' : ''}`}>
        {stage === 0 && !chatting && <Landing onStart={() => setChatting(true)} savedAt={saved?.savedAt ?? null} onResume={resume} />}
        {stage === 0 && chatting && <IntakeChat initial={answers} onComplete={complete} onExit={() => setChatting(false)} />}

        {stage === 1 && active && <Planning plan={active} onInputs={(patch) => dispatch({ type: 'setInputs', patch })} onBack={() => go(0)} onNext={() => go(2)} />}

        {stage === 2 && active && (
          <>
            <LifeEventsPage
              plan={active}
              focusKey={focusEvents}
              customKey={customKey}
              onAdd={(event) => dispatch({ type: 'addEvent', event })}
              onUpdate={(id, patch) => dispatch({ type: 'updateEvent', id, patch })}
              onRemove={(id) => dispatch({ type: 'removeEvent', id })}
            />
            <StageNav stage={2} onBack={() => go(1)} onNext={() => go(3)} />
          </>
        )}

        {stage === 3 && active && (
          <>
            <Review
              plan={active}
              savedAt={savedAt}
              onAdjust={() => go(1)}
              onSave={() => savePlans(state) && setSavedAt(Date.now())}
              onCompare={() => setComparing(true)}
            />
            <div className="review-exit">
              <button className="btn link muted-link" onClick={restart}>
                Start over
              </button>
            </div>
          </>
        )}
      </main>

      {stage > 0 && active && (
        <PlansBar
          plans={state.plans}
          activeId={state.activeId}
          onSelect={(id) => dispatch({ type: 'selectPlan', id })}
          onRename={(id, name) => dispatch({ type: 'renamePlan', id, name })}
          onDelete={(id) => dispatch({ type: 'deletePlan', id })}
          onNewPlan={() => addPlan(createPlan('New Plan', { ...answers }))}
          onDuplicate={() => dispatch({ type: 'duplicatePlan', id: state.activeId })}
          onCustomEvent={() => {
            go(2);
            setCustomKey((n) => n + 1);
          }}
          onExample={setExample}
          onCompare={() => setComparing(true)}
        />
      )}

      {example && active && (
        <ExampleModal
          example={example}
          current={active}
          onApply={(plan) => {
            dispatch({ type: 'applyTemplate', plan });
            setExample(null);
          }}
          onAddAsNew={addPlan}
          onClose={() => setExample(null)}
        />
      )}
      {comparing && <ComparePlansModal plans={state.plans} activeId={state.activeId} onSelect={(id) => dispatch({ type: 'selectPlan', id })} onClose={() => setComparing(false)} />}
    </div>
  );
}

function StageNav({ stage, onBack, onNext }: { stage: number; onBack: () => void; onNext: () => void }) {
  return (
    <div className="stage-nav">
      <button className="btn ghost" onClick={onBack}>
        ← {STAGES[stage - 1]}
      </button>
      <button className="btn primary lg" onClick={onNext}>
        Continue to {STAGES[stage + 1]} →
      </button>
    </div>
  );
}

// ---------- Financial planning: guide on top, one large chart, the total on the side ----------

function Planning({ plan, onInputs, onBack, onNext }: { plan: Plan; onInputs: (p: Partial<FinancialInputs>) => void; onBack: () => void; onNext: () => void }) {
  const calc = calculatePlan(plan);
  const now = plan.financialInputs.age;
  const hasChildren = calc.today.childrenNeed > 0;
  const future = calc.projection.filter((p) => p.age >= now);
  const ends = future.find((p) => (hasChildren ? p.childrenNeed : p.estimatedCoverageNeed) === 0)?.age ?? calc.endAge;
  const points = future
    .filter((p) => p.age <= Math.min(calc.endAge, Math.max(ends + 3, now + 15)))
    .map((p) => ({ age: p.age, year: p.year, value: hasChildren ? p.childrenNeed : p.estimatedCoverageNeed }));

  return (
    <div className="planning fade">
      <GuideChat plan={plan} />

      <div className="planning-grid">
        <section className="panel chart-panel big">
          <h1 className="chart-title">{hasChildren ? 'What your children would need' : 'Your coverage need over time'}</h1>
          <p className="chart-sub">
            {hasChildren
              ? 'The money your family would need to raise your children if something happened to you. It gets smaller every year as they grow up.'
              : 'How much coverage your family would need at each age. It gets smaller as debts are paid and your support years pass.'}
          </p>
          <NeedChart points={points} now={now} endLabel={hasChildren ? 'Children independent' : 'Need ends'} height={420} />
        </section>
        <TotalPanel plan={plan} onInputs={onInputs} />
      </div>

      <StageNav stage={1} onBack={onBack} onNext={onNext} />
    </div>
  );
}
