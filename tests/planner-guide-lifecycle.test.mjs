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
const stub = (code) => `data:text/javascript,${encodeURIComponent(code)}`;
const imports = {
  react: stub('export const useCallback = fn => fn; export const useEffect = () => {}; export const useSyncExternalStore = (_, get) => get();'),
  '../../api/lifecastApi': stub('export const guide = input => globalThis.__lifecastGuideTest(input);'),
  '../lib/backend': stub('export const getPlannerAssessment = async () => ({household:{}, assessment:{}, calculatorInput:{}}); export const plannerContext = p => p.id;'),
  './guide': stub('export const greeting = p => `Hello ${p?.id || "intake"}`;'),
};
let compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
for (const [from, to] of Object.entries(imports)) compiled = compiled.replace(`from '${from}'`, `from '${to}'`);
await writeFile(path.join(runtime, 'guide.mjs'), compiled);
const guide = await import(pathToFileURL(path.join(runtime, 'guide.mjs')));
after(async () => { guide.clearPlannerGuides(); delete globalThis.__lifecastGuideTest; await rm(runtime, { recursive: true, force: true }); });
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
