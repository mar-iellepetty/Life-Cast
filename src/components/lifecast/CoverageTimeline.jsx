const YEARS_TO = (from, to) => to - from;

// Coverage Timeline — term vs. permanent characteristics mapped onto YOUR modeled life (stretch goal).
export default function CoverageTimeline({ model }) {
  const age = model.household.person.age;
  const span = Math.max(35, 100 - age);
  const pos = (a) => `${Math.min(100, Math.max(0, ((a - age) / span) * 100))}%`;

  const dependentAges = model.household.children.map((child) => child.age);
  const youngest = dependentAges.length > 0 ? Math.min(...dependentAges) : null;
  const childEnd = youngest !== null ? age + Math.max(0, YEARS_TO(youngest, 22)) : age;
  const eduStart = youngest !== null ? age + Math.max(0, YEARS_TO(youngest, 18)) : age;
  const eduEnd = childEnd;
  const mortgageEnd = model.household.debts.mortgage > 0 ? age + 30 : age;
  const incomeEnd = age + model.horizon;
  const termEnd = age + 30;

  const obligationEnd = Math.max(childEnd, mortgageEnd, incomeEnd, eduEnd);
  const termCoversObligations = obligationEnd <= termEnd;

  const bars = [
    { label: 'Children (dependency)', from: age, to: childEnd, color: '#E67E22' },
    { label: 'Mortgage', from: age, to: mortgageEnd, color: '#D9A05B' },
    { label: 'Education window', from: eduStart, to: eduEnd, color: '#6B8F82' },
    { label: 'Income replacement', from: age, to: incomeEnd, color: '#C9A227' },
    { label: 'Term example (30-yr)', from: age, to: termEnd, color: undefined, outline: true },
    { label: 'Permanent example', from: age, to: age + span, color: '#8A9BA8' }
  ];

  return (
    <div className="rounded-xl border border-[#E9E0D4] bg-white p-5 shadow-[0_2px_16px_rgba(43,27,18,0.05)]">
      <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-display text-lg text-[#4A1C1C]">Coverage Timeline</h3>
        <span className="text-xs text-[#8A7A6B]">Term vs. permanent — mapped to your life, not a chart</span>
      </div>
      <p className="mb-5 text-xs leading-relaxed text-[#2B1B12]/60">
        Term coverage is designed to cover a defined period. Permanent coverage is designed to remain in place longer, potentially with additional features depending on the product. Here is how each relates to <span className="font-medium text-[#C96A18]">your</span> modeled obligations.
      </p>

      <div className="space-y-3">
        {bars.map((b) => (
          <div key={b.label} className="flex items-center gap-3">
            <span className="w-[132px] shrink-0 text-xs text-[#2B1B12]/75">{b.label}</span>
            <div className="relative h-3.5 flex-1 rounded-full bg-[#FAF7F2]">
              <div
                className={`absolute top-0 h-full rounded-full ${b.outline ? 'border border-[#4A1C1C]/50 bg-[#4A1C1C]/10' : ''}`}
                style={{ left: pos(b.from), width: `${Math.max(0, parseFloat(pos(b.to)) - parseFloat(pos(b.from)))}%`, background: b.outline ? undefined : b.color }}
              />
            </div>
            <span className="w-[76px] shrink-0 text-right text-[10px] tabular-nums text-[#8A7A6B]">to age {Math.round(b.to)}</span>
          </div>
        ))}
      </div>

      <div className="mt-5 space-y-2 rounded-lg border border-[#E9E0D4] bg-[#FAF7F2] p-4 text-xs leading-relaxed text-[#2B1B12]/80">
        <p>
          <span className="font-medium text-[#C96A18]">Your scenario:</span> your modeled obligations (income replacement, home, education) largely resolve by about <span className="font-medium">age {Math.round(obligationEnd)}</span>.
        </p>
        <p>
          <span className="font-medium text-[#C96A18]">Tradeoff for you:</span>{' '}
          {termCoversObligations
            ? `a 30-year term window would extend to age ${termEnd} — past your modeled dependency horizon. The tradeoff: term generally costs less for a given amount of coverage, but typically ends after its defined period.`
            : `your modeled obligations extend to age ${Math.round(obligationEnd)}, beyond a 30-year term window (ending age ${termEnd}). The tradeoff: term generally costs less for a given amount of coverage, while permanent coverage is designed to remain in place longer, potentially with additional features depending on the product — generally at a higher ongoing cost.`}
        </p>
        <p className="text-[#8A7A6B]">
          Illustration assumptions: children depend on support until age 22, education runs from 18–22, and any outstanding mortgage is shown for 30 years. These are illustrative durations, not a loan payoff forecast or a policy recommendation.
        </p>
      </div>
    </div>
  );
}
