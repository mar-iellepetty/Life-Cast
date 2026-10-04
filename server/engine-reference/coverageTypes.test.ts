import { describe, it, expect } from "vitest";
import { explainCoverageTypes, coverageTimeline } from "./coverageTypes";
import { DEFAULT_ASSUMPTIONS } from "./assumptions";
import type { Household } from "./types";

const household: Household = {
  person: { age: 31, income: 105000 },
  spouse: { income: 52000 },
  children: [{ name: "Daughter", age: 4 }],
  debts: { mortgage: 340000, other: 18000 },
  resources: { savings: 30000, existingCoverage: 150000 },
};

describe("explainCoverageTypes", () => {
  it("surfaces both term and permanent tradeoffs", () => {
    const exp = explainCoverageTypes(household, DEFAULT_ASSUMPTIONS);
    expect(exp.termTradeoffs.length).toBeGreaterThan(0);
    expect(exp.permanentTradeoffs.length).toBeGreaterThan(0);
  });

  it("never recommends a specific product (no 'you should buy')", () => {
    const exp = explainCoverageTypes(household, DEFAULT_ASSUMPTIONS);
    const all = (exp.summary + JSON.stringify(exp.termTradeoffs) + JSON.stringify(exp.permanentTradeoffs)).toLowerCase();
    expect(all).not.toMatch(/you should buy|we recommend buying|buy term|buy permanent/);
  });

  it("ties the horizon to the dependency horizon of the youngest child", () => {
    const exp = explainCoverageTypes(household, DEFAULT_ASSUMPTIONS);
    // youngest child age 4 -> 22-4 = 18 years, which exceeds the 10-yr floor.
    expect(exp.obligationHorizonYears).toBe(18);
  });
});

describe("coverageTimeline", () => {
  it("produces bars for income, mortgage, children, and education", () => {
    const bars = coverageTimeline(household, DEFAULT_ASSUMPTIONS);
    const labels = bars.map((b) => b.label);
    expect(labels).toContain("Income replacement");
    expect(labels).toContain("Mortgage");
    expect(labels).toContain("Children dependent");
    expect(labels).toContain("Education");
  });

  it("every bar has a non-negative duration", () => {
    const bars = coverageTimeline(household, DEFAULT_ASSUMPTIONS);
    for (const b of bars) expect(b.endAge).toBeGreaterThanOrEqual(b.startAge);
  });
});
