// Example planning scenarios. These are ILLUSTRATIVE households, not real customers.
// They power "Explore Example Plans", template creation, and the similar-scenario comparison.

import { createPlan } from '../lib/calc';
import { FinancialInputs, LifeEvent, Plan, defaultInputs, makeEvent } from '../lib/model';

export interface ExampleScenario {
  id: string;
  name: string;
  summary: string;
  priorities: string[];
  inputs: FinancialInputs;
  events: (inputs: FinancialInputs) => LifeEvent[];
}

const base = defaultInputs;

export const EXAMPLES: ExampleScenario[] = [
  {
    id: 'young-family',
    name: 'Young Family',
    summary: 'Two-income household with two young children',
    priorities: ['Income replacement', 'Mortgage protection', 'Education funding'],
    inputs: { ...base, age: 34, annualIncome: 110000, savings: 40000, existingCoverage: 150000, mortgage: 380000, otherDebts: 25000, spouse: true, children: 2, youngestChildAge: 2, incomeReplacementYears: 15 },
    events: () => [],
  },
  {
    id: 'new-homeowner',
    name: 'New Homeowner',
    summary: 'Recently married couple who just bought their first home',
    priorities: ['Mortgage protection', 'Income replacement for a spouse'],
    inputs: { ...base, age: 30, annualIncome: 95000, savings: 30000, existingCoverage: 50000, mortgage: 420000, otherDebts: 15000, spouse: true, children: 0, incomeReplacementYears: 10 },
    events: (i) => [makeEvent('child', i.age + 3)],
  },
  {
    id: 'single-income',
    name: 'Single Income Household',
    summary: 'One earner supporting a partner and three children',
    priorities: ['Long income replacement period', 'Education funding', 'Mortgage protection'],
    inputs: { ...base, age: 38, annualIncome: 150000, savings: 90000, existingCoverage: 250000, mortgage: 450000, otherDebts: 20000, spouse: true, children: 3, youngestChildAge: 5, incomeReplacementYears: 20, replacementRatio: 0.8 },
    events: () => [],
  },
  {
    id: 'pre-retirement',
    name: 'Pre-Retirement',
    summary: 'Empty nesters planning for retirement in about ten years',
    priorities: ['Remaining mortgage', 'Spouse income until retirement', 'Final expenses'],
    inputs: { ...base, age: 55, annualIncome: 140000, savings: 450000, existingCoverage: 300000, mortgage: 150000, otherDebts: 0, spouse: true, children: 0, incomeReplacementYears: 10, finalExpenses: 25000 },
    events: () => [],
  },
  {
    id: 'growing-family',
    name: 'Growing Family',
    summary: 'One child today, with a second child and a larger home planned',
    priorities: ['Planning for future children', 'Upsizing the home', 'Education funding'],
    inputs: { ...base, age: 32, annualIncome: 125000, savings: 60000, existingCoverage: 250000, mortgage: 300000, otherDebts: 18000, spouse: true, children: 1, youngestChildAge: 1, incomeReplacementYears: 15 },
    events: (i) => [makeEvent('child', i.age + 2), makeEvent('home', i.age + 4)],
  },
];

export function planFromExample(ex: ExampleScenario): Plan {
  return createPlan(ex.name, { ...ex.inputs }, ex.events(ex.inputs), 20, ex.id);
}

/** Example scenarios closest to a plan's profile (age, income, family). */
export function similarExamples(inputs: FinancialInputs, count = 2) {
  const score = (e: ExampleScenario) =>
    Math.abs(e.inputs.age - inputs.age) / 10 +
    Math.abs(Math.log(e.inputs.annualIncome / Math.max(1, inputs.annualIncome))) * 2 +
    Math.abs(e.inputs.children - inputs.children) * 0.6 +
    (e.inputs.spouse === inputs.spouse ? 0 : 0.8);
  return [...EXAMPLES].sort((a, b) => score(a) - score(b)).slice(0, count);
}
