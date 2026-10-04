import { type FormEvent, useEffect, useRef, useState } from 'react';
import { SUGGESTIONS } from '../agent/guide';
import { usePlannerGuide } from '../agent/lincoln';
import { images } from '../config/content';
import type { Plan } from '../lib/model';
import type { GuideViewContext } from '../lib/reviewContext';

/** Friend-style conversation backed by Amazon Bedrock. */
export function GuideChat({ plan, suggestions = SUGGESTIONS, placeholder = 'Ask Lincoln about your plan', viewContext, unavailableReason }: { plan: Plan; suggestions?: string[]; placeholder?: string; viewContext?: GuideViewContext; unavailableReason?: string }) {
  const chat = usePlannerGuide(plan, viewContext);
  const [draft, setDraft] = useState('');
  const logRef = useRef<HTMLDivElement>(null);
  useEffect(() => { setDraft(''); }, [plan.id]);
  useEffect(() => { logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: 'smooth' }); }, [chat.messages, chat.busy]);
  const ask = async (question: string) => {
    if (!question.trim() || chat.busy || unavailableReason) return;
    setDraft('');
    try { await chat.ask(question); } catch { /* Shared conversation displays errors and retry. */ }
  };
  const submit = (event: FormEvent) => { event.preventDefault(); void ask(draft); };
  return <section className="guide panel" aria-label="Lincoln, your planning guide">
    <div className="guide-head">
      <img src={images.lincolnEmblem} alt="" className="guide-avatar" />
      <div><h2 className="guide-name">Lincoln</h2><p className="guide-role">Your planning guide · Amazon Bedrock</p></div>
    </div>
    <div className="guide-log" ref={logRef} role="log" aria-live="polite" aria-relevant="additions">
      {chat.messages.map(message => <div key={message.id} className={`gmsg ${message.from}`}><p>{message.text}</p></div>)}
      {chat.busy && <div className="gmsg lincoln guide-loading" role="status"><p>Lincoln is checking your assessment and thinking…</p><button className="btn link" onClick={chat.cancel}>Cancel</button></div>}
    </div>
    {unavailableReason && <p className="guide-error" role="status">{unavailableReason}</p>}
    {chat.error && <div className="guide-error" role="alert"><p>{chat.error}</p><button className="btn secondary" disabled={chat.busy || !!unavailableReason} onClick={() => void ask(chat.lastQuestion)}>Try again</button></div>}
    <div className="guide-foot">
      <div className="guide-suggest">{suggestions.map(suggestion => <button key={suggestion} className="reply-chip sm" disabled={chat.busy || !!unavailableReason} onClick={() => void ask(suggestion)}>{suggestion}</button>)}</div>
      <form className="guide-input" onSubmit={submit}>
        <input value={draft} onChange={event => setDraft(event.target.value)} placeholder={placeholder} aria-label="Ask Lincoln a question" maxLength={4000} />
        <button className="btn primary" type="submit" disabled={!draft.trim() || chat.busy || !!unavailableReason}>{chat.busy ? 'Thinking…' : 'Ask'}</button>
      </form>
    </div>
  </section>;
}
