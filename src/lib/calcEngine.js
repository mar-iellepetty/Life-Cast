// UI formatting and scenario definitions. CalcXML on the server owns the insurance calculation.

export const CURRENT_YEAR = 2026;
export const TIMELINE_END = 2050;
export const TIMELINE_SPAN = TIMELINE_END - CURRENT_YEAR;

export const DEFAULT_ASSUMPTIONS = {
  incomeYears: 10,
  afterTaxFactor: 0.75,
  educationPerChild: 150000,
  finalExpenses: 25000,
  newHomePrice: 320000,
  savingsBoost: 25000,
  incomeChangePct: 0.2
};

export const EVENT_CARDS = [
  { type: 'child', icon: 'baby', label: 'Another Child', hint: 'New dependent + education goal' },
  { type: 'buy_home', icon: 'home', label: 'Buy a Home', hint: 'Adds a future mortgage' },
  { type: 'lose_coverage', icon: 'briefcase', label: 'Lose Employer Coverage', hint: 'Existing coverage → $0' },
  { type: 'income_up', icon: 'trending_up', label: 'Income Increase', hint: '+20% modeled income' },
  { type: 'income_down', icon: 'trending_down', label: 'Income Decrease', hint: '−20% modeled income' },
  { type: 'college', icon: 'graduation_cap', label: 'College Goal', hint: 'Adds an education goal' },
  { type: 'debt_paid', icon: 'credit_card', label: 'Debt Paid Off', hint: 'Other debt → $0' },
  { type: 'savings_boost', icon: 'landmark', label: 'Savings Increase', hint: '+$25,000 resources' },
  { type: 'mortgage_paid', icon: 'key', label: 'Mortgage Paid Off', hint: 'Home obligation shrinks' }
];

export const fmtMoney = (v) =>
  '$' + Math.round(Number(v) || 0).toLocaleString('en-US');

export const fmtShort = (v) => {
  const n = Number(v) || 0;
  if (Math.abs(n) >= 1000000) return '$' + (n / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
  if (Math.abs(n) >= 1000) return '$' + Math.round(n / 1000) + 'K';
  return '$' + Math.round(n);
};

export function normalizeProfile(raw = {}) {
  const deps = Array.isArray(raw.dependents)
    ? raw.dependents
        .map((d) => (typeof d === 'object' && d !== null ? Number(d.age) : Number(d)))
        .filter((a) => Number.isFinite(a))
    : [];
  return {
    age: Number(raw.age) || 35,
    maritalStatus: raw.maritalStatus || 'single',
    dependents: deps,
    primaryIncome: Number(raw.primaryIncome) || 0,
    spouseIncome: Number(raw.spouseIncome) || 0,
    mortgage: Number(raw.mortgageBalance ?? raw.mortgage) || 0,
    otherDebt: Number(raw.otherDebt) || 0,
    savings: Number(raw.savings) || 0,
    existingCoverage: Number(raw.existingCoverage) || 0,
    coverageSource: raw.coverageSource || 'none'
  };
}

export function diffModels(a, b) {
  const keys = [...new Set([...a.needsRows, ...b.needsRows].map((row) => row.key))];
  const rows = keys.map((key) => {
    const left = a.needsRows.find((row) => row.key === key);
    const right = b.needsRows.find((row) => row.key === key);
    return { key, label: (right || left).label, a: left?.value || 0, b: right?.value || 0 };
  });
  rows.push({ key: 'resources', label: 'Available resources', a: a.resources, b: b.resources });
  const changed = rows.filter((r) => Math.abs(r.a - r.b) > 0.5);
  return {
    rows,
    changed,
    gapA: a.gap,
    gapB: b.gap,
    needsA: a.totalNeeds,
    needsB: b.totalNeeds
  };
}