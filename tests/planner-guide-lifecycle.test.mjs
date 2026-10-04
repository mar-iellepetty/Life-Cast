import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

// Exercise the real shared-store implementation with provider and React hook
// adapters only. Browser tests separately cover subscription/unmount behavior.
const runtime = await mkdtemp(path.join(tmpdir(), 'lifecast-guide-tests-'));
const source = await readFile('src/planner/agent/lincoln.ts', 'utf8');
const stub = (code) => `data:text/javascript,${encodeURIComponent(code).replaceAll("'", '%27')}`;
const viewModule = stub(ts.transpileModule(await readFile('src/planner/lib/reviewContext.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText);
const view = await import(viewModule);
const imports = {
  react: stub('export const useCallback = fn => fn; export const useEffect = fn => { if (globalThis.__runGuideEffects) fn(); }; export const useSyncExternalStore = (_, get) => get();'),
  '../../api/lifecastApi': stub('export const guide = input => globalThis.__lifecastGuideTest(input);'),
  '../lib/backend': stub('export const getPlannerAssessment = async () => ({household:{}, assessment:globalThis.__lifecastAssessmentTest ?? {}, calculatorInput:{}}); export const plannerContext = p => p.id;'),
  './guide': stub('export const greeting = p => `Hello ${p?.id || "intake"}`;'),
  '../lib/reviewContext': viewModule,
};
let compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
for (const [from, to] of Object.entries(imports)) compiled = compiled.replace(`from '${from}'`, `from '${to}'`);
await writeFile(path.join(runtime, 'guide.mjs'), compiled);
const guide = await import(pathToFileURL(path.join(runtime, 'guide.mjs')));
after(async () => { guide.clearPlannerGuides(); delete globalThis.__lifecastGuideTest; delete globalThis.__runGuideEffects; await rm(runtime, { recursive: true, force: true }); });
const plan = id => ({ id, financialInputs: {}, lifeEvents: [], timeline: {} });
function setup(t, reply = input => ({ answer: `Answer for ${input.question}` })) {
  guide.clearPlannerGuides(); const calls = [];
  globalThis.__lifecastGuideTest = async input => { calls.push(input); return reply(input); };
  t.after(() => guide.clearPlannerGuides()); return calls;
}

test('chat transcripts and total private session retention stay bounded', async t => {
  setup(t, () => ({ answer: 'A'.repeat(2000) }));
  const p = plan('long-chat');
  for (let i = 0; i < 80; i++) await guide.askPlannerGuide(p, `Question ${i}`);
  const { messages } = guide.usePlannerGuide(p);
  assert.ok(messages.length <= 60);
  assert.ok(messages.reduce((n, m) => n + m.text.length, 0) <= 60000);
  assert.equal(messages.at(-2).text, 'Question 79');
  const calls = setup(t);
  for (let i = 0; i < 45; i++) await guide.askPlannerGuide(plan(`plan-${i}`), `Private ${i}`);
  await guide.askPlannerGuide(plan('plan-0'), 'A fresh question');
  assert.deepEqual(calls.at(-1).history, [], 'old inactive sessions are evicted');
  await guide.askPlannerGuide(plan('plan-44'), 'Continue recent');
  assert.ok(calls.at(-1).history.some(m => m.text === 'Private 44'));
});

test('a deleted plan loses chat and other plans never receive its history', async t => {
  const calls = setup(t); const a = plan('a'), b = plan('b');
  await guide.askPlannerGuide(a, 'Private household A');
  await guide.askPlannerGuide(b, 'Private household B');
  assert.deepEqual(calls.at(-1).history, []);
  guide.forgetPlannerGuide('a');
  await guide.askPlannerGuide(a, 'New household A');
  assert.deepEqual(calls.at(-1).history, []);
  await guide.askPlannerGuide(b, 'Continue B');
  assert.ok(calls.at(-1).history.every(m => !m.text.includes('household A')));
});

test('reset aborts in-flight answers and stale completion cannot recreate private state', async t => {
  let release, signal;
  setup(t, input => { signal = input.signal; return new Promise(resolve => { release = resolve; }); });
  const p = plan('reset'); const pending = guide.askPlannerGuide(p, 'Do not retain this');
  await new Promise(resolve => setImmediate(resolve));
  guide.clearPlannerGuides(); assert.equal(signal.aborted, true);
  release({ answer: 'Late private answer' });
  await assert.rejects(pending, { name: 'AbortError' });
  assert.ok(guide.usePlannerGuide(p).messages.every(m => !m.text.includes('private answer')));
});

test('oversized questions are rejected before a provider request', async t => {
  const calls = setup(t);
  await assert.rejects(guide.askPlannerGuide(plan('a'), 'x'.repeat(4001)), /4,000 characters/);
  assert.equal(calls.length, 0);
});

const displayedReview = {
  suggestion: { years: 25, amount: 1500000, untilAge: 63, lasting: false, fromCalcXml: true, reasons: ['Most modeled need ends at age 61.'] },
  comparisonStatus: 'ready', ageGroup: '35–44',
  standing: [{ key: 'avg', coverage: 209000, need: 1280000, pct: 16, gap: 1071000 }, { key: 'plan', coverage: 1750000, need: 1743000, pct: 100, gap: 0 }],
  finances: [{ label: 'Coverage gap (CalcXML)', yours: 1493000, theirs: 1071000 }],
  sources: [{ name: 'Test source', url: 'https://example.com/source' }],
};
const displayedData = input => JSON.parse(input.context.split('\nCurrent displayed review (a separate illustration where labelled):\n').at(-1));

test('review questions send the exact displayed suggestion and benchmark without recomputing them', async t => {
  const calls = setup(t), p = plan('review');
  const currentAssessment = { coverageGap: 1493000 };
  globalThis.__lifecastAssessmentTest = currentAssessment;
  t.after(() => { delete globalThis.__lifecastAssessmentTest; });
  const viewContext = view.reviewGuideContext(p, currentAssessment, displayedReview);
  await guide.askPlannerGuide(p, 'Why this term length?', { viewContext });
  await guide.askPlannerGuide(p, 'How do I compare to the benchmark?', { viewContext });
  const data = displayedData(calls.at(-1));
  assert.equal(data.suggestion.years, displayedReview.suggestion.years);
  assert.equal(data.suggestion.amount, displayedReview.suggestion.amount);
  assert.equal(data.suggestion.untilAge, displayedReview.suggestion.untilAge);
  assert.deepEqual(data.suggestion.reasons, displayedReview.suggestion.reasons);
  assert.deepEqual(data.comparison.standing, displayedReview.standing);
  assert.equal(data.currentHousehold.coverageGap, 1493000);
  assert.equal(data.comparison.standing.find(row => row.key === 'plan').gap, 0);
  assert.match(data.currentHousehold.label, /before buying any suggested policy/);
  assert.match(data.comparison.scenarioMeanings.plan, /if you add the suggested policy/);
  assert.match(data.comparison.scenarioMeanings.avg, /not an observed household or actual peers/);
  assert.deepEqual(data.comparison.finances, displayedReview.finances);
  assert.match(data.suggestion.termSource, /not a CalcXML term recommendation/);
  assert.match(data.comparison.calculationNotice, /hypothetical additional coverage/);
  assert.ok(calls.every(input => input.context.length <= 20000));
});

test('missing or changed current assessments and contexts from other plans never reach Bedrock', async t => {
  const calls = setup(t), a = plan('a'), b = plan('b');
  const current = view.reviewGuideContext(a, {}, displayedReview);
  await assert.rejects(guide.askPlannerGuide(b, 'Why this term?', { viewContext: current }), /earlier plan/);
  const edited = { ...a, financialInputs: { age: 45 } };
  await assert.rejects(guide.askPlannerGuide(edited, 'Why this term?', { viewContext: current }), /earlier plan/);
  const unavailable = view.reviewGuideContext(a, null, displayedReview);
  await assert.rejects(guide.askPlannerGuide(a, 'Why this term?', { viewContext: unavailable }), /unavailable/);
  const staleAssessment = view.reviewGuideContext(a, { coverageGap: 99 }, displayedReview);
  await assert.rejects(guide.askPlannerGuide(a, 'Why this term?', { viewContext: staleAssessment }), /assessment changed/i);
  assert.equal(calls.length, 0);
});

test('an unavailable benchmark sends no stale comparison rows and remains explicitly unavailable', async t => {
  const calls = setup(t), p = plan('unavailable-benchmark');
  const viewContext = view.reviewGuideContext(p, {}, { ...displayedReview, comparisonStatus: 'unavailable', finances: [] });
  await guide.askPlannerGuide(p, 'How do I compare to the benchmark?', { viewContext });
  const data = displayedData(calls[0]);
  assert.equal(data.comparison.status, 'unavailable');
  assert.deepEqual(data.comparison.standing, []);
  assert.equal(data.suggestion.amount, displayedReview.suggestion.amount);
  assert.doesNotMatch(calls[0].context, /1280000|1071000/);
});

test('changing displayed review results cancels an answer and rejects its late completion', async t => {
  let release, signal;
  const p = plan('refreshing-review');
  setup(t, input => { signal = input.signal; return new Promise(resolve => { release = resolve; }); });
  globalThis.__runGuideEffects = true;
  t.after(() => { delete globalThis.__runGuideEffects; });
  const current = view.reviewGuideContext(p, {}, displayedReview);
  const chat = guide.usePlannerGuide(p, current);
  const pending = chat.ask('How do I compare?');
  await new Promise(resolve => setImmediate(resolve));
  const changed = view.reviewGuideContext(p, {}, { ...displayedReview, comparisonStatus: 'unavailable' });
  guide.usePlannerGuide(p, changed);
  assert.equal(signal.aborted, true);
  release({ answer: 'Outdated benchmark answer' });
  await assert.rejects(pending, { name: 'AbortError' });
  assert.ok(guide.usePlannerGuide(p, changed).messages.every(message => !message.text.includes('Outdated benchmark answer')));
});

test('equivalent review snapshots keep the current answer running', async t => {
  let release, signal;
  const p = plan('stable-review');
  setup(t, input => { signal = input.signal; return new Promise(resolve => { release = resolve; }); });
  globalThis.__runGuideEffects = true;
  t.after(() => { delete globalThis.__runGuideEffects; });
  const chat = guide.usePlannerGuide(p, view.reviewGuideContext(p, {}, displayedReview));
  const pending = chat.ask('Why this term length?');
  await new Promise(resolve => setImmediate(resolve));
  guide.usePlannerGuide(structuredClone(p), view.reviewGuideContext(p, {}, structuredClone(displayedReview)));
  assert.equal(signal.aborted, false);
  release({ answer: 'The displayed term is 25 years.' });
  assert.equal(await pending, 'The displayed term is 25 years.');
});

test('review context exceeding the server limit fails before a provider call', async t => {
  const calls = setup(t), p = plan('too-large');
  const viewContext = view.reviewGuideContext(p, {}, { ...displayedReview, suggestion: { ...displayedReview.suggestion, reasons: ['x'.repeat(20000)] } });
  await assert.rejects(guide.askPlannerGuide(p, 'Explain', { viewContext }), /too much detail/);
  assert.equal(calls.length, 0);
});
