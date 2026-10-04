import { FormEvent, useEffect, useRef, useState } from 'react';
import { SUGGESTIONS, answer, greeting } from '../agent/guide';
import { lincoln } from '../agent/lincoln';
import { images } from '../config/content';
import type { Plan } from '../lib/model';

interface Message {
  from: 'lincoln' | 'user';
  text: string;
}

/** Conversational guidance at the top of the planning page. */
export function GuideChat({ plan }: { plan: Plan }) {
  const [messages, setMessages] = useState<Message[]>(() => [{ from: 'lincoln', text: greeting(plan) }]);
  const [draft, setDraft] = useState('');
  const logRef = useRef<HTMLDivElement>(null);
  const planRef = useRef(plan);
  planRef.current = plan;

  // A different plan starts a fresh conversation.
  useEffect(() => {
    setMessages([{ from: 'lincoln', text: greeting(planRef.current) }]);
  }, [plan.id]);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: 'smooth' });
    const last = messages[messages.length - 1];
    if (last.from === 'lincoln') lincoln.speak(last.text);
  }, [messages]);

  const ask = async (q: string) => {
    if (!q.trim()) return;
    setMessages((m) => [...m, { from: 'user', text: q.trim() }]);
    setDraft('');
    const reply = (await lincoln.answer(q, planRef.current)) ?? answer(q, planRef.current);
    setMessages((m) => [...m, { from: 'lincoln', text: reply }]);
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    ask(draft);
  };

  return (
    <section className="guide panel" aria-label="Lincoln, your planning guide">
      <div className="guide-head">
        <img src={images.lincolnEmblem} alt="" className="guide-avatar" />
        <div>
          <h2 className="guide-name">Lincoln</h2>
          <p className="guide-role">Your planning guide</p>
        </div>
      </div>
      <div className="guide-log" ref={logRef} aria-live="polite">
        {messages.map((m, i) => (
          <div key={i} className={`gmsg ${m.from}`}>
            <p>{m.text}</p>
          </div>
        ))}
      </div>
      <div className="guide-foot">
        <div className="guide-suggest">
          {SUGGESTIONS.map((s) => (
            <button key={s} className="reply-chip sm" onClick={() => ask(s)}>
              {s}
            </button>
          ))}
        </div>
        <form className="guide-input" onSubmit={submit}>
          <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Ask Lincoln about your plan" aria-label="Ask Lincoln a question" />
          <button className="btn primary" type="submit" disabled={!draft.trim()}>
            Ask
          </button>
        </form>
      </div>
    </section>
  );
}
