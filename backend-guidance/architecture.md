# LifeCast — Core Architecture Principle

This is the rule that keeps LifeCast trustworthy. Enforce it in every change.

## The calculation / explanation boundary

**The deterministic engine calculates. The AI explains. These never cross.**

- `src/engine/*` is pure, typed, and framework-free. Given the same
  `Household` + `Assumptions`, it always returns the identical `NeedsAssessment`.
  It must NEVER call an LLM, use randomness, or read wall-clock time inside a
  calculation.
- `src/ai/*` only turns the engine's structured output into language. It must
  NEVER invent, re-derive, or alter a number. Every figure it mentions must come
  from an engine field.
- The Bedrock boundary lives in `src/ai/bedrock.ts`. In production the narrator
  is replaced by a Bedrock call that receives the engine output as ground truth
  and is constrained by `EXPLAIN_SYSTEM_PROMPT` to explain only.

## Why this matters for judging

- "Does it work?" → the engine is deterministic and unit-tested, so results are
  reproducible and defensible.
- "Explainability" → every line item carries `explanation`, `formula`, and
  `source`. The UI's "Explain Every Number" and "Why did it change?" features
  read straight from these fields.
- "Technical creativity" → natural language modifies a visual simulation, but
  the money math stays in a boring, correct, testable core.

## Non-negotiables

1. Add a unit test for any new engine behavior.
2. Never recommend a specific product. Term vs. permanent surfaces *tradeoffs*
   only (Path 2 framing).
3. Keep the coverage gap floored at 0 — never show a negative need.
4. Prefer an honest range over fake precision in anything user-facing.
