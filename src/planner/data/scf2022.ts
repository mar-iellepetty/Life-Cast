// Federal Reserve, 2022 Survey of Consumer Finances (published October 2023).
// Source tables: https://www.federalreserve.gov/econres/files/scf2022_tables_internal_nominal_historical.xlsx
//   Table 1   median before-tax family income
//   Table 4   median family net worth
//   Table 6   median financial assets ("any financial asset") for families holding them
//   Table 13  median debt for families holding it, and the share of families holding it
// Values are in 2022 dollars, grouped by the age of the family's reference person.

import type { FinancialInputs } from '../lib/model';

export interface ScfGroup {
  label: string;
  minAge: number;
  maxAge: number;
  income: number;
  netWorth: number;
  financialAssets: number;
  mortgage: number; // median primary-residence mortgage, families with one
  mortgageShare: number; // percent of families with a primary-residence mortgage
  installment: number; // median installment debt (auto, student, other loans), families with it
  creditCard: number; // median credit card balance, families with one
}

export const SCF_SOURCE = {
  name: 'Federal Reserve, 2022 Survey of Consumer Finances',
  url: 'https://www.federalreserve.gov/econres/scfindex.htm',
};

export const SCF_2022: ScfGroup[] = [
  { label: 'under 35', minAge: 0, maxAge: 34, income: 60500, netWorth: 39000, financialAssets: 12800, mortgage: 176400, mortgageShare: 33.1, installment: 18200, creditCard: 1700 },
  { label: '35–44', minAge: 35, maxAge: 44, income: 85900, netWorth: 135600, financialAssets: 33200, mortgage: 190000, mortgageShare: 53.0, installment: 24400, creditCard: 2900 },
  { label: '45–54', minAge: 45, maxAge: 54, income: 91900, netWorth: 247200, financialAssets: 55000, mortgage: 190000, mortgageShare: 55.7, installment: 24400, creditCard: 3000 },
  { label: '55–64', minAge: 55, maxAge: 64, income: 81900, netWorth: 364500, financialAssets: 69800, mortgage: 125000, mortgageShare: 48.4, installment: 19600, creditCard: 3500 },
  { label: '65–74', minAge: 65, maxAge: 74, income: 60900, netWorth: 409900, financialAssets: 119700, mortgage: 110000, mortgageShare: 32.2, installment: 15900, creditCard: 3500 },
  { label: '75 or older', minAge: 75, maxAge: 200, income: 49100, netWorth: 335600, financialAssets: 50200, mortgage: 90000, mortgageShare: 27.6, installment: 11600, creditCard: 1700 },
];

/** Typical life insurance held, which the Fed survey does not measure. */
export const TYPICAL_POLICY = {
  amount: 209000,
  source: 'American Council of Life Insurers, Life Insurers Fact Book 2025 (average new individual policy, 2024)',
  url: 'https://www.acli.com/-/media/public/pdf/news-and-analysis/publications-and-research/2025fb/7_life_insurance_acli_fact_book_2025.pdf',
};
export const OWNERSHIP = {
  percent: 51,
  source: 'LIMRA, 2025 Insurance Barometer Study',
  url: 'https://www.limra.com/en/newsroom/news-releases/2025/adults-age-30-and-younger-overestimate-life-insurance-cost-by-1012-times/',
};

export const scfGroupFor = (age: number) => SCF_2022.find((g) => age >= g.minAge && age <= g.maxAge) ?? SCF_2022[1];

/**
 * The same household (age, family, choices) with the national median finances for its age group,
 * and the average size of an individual life policy as its existing coverage.
 */
export function nationalMedianInputs(inputs: FinancialInputs): FinancialInputs {
  const g = scfGroupFor(inputs.age);
  return {
    ...inputs,
    annualIncome: g.income,
    savings: g.financialAssets,
    mortgage: g.mortgage,
    otherDebts: g.installment + g.creditCard,
    existingCoverage: TYPICAL_POLICY.amount,
  };
}
