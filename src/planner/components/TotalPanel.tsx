import { useState } from 'react';
import type { FinancialInputs, Plan } from '../lib/model';
import { useAssessment } from '../state/AssessmentContext';
import { AssessmentSummary } from './AssessmentSummary';
import { SimpleMath } from './SimpleMath';
import { Chevron, MoneyField, NumberField } from './ui';
import './report.css';

export function TotalPanel({ plan, onInputs }: { plan: Plan; onInputs: (patch: Partial<FinancialInputs>) => void }) {
  const [showCalc, setShowCalc] = useState(false), [showInputs, setShowInputs] = useState(false);
  const { assessment, household, calculatorInput, loading, error, assumptions } = useAssessment();
  const i = plan.financialInputs;
  return <aside className="panel total-panel" aria-label="Current coverage assessment">
    <AssessmentSummary compact />
    <button className="toggle" onClick={() => setShowCalc(!showCalc)} aria-expanded={showCalc}><Chevron open={showCalc} />{showCalc ? 'Hide calculations' : 'View calculations'}</button>
    {showCalc && assessment && !loading && !error && <SimpleMath result={{ assessment, household, calculatorInput }} assumptions={assumptions} />}
    <button className="toggle" onClick={() => setShowInputs(!showInputs)} aria-expanded={showInputs}><Chevron open={showInputs} />{showInputs ? 'Hide your information' : 'Edit your information'}</button>
    {showInputs && <div className="mini-fields fade">
      <div className="mf"><span>Your age</span><NumberField stepper label="Your age" value={i.age} min={18} max={90} onChange={age => onInputs({ age })} /></div>
      <Money label="Yearly income" value={i.annualIncome} onChange={annualIncome => onInputs({ annualIncome })} />
      <label className="mf"><span>Partner or spouse</span><input type="checkbox" aria-label="Partner or spouse" checked={i.spouse} onChange={e => onInputs({ spouse: e.target.checked })} /></label>
      {i.spouse && <Money label="Partner yearly income" value={i.spouseIncome ?? 0} onChange={spouseIncome => onInputs({ spouseIncome })} />}
      <Money label="Savings" value={i.savings} onChange={savings => onInputs({ savings })} />
      <Money label="Existing coverage" value={i.existingCoverage} onChange={existingCoverage => onInputs({ existingCoverage })} />
      <Money label="Mortgage" value={i.mortgage} onChange={mortgage => onInputs({ mortgage })} />
      <Money label="Other debts" value={i.otherDebts} onChange={otherDebts => onInputs({ otherDebts })} />
      <div className="mf"><span>Children</span><NumberField stepper label="Children" value={i.children} min={0} max={8} onChange={children => onInputs({ children, childAges: undefined })} /></div>
      {i.children > 0 && <>
        <div className="mf"><span>Youngest child's age</span><NumberField stepper label="Youngest child's age" value={i.youngestChildAge} min={0} max={21} onChange={youngestChildAge => onInputs({ youngestChildAge, childAges: undefined })} /></div>
        <ChildAges key={`${plan.id}:${i.children}:${i.youngestChildAge}:${i.childAges?.join(',')}`} count={i.children} ages={i.childAges} onCommit={childAges => onInputs({ childAges, ...(childAges ? { youngestChildAge: Math.min(...childAges) } : {}) })} />
        <p className="calculation-origin">Enter every age to refine CalcXML. Otherwise the youngest age is used for all children. The timeline illustrates the youngest child's support period.</p>
        <Money label="Education per child" value={i.educationFunding} onChange={educationFunding => onInputs({ educationFunding })} />
      </>}
      <div className="mf"><span>Years to replace income</span><NumberField stepper label="Years to replace income" value={i.incomeReplacementYears} min={0} max={40} onChange={incomeReplacementYears => onInputs({ incomeReplacementYears })} /></div>
      <div className="mf"><span>Income share to replace</span><NumberField label="Income share percent" value={Math.round(i.replacementRatio * 100)} min={0} max={100} suffix="%" onChange={value => onInputs({ replacementRatio: value / 100 })} /></div>
      <div className="mf"><span>Retirement age</span><NumberField label="Retirement age" value={i.retirementAge} min={i.age} max={100} onChange={retirementAge => onInputs({ retirementAge })} /></div>
      <Money label="Final expenses" value={i.finalExpenses} onChange={finalExpenses => onInputs({ finalExpenses })} />
    </div>}
  </aside>;
}
function Money({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) { return <div className="mf"><span>{label}</span><MoneyField label={label} value={value} onChange={onChange} /></div>; }

function ChildAges({ count, ages, onCommit }: { count: number; ages?: number[]; onCommit: (ages: number[] | undefined) => void }) {
  const [draft, setDraft] = useState(ages?.join(', ') ?? '');
  const [error, setError] = useState('');
  function commit() {
    if (!draft.trim()) { setError(''); onCommit(undefined); return; }
    const parts = draft.split(',').map(part => part.trim());
    const values = parts.map(Number);
    if (parts.some(part => !part) || values.length !== count || values.some(age => !Number.isInteger(age) || age < 0 || age > 21)) {
      setError(`Enter ${count} ${count === 1 ? 'age' : 'ages'}, from 0 to 21, separated by commas.`); return;
    }
    setError(''); onCommit(values);
  }
  return <div><label className="mf"><span>All children's ages</span><input className="input" aria-label="All children's ages" aria-invalid={!!error} placeholder="e.g. 4, 9" value={draft} onChange={e => setDraft(e.target.value)} onBlur={commit} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); commit(); } }} /></label>{error && <p className="calculation-origin" role="alert">{error}</p>}</div>;
}
