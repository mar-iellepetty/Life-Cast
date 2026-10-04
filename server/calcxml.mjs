import { normalizeHousehold } from "./engine-reference/core.mjs";

export const CALCXML_ENDPOINT = "https://www.calcxml.com/rest/ins01";
export const CALCXML_MODE = process.env.CALCXML_USERNAME ? "licensed" : "documented-sample";

const username = process.env.CALCXML_USERNAME || "guest";
const password = process.env.CALCXML_PASSWORD || "water";

function numberFrom(value, field) {
  let parsed;
  if (typeof value === "number") parsed = value;
  else if (typeof value === "string") {
    let amount = value.trim();
    const parenthesized = amount.startsWith("(") && amount.endsWith(")");
    if (parenthesized) amount = amount.slice(1, -1).trim();
    // Accept the provider's USD strings and plain decimal numbers, but never
    // turn missing values, error text, malformed grouping or Infinity into 0.
    const match = amount.match(/^(-)?\$?(-)?((?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?)$/);
    if (match && !(match[1] && match[2]) && !(parenthesized && (match[1] || match[2]))) {
      parsed = Number(match[3].replace(/,/g, "")) * (parenthesized || match[1] || match[2] ? -1 : 1);
    }
  }
  if (!Number.isFinite(parsed)) throw new Error(`CalcXML Ins01 returned a missing or invalid ${field} result.`);
  return parsed;
}

const integer = (value, fallback, min, max) =>
  Math.min(max, Math.max(min, Math.round(Number.isFinite(Number(value)) ? Number(value) : fallback)));

export function buildIns01Request(input) {
  const household = normalizeHousehold(input.household ?? input);
  const children = household.children
    .filter((child) => child.age >= 0 && child.age <= 17)
    .slice(0, 4);
  const youngestAge = children.length ? Math.min(...children.map((child) => child.age)) : null;
  const term = integer(input.term, youngestAge == null ? 20 : Math.max(10, 22 - youngestAge), 1, 70);
  const spouseAge = household.spouse ? integer(input.spouseAge, household.person.age, 1, 100) : 0;

  return {
    username,
    password,
    responseType: "raw2",
    returnDataTable: "true",
    language: "en",
    countryCode: "US",
    version: "1.3",
    clientAge: String(integer(household.person.age, 35, 1, 120)),
    clientIncome: String(household.person.income),
    spouseIncome: String(household.spouse?.income ?? 0),
    spouseAge: String(spouseAge),
    spouseRetAge: String(household.spouse ? integer(input.spouseRetAge, 67, spouseAge, 100) : 0),
    beforeTaxReturn: String(input.beforeTaxReturn ?? 0.05),
    inflation: String(input.inflation ?? 0.02),
    funeral: String(input.funeral ?? 15000),
    finalExpenses: String(input.finalExpenses ?? 0),
    mortgageBalance: String(household.debts.mortgage),
    otherDebts: String(input.otherDebts ?? household.debts.other),
    desiredIncome: String(input.desiredIncome ?? household.person.income * 0.75),
    term: String(term),
    collegeNeeds: String(input.collegeNeeds ?? children.length * 100000),
    investmentAssets: String(household.resources.savings),
    lifeInsurance: String(household.resources.existingCoverage),
    includeSocsec: input.includeSocsec === true || input.includeSocsec === "Y" ? "Y" : "N",
    child1Age: String(children[0]?.age ?? 0),
    child2Age: String(children[1]?.age ?? 0),
    child3Age: String(children[2]?.age ?? 0),
    child4Age: String(children[3]?.age ?? 0),
  };
}

export function normalizeIns01Response(raw, household, request) {
  const immediateNeeds = Math.abs(numberFrom(raw?.immediateNeeds, "immediateNeeds"));
  const longtermNeeds = Math.abs(numberFrom(raw?.longtermNeeds, "longtermNeeds"));
  const totalNeed = Math.abs(numberFrom(raw?.totalNeeds, "totalNeeds"));
  const totalResources = Math.abs(numberFrom(raw?.totalResources, "totalResources"));
  const coverageGap = Math.max(0, numberFrom(raw?.lifeInsuranceNeeded, "lifeInsuranceNeeded"));

  return {
    needs: [
      {
        id: "immediateNeeds",
        label: "Immediate cash needs",
        amount: immediateNeeds,
        explanation: "Mortgage, debts, funeral and other immediate obligations modeled by CalcXML Ins01.",
        formula: `CalcXML Ins01 immediate-needs result = $${immediateNeeds.toLocaleString("en-US")}`,
        source: "CalcXML Ins01",
      },
      {
        id: "income",
        label: "Long-term income needs",
        amount: longtermNeeds,
        explanation: `Income support modeled over ${request.term} years using the entered income, spouse income, return and inflation assumptions.`,
        formula: `CalcXML Ins01 long-term-needs result = $${longtermNeeds.toLocaleString("en-US")}`,
        source: "CalcXML Ins01 year-by-year projection",
      },
    ],
    resources: [
      {
        id: "availableResources",
        label: "Available resources",
        amount: totalResources,
        explanation: "Spouse earnings, investment assets, Social Security when selected, and existing life insurance included by CalcXML.",
        source: "CalcXML Ins01",
      },
    ],
    totalNeed,
    totalResources,
    coverageGap,
    range: { low: coverageGap, balanced: coverageGap, high: coverageGap },
    provider: "calcxml-ins01",
    methodology: "CalcXML Ins01 life-insurance needs calculator",
    providerResponse: {
      immediateNeeds: raw.immediateNeeds,
      longtermNeeds: raw.longtermNeeds,
      spousesEarnings: raw.spousesEarnings,
      socialSecurity: raw.socialSecurity,
      responseText: raw.responseText,
      chartUrl: raw.chartUrl,
    },
    inputs: {
      term: Number(request.term),
      desiredIncome: Number(request.desiredIncome),
      beforeTaxReturn: Number(request.beforeTaxReturn),
      inflation: Number(request.inflation),
      includeSocsec: request.includeSocsec,
    },
  };
}

export async function calculateWithCalcXml(input) {
  const household = normalizeHousehold(input.household ?? input);
  const request = buildIns01Request({ ...input, household });
  const response = await fetch(CALCXML_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=UTF-8", Accept: "application/json" },
    body: JSON.stringify(request),
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) throw new Error(`CalcXML Ins01 returned HTTP ${response.status}`);
  const raw = await response.json();
  return { household, assessment: normalizeIns01Response(raw, household, request), provider: "calcxml-ins01" };
}
