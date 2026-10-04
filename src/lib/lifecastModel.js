import { CURRENT_YEAR, DEFAULT_ASSUMPTIONS, EVENT_CARDS, normalizeProfile } from './calcEngine.js';
const nonnegative = (value) => Math.max(0, Number(value) || 0);

export function toHousehold(profile) {
  if (profile?.person) return profile;
  const p = normalizeProfile(profile);
  return {
    person: { age: p.age, income: nonnegative(p.primaryIncome) },
    spouse: p.maritalStatus !== 'single' || p.spouseIncome > 0 ? { income: nonnegative(p.spouseIncome) } : null,
    children: p.dependents.map((age, i) => ({ name: `Child ${i + 1}`, age: nonnegative(age) })),
    debts: { mortgage: nonnegative(p.mortgage), other: nonnegative(p.otherDebt) },
    resources: { savings: nonnegative(p.savings), existingCoverage: nonnegative(p.existingCoverage) },
  };
}

export function fromHousehold(h) {
  return normalizeProfile({
    age: h.person?.age, primaryIncome: h.person?.income,
    maritalStatus: h.spouse ? 'married' : 'single', spouseIncome: h.spouse?.income,
    dependents: h.children?.map((child) => child.age),
    mortgage: h.debts?.mortgage, otherDebt: h.debts?.other,
    savings: h.resources?.savings, existingCoverage: h.resources?.existingCoverage,
    coverageSource: h.resources?.existingCoverage > 0 ? 'unspecified' : 'none',
  });
}

// Events change calculator inputs. Insurance results only come from CalcXML.
// Future B is one snapshot after every selected event, not a cash-flow forecast.
export function buildCalculation(profile, events = [], assumptions = {}) {
  const a = { ...DEFAULT_ASSUMPTIONS, ...assumptions };
  const household = structuredClone(toHousehold(profile));
  const ordered = events.filter((event) => EVENT_CARDS.some((card) => card.type === event?.type))
    .map((event) => ({ ...event, year: Math.min(2050, Math.max(CURRENT_YEAR, Math.round(Number(event.year) || CURRENT_YEAR))) }))
    .sort((left, right) => left.year - right.year);
  const year = Math.max(CURRENT_YEAR, ...ordered.map((event) => Number(event.year) || CURRENT_YEAR));
  const elapsed = year - CURRENT_YEAR;
  household.person.age = Math.min(120, household.person.age + elapsed);
  household.children.forEach((child) => { child.age += elapsed; });
  let extraCollegeGoals = 0;
  for (const event of ordered) {
    const amount = event.amount == null ? null : nonnegative(event.amount);
    switch (event.type) {
      case 'child': household.children.push({ name: 'Future child', age: Math.max(0, year - event.year) }); break;
      case 'buy_home': household.debts.mortgage += amount ?? nonnegative(a.newHomePrice); break;
      case 'lose_coverage': household.resources.existingCoverage = 0; break;
      case 'income_up': household.person.income += amount ?? household.person.income * nonnegative(a.incomeChangePct); break;
      case 'income_down': household.person.income = Math.max(0, household.person.income - (amount ?? household.person.income * nonnegative(a.incomeChangePct))); break;
      case 'debt_paid': household.debts.other = 0; break;
      case 'mortgage_paid': household.debts.mortgage = 0; break;
      case 'savings_boost': household.resources.savings += amount ?? nonnegative(a.savingsBoost); break;
      case 'college': extraCollegeGoals += 1; break;
      default: break;
    }
  }
  const educationGoals = household.children.filter((child) => child.age < 22).length + extraCollegeGoals;
  return {
    household, term: Math.max(1, Math.min(60, Math.round(Number(a.incomeYears) || 1))),
    desiredIncome: household.person.income * Math.min(1, nonnegative(a.afterTaxFactor)),
    collegeNeeds: educationGoals * nonnegative(a.educationPerChild),
    funeral: nonnegative(a.finalExpenses), finalExpenses: 0,
    scenarioYear: year, educationGoals, coverageLost: ordered.some((event) => event.type === 'lose_coverage'),
  };
}

export function modelFromCalculation(result, request) {
  const a = result.assessment;
  const validRows = (rows) => Array.isArray(rows) && rows.every((row) => row && Number.isFinite(row.amount));
  if (a?.provider !== 'calcxml-ins01'
    || ![a.coverageGap, a.totalNeed, a.totalResources, a.inputs?.desiredIncome, a.inputs?.term].every(Number.isFinite)
    || !validRows(a.needs) || !validRows(a.resources)) {
    throw new Error('The calculator did not return a valid CalcXML assessment.');
  }
  const h = result.household || request.household;
  const annual = a.inputs.desiredIncome;
  return {
    assessment: a, household: h, calculatorInput: request, provider: a.provider,
    scenarioYear: request.scenarioYear,
    children: h.children.length, educationGoals: request.educationGoals,
    incomeBase: h.person.income, coverageLost: request.coverageLost === true,
    coverageYears: annual > 0 ? h.resources.existingCoverage / annual : 0,
    annualDependableIncome: annual,
    needsRows: a.needs.map((row, index) => ({ key: row.id, label: row.label, value: row.amount,
      color: ['#E67E22', '#C9A227', '#8FB8A8'][index % 3], source: row.source, assumption: row.explanation, formula: row.formula })),
    resourceRows: a.resources.map((row) => ({ key: row.id, label: row.label, value: row.amount,
      source: row.source, assumption: row.explanation, formula: 'Returned by CalcXML Ins01' })),
    totalNeeds: a.totalNeed, savings: h.resources.savings, existingCoverage: h.resources.existingCoverage,
    resources: a.totalResources, gap: a.coverageGap, gapLow: a.coverageGap, gapHigh: a.coverageGap,
    horizon: a.inputs.term,
  };
}

export function fromBackendEvents(events = []) {
  const types = { newChild: 'child', buyHome: 'buy_home', loseCoverage: 'lose_coverage', debtPaidOff: 'debt_paid', savingsIncrease: 'savings_boost', mortgagePaidOff: 'mortgage_paid', college: 'college' };
  return (Array.isArray(events) ? events : []).filter((event) => event && (event.amount == null || Number.isFinite(Number(event.amount)))).map((event) => ({
    type: event.type === 'incomeChange' ? (Number(event.amount) < 0 ? 'income_down' : 'income_up') : types[event.type],
    year: Math.max(CURRENT_YEAR, Math.min(2050, CURRENT_YEAR + Math.round(Number(event.yearsFromNow) || 0))),
    amount: event.amount == null ? null : Math.abs(Number(event.amount)),
  })).filter((event) => event.type);
}
