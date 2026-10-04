// Hook for the Lincoln AI / voice agent.
// The UI calls `lincoln.speak(...)` whenever Lincoln talks, and `lincoln.answer(...)` when the user
// types a question in the guide. Until the real agent is connected, `answer` returns null and the
// built-in guide (src/agent/guide.ts) answers from the user's own calculation.

import type { Plan } from '../lib/model';

export interface LincolnAgent {
  /** Lincoln says a line out loud (no-op for now). */
  speak(text: string): void;
  /** Stop any speech in progress. */
  stop(): void;
  /** Answer a free-text question about the plan. Return null to fall back to the built-in guide. */
  answer(question: string, plan: Plan): Promise<string | null>;
}

export const lincoln: LincolnAgent = {
  speak: () => {},
  stop: () => {},
  answer: async () => null,
};
