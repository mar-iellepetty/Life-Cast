import test from "node:test";
import assert from "node:assert/strict";
import { buildIns01Request, calculateWithCalcXml, normalizeIns01Response } from "../server/calcxml.mjs";

const household = { person: { age: 35, income: 0 }, spouse: null, children: [], debts: { mortgage: 0, other: 0 }, resources: { savings: 0, existingCoverage: 0 } };
const request = buildIns01Request({ household, funeral: 0, finalExpenses: 0, collegeNeeds: 0 });
const zero = { immediateNeeds: 0, longtermNeeds: 0, totalNeeds: 0, totalResources: 0, lifeInsuranceNeeded: 0 };

test("numeric and currency-string zero assessments remain valid, including the fetched provider response", async () => {
  for (const raw of [zero, Object.fromEntries(Object.keys(zero).map((key) => [key, "$0"]))]) {
    const result = normalizeIns01Response(raw, household, request);
    assert.equal(result.coverageGap, 0); assert.equal(result.totalNeed, 0); assert.deepEqual(result.range, { low: 0, balanced: 0, high: 0 });
  }
  const original = globalThis.fetch;
  globalThis.fetch = async () => Response.json(zero);
  try { assert.equal((await calculateWithCalcXml({ household })).assessment.coverageGap, 0); }
  finally { globalThis.fetch = original; }
});

test("surplus coverage can never turn a signed negative need into positive insurance need", () => {
  for (const amount of [-50000, "-$50,000", "$-50,000", "($50,000)"]) {
    const result = normalizeIns01Response({ ...zero, lifeInsuranceNeeded: amount, totalResources: "$10,769,892" }, household, request);
    assert.equal(result.coverageGap, 0); assert.equal(result.totalResources, 10769892);
  }
});

test("missing, non-finite and malformed required amounts fail instead of fabricating zeros", () => {
  for (const key of Object.keys(zero)) {
    const missing = { ...zero }; delete missing[key];
    assert.throws(() => normalizeIns01Response(missing, household, request), /missing or invalid/);
    for (const invalid of [null, "", " ", false, true, {}, [], NaN, Infinity, -Infinity, "NaN", "$Infinity", "Provider error", "$1,23", "$--50", "1e309"]) {
      assert.throws(() => normalizeIns01Response({ ...zero, [key]: invalid }, household, request), /missing or invalid/);
    }
  }
});

test("known authoritative sample amounts stay unchanged", () => {
  const raw = { immediateNeeds: "$373,000", longtermNeeds: "$1,220,510", totalNeeds: "$1,593,510", totalResources: "$919,892", lifeInsuranceNeeded: "$674,000" };
  const result = normalizeIns01Response(raw, household, request);
  assert.equal(result.coverageGap, 674000); assert.equal(result.totalNeed, 1593510); assert.equal(result.totalResources, 919892);
});
