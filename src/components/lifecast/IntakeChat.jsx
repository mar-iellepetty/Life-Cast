import { useState } from 'react';
import { Loader2, ArrowRight, Sparkles } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { normalizeProfile, fmtMoney } from '@/lib/calcEngine';

// Conversational intake — describe your situation, LifeCast reads it into a model.
export default function IntakeChat({ onProfile }) {
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [parsed, setParsed] = useState(null);

  const submit = async () => {
    if (!text.trim() || loading) return;
    setLoading(true);
    setError(null);
    try {
      const res = await base44.functions.invoke('parseLifeSituation', { text, provider: 'bedrock' });
      const profile = normalizeProfile(res.data.profile);
      setParsed({ ...res.data.profile, ...profile, missing: res.data.profile.missing || [] });
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  if (parsed) {
    return (
      <div className="mx-auto max-w-2xl rounded-xl border border-[#E9E0D4] bg-white p-8 shadow-[0_2px_16px_rgba(43,27,18,0.06)]">
        <p className="mb-3 flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-[#C96A18]">
          <Sparkles className="h-3.5 w-3.5" /> LifeCast read your situation
        </p>
        <p className="mb-6 font-display text-xl leading-relaxed text-[#4A1C1C]">{parsed.summary}</p>
        <div className="mb-4 flex flex-wrap gap-2">
          {[
            `Age ${parsed.age}`,
            parsed.maritalStatus,
            ...parsed.dependents.map((a) => `Child, ${a}`),
            `Income ${fmtMoney(parsed.primaryIncome)}`,
            parsed.spouseIncome > 0 ? `Spouse ${fmtMoney(parsed.spouseIncome)}` : null,
            `Mortgage ${fmtMoney(parsed.mortgage)}`,
            `Debt ${fmtMoney(parsed.otherDebt)}`,
            `Savings ${fmtMoney(parsed.savings)}`,
            `Coverage ${fmtMoney(parsed.existingCoverage)}`
          ]
            .filter(Boolean)
            .map((chip) => (
              <span key={chip} className="rounded-full border border-[#E9E0D4] bg-[#FAF7F2] px-3 py-1 text-xs text-[#2B1B12]/80">
                {chip}
              </span>
            ))}
        </div>
        {parsed.missing?.length > 0 && (
          <p className="mb-6 text-xs text-[#8A7A6B]">
            Anything you didn't mention is modeled as $0 — you can edit every number in the Assumption Inspector.
          </p>
        )}
        <Button onClick={() => onProfile(parsed)} className="gap-2 bg-[#E67E22] text-white hover:bg-[#C96A18]">
          Build my model <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl rounded-xl border border-[#E9E0D4] bg-white p-8 shadow-[0_2px_16px_rgba(43,27,18,0.06)]">
      <p className="text-[11px] font-medium uppercase tracking-[0.25em] text-[#C96A18]">Step 1 — Tell your story</p>
      <h2 className="mt-2 font-display text-3xl text-[#4A1C1C]">Describe your situation, in your own words.</h2>
      <p className="mt-2 text-sm text-[#2B1B12]/60">Describe your situation and Lincoln will help organize it, or explore the sample model below.</p>
      <Textarea aria-label="Describe your situation"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="e.g. I'm 32, married with two kids, ages 3 and 7. I earn $95,000, my wife stays home. We have a $280,000 mortgage and $12,000 in student loans…"
        className="mt-5 min-h-[120px] border-[#E9E0D4] bg-[#FAF7F2] text-[#2B1B12] placeholder:text-[#8A7A6B]/60 focus-visible:ring-[#E67E22]/40"
      />
      {error && <p className="mt-3 text-sm text-[#B4401F]">{error}</p>}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button onClick={submit} disabled={loading || !text.trim()} className="gap-2 bg-[#E67E22] text-white hover:bg-[#C96A18]">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          {loading ? 'Reading your situation…' : 'Read my situation'}
        </Button>
        <button
          onClick={() => setParsed({...normalizeProfile({age:31,maritalStatus:'married',dependents:[4],primaryIncome:105000,spouseIncome:52000,mortgage:340000,otherDebt:18000,savings:30000,existingCoverage:150000,coverageSource:'employer'}),summary:'Sample household: married, one child, and a home to protect.',missing:[]})}
          className="text-xs text-[#8A7A6B] underline underline-offset-4 hover:text-[#2B1B12]"
        >
          Explore sample model
        </button>
      </div>
    </div>
  );
}
