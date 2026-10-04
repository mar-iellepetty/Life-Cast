// Central planning model. Every screen reads and writes these shapes through the store
// (src/state/store.ts) and derives numbers only through calculatePlan (src/lib/calc.ts).

export interface FinancialInputs {
  age: number;
  annualIncome: number;
  incomeGrowth: number; // annual, e.g. 0.03
  savings: number;
  existingCoverage: number;
  mortgage: number;
  otherDebts: number;
  spouse: boolean;
  otherDependents: boolean;
  children: number;
  youngestChildAge: number;
  educationFunding: number; // per child
  finalExpenses: number;
  incomeReplacementYears: number;
  replacementRatio: number; // share of income the family would need, e.g. 0.7
  retirementAge: number;
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
}

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
