// Central planning model shared through the planner store. Current assessments
// come from backend.ts (CalcXML); calc.ts produces separate timeline illustrations.

export interface FinancialInputs {
  age: number;
  annualIncome: number;
  incomeGrowth: number; // annual, e.g. 0.03
  savings: number;
  existingCoverage: number;
  mortgage: number;
  otherDebts: number;
  spouse: boolean;
  spouseIncome?: number;
  otherDependents: boolean;
  children: number;
  youngestChildAge: number;
  /** Individual ages, when collected; otherwise every child uses the youngest age. */
  childAges?: number[];
  educationFunding: number; // per child
  finalExpenses: number;
  incomeReplacementYears: number;
  replacementRatio: number; // share of income the family would need, e.g. 0.7
  retirementAge: number;
  /** Where the household lives (city and state, or ZIP). Used for environmental-risk insights. */
  location?: string;
}

export type EventType = 'marriage' | 'child' | 'home' | 'education' | 'career' | 'retirement' | 'custom';
export type ImpactCategory = 'education' | 'mortgage' | 'other';

export interface LifeEvent {
  id: string;
  type: EventType;
  title: string;
  age: number;
  /** Dollar amount, or percent for career changes. Unused for marriage and retirement. */
  financialImpact: number;
  description: string;
  isCustom: boolean;
  /** Custom events: which part of the calculation the amount belongs to. */
  category?: ImpactCategory;
  /** Custom events: years over which the obligation is paid down. */
  years?: number;
  /** Lincoln's AI estimate for a custom event, shown under the timeline. */
  ai?: { summary: string; status: 'ready' | 'error' };
}

/** A small, AI-explained adjustment to the illustrative timeline (never to the CalcXML assessment). */
export interface Adjustment {
  percent: number;
  headline: string;
  reasons: string[];
  at: string;
  /** Location insights: where, what FEMA reports, and the source. */
  place?: string;
  county?: string;
  overall?: string;
  hazards?: { label: string; rating: string }[];
  source?: { name: string; url: string; version?: string };
  /** Health insights: the averages that were reviewed. */
  metrics?: Record<string, number | undefined>;
  sample?: boolean;
}

export interface PlanAdjustments {
  health?: Adjustment;
  location?: Adjustment;
}

export type TermLength = 10 | 15 | 20 | 30;

export interface Timeline {
  termYears: TermLength;
  /** Start ages of automatically extended terms the user deleted. */
  dismissedTermStarts: number[];
}

export interface Plan {
  id: string;
  name: string;
  financialInputs: FinancialInputs;
  lifeEvents: LifeEvent[];
  timeline: Timeline;
  /** Set when a plan was created from an example scenario. */
  templateId?: string;
  /** Apple Health and location insights applied to the illustrative timeline. */
  adjustments?: PlanAdjustments;
}

/** Total illustrative adjustment, capped at plus or minus 10 percent. */
export const adjustmentPercent = (plan: Plan) => Math.max(-10, Math.min(10, (plan.adjustments?.health?.percent ?? 0) + (plan.adjustments?.location?.percent ?? 0)));

export interface EventDef {
  type: Exclude<EventType, 'custom'>;
  label: string;
  description: string;
  impactLabel?: string;
  impactKind?: 'money' | 'percent';
  defaultImpact: number;
  single?: boolean;
}

export const EVENT_DEFS: Record<Exclude<EventType, 'custom'>, EventDef> = {
  marriage: { type: 'marriage', label: 'Marriage', description: 'A spouse or partner relies on your income.', defaultImpact: 0, single: true },
  child: { type: 'child', label: 'Child', description: 'Income support and education funding until adulthood.', impactLabel: 'Education funding', impactKind: 'money', defaultImpact: 120000 },
  home: { type: 'home', label: 'Home purchase', description: 'A new mortgage your family would keep paying.', impactLabel: 'Mortgage amount', impactKind: 'money', defaultImpact: 350000 },
  education: { type: 'education', label: 'Education', description: 'A planned tuition obligation due at this age.', impactLabel: 'Tuition cost', impactKind: 'money', defaultImpact: 120000 },
  career: { type: 'career', label: 'Career change', description: 'A change in income from this age onward.', impactLabel: 'Income change', impactKind: 'percent', defaultImpact: 15 },
  retirement: { type: 'retirement', label: 'Retirement', description: 'Earned income ends, and so does the need to replace it.', defaultImpact: 0, single: true },
};

export const STANDARD_EVENTS = Object.values(EVENT_DEFS).map((d) => d.type);

export const uid = () => Math.random().toString(36).slice(2, 10);

export const CURRENT_YEAR = new Date().getFullYear();
export const yearAt = (inputs: FinancialInputs, age: number) => CURRENT_YEAR + (age - inputs.age);

export function makeEvent(type: Exclude<EventType, 'custom'>, age: number): LifeEvent {
  const d = EVENT_DEFS[type];
  return { id: uid(), type, title: d.label, age, financialImpact: d.defaultImpact, description: d.description, isCustom: false };
}

export const defaultInputs: FinancialInputs = {
  age: 35,
  annualIncome: 85000,
  incomeGrowth: 0.03,
  savings: 25000,
  existingCoverage: 0,
  mortgage: 0,
  otherDebts: 0,
  spouse: false,
  otherDependents: false,
  children: 0,
  youngestChildAge: 4,
  educationFunding: 120000,
  finalExpenses: 15000,
  incomeReplacementYears: 10,
  replacementRatio: 0.7,
  retirementAge: 65,
};

const object = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const finite = (value: unknown, min: number, max: number, integer = false) => typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max && (!integer || Number.isInteger(value));

/** Validate persisted or imported plans before calculations or external requests. */
export function isValidFinancialInputs(value: unknown): value is FinancialInputs {
  if (!object(value)) return false;
  for (const key of ['annualIncome', 'savings', 'existingCoverage', 'mortgage', 'otherDebts', 'educationFunding', 'finalExpenses']) if (!finite(value[key], 0, 1e9)) return false;
  if (!finite(value.age, 18, 100, true) || !finite(value.retirementAge, 18, 100, true)
    || !finite(value.incomeGrowth, -0.99, 1) || !finite(value.incomeReplacementYears, 0, 70, true)
    || !finite(value.replacementRatio, 0, 1) || !finite(value.children, 0, 8, true)
    || !finite(value.youngestChildAge, 0, 21, true) || typeof value.spouse !== 'boolean' || typeof value.otherDependents !== 'boolean') return false;
  if (value.spouseIncome !== undefined && !finite(value.spouseIncome, 0, 1e9)) return false;
  if (value.location !== undefined && (typeof value.location !== 'string' || value.location.length > 120)) return false;
  if (value.childAges !== undefined && (!Array.isArray(value.childAges) || value.childAges.length !== value.children || value.childAges.some((age) => !finite(age, 0, 21, true)))) return false;
  return true;
}

export function isValidPlan(value: unknown): value is Plan {
  if (!object(value) || typeof value.id !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(value.id)
    || typeof value.name !== 'string' || !value.name.trim() || value.name.length > 100 || !isValidFinancialInputs(value.financialInputs)
    || !Array.isArray(value.lifeEvents) || value.lifeEvents.length > 64 || !object(value.timeline)) return false;
  if (![10, 15, 20, 30].includes(value.timeline.termYears as number) || !Array.isArray(value.timeline.dismissedTermStarts)
    || value.timeline.dismissedTermStarts.length > 10 || value.timeline.dismissedTermStarts.some((age) => !finite(age, 18, 100, true))) return false;
  if (value.templateId !== undefined && (typeof value.templateId !== 'string' || value.templateId.length > 100)) return false;
  const ids = new Set();
  for (const event of value.lifeEvents) {
    if (!object(event) || typeof event.id !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(event.id) || ids.has(event.id)) return false;
    ids.add(event.id);
    if (!['marriage', 'child', 'home', 'education', 'career', 'retirement', 'custom'].includes(event.type as string)
      || !finite(event.age, 0, 100, true) || !finite(event.financialImpact, event.type === 'career' ? -99 : 0, event.type === 'career' ? 500 : 1e9)
      || typeof event.title !== 'string' || !event.title.trim() || event.title.length > 120
      || typeof event.description !== 'string' || event.description.length > 2000 || typeof event.isCustom !== 'boolean') return false;
    if (event.category !== undefined && !['education', 'mortgage', 'other'].includes(event.category as string)) return false;
    if (event.years !== undefined && !finite(event.years, 1, 100, true)) return false;
  }
  return true;
}
