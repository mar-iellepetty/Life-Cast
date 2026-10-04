import { ExampleScenario, planFromExample } from '../data/templates';
import { calculatePlan } from '../lib/calc';
import type { Plan } from '../lib/model';
import { money } from '../lib/format';
import { CompareChart } from './CompareChart';
import { Modal } from './ui';

interface Props {
  example: ExampleScenario;
  current: Plan;
  onApply: (plan: Plan) => void;
  onAddAsNew: (plan: Plan) => void;
  onClose: () => void;
}

export const needSeries = (plan: Plan, fromAge?: number) =>
  calculatePlan(plan)
    .projection.filter((p) => p.age >= (fromAge ?? plan.financialInputs.age))
    .map((p) => ({ age: p.age, value: p.estimatedCoverageNeed }));

export function ExampleModal({ example, current, onApply, onAddAsNew, onClose }: Props) {
  const examplePlan = planFromExample(example);
  const a = calculatePlan(current);
  const b = calculatePlan(examplePlan);
  const ci = current.financialInputs;
  const ei = examplePlan.financialInputs;

  const rows: [string, string, string][] = [
    ['Age', String(ci.age), String(ei.age)],
    ['Income', money(ci.annualIncome), money(ei.annualIncome)],
    ['Mortgage', money(ci.mortgage), money(ei.mortgage)],
    ['Children', String(ci.children), String(ei.children)],
    ['Savings', money(ci.savings), money(ei.savings)],
    ['Existing coverage', money(ci.existingCoverage), money(ei.existingCoverage)],
    ['Life events planned', String(current.lifeEvents.length), String(examplePlan.lifeEvents.length)],
    ['Estimated need today', money(a.today.estimatedCoverageNeed), money(b.today.estimatedCoverageNeed)],
    ['Suggested coverage', money(a.suggestedCoverage), money(b.suggestedCoverage)],
  ];

  return (
    <Modal
      wide
      eyebrow="Example planning scenario"
      title={`${current.name} vs. ${example.name}`}
      onClose={onClose}
      footer={
        <>
          <button className="btn ghost" onClick={onClose}>
            Close
          </button>
          <button className="btn secondary" onClick={() => onAddAsNew(examplePlan)}>
            Add as a new plan
          </button>
          <button className="btn primary" onClick={() => onApply(examplePlan)}>
            Use for {current.name}
          </button>
        </>
      }
    >
      <p className="modal-lede">
        {example.summary}. <span className="tag">Illustrative scenario</span>
      </p>
      <div className="example-grid">
        <table className="data-table">
          <thead>
            <tr>
              <th />
              <th className="num">{current.name}</th>
              <th className="num">{example.name}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([label, x, y]) => (
              <tr key={label} className={label.startsWith('Estimated') || label.startsWith('Suggested') ? 'emph' : ''}>
                <td>{label}</td>
                <td className="num">{x}</td>
                <td className="num">{y}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div>
          <h3 className="sub-heading">Their planning approach</h3>
          <p className="muted small">This example prioritized:</p>
          <ol className="priorities">
            {example.priorities.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ol>
        </div>
      </div>
      <h3 className="sub-heading">Coverage need by age</h3>
      <CompareChart
        series={[
          { label: current.name, tone: 'primary', points: needSeries(current) },
          { label: example.name, tone: 'secondary', points: needSeries(examplePlan) },
        ]}
      />
      <p className="modal-note">
        <strong>Use for {current.name}</strong> replaces this plan’s numbers and life events with the example’s. <strong>Add as a new plan</strong> keeps {current.name} as it is and adds the example as a separate plan. Example scenarios are illustrative and do not represent actual customers.
      </p>
    </Modal>
  );
}
