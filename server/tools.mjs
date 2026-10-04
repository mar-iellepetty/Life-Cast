// ---------------------------------------------------------------------------
// Bedrock tool definitions + executors (Brain 2: the Calculator).
//
// Bedrock does NOT do insurance math. It CALLS these tools; the deterministic
// engine core (src/engine/core.mjs) produces the numbers; Bedrock explains the
// returned result. This is Converse API tool-use (function calling).
// ---------------------------------------------------------------------------

import { applyCoverageRule } from "./engine-reference/core.mjs";
import { calculateWithCalcXml } from "./calcxml.mjs";
import {
  paymentForGoal,
  monthsToPayoff,
  inflatedCost,
} from "./engine-reference/finance.mjs";

/** The toolConfig passed to Bedrock Converse. */
export const TOOL_CONFIG = {
  tools: [
    {
      toolSpec: {
        name: "calculate_life_insurance_need",
        description:
          "Run CalcXML Ins01, the authoritative life-insurance needs calculator used by Lincoln's calculator experience. Call this after collecting income, dependents, debts and existing coverage. It returns immediate needs, long-term needs, total resources, the additional life-insurance amount, and year-by-year provider results. Never calculate this yourself.",
        inputSchema: {
          json: {
            type: "object",
            properties: {
              age: { type: "number", description: "Primary insured age" },
              income: { type: "number", description: "Primary insured gross annual income (USD)" },
              spouseAge: { type: "number", description: "Spouse age, if applicable" },
              spouseRetAge: { type: "number", description: "Expected spouse retirement age; default 67" },
              spouseIncome: { type: "number", description: "Spouse annual income, 0 if none" },
              children: {
                type: "array",
                description: "Dependent children",
                items: {
                  type: "object",
                  properties: {
                    name: { type: "string" },
                    age: { type: "number" },
                  },
                },
              },
              mortgage: { type: "number", description: "Outstanding mortgage balance (USD)" },
              otherDebt: { type: "number", description: "Non-mortgage debt (USD)" },
              savings: { type: "number", description: "Liquid investment assets available to survivors (USD)" },
              existingCoverage: { type: "number", description: "Existing life insurance in force (USD)" },
              desiredIncome: { type: "number", description: "Desired annual survivor income; default 75% of primary income" },
              term: { type: "number", description: "Years survivor income is needed; default reaches youngest child's age 22 or 20 years" },
              beforeTaxReturn: { type: "number", description: "Expected before-tax return, decimal; default 0.05" },
              inflation: { type: "number", description: "Annual inflation, decimal; default 0.02" },
              funeral: { type: "number", description: "Funeral expense (USD); default 15000" },
              finalExpenses: { type: "number", description: "Other immediate final expenses (USD)" },
              collegeNeeds: { type: "number", description: "Total college funding goal for all children (USD)" },
              includeSocsec: { type: "boolean", description: "Whether to include estimated Social Security survivor benefits" },
            },
            required: ["income"],
          },
        },
      },
    },
    {
      toolSpec: {
        name: "apply_employer_coverage_rule",
        description:
          "Compute employer group life coverage from a plan rule and the user's salary (e.g. 'Basic Life = 2x annual salary'). Use when a benefits document or the user describes coverage as a multiple of salary and/or a flat amount. The engine does the multiplication, not you.",
        inputSchema: {
          json: {
            type: "object",
            properties: {
              multipleOfSalary: { type: "number", description: "e.g. 2 for '2x salary'. 0 if none." },
              flatAmount: { type: "number", description: "Flat coverage amount in USD. 0 if none." },
              salary: { type: "number", description: "The user's annual salary (USD)." },
            },
            required: ["salary"],
          },
        },
      },
    },
    {
      toolSpec: {
        name: "savings_goal",
        description:
          "Lincoln 'Savings goal' calculator: the level monthly contribution needed to reach a dollar goal by a target date, given a rate of return. Use for 'how much should I save to reach my goal?'.",
        inputSchema: {
          json: {
            type: "object",
            properties: {
              goal: { type: "number", description: "Target amount in USD" },
              years: { type: "number", description: "Years until the goal" },
              annualReturn: { type: "number", description: "Expected annual return, e.g. 0.06" },
              startingBalance: { type: "number", description: "Amount already saved, 0 if none" },
            },
            required: ["goal", "years"],
          },
        },
      },
    },
    {
      toolSpec: {
        name: "college_savings",
        description:
          "Lincoln 'College savings' calculator: grows today's annual college cost by inflation to the enrollment year, estimates a total multi-year cost, and returns the monthly savings needed. Use for 'how much should I save for college?'.",
        inputSchema: {
          json: {
            type: "object",
            properties: {
              annualCostToday: { type: "number", description: "Today's annual college cost in USD" },
              yearsUntilCollege: { type: "number", description: "Years until the child starts college" },
              yearsInCollege: { type: "number", description: "Number of college years (default 4)" },
              collegeInflation: { type: "number", description: "College cost inflation, e.g. 0.05" },
              annualReturn: { type: "number", description: "Expected savings return, e.g. 0.06" },
              startingBalance: { type: "number", description: "Amount already saved, 0 if none" },
            },
            required: ["annualCostToday", "yearsUntilCollege"],
          },
        },
      },
    },
    {
      toolSpec: {
        name: "debt_payoff",
        description:
          "Lincoln 'Debt payment' calculator: how many months to pay off a balance at a fixed monthly payment and APR. Use for 'how soon can I pay off my debt?'.",
        inputSchema: {
          json: {
            type: "object",
            properties: {
              balance: { type: "number", description: "Current balance in USD" },
              apr: { type: "number", description: "Annual interest rate, e.g. 0.18" },
              monthlyPayment: { type: "number", description: "Fixed monthly payment in USD" },
            },
            required: ["balance", "monthlyPayment"],
          },
        },
      },
    },
  ],
};

const usd = (n) => `$${Math.round(n).toLocaleString("en-US")}`;

/** Execute a tool the model asked for. Returns a JSON-serializable result. */
export async function runTool(name, input, profile, calculatorOptions = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return { error: "Tool input must be an object." };
  for (const [key, value] of Object.entries(input)) {
    if (typeof value === "number" && (!Number.isFinite(value) || value < 0 || value > 1e10)) return { error: `Invalid numeric input: ${key}.` };
  }
  for (const key of ["age", "spouseAge", "spouseRetAge", "years", "yearsUntilCollege", "yearsInCollege", "term"]) {
    if (input[key] != null && (typeof input[key] !== "number" || input[key] > 120)) return { error: `Invalid age or duration: ${key}.` };
  }
  if (input.children != null && (!Array.isArray(input.children) || input.children.length > 20 || input.children.some((c) => !c || !Number.isFinite(c.age) || c.age < 0 || c.age > 120))) return { error: "Invalid dependent ages." };
  if (name === "calculate_life_insurance_need") {
    const householdInput = {
      person: { age: input.age ?? profile?.person?.age, income: input.income ?? profile?.person?.income },
      spouse: input.spouseIncome == null ? (profile?.spouse ?? null) : (input.spouseIncome || profile?.spouse ? { income: input.spouseIncome } : null),
      children: input.children ?? profile?.children,
      debts: { mortgage: input.mortgage ?? profile?.debts?.mortgage, other: input.otherDebt ?? profile?.debts?.other },
      resources: { savings: input.savings ?? profile?.resources?.savings, existingCoverage: input.existingCoverage ?? profile?.resources?.existingCoverage },
    };
    const result = await calculateWithCalcXml({
      household: householdInput,
      spouseAge: input.spouseAge ?? calculatorOptions.spouseAge,
      spouseRetAge: input.spouseRetAge ?? calculatorOptions.spouseRetAge,
      desiredIncome: input.desiredIncome ?? calculatorOptions.desiredIncome,
      term: input.term ?? calculatorOptions.term,
      beforeTaxReturn: input.beforeTaxReturn ?? calculatorOptions.beforeTaxReturn,
      inflation: input.inflation ?? calculatorOptions.inflation,
      funeral: input.funeral ?? calculatorOptions.funeral,
      finalExpenses: input.finalExpenses ?? calculatorOptions.finalExpenses,
      collegeNeeds: input.collegeNeeds ?? calculatorOptions.collegeNeeds,
      includeSocsec: input.includeSocsec ?? calculatorOptions.includeSocsec,
    });
    return {
      ...result,
      note: "Authoritative result returned by CalcXML Ins01. Bedrock did not calculate these values.",
    };
  }

  if (name === "apply_employer_coverage_rule") {
    const salary = input.salary ?? profile?.person?.income ?? 0;
    const result = applyCoverageRule({
      multipleOfSalary: input.multipleOfSalary ?? 0,
      flatAmount: input.flatAmount ?? 0,
      salary,
    });
    return { ...result, salary, note: "Multiplication done by the engine, subject to the plan's actual terms and limits." };
  }

  if (name === "savings_goal") {
    const years = Math.max(0, input.years ?? 0);
    const rate = (input.annualReturn ?? 0.06) / 12;
    const months = years * 12;
    const monthly = paymentForGoal(input.goal ?? 0, rate, months, input.startingBalance ?? 0);
    return {
      goal: input.goal,
      years,
      monthlyContribution: monthly,
      formula: `PMT to reach ${usd(input.goal ?? 0)} in ${years} yrs at ${((input.annualReturn ?? 0.06) * 100).toFixed(1)}% = ${usd(monthly)}/mo`,
      note: "Computed by the engine using the standard savings-goal formula.",
    };
  }

  if (name === "college_savings") {
    const yearsIn = input.yearsInCollege ?? 4;
    const infl = input.collegeInflation ?? 0.05;
    const firstYearCost = inflatedCost(input.annualCostToday ?? 0, infl, input.yearsUntilCollege ?? 0);
    // Approximate total: sum of inflated annual costs across the college years.
    let totalCost = 0;
    for (let i = 0; i < yearsIn; i++) {
      totalCost += inflatedCost(input.annualCostToday ?? 0, infl, (input.yearsUntilCollege ?? 0) + i);
    }
    const rate = (input.annualReturn ?? 0.06) / 12;
    const months = Math.max(0, input.yearsUntilCollege ?? 0) * 12;
    const monthly = paymentForGoal(totalCost, rate, months, input.startingBalance ?? 0);
    return {
      firstYearCostAtEnrollment: firstYearCost,
      totalProjectedCost: totalCost,
      yearsInCollege: yearsIn,
      monthlyContribution: monthly,
      formula: `Grow ${usd(input.annualCostToday ?? 0)}/yr at ${(infl * 100).toFixed(1)}% to enrollment, total ~${usd(totalCost)} over ${yearsIn} yrs; save ${usd(monthly)}/mo`,
      note: "Computed by the engine using the standard college-savings method.",
    };
  }

  if (name === "debt_payoff") {
    const monthlyRate = (input.apr ?? 0) / 12;
    const months = monthsToPayoff(input.balance ?? 0, monthlyRate, input.monthlyPayment ?? 0);
    const feasible = Number.isFinite(months);
    return {
      balance: input.balance,
      monthlyPayment: input.monthlyPayment,
      months: feasible ? Math.ceil(months) : null,
      feasible,
      formula: feasible
        ? `${usd(input.balance ?? 0)} at ${((input.apr ?? 0) * 100).toFixed(1)}% APR, ${usd(input.monthlyPayment ?? 0)}/mo => ${Math.ceil(months)} months`
        : "Payment does not cover the monthly interest — balance never pays off.",
      note: "Computed by the engine using standard amortization.",
    };
  }

  return { error: `Unknown tool: ${name}` };
}
