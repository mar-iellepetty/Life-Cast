// ---------------------------------------------------------------------------
// Standard financial formulas — the SAME methodology used by the common
// financial-calculator library on Lincoln's "Calculators and tools" page
// (savings goal, college savings, debt payoff, rate of return, future value).
//
// These are canonical, textbook formulas so every number LifeCast produces is
// independently verifiable against any standard financial calculator.
// Pure functions, no AI.
// ---------------------------------------------------------------------------

/** Future value of a single lump sum: FV = PV*(1+r)^n */
export function futureValue(pv, rate, periods) {
  return pv * Math.pow(1 + rate, periods);
}

/** Present value of a single future sum: PV = FV/(1+r)^n */
export function presentValue(fv, rate, periods) {
  return fv / Math.pow(1 + rate, periods);
}

/**
 * Future value of a stream of level payments plus an optional starting balance.
 * FV = PV*(1+r)^n + PMT*[(1+r)^n - 1]/r      (end-of-period / ordinary annuity)
 * This is exactly the "savings goal" / "college savings" projection formula.
 */
export function futureValueOfSavings(pmt, rate, periods, startingBalance = 0) {
  const grown = startingBalance * Math.pow(1 + rate, periods);
  if (Math.abs(rate) < 1e-9) return grown + pmt * periods;
  const annuity = pmt * ((Math.pow(1 + rate, periods) - 1) / rate);
  return grown + annuity;
}

/**
 * Level payment needed to reach a future goal (solves the savings-goal formula
 * for PMT): PMT = (goal - PV*(1+r)^n) * r / [(1+r)^n - 1]
 */
export function paymentForGoal(goal, rate, periods, startingBalance = 0) {
  const grown = startingBalance * Math.pow(1 + rate, periods);
  const remaining = Math.max(0, goal - grown);
  if (periods <= 0) return remaining;
  if (Math.abs(rate) < 1e-9) return remaining / periods;
  return (remaining * rate) / (Math.pow(1 + rate, periods) - 1);
}

/**
 * Present value of an ordinary annuity (level payments):
 * PV = PMT*[1 - (1+r)^-n]/r
 * Used for income replacement: the lump sum today that funds n years of income.
 */
export function presentValueOfAnnuity(pmt, rate, periods) {
  if (periods <= 0 || pmt <= 0) return 0;
  if (Math.abs(rate) < 1e-9) return pmt * periods;
  return pmt * ((1 - Math.pow(1 + rate, -periods)) / rate);
}

/**
 * Months to pay off a debt at a fixed monthly payment (standard amortization):
 * n = -ln(1 - r*B/PMT) / ln(1+r)
 * Returns Infinity if the payment never covers the interest.
 */
export function monthsToPayoff(balance, monthlyRate, payment) {
  if (balance <= 0) return 0;
  if (payment <= balance * monthlyRate) return Infinity;
  if (Math.abs(monthlyRate) < 1e-9) return balance / payment;
  return -Math.log(1 - (monthlyRate * balance) / payment) / Math.log(1 + monthlyRate);
}

/**
 * Grow a cost from today to a future year using an inflation rate — the first
 * step of the college calculators (today's tuition -> tuition at enrollment).
 */
export function inflatedCost(todayCost, inflationRate, years) {
  return futureValue(todayCost, inflationRate, years);
}
