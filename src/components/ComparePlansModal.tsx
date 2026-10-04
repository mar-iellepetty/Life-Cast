import { calculatePlan } from '../lib/calc';
import type { Plan } from '../lib/model';
import { money } from '../lib/format';
import { CompareChart, Series } from './CompareChart';
import { needSeries } from './ExampleModal';
import { Modal } from './ui';

interface Props {
  plans: Plan[];
  activeId: string;
  onSelect: (id: string) => void;
  onClose: () => void;
}

/** Side-by-side comparison of every plan the user has created. */
export function ComparePlansModal({ plans, activeId, onSelect, onClose }: Props) {
  const tones: Series['tone'][] = ['primary', 'secondary', 'tertiary'];
  const ordered = [...plans].sort((a, b) => (a.id === activeId ? -1 : b.id === activeId ? 1 : 0));
  const rows = ordered.map((p) => ({ p, c: calculatePlan(p) }));
  const fields: [string, (r: (typeof rows)[number]) => string, boolean?][] = [
    ['Yearly income', (r) => money(r.p.financialInputs.annualIncome)],
    ['Children', (r) => String(r.p.financialInputs.children)],
    ['Mortgage and debts', (r) => money(r.p.financialInputs.mortgage + r.p.financialInputs.otherDebts)],
    ['Savings', (r) => money(r.p.financialInputs.savings)],
    ['Existing coverage', (r) => money(r.p.financialInputs.existingCoverage)],
    ['Life events', (r) => String(r.p.lifeEvents.length)],
    ['Life insurance need today', (r) => money(r.c.today.estimatedCoverageNeed), true],
    ['Suggested coverage', (r) => money(r.c.suggestedCoverage), true],
    ['Indicative term cost', (r) => `${money(r.c.termMonthly)}/mo`, true],
  ];

  return (
    <Modal wide eyebrow="Plans" title="Compare your plans" onClose={onClose}>
      {plans.length < 2 ? (
        <p className="modal-lede">You have one plan so far. Use + Add New to create another plan or start from an example, then compare them here.</p>
      ) : (
        <>
          <p className="modal-lede">Each plan keeps its own numbers and life events. Select a plan’s name to switch to it.</p>
          <div className="table-wrap">
            <table className="data-table compare-table">
              <thead>
                <tr>
                  <th />
                  {rows.map(({ p }) => (
                    <th key={p.id} className="num">
                      <button className={`plan-link ${p.id === activeId ? 'active' : ''}`} onClick={() => { onSelect(p.id); onClose(); }}>
                        {p.name}
                        {p.id === activeId ? ' (current)' : ''}
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {fields.map(([label, get, emph]) => (
                  <tr key={label} className={emph ? 'emph' : ''}>
                    <td>{label}</td>
                    {rows.map((r) => (
                      <td key={r.p.id} className="num">
                        {get(r)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <h3 className="sub-heading compare-chart-title">Life insurance need by age</h3>
          <CompareChart series={ordered.map((p, i) => ({ label: p.name, tone: tones[Math.min(i, 2)], points: needSeries(p) }))} />
        </>
      )}
    </Modal>
  );
}
