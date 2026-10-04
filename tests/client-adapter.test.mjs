import test from 'node:test';
import assert from 'node:assert/strict';
import { toHousehold, fromHousehold, buildCalculation, modelFromCalculation, fromBackendEvents } from '../src/lib/lifecastModel.js';
import { guide, calculate, intake, assistant } from '../src/api/lifecastApi.js';
import { CURRENT_YEAR } from '../src/lib/calcEngine.js';

const profile = { age: 36, maritalStatus: 'married', primaryIncome: 100000, spouseIncome: 42000, dependents: [4, 16], mortgage: 280000, otherDebt: 15000, savings: 50000, existingCoverage: 100000, coverageSource: 'employer' };
const household = { person: { age: 36, income: 100000 }, spouse: { income: 42000 }, children: [{ name: 'Child 1', age: 4 }, { name: 'Child 2', age: 16 }], debts: { mortgage: 280000, other: 15000 }, resources: { savings: 50000, existingCoverage: 100000 } };
const fixtureAssessment = () => ({
  provider: 'calcxml-ins01', totalNeed: 620005, totalResources: 230007, coverageGap: 390009,
  inputs: { term: 12, desiredIncome: 75000 },
  needs: [{ id: 'immediateNeeds', label: 'Immediate needs', amount: 220004, explanation: 'Returned immediate needs', formula: 'Provider result', source: 'CalcXML' }, { id: 'income', label: 'Long-term income', amount: 400001, explanation: 'Returned income needs', formula: 'Provider result', source: 'CalcXML' }],
  resources: [{ id: 'availableResources', label: 'Resources including spouse earnings', amount: 230007, explanation: 'Includes additional provider resources', source: 'CalcXML' }],
});
const jsonResponse = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

test('UI profile round-trips structured household amounts and dependents', () => {
  assert.deepEqual(toHousehold(profile), household);
  const roundTrip = fromHousehold(household);
  for (const field of ['age', 'primaryIncome', 'spouseIncome', 'dependents', 'mortgage', 'otherDebt', 'savings', 'existingCoverage', 'maritalStatus']) assert.deepEqual(roundTrip[field], profile[field]);
  assert.equal(roundTrip.coverageSource, 'unspecified', 'The structured contract does not retain the source of coverage');
  assert.equal(toHousehold({ ...profile, maritalStatus: 'single', spouseIncome: 0 }).spouse, null);
});

test('structured household is accepted without flattening financial data', () => {
  const input = structuredClone(household);
  assert.deepEqual(toHousehold(input), household);
  const snapshot = buildCalculation(input);
  snapshot.household.person.income = 1;
  assert.equal(input.person.income, 100000, 'Scenario changes must not mutate the input household');
});

test('scenario applies events chronologically and ages new children from their event year', () => {
  const events = [
    { type: 'buy_home', year: CURRENT_YEAR + 4, amount: 125000 },
    { type: 'mortgage_paid', year: CURRENT_YEAR + 3 },
    { type: 'income_down', year: CURRENT_YEAR + 2, amount: 25000 },
    { type: 'child', year: CURRENT_YEAR + 2 },
    { type: 'buy_home', year: CURRENT_YEAR + 1, amount: 320000 },
    { type: 'income_up', year: CURRENT_YEAR + 1, amount: 20000 },
  ];
  const original = structuredClone(events), result = buildCalculation(profile, events);
  assert.equal(result.household.debts.mortgage, 125000);
  assert.equal(result.household.person.income, 95000);
  assert.equal(result.household.person.age, 40);
  assert.deepEqual(result.household.children.map(child => child.age), [8, 20, 2]);
  assert.equal(result.desiredIncome, 71250);
  assert.equal(result.educationGoals, 3);
  assert.equal(result.collegeNeeds, 450000);
  assert.deepEqual(events, original);
});

test('unsupported events cannot age a household or change calculator inputs', () => {
  assert.deepEqual(buildCalculation(profile, [{ type: 'retire', year: 2050, amount: 900000 }]), buildCalculation(profile));
  const bounded = buildCalculation(profile, [{ type: 'savings_boost', year: 2999, amount: 5000 }]);
  assert.equal(bounded.scenarioYear, 2050);
  assert.ok(Number.isFinite(buildCalculation(profile, [{ type: 'savings_boost', year: Infinity, amount: 5000 }]).household.person.age));
});

test('backend events map signed income changes and discard unsupported or nonfinite amounts', () => {
  const mapped = fromBackendEvents([{ type: 'incomeChange', yearsFromNow: 3, amount: -12500 }, { type: 'newChild', yearsFromNow: 2, amount: null }, { type: 'unknown', yearsFromNow: 20, amount: 4 }]);
  assert.deepEqual(mapped, [{ type: 'income_down', year: CURRENT_YEAR + 3, amount: 12500 }, { type: 'child', year: CURRENT_YEAR + 2, amount: null }]);
  assert.deepEqual(fromBackendEvents([{ type: 'incomeChange', yearsFromNow: 2, amount: 'not-a-number' }]), []);
});

test('CalcXML assessment remains authoritative, including additional provider resources', () => {
  const request = buildCalculation(profile, [], { incomeYears: 12 });
  const assessment = fixtureAssessment(), model = modelFromCalculation({ household, assessment }, request);
  assert.equal(model.totalNeeds, 620005);
  assert.equal(model.resources, 230007, 'Do not replace provider resources with savings plus insurance');
  assert.equal(model.gap, 390009, 'Do not recalculate the authoritative provider gap');
  assert.equal(model.gapLow, assessment.coverageGap); assert.equal(model.gapHigh, assessment.coverageGap);
  assert.equal(model.resourceRows[0].value, 230007);
  assert.equal(model.needsRows[0].formula, 'Provider result');
  assert.strictEqual(model.assessment, assessment); assert.strictEqual(model.calculatorInput, request);
});

test('invalid or incomplete calculator responses are rejected instead of displayed as zero', () => {
  const request = buildCalculation(profile);
  assert.throws(() => modelFromCalculation({ assessment: { ...fixtureAssessment(), provider: 'local-formula' } }, request), /valid CalcXML/i);
  assert.throws(() => modelFromCalculation({ assessment: { ...fixtureAssessment(), coverageGap: NaN } }, request), /valid CalcXML/i);
  assert.throws(() => modelFromCalculation({ assessment: { ...fixtureAssessment(), totalResources: NaN } }, request), /valid CalcXML/i);
});

test('guide sends structured context, authoritative assessment and normalized history', async t => {
  let sent;
  t.mock.method(globalThis, 'fetch', async (url, options) => { sent = { url, body: JSON.parse(options.body), options }; return jsonResponse({ answer: 'A supported explanation.' }); });
  const request = buildCalculation(profile), assessment = fixtureAssessment();
  const result = await guide({ question: 'Explain my gap', profile, history: [{ role: 'user', content: 'Hello' }, { role: 'assistant', text: 'Hi' }], assessment, calculatorInput: request, context: 'Snapshot summary' });
  assert.equal(sent.url, '/api/guide'); assert.equal(sent.body.provider, 'bedrock');
  assert.deepEqual(sent.body.profile, household); assert.deepEqual(sent.body.assessment, assessment); assert.deepEqual(sent.body.calculatorInput, request);
  assert.deepEqual(sent.body.history, [{ role: 'user', text: 'Hello' }, { role: 'assistant', text: 'Hi' }]);
  assert.equal(sent.options.headers['Content-Type'], 'application/json'); assert.equal(result.answer, 'A supported explanation.');
});

test('intake maps the returned household and retains review guidance', async t => {
  t.mock.method(globalThis, 'fetch', async () => jsonResponse({ household }));
  const result = await intake('A household description');
  assert.equal(result.profile.primaryIncome, 100000); assert.deepEqual(result.profile.dependents, [4, 16]);
  assert.ok(result.profile.missing.length > 0);
});

test('calculator HTTP error and caller cancellation propagate to the UI', async t => {
  const stub = t.mock.method(globalThis, 'fetch', async () => jsonResponse({ error: 'Calculator unavailable. Try again.' }, 503));
  await assert.rejects(calculate(buildCalculation(profile)), /Calculator unavailable/);
  stub.mock.mockImplementation((_url, options) => new Promise((resolve, reject) => { options.signal.addEventListener('abort', () => reject(options.signal.reason), { once: true }); }));
  const controller = new AbortController(), pending = calculate(buildCalculation(profile), controller.signal); controller.abort();
  await assert.rejects(pending, error => error.name === 'AbortError');
});

test('unreadable successful responses surface an error', async t => {
  t.mock.method(globalThis, 'fetch', async () => new Response('not json', { status: 200 }));
  await assert.rejects(guide({ question: 'Hello' }), /response|read|JSON/i);
});

test('scenario extraction failure is visible and does not fabricate events', async t => {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    calls.push({ url, body: JSON.parse(options.body) });
    return url === '/api/events' ? jsonResponse({ error: 'Extraction unavailable' }, 502) : jsonResponse({ reply: 'Your calculator assessment remains available.' });
  });
  const model = modelFromCalculation({ household, assessment: fixtureAssessment() }, buildCalculation(profile));
  const result = await assistant({ mode: 'query', question: 'What if I buy a home?', model });
  assert.deepEqual(result.events, []); assert.match(result.answer, /couldn't update the timeline/);
  assert.deepEqual(calls[0].body.assessment, model.assessment); assert.equal(calls[1].url, '/api/events');
});
