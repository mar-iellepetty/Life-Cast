// ---------------------------------------------------------------------------
// LifeCast domain model
//
// These types describe a household's financial situation as it relates to a
// life-insurance needs analysis. They are intentionally framework-agnostic so
// the same model can run in the browser (demo) or inside an AWS Lambda.
// ---------------------------------------------------------------------------

export interface Person {
  /** Primary insured's current age in years. */
  age: number;
  /** Gross annual income of the primary insured, in USD. */
  income: number;
}

export interface Spouse {
  /** Spouse / partner gross annual income, in USD. */
  income: number;
}

export interface Child {
  /** Label for the child, e.g. "Daughter". */
  name: string;
  /** Current age in years. 0 for a newborn / planned child. */
  age: number;
}

/** Debts other than the mortgage (auto, student, credit card, etc.). */
export interface Debts {
  /** Outstanding mortgage balance, in USD. */
  mortgage: number;
  /** All other outstanding debt, in USD. */
  other: number;
}

export interface ExistingResources {
  /** Liquid savings / investments available to the family, in USD. */
  savings: number;
  /** Existing in-force life-insurance coverage (employer + personal), in USD. */
  existingCoverage: number;
}

/**
 * The complete, deterministic input to the calculation engine. A Household is
 * the single source of truth; the Future Fork feature produces *variants* of a
 * Household and runs them through the same engine.
 */
export interface Household {
  person: Person;
  spouse: Spouse | null;
  children: Child[];
  debts: Debts;
  resources: ExistingResources;
}

/**
 * Tunable planning assumptions. Every one of these is surfaced to the user in
 * the Assumption Inspector and can be edited. Defaults follow common,
 * industry-standard needs-analysis conventions (see assumptions.ts for the
 * reasoning behind each default value).
 */
export interface Assumptions {
  /** Years of the insured's income the family should be able to replace. */
  incomeReplacementYears: number;
  /** Share of income that actually needs replacing (net of the insured's own consumption / taxes). */
  incomeReplacementFactor: number;
  /** Estimated 4-year cost of college per child, in today's USD. */
  educationCostPerChild: number;
  /** Age at which a child is assumed to be financially independent. */
  childIndependenceAge: number;
  /** Final-expense / emergency buffer added to every analysis, in USD. */
  finalExpenses: number;
  /** When true, income replacement uses a present-value annuity instead of the simple income x years. */
  discountFutureIncome: boolean;
  /** Real discount applied to future income replacement (used only when discountFutureIncome is true). */
  realDiscountRate: number;
}

export type NeedCategoryId =
  | "income"
  | "mortgage"
  | "education"
  | "finalExpenses"
  | "otherDebt";

export type ResourceCategoryId = "savings" | "existingCoverage";

/**
 * A single line item in the needs assessment. The `explanation` and `formula`
 * fields are what power the "Explain Every Number" and Protection X-Ray
 * features — the engine produces the reasoning, the AI layer only narrates it.
 */
export interface NeedLineItem {
  id: NeedCategoryId;
  label: string;
  amount: number;
  /** Plain-language reason this amount exists. */
  explanation: string;
  /** The arithmetic that produced the amount, as a human-readable string. */
  formula: string;
  /** Where the underlying inputs came from. */
  source: string;
}

export interface ResourceLineItem {
  id: ResourceCategoryId;
  label: string;
  amount: number;
  explanation: string;
  source: string;
}

/**
 * The full, deterministic result of a needs analysis. This object is pure data:
 * given the same Household + Assumptions it is always identical, which is what
 * makes the whole system explainable and testable.
 */
export interface NeedsAssessment {
  needs: NeedLineItem[];
  resources: ResourceLineItem[];
  /** Sum of all need line items. */
  totalNeed: number;
  /** Sum of all existing resources. */
  totalResources: number;
  /** totalNeed - totalResources, floored at 0. The headline "gap". */
  coverageGap: number;
  /**
   * A responsible range around the gap rather than fake precision. Derived by
   * flexing the key assumptions within a conservative / balanced band.
   */
  range: { low: number; balanced: number; high: number };
  /** Calculator provider used for this result. */
  provider?: "calcxml-ins01";
  methodology?: string;
  providerResponse?: Record<string, unknown>;
  inputs?: Record<string, unknown>;
}
