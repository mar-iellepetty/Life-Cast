import { type FormEvent, useEffect, useRef, useState } from 'react';
import AvatarDialog from '../../components/lifecast/AvatarDialog';
import { SUGGESTIONS, greeting } from '../agent/guide';
import { usePlannerGuide } from '../agent/lincoln';
import { images } from '../config/content';
import type { Plan } from '../lib/model';

export function PlannerLincolnButton({ plan, label = 'Meet Lincoln', className = 'btn secondary' }: { plan?: Plan | null; label?: string; className?: string }) {
  const [open, setOpen] = useState(false);
  const chat = usePlannerGuide(plan);
  const latest = [...chat.messages].reverse().find(message => message.from === 'lincoln')?.text || greeting(plan);
  useEffect(() => { setOpen(false); }, [plan?.id]);
  return <>
    <button className={className} onClick={() => setOpen(true)}>{label}</button>
    <AvatarDialog key={plan?.id || 'intake'} open={open} onOpenChange={setOpen} message={latest} onAsk={chat.ask} />
  </>;
}

/** Friend-style conversation, backed by the same Bedrock session as the 3D avatar. */
export function GuideChat({ plan }: { plan: Plan }) {
  const chat = usePlannerGuide(plan);
  const [draft, setDraft] = useState('');
  const logRef = useRef<HTMLDivElement>(null);
  useEffect(() => { setDraft(''); }, [plan.id]);
  useEffect(() => { logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: 'smooth' }); }, [chat.messages, chat.busy]);
  const ask = async (question: string) => {
    if (!question.trim() || chat.busy) return;
    setDraft('');
    try { await chat.ask(question); } catch { /* Shared conversation displays errors and retry. */ }
  };
  const submit = (event: FormEvent) => { event.preventDefault(); void ask(draft); };
  return <section className="guide panel" aria-label="Lincoln, your planning guide">
    <div className="guide-head">
      <img src={images.lincolnEmblem} alt="" className="guide-avatar" />
      <div><h2 className="guide-name">Lincoln</h2><p className="guide-role">Your planning guide · Amazon Bedrock</p></div>
      <PlannerLincolnButton plan={plan} className="btn secondary guide-meet" />
    </div>
    <div className="guide-log" ref={logRef} role="log" aria-live="polite" aria-relevant="additions">
      {chat.messages.map(message => <div key={message.id} className={`gmsg ${message.from}`}><p>{message.text}</p></div>)}
      {chat.busy && <div className="gmsg lincoln guide-loading" role="status"><p>Lincoln is checking your assessment and thinking…</p><button className="btn link" onClick={chat.cancel}>Cancel</button></div>}
    </div>
    {chat.error && <div className="guide-error" role="alert"><p>{chat.error}</p><button className="btn secondary" disabled={chat.busy} onClick={() => void ask(chat.lastQuestion)}>Try again</button></div>}
    <div className="guide-foot">
      <div className="guide-suggest">{SUGGESTIONS.map(suggestion => <button key={suggestion} className="reply-chip sm" disabled={chat.busy} onClick={() => void ask(suggestion)}>{suggestion}</button>)}</div>
      <form className="guide-input" onSubmit={submit}>
        <input value={draft} onChange={event => setDraft(event.target.value)} placeholder="Ask Lincoln about your plan" aria-label="Ask Lincoln a question" maxLength={4000} />
        <button className="btn primary" type="submit" disabled={!draft.trim() || chat.busy}>{chat.busy ? 'Thinking…' : 'Ask'}</button>
      </form>
    </div>
  </section>;
}
