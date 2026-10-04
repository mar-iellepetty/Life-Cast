import { createDefaultPlans, duplicatePlan, uniqueName } from '../lib/calc';
import { EVENT_DEFS, FinancialInputs, LifeEvent, Plan, TermLength, uid, isValidPlan } from '../lib/model';

export interface PlanningState {
  plans: Plan[];
  activeId: string;
}

export type Action =
  | { type: 'start'; inputs: FinancialInputs; events?: LifeEvent[] }
  | { type: 'load'; state: PlanningState }
  | { type: 'reset' }
  | { type: 'setInputs'; patch: Partial<FinancialInputs> }
  | { type: 'addEvent'; event: LifeEvent }
  | { type: 'updateEvent'; id: string; patch: Partial<LifeEvent> }
  | { type: 'removeEvent'; id: string }
  | { type: 'setTermYears'; years: TermLength }
  | { type: 'dismissTerm'; start: number }
  | { type: 'restoreTerms' }
  | { type: 'addPlan'; plan: Plan }
  | { type: 'applyTemplate'; plan: Plan }
  | { type: 'duplicatePlan'; id: string }
  | { type: 'renamePlan'; id: string; name: string }
  | { type: 'deletePlan'; id: string }
  | { type: 'selectPlan'; id: string };

export const emptyState: PlanningState = { plans: [], activeId: '' };

const updateActive = (s: PlanningState, fn: (p: Plan) => Plan): PlanningState => ({
  ...s,
  plans: s.plans.map((p) => (p.id === s.activeId ? fn(p) : p)),
});

export function reducer(s: PlanningState, a: Action): PlanningState {
  switch (a.type) {
    case 'start': {
      const plans = createDefaultPlans(a.inputs).map((p) => ({ ...p, lifeEvents: (a.events ?? []).map((e) => ({ ...e, id: uid() })) }));
      return { plans, activeId: plans[0].id };
    }
    case 'load':
      return validState(a.state) ? a.state : s;
    case 'reset':
      return emptyState;
    case 'setInputs':
      return updateActive(s, (p) => {
        const financialInputs = { ...p.financialInputs, ...a.patch };
        // A count/youngest-age edit supersedes a previously collected age list.
        if (!('childAges' in a.patch) && ('children' in a.patch || 'youngestChildAge' in a.patch)) delete financialInputs.childAges;
        return { ...p, financialInputs };
      });
    case 'addEvent':
      return updateActive(s, (p) => {
        const single = a.event.type !== 'custom' && EVENT_DEFS[a.event.type].single;
        const existing = single ? p.lifeEvents.find((e) => e.type === a.event.type) : undefined;
        return {
          ...p,
          lifeEvents: existing ? p.lifeEvents.map((e) => (e.id === existing.id ? { ...a.event, id: existing.id } : e)) : [...p.lifeEvents, a.event],
        };
      });
    case 'updateEvent':
      return updateActive(s, (p) => ({ ...p, lifeEvents: p.lifeEvents.map((e) => (e.id === a.id ? { ...e, ...a.patch } : e)) }));
    case 'removeEvent':
      return updateActive(s, (p) => ({ ...p, lifeEvents: p.lifeEvents.filter((e) => e.id !== a.id) }));
    case 'setTermYears':
      return updateActive(s, (p) => ({ ...p, timeline: { termYears: a.years, dismissedTermStarts: [] } }));
    case 'dismissTerm':
      return updateActive(s, (p) => ({ ...p, timeline: { ...p.timeline, dismissedTermStarts: [...p.timeline.dismissedTermStarts, a.start] } }));
    case 'restoreTerms':
      return updateActive(s, (p) => ({ ...p, timeline: { ...p.timeline, dismissedTermStarts: [] } }));
    case 'addPlan': {
      const name = uniqueName(s.plans.map((p) => p.name), a.plan.name);
      return { plans: [...s.plans, { ...a.plan, name }], activeId: a.plan.id };
    }
    case 'applyTemplate':
      // Replace the current plan's numbers and events with the template's, keeping its name and id.
      return updateActive(s, (p) => ({
        ...p,
        financialInputs: { ...a.plan.financialInputs },
        lifeEvents: a.plan.lifeEvents.map((e) => ({ ...e, id: uid() })),
        timeline: { ...a.plan.timeline, dismissedTermStarts: [] },
        templateId: a.plan.templateId,
      }));
    case 'duplicatePlan': {
      const src = s.plans.find((p) => p.id === a.id);
      if (!src) return s;
      const copy = duplicatePlan(src, uniqueName(s.plans.map((p) => p.name), `${src.name} copy`));
      return { plans: [...s.plans, copy], activeId: copy.id };
    }
    case 'renamePlan':
      return { ...s, plans: s.plans.map((p) => (p.id === a.id ? { ...p, name: a.name } : p)) };
    case 'deletePlan': {
      if (s.plans.length <= 1) return s;
      const plans = s.plans.filter((p) => p.id !== a.id);
      return { plans, activeId: s.activeId === a.id ? plans[0].id : s.activeId };
    }
    case 'selectPlan':
      return { ...s, activeId: a.id };
  }
}

export const STORAGE_KEY = 'lifecast-integrated-plans-v2';

function validState(value: unknown): value is PlanningState {
  if (!value || typeof value !== 'object') return false;
  const state = value as PlanningState;
  return Array.isArray(state.plans) && state.plans.length > 0 && state.plans.length <= 30 && state.plans.every(isValidPlan)
    && new Set(state.plans.map((plan) => plan.id)).size === state.plans.length && state.plans.some((plan) => plan.id === state.activeId);
}

export function savePlans(state: PlanningState) {
  try {
    if (!validState(state)) return false;
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...state, savedAt: Date.now() }));
    return true;
  } catch {
    return false;
  }
}

export function loadSavedPlans(): (PlanningState & { savedAt: number }) | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw || raw.length > 1000000) return null;
    const parsed = JSON.parse(raw);
    const savedAt = parsed?.savedAt;
    return validState(parsed) && typeof savedAt === 'number' && Number.isFinite(savedAt) && savedAt > 0 ? { ...parsed, savedAt } : null;
  } catch {
    return null;
  }
}

/** Deletes only integrated-planner data; the original friend's saved plans remain intact. */
export function clearSavedPlans() {
  try { localStorage.removeItem(STORAGE_KEY); return true; } catch { return false; }
}
