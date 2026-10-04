// ---------------------------------------------------------------------------
// LifeCast calculation core — the single source of truth for the MATH.
//
// Implements the standard, verifiable "DIME + resources" needs methodology used
// by mainstream life-insurance needs calculators (Debt, Income, Mortgage,
// Education, plus Final expenses, minus existing resources):
//
//     Total Need   = Income replacement + Mortgage + Education + Other debt
//                    + Final expenses
//     Resources    = Savings/assets + Existing coverage
//     Coverage Gap = Total Need - Resources   (floored at 0)
//
// Income replacement defaults to the simple, transparent form every standard
// calculator shows: annual income x replacement factor x years. An optional
// "discountFutureIncome" assumption switches to a present-value annuity for
// users who want time-value-of-money applied.
//
// Plain ESM so the browser engine (calculate.ts re-exports these) and the Node
// server (Bedrock tool calls) run identical code. Pure functions, no AI.
// ---------------------------------------------------------------------------

import { presentValueOfAnnuity } from "./finance.mjs";

export const DEFAULT_ASSUMPTIONS = {
  // Years of income to replace. 10 is the common calculator default.
  incomeReplacementYears: 10,
  // Share of gross income to replace (1.0 = full income, the common default).
  incomeReplacementFactor: 1.0,
  // Industry-standard education default used by DIME calculators.
  educationCostPerChild: 100000,
  // Age a child is treated as independent (used to extend the horizon).
  childIndependenceAge: 22,
  // Final-expense / emergency buffer.
  finalExpenses: 15000,
  // By default, show the straightforward (undiscounted) income figure that a
  // standard calculator displays. Turn on to apply time-value discounting.
  discountFutureIncome: false,
  // Real discount rate used only when discountFutureIncome is true.
  realDiscountRate: 0.03,
};

const usd = (n) => `$${Math.round(n).toLocaleString("en-US")}`;

/**
 * Years of income to replace. Uses the assumption as a floor, but extends to
 * cover the youngest child reaching independence so adding a child lengthens
 * the need (this drives the Future Fork / Shockwave behavior).
 */
export function incomeReplacementYears(household, assumptions) {
  const childYears = household.children.map((c) =>
    Math.max(0, assumptions.childIndependenceAge - c.age),
  );
  const longestChild = childYears.length ? Math.max(...childYears) : 0;
  return Math.max(assumptions.incomeReplacementYears, longestChild);
}

// Back-compat alias (older imports used this name).
export const dependencyHorizonYears = incomeReplacementYears;

/** The income-replacement dollar amount, by the chosen method. */
function incomeReplacementAmount(household, assumptions) {
  const years = incomeReplacementYears(household, assumptions);
  const annual = household.person.income * assumptions.incomeReplacementFactor;
  if (assumptions.discountFutureIncome) {
    return {
      years,
      annual,
      amount: presentValueOfAnnuity(annual, assumptions.realDiscountRate, years),
      discounted: true,
    };
  }
  return { years, annual, amount: annual * years, discounted: false };
}

export function calculateNeeds(household, assumptions = DEFAULT_ASSUMPTIONS) {
  const a = { ...DEFAULT_ASSUMPTIONS, ...assumptions };
  const needs = [];
  const resources = [];

  // --- I: Income replacement ---------------------------------------------
  const inc = incomeReplacementAmount(household, a);
  const pct = Math.round(a.incomeReplacementFactor * 100);
  needs.push({
    id: "income",
    label: "Income replacement",
    amount: inc.amount,
    explanation: `Replaces ${pct}% of the insured's ${usd(household.person.income)} income for ${inc.years} years so the family can keep up their standard of living.`,
    formula: inc.discounted
      ? `Present value of ${usd(inc.annual)}/yr for ${inc.years} yrs at ${(a.realDiscountRate * 100).toFixed(1)}% = ${usd(inc.amount)}`
      : `${usd(inc.annual)}/yr x ${inc.years} yrs = ${usd(inc.amount)}`,
    source: "Income x replacement factor x years (DIME: Income)",
  });

  // --- M: Mortgage -------------------------------------------------------
  if (household.debts.mortgage > 0) {
    needs.push({
      id: "mortgage",
      label: "Mortgage payoff",
      amount: household.debts.mortgage,
      explanation: "Pays off the remaining mortgage so the family can stay in their home without a monthly payment.",
      formula: `Outstanding mortgage balance = ${usd(household.debts.mortgage)}`,
      source: "Mortgage balance (DIME: Mortgage)",
    });
  }

  // --- E: Education ------------------------------------------------------
  if (household.children.length > 0) {
    const eduTotal = household.children.length * a.educationCostPerChild;
    needs.push({
      id: "education",
      label: "Education fund",
      amount: eduTotal,
      explanation: `Funds education for ${household.children.length} child${household.children.length > 1 ? "ren" : ""} at ${usd(a.educationCostPerChild)} each.`,
      formula: `${household.children.length} x ${usd(a.educationCostPerChild)} = ${usd(eduTotal)}`,
      source: "Children x education cost (DIME: Education)",
    });
  }

  // --- D: Other debt -----------------------------------------------------
  if (household.debts.other > 0) {
    needs.push({
      id: "otherDebt",
      label: "Other debt",
      amount: household.debts.other,
      explanation: "Clears remaining non-mortgage debt (auto, student, credit cards) so it isn't left to the family.",
      formula: `Other debt balance = ${usd(household.debts.other)}`,
      source: "Non-mortgage debt (DIME: Debt)",
    });
  }

  // --- Final expenses ----------------------------------------------------
  if (a.finalExpenses > 0) {
    needs.push({
      id: "finalExpenses",
      label: "Final expenses & buffer",
      amount: a.finalExpenses,
      explanation: "A cushion for funeral, final medical, and emergency costs so the family isn't forced to sell assets.",
      formula: `Fixed buffer = ${usd(a.finalExpenses)}`,
      source: "Planning assumption",
    });
  }

  // --- Resources (offsets) ----------------------------------------------
  if (household.resources.savings > 0) {
    resources.push({
      id: "savings",
      label: "Savings & investments",
      amount: household.resources.savings,
      explanation: "Liquid savings and investments the family already has, which reduce how much new coverage is needed.",
      source: "User-entered savings",
    });
  }
  if (household.resources.existingCoverage > 0) {
    resources.push({
      id: "existingCoverage",
      label: "Existing coverage",
      amount: household.resources.existingCoverage,
      explanation: "Life insurance already in force (employer group + personal), applied against the modeled need.",
      source: "User-entered existing coverage",
    });
  }

  const totalNeed = needs.reduce((s, n) => s + n.amount, 0);
  const totalResources = resources.reduce((s, r) => s + r.amount, 0);
  const coverageGap = Math.max(0, totalNeed - totalResources);

  return {
    needs,
    resources,
    totalNeed,
    totalResources,
    coverageGap,
    range: buildRange(household, a, coverageGap),
  };
}

function gapOnly(household, a) {
  const inc = incomeReplacementAmount(household, a);
  const totalNeed =
    inc.amount +
    household.debts.mortgage +
    household.debts.other +
    household.children.length * a.educationCostPerChild +
    a.finalExpenses;
  const totalResources = household.resources.savings + household.resources.existingCoverage;
  return Math.max(0, totalNeed - totalResources);
}

/**
 * Honest range: flex only the income-replacement years (the assumption users
 * most often debate), holding everything else constant.
 */
function buildRange(household, a, balancedGap) {
  const flex = (deltaYears) =>
    gapOnly(household, {
      ...a,
      incomeReplacementYears: Math.max(1, a.incomeReplacementYears + deltaYears),
    });
  const low = flex(-5);
  const high = flex(+5);
  return {
    low: Math.min(low, balancedGap),
    balanced: balancedGap,
    high: Math.max(high, balancedGap),
  };
}

/**
 * Employer coverage rule evaluator (e.g. "2x salary"). The engine does the
 * multiplication; the model only extracts the rule from a document.
 */
export function applyCoverageRule({ multipleOfSalary = 0, flatAmount = 0, salary = 0 }) {
  const fromMultiple = Math.max(0, multipleOfSalary) * Math.max(0, salary);
  const flat = Math.max(0, flatAmount);
  const amount = fromMultiple + flat;
  const parts = [];
  if (fromMultiple > 0) parts.push(`${multipleOfSalary} x ${usd(salary)} salary = ${usd(fromMultiple)}`);
  if (flat > 0) parts.push(`flat ${usd(flat)}`);
  return { amount, formula: parts.join(" + ") || "no coverage rule found" };
}

/** Normalize a loosely-shaped household into the engine's expected form. */
export function normalizeHousehold(h = {}) {
  const num = (v, d) => {
    const n = typeof v === "string" ? parseFloat(v.replace(/[^0-9.\-]/g, "")) : v;
    return Number.isFinite(n) ? n : d;
  };
  return {
    person: { age: num(h.person?.age, 35), income: num(h.person?.income, 0) },
    spouse: h.spouse ? { income: num(h.spouse.income, 0) } : null,
    children: Array.isArray(h.children)
      ? h.children.map((c) => ({ name: String(c?.name ?? "Child"), age: num(c?.age, 0) }))
      : [],
    debts: { mortgage: num(h.debts?.mortgage, 0), other: num(h.debts?.other, 0) },
    resources: {
      savings: num(h.resources?.savings, 0),
      existingCoverage: num(h.resources?.existingCoverage, 0),
    },
  };
}
