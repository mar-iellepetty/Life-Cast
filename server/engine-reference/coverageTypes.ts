import type { Household, Assumptions } from "./types";
import { dependencyHorizonYears } from "./calculate";

/**
 * Term vs. permanent framing — the Path 2 stretch goal.
 *
 * IMPORTANT: this does NOT tell the user which policy to buy. It surfaces the
 * tradeoffs that apply to *their* scenario, exactly as the Lincoln material
 * frames it:
 *   - TERM: coverage for a defined period, straightforward protection.
 *   - PERMANENT: designed to remain in place longer, may include extra features.
 */
export interface CoverageTradeoff {
  point: string;
  detail: string;
}

export interface CoverageExplanation {
  /** Years the biggest obligations (income, mortgage, education) stay active. */
  obligationHorizonYears: number;
  termTradeoffs: CoverageTradeoff[];
  permanentTradeoffs: CoverageTradeoff[];
  /** A neutral, scenario-aware summary. Never a directive to buy. */
  summary: string;
}

export function explainCoverageTypes(
  household: Household,
  assumptions: Assumptions,
): CoverageExplanation {
  const horizon = dependencyHorizonYears(household, assumptions);
  const hasMortgage = household.debts.mortgage > 0;
  const hasYoungKids = household.children.some((c) => c.age < 10);

  const termTradeoffs: CoverageTradeoff[] = [
    {
      point: "Matches time-bound needs",
      detail: `Your largest obligations — income replacement and ${
        hasMortgage ? "the mortgage" : "debts"
      } — mostly resolve within about ${horizon} years. Term coverage is designed for exactly this kind of defined period.`,
    },
    {
      point: "Lower cost for the same death benefit",
      detail:
        "For a given coverage amount during the years you need it most, term generally has a lower premium than permanent.",
    },
    {
      point: "Coverage ends when the term ends",
      detail:
        "Protection applies for the defined period; once it lapses there is no coverage unless renewed or converted.",
    },
  ];

  const permanentTradeoffs: CoverageTradeoff[] = [
    {
      point: "Stays in place longer",
      detail:
        "Permanent coverage is designed to remain in force beyond a fixed term, which can matter if some needs extend indefinitely.",
    },
    {
      point: "May include additional features",
      detail:
        "Depending on the product, permanent policies can include features beyond the death benefit. Features and availability vary by product.",
    },
    {
      point: "Higher cost",
      detail:
        "Those longer-horizon features typically come with higher premiums than term for the same death benefit.",
    },
  ];

  const summary = hasYoungKids
    ? `With young children and a roughly ${horizon}-year dependency horizon, much of your modeled need is time-bound, which is the kind of need term coverage is built for. Permanent coverage is a separate consideration if you expect obligations to extend well beyond that window. The right choice depends on your goals and budget — this tool explains the tradeoffs rather than recommending a product.`
    : `Your modeled need spans roughly ${horizon} years. Term coverage aligns with time-bound needs; permanent coverage is designed for needs that persist longer. The right choice depends on your goals and budget.`;

  return { obligationHorizonYears: horizon, termTradeoffs, permanentTradeoffs, summary };
}

/**
 * Timeline bars for the Coverage Timeline visualization. Each obligation gets a
 * start/end age so it can be drawn against the person's lifespan.
 */
export interface TimelineBar {
  label: string;
  startAge: number;
  endAge: number;
  color: string;
}

export function coverageTimeline(
  household: Household,
  assumptions: Assumptions,
): TimelineBar[] {
  const age = household.person.age;
  const horizon = dependencyHorizonYears(household, assumptions);
  const bars: TimelineBar[] = [];

  if (household.children.length > 0) {
    const youngest = Math.min(...household.children.map((c) => c.age));
    bars.push({
      label: "Children dependent",
      startAge: age,
      endAge: age + Math.max(0, assumptions.childIndependenceAge - youngest),
      color: "#E35205",
    });
    bars.push({
      label: "Education",
      startAge: age + Math.max(0, 18 - youngest),
      endAge: age + Math.max(0, assumptions.childIndependenceAge - youngest),
      color: "#1B3139",
    });
  }
  if (household.debts.mortgage > 0) {
    bars.push({
      label: "Mortgage",
      startAge: age,
      endAge: age + 25,
      color: "#6B1F3A",
    });
  }
  bars.push({
    label: "Income replacement",
    startAge: age,
    endAge: age + horizon,
    color: "#008275",
  });

  return bars;
}
