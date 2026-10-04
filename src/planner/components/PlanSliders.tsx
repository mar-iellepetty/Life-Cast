import { useEffect, useRef } from 'react';
import type { FinancialInputs } from '../lib/model';
import { compact, money } from '../lib/format';

export type SliderDraft = Partial<Pick<FinancialInputs, 'age' | 'annualIncome'>>;

interface Props {
  inputs: FinancialInputs;
  draft: SliderDraft | null;
  /** Live value while dragging; the chart redraws from it immediately. */
  onPreview: (draft: SliderDraft | null) => void;
  /** Saved to the plan when the user lets go, so the calculator is not called on every pixel. */
  onCommit: (patch: Partial<FinancialInputs>) => void;
}

const INCOME_MAX = 500000;

/** Income and age sliders that reshape the illustrative timeline. */
export function PlanSliders({ inputs, draft, onPreview, onCommit }: Props) {
  const original = useRef({ age: inputs.age, annualIncome: inputs.annualIncome });
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const age = draft?.age ?? inputs.age;
  const income = draft?.annualIncome ?? inputs.annualIncome;
  const changed = age !== original.current.age || income !== original.current.annualIncome;

  useEffect(() => () => clearTimeout(timer.current), []);

  const patchFor = (d: SliderDraft) => ({ ...d, ...(d.age !== undefined ? { retirementAge: Math.max(inputs.retirementAge, d.age + 1) } : {}) });
  const change = (d: SliderDraft) => {
    const next = { ...draft, ...d };
    onPreview(next);
    // Commit shortly after the last movement, which also covers keyboard use.
    clearTimeout(timer.current);
    timer.current = setTimeout(() => { onCommit(patchFor(next)); onPreview(null); }, 450);
  };
  const reset = () => {
    clearTimeout(timer.current);
    onPreview(null);
    onCommit(patchFor({ ...original.current }));
  };

  return (
    <div className="plan-sliders" aria-label="Explore income and age">
      <label className="slider-field">
        <span className="slider-head">
          <span>Annual income</span>
          <strong>{money(income)}</strong>
        </span>
        <input
          type="range"
          min={0}
          max={Math.max(INCOME_MAX, Math.ceil(income / 5000) * 5000)}
          step={5000}
          value={income}
          onChange={(e) => change({ annualIncome: Number(e.target.value) })}
          aria-valuetext={money(income)}
        />
        <span className="slider-scale"><span>$0</span><span>{compact(Math.max(INCOME_MAX, income))}</span></span>
      </label>
      <label className="slider-field">
        <span className="slider-head">
          <span>Your age</span>
          <strong>{age}</strong>
        </span>
        <input type="range" min={18} max={75} step={1} value={age} onChange={(e) => change({ age: Number(e.target.value) })} aria-valuetext={`${age} years old`} />
        <span className="slider-scale"><span>18</span><span>75</span></span>
      </label>
      <div className="slider-actions">
        <p className="slider-hint">Drag to see how the timeline changes.</p>
        {changed && (
          <button type="button" className="btn link" onClick={reset}>
            Reset to {money(original.current.annualIncome)}, age {original.current.age}
          </button>
        )}
      </div>
    </div>
  );
}
