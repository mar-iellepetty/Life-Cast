import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';

// Render the actual TSX with React's server renderer; no provider calls or
// browser globals are needed to verify the amounts and explanations users see.
const uri = source => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const compile = source => ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
const imports = {
  react: import.meta.resolve('react'),
  'react/jsx-runtime': import.meta.resolve('react/jsx-runtime'),
  '../lib/format': uri(compile(await readFile('src/planner/lib/format.ts', 'utf8'))),
};
let compiled = compile(await readFile('src/planner/components/SimpleMath.tsx', 'utf8'));
for (const [from, to] of Object.entries(imports)) {
  compiled = compiled.replaceAll(`from '${from}'`, `from '${to}'`).replaceAll(`from "${from}"`, `from "${to}"`);
}
const { SimpleMath } = await import(uri(compiled));

function render({ needs = [100400, 100400], resources = 100600, gap = 100000, college = 0, savings = 0 } = {}) {
  const household = { person: { age: 35, income: 60000 }, spouse: null, children: [], debts: { mortgage: 0, other: 0 }, resources: { savings, existingCoverage: 0 } };
  const assessment = {
    coverageGap: gap,
    needs: needs.map((amount, index) => ({ id: index === 0 ? 'immediateNeeds' : 'income', amount })),
    resources: [{ id: 'availableResources', amount: resources }],
  };
  const calculatorInput = { household, term: 20, desiredIncome: 45000, collegeNeeds: college, funeral: 15000, finalExpenses: 0 };
  return renderToStaticMarkup(createElement(SimpleMath, { result: { assessment, household, calculatorInput }, assumptions: [] }));
}
const finalAmount = html => html.match(/class="kid-circled">([^<]+)/)?.[1];
const lineAmounts = html => [...html.matchAll(/class="kid-amount">([^<]+)/g)].map(match => match[1]);

test('provider lines retain their amounts and a rounded subtotal never replaces the returned gap', () => {
  const html = render();
  assert.deepEqual(lineAmounts(html), ['+$100,400', '+$100,400', '−$100,600']);
  assert.match(html, /So far: \$200,800/);
  assert.match(html, /So far: \$100,200/);
  assert.equal(finalAmount(html), '$100,000');
  assert.match(html, /role="note"[^>]*>The line-item subtotal is \$100,200/);
  assert.match(html, /a difference of \$200/);
  assert.match(html, /final estimate below keeps the coverage gap returned by CalcXML/);
  assert.doesNotMatch(html, /nearest \$1,000|difference is (?:due to )?rounding/);
});

test('a small positive provider gap cannot become a false zero after line rounding', () => {
  const html = render({ resources: 200200, gap: 1000 });
  assert.match(html, /So far: \$600/);
  assert.equal(finalAmount(html), '$1,000');
  assert.match(html, /a difference of \$400/);
  assert.doesNotMatch(html, /covers everything|no additional coverage gap/);
});

test('the recorded CalcXML sample preserves the returned result and discloses its $382 difference', () => {
  const html = render({ needs: [373000, 1220510], resources: 919892, gap: 674000 });
  assert.deepEqual(lineAmounts(html), ['+$373,000', '+$1,220,510', '−$919,892']);
  assert.equal(finalAmount(html), '$674,000');
  assert.match(html, /subtotal is \$673,618/);
  assert.match(html, /a difference of \$382/);
});

test('a zero provider gap with a surplus explains the zero floor without negative coverage', () => {
  const html = render({ needs: [100400, 100400], resources: 225800, gap: 0 });
  assert.equal(finalAmount(html), '$0');
  assert.match(html, /So far: -\$25,000/);
  assert.match(html, /line items leave a surplus of \$25,000/);
  assert.match(html, /surplus is not a negative insurance need/);
  assert.match(html, /CalcXML reports no additional coverage gap/);
});

test('zero gap with a positive subtotal remains explicit about the difference', () => {
  const html = render({ resources: 200200, gap: 0 });
  assert.equal(finalAmount(html), '$0');
  assert.match(html, /subtotal is \$600/);
  assert.match(html, /a difference of \$600/);
  assert.doesNotMatch(html, /covers everything|leave a surplus/);
});

test('matching amounts, including cents, need no reconciliation notice', () => {
  const html = render({ needs: [100400.25, 100400.5], resources: 100600, gap: 100200.75 });
  assert.deepEqual(lineAmounts(html), ['+$100,400.25', '+$100,400.5', '−$100,600']);
  assert.equal(finalAmount(html), '$100,200.75');
  assert.doesNotMatch(html, /role="note"/);
  const zero = render({ needs: [0, 0], resources: 0, gap: 0 });
  assert.equal(finalAmount(zero), '$0');
  assert.doesNotMatch(zero, /role="note"/);
});

test('college funding is a planned obligation even when no savings exist', () => {
  const html = render({ college: 100000, savings: 0 });
  assert.match(html, /\$100,000 of planned college funding/);
  assert.doesNotMatch(html, /saved for college|savings \(/);
  const funded = render({ college: 100000, savings: 30000 });
  assert.match(funded, /\$100,000 of planned college funding/);
  assert.match(funded, /savings \(\$30,000\)/);
});
