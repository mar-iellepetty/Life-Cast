import { useEffect, useMemo, useState } from 'react';
import type { Plan } from '../lib/model';
import { money } from '../lib/format';
import { calculatePlan, createPlan, CHILD_SUPPORT_UNTIL, MORTGAGE_PAYOFF_YEARS } from '../lib/calc';
import { useAssessment } from '../state/AssessmentContext';
import { getPlannerAssessment, type PlannerAssessment } from '../lib/backend';
import { AssessmentSummary } from './AssessmentSummary';
import { nationalMedianInputs, OWNERSHIP, scfGroupFor, SCF_SOURCE, TYPICAL_POLICY } from '../data/scf2022';
import './report.css';

interface Props {
  plan: Plan;
  savedAt: number | null;
  onAdjust: () => void;
  onSave: () => void;
  onCompare: () => void;
  onAddPlan: (plan: Plan) => void;
}

const TERMS = [10, 15, 20, 25, 30];
const roundUp = (n: number, step: number) => Math.ceil(n / step) * step;

/** A starting point for a coverage conversation, derived from the plan. Not a quote. */
function termSuggestion(plan: Plan, gap: number | null) {
  const i = plan.financialInputs;
  const calc = calculatePlan(plan);
  const today = calc.today.estimatedCoverageNeed;
  const ends = calc.projection.find((p) => p.age > i.age && p.estimatedCoverageNeed <= today * 0.05);
  const childAge = i.children > 0 ? i.age + Math.max(0, CHILD_SUPPORT_UNTIL - i.youngestChildAge) : 0;
  // The term should last until the later of: the need fading out, or the youngest child's independence.
  const endAge = Math.max(ends?.age ?? i.age + 31, childAge);
  const yearsNeeded = endAge - i.age;
  const years = TERMS.find((t) => t >= yearsNeeded) ?? 30;
  const amount = Math.max(100000, roundUp(gap ?? calc.suggestedCoverage, 50000));
  const reasons: string[] = [];
  if (yearsNeeded <= 30) reasons.push(`Most of your need ends around age ${endAge}, so a ${years}-year term covers it with a small margin.`);
  else reasons.push('Your modeled need lasts beyond 30 years, so a longer term or permanent coverage is worth discussing.');
  if (i.children > 0) reasons.push(`Your youngest child becomes independent around age ${childAge}.`);
  if (i.mortgage > 0) reasons.push(`Your mortgage is modeled as paid down over about ${MORTGAGE_PAYOFF_YEARS} years.`);
  return { years, amount, untilAge: i.age + years, lasting: yearsNeeded > 30, fromCalcXml: gap !== null, reasons };
}

export function Review({ plan, savedAt, onAdjust, onSave, onCompare, onAddPlan }: Props) {
  const { assessment, loading, error } = useAssessment();
  const i = plan.financialInputs;
  const gap = assessment && !loading && !error ? assessment.coverageGap : null;
  const s = termSuggestion(plan, gap);
  const group = scfGroupFor(i.age);
  const national = nationalMedianInputs(i);
  // The average person in this situation: same family, national median finances and an average-size
  // policy, run through CalcXML exactly like this plan so both results come from the same calculator.
  const nationalKey = JSON.stringify(national);
  const nationalPlan = useMemo(() => createPlan(`National average (${group.label})`, national, [], plan.timeline.termYears, 'scf-2022'), [nationalKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const [avg, setAvg] = useState<{ key: string; assessment: PlannerAssessment | null; error: string | null }>({ key: '', assessment: null, error: null });
  useEffect(() => {
    const controller = new AbortController();
    getPlannerAssessment(nationalPlan, { signal: controller.signal }).then(
      (r) => setAvg({ key: nationalKey, assessment: r.assessment, error: null }),
      (e) => { if (!controller.signal.aborted) setAvg({ key: nationalKey, assessment: null, error: e instanceof Error ? e.message : 'CalcXML is unavailable.' }); },
    );
    return () => controller.abort();
  }, [nationalPlan, nationalKey]);
  const avgAssessment = avg.key === nationalKey ? avg.assessment : null;

  // Insurance need = everything CalcXML says the family needs, minus resources other than life insurance.
  const insuranceNeed = (a: PlannerAssessment, coverage: number) => Math.round(Math.max(0, a.totalNeed - Math.max(0, a.totalResources - coverage)) / 1000) * 1000;
  const ready = Boolean(assessment && !loading && !error && avgAssessment);
  const standing = ready
    ? [
        { key: 'avg', label: 'The average person in your situation', sub: 'Same family, national median finances, and an average-size policy', coverage: TYPICAL_POLICY.amount, need: insuranceNeed(avgAssessment!, TYPICAL_POLICY.amount) },
        { key: 'you', label: 'You today', sub: i.existingCoverage ? 'Your existing coverage' : 'You have no life insurance yet', coverage: i.existingCoverage, need: insuranceNeed(assessment!, i.existingCoverage) },
        { key: 'plan', label: `Your plan with the ${s.years}-year term`, sub: `Existing coverage plus the suggested ${money(s.amount)}`, coverage: i.existingCoverage + s.amount, need: insuranceNeed(assessment!, i.existingCoverage) },
      ].map((r) => ({ ...r, pct: r.need > 0 ? Math.min(100, Math.round((r.coverage / r.need) * 100)) : 100, gap: Math.max(0, r.need - r.coverage) }))
    : [];
  const [avgRow, youRow] = standing;
  const verdict = !ready ? '' : youRow.pct > avgRow.pct + 2 ? 'ahead of' : youRow.pct < avgRow.pct - 2 ? 'behind' : 'about level with';
  const kids = i.children > 0;

  const rows: { label: string; yours: number; theirs: number; note?: string }[] = [
    { label: 'Annual income', yours: i.annualIncome, theirs: group.income },
    { label: 'Savings and investments', yours: i.savings, theirs: group.financialAssets, note: 'Median financial assets' },
    { label: 'Mortgage', yours: i.mortgage, theirs: group.mortgage, note: `Median for the ${group.mortgageShare}% with a mortgage` },
    { label: 'Other debts', yours: i.otherDebts, theirs: group.installment + group.creditCard, note: 'Median loans plus credit cards' },
    { label: 'Life insurance', yours: i.existingCoverage, theirs: TYPICAL_POLICY.amount, note: 'Average new individual policy' },
    ...(ready ? [{ label: 'Coverage gap (CalcXML)', yours: assessment!.coverageGap, theirs: avgAssessment!.coverageGap, note: 'Need not yet covered' }] : []),
  ];

  const createTemplate = () => onAddPlan(createPlan(`National average (${group.label})`, { ...national }, [], plan.timeline.termYears, 'scf-2022'));

  return (
    <div className="review fade">
      <header className="review-head">
        <div>
          <p className="eyebrow">Review &amp; Plan · {plan.name}</p>
          <h1 className="page-title">What coverage fits your plan</h1>
          <p className="page-sub">A suggested starting point, the trade-offs of term and permanent coverage, and how your finances compare nationally.</p>
        </div>
        <div className="review-actions">
          <button className="btn primary lg" onClick={onAdjust}>Adjust Plan</button>
          <button className="btn secondary lg" onClick={onSave}>{savedAt ? 'Saved' : 'Save Plan'}</button>
        </div>
      </header>

      <AssessmentSummary />

      {/* 1. The suggestion */}
      <section className="panel term-pick">
        <p className="section-kicker">Suggested starting point</p>
        <h2 className="term-pick-title">
          A <strong>{s.years}-year term</strong> policy for about <strong>{money(s.amount)}</strong>
        </h2>
        <p className="term-pick-sub">
          Coverage until about age {s.untilAge}. The amount is {s.fromCalcXml ? 'your CalcXML coverage gap' : 'your illustrative need'}, rounded up.
        </p>
        <ul className="term-pick-why">
          {s.reasons.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
        <p className="muted small">This is a planning suggestion, not a quote or a product recommendation. A licensed professional can confirm the right amount and term.</p>
      </section>

      {/* 2. Pros and cons */}
      <section className="pros-cons">
        <article className={`panel pc-card ${s.lasting ? '' : 'lean'}`}>
          <p className="tvp-kicker">Choosing term life insurance</p>
          <h3 className="pc-title">{s.lasting ? 'Covers the years of highest need' : 'Fits your plan best'}</h3>
          <p className="pc-label pro">Pros</p>
          <ul>
            <li>Usually the lowest-cost way to get {money(s.amount)} of protection.</li>
            <li>The {s.years}-year term matches when your need {s.lasting ? 'is highest' : 'ends'}{kids ? ', as your children grow up' : ''}.</li>
            <li>Simple: a set amount for a set number of years.</li>
          </ul>
          <p className="pc-label con">Cons</p>
          <ul>
            <li>Coverage ends at about age {s.untilAge}; nothing is paid after that.</li>
            <li>No cash value to borrow against or keep.</li>
            <li>Buying new coverage later usually costs more, since prices rise with age and health.</li>
          </ul>
          <a className="source-link" href="https://www.lincolnfinancial.com/public/individuals/products/lifeinsurance/termlife" target="_blank" rel="noreferrer">Lincoln Financial: term life overview ↗</a>
        </article>
        <article className={`panel pc-card ${s.lasting ? 'lean' : ''}`}>
          <p className="tvp-kicker">Choosing permanent life insurance</p>
          <h3 className="pc-title">{s.lasting ? 'Worth a close look for your plan' : 'For needs that never end'}</h3>
          <p className="pc-label pro">Pros</p>
          <ul>
            <li>Lasts for life as long as premiums are paid, so it never expires before it is needed.</li>
            <li>Many policies build cash value you can borrow against.</li>
            <li>Useful for lifelong goals such as final expenses ({money(i.finalExpenses)} in your plan) or an inheritance.</li>
          </ul>
          <p className="pc-label con">Cons</p>
          <ul>
            <li>Typically costs several times more than term for the same amount.</li>
            <li>{s.lasting ? 'Higher premiums can make it harder to afford the full amount you need.' : `Much of your need ends by about age ${s.untilAge}, so you would keep paying for coverage beyond it.`}</li>
            <li>Cash value, fees and guarantees vary by product and take time to understand.</li>
          </ul>
          <a className="source-link" href="https://www.lincolnfinancial.com/public/individuals/products/lifeinsurance/permanentlife" target="_blank" rel="noreferrer">Lincoln Financial: permanent life overview ↗</a>
        </article>
      </section>

      {/* 3. Compare with national averages */}
      <section className="panel national">
        <div className="national-head">
          <div>
            <p className="section-kicker">Compare</p>
            <h2 className="section-heading">You and the national median, ages {group.label}</h2>
            <p className="muted small">Typical families whose head of household is {group.label}, from the {SCF_SOURCE.name}.</p>
          </div>
          <button className="btn primary" onClick={createTemplate}>Create a plan from national averages</button>
        </div>
        <div className="standing">
          <h3 className="sub-heading">Where you stand on life insurance</h3>
          {!ready && <p className="standing-summary" role="status">{avg.error && avg.key === nationalKey ? `The comparison needs CalcXML: ${avg.error}` : 'Calculating both households with CalcXML…'}</p>}
          {ready && <p className="standing-summary">
            Today your coverage is <strong>{verdict}</strong> the average person in your situation: <strong>{youRow.pct}%</strong> of your modeled need is covered, compared with <strong>{avgRow.pct}%</strong> for them.
            {' '}Many have less: only {OWNERSHIP.percent}% of adults own any life insurance.
          </p>}
          {standing.map((r) => (
            <div key={r.key} className={`standing-row ${r.key}`}>
              <div className="standing-label">
                <strong>{r.label}</strong>
                <span>{r.sub}</span>
              </div>
              <div className="standing-meter" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={r.pct} aria-label={`${r.label}: ${r.pct}% of need covered`}>
                <span style={{ width: `${r.pct}%` }} />
              </div>
              <div className="standing-numbers">
                <strong>{r.pct}% covered</strong>
                <span>{money(r.coverage)} of {money(r.need)}{r.gap > 0 ? ` · gap ${money(r.gap)}` : ''}</span>
              </div>
            </div>
          ))}
        </div>
        <h3 className="sub-heading">Your finances compared</h3>
        <div className="national-table" role="table" aria-label="Your finances compared with the national median">
          <div className="nt-row nt-head" role="row">
            <span role="columnheader">Item</span>
            <span role="columnheader">You</span>
            <span role="columnheader">National median</span>
            <span role="columnheader" aria-hidden="true" />
          </div>
          {rows.map((r) => {
            const max = Math.max(r.yours, r.theirs, 1);
            const diff = r.yours - r.theirs;
            return (
              <div className="nt-row" role="row" key={r.label}>
                <span role="cell">
                  <strong>{r.label}</strong>
                  {r.note && <span className="nt-note">{r.note}</span>}
                </span>
                <span role="cell" className="nt-num">{money(r.yours)}</span>
                <span role="cell" className="nt-num">{money(r.theirs)}</span>
                <span role="cell" className="nt-bars">
                  <span className="nt-bar you" style={{ width: `${(r.yours / max) * 100}%` }} />
                  <span className="nt-bar them" style={{ width: `${(r.theirs / max) * 100}%` }} />
                  <span className={`nt-diff ${diff > 0 ? 'up' : diff < 0 ? 'down' : ''}`}>{diff === 0 ? 'Same' : `${diff > 0 ? '+' : '−'}${money(Math.abs(diff))}`}</span>
                </span>
              </div>
            );
          })}
        </div>
        <p className="insight-note">
          The template keeps your age and family, and uses the national median income, savings, mortgage and debts with an average-size policy. Sources:{' '}
          <a href={SCF_SOURCE.url} target="_blank" rel="noreferrer">{SCF_SOURCE.name}</a> (2022 dollars);{' '}
          <a href={TYPICAL_POLICY.url} target="_blank" rel="noreferrer">ACLI Life Insurers Fact Book 2025</a> (average policy {money(TYPICAL_POLICY.amount)});{' '}
          <a href={OWNERSHIP.url} target="_blank" rel="noreferrer">{OWNERSHIP.source}</a>. Both households are calculated by CalcXML with the same assumptions.
        </p>
        <button className="btn link" onClick={onCompare}>Compare all my plans side by side</button>
      </section>

      <p className="disclaimer">Save Plan stores this plan in this browser on this device. CalcXML currently uses a documented sample connection. This is an educational estimate, not a quote or recommendation.</p>
    </div>
  );
}
