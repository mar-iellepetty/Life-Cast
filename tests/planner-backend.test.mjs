import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, mkdtemp } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';
import { tmpdir } from 'node:os';

// Transpile only the pure planner modules into a temporary directory, using TS.
// No browser globals or live service calls are needed by these tests.
const work = path.join(tmpdir(), 'lifecast-planner-tests');
await mkdir(work, { recursive: true });
const runtime = await mkdtemp(path.join(work, 'modules-'));
for (const name of ['lib/model', 'lib/format', 'lib/calc', 'lib/backend', 'state/store']) {
  const source = await readFile(`src/planner/${name}.ts`, 'utf8');
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } });
  const output = outputText.replace(/from (['"])(\.[^'"]+)\1/g, (_match, quote, target) => `from ${quote}${target}.mjs${quote}`);
  await mkdir(path.dirname(path.join(runtime, name)), { recursive: true });
  await writeFile(path.join(runtime, name + '.mjs'), output);
}
const backend = await import(pathToFileURL(path.join(runtime, 'lib/backend.mjs')));
const model = await import(pathToFileURL(path.join(runtime, 'lib/model.mjs')));
const calc = await import(pathToFileURL(path.join(runtime, 'lib/calc.mjs')));
const store = await import(pathToFileURL(path.join(runtime, 'state/store.mjs')));
const plan = (patch = {}, events = [], id = 'plan-a') => ({ id, name: 'My plan', financialInputs: { ...model.defaultInputs, age: 31, annualIncome: 105000, spouse: true, children: 1, youngestChildAge: 4, replacementRatio: 0.75, educationFunding: 100000, mortgage: 340000, otherDebts: 18000, savings: 30000, existingCoverage: 150000, ...patch }, lifeEvents: events, timeline: { termYears: 20, dismissedTermStarts: [] } });
const event = (type, age, amount = 0, extra = {}) => ({ id: `${type}-${age}`, type, age, title: type, financialImpact: amount, description: 'Test event', isCustom: type === 'custom', ...extra });
const providerResult = (request) => ({ provider: 'calcxml-ins01', household: request.household, assessment: { provider: 'calcxml-ins01', coverageGap: 674000, totalNeed: 1593510, totalResources: 919892, inputs: { term: request.term, desiredIncome: request.desiredIncome, beforeTaxReturn: 0.05, inflation: 0.02, includeSocsec: 'N' }, range: { low: 674000, balanced: 674000, high: 674000 }, needs: [{ id: 'immediateNeeds', label: 'Immediate needs', amount: 373000, source: 'CalcXML Ins01', explanation: 'Provider result' }], resources: [{ id: 'availableResources', label: 'Available resources', amount: 919892, source: 'CalcXML Ins01', explanation: 'Provider result' }] } });
function mockFetch(t, implementation) { const previous = globalThis.fetch; globalThis.fetch = implementation; backend.clearPlannerAssessmentCache(); t.after(() => { globalThis.fetch = previous; backend.clearPlannerAssessmentCache(); }); }

test('planner maps explicit household facts and support assumptions into calculator inputs only', () => {
  const p = plan({ spouseIncome: 52000, childAges: [4] });
  const request = backend.buildPlannerRequest(p);
  assert.equal(request.household.person.income, 105000); assert.equal(request.household.spouse.income, 52000);
  assert.equal(request.household.debts.mortgage, 340000); assert.equal(request.household.resources.existingCoverage, 150000);
  assert.equal(request.term, 18); assert.equal(request.desiredIncome, 78750); assert.equal(request.collegeNeeds, 100000);
  assert.ok(!('coverageGap' in request)); assert.ok(!('premium' in request));
  const assumed = backend.plannerAssumptions(plan()); assert.ok(assumed.some((s) => s.includes('Spouse income is assumed'))); assert.ok(assumed.some((s) => s.includes('individual ages were not supplied')));
});

test('future events cannot silently change today’s CalcXML assessment', () => {
  const p = plan({}, [event('home', 35, 500000), event('career', 34, 25), event('child', 36, 100000)]);
  assert.deepEqual(backend.buildPlannerRequest(p), backend.buildPlannerRequest(plan()));
  assert.ok(backend.plannerAssumptions(p).some((s) => s.includes('3 future events are excluded')));
  assert.match(backend.plannerContext(p), /not CalcXML forecasts/);
});

test('a zero-need timeline remains zero instead of inventing minimum coverage or premiums', () => {
  const p = plan({ age: 68, retirementAge: 68, annualIncome: 0, spouse: false, children: 0, mortgage: 0, otherDebts: 0, finalExpenses: 0, educationFunding: 0, savings: 0, existingCoverage: 0 });
  const result = calc.calculatePlan(p);
  assert.equal(result.today.estimatedCoverageNeed, 0);
  assert.equal(result.suggestedCoverage, 0);
  assert.equal(result.terms[0].coverage, 0);
  assert.ok(!('termMonthly' in result)); assert.ok(!('permanentMonthly' in result));
  assert.equal(backend.buildPlannerRequest(p).desiredIncome, 0);
});

test('active events map their units correctly without reapplying current income or using projection totals', () => {
  const p = plan({}, [event('home', 21, 300000), event('career', 30, 25), event('child', 29, 120000), event('custom', 30, 10000, { category: 'other', years: 5 })]);
  const request = backend.buildPlannerRequest(p);
  assert.equal(request.household.person.income, 105000); assert.equal(request.household.debts.mortgage, 540000);
  assert.deepEqual(request.household.children.map((c) => c.age), [4, 2]); assert.equal(request.collegeNeeds, 220000); assert.equal(request.finalExpenses, 8000); assert.equal(request.term, 20);
  const retired = backend.buildPlannerRequest(plan({}, [event('retirement', 30)])); assert.equal(retired.desiredIncome, 0); assert.equal(retired.term, 1);
});

test('cache deduplicates identical in-flight requests and is immutable to callers', async (t) => {
  let calls = 0;
  mockFetch(t, async (_url, options) => { calls++; await new Promise((r) => setTimeout(r, 5)); return Response.json(providerResult(JSON.parse(options.body))); });
  const [a, b] = await Promise.all([backend.getPlannerAssessment(plan()), backend.getPlannerAssessment(plan({}, [], 'plan-b'))]);
  assert.equal(calls, 1); a.assessment.coverageGap = 1; assert.equal(b.assessment.coverageGap, 674000);
  const cached = await backend.getPlannerAssessment(plan({}, [event('home', 45, 350000)])); assert.equal(calls, 1); assert.equal(cached.assessment.coverageGap, 674000); assert.ok(cached.assumptions.some((s) => s.includes('future event')));
});

test('cancelling one consumer does not cancel another consumer of the same request', async (t) => {
  let upstreamSignal;
  mockFetch(t, async (_url, options) => { upstreamSignal = options.signal; await new Promise((r) => setTimeout(r, 15)); return Response.json(providerResult(JSON.parse(options.body))); });
  const controller = new AbortController(); const first = backend.getPlannerAssessment(plan(), { signal: controller.signal }); const second = backend.getPlannerAssessment(plan());
  controller.abort(); await assert.rejects(first, { name: 'AbortError' }); assert.equal(upstreamSignal.aborted, false); assert.equal((await second).assessment.coverageGap, 674000);
});

test('abandoned requests abort upstream and never populate a stale cache', async (t) => {
  let calls = 0; let upstream;
  mockFetch(t, async (_url, options) => { calls++; upstream = options.signal; if (calls > 1) return Response.json(providerResult(JSON.parse(options.body))); return new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true })); });
  const controller = new AbortController(); const first = backend.getPlannerAssessment(plan(), { signal: controller.signal }); controller.abort(); await assert.rejects(first, { name: 'AbortError' });
  await new Promise((r) => setTimeout(r, 10)); assert.equal(upstream.aborted, true);
  assert.equal((await backend.getPlannerAssessment(plan())).assessment.coverageGap, 674000); assert.equal(calls, 2);
});

test('invalid responses and service failures never fall back to local estimates, and retry can refresh', async (t) => {
  let calls = 0;
  mockFetch(t, async (_url, options) => { calls++; if (calls === 1) return Response.json({ error: 'Calculator unavailable' }, { status: 503 }); if (calls === 2) return Response.json({ provider: 'calcxml-ins01', assessment: {} }); return Response.json(providerResult(JSON.parse(options.body))); });
  await assert.rejects(backend.getPlannerAssessment(plan()), /Calculator unavailable/);
  await assert.rejects(backend.getPlannerAssessment(plan()), /incomplete assessment/);
  await backend.getPlannerAssessment(plan()); await backend.getPlannerAssessment(plan(), { force: true }); assert.equal(calls, 4);
});

test('incomplete provider fields are rejected before the report can render them', async (t) => {
  const mutations = [
    (v) => { delete v.household.debts; },
    (v) => { v.assessment.inputs.inflation = null; },
    (v) => { v.assessment.range.high = Infinity; },
    (v) => { delete v.assessment.needs[0].explanation; },
  ];
  let current;
  mockFetch(t, async (_url, options) => { const value = providerResult(JSON.parse(options.body)); current(value); return Response.json(value); });
  for (const mutation of mutations) { current = mutation; await assert.rejects(backend.getPlannerAssessment(plan()), /incomplete assessment/); }
});

test('saved plans use their own namespace and reject malformed or unsafe state', () => {
  const values = new Map([['lfg-life-plans-v1', 'legacy untouched']]);
  globalThis.localStorage = { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: (key) => values.delete(key) };
  try {
    const state = { plans: [plan()], activeId: 'plan-a' }; assert.equal(store.savePlans(state), true); assert.equal(store.loadSavedPlans().plans[0].id, 'plan-a');
    for (const mutate of [
      (v) => { v.plans[0].financialInputs.annualIncome = null; },
      (v) => { v.plans[0].financialInputs.children = 50; },
      (v) => { v.activeId = 'missing'; },
      (v) => { v.plans.push(v.plans[0]); },
      (v) => { v.plans[0].lifeEvents = [event('unrecognized', 40)]; },
      (v) => { v.plans[0].timeline.termYears = 0; },
    ]) { const invalid = { ...structuredClone(state), savedAt: Date.now() }; mutate(invalid); values.set(store.STORAGE_KEY, JSON.stringify(invalid)); assert.equal(store.loadSavedPlans(), null); }
    assert.equal(store.clearSavedPlans(), true); assert.equal(values.has(store.STORAGE_KEY), false); assert.equal(values.get('lfg-life-plans-v1'), 'legacy untouched');
  } finally { delete globalThis.localStorage; }
});

test('intake preserves individual ages/spouse income and rejects silently dropping excess dependents', () => {
  const h = backend.buildPlannerRequest(plan({ children: 2, childAges: [4, 12], spouseIncome: 52000 })).household;
  const result = backend.financialInputsFromHousehold(h, { ...model.defaultInputs, incomeGrowth: 0.04 });
  assert.deepEqual(result.childAges, [4, 12]); assert.equal(result.spouseIncome, 52000); assert.equal(result.incomeGrowth, 0.04);
  assert.throws(() => backend.financialInputsFromHousehold({ ...h, children: Array.from({ length: 9 }, () => ({ name: 'Child', age: 2 })) }), /up to eight children/);
  const state = { plans: [plan({ childAges: [4] })], activeId: 'plan-a' };
  const edited = store.reducer(state, { type: 'setInputs', patch: { youngestChildAge: 5 } }); assert.equal(edited.plans[0].financialInputs.childAges, undefined);
});
