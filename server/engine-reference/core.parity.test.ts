import { describe, it, expect } from "vitest";
import { calculateNeeds as calcTs } from "./calculate";
import { DEFAULT_ASSUMPTIONS } from "./assumptions";
// @ts-expect-error — plain ESM module, no type declarations needed for the test
import { calculateNeeds as calcMjs, DEFAULT_ASSUMPTIONS as DEFAULTS_MJS } from "./core.mjs";
import type { Household } from "./types";

const households: Household[] = [
  {
    person: { age: 31, income: 105000 },
    spouse: { income: 52000 },
    children: [{ name: "Daughter", age: 4 }],
    debts: { mortgage: 340000, other: 18000 },
    resources: { savings: 30000, existingCoverage: 150000 },
  },
  {
    person: { age: 40, income: 90000 },
    spouse: null,
    children: [
      { name: "A", age: 6 },
      { name: "B", age: 9 },
    ],
    debts: { mortgage: 250000, other: 0 },
    resources: { savings: 50000, existingCoverage: 0 },
  },
  {
    person: { age: 55, income: 200000 },
    spouse: { income: 0 },
    children: [],
    debts: { mortgage: 0, other: 5000 },
    resources: { savings: 1000000, existingCoverage: 500000 },
  },
];

describe("engine parity: core.mjs matches calculate.ts", () => {
  it("default assumptions are identical", () => {
    expect(DEFAULTS_MJS).toEqual(DEFAULT_ASSUMPTIONS);
  });

  for (const [i, h] of households.entries()) {
    it(`household #${i} produces identical totals and gap`, () => {
      const a = calcTs(h);
      const b = calcMjs(h);
      expect(Math.round(b.totalNeed)).toBe(Math.round(a.totalNeed));
      expect(Math.round(b.totalResources)).toBe(Math.round(a.totalResources));
      expect(Math.round(b.coverageGap)).toBe(Math.round(a.coverageGap));
      expect(b.needs.map((n: { id: string }) => n.id)).toEqual(a.needs.map((n) => n.id));
    });
  }
});
