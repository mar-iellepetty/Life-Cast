import { defaultInputs, isValidPlan, type FinancialInputs, type Plan } from './model';

export interface Household {
  person: { age: number; income: number };
  spouse: { income: number } | null;
  children: { name: string; age: number }[];
  debts: { mortgage: number; other: number };
  resources: { savings: number; existingCoverage: number };
}
export interface CalculatorInput {
  household: Household; term: number; desiredIncome: number; collegeNeeds: number;
  funeral: number; finalExpenses: number; beforeTaxReturn: number; inflation: number; includeSocsec: boolean;
}
export interface AssessmentLine { id: string; label: string; amount: number; source: string; explanation: string; formula?: string }
export interface PlannerAssessment {
  provider: 'calcxml-ins01'; coverageGap: number; totalNeed: number; totalResources: number;
  needs: AssessmentLine[]; resources: AssessmentLine[]; range: { low: number; balanced: number; high: number };
  inputs: { term: number; desiredIncome: number; beforeTaxReturn: number; inflation: number; includeSocsec: string };
  methodology?: string;
}
export interface PlannerResult {
  assessment: PlannerAssessment; household: Household; calculatorInput: CalculatorInput;
  assumptions: string[]; provider: 'calcxml-ins01';
}

const remaining = (amount: number, elapsed: number, years: number) => amount * Math.max(0, 1 - elapsed / years);

function mapping(plan: Plan) {
  if (!isValidPlan(plan)) throw new Error('This plan contains invalid or incomplete inputs. Review the saved plan before calculating.');
  const i = plan.financialInputs;
  const assumptions: string[] = [];
  const ages = i.childAges ? [...i.childAges] : Array.from({ length: i.children }, () => i.youngestChildAge);
  if (i.children && !i.childAges) assumptions.push(`All ${i.children} current children use the youngest child's age (${i.youngestChildAge}) because individual ages were not supplied.`);
  const children = ages.map((age, index) => ({ name: `Child ${index + 1}`, age }));
  const active = plan.lifeEvents.filter((event) => event.age <= i.age);
  const future = plan.lifeEvents.filter((event) => event.age > i.age);
  if (future.length) assumptions.push(`${future.length} future event${future.length === 1 ? ' is' : 's are'} excluded from today's CalcXML assessment: ${future.map((event) => `${event.title} at age ${event.age}`).join('; ')}. The timeline projection is a separate illustration.`);
  const married = i.spouse || active.some((event) => event.type === 'marriage');
  if (married && i.spouseIncome === undefined) assumptions.push('Spouse income is assumed to be $0 because it was not supplied.');
  if (married) assumptions.push(`Spouse age defaults to your age (${i.age}) and spouse retirement age to ${Math.max(67, i.age)}; verify these assumptions before relying on the estimate.`);
  if (i.otherDependents) assumptions.push('Other dependents use the selected income-support period; no separate expense amount was supplied.');
  let mortgage = i.mortgage; const other = i.otherDebts; let additionalFinal = 0;
  let college = ages.filter((age) => age < 18).length * i.educationFunding;
  const ends = [i.age + i.incomeReplacementYears, ...ages.map((age) => i.age + Math.max(0, 22 - age))];
  if (i.spouse) ends.push(i.age + 10);
  let retired = i.age >= i.retirementAge;
  for (const event of active) {
    const elapsed = i.age - event.age;
    if (event.type === 'marriage') ends.push(event.age + 10);
    if (event.type === 'child') {
      children.push({ name: event.title, age: elapsed }); ends.push(event.age + 22);
      if (elapsed < 18) college += event.financialImpact;
    }
    if (event.type === 'home') mortgage += remaining(event.financialImpact, elapsed, 30);
    if (event.type === 'retirement') retired = true;
    if (event.type === 'custom') {
      const value = remaining(event.financialImpact, elapsed, event.years || 10);
      if (event.category === 'mortgage') mortgage += value;
      else if (event.category === 'education') college += value;
      else additionalFinal += value;
    }
  }
  if (children.length > 20) throw new Error('The calculator adapter supports at most 20 dependent entries. Review duplicate child events.');
  if (children.filter((child) => child.age <= 17).length > 4) assumptions.push('CalcXML accepts four individual child-age slots; the education goal includes all entered dependent children. Social Security estimates are disabled.');
  if (active.some((event) => event.type === 'home' || event.type === 'child' || event.type === 'custom')) assumptions.push('Past/current home, child and custom events add obligations beyond the current inputs. Avoid entering the same obligation both as an input and as an event. Home events pay down evenly over 30 years; custom events use their stated duration.');
  if (active.some((event) => event.type === 'education')) assumptions.push('Education events dated today or earlier are treated as already paid; any remaining education debt belongs in current debts.');
  if (active.some((event) => event.type === 'career')) assumptions.push('Your entered annual income is current and already includes past/current career changes; career percentages are not applied twice.');
  const supportYears = retired ? 0 : Math.max(0, Math.min(i.retirementAge, Math.max(...ends)) - i.age);
  assumptions.push(`Income support lasts ${supportYears} years: the longest selected replacement period, dependent support to age 22, or 10 years of spouse support, capped at retirement age ${i.retirementAge}.`);
  if (supportYears === 0) assumptions.push('No earned-income replacement is requested. CalcXML receives a one-year technical minimum with desired income set to $0.');
  assumptions.push('CalcXML assumptions: 5% before-tax investment return, 2% inflation, and Social Security excluded. College funding is an input goal; no insurance premiums are quoted.');
  const household: Household = { person: { age: i.age, income: retired ? 0 : i.annualIncome }, spouse: married ? { income: i.spouseIncome ?? 0 } : null,
    children, debts: { mortgage: Math.round(mortgage), other }, resources: { savings: i.savings, existingCoverage: i.existingCoverage } };
  const calculatorInput: CalculatorInput = { household, term: Math.min(70, Math.max(1, supportYears)), desiredIncome: supportYears ? Math.round(household.person.income * i.replacementRatio) : 0,
    collegeNeeds: Math.round(college), funeral: i.finalExpenses, finalExpenses: Math.round(additionalFinal), beforeTaxReturn: 0.05, inflation: 0.02, includeSocsec: false };
  return { calculatorInput, assumptions };
}

/** Input transformations only. Never imports the illustrative coverage/premium engine. */
export function buildPlannerRequest(plan: Plan): CalculatorInput { return mapping(plan).calculatorInput; }
export function plannerAssumptions(plan: Plan): string[] { return mapping(plan).assumptions; }
export function plannerRequestKey(plan: Plan) { return JSON.stringify(buildPlannerRequest(plan)); }

type CachedResponse = { assessment: PlannerAssessment; household: Household; provider: 'calcxml-ins01' };
type Pending = { controller: AbortController; promise: Promise<CachedResponse>; subscribers: number; abortTimer?: ReturnType<typeof setTimeout> };
const cache = new Map<string, CachedResponse>();
const pending = new Map<string, Pending>();
function abortError() { return new DOMException('The request was cancelled.', 'AbortError'); }
function checkedResponse(value: unknown): CachedResponse {
  const result = value as CachedResponse;
  const a = result?.assessment;
  const h = result?.household;
  const nonnegative = (v: unknown) => typeof v === 'number' && Number.isFinite(v) && v >= 0;
  const rows = (list: AssessmentLine[]) => Array.isArray(list) && list.every((row) => row && ['id', 'label', 'source', 'explanation'].every((key) => typeof row[key as keyof AssessmentLine] === 'string') && nonnegative(row.amount));
  if (result?.provider !== 'calcxml-ins01' || a?.provider !== 'calcxml-ins01' || ![a.coverageGap, a.totalNeed, a.totalResources, a.inputs?.term, a.inputs?.desiredIncome].every((v) => Number.isFinite(v) && v >= 0)
    || ![a.inputs?.beforeTaxReturn, a.inputs?.inflation, a.range?.low, a.range?.balanced, a.range?.high].every(nonnegative)
    || !['Y', 'N'].includes(a.inputs?.includeSocsec) || !rows(a.needs) || !rows(a.resources)
    || ![h?.person?.age, h?.person?.income, h?.debts?.mortgage, h?.debts?.other, h?.resources?.savings, h?.resources?.existingCoverage].every(nonnegative)
    || (h?.spouse !== null && !nonnegative(h?.spouse?.income)) || !Array.isArray(h?.children) || !h.children.every((child) => child && typeof child.name === 'string' && nonnegative(child.age))) throw new Error('CalcXML returned an incomplete assessment. No local estimate has been substituted.');
  return result;
}

export async function getPlannerAssessment(plan: Plan, options: { signal?: AbortSignal; force?: boolean } = {}): Promise<PlannerResult> {
  if (options.signal?.aborted) throw abortError();
  const { calculatorInput, assumptions } = mapping(plan);
  const key = JSON.stringify(calculatorInput);
  if (options.force) cache.delete(key);
  const cached = cache.get(key);
  if (cached) return { ...structuredClone(cached), calculatorInput, assumptions };
  let entry = pending.get(key);
  if (!entry || entry.controller.signal.aborted) {
    const controller = new AbortController();
    entry = { controller, subscribers: 0, promise: Promise.resolve(null as unknown as CachedResponse) };
    const owned = entry;
    entry.promise = (async () => {
      const response = await fetch('/api/calculate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: key, signal: AbortSignal.any([controller.signal, AbortSignal.timeout(30000)]) });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(typeof data?.error === 'string' ? data.error : `The calculator returned HTTP ${response.status}.`);
      const result = checkedResponse(data);
      if (!controller.signal.aborted) { cache.set(key, structuredClone(result)); if (cache.size > 100) cache.delete(cache.keys().next().value as string); }
      return result;
    })().finally(() => { if (pending.get(key) === owned) pending.delete(key); });
    pending.set(key, entry);
  }
  clearTimeout(entry.abortTimer); entry.subscribers++;
  const response = await new Promise<CachedResponse>((resolve, reject) => {
    let done = false;
    const finish = (callback: () => void) => {
      if (done) return; done = true; options.signal?.removeEventListener('abort', onAbort);
      entry!.subscribers--;
      // A zero-delay grace period lets React StrictMode remounts reuse the call.
      if (entry!.subscribers === 0 && pending.get(key) === entry) entry!.abortTimer = setTimeout(() => { if (entry!.subscribers === 0) entry!.controller.abort(); }, 0);
      callback();
    };
    const onAbort = () => finish(() => reject(abortError()));
    options.signal?.addEventListener('abort', onAbort, { once: true });
    entry!.promise.then((value) => finish(() => resolve(value)), (error) => finish(() => reject(error)));
    if (options.signal?.aborted) onAbort();
  });
  if (options.signal?.aborted) throw abortError();
  return { ...structuredClone(response), calculatorInput, assumptions };
}

export function clearPlannerAssessmentCache() {
  cache.clear(); for (const entry of pending.values()) entry.controller.abort(); pending.clear();
}

export function plannerContext(plan: Plan, result?: PlannerResult | null): string {
  const mapped = mapping(plan);
  return JSON.stringify({ plan: plan.name, asOfAge: plan.financialInputs.age, financialInputs: plan.financialInputs,
    calculator: result ? { provider: result.provider, assessment: result.assessment, request: result.calculatorInput } : { state: 'not loaded; do not quote a coverage result' },
    assumptions: result?.assumptions ?? mapped.assumptions,
    lifeEvents: plan.lifeEvents.map(({ title, age, type, financialImpact, category, years }) => ({ title, age, type, financialImpact, category, years })),
    projectionNotice: 'Charts in the planning interface are simplified local illustrations, not CalcXML forecasts. Future events are excluded from the current CalcXML assessment. No premium quote or automatic product recommendation is provided.' });
}

/** Intake mapping returns FinancialInputs directly; unmentioned planning choices stay in base. */
export function financialInputsFromHousehold(household: Household, base: FinancialInputs = defaultInputs): FinancialInputs {
  if (!household || !household.person || !Array.isArray(household.children)) throw new Error('Bedrock did not return a complete household. Please review the intake.');
  if (household.children.length > 8 || household.children.some((child) => !Number.isFinite(child.age) || child.age < 0 || child.age > 21)) throw new Error('This planner supports up to eight children with ages from 0 to 21. Please review the dependent details rather than dropping them.');
  const n = (value: unknown, min: number, max: number, fallback: number) => typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
  const childAges = household.children.map((child) => Math.round(child.age));
  const age = Math.round(n(household.person.age, 18, 100, base.age));
  return { ...base, age, annualIncome: n(household.person.income, 0, 1e9, 0), spouse: Boolean(household.spouse), spouseIncome: n(household.spouse?.income, 0, 1e9, 0),
    children: childAges.length, childAges, youngestChildAge: childAges.length ? Math.min(...childAges) : base.youngestChildAge,
    mortgage: n(household.debts?.mortgage, 0, 1e9, 0), otherDebts: n(household.debts?.other, 0, 1e9, 0),
    savings: n(household.resources?.savings, 0, 1e9, 0), existingCoverage: n(household.resources?.existingCoverage, 0, 1e9, 0), retirementAge: Math.max(age, base.retirementAge) };
}
