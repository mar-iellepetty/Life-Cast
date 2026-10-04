import type { Plan } from '../lib/model';

export const SUGGESTIONS = ['Why is my need this amount?', 'What are my children’s needs?', 'What if my income changes?', 'Term or permanent?'];
export const EVENT_SUGGESTIONS = ['How would a new child change my plan?', 'What if I buy a bigger home?', 'Which of my life events matters most?', 'When should I plan for retirement?'];
export const REVIEW_SUGGESTIONS = ['Why this term length?', 'Is term or permanent better for me?', 'How do I compare to the benchmark?', 'What should I ask an advisor?'];

// Introductory copy, not a calculated or AI-generated answer.
export function greeting(plan?: Plan | null) {
  return plan
    ? `Let’s talk about ${plan.name}. I can explain your CalcXML assessment, the assumptions behind it, and how the planning tabs fit together. What would you like to understand?`
    : 'I’m Lincoln, your LifeCast guide. I can help you work through the questions and explain how life insurance planning works. Once you review your details, CalcXML can calculate your assessment.';
}
