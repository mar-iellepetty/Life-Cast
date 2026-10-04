import { describe, it, expect } from "vitest";
import {
  calculateNeeds,
  presentValueOfAnnuity,
  dependencyHorizonYears,
} from "./calculate";
import { DEFAULT_ASSUMPTIONS } from "./assumptions";
import { applyEvents } from "./events";
import { diffAssessments } from "./diff";
import type { Household } from "./types";

// The scenario from the LifeCast concept pitch.
const sampleHousehold: Household = {
  person: { age: 31, income: 105000 },
  spouse: { income: 52000 },
  children: [{ name: "Daughter", age: 4 }],
  debts: { mortgage: 340000, other: 18000 },
  resources: { savings: 30000, existingCoverage: 150000 },
};

describe("presentValueOfAnnuity", () => {
  it("returns payment x years when rate is ~0", () => {
    expect(presentValueOfAnnuity(1000, 10, 0)).toBeCloseTo(10000, 5);
  });

  it("discounts future payments below their nominal sum", () => {
    const pv = presentValueOfAnnuity(1000, 10, 0.05);
    expect(pv).toBeLessThan(10000);
    expect(pv).toBeGreaterThan(7000);
  });

  it("returns 0 for non-positive years or payment", () => {
    expect(presentValueOfAnnuity(0, 10, 0.03)).toBe(0);
    expect(presentValueOfAnnuity(1000, 0, 0.03)).toBe(0);
  });
});

describe("dependencyHorizonYears", () => {
  it("uses the assumption floor when children are already independent", () => {
    const h: Household = {
      ...sampleHousehold,
      children: [{ name: "Adult", age: 25 }],
    };
    expect(dependencyHorizonYears(h, DEFAULT_ASSUMPTIONS)).toBe(
      DEFAULT_ASSUMPTIONS.incomeReplacementYears,
    );
  });

  it("extends to cover the youngest child reaching independence", () => {
    const h: Household = {
      ...sampleHousehold,
      children: [{ name: "Baby", age: 0 }],
    };
    // 22 - 0 = 22 years, which exceeds the 10-year floor.
    expect(dependencyHorizonYears(h, DEFAULT_ASSUMPTIONS)).toBe(22);
  });
});

describe("calculateNeeds", () => {
  it("is deterministic: same input yields identical output", () => {
    const a = calculateNeeds(sampleHousehold);
    const b = calculateNeeds(sampleHousehold);
    expect(a).toEqual(b);
  });

  it("produces every expected need line item for the sample household", () => {
    const result = calculateNeeds(sampleHousehold);
    const ids = result.needs.map((n) => n.id).sort();
    expect(ids).toEqual(
      ["education", "finalExpenses", "income", "mortgage", "otherDebt"].sort(),
    );
  });

  it("offsets the need with savings and existing coverage", () => {
    const result = calculateNeeds(sampleHousehold);
    expect(result.totalResources).toBe(30000 + 150000);
    expect(result.coverageGap).toBe(
      Math.max(0, result.totalNeed - result.totalResources),
    );
  });

  it("every line item carries an explanation and a formula", () => {
    const result = calculateNeeds(sampleHousehold);
    for (const n of result.needs) {
      expect(n.explanation.length).toBeGreaterThan(0);
      expect(n.formula.length).toBeGreaterThan(0);
      expect(n.source.length).toBeGreaterThan(0);
    }
  });

  it("never returns a negative coverage gap", () => {
    const wealthy: Household = {
      ...sampleHousehold,
      resources: { savings: 5_000_000, existingCoverage: 0 },
    };
    expect(calculateNeeds(wealthy).coverageGap).toBe(0);
  });

  it("produces a range where low <= balanced <= high", () => {
    const { range } = calculateNeeds(sampleHousehold);
    expect(range.low).toBeLessThanOrEqual(range.balanced);
    expect(range.high).toBeGreaterThanOrEqual(range.balanced);
  });

  it("mortgage line equals the entered balance", () => {
    const result = calculateNeeds(sampleHousehold);
    const mortgage = result.needs.find((n) => n.id === "mortgage");
    expect(mortgage?.amount).toBe(340000);
  });
});

describe("applyEvents + Future Fork", () => {
  it("adding a child increases the modeled need", () => {
    const before = calculateNeeds(sampleHousehold);
    const after = calculateNeeds(
      applyEvents(sampleHousehold, [
        { id: "e1", type: "newChild", year: 2029, label: "Another Child", icon: "👶" },
      ]),
    );
    expect(after.totalNeed).toBeGreaterThan(before.totalNeed);
  });

  it("losing employer coverage widens the gap", () => {
    const before = calculateNeeds(sampleHousehold);
    const after = calculateNeeds(
      applyEvents(sampleHousehold, [
        { id: "e2", type: "loseCoverage", year: 2027, label: "Lose Coverage", icon: "💼" },
      ]),
    );
    expect(after.coverageGap).toBeGreaterThan(before.coverageGap);
    expect(after.totalResources).toBe(before.totalResources - 150000);
  });

  it("paying off the mortgage reduces the modeled need to exclude it", () => {
    const after = calculateNeeds(
      applyEvents(sampleHousehold, [
        { id: "e3", type: "mortgagePaidOff", year: 2040, label: "Mortgage Paid Off", icon: "🏠" },
      ]),
    );
    expect(after.needs.find((n) => n.id === "mortgage")).toBeUndefined();
  });

  it("applies events chronologically and does not mutate the base", () => {
    const snapshot = JSON.parse(JSON.stringify(sampleHousehold));
    applyEvents(sampleHousehold, [
      { id: "a", type: "newChild", year: 2030, label: "x", icon: "👶" },
      { id: "b", type: "mortgagePaidOff", year: 2028, label: "y", icon: "🏠" },
    ]);
    expect(sampleHousehold).toEqual(snapshot);
  });

  it("ages the household to each future event year before applying the event", () => {
    const currentYear = new Date().getFullYear();
    const future = applyEvents(sampleHousehold, [
      { id: "future-child", type: "newChild", year: currentYear + 3, label: "Another Child", icon: "👶" },
    ]);
    expect(future.person.age).toBe(sampleHousehold.person.age + 3);
    expect(future.children[0].age).toBe(sampleHousehold.children[0].age + 3);
    expect(future.children[1].age).toBe(0);
  });
});

describe("diffAssessments", () => {
  it("surfaces the largest-impact change first", () => {
    const before = calculateNeeds(sampleHousehold);
    const after = calculateNeeds(
      applyEvents(sampleHousehold, [
        { id: "e", type: "loseCoverage", year: 2027, label: "x", icon: "💼" },
        { id: "f", type: "newChild", year: 2029, label: "y", icon: "👶" },
      ]),
    );
    const diff = diffAssessments(before, after);
    expect(diff.deltas.length).toBeGreaterThan(0);
    // Sorted by absolute delta descending.
    for (let i = 1; i < diff.deltas.length; i++) {
      expect(Math.abs(diff.deltas[i - 1].delta)).toBeGreaterThanOrEqual(
        Math.abs(diff.deltas[i].delta),
      );
    }
  });
});
