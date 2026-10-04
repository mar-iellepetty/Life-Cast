import { useEffect, useReducer, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { calculatePlan, createPlan } from './lib/calc';
import { Adjustment, FinancialInputs, LifeEvent, Plan, adjustmentPercent, defaultInputs, makeEvent } from './lib/model';
import { PlanningState, clearSavedPlans, emptyState, loadSavedPlans, reducer, savePlans } from './state/store';
import { ExampleScenario } from './data/templates';
import { STAGES, TopNav } from './components/TopNav';
import { IntakeChat } from './components/IntakeChat';
import { GuideChat } from './components/GuideChat';
import { NeedChart } from './components/NeedChart';
import { TotalPanel } from './components/TotalPanel';
import { PlanSliders, type SliderDraft } from './components/PlanSliders';
import { InsightCards } from './components/InsightCards';
import { LifeEventsPage } from './components/LifeEventsPage';
import { PlansBar } from './components/PlansBar';
import { ExampleModal } from './components/ExampleModal';
import { Review } from './components/Review';
import { ComparePlansModal } from './components/ComparePlansModal';
import { Report } from './components/Report';
import { AssessmentProvider } from './state/AssessmentContext';
import { clearPlannerGuides, forgetPlannerGuide } from './agent/lincoln';
import { clearPlannerAssessmentCache } from './lib/backend';
import './styles.css';

// Open with ?demo, ?demo=events or ?demo=review to skip the introduction with sample answers.
const DEMO = new URLSearchParams(location.search).get('demo');
const DEMO_STAGE = DEMO === 'report' ? 4 : DEMO === 'review' ? 3 : DEMO === 'events' ? 2 : 1;
const DEMO_INPUTS: FinancialInputs = { ...defaultInputs, age: 38, annualIncome: 125000, savings: 75000, existingCoverage: 250000, mortgage: 300000, otherDebts: 18000, spouse: true, children: 2, youngestChildAge: 4, incomeReplacementYears: 10 };

function initialState(): PlanningState {
  if (DEMO === null) return emptyState;
  return reducer(emptyState, { type: 'start', inputs: DEMO_INPUTS, events: DEMO_STAGE > 1 ? [makeEvent('home', 42)] : [] });
}

export default function App() {
  const navigate = useNavigate();
  const [state, dispatch] = useReducer(reducer, undefined, initialState);
  const [stage, setStage] = useState(DEMO === null ? 0 : DEMO_STAGE);
  const [answers, setAnswers] = useState<FinancialInputs>(DEMO === null ? defaultInputs : DEMO_INPUTS);
  const [example, setExample] = useState<ExampleScenario | null>(null);
  const [focusEvents] = useState(0);
  const [customKey, setCustomKey] = useState(0);
  const [comparing, setComparing] = useState(false);
  const [saved, setSaved] = useState(() => loadSavedPlans());
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [saveError, setSaveError] = useState('');
  const [confirmDeleteSaved, setConfirmDeleteSaved] = useState(false);
  const cleanupTimer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    clearTimeout(cleanupTimer.current);
    // Defer one tick so StrictMode's effect rehearsal does not discard live state.
    return () => { cleanupTimer.current = setTimeout(() => { clearPlannerGuides(); clearPlannerAssessmentCache(); }, 0); };
  }, []);

  const active = state.plans.find((p) => p.id === state.activeId);

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [stage]);

  useEffect(() => setSavedAt(null), [state]);

  const go = (s: number) => {
    setStage(s);
  };

  const complete = (inputs: FinancialInputs, events: LifeEvent[]) => {
    setAnswers(inputs);
    if (active) {
      dispatch({ type: 'setInputs', patch: inputs });
      events.filter(event => !active.lifeEvents.some(existing => existing.type === event.type && existing.age === event.age && existing.financialImpact === event.financialImpact))
        .forEach(event => dispatch({ type: 'addEvent', event }));
    } else dispatch({ type: 'start', inputs, events });
    go(1);
  };

  const addPlan = (plan: Plan) => {
    if (state.plans.length >= 30) return;
    dispatch({ type: 'addPlan', plan });
    setExample(null);
    if (stage === 0 || stage >= 3) go(1);
  };

  const resume = () => {
    if (!saved) return;
    dispatch({ type: 'load', state: { plans: saved.plans, activeId: saved.activeId } });
    setAnswers(saved.plans.find(plan => plan.id === saved.activeId)?.financialInputs || saved.plans[0].financialInputs);
    go(1);
  };

  const restart = () => {
    clearPlannerGuides(); clearPlannerAssessmentCache();
    dispatch({ type: 'reset' });
    setAnswers(defaultInputs);
    go(0);
  };

  const save = () => {
    if (savePlans(state)) { setSavedAt(Date.now()); setSaved(loadSavedPlans()); setSaveError(''); }
    else setSaveError('Your browser could not save these plans. Allow local storage and try again.');
  };
  const deleteSaved = () => {
    if (clearSavedPlans()) { setSaved(null); setSavedAt(null); setSaveError(''); setConfirmDeleteSaved(false); }
    else setSaveError('Your browser could not delete saved plans. Check local storage permissions and try again.');
  };

  return (
    <AssessmentProvider plan={active}>
    <div className="planner-workspace">
      <TopNav stage={stage} maxReached={active ? STAGES.length - 1 : 0} onNavigate={go} onSave={active ? save : undefined} savedAt={savedAt} />

      {saveError && <div className="container save-error" role="alert">{saveError}</div>}

      <main className={`container page ${stage > 0 ? 'with-bar' : ''}`}>
        {stage === 0 && <>
          <header className="planner-intro"><p className="eyebrow">YOUR LIFE, YOUR PLAN</p><h1 className="page-title">Let’s start with what matters.</h1><p className="page-sub">A conversation with Lincoln turns your story into a plan you can explore.</p></header>
          {saved && !active && <div className="resume-banner"><div><strong>Your saved plans are here.</strong><p>Saved on this browser {new Date(saved.savedAt).toLocaleDateString()}.</p>{confirmDeleteSaved && <p role="status">Delete the saved financial details and plans from this browser?</p>}</div>{confirmDeleteSaved ? <><button className="btn secondary sm" onClick={deleteSaved}>Confirm delete saved plans</button><button className="btn ghost sm" onClick={() => setConfirmDeleteSaved(false)}>Cancel</button></> : <><button className="btn secondary sm" onClick={resume}>Resume saved plans</button><button className="btn ghost sm" onClick={() => setConfirmDeleteSaved(true)}>Delete saved plans</button></>}</div>}
          <IntakeChat initial={active?.financialInputs || answers} onComplete={complete} onExit={() => navigate('/')} />
        </>}

        {stage === 1 && active && <Planning key={active.id} plan={active} onInputs={(patch) => dispatch({ type: 'setInputs', patch })} onAdjustment={(key, value) => dispatch({ type: 'setAdjustment', key, value })} onBack={() => go(0)} onNext={() => go(2)} />}

        {stage === 2 && active && (
          <>
            <LifeEventsPage
              key={active.id}
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
              onSave={save}
              onCompare={() => setComparing(true)}
              onAddPlan={addPlan}
            />
            <StageNav stage={3} onBack={() => go(2)} onNext={() => go(4)} />
            <div className="review-exit">
              <button className="btn link muted-link" onClick={restart}>
                Start over
              </button>
            </div>
          </>
        )}

        {stage === 4 && active && <><Report plan={active} /><div className="stage-nav"><button className="btn ghost" onClick={() => go(3)}>← Review &amp; Plan</button><button className="btn secondary" onClick={save}>{savedAt ? 'Saved on this browser' : 'Save plans'}</button></div></>}
      </main>

      {stage > 0 && active && (
        <PlansBar
          plans={state.plans}
          activeId={state.activeId}
          onSelect={(id) => dispatch({ type: 'selectPlan', id })}
          onRename={(id, name) => dispatch({ type: 'renamePlan', id, name })}
          onDelete={(id) => { if (state.plans.length > 1) { forgetPlannerGuide(id); dispatch({ type: 'deletePlan', id }); } }}
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
          canAddPlan={state.plans.length < 30}
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
    </AssessmentProvider>
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

function Planning({ plan, onInputs, onAdjustment, onBack, onNext }: { plan: Plan; onInputs: (p: Partial<FinancialInputs>) => void; onAdjustment: (key: 'health' | 'location', value: Adjustment | null) => void; onBack: () => void; onNext: () => void }) {
  // While a slider is dragged the chart redraws from this draft; the plan is updated when it settles.
  const [draft, setDraft] = useState<SliderDraft | null>(null);
  const shown: Plan = draft ? { ...plan, financialInputs: { ...plan.financialInputs, ...draft, retirementAge: Math.max(plan.financialInputs.retirementAge, (draft.age ?? plan.financialInputs.age) + 1) } } : plan;
  const calc = calculatePlan(shown);
  const now = shown.financialInputs.age;
  const hasChildren = calc.today.childrenNeed > 0;
  const future = calc.projection.filter((p) => p.age >= now);
  const ends = future.find((p) => (hasChildren ? p.childrenNeed : p.estimatedCoverageNeed) === 0)?.age ?? calc.endAge;
  const points = future
    .filter((p) => p.age <= Math.min(calc.endAge, Math.max(ends + 3, now + 15)))
    .map((p) => ({ age: p.age, year: p.year, value: hasChildren ? p.childrenNeed : p.estimatedCoverageNeed }));
  const pct = adjustmentPercent(plan);
  const parts = [plan.adjustments?.health && `health ${plan.adjustments.health.percent > 0 ? '+' : ''}${plan.adjustments.health.percent}%`, plan.adjustments?.location && `location ${plan.adjustments.location.percent > 0 ? '+' : ''}${plan.adjustments.location.percent}%`].filter(Boolean);
  const adjusted = pct !== 0 ? { points: points.map((p) => ({ ...p, value: Math.round(p.value * (1 + pct / 100)) })), label: `Adjusted ${pct > 0 ? '+' : ''}${pct}%` } : undefined;

  return (
    <div className="planning fade">
      <GuideChat plan={plan} />

      <div className="planning-grid">
        <div className="planning-main">
          <section className="panel chart-panel big">
            <p className="projection-label">Illustrative timeline projection</p>
            <h1 className="chart-title">{hasChildren ? 'What your children would need' : 'Your coverage need over time'}</h1>
            <p className="chart-sub">
              {hasChildren
                ? 'Explore how modeled support for your children changes as they grow. This timeline uses the assumptions in your plan.'
                : 'Explore how modeled needs change as debts are paid and support years pass. This timeline uses the assumptions in your plan.'}
            </p>
            <PlanSliders key={plan.id} inputs={plan.financialInputs} draft={draft} onPreview={setDraft} onCommit={onInputs} />
            <NeedChart points={points} now={now} endLabel={hasChildren ? 'Children independent' : 'Need ends'} height={400} adjusted={adjusted} />
            {pct !== 0 && (
              <p className="adjusted-note">
                Dashed line: the timeline adjusted {pct > 0 ? 'up' : 'down'} {Math.abs(pct)}% for your {parts.join(' and ')} (capped at 10%). Illustrative only; your calculator result is unchanged.
              </p>
            )}
          </section>
          <InsightCards plan={plan} onAdjustment={onAdjustment} onLocation={(location) => onInputs({ location })} />
        </div>
        <TotalPanel plan={plan} onInputs={onInputs} />
      </div>

      <StageNav stage={1} onBack={onBack} onNext={onNext} />
    </div>
  );
}
