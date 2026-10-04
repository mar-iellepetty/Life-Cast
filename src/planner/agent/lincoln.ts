import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { guide } from '../../api/lifecastApi';
import { getPlannerAssessment, plannerContext } from '../lib/backend';
import type { Plan } from '../lib/model';
import { greeting } from './guide';

export interface GuideMessage { id: number; from: 'lincoln' | 'user'; text: string; introduction?: boolean }
interface Snapshot { messages: GuideMessage[]; busy: boolean; error: string; lastQuestion: string }
interface Conversation { snapshot: Snapshot; listeners: Set<() => void>; controller: AbortController | null; generation: number; nextId: number; planFingerprint?: string }
const conversations = new Map<string, Conversation>();
const MAX_CONVERSATIONS = 40, MAX_MESSAGES = 60, MAX_TRANSCRIPT_CHARACTERS = 60000;
const keyFor = (plan?: Plan | null) => plan?.id || '__intake__';
function boundedMessages(messages: GuideMessage[]) {
  const recent = messages.slice(-MAX_MESSAGES);
  let characters = recent.reduce((total, message) => total + message.text.length, 0);
  while (recent.length > 1 && characters > MAX_TRANSCRIPT_CHARACTERS) characters -= recent.shift()!.text.length;
  return recent;
}
function cancelConversation(conversation: Conversation) {
  conversation.generation++; conversation.controller?.abort(); conversation.controller = null;
  if (conversation.snapshot.busy) update(conversation, { busy: false, error: '' });
}
function conversationFor(plan?: Plan | null) {
  const key = keyFor(plan);
  if (!conversations.has(key)) {
    for (const [oldKey, old] of conversations) {
      if (conversations.size < MAX_CONVERSATIONS) break;
      if (old.listeners.size === 0) { cancelConversation(old); conversations.delete(oldKey); }
    }
    conversations.set(key, {
    snapshot: { messages: [{ id: 0, from: 'lincoln', text: greeting(plan), introduction: true }], busy: false, error: '', lastQuestion: '' },
    listeners: new Set(), controller: null, generation: 0, nextId: 1,
    });
  }
  return conversations.get(key)!;
}
function update(conversation: Conversation, patch: Partial<Snapshot>) {
  conversation.snapshot = { ...conversation.snapshot, ...patch, ...(patch.messages ? { messages: boundedMessages(patch.messages) } : {}) };
  conversation.listeners.forEach(listener => listener());
}
export function cancelPlannerGuide(plan?: Plan | null) {
  const conversation = conversations.get(keyFor(plan));
  if (conversation) cancelConversation(conversation);
}

/** Delete/reset is also a boundary for private, unsaved conversation state. */
export function forgetPlannerGuide(planId?: string) {
  const key = planId || '__intake__', conversation = conversations.get(key);
  if (!conversation) return;
  cancelConversation(conversation);
  update(conversation, { messages: [], error: '', lastQuestion: '' });
  conversations.delete(key);
}
export function clearPlannerGuides() {
  for (const key of [...conversations.keys()]) forgetPlannerGuide(key);
}

/** Plan-specific Bedrock history, retained only for the current workspace. */
export async function askPlannerGuide(plan: Plan | null | undefined, question: string, options: { signal?: AbortSignal } = {}): Promise<string> {
  const text = question.trim();
  if (!text) throw new Error('Enter a question for Lincoln.');
  if (text.length > 4000) throw new Error('Keep your question under 4,000 characters.');
  const conversation = conversationFor(plan);
  if (conversation.snapshot.busy) throw new Error('Lincoln is still answering. Cancel the current request or wait for the reply.');
  const controller = new AbortController(), generation = ++conversation.generation;
  conversation.controller = controller;
  const signal = options.signal ? AbortSignal.any([options.signal, controller.signal]) : controller.signal;
  let prior = conversation.snapshot.messages;
  if (prior.at(-1)?.from === 'user' && prior.at(-1)?.text === text) prior = prior.slice(0, -1);
  const history = prior.filter(message => !message.introduction).slice(-12).map(message => ({ role: message.from === 'user' ? 'user' : 'assistant', text: message.text }));
  const pending = [...prior, { id: conversation.nextId++, from: 'user' as const, text }];
  update(conversation, { messages: pending, busy: true, error: '', lastQuestion: text });
  try {
    const assessment = plan ? await getPlannerAssessment(plan, { signal }) : null;
    if (signal.aborted) throw new DOMException('Cancelled', 'AbortError');
    const result = await guide({ question: text, history,
      profile: assessment?.household || null, assessment: assessment?.assessment || null,
      calculatorInput: assessment?.calculatorInput || null,
      context: plan ? plannerContext(plan, assessment!) : 'The user is completing the initial LifeCast questions. No household details have been confirmed and no calculator assessment is available. Give general educational guidance or ask a clarifying question. Do not invent financial details, calculator results, quotes, or premiums.', signal,
    });
    if (signal.aborted || generation !== conversation.generation) throw new DOMException('Cancelled', 'AbortError');
    const answer = result.answer || result.reply;
    if (typeof answer !== 'string' || !answer.trim()) throw new Error('Lincoln received no answer from Bedrock. Please try again.');
    if (answer.length > MAX_TRANSCRIPT_CHARACTERS) throw new Error('Lincoln returned an unusually long response. Please try a shorter question.');
    update(conversation, { messages: [...pending, { id: conversation.nextId++, from: 'lincoln', text: answer.trim() }], busy: false, error: '' });
    return answer.trim();
  } catch (error) {
    if (generation === conversation.generation) update(conversation, { busy: false, error: signal.aborted ? '' : error instanceof Error ? error.message : 'The Bedrock guide could not respond. Please try again.' });
    throw error;
  } finally { if (generation === conversation.generation) conversation.controller = null; }
}

export function usePlannerGuide(plan?: Plan | null) {
  const conversation = conversationFor(plan);
  const fingerprint = plan ? JSON.stringify([plan.financialInputs, plan.lifeEvents, plan.timeline]) : '';
  const subscribe = useCallback((listener: () => void) => {
    conversation.listeners.add(listener);
    return () => {
      conversation.listeners.delete(listener);
      // StrictMode can unsubscribe and immediately subscribe again.
      setTimeout(() => { if (conversation.listeners.size === 0) cancelConversation(conversation); }, 0);
    };
  }, [conversation]);
  const getSnapshot = useCallback(() => conversation.snapshot, [conversation]);
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  useEffect(() => {
    if (conversation.planFingerprint !== undefined && conversation.planFingerprint !== fingerprint) cancelPlannerGuide(plan);
    conversation.planFingerprint = fingerprint;
  }, [conversation, fingerprint, plan]);
  const ask = useCallback((question: string, options: { signal?: AbortSignal } = {}) => askPlannerGuide(plan, question, options), [plan]);
  const cancel = useCallback(() => cancelPlannerGuide(plan), [plan]);
  return { ...snapshot, ask, cancel };
}

export const lincoln = { answer: (question: string, plan?: Plan | null, options?: { signal?: AbortSignal }) => askPlannerGuide(plan, question, options) };
