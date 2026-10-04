import type { Plan } from '../lib/model';

export const SUGGESTIONS = ['Why is my need this amount?', 'What are my children’s needs?', 'What if my income changes?', 'Term or permanent?'];

// Introductory copy, not a calculated or AI-generated answer.
export function greeting(plan?: Plan | null) {
  return plan
    ? `Let’s talk about ${plan.name}. I can explain your CalcXML assessment, the assumptions behind it, and how the planning tabs fit together. What would you like to understand?`
    : 'I’m Lincoln, your LifeCast guide. I can help you work through the questions and explain how life insurance planning works. Once you review your details, CalcXML can calculate your assessment.';
}
