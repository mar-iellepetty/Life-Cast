import type { NeedsAssessment, NeedCategoryId } from "./types";

export interface LineDelta {
  id: NeedCategoryId | "coverageGap" | "totalResources";
  label: string;
  before: number;
  after: number;
  delta: number;
}

export interface AssessmentDiff {
  deltas: LineDelta[];
  gapBefore: number;
  gapAfter: number;
  gapDelta: number;
}

const LABELS: Record<string, string> = {
  income: "Income replacement",
  mortgage: "Mortgage payoff",
  education: "Education fund",
  otherDebt: "Other debt",
  finalExpenses: "Final expenses & buffer",
  totalResources: "Existing resources",
  coverageGap: "Modeled coverage gap",
};

/**
 * Compare two deterministic assessments and surface exactly which line items
 * changed and by how much. This is the data behind "Why did it change?" — the
 * AI narrates it, but the truth comes from here.
 */
export function diffAssessments(
  before: NeedsAssessment,
  after: NeedsAssessment,
): AssessmentDiff {
  const deltas: LineDelta[] = [];

  const beforeMap = new Map(before.needs.map((n) => [n.id, n.amount]));
  const afterMap = new Map(after.needs.map((n) => [n.id, n.amount]));
  const ids = new Set<NeedCategoryId>([
    ...beforeMap.keys(),
    ...afterMap.keys(),
  ]);

  for (const id of ids) {
    const b = beforeMap.get(id) ?? 0;
    const a = afterMap.get(id) ?? 0;
    if (Math.round(b) !== Math.round(a)) {
      deltas.push({ id, label: LABELS[id] ?? id, before: b, after: a, delta: a - b });
    }
  }

  if (Math.round(before.totalResources) !== Math.round(after.totalResources)) {
    deltas.push({
      id: "totalResources",
      label: LABELS.totalResources,
      before: before.totalResources,
      after: after.totalResources,
      delta: after.totalResources - before.totalResources,
    });
  }

  // Sort by absolute impact, largest first.
  deltas.sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta));

  return {
    deltas,
    gapBefore: before.coverageGap,
    gapAfter: after.coverageGap,
    gapDelta: after.coverageGap - before.coverageGap,
  };
}
