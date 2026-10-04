import { useState } from 'react';
import { calculatePlan } from '../lib/calc';
import type { FinancialInputs, Plan } from '../lib/model';
import { money } from '../lib/format';
import { Chevron, MoneyField, NumberField } from './ui';

interface Props {
  plan: Plan;
  onInputs: (patch: Partial<FinancialInputs>) => void;
}

/** The total first; the calculation and the inputs one click away. */
export function TotalPanel({ plan, onInputs }: Props) {
  const [showCalc, setShowCalc] = useState(false);
  const [showDetail, setShowDetail] = useState(false);
  const [showInputs, setShowInputs] = useState(false);
  const calc = calculatePlan(plan);
  const t = calc.today;
  const i = plan.financialInputs;
  const lines = t.lines.filter((l) => l.value > 0);

  return (
    <aside className="panel total-panel" aria-labelledby="total-title">
      <p id="total-title" className="total-label">
        Life insurance need
      </p>
      <p className="total-value">{money(t.estimatedCoverageNeed)}</p>
      {calc.suggestedCoverage - t.estimatedCoverageNeed >= 100000 && (
        <p className="total-note">Rises to {money(calc.suggestedCoverage)} with your planned life events.</p>
      )}

      <button className="toggle" onClick={() => setShowCalc(!showCalc)} aria-expanded={showCalc}>
        <Chevron open={showCalc} />
        {showCalc ? 'Hide calculations' : 'View calculations'}
      </button>
      {showCalc && (
        <div className="simple-calc fade">
          {lines.map((l) => (
            <div key={l.key} className={`sc-row ${l.sign === '−' ? 'minus' : ''}`}>
              <span className="sc-sign">{l.sign}</span>
              <span className="sc-label">
                {l.label}
                {showDetail && <span className="sc-how">{l.formula}</span>}
              </span>
              <span className="sc-value">
                {l.sign === '−' ? '−' : ''}
                {money(l.value)}
              </span>
            </div>
          ))}
          <div className="sc-row total">
            <span className="sc-sign">=</span>
            <span className="sc-label">Your need</span>
            <span className="sc-value">{money(t.estimatedCoverageNeed)}</span>
          </div>
          <button className="btn link small" onClick={() => setShowDetail(!showDetail)}>
            {showDetail ? 'Hide how each line is figured' : 'How is each line figured?'}
          </button>
        </div>
      )}

      <button className="toggle" onClick={() => setShowInputs(!showInputs)} aria-expanded={showInputs}>
        <Chevron open={showInputs} />
        {showInputs ? 'Hide your information' : 'Edit your information'}
      </button>
      {showInputs && (
        <div className="mini-fields fade">
          <Money label="Yearly income" value={i.annualIncome} onChange={(annualIncome) => onInputs({ annualIncome })} />
          <Money label="Savings" value={i.savings} onChange={(savings) => onInputs({ savings })} />
          <Money label="Existing coverage" value={i.existingCoverage} onChange={(existingCoverage) => onInputs({ existingCoverage })} />
          <Money label="Mortgage" value={i.mortgage} onChange={(mortgage) => onInputs({ mortgage })} />
          <Money label="Other debts" value={i.otherDebts} onChange={(otherDebts) => onInputs({ otherDebts })} />
          <div className="mf">
            <span>Children</span>
            <NumberField stepper label="Children" value={i.children} min={0} max={8} onChange={(children) => onInputs({ children })} />
          </div>
          {i.children > 0 && (
            <>
              <div className="mf">
                <span>Youngest child’s age</span>
                <NumberField stepper label="Youngest child's age" value={i.youngestChildAge} min={0} max={21} onChange={(youngestChildAge) => onInputs({ youngestChildAge })} />
              </div>
              <Money label="Education per child" value={i.educationFunding} onChange={(educationFunding) => onInputs({ educationFunding })} />
            </>
          )}
          <div className="mf">
            <span>Years to replace income</span>
            <NumberField stepper label="Years to replace income" value={i.incomeReplacementYears} min={0} max={40} onChange={(incomeReplacementYears) => onInputs({ incomeReplacementYears })} />
          </div>
        </div>
      )}
    </aside>
  );
}

function Money({ label, value, onChange }: { label: string; value: number; onChange: (n: number) => void }) {
  return (
    <div className="mf">
      <span>{label}</span>
      <MoneyField label={label} value={value} onChange={onChange} />
    </div>
  );
}
