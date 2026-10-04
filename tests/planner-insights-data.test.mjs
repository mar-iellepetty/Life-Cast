import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

async function pureModule(name) {
  const source = await readFile(`src/planner/lib/${name}.ts`, 'utf8');
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } });
  return import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
}
const health = await pureModule('appleHealth');
const model = await pureModule('model');
const date = new Date(Date.now() - 86400000).toISOString();
const record = (steps) => `<Record type="HKQuantityTypeIdentifierStepCount" startDate="${date}" value="${steps}"/>`;
const xml = `<HealthData>${record(250)}${record(750)}</HealthData>`;
const encoder = new TextEncoder();
function exportFile(chunks, callbacks = {}) {
  let next = 0;
  return {
    name: 'export.xml', type: 'text/xml', size: chunks.reduce((sum, chunk) => sum + chunk.length, 0),
    stream: () => new ReadableStream({
      pull(controller) {
        if (next < chunks.length) controller.enqueue(encoder.encode(chunks[next++]));
        else if (!callbacks.keepOpen) controller.close();
      },
      cancel: callbacks.cancel,
    }),
  };
}

test('Apple Health records survive every chunk split inside their opening prefix', async () => {
  const start = xml.indexOf('<Record ');
  for (let split = 1; split < '<Record '.length; split++) {
    const at = start + split;
    const result = await health.readAppleHealthExport(exportFile([xml.slice(0, at), xml.slice(at)]));
    assert.equal(result.avgDailySteps, 1000, `split at prefix character ${split}`);
  }
  assert.equal((await health.readAppleHealthExport(exportFile([...xml]))).avgDailySteps, 1000, 'single-character chunks retain all records');
});

test('Apple Health reader cancels pending streams on abort or parsing failure', async () => {
  let cancelled = false;
  const controller = new AbortController();
  const reading = health.readAppleHealthExport(exportFile(['<HealthData>'], { keepOpen: true, cancel: () => { cancelled = true; } }), undefined, controller.signal);
  await new Promise(resolve => setImmediate(resolve));
  controller.abort();
  await assert.rejects(reading, { name: 'AbortError' });
  assert.equal(cancelled, true);

  cancelled = false;
  await assert.rejects(health.readAppleHealthExport(exportFile(['<Record ' + 'x'.repeat(65536)], { keepOpen: true, cancel: () => { cancelled = true; } })), /unreadable record/);
  assert.equal(cancelled, true);
});

const adjustment = () => ({ percent: -3, headline: 'Activity lowered the illustrative plan by 3%.', reasons: ['Regular activity'], at: new Date().toISOString(), metrics: { days: 90, avgDailySteps: 9100 }, sample: true });
const plan = () => ({ id: 'test', name: 'My plan', financialInputs: { ...model.defaultInputs }, lifeEvents: [], timeline: { termYears: 20, dismissedTermStarts: [] }, adjustments: { health: adjustment() } });

test('saved insight adjustments validate all rendered fields and finite percentages', () => {
  assert.equal(model.isValidPlan(plan()), true);
  for (const change of [
    value => { value.adjustments = null; },
    value => { value.adjustments.health.percent = 'broken'; },
    value => { value.adjustments.health.percent = NaN; },
    value => { value.adjustments.health.percent = 11; },
    value => { value.adjustments.health.headline = {}; },
    value => { delete value.adjustments.health.reasons; },
    value => { value.adjustments.health.reasons = [{}]; },
    value => { value.adjustments.health.hazards = [{ label: null, rating: 'High' }]; },
    value => { value.adjustments.health.metrics.avgDailySteps = Infinity; },
    value => { value.adjustments.health.metrics.toString = 1; },
    value => { value.adjustments.health.sample = {}; },
    value => { value.adjustments.health.at = 'invalid date'; },
    value => { value.adjustments.location = { ...adjustment(), percent: -1 }; },
    value => { value.adjustments.health.source = { name: 'FEMA', url: 'javascript:alert(1)' }; },
  ]) {
    const value = plan(); change(value);
    assert.equal(model.isValidPlan(value), false);
  }
  const valid = plan();
  valid.adjustments.location = { percent: 5, headline: 'The illustrative plan rose by 5%.', reasons: [], at: new Date().toISOString(), county: 'Miami-Dade, FL', hazards: [{ label: 'Hurricane', rating: 'Very High' }], source: { name: 'FEMA National Risk Index', url: 'https://hazards.fema.gov/nri/', version: 'December 2025' } };
  assert.equal(model.isValidPlan(valid), true);
  assert.equal(model.adjustmentPercent(valid), 2);
});

test('saved AI event explanations reject non-text summaries before rendering', () => {
  const value = plan();
  value.lifeEvents = [{ ...model.makeEvent('home', 42), ai: { status: 'ready', summary: 'A future home purchase.' } }];
  assert.equal(model.isValidPlan(value), true);
  value.lifeEvents[0].ai.summary = {};
  assert.equal(model.isValidPlan(value), false);
});
