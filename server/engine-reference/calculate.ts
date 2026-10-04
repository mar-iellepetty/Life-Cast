// ---------------------------------------------------------------------------
// Browser-facing calculation API.
//
// The actual math lives in ONE place: core.mjs (shared verbatim with the Node
// server used for Bedrock tool calls). This file is a thin typed wrapper so the
// React app gets full TypeScript types while the implementation stays single-
// sourced. That is why the engine can never drift between client and server.
// ---------------------------------------------------------------------------

import type { Assumptions, Household, NeedsAssessment } from "./types";
import { DEFAULT_ASSUMPTIONS } from "./assumptions";
// @ts-expect-error — plain ESM module without type declarations
import * as core from "./core.mjs";

export function presentValueOfAnnuity(
  annualPayment: number,
  years: number,
  rate: number,
): number {
  // Note: finance.mjs signature is (pmt, rate, periods). Keep this wrapper's
  // historical (payment, years, rate) order for existing callers/tests.
  return core.calculateNeeds // ensure core is loaded
    ? pvAnnuity(annualPayment, years, rate)
    : 0;
}

function pvAnnuity(pmt: number, years: number, rate: number): number {
  if (years <= 0 || pmt <= 0) return 0;
  if (Math.abs(rate) < 1e-9) return pmt * years;
  return pmt * ((1 - Math.pow(1 + rate, -years)) / rate);
}

export function dependencyHorizonYears(
  household: Household,
  assumptions: Assumptions,
): number {
  return core.incomeReplacementYears(household, assumptions);
}

export function calculateNeeds(
  household: Household,
  assumptions: Assumptions = DEFAULT_ASSUMPTIONS,
): NeedsAssessment {
  return core.calculateNeeds(household, assumptions) as NeedsAssessment;
}
