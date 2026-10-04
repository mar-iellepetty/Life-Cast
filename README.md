# Lincoln Financial Group — Life Insurance Planning

A client-facing life insurance planning experience: a short questionnaire, an explainable coverage projection, a drag-and-drop life events timeline, multiple independent plans, and a review page with example scenarios.

## Run it

```bash
npm install
npm run dev
```

Open http://localhost:5173. To skip the questionnaire with sample data: `/?demo`, `/?demo=events`, `/?demo=review`.

## Flow

1. **Home**: value proposition, "What we'll ask, and why" (dependents, income, debts, existing coverage, life events), sourced statistics.
2. **Conversation**: Lincoln asks one question at a time and explains why, with quick replies and small inline inputs.
3. **Financial Planning**: Lincoln's guide chat on top (answers questions from your own numbers), one large chart of your children's needs over time, and the total need with expandable + / − calculations and editable inputs.
4. **Life Events**: type an event in plain words ("buying a home in 2 years") or pick a suggestion. Your events are listed on the right and can be edited inline. No popups.
5. **Review & Plan**: term vs. permanent, personalized tradeoffs for your numbers, and illustrative examples of how similar households decide.

The plans bar (bottom) creates, duplicates, renames, deletes and switches plans. **+ Add New** also opens example templates.

The guide chat is rule-based for now (`src/agent/guide.ts`). Connect the AI agent by implementing `lincoln.answer()` in `src/agent/lincoln.ts`; the chat uses it automatically when it returns an answer.

## Architecture

| Concern | File |
| --- | --- |
| Data model (`Plan`, `FinancialInputs`, `LifeEvent`, `Timeline`) | `src/lib/model.ts` |
| Calculation engine (`calculatePlan`, `calculateAt`, `eventImpact`) | `src/lib/calc.ts` |
| Plain-language life event parser | `src/lib/parseEvent.ts` |
| Central state (reducer for every plan and event change) | `src/state/store.ts` |
| Example scenarios and templates | `src/data/templates.ts` |
| Replaceable copy, statistics, imagery, testimonials | `src/config/content.ts` |

Every number and every explanation shown behind an information button comes from `calculatePlan(plan)`. The methodology is documented at the top of `calc.ts`. Coverage terms are derived from the plan: when a term ends and a need remains, the next term is added automatically. Deleting an automatic term is stored in `plan.timeline.dismissedTermStarts`.

## Content notes

- The tagline is a **placeholder**, not a verified Lincoln Financial slogan. Replace it in `src/config/content.ts`.
- Statistics are from LIMRA's 2025 Insurance Barometer Study news release (June 25, 2025), linked on the page.
- Testimonials and example scenarios are illustrative and labeled as such.
- The emblem is cropped from the provided low-resolution logo. Replace `public/images/lincoln-emblem@4x.png` with an approved high-resolution asset.
- Save Plan stores plans in the browser's local storage on this device only.
- `src/agent/lincoln.ts` is the hook for the future voice agent. The questionnaire calls `lincoln.speak()` for each question.
