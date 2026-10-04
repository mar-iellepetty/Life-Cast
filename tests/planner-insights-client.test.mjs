import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
const uri = code => `data:text/javascript,${encodeURIComponent(code)}`;
const compile = source => ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
const coverage = await import(uri(compile(await readFile('src/planner/lib/coverageSuggestion.ts', 'utf8'))));
test('zero CalcXML gap takes precedence over a positive illustrative estimate', () => {
  assert.equal(coverage.suggestedAdditionalCoverage(0, 500000), 0);
  assert.equal(coverage.suggestedAdditionalCoverage(1, 500000), 50000);
  assert.equal(coverage.suggestedAdditionalCoverage(1493000, 500000), 1500000);
  assert.equal(coverage.suggestedAdditionalCoverage(null, 0), 0);
});

// Run the actual card handlers with hook and provider adapters; a late provider
// completion is deliberately allowed even after abort to exercise the UI guard.
const adapters = {
  react: uri('export const useRef = value => ({current:value}); export const useState = value => [value,()=>{}]; export const useEffect = effect => { globalThis.__insightCleanups.push(effect()); };'),
  'react/jsx-runtime': uri('export const Fragment = "fragment"; export const jsx = (type,props) => ({type,props}); export const jsxs = jsx;'),
  '../lib/appleHealth': uri('export const SAMPLE_HEALTH = {days:90,avgDailySteps:9000}; export const readAppleHealthExport = async () => SAMPLE_HEALTH;'),
  '../lib/insights': uri('export const reviewHealth = (...args) => globalThis.__insightRequest("health",...args); export const reviewLocation = (...args) => globalThis.__insightRequest("location",...args);'),
};
let source = compile(`${await readFile('src/planner/components/InsightCards.tsx', 'utf8')}\nexport {HealthCard, LocationCard};`);
for (const [key, value] of Object.entries(adapters)) source = source.replaceAll(`from '${key}'`, `from '${value}'`).replaceAll(`from "${key}"`, `from "${value}"`);
const cards = await import(uri(source));
const walk = (node, predicate) => {
  if (!node || typeof node !== 'object') return null;
  if (predicate(node)) return node;
  for (const child of [node.props?.children].flat(Infinity)) { const found = walk(child, predicate); if (found) return found; }
  return null;
};
const tick = () => new Promise(resolve => setImmediate(resolve));
for (const kind of ['health','location']) test(`${kind} request is aborted and late results ignored when leaving its plan`, async t => {
  globalThis.__insightCleanups = [];
  let release, signal;
  const changes = [];
  globalThis.__insightRequest = (_kind, ...args) => { signal=args.at(-1); return new Promise(resolve => {release=resolve;}); };
  t.after(() => { delete globalThis.__insightCleanups; delete globalThis.__insightRequest; });
  const tree = kind === 'health' ? cards.HealthCard({onChange:value=>changes.push(value)}) : cards.LocationCard({initial:'Boston, MA',onChange:value=>changes.push(value),onLocation:value=>changes.push(value)});
  if (kind === 'health') walk(tree, node => node.type==='button' && node.props.children==='Try sample data').props.onClick();
  await tick();
  assert.ok(signal instanceof AbortSignal);
  for (const cleanup of globalThis.__insightCleanups) cleanup?.();
  assert.equal(signal.aborted,true);
  release({percent:5,headline:'Old household',reasons:[]});
  await tick();
  assert.deepEqual(changes,[]);
});
