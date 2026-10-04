import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Plan } from '../lib/model';
import { getPlannerAssessment, plannerAssumptions, plannerRequestKey, type PlannerResult } from '../lib/backend';

type AssessmentState = Omit<PlannerResult, 'assessment' | 'household' | 'calculatorInput'> & {
  assessment: PlannerResult['assessment'] | null;
  household: PlannerResult['household'] | null;
  calculatorInput: PlannerResult['calculatorInput'] | null;
  loading: boolean; error: string | null; retry: () => void;
};
const empty: AssessmentState = { assessment: null, household: null, calculatorInput: null, assumptions: [], provider: 'calcxml-ins01', loading: false, error: null, retry: () => {} };
const Context = createContext<AssessmentState>(empty);

export function AssessmentProvider({ plan, children }: { plan?: Plan | null; children: ReactNode }) {
  const [retryNumber, setRetryNumber] = useState(0);
  const lastRetry = useRef(0);
  const retry = useCallback(() => setRetryNumber((number) => number + 1), []);
  const identity = useMemo(() => {
    if (!plan) return { key: '', error: null, assumptions: [] as string[] };
    try { return { key: `${plan.id}:${plannerRequestKey(plan)}:${JSON.stringify(plan.financialInputs)}:${JSON.stringify(plan.lifeEvents)}`, error: null, assumptions: plannerAssumptions(plan) }; }
    catch (error) { return { key: `invalid:${plan.id}`, error: error instanceof Error ? error.message : 'Review this plan before calculating.', assumptions: [] as string[] }; }
  }, [plan]);
  const [state, setState] = useState<{ key: string; result: PlannerResult | null; error: string | null; loading: boolean }>({ key: '', result: null, error: null, loading: false });
  useEffect(() => {
    if (!plan || identity.error) return;
    const controller = new AbortController();
    setState({ key: identity.key, result: null, error: null, loading: true });
    const force = retryNumber !== lastRetry.current;
    lastRetry.current = retryNumber;
    getPlannerAssessment(plan, { signal: controller.signal, force }).then(
      (result) => { if (!controller.signal.aborted) setState({ key: identity.key, result, error: null, loading: false }); },
      (error) => { if (!controller.signal.aborted) setState({ key: identity.key, result: null, error: error instanceof Error ? error.message : 'The calculator is unavailable. Please retry.', loading: false }); },
    );
    return () => controller.abort();
  }, [plan, identity.key, identity.error, retryNumber]);
  let value: AssessmentState = { ...empty, retry };
  if (plan) {
    const current = state.key === identity.key;
    value = { ...empty, ...(current ? state.result : null), assumptions: current && state.result ? state.result.assumptions : identity.assumptions,
      loading: !identity.error && (!current || state.loading), error: identity.error || (current ? state.error : null), retry };
  }
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useAssessment() { return useContext(Context); }
