/** Round positive shortfalls for discussion without inventing a minimum need. */
export function suggestedAdditionalCoverage(calculatorGap: number | null, illustrativeNeed: number): number {
  const need = calculatorGap ?? illustrativeNeed;
  return Math.ceil(Math.max(0, need) / 50000) * 50000;
}
