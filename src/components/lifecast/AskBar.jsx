import { useRef, useState } from 'react';
import { Loader2, Sparkles, X } from 'lucide-react';
import { motion } from 'framer-motion';
import { base44 } from '@/api/base44Client';
import { fmtMoney } from '@/lib/calcEngine';

const EXAMPLES = [
  'What happens if we have another child in 2029 and I lose my employer coverage?',
  'What causes most of my modeled insurance need?',
  'What changes once my mortgage is gone?'
];

// Talk to the simulation — a compact command bar that drives the visualization.
export default function AskBar({ model, profile, events, onApplyEvents, onFocus }) {
  const [question, setQuestion] = useState('');
  const [loading, setLoading] = useState(false);
  const [answer, setAnswer] = useState(null);
  const history = useRef([]);

  const submit = async (override, options = {}) => {
    const prompt = typeof override === 'string' ? override : question;
    if (!prompt.trim() || loading) return;
    setLoading(true);
    setAnswer(null);
    try {
      const context = [
        `Age ${model.household.person.age}, ${profile.maritalStatus}, ${model.children} dependent(s).`,
        `Income ${fmtMoney(model.incomeBase)}, mortgage ${fmtMoney(model.household.debts.mortgage)}, other debt ${fmtMoney(model.household.debts.other)}, savings ${fmtMoney(model.savings)}, existing coverage ${fmtMoney(model.existingCoverage)}.`,
        `Modeled obligations ${fmtMoney(model.totalNeeds)}, modeled gap ${fmtMoney(model.gap)}. Biggest need component: ${model.needsRows.reduce((m, r) => (r.value > m.value ? r : m), model.needsRows[0]).label}.`,
        `Timeline events placed: ${events.length === 0 ? 'none yet' : events.map((e) => `${e.type} in ${e.year}`).join(', ')}.`
      ].join(' ');

      const prior = options.history || history.current.slice(-12);
      const res = await base44.functions.invoke('lifecastAssistant', {
        mode: 'query', question: prompt, context, profile, model, events,
        history: prior, provider: 'bedrock', signal: options.signal
      });
      const data = res.data;
      if (typeof data.answer !== 'string' || !data.answer.trim()) throw new Error('Lincoln did not receive an answer. Please try again.');
      if (data.events?.length) onApplyEvents(data.events);
      if (data.focus && onFocus) onFocus(data.focus);
      setAnswer({ text: data.answer, audioUrl: data.audioUrl, videoUrl: data.videoUrl, applied: data.events || [] });
      history.current = [...prior, { role: 'user', text: prompt }, { role: 'assistant', text: data.answer }];
      setQuestion('');
      return data;
    } catch (e) {
      if (e.name !== 'AbortError') setAnswer({ text: e.message, applied: [] });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-[#E9E0D4] bg-white/95 px-4 py-3 shadow-[0_-4px_24px_rgba(43,27,18,0.06)] backdrop-blur">
      <div className="mx-auto max-w-5xl">
        {answer && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-3 flex items-start gap-3 rounded-lg border border-[#E67E22]/30 bg-[#FDF3EA] p-3 text-sm leading-relaxed text-[#2B1B12]"
          >
            <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-[#C96A18]" />
            <div className="flex-1">
              <p>{answer.text}</p>
              {answer.applied.length > 0 && (
                <p className="mt-1 text-xs font-medium text-[#C96A18]">
                  Applied to your timeline: {answer.applied.map((e) => `${e.type.replace('_', ' ')} in ${e.year}`).join(', ')} — the model re-ran.
                </p>
              )}
            </div>
            <button onClick={() => setAnswer(null)} aria-label="Dismiss" className="text-[#8A7A6B] hover:text-[#2B1B12]">
              <X className="h-4 w-4" />
            </button>
          </motion.div>
        )}

        <div className="mb-2 flex gap-2 overflow-x-auto pb-0.5">
          {EXAMPLES.map((ex) => (
            <button
              key={ex}
              onClick={() => setQuestion(ex)}
              className="shrink-0 whitespace-nowrap rounded-full border border-[#E9E0D4] bg-[#FAF7F2] px-3 py-1 text-[11px] text-[#8A7A6B] transition-colors hover:border-[#E67E22]/50 hover:text-[#2B1B12]"
            >
              {ex}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 rounded-full border border-[#E9E0D4] bg-[#FAF7F2] px-4 py-2 focus-within:border-[#E67E22]/60">
          <Sparkles className="h-4 w-4 shrink-0 text-[#C96A18]" />
          <input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
            placeholder="Ask LifeCast about your model…"
            aria-label="Ask LifeCast" className="min-w-0 flex-1 bg-transparent text-sm text-[#2B1B12] outline-none placeholder:text-[#8A7A6B]/60"
          />
          <button
            onClick={submit}
            disabled={loading || !question.trim()}
            className="flex items-center gap-1.5 rounded-full bg-[#E67E22] px-3.5 py-1.5 text-xs font-medium text-white transition-colors hover:bg-[#C96A18] disabled:opacity-40"
          >
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            Ask
          </button>
        </div>
      </div>

    </div>
  );
}
