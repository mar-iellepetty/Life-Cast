import { calculatePlan } from '../lib/calc';
import type { Plan } from '../lib/model';
import { money } from '../lib/format';

interface Props {
  plan: Plan;
  savedAt: number | null;
  onAdjust: () => void;
  onSave: () => void;
  onCompare: () => void;
}

/** Everything on this page is derived from the active plan's calculation. */
function analyze(plan: Plan) {
  const c = calculatePlan(plan);
  const i = plan.financialInputs;
  const t = c.today;
  const kids = i.children + plan.lifeEvents.filter((e) => e.type === 'child').length;
  const debts = i.mortgage + i.otherDebts + plan.lifeEvents.filter((e) => e.type === 'home').reduce((s, e) => s + e.financialImpact, 0);
  const adds = t.incomeReplacement + t.educationRequirement + t.debtsRequirement + t.finalRequirement;
  const temporary = t.incomeReplacement + t.educationRequirement + t.debtsRequirement;
  const temporaryShare = adds > 0 ? Math.round((temporary / adds) * 100) : 0;
  const after = c.projection.find((p) => p.age > i.age && p.estimatedCoverageNeed === 0);
  const lifelong = !after || after.age >= 85;
  const years = after ? after.age - i.age : null;
  const ratio = c.termMonthly > 0 ? Math.round(c.permanentMonthly / c.termMonthly) : 0;
  const lean: 'term' | 'permanent' = lifelong || (i.age >= 55 && kids === 0) ? 'permanent' : 'term';
  const drivers = [t.childrenNeed > 0 && 'raising your children', (t.lines.find((l) => l.key === 'income')?.value ?? 0) > 0 && 'replacing your income', t.debtsRequirement > 0 && 'paying off your debts'].filter(Boolean) as string[];
  return { c, i, t, kids, debts, temporaryShare, after, lifelong, years, ratio, lean, drivers };
}

const list = (items: string[]) => (items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`);

export function Review({ plan, savedAt, onAdjust, onSave, onCompare }: Props) {
  const a = analyze(plan);
  const { c, i, t } = a;
  const term = plan.timeline.termYears;

  return (
    <div className="review fade">
      <header className="review-head">
        <div>
          <p className="eyebrow">Review &amp; Plan · {plan.name}</p>
          <h1 className="page-title">Term or permanent: what fits your plan?</h1>
          <p className="page-sub">
            Your estimated need is <strong>{money(t.estimatedCoverageNeed)}</strong>
            {c.suggestedCoverage - t.estimatedCoverageNeed >= 100000 ? (
              <>
                {' '}today, rising to <strong>{money(c.suggestedCoverage)}</strong> at age {c.terms[0].peakAge} with your planned life events, so the options below use that amount
              </>
            ) : null}
            . Here is how the two main types of coverage compare for your situation.
          </p>
        </div>
        <div className="review-actions">
          <button className="btn primary xl" onClick={onAdjust}>
            Adjust Plan
          </button>
          <button className="btn secondary lg" onClick={onSave}>
            {savedAt ? 'Saved' : 'Save Plan'}
          </button>
          <button className="btn ghost lg" onClick={onCompare}>
            Compare plans
          </button>
        </div>
      </header>

      {/* 1. The difference */}
      <section className="tvp">
        <article className={`panel tvp-card ${a.lean === 'term' ? 'lean' : ''}`}>
          <p className="tvp-kicker">Term life insurance</p>
          <h2 className="tvp-title">Protection for the years you need it most</h2>
          <ul className="tvp-points">
            <li>Covers you for a set period, such as 10, 20 or 30 years.</li>
            <li>Generally the lower-cost way to get a large amount of coverage.</li>
            <li>Suited to needs that end, like raising children or paying off a mortgage.</li>
            <li>When the term ends, coverage ends. There is no cash value.</li>
          </ul>
          <div className="tvp-you">
            <span>For you</span>
            <strong>
              About {money(c.termMonthly)}/month for {money(c.suggestedCoverage)} over {term} years
            </strong>
          </div>
        </article>

        <article className={`panel tvp-card ${a.lean === 'permanent' ? 'lean' : ''}`}>
          <p className="tvp-kicker">Permanent (whole) life insurance</p>
          <h2 className="tvp-title">Coverage designed to last your whole life</h2>
          <ul className="tvp-points">
            <li>Lasts for life, as long as premiums are paid.</li>
            <li>Typically costs considerably more than term for the same amount.</li>
            <li>Many policies build cash value you can borrow against.</li>
            <li>Suited to needs that never go away, such as final expenses or an inheritance.</li>
          </ul>
          <div className="tvp-you">
            <span>For you</span>
            <strong>About {money(c.permanentMonthly)}/month for {money(c.suggestedCoverage)} for life</strong>
          </div>
        </article>
      </section>
      <p className="tvp-note">Neither is better in general. The right choice depends on how long your need lasts and what you want the coverage to do.</p>

      {/* 2. Personalized tradeoffs */}
      <section className="panel tradeoffs">
        <h2 className="section-heading">How this applies to you</h2>
        <div className="facts">
          <div>
            <span>Children who depend on you</span>
            <strong>{a.kids}</strong>
          </div>
          <div>
            <span>Yearly income</span>
            <strong>{money(i.annualIncome)}</strong>
          </div>
          <div>
            <span>Debts</span>
            <strong>{money(a.debts)}</strong>
          </div>
          <div>
            <span>Coverage need</span>
            <strong>{money(t.estimatedCoverageNeed)}</strong>
          </div>
        </div>

        <div className="tradeoff-grid">
          <div className={`tradeoff ${a.lean === 'term' ? 'lean' : ''}`}>
            {a.lean === 'term' && <span className="tag">Fits more of your need</span>}
            <h3 className="sub-heading">Why term may fit your situation</h3>
            <p>
              {a.drivers.length > 0 ? (
                <>
                  About <strong>{a.temporaryShare}%</strong> of your need comes from {list(a.drivers)}.{' '}
                </>
              ) : null}
              {a.after ? (
                <>
                  Your need falls to zero around <strong>age {a.after.age}</strong> ({a.after.year}), about {a.years} years from now.{' '}
                </>
              ) : null}
              Because that need is temporary, a {term}-year term policy could cover the full {money(c.suggestedCoverage)} for about {money(c.termMonthly)} a month
              {c.terms.length > 1 ? `, followed by a smaller policy for the ${c.terms.length === 2 ? 'remaining years' : `remaining ${c.terms.length - 1} periods`} as your need declines` : ''}.
            </p>
          </div>

          <div className={`tradeoff ${a.lean === 'permanent' ? 'lean' : ''}`}>
            {a.lean === 'permanent' && <span className="tag">Fits more of your need</span>}
            <h3 className="sub-heading">When permanent may make sense for you</h3>
            <p>
              {a.lifelong ? (
                <>
                  Your need does not end before age 85, so coverage that lasts for life matches it.{' '}
                </>
              ) : (
                <>
                  Permanent coverage would make more sense if you also want coverage that never expires, for example for {money(i.finalExpenses)} in final expenses, an inheritance, or a dependent who will need lifelong support.{' '}
                </>
              )}
              For the same {money(c.suggestedCoverage)}, it would cost about {money(c.permanentMonthly)} a month{a.ratio > 1 ? `, roughly ${a.ratio} times the cost of term` : ''}.
            </p>
            {i.age >= 50 && <p className="muted">At {i.age}, a new term policy later in life can cost much more, which is one reason some people choose permanent coverage now.</p>}
            <p className="muted">Some families combine both: a term policy for the years of highest need, and a smaller permanent policy for lasting needs.</p>
          </div>
        </div>
      </section>

      {/* 3. Similar scenarios */}
      <section className="examples">
        <h2 className="section-heading">How people in similar situations think about it</h2>
        <p className="section-lede">Illustrative examples to show how the decision works. They are not recommendations or financial advice.</p>
        <div className="example-cards">
          {EXAMPLES.map((ex) => (
            <article key={ex.id} className={`panel example ${ex.id === closest(i, a.kids) ? 'closest' : ''}`}>
              {ex.id === closest(i, a.kids) && <span className="tag">Closest to you</span>}
              <h3 className="sub-heading">{ex.title}</h3>
              <p>{ex.text}</p>
            </article>
          ))}
        </div>
        <p className="applies">
          <strong>For you:</strong> {appliesToYou(a.kids, i.age, a.lifelong, a.after?.age)}
        </p>
      </section>

      <p className="disclaimer">Costs are indicative, assume standard health and no tobacco use, and are for education only. They are not an offer of coverage. Actual premiums depend on underwriting.</p>
    </div>
  );
}

const EXAMPLES = [
  { id: 'parent', title: 'Example: young parent', text: 'A household with young children and a large income-replacement need often prioritizes term coverage, because the biggest financial risk is losing income while the children still depend on them.' },
  { id: 'nodeps', title: 'Example: no dependents yet', text: 'Someone single with few debts may need little coverage today. Some buy a modest term policy while costs are low, knowing marriage, children or a home will change their need.' },
  { id: 'lifelong', title: 'Example: lifelong need', text: 'Someone who wants to leave an inheritance, or who supports a dependent for life, may consider permanent coverage, because that need does not disappear after 10, 20 or 30 years.' },
  { id: 'preretire', title: 'Example: approaching retirement', text: 'Someone in their late 50s with a small remaining mortgage may choose a shorter term for the remaining debt, or permanent coverage if final expenses and legacy matter most.' },
];

function closest(i: Plan['financialInputs'], kids: number) {
  if (i.age >= 55) return 'preretire';
  if (kids > 0) return 'parent';
  if (!i.spouse && !i.otherDependents) return 'nodeps';
  return 'lifelong';
}

function appliesToYou(kids: number, age: number, lifelong: boolean, endAge?: number) {
  if (lifelong) return 'your need continues late in life, which is the situation where permanent coverage is most often considered.';
  if (kids > 0) return `like the young parent example, most of your need is tied to children who depend on you${endAge ? ` and ends around age ${endAge}` : ''}. That is the kind of need term coverage is designed for.`;
  if (age >= 55) return 'like the approaching-retirement example, your remaining need is smaller and shorter, so the choice depends mostly on whether you want lasting coverage for final expenses or a legacy.';
  return `your need is ${endAge ? `temporary, ending around age ${endAge}` : 'modest'}. Term coverage covers it at lower cost, while permanent coverage would only add value if you want lifelong protection.`;
}
