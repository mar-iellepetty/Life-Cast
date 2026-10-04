import { useAssessment } from '../state/AssessmentContext';
import { money } from '../lib/format';

export function AssessmentSummary({ compact = false }: { compact?: boolean }) {
  const { assessment, loading, error, retry } = useAssessment();
  if (loading) return <div className="assessment-status" role="status">Calculating your current coverage with CalcXML…</div>;
  if (error || !assessment) return <div className="assessment-status error" role="alert"><p>{error || 'Your current assessment is not available.'}</p><button className="btn secondary sm" onClick={retry}>Retry calculation</button></div>;
  return <div className={`assessment-summary ${compact ? 'compact' : ''}`}>
    <div className="assessment-main"><p className="section-kicker">Current coverage gap · CalcXML</p><strong>{money(assessment.coverageGap)}</strong><p>Based on your current household and selected assumptions.</p></div>
    {!compact && <div className="assessment-totals"><div><span>Total modeled needs</span><strong>{money(assessment.totalNeed)}</strong></div><div><span>Available resources</span><strong>{money(assessment.totalResources)}</strong></div></div>}
  </div>;
}
