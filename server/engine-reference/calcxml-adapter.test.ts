import { describe, expect, it } from "vitest";
// @ts-expect-error server adapter is plain ESM
import { buildIns01Request, normalizeIns01Response } from "../../server/calcxml.mjs";

const household = {
  person: { age: 31, income: 105000 },
  spouse: { income: 52000 },
  children: [{ name: "Child", age: 4 }],
  debts: { mortgage: 340000, other: 18000 },
  resources: { savings: 30000, existingCoverage: 150000 },
};

describe("CalcXML Ins01 adapter", () => {
  it("maps the LifeCast profile to the documented Ins01 request fields", () => {
    const request = buildIns01Request({ household, spouseAge: 31, spouseRetAge: 67 });
    expect(request.clientAge).toBe("31");
    expect(request.clientIncome).toBe("105000");
    expect(request.spouseIncome).toBe("52000");
    expect(request.mortgageBalance).toBe("340000");
    expect(request.otherDebts).toBe("18000");
    expect(request.investmentAssets).toBe("30000");
    expect(request.lifeInsurance).toBe("150000");
    expect(request.child1Age).toBe("4");
    expect(request.term).toBe("18");
  });

  it("normalizes CalcXML currency strings into the LifeCast assessment shape", () => {
    const request = buildIns01Request({ household });
    const assessment = normalizeIns01Response(
      {
        immediateNeeds: "$373,000",
        longtermNeeds: "$1,220,510",
        totalNeeds: "$1,593,510",
        totalResources: "$919,892",
        lifeInsuranceNeeded: "$674,000",
        spousesEarnings: "$739,892",
        socialSecurity: "$0",
        responseText: "Provider explanation",
      },
      household,
      request,
    );
    expect(assessment.provider).toBe("calcxml-ins01");
    expect(assessment.totalNeed).toBe(1593510);
    expect(assessment.totalResources).toBe(919892);
    expect(assessment.coverageGap).toBe(674000);
    expect(assessment.needs.map((item: { id: string }) => item.id)).toEqual([
      "immediateNeeds",
      "income",
    ]);
  });
});
