// Built-in guide: plain-language answers generated from the user's own calculation.
// Used until the Lincoln AI agent is connected (see lincoln.ts).

import { calculatePlan } from '../lib/calc';
import type { Plan } from '../lib/model';
import { money } from '../lib/format';

export const SUGGESTIONS = ['Why is my need this amount?', 'What are my children’s needs?', 'What if my income changes?', 'Term or permanent?'];

export function greeting(plan: Plan) {
  const c = calculatePlan(plan);
  const t = c.today;
  const biggest = [...t.lines].filter((l) => l.sign === '+').sort((a, b) => b.value - a.value)[0];
  return `Based on what you told me, your family would need about ${money(t.estimatedCoverageNeed)} if something happened to you today. The largest part is ${biggest.label.toLowerCase()} (${money(biggest.value)}). Ask me anything about it, or change a number on the right.`;
}

export function answer(question: string, plan: Plan): string {
  const q = question.toLowerCase();
  const c = calculatePlan(plan);
  const t = c.today;
  const i = plan.financialInputs;
  const line = (k: string) => t.lines.find((l) => l.key === k)!;

  if (/child|kid|son|daughter|school|college|education/.test(q)) {
    if (t.childrenNeed === 0) return 'You have not told me about any children who depend on you, so there are no children’s needs in your estimate. You can add a child under Life Events.';
    const end = c.projection.find((p) => p.age > i.age && p.childrenNeed === 0);
    return `Your children’s needs are ${money(t.childrenNeed)}. ${line('children').formula}. This amount shrinks each year as your children grow${end ? `, and reaches zero around age ${end.age} (${end.year})` : ''}. That is what the chart shows.`;
  }
  if (/income|salary|raise|earn|pay/.test(q)) {
    return `Your income of ${money(i.annualIncome)} drives most of the estimate: we plan for your family to need ${Math.round(i.replacementRatio * 100)}% of it for ${t.supportYears} more years. Every $10,000 more income adds about ${money(10000 * i.replacementRatio * t.supportYears)} to your need. Change your income on the right to see it update.`;
  }
  if (/debt|mortgage|loan|house|home/.test(q)) {
    return t.debtsRequirement > 0 ? `Your debts add ${money(t.debtsRequirement)}: ${line('debts').formula}. Coverage would let your family pay these off instead of taking them on.` : 'You have no debts in your estimate. If you have a mortgage or loans, add them on the right.';
  }
  if (/term|permanent|whole|type|which/.test(q)) {
    return `Most of your need is temporary: it falls as debts are paid and children grow up. Term coverage usually fits that shape at a lower cost (about ${money(c.termMonthly)} a month for ${money(c.suggestedCoverage)}). Permanent coverage costs more (about ${money(c.permanentMonthly)} a month) but lasts for life. The Review & Plan step compares them for your situation.`;
  }
  if (/coverage|insurance|already|existing|work/.test(q)) {
    return `Your existing coverage of ${money(i.existingCoverage)} and savings of ${money(i.savings)} are subtracted, so we never recommend coverage you already have.`;
  }
  if (/why|how|calculat|amount|need|number|total/.test(q)) {
    const adds = t.lines.filter((l) => l.sign === '+' && l.value > 0).map((l) => `${l.label.toLowerCase()} (${money(l.value)})`);
    const subs = t.lines.filter((l) => l.sign === '−' && l.value > 0).map((l) => `${l.label.toLowerCase()} (${money(l.value)})`);
    return `It is simple addition and subtraction. We add ${adds.join(', ')}${subs.length ? `, then subtract ${subs.join(' and ')}` : ''}. That leaves ${money(t.estimatedCoverageNeed)}. Open "View calculations" on the right to see each line.`;
  }
  return 'I can explain your total, your children’s needs, your debts, how income affects the estimate, or term versus permanent coverage. Try one of the suggestions below.';
}
