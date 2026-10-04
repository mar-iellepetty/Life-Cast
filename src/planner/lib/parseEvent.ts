// Turns a typed sentence such as "I'm planning to buy a home in 2 years" into a life event.

import { EVENT_DEFS, EventType, LifeEvent, makeEvent, uid, CURRENT_YEAR } from './model';

const KEYWORDS: [Exclude<EventType, 'custom'>, RegExp][] = [
  ['child', /\b(baby|child|children|kid|kids|pregnan|son|daughter|adopt)/],
  ['home', /\b(buy|buying|bought|purchas\w*|move|moving)\b.*\b(home|house|condo|apartment|place)\b|\bnew (home|house|condo|apartment)\b|\b(take out|new) (a )?mortgage\b/],
  ['marriage', /\b(marr|wedding|spouse|partner|engag)/],
  ['education', /\b(college|university|tuition|school|degree)/],
  ['retirement', /\bretir/],
  ['career', /\b(job|career|promotion|raise|business|work)/],
];

export interface ParsedEvent {
  event: LifeEvent;
  understood: string;
}

export function parseEvent(text: string, currentAge: number): ParsedEvent | null {
  const raw = text.trim();
  if (!raw) return null;
  const q = raw.toLowerCase();

  // When: "in 2 years", "at 40" / "age 40", "in 2030", "next year", "last year", "3 years ago"
  let age = currentAge + 1;
  let when = 'next year';
  const inYears = q.match(/in (\d{1,2}) years?/);
  const ago = q.match(/(\d{1,2}) years? ago/);
  const atAge = q.match(/(?:at|age) (\d{2})\b/);
  const year = q.match(/\b(19[6-9]\d|20\d{2})\b/);
  if (inYears) [age, when] = [currentAge + +inYears[1], `in ${inYears[1]} years`];
  else if (ago) [age, when] = [currentAge - +ago[1], `${ago[1]} years ago`];
  else if (atAge) [age, when] = [+atAge[1], `at age ${atAge[1]}`];
  else if (year) [age, when] = [currentAge + (+year[1] - CURRENT_YEAR), `in ${year[1]}`];
  else if (/last year/.test(q)) [age, when] = [currentAge - 1, 'last year'];

  // Amount: "$50,000", "50k", "1.2m"
  let amount: number | undefined;
  const m = q
    .match(/\$?\s?(\d[\d,.]*)\s?(k|m|thousand|million)?\b/g)
    ?.filter((s) => !year || s.replace(/[^\d]/g, '') !== year[1])
    .find((s) => /\$|k|m|thousand|million/.test(s) || +s.replace(/[^\d]/g, '') >= 1000);
  if (m) {
    const n = parseFloat(m.replace(/[$,\s]|thousand|million|k|m/g, ''));
    amount = Math.round(/k|thousand/.test(m) ? n * 1000 : /m|million/.test(m) ? n * 1e6 : n);
    if (amount < 1000) amount = undefined;
  }

  // Disasters, damage, illness and similar events have no standard type: Lincoln estimates them.
  const unusual = /\b(hurricane|flood\w*|fire\w*|wildfire\w*|tornado\w*|earthquake\w*|storm\w*|damage\w*|repair\w*|accident\w*|disaster\w*|illness\w*|surger\w*|lawsuit\w*|divorc\w*|caring|care for|pay(ing)? off)\b/.test(q);
  const match = unusual ? undefined : KEYWORDS.find(([, re]) => re.test(q));
  if (match) {
    const ev = makeEvent(match[0], age);
    if (amount && EVENT_DEFS[match[0]].impactKind === 'money') ev.financialImpact = amount;
    ev.description = raw;
    return { event: ev, understood: `${EVENT_DEFS[match[0]].label}, ${when}${when.startsWith('at age') ? '' : ` (age ${age})`}${amount && ev.financialImpact === amount ? `, ${'$' + amount.toLocaleString('en-US')}` : ''}` };
  }

  const title = raw.replace(/^(i'?m |i am |we'?re |we are )?(planning|going|hoping)? ?(to )?/i, '').replace(/\s+(in|at)\s+.*$/i, '').trim();
  const name = title ? title[0].toUpperCase() + title.slice(1) : 'Custom event';
  return {
    event: { id: uid(), type: 'custom', title: name.slice(0, 40), age, financialImpact: amount ?? 25000, description: raw, isCustom: true, category: 'other', years: 5 },
    understood: `${name.slice(0, 40)}, ${when}${when.startsWith('at age') ? '' : ` (age ${age})`}${amount ? `, ${'$' + amount.toLocaleString('en-US')}` : ''}`,
  };
}
