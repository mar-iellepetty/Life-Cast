import { describe, it, expect } from "vitest";
import { calculateNeeds } from "./calculate";
import { DEFAULT_ASSUMPTIONS } from "./assumptions";
// @ts-expect-error plain ESM
import { futureValue, presentValue, futureValueOfSavings, monthsToPayoff } from "./finance.mjs";
import type { Household } from "./types";

// ---------------------------------------------------------------------------
// Accuracy pins: these assert the engine matches the standard DIME methodology
// with hand-computed numbers, so results are independently verifiable.
// ---------------------------------------------------------------------------

describe("DIME needs methodology — hand-verified", () => {
  it("matches a hand calculation for the demo scenario", () => {
    const h: Household = {
      person: { age: 31, income: 105000 },
      spouse: { income: 52000 },
      children: [{ name: "Daughter", age: 4 }],
      debts: { mortgage: 340000, other: 18000 },
      resources: { savings: 30000, existingCoverage: 150000 },
    };
    const r = calculateNeeds(h);

    // Income: horizon = max(10, 22-4=18) = 18 yrs; factor 1.0 => 105000*18
    expect(r.needs.find((n) => n.id === "income")!.amount).toBe(1890000);
    expect(r.needs.find((n) => n.id === "mortgage")!.amount).toBe(340000);
    expect(r.needs.find((n) => n.id === "education")!.amount).toBe(100000);
    expect(r.needs.find((n) => n.id === "otherDebt")!.amount).toBe(18000);
    expect(r.needs.find((n) => n.id === "finalExpenses")!.amount).toBe(15000);

    // Totals
    expect(r.totalNeed).toBe(2363000);
    expect(r.totalResources).toBe(180000);
    expect(r.coverageGap).toBe(2183000);
  });

  it("uses the 10-year floor when there are no young children", () => {
    const h: Household = {
      person: { age: 45, income: 80000 },
      spouse: null,
      children: [],
      debts: { mortgage: 0, other: 0 },
      resources: { savings: 0, existingCoverage: 0 },
    };
    const r = calculateNeeds(h);
    // 80000 * 10 + final expenses 15000
    expect(r.needs.find((n) => n.id === "income")!.amount).toBe(800000);
    expect(r.totalNeed).toBe(815000);
  });

  it("respects a custom income replacement factor and years", () => {
    const h: Household = {
      person: { age: 50, income: 100000 },
      spouse: null,
      children: [],
      debts: { mortgage: 0, other: 0 },
      resources: { savings: 0, existingCoverage: 0 },
    };
    const r = calculateNeeds(h, {
      ...DEFAULT_ASSUMPTIONS,
      incomeReplacementYears: 5,
      incomeReplacementFactor: 0.6,
      finalExpenses: 0,
    });
    // 100000 * 0.6 * 5 = 300000
    expect(r.coverageGap).toBe(300000);
  });

  it("optional discounting lowers the income figure below the simple product", () => {
    const h: Household = {
      person: { age: 40, income: 100000 },
      spouse: null,
      children: [],
      debts: { mortgage: 0, other: 0 },
      resources: { savings: 0, existingCoverage: 0 },
    };
    const simple = calculateNeeds(h).needs.find((n) => n.id === "income")!.amount;
    const discounted = calculateNeeds(h, { ...DEFAULT_ASSUMPTIONS, discountFutureIncome: true }).needs.find(
      (n) => n.id === "income",
    )!.amount;
    expect(discounted).toBeLessThan(simple);
  });
});

describe("standard finance formulas — verifiable", () => {
  it("future value of a lump sum: $5,000 at 7% for 10 yrs ≈ $9,835.76", () => {
    expect(futureValue(5000, 0.07, 10)).toBeCloseTo(9835.76, 1);
  });

  it("present value is the inverse of future value", () => {
    const fv = futureValue(1000, 0.05, 8);
    expect(presentValue(fv, 0.05, 8)).toBeCloseTo(1000, 6);
  });

  it("savings plan: $200/mo at 0% for 12 mo + $1000 start = $3,400", () => {
    expect(futureValueOfSavings(200, 0, 12, 1000)).toBe(3400);
  });

  it("debt payoff: $0 balance pays off in 0 periods; underwater payment is Infinity", () => {
    expect(monthsToPayoff(0, 0.01, 100)).toBe(0);
    expect(monthsToPayoff(10000, 0.01, 50)).toBe(Infinity);
  });
});
