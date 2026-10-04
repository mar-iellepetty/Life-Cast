import { useState } from 'react';
import type { Plan } from '../lib/model';
import { money } from '../lib/format';
import { useAssessment } from '../state/AssessmentContext';
import { AssessmentSummary } from './AssessmentSummary';
import './report.css';

export function Report({ plan }: { plan: Plan }) {
  const result = useAssessment();
  const { assessment, household, calculatorInput, assumptions, loading, error } = result;
  const [downloadError, setDownloadError] = useState('');
  function download() {
    if (!assessment || loading || error) return;
    try {
      const payload = { version: 1, generatedAt: new Date().toISOString(), plan, assessment, household, calculatorInput, assumptions,
        methodology: 'Current coverage assessment from CalcXML Ins01. Future events belong to the separate illustrative timeline.',
        disclaimer: 'Educational planning estimate, not an insurance quote or product recommendation.' };
      const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }));
      const link = document.createElement('a'); link.href = url;
      link.download = `LifeCast-${plan.name.replace(/[^a-z0-9_-]/gi, '-').slice(0, 60)}-report.json`;
      link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); setDownloadError('');
    } catch { setDownloadError('The report could not be downloaded. Try Print / Save PDF instead.'); }
  }
  return <div className="planning-report fade">
    <header className="report-heading"><div><p className="eyebrow">Your plan, explained</p><h1 className="page-title">Your LifeCast report</h1><p className="page-sub">{plan.name} · {new Date().toLocaleDateString('en-US', { dateStyle: 'long' })}</p></div>
      <div className="report-actions"><button className="btn primary" disabled={loading || !!error || !assessment} onClick={() => window.print()}>Print / Save PDF</button><button className="btn secondary" disabled={loading || !!error || !assessment} onClick={download}>Download data</button></div>
    </header>
    {downloadError && <p role="alert">{downloadError}</p>}
    <AssessmentSummary />
    {assessment && !loading && !error && <>
      <section className="panel report-section"><h2 className="section-heading">Where the number comes from</h2><p className="panel-sub">These are the line items returned by CalcXML Ins01. Its rounded gap can differ slightly from the subtraction of displayed totals.</p>
        <div className="report-table-wrap"><table className="report-table"><thead><tr><th scope="col">Component</th><th scope="col">Amount</th><th scope="col">Explanation</th></tr></thead><tbody>
          {assessment.needs.map(row => <tr key={row.id}><th scope="row">{row.label}</th><td>{money(row.amount)}</td><td>{row.explanation}</td></tr>)}
          {assessment.resources.map(row => <tr key={row.id}><th scope="row">{row.label}</th><td>−{money(row.amount)}</td><td>{row.explanation}</td></tr>)}
          <tr className="report-total"><th scope="row">Current coverage gap</th><td>{money(assessment.coverageGap)}</td><td>CalcXML estimate using the inputs below.</td></tr>
        </tbody></table></div>
      </section>
      <div className="report-columns">
        <section className="panel report-section"><h2 className="section-heading">Your household</h2><dl className="report-facts">
          <Fact label="Age" value={household.person.age} /><Fact label="Annual income" value={money(household.person.income)} />
          <Fact label="Partner income" value={household.spouse ? money(household.spouse.income) : 'No partner entered'} />
          <Fact label="Children’s ages used" value={household.children.length ? household.children.map(child => child.age).join(', ') : 'No children entered'} />
          <Fact label="Mortgage" value={money(household.debts.mortgage)} /><Fact label="Other debt" value={money(household.debts.other)} />
          <Fact label="Savings" value={money(household.resources.savings)} /><Fact label="Existing coverage" value={money(household.resources.existingCoverage)} />
        </dl></section>
        <section className="panel report-section"><h2 className="section-heading">Calculation assumptions</h2><dl className="report-facts">
          <Fact label="Income support" value={`${assessment.inputs.term} years`} /><Fact label="Annual support amount" value={money(assessment.inputs.desiredIncome)} />
          <Fact label="Education funding" value={money(calculatorInput.collegeNeeds)} /><Fact label="Final expenses" value={money(calculatorInput.funeral)} />
          <Fact label="Return assumption" value={`${(assessment.inputs.beforeTaxReturn * 100).toFixed(1)}%`} /><Fact label="Inflation assumption" value={`${(assessment.inputs.inflation * 100).toFixed(1)}%`} />
        </dl></section>
      </div>
      <section className="panel report-section"><h2 className="section-heading">Your planned life events</h2><p className="panel-sub">Future events shape the illustrative timeline. They are not added to today’s CalcXML assessment before their scheduled age.</p>
        {plan.lifeEvents.length ? <ol className="report-events">{[...plan.lifeEvents].sort((a,b) => a.age-b.age).map(event => <li key={event.id}><strong>{event.title}</strong><span>Age {event.age} · {event.type === 'career' ? `${event.financialImpact}% income change` : event.financialImpact ? money(event.financialImpact) : 'Household change'}</span><p>{event.description}</p></li>)}</ol> : <p className="panel-sub">No life events have been added to this plan.</p>}
      </section>
      <section className="panel report-section report-notes"><h2 className="section-heading">What to review next</h2><ul><li>Confirm the household information and any assumptions listed below.</li><li>Review your existing coverage details, including what happens when you leave an employer.</li><li>Use the Review &amp; Plan tab to compare coverage characteristics and prepare questions for a licensed professional.</li>{assumptions.map((note,index) => <li key={index}>{note}</li>)}</ul></section>
      <p className="disclaimer">Educational planning estimate, not an insurance quote or product recommendation. The calculator currently uses its documented sample connection. This report is generated from your selected plan; no AI-generated amounts are substituted.</p>
    </>}
  </div>;
}

function Fact({ label, value }: { label: string; value: string | number }) { return <div><dt>{label}</dt><dd>{value}</dd></div>; }
