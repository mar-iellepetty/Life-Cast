import { fromBackendEvents, fromHousehold, toHousehold } from '../lib/lifecastModel.js';

async function request(path, body, signal) {
  const response = await fetch(path, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body), signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(90000)]) : AbortSignal.timeout(90000),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error((typeof data?.error === 'string' ? data.error : data?.error?.message) || `LifeCast returned HTTP ${response.status}.`);
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('LifeCast returned an unreadable JSON response. Please try again.');
  return data;
}

export function guide({ question, history = [], profile = null, context = '', assessment = null, calculatorInput = null, signal = undefined }) {
  return request('/api/guide', {
    question, history: history.map((item) => ({ role: item.role, text: item.text ?? item.content ?? '' })),
    profile: profile ? toHousehold(profile) : undefined,
    context, assessment, calculatorInput, provider: 'bedrock',
  }, signal);
}

export function calculate(input, signal) { return request('/api/calculate', input, signal); }

export async function intake(text) {
  const result = await request('/api/intake', { text });
  const profile = fromHousehold(result.household);
  return { profile: { ...profile,
    summary: 'Review the details Bedrock read from your description, then build your LifeCast.',
    missing: ['Unstated amounts default to zero; verify the details before calculating.'],
  } };
}

export async function assistant(payload) {
  const question = payload.question || 'Explain why the modeled scenario changed using only the supplied calculator results.';
  const model = payload.model;
  const result = await guide({ question, history: payload.history,
    profile: model?.household || payload.profile, context: payload.context,
    assessment: model?.assessment, calculatorInput: model?.calculatorInput, signal: payload.signal });
  // Explicit what-if prompts may add editable events; general questions do not.
  const isScenario = payload.mode === 'query' && /\b(what if|what happens if|what changes once|add|simulate|suppose|imagine)\b/i.test(question);
  if (isScenario) {
    try {
      const extracted = await request('/api/events', { text: question }, payload.signal);
      result.events = fromBackendEvents(extracted.events);
    } catch (error) {
      if (payload.signal?.aborted) throw error;
      result.events = [];
      result.answer = `${result.answer || result.reply} I couldn't update the timeline; you can add the event using the cards.`;
    }
  }
  return { ...result, answer: result.answer || result.reply, events: result.events || [] };
}
