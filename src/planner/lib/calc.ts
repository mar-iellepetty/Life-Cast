// Illustrative timeline engine. Current assessment and report figures come from
// CalcXML through lib/backend.ts; this engine only drives the hypothetical charts.
//
// Need at age X = income replacement + mortgage + education + other obligations
//                 − current savings − existing life insurance
//
//   Income replacement  income(X) × replacement ratio × years of support remaining at X.
//                       Years while children still depend on you are reported as Children's needs
//                       (together with education); the remaining years as Income replacement.
//                       Support runs until the latest of: the chosen replacement period, the youngest
//                       child turning 22, or 10 years of spouse support (from today, or from a
//                       marriage event). It never runs past retirement.
//   Mortgage            Current balance paid down evenly over 25 years, plus each home purchase
//                       paid down over 30 years from the purchase age.
//   Education           Funding per child until that child turns 18, plus planned education costs
//                       that are still in the future at X.
//   Other obligations   Other debts paid down over 5 years, plus final expenses.
//   Custom events       Added to their chosen category and paid down evenly over their duration.
//
// Past ages use the same rules: balances you hold today are treated as unchanged before today,
// and children count from their birth. Events affect ages at or after the event, except
// Education, which is a future obligation that counts until it is due.
// Each component is rounded to the nearest $1,000 so every breakdown adds up exactly.
//
// All figures are simplified, hypothetical estimates for planning conversations only.

import { FinancialInputs, LifeEvent, Plan, TermLength, uid, yearAt } from './model';
import { money } from './format';

export const CHILD_SUPPORT_UNTIL = 22;
export const EDUCATION_UNTIL = 18;
export const SPOUSE_SUPPORT_YEARS = 10;
export const MORTGAGE_PAYOFF_YEARS = 25;
export const NEW_MORTGAGE_YEARS = 30;
export const DEBT_PAYOFF_YEARS = 5;
export const CUSTOM_DEFAULT_YEARS = 10;
export const PAST_YEARS_SHOWN = 20;
export const MIN_END_AGE = 80;
export const MAX_END_AGE = 100;
export const COVERAGE_ROUNDING = 50000;
export const MIN_COVERAGE = 100000;

export interface Part {
  text: string;
  value: number;
}

export interface Line {
  key: 'income' | 'children' | 'debts' | 'final' | 'savings' | 'coverage';
  label: string;
  sign: '+' | '−';
  value: number;
  formula: string;
  parts: Part[];
}

export interface CalculationResult {
  age: number;
  year: number;
  income: number;
  supportYears: number;
  supportEndAge: number;
  supportReason: string;
  incomeReplacement: number;
  mortgageRequirement: number;
  educationRequirement: number;
  otherRequirements: number;
  childrenNeed: number;
  debtsRequirement: number;
  finalRequirement: number;
  assetOffsets: number;
  existingCoverageOffset: number;
  estimatedCoverageNeed: number;
  lines: Line[];
}

export interface CoverageTerm {
  index: number;
  start: number;
  end: number;
  years: number;
  auto: boolean;
  coverage: number;
  peakAge: number;
}

export interface PlanCalculation {
  startAge: number;
  endAge: number;
  projection: CalculationResult[];
  today: CalculationResult;
  terms: CoverageTerm[];
  suggestedCoverage: number;
  at: (age: number) => CalculationResult;
}

const r1000 = (n: number) => Math.round(n / 1000) * 1000;
const roundUp = (n: number, step: number) => Math.ceil(n / step) * step;
const remaining = (amount: number, elapsed: number, term: number) => (elapsed < 0 ? 0 : amount * Math.max(0, 1 - elapsed / term));
const sum = (parts: Part[]) => parts.reduce((s, p) => s + p.value, 0);

export const retirementAgeOf = (inputs: FinancialInputs, events: LifeEvent[]) =>
  events.find((e) => e.type === 'retirement')?.age ?? inputs.retirementAge;

/** Income at a given age. Past career changes are already reflected in today's income. */
export function incomeAt(inputs: FinancialInputs, events: LifeEvent[], age: number) {
  if (age >= retirementAgeOf(inputs, events)) return 0;
  let income = inputs.annualIncome * Math.pow(1 + inputs.incomeGrowth, age - inputs.age);
  for (const e of events) {
    if (e.type !== 'career') continue;
    const f = 1 + e.financialImpact / 100;
    if (e.age > inputs.age && age >= e.age) income *= f;
    if (e.age <= inputs.age && age < e.age) income /= f;
  }
  return income;
}

export function calculateAt(inputs: FinancialInputs, events: LifeEvent[], age: number): CalculationResult {
  const t = age - inputs.age;
  const happened = events.filter((e) => e.age <= age);
  const retireAge = retirementAgeOf(inputs, events);

  // ---- Years of income support, and how many of them exist only because of children
  const ends: { age: number; reason: string; child?: boolean }[] = [
    { age: inputs.age + inputs.incomeReplacementYears, reason: `your ${inputs.incomeReplacementYears}-year income replacement period` },
  ];
  const baseBirth = inputs.age - inputs.youngestChildAge;
  if (inputs.children > 0 && age >= baseBirth) ends.push({ age: baseBirth + CHILD_SUPPORT_UNTIL, reason: `your youngest child turns ${CHILD_SUPPORT_UNTIL}`, child: true });
  if (inputs.spouse) ends.push({ age: inputs.age + SPOUSE_SUPPORT_YEARS, reason: `${SPOUSE_SUPPORT_YEARS} years of support for your spouse or partner` });
  for (const e of happened) {
    if (e.type === 'child') ends.push({ age: e.age + CHILD_SUPPORT_UNTIL, reason: `the child born at age ${e.age} turns ${CHILD_SUPPORT_UNTIL}`, child: true });
    if (e.type === 'marriage') ends.push({ age: e.age + SPOUSE_SUPPORT_YEARS, reason: `${SPOUSE_SUPPORT_YEARS} years of spouse support after marriage at age ${e.age}` });
  }
  const latest = ends.reduce((a, b) => (b.age > a.age ? b : a));
  const supportEndAge = Math.min(retireAge, latest.age);
  const supportReason = latest.age > retireAge ? `retirement at age ${retireAge}` : latest.reason;
  const supportYears = Math.max(0, supportEndAge - age);
  const childEnd = Math.max(-Infinity, ...ends.filter((e) => e.child).map((e) => e.age));
  // Years while children still depend on you count as children's needs first.
  const childYears = Math.min(supportYears, Math.max(0, Math.min(retireAge, childEnd) - age));
  const income = r1000(incomeAt(inputs, events, age));
  const incomeReplacement = r1000(income * inputs.replacementRatio * supportYears);
  const childIncome = r1000(income * inputs.replacementRatio * childYears);

  // ---- Mortgage and debts
  const mortgageParts: Part[] = [];
  const baseMortgage = t < 0 ? inputs.mortgage : remaining(inputs.mortgage, t, MORTGAGE_PAYOFF_YEARS);
  if (baseMortgage > 0) mortgageParts.push({ text: `Mortgage, paid down over ${MORTGAGE_PAYOFF_YEARS} years`, value: r1000(baseMortgage) });
  for (const e of happened) {
    if (e.type === 'home') mortgageParts.push({ text: `${e.title} at age ${e.age}`, value: r1000(remaining(e.financialImpact, age - e.age, NEW_MORTGAGE_YEARS)) });
  }
  const debtParts: Part[] = [...mortgageParts];
  const baseDebts = t < 0 ? inputs.otherDebts : remaining(inputs.otherDebts, t, DEBT_PAYOFF_YEARS);
  if (baseDebts > 0) debtParts.push({ text: `Other debts, paid down over ${DEBT_PAYOFF_YEARS} years`, value: r1000(baseDebts) });

  // ---- Education
  const educationParts: Part[] = [];
  const youngestNow = inputs.youngestChildAge + t;
  if (inputs.children > 0 && youngestNow >= 0 && youngestNow < EDUCATION_UNTIL) {
    educationParts.push({ text: `Education: ${inputs.children} × ${money(inputs.educationFunding)}`, value: r1000(inputs.children * inputs.educationFunding) });
  }
  for (const e of events) {
    if (e.type === 'child' && e.age <= age && age - e.age < EDUCATION_UNTIL) educationParts.push({ text: `Education for the child born at age ${e.age}`, value: r1000(e.financialImpact) });
    if (e.type === 'education' && age < e.age) educationParts.push({ text: `${e.title} due at age ${e.age}`, value: r1000(e.financialImpact) });
  }

  // ---- Final expenses and custom events
  const finalParts: Part[] = [];
  if (inputs.finalExpenses > 0) finalParts.push({ text: 'Final expenses', value: r1000(inputs.finalExpenses) });
  for (const e of happened) {
    if (e.type !== 'custom') continue;
    const years = e.years || CUSTOM_DEFAULT_YEARS;
    const value = r1000(remaining(e.financialImpact, age - e.age, years));
    if (value <= 0) continue;
    const part = { text: `${e.title} (age ${e.age}, over ${years} ${years === 1 ? 'year' : 'years'})`, value };
    if (e.category === 'education') educationParts.push(part);
    else if (e.category === 'mortgage') {
      mortgageParts.push(part);
      debtParts.push(part);
    } else finalParts.push(part);
  }

  const nonZero = (p: Part[]) => p.filter((x) => x.value > 0);
  const mortgageRequirement = sum(nonZero(mortgageParts));
  const educationRequirement = sum(nonZero(educationParts));
  const debtsRequirement = sum(nonZero(debtParts));
  const finalRequirement = sum(nonZero(finalParts));
  const otherRequirements = debtsRequirement - mortgageRequirement + finalRequirement;
  const childrenNeed = childIncome + educationRequirement;
  const incomeOnly = incomeReplacement - childIncome;
  const assetOffsets = r1000(inputs.savings);
  const existingCoverageOffset = r1000(inputs.existingCoverage);
  const estimatedCoverageNeed = Math.max(0, incomeReplacement + educationRequirement + debtsRequirement + finalRequirement - assetOffsets - existingCoverageOffset);

  const describe = (p: Part[], none: string) => (p.length ? p.map((x) => `${x.text}: ${money(x.value)}`).join('; ') : none);
  const pct = Math.round(inputs.replacementRatio * 100);
  const childrenParts: Part[] = [
    ...(childIncome > 0 ? [{ text: `Income support until your children are independent (${money(income)} × ${pct}% × ${childYears} years)`, value: childIncome }] : []),
    ...nonZero(educationParts),
  ];

  const lines: Line[] = [
    {
      key: 'income',
      label: 'Income replacement',
      sign: '+',
      value: incomeOnly,
      parts: [],
      formula: incomeOnly > 0 ? `${money(income)} income × ${pct}% × ${supportYears - childYears} years of support for your family` : 'No additional income replacement needed beyond your children’s needs.',
    },
    { key: 'children', label: 'Children’s needs', sign: '+', value: childrenNeed, parts: childrenParts, formula: describe(childrenParts, 'No children depending on you at this age.') },
    { key: 'debts', label: 'Debts', sign: '+', value: debtsRequirement, parts: nonZero(debtParts), formula: describe(nonZero(debtParts), 'No debts at this age.') },
    { key: 'final', label: 'Final expenses', sign: '+', value: finalRequirement, parts: nonZero(finalParts), formula: describe(nonZero(finalParts), 'None.') },
    { key: 'savings', label: 'Savings', sign: '−', value: assetOffsets, parts: [], formula: 'Savings and investments your family could use.' },
    { key: 'coverage', label: 'Existing coverage', sign: '−', value: existingCoverageOffset, parts: [], formula: 'Life insurance you already own, including through work.' },
  ];

  return {
    age,
    year: yearAt(inputs, age),
    income,
    supportYears,
    supportEndAge,
    supportReason,
    incomeReplacement,
    mortgageRequirement,
    educationRequirement,
    otherRequirements,
    childrenNeed,
    debtsRequirement,
    finalRequirement,
    assetOffsets,
    existingCoverageOffset,
    estimatedCoverageNeed,
    lines,
  };
}

// ---------- Terms and the full plan ----------

const cache = new WeakMap<Plan, PlanCalculation>();

/** Timeline illustrations, cached per immutable plan object. */
export function calculatePlan(plan: Plan): PlanCalculation {
  const hit = cache.get(plan);
  if (hit) return hit;

  const { financialInputs: inputs, lifeEvents: events, timeline } = plan;
  const startAge = Math.max(18, inputs.age - PAST_YEARS_SHOWN);
  const all: CalculationResult[] = [];
  for (let age = startAge; age <= MAX_END_AGE; age++) all.push(calculateAt(inputs, events, age));
  const at = (age: number) => all[Math.min(all.length - 1, Math.max(0, age - startAge))];

  // Terms: the first term starts today. When it ends and a need remains, another term is added
  // automatically, unless the user deleted that automatic term.
  const terms: CoverageTerm[] = [];
  let start = inputs.age;
  while (terms.length < 6) {
    const end = Math.min(MAX_END_AGE, start + timeline.termYears);
    let peak = at(start);
    for (let a = start; a < end; a++) if (at(a).estimatedCoverageNeed > peak.estimatedCoverageNeed) peak = at(a);
    terms.push({
      index: terms.length,
      start,
      end,
      years: end - start,
      auto: terms.length > 0,
      coverage: peak.estimatedCoverageNeed > 0 ? Math.max(MIN_COVERAGE, roundUp(peak.estimatedCoverageNeed, COVERAGE_ROUNDING)) : 0,
      peakAge: peak.age,
    });
    if (end >= MAX_END_AGE || at(end).estimatedCoverageNeed <= 0 || timeline.dismissedTermStarts.includes(end)) break;
    start = end;
  }

  const endAge = Math.min(MAX_END_AGE, Math.max(MIN_END_AGE, inputs.age + 25, terms[terms.length - 1].end));
  const projection = all.filter((p) => p.age <= endAge);
  const suggestedCoverage = terms[0].coverage;

  const result: PlanCalculation = {
    startAge,
    endAge,
    projection,
    today: at(inputs.age),
    terms,
    suggestedCoverage,
    at,
  };
  cache.set(plan, result);
  return result;
}

/** Plain-language explanation of the suggested coverage, built from the calculation. */
export function suggestedCoverageExplanation(plan: Plan) {
  const c = calculatePlan(plan);
  const t = c.terms[0];
  const peak = c.at(t.peakAge);
  return [
    { label: `Highest estimated need during your first term (age ${t.peakAge}, ${peak.year})`, value: peak.estimatedCoverageNeed },
    { label: t.coverage ? `Illustrative amount rounded up to the nearest ${money(COVERAGE_ROUNDING)} (minimum ${money(MIN_COVERAGE)})` : 'No additional coverage need in this illustration', value: t.coverage },
  ];
}

/** An event's effect on coverage need. Past events are measured today; future events when they occur. */
export function eventImpact(plan: Plan, eventId: string) {
  const { financialInputs: inputs, lifeEvents } = plan;
  const ev = lifeEvents.find((e) => e.id === eventId)!;
  const without = lifeEvents.filter((e) => e.id !== eventId);
  const at = ev.age < inputs.age ? inputs.age : ev.type === 'education' ? Math.max(inputs.age, ev.age - 1) : ev.age;
  const a = calculateAt(inputs, lifeEvents, at);
  const b = calculateAt(inputs, without, at);
  return {
    at,
    education: a.educationRequirement - b.educationRequirement,
    incomeReplacement: a.incomeReplacement - b.incomeReplacement,
    responsibilities: a.mortgageRequirement - b.mortgageRequirement + (a.otherRequirements - b.otherRequirements),
    total: a.estimatedCoverageNeed - b.estimatedCoverageNeed,
  };
}

// ---------- Plan factories ----------

export function createPlan(name: string, financialInputs: FinancialInputs, lifeEvents: LifeEvent[] = [], termYears: TermLength = 20, templateId?: string): Plan {
  return { id: uid(), name, financialInputs, lifeEvents, timeline: { termYears, dismissedTermStarts: [] }, templateId };
}

export function createDefaultPlans(inputs: FinancialInputs): Plan[] {
  return [
    createPlan('My Plan', inputs),
    createPlan('More support', { ...inputs, replacementRatio: Math.max(inputs.replacementRatio, 0.8), incomeReplacementYears: Math.min(70, inputs.incomeReplacementYears + 5), educationFunding: Math.round(inputs.educationFunding * 1.25) }),
  ];
}

export function duplicatePlan(plan: Plan, name: string): Plan {
  return {
    ...plan,
    id: uid(),
    name,
    financialInputs: { ...plan.financialInputs },
    lifeEvents: plan.lifeEvents.map((e) => ({ ...e, id: uid() })),
    timeline: { ...plan.timeline, dismissedTermStarts: [...plan.timeline.dismissedTermStarts] },
  };
}

export function uniqueName(names: string[], base: string) {
  if (!names.includes(base)) return base;
  let n = 2;
  while (names.includes(`${base} ${n}`)) n++;
  return `${base} ${n}`;
}
