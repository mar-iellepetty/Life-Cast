import type { Plan } from './model';
import type { PlannerAssessment } from './backend';

export interface GuideViewContext {
  planId: string;
  planFingerprint: string;
  assessmentFingerprint: string | null;
  data: string;
}

export interface ReviewSuggestion {
  years: number; amount: number; untilAge: number; lasting: boolean; fromCalcXml: boolean; reasons: string[];
}

export const BENCHMARK_NOTICE = 'This illustrative template keeps your input age and family, combines separate age-group medians for income and financial assets with debt medians among debt holders, and assumes the average new individual policy. These combined figures do not describe an observed typical household or actual peer coverage.';
export const guidePlanFingerprint = (plan: Plan) => JSON.stringify([plan.financialInputs, plan.lifeEvents, plan.timeline]);

/** Copy the already displayed results; never calculate a second version for the guide. */
export function reviewGuideContext(plan: Plan, assessment: PlannerAssessment | null, display: {
  suggestion: ReviewSuggestion;
  comparisonStatus: 'ready' | 'loading' | 'unavailable';
  ageGroup: string;
  standing: unknown[];
  finances: unknown[];
  sources: { name: string; url: string }[];
}): GuideViewContext {
  const status = assessment ? display.comparisonStatus : 'unavailable';
  return {
    planId: plan.id,
    planFingerprint: guidePlanFingerprint(plan),
    assessmentFingerprint: assessment ? JSON.stringify(assessment) : null,
    data: JSON.stringify({
      page: 'Review & Plan', currentAssessmentStatus: assessment ? 'ready' : 'unavailable',
      currentHousehold: assessment ? { label: 'Current household before buying any suggested policy',
        coverageGap: assessment.coverageGap, existingCoverage: plan.financialInputs.existingCoverage,
      } : null,
      suggestion: assessment ? { ...display.suggestion,
        amountSource: 'Current CalcXML coverage gap rounded up for discussion; zero remains zero.',
        termSource: 'Separate illustrative timeline heuristic, not a CalcXML term recommendation or an insurance quote.',
      } : null,
      comparison: { status, ageGroup: display.ageGroup,
        standing: status === 'ready' ? display.standing : [],
        scenarioMeanings: { avg: 'Constructed illustrative benchmark, not an observed household or actual peers.',
          plan: display.suggestion.amount > 0 ? 'Hypothetical: if you add the suggested policy. This row does not describe coverage already owned or the current household gap.' : 'Current household resources; no additional policy is suggested.',
        },
        finances: display.finances, sources: display.sources, notice: BENCHMARK_NOTICE,
        calculationNotice: 'Both scenarios use CalcXML and the same calculator rate assumptions. The benchmark excludes your life events. The proposed-plan row is hypothetical additional coverage, not insurance already owned.',
      },
      explanationBoundary: 'Explain these displayed results as supplied. Do not recalculate them. If a result is unavailable, say it is unavailable and do not fill it from older conversation history.',
    }),
  };
}

export function checkGuideView(plan: Plan | null | undefined, view?: GuideViewContext, assessment?: PlannerAssessment | null) {
  if (!view) return;
  if (!plan || view.planId !== plan.id || view.planFingerprint !== guidePlanFingerprint(plan)) {
    throw new Error('This review belongs to an earlier plan. Wait for the current review and try again.');
  }
  if (view.assessmentFingerprint === null) throw new Error('The current review assessment is unavailable. Wait for CalcXML or retry the assessment before asking about this review.');
  if (assessment && view.assessmentFingerprint !== JSON.stringify(assessment)) {
    throw new Error('The assessment changed. Wait for the current review and try again.');
  }
}

export function guideContextWithView(base: string, view?: GuideViewContext): string {
  const context = view ? `${base}\n\nCurrent displayed review (a separate illustration where labelled):\n${view.data}` : base;
  if (context.length > 20000) throw new Error('This plan has too much detail for one guide request. Use a smaller plan before asking Lincoln.');
  return context;
}
