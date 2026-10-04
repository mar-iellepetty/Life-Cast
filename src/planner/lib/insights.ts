// Client for the server's AI insight endpoints (server/insights.mjs).
// Results adjust only the illustrative timeline, never the CalcXML assessment.

import type { Adjustment, LifeEvent, Plan } from './model';
import { calculatePlan } from './calc';
import type { HealthMetrics } from './appleHealth';

async function post<T>(route: string, body: unknown, signal?: AbortSignal): Promise<T> {
  const response = await fetch(route, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(60000)]) : AbortSignal.timeout(60000) });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(typeof data?.error === 'string' ? data.error : `Lincoln could not complete this request (HTTP ${response.status}).`);
  return data as T;
}

export interface EventEstimate {
  title: string;
  category: 'mortgage' | 'education' | 'other';
  amount: number;
  years: number;
  summary: string;
}

/** Ask Lincoln to estimate a custom event's cost from the user's own description. */
export function estimateEvent(plan: Plan, event: LifeEvent, signal?: AbortSignal) {
  const i = plan.financialInputs;
  const need = calculatePlan(plan).at(event.age)?.estimatedCoverageNeed;
  return post<EventEstimate>('/api/insights/event', {
    text: (event.description && event.description.toLowerCase().includes(event.title.toLowerCase()) ? event.description : [event.title, event.description].filter(Boolean).join(': ')).slice(0, 300),
    age: event.age,
    currentAge: i.age,
    location: i.location ?? '',
    annualIncome: i.annualIncome,
    mortgage: i.mortgage,
    savings: i.savings,
    children: i.children,
    needAtAge: need,
  }, signal);
}

export async function reviewHealth(metrics: HealthMetrics, sample: boolean, signal?: AbortSignal): Promise<Adjustment> {
  const result = await post<{ percent: number; headline: string; reasons: string[] }>('/api/insights/health', { metrics }, signal);
  return { ...result, metrics: { ...metrics }, sample, at: new Date().toISOString() };
}

type LocationResult =
  | { found: false; message: string }
  | ({ found: true } & Required<Pick<Adjustment, 'percent' | 'headline' | 'reasons' | 'place' | 'county' | 'overall' | 'hazards' | 'source'>>);

export async function reviewLocation(where: { query: string } | { lat: number; lon: number }, signal?: AbortSignal): Promise<Adjustment> {
  const result = await post<LocationResult>('/api/insights/location', where, signal);
  if (result.found === false) throw new Error(result.message);
  const { percent, headline, reasons, place, county, overall, hazards, source } = result;
  return { percent, headline, reasons, place, county, overall, hazards, source, at: new Date().toISOString() };
}
