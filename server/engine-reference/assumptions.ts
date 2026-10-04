import type { Assumptions } from "./types";
// @ts-expect-error — plain ESM module without type declarations
import { DEFAULT_ASSUMPTIONS as CORE_DEFAULTS } from "./core.mjs";

/**
 * Default planning assumptions — single-sourced from core.mjs so the TS app and
 * the Node/Bedrock server always agree. These follow the mainstream DIME
 * needs-analysis conventions (Debt, Income, Mortgage, Education) that standard
 * life-insurance calculators use, so every figure is independently verifiable.
 */
export const DEFAULT_ASSUMPTIONS: Assumptions = CORE_DEFAULTS as Assumptions;

/** Human-readable rationale for each assumption, shown in the inspector. */
export const ASSUMPTION_RATIONALE: Record<keyof Assumptions, string> = {
  incomeReplacementYears:
    "How many years of income to replace. Standard calculators commonly default to 10 years; LifeCast extends this if a young child's dependency runs longer.",
  incomeReplacementFactor:
    "The share of gross income to replace. 100% is the common calculator default; lower it if the household could get by on less.",
  educationCostPerChild:
    "Estimated education cost per child. $100,000 per child is the standard DIME-method default; adjust for your plans.",
  childIndependenceAge:
    "The age at which a child is assumed financially independent, used to size the income-replacement horizon.",
  finalExpenses:
    "A buffer for funeral, final medical, and emergency costs so the family isn't forced to liquidate assets.",
  discountFutureIncome:
    "Off by default (matches what standard calculators display). When on, future income replacement is discounted to a present-value lump sum.",
  realDiscountRate:
    "The real investment return assumed on a lump sum, used only when 'discount future income' is on. Higher means a smaller lump sum is needed today.",
};
