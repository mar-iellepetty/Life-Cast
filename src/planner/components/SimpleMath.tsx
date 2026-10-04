import { useState } from 'react';
import type { PlannerResult } from '../lib/backend';
import { money } from '../lib/format';

type Assessment = PlannerResult['assessment'];
type Household = PlannerResult['household'];
type Request = PlannerResult['calculatorInput'];

const providerMoney = (n: number) => (n < 0 ? '-$' : '$') + Math.abs(n).toLocaleString('en-US', { maximumFractionDigits: 2 });
const list = (items: string[]) => (items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`);

interface Step {
  sign: '+' | '−';
  label: string;
  amount: number;
  why: string;
}

/** Plain-language sentence for each CalcXML line, built from the household that was sent. */
function steps(a: Assessment, h: Household | null, req: Request | null): Step[] {
  const out: Step[] = [];
  for (const row of a.needs) {
    const amount = row.amount;
    if (row.id === 'immediateNeeds') {
      const parts = [
        h && h.debts.mortgage > 0 && `the house (${money(h.debts.mortgage)})`,
        h && h.debts.other > 0 && `other debts (${money(h.debts.other)})`,
        req && req.funeral > 0 && `final expenses (${money(req.funeral)})`,
        req && req.finalExpenses > 0 && `other costs (${money(req.finalExpenses)})`,
      ].filter(Boolean) as string[];
      out.push({ sign: '+', label: 'Bills to pay right away', amount, why: parts.length ? `Money to pay off ${list(parts)}.` : 'Money for bills your family would have to pay right away.' });
    } else if (row.id === 'income') {
      const years = req?.term ?? 0;
      const yearly = req?.desiredIncome ?? 0;
      const college = req && req.collegeNeeds > 0 ? `, plus ${money(req.collegeNeeds)} of planned college funding` : '';
      out.push({
        sign: '+',
        label: 'Money to replace your paycheck',
        amount,
        why: yearly > 0 && years > 0 ? `About ${money(yearly)} a year for ${years} ${years === 1 ? 'year' : 'years'} so your family can keep living the same way${college}.` : `Money your family would need to live on${college}.`,
      });
    } else {
      out.push({ sign: '+', label: row.label, amount, why: 'Something your family would need money for.' });
    }
  }
  for (const row of a.resources) {
    const amount = row.amount;
    const parts = [
      h && h.resources.savings > 0 && `savings (${money(h.resources.savings)})`,
      h && h.resources.existingCoverage > 0 && `life insurance you already have (${money(h.resources.existingCoverage)})`,
      h?.spouse && h.spouse.income > 0 && "your partner's future income",
    ].filter(Boolean) as string[];
    out.push({ sign: '−', label: 'What you already have', amount, why: parts.length ? `Your ${list(parts)}. This money takes away from what is needed.` : 'Money your family already has, which takes away from what is needed.' });
  }
  return out;
}

export function SimpleMath({ result, assumptions }: { result: { assessment: Assessment; household: Household | null; calculatorInput: Request | null }; assumptions: string[] }) {
  const [fine, setFine] = useState(false);
  const rows = steps(result.assessment, result.household, result.calculatorInput);
  let soFar = 0;
  const withTotals = rows.map((s) => {
    soFar += s.sign === '+' ? s.amount : -s.amount;
    return { ...s, soFar };
  });
  // The provider's returned gap is authoritative. Summing display-rounded lines
  // can disagree with it, so retain each line and disclose any reconciliation.
  const total = result.assessment.coverageGap;
  const difference = total - soFar;
  const differs = Math.abs(difference) >= 0.005;
  const reconciliation = !differs ? null : total === 0 && soFar < 0
    ? `The line items leave a surplus of ${providerMoney(-soFar)}. CalcXML reports $0 of additional coverage need; a surplus is not a negative insurance need.`
    : `The line-item subtotal is ${providerMoney(soFar)}. CalcXML returned a coverage gap of ${providerMoney(total)}, a difference of ${providerMoney(Math.abs(difference))}. The final estimate below keeps the coverage gap returned by CalcXML.`;

  return (
    <div className="kid-math fade">
      <p className="kid-intro">Here is the math, one step at a time.</p>
      {withTotals.map((s, index) => (
        <div key={s.label} className={`kid-row ${s.sign === '−' ? 'minus' : 'plus'}`}>
          <span className="kid-sign" aria-hidden="true">{s.sign}</span>
          <div className="kid-body">
            <div className="kid-line">
              <strong>{s.label}</strong>
              <span className="kid-amount">{s.sign === '−' ? '−' : '+'}{providerMoney(s.amount)}</span>
            </div>
            <p className="kid-why">{s.why}</p>
            {index > 0 && <p className="kid-sofar">So far: {providerMoney(s.soFar)}</p>}
          </div>
        </div>
      ))}
      {reconciliation && <p className="kid-why" role="note">{reconciliation}</p>}
      <div className="kid-total">
        <span className="kid-sign eq" aria-hidden="true">{differs ? '→' : '='}</span>
        <div className="kid-body">
          <strong>Additional coverage need · CalcXML</strong>
          <p className="kid-why">{total > 0 ? "CalcXML's returned estimate of additional life insurance needed." : 'CalcXML reports no additional coverage gap for these inputs.'}</p>
        </div>
        <span className="kid-circled">
          {providerMoney(total)}
          <svg viewBox="0 0 140 56" preserveAspectRatio="none" aria-hidden="true">
            <ellipse cx="70" cy="28" rx="66" ry="24" pathLength={1} />
          </svg>
        </span>
      </div>
      <button className="btn link small" onClick={() => setFine(!fine)} aria-expanded={fine}>{fine ? 'Hide the fine print' : 'Show the fine print'}</button>
      {fine && (
        <div className="kid-fine">
          <p>Line-item amounts and the coverage gap are returned by CalcXML. The gap is kept as returned, even if it differs from the line-item subtotal. CalcXML also counts future interest and inflation. The chart beside this panel is a separate illustration.</p>
          {assumptions.map((note, i) => <p key={i}>{note}</p>)}
        </div>
      )}
    </div>
  );
}
