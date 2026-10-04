import type { Household } from "./types";

/** Every life event the user can drop onto the timeline. */
export type LifeEventType =
  | "newChild"
  | "buyHome"
  | "loseCoverage"
  | "incomeChange"
  | "college"
  | "debtPaidOff"
  | "savingsIncrease"
  | "mortgagePaidOff";

export interface LifeEvent {
  id: string;
  type: LifeEventType;
  /** Calendar year the event occurs. */
  year: number;
  /** Optional magnitude (e.g. income delta, home price, savings added). */
  amount?: number;
  label: string;
  icon: string;
}

export interface EventDefinition {
  type: LifeEventType;
  label: string;
  icon: string;
  /** Default magnitude presented when the card is dropped. */
  defaultAmount?: number;
  /** One-line description of what the event does to the model. */
  description: string;
}

/** The palette of draggable event cards. */
export const EVENT_CATALOG: EventDefinition[] = [
  {
    type: "newChild",
    label: "Another Child",
    icon: "👶",
    description: "Adds a dependent, extending the dependency horizon and education need.",
  },
  {
    type: "buyHome",
    label: "Buy a Home",
    icon: "🏡",
    defaultAmount: 350000,
    description: "Adds a mortgage obligation to the model.",
  },
  {
    type: "loseCoverage",
    label: "Lose Employer Coverage",
    icon: "💼",
    description: "Removes existing group coverage, widening the gap.",
  },
  {
    type: "incomeChange",
    label: "Income Change",
    icon: "💰",
    defaultAmount: 20000,
    description: "Raises or lowers the income that would need to be replaced.",
  },
  {
    type: "college",
    label: "College Starts",
    icon: "🎓",
    description: "Marks education funding as actively needed.",
  },
  {
    type: "debtPaidOff",
    label: "Debt Paid Off",
    icon: "💳",
    description: "Clears non-mortgage debt from the model.",
  },
  {
    type: "savingsIncrease",
    label: "Savings Increase",
    icon: "🏦",
    defaultAmount: 25000,
    description: "Adds to savings, offsetting the modeled need.",
  },
  {
    type: "mortgagePaidOff",
    label: "Mortgage Paid Off",
    icon: "🏠",
    description: "Zeroes out the mortgage obligation.",
  },
];

/**
 * Deterministically apply a set of life events to a base household, in
 * chronological order, producing the household as it would look *after* those
 * events. Pure function — no mutation of the input.
 *
 * This is the Future Engine: Future Fork simply runs the same base household
 * through two different event lists and compares the resulting assessments.
 */
export function applyEvents(
  base: Household,
  events: LifeEvent[],
): Household {
  // Deep-ish clone so we never mutate the caller's household.
  const h: Household = {
    person: { ...base.person },
    spouse: base.spouse ? { ...base.spouse } : null,
    children: base.children.map((c) => ({ ...c })),
    debts: { ...base.debts },
    resources: { ...base.resources },
  };

  const ordered = [...events].sort((a, b) => a.year - b.year);
  let modeledYear = new Date().getFullYear();
  for (const e of ordered) {
    const elapsed = Math.max(0, e.year - modeledYear);
    if (elapsed > 0) {
      h.person.age += elapsed;
      h.children.forEach((child) => {
        child.age += elapsed;
      });
      modeledYear = e.year;
    }

    switch (e.type) {
      case "newChild":
        h.children.push({ name: "New Child", age: 0 });
        break;
      case "buyHome":
        h.debts.mortgage += e.amount ?? 350000;
        break;
      case "loseCoverage":
        h.resources.existingCoverage = 0;
        break;
      case "incomeChange":
        h.person.income = Math.max(0, h.person.income + (e.amount ?? 0));
        break;
      case "debtPaidOff":
        h.debts.other = 0;
        break;
      case "savingsIncrease":
        h.resources.savings += e.amount ?? 0;
        break;
      case "mortgagePaidOff":
        h.debts.mortgage = 0;
        break;
      case "college":
        // College starting doesn't change the lump-sum need (already modeled),
        // it's a timeline marker. No structural change.
        break;
    }
  }
  return h;
}
