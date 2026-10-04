// ---------------------------------------------------------------------------
// Brain 1 — Insurance Knowledge (retrieval).
//
// Two layers:
//   1. Lincoln Financial's plain-language framing (the codeLinc deck) — the
//      TRUSTED, priority source, carefully paraphrased for compliance.
//   2. Broad general life-insurance knowledge covering the topics any good
//      agent should know. Retrieved and injected so the model answers grounded,
//      not from loose memory. When a question falls outside this set, the model
//      may use its own general knowledge, but Lincoln framing always wins.
//
// A keyword retriever stands in for a Bedrock Knowledge Base: same interface
// (query in, passages out), so it swaps for bedrock-agent-runtime Retrieve.
// ---------------------------------------------------------------------------

/** @type {{ id:string, tags:string[], text:string, source:string, lincoln?:boolean }[]} */
export const KNOWLEDGE = [
  // ---------- Lincoln-grounded core ----------
  {
    id: "what-is",
    lincoln: true,
    tags: ["what", "life insurance", "need", "purpose", "why", "beginner", "start", "point"],
    text:
      "Life insurance provides financial support to the people who depend on someone financially if that person passes away. It helps a family keep paying for things like a mortgage, debts, and everyday living costs when the income earner is gone.",
    source: "Lincoln Financial — Life insurance overview",
  },
  {
    id: "term",
    lincoln: true,
    tags: ["term", "temporary", "defined period", "cheaper", "20 year", "30 year", "level term"],
    text:
      "Term insurance is coverage for a defined period (such as 10, 20, or 30 years). It is generally straightforward protection and tends to cost less for the same death benefit while it is in force. It is often used for time-bound needs, like the years a mortgage is being paid off or children are dependent. If the term ends, coverage stops unless renewed or converted.",
    source: "Lincoln Financial — Life insurance at a glance",
  },
  {
    id: "permanent",
    lincoln: true,
    tags: ["permanent", "whole", "whole life", "universal", "lasts", "lifelong", "cash value"],
    text:
      "Permanent insurance (such as whole life or universal life) is designed to remain in place longer and may include additional features beyond the death benefit, depending on the product — some build cash value over time. It generally costs more than term for the same death benefit. Features and availability differ by product.",
    source: "Lincoln Financial — Permanent life insurance",
  },
  {
    id: "term-vs-permanent",
    lincoln: true,
    tags: ["difference", "term vs", "whole vs", "compare", "which", "tradeoff", "versus", "better"],
    text:
      "The core difference: term lasts for a defined period and is usually lower cost; permanent is designed to last longer and may carry extra features (and sometimes cash value) at a higher cost. Which fits depends on how long the need lasts and what the person can afford — neither is universally 'better'.",
    source: "Lincoln Financial — Life insurance at a glance",
  },
  {
    id: "need-factors",
    lincoln: true,
    tags: ["how much", "need", "factors", "shape", "depends", "calculate", "amount", "coverage amount"],
    text:
      "How much coverage someone may need is shaped by: the people who depend on their income, the income that would need replacing, mortgage and other debts, education or future family expenses, any existing employer or personal coverage, and what they can comfortably afford.",
    source: "Lincoln Financial — Inputs that may shape a customer's need",
  },
  {
    id: "income-replacement",
    lincoln: true,
    tags: ["income", "replacement", "replace", "salary", "earn", "paycheck", "why income"],
    text:
      "Replacing income means providing a lump sum that could stand in for the earner's paychecks for the years the family would still rely on them — long enough, for example, to raise dependent children or reach a spouse's retirement.",
    source: "Lincoln Financial — What are your goals?",
  },
  {
    id: "mortgage",
    lincoln: true,
    tags: ["mortgage", "home", "house", "why mortgage"],
    text:
      "A mortgage matters because it is usually a family's largest ongoing obligation. Including it in coverage lets survivors stay in the home without the monthly payment becoming a burden.",
    source: "Lincoln Financial — What are your goals?",
  },
  {
    id: "employer-coverage",
    lincoln: true,
    tags: ["employer", "work", "group", "benefits", "job", "2x", "multiple of salary", "workplace"],
    text:
      "Employer or group life insurance is coverage offered through a workplace, often expressed as a multiple of salary (for example, two times annual salary). It counts toward existing coverage, but may be limited and may not continue if the person leaves the job.",
    source: "Lincoln Financial — Life insurance overview",
  },
  {
    id: "affordability",
    lincoln: true,
    tags: ["afford", "cost", "budget", "premium", "price", "expensive", "monthly"],
    text:
      "Affordability matters: the right amount of coverage is one the person can comfortably pay for over time. A needs estimate is a starting point, balanced against the budget.",
    source: "Lincoln Financial — Inputs that may shape a customer's need",
  },

  // ---------- Broad general life-insurance knowledge ----------
  {
    id: "universal-life",
    tags: ["universal", "ul", "iul", "indexed universal", "flexible premium"],
    text:
      "Universal life is a type of permanent insurance with flexible premiums and a cash value component that earns interest. Variants include indexed universal life (cash value tied to a market index, with caps and floors) and guaranteed universal life (focused on a lasting death benefit with minimal cash value). Terms vary by product.",
    source: "General life-insurance knowledge",
  },
  {
    id: "whole-life",
    tags: ["whole life", "guaranteed", "dividends", "level premium", "cash value"],
    text:
      "Whole life is permanent insurance with level premiums, a guaranteed death benefit, and cash value that grows at a guaranteed rate; some policies may pay non-guaranteed dividends. It is predictable but typically more expensive than term.",
    source: "General life-insurance knowledge",
  },
  {
    id: "variable-life",
    tags: ["variable", "vul", "investment", "subaccounts", "market"],
    text:
      "Variable life insurance lets the policyholder invest the cash value in subaccounts similar to mutual funds; the death benefit and cash value can rise or fall with investment performance, carrying more risk. It is a securities product with its own disclosures.",
    source: "General life-insurance knowledge",
  },
  {
    id: "final-expense",
    tags: ["final expense", "burial", "funeral", "small policy", "seniors"],
    text:
      "Final expense (burial) insurance is a small whole life policy meant to cover funeral and end-of-life costs. Face amounts are modest, underwriting is simpler, and it is often used by older applicants.",
    source: "General life-insurance knowledge",
  },
  {
    id: "beneficiary",
    tags: ["beneficiary", "who gets", "payout", "claim", "primary", "contingent"],
    text:
      "A beneficiary is the person or entity who receives the death benefit. A primary beneficiary is first in line; a contingent beneficiary receives it if the primary cannot. Keep beneficiaries current after major life events, and consider naming contingents.",
    source: "General life-insurance knowledge",
  },
  {
    id: "riders",
    tags: ["rider", "add-on", "waiver", "accelerated", "term rider", "child rider", "accidental"],
    text:
      "Riders are optional add-ons to a policy. Common ones include accelerated death benefit (access part of the benefit if terminally ill), waiver of premium (premiums waived if disabled), accidental death, child term riders, and guaranteed insurability. Availability and cost vary by insurer.",
    source: "General life-insurance knowledge",
  },
  {
    id: "underwriting",
    tags: ["underwriting", "medical exam", "health", "approval", "rate class", "no exam"],
    text:
      "Underwriting is how an insurer assesses risk to set the premium, considering age, health, medical history, lifestyle, and sometimes a medical exam. Healthier applicants get better rate classes. Some policies offer simplified or no-exam underwriting at a higher cost.",
    source: "General life-insurance knowledge",
  },
  {
    id: "premium",
    tags: ["premium", "payment", "how much pay", "monthly cost", "rate"],
    text:
      "The premium is the amount paid to keep a policy in force, usually monthly or annually. Term premiums are generally lower; permanent premiums are higher because part funds cash value and lifelong coverage. Price depends mainly on age, health, coverage amount, and policy type.",
    source: "General life-insurance knowledge",
  },
  {
    id: "cash-value",
    tags: ["cash value", "surrender", "loan", "borrow", "accumulation"],
    text:
      "Cash value is a savings component inside permanent policies that grows tax-deferred. The owner may be able to borrow against it or withdraw from it, though loans reduce the death benefit if unpaid, and surrendering may incur charges. Term policies have no cash value.",
    source: "General life-insurance knowledge",
  },
  {
    id: "taxes",
    tags: ["tax", "taxable", "taxes", "estate", "income tax"],
    text:
      "In general, life-insurance death benefits are paid to beneficiaries income-tax-free. Cash value grows tax-deferred. Large estates can face estate-tax considerations. Tax rules are complex and situational — this is general information, not tax advice.",
    source: "General life-insurance knowledge",
  },
  {
    id: "how-long",
    tags: ["how long", "term length", "how many years", "duration", "20 vs 30"],
    text:
      "A common approach is to match the coverage length to how long others depend on the income — for example, until the youngest child is independent or a mortgage is paid off. That is why many people pick a term that covers their highest-obligation years.",
    source: "General life-insurance knowledge",
  },
  {
    id: "rule-of-thumb",
    tags: ["rule of thumb", "ten times", "10x", "multiple of income", "quick estimate"],
    text:
      "A rough rule of thumb is coverage around 10 to 12 times annual income, but it ignores specifics. A needs-based analysis — adding obligations like income replacement, mortgage, debts, and education, then subtracting existing resources — is more accurate, which is what this tool does.",
    source: "General life-insurance knowledge",
  },
  {
    id: "group-vs-individual",
    tags: ["group vs", "individual policy", "portable", "own policy", "supplement"],
    text:
      "Group coverage through an employer is convenient and often low-cost, but is usually limited in amount and may not move with you if you change jobs. An individual policy is yours to keep and can be sized to your needs; many people use both together.",
    source: "General life-insurance knowledge",
  },
  {
    id: "no-dependents",
    tags: ["single", "no kids", "no dependents", "do i need", "young"],
    text:
      "Someone with no dependents and few debts may need little or no coverage, though some buy young to lock in low rates or to cover co-signed debts and final expenses. The need grows with dependents, debts, and obligations.",
    source: "General life-insurance knowledge",
  },
  {
    id: "stay-at-home",
    tags: ["stay at home", "homemaker", "non-earning", "spouse coverage"],
    text:
      "A non-earning spouse still has economic value — childcare, household management — that would cost money to replace. Coverage on a stay-at-home parent can fund those services if they pass away.",
    source: "General life-insurance knowledge",
  },
];

/**
 * Retrieve the most relevant passages for a query. Lincoln-sourced passages are
 * weighted higher so the trusted framing wins ties. Returns a formatted string
 * (empty if nothing clearly matches). Mirrors a Knowledge Base Retrieve call.
 */
export function retrieveKnowledge(query, topK = 4) {
  const q = String(query || "").toLowerCase();
  if (!q.trim()) return "";

  const scored = KNOWLEDGE.map((doc) => {
    let score = 0;
    for (const tag of doc.tags) {
      if (q.includes(tag)) score += tag.split(" ").length;
    }
    if (score > 0 && doc.lincoln) score += 0.5; // prefer Lincoln framing on ties
    return { doc, score };
  })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);

  if (scored.length === 0) return "";

  return scored.map((s) => `- ${s.doc.text} (Source: ${s.doc.source})`).join("\n");
}
