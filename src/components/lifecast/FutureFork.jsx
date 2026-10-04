import { useEffect, useState } from 'react';
import { Loader2, GitFork, Users } from 'lucide-react';
import { motion } from 'framer-motion';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from '@/components/ui/dialog';
import { fmtMoney, diffModels } from '@/lib/calcEngine';

// Future Fork — Future A (current situation) vs Future B (your scenario), side by side,
// with a "why did it change?" explanation.
export default function FutureFork({ baseline, model, profile, events }) {
  const [open, setOpen] = useState(false);
  const [why, setWhy] = useState(null);
  const [loadingWhy, setLoadingWhy] = useState(false);

  useEffect(() => { setWhy(null); }, [baseline, model]);

  const diff = diffModels(baseline, model);
  const household = (count) =>
    `${profile.maritalStatus !== 'single' ? '2 adults' : '1 adult'} · ${count} ${count === 1 ? 'child' : 'children'}`;

  const askWhy = async () => {
    setLoadingWhy(true);
    try {
      const context = diff.changed
        .map((r) => `${r.label}: ${fmtMoney(r.a)} -> ${fmtMoney(r.b)}`)
        .concat([`Modeled obligations: ${fmtMoney(diff.needsA)} -> ${fmtMoney(diff.needsB)}`, `Modeled coverage gap: ${fmtMoney(diff.gapA)} -> ${fmtMoney(diff.gapB)}`])
        .join('\n');
      const res = await base44.functions.invoke('lifecastAssistant', { mode: 'explain', context, model, profile });
      setWhy(res.data.answer);
    } catch (e) {
      setWhy(`Bedrock could not explain this comparison: ${e.message}`);
    } finally {
      setLoadingWhy(false);
    }
  };

  const col = (title, tag, hh, income, coverage, gapNum, accent) => (
    <div className={`rounded-xl border p-5 ${accent ? 'border-[#E67E22]/50 bg-[#FDF3EA]' : 'border-[#E9E0D4] bg-white'}`}>
      <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-[#8A7A6B]">{title}</p>
      <p className="mt-1 flex items-center gap-1.5 text-sm text-[#2B1B12]/80">
        <Users className="h-3.5 w-3.5 text-[#C96A18]" /> {hh}
      </p>
      <p className="mt-2 text-xs text-[#8A7A6B]">{tag}</p>
      <dl className="mt-4 space-y-1.5 text-xs text-[#2B1B12]/75">
        <div className="flex justify-between"><dt>Income</dt><dd className="tabular-nums">{fmtMoney(income)}</dd></div>
        <div className="flex justify-between"><dt>Coverage</dt><dd className="tabular-nums">{fmtMoney(coverage)}</dd></div>
      </dl>
      <div className="mt-4 border-t border-dashed border-[#E9E0D4] pt-3">
        <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-[#C96A18]">Modeled gap</p>
        <p className="font-display text-2xl tabular-nums text-[#4A1C1C]">{fmtMoney(gapNum)}</p>
      </div>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gap-2 bg-[#E67E22] text-white hover:bg-[#C96A18]">
          <GitFork className="h-4 w-4" /> Fork my future
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl border-[#E9E0D4] bg-white text-[#2B1B12]">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl text-[#4A1C1C]">Your financial future, forked</DialogTitle>
          <DialogDescription className="text-[#8A7A6B]">
            CalcXML Ins01 compares your current situation with the snapshot after all selected future events.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2">
          {col('Future A', 'Current situation', household(baseline.children), baseline.incomeBase, baseline.existingCoverage, baseline.gap, false)}
          {col('Future B', events.length > 0 ? 'Your scenario' : 'Same as A — place events on the timeline to fork', household(model.children), model.incomeBase, model.existingCoverage, model.gap, true)}
        </div>

        {diff.changed.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {diff.changed.map((r) => (
              <motion.span
                key={r.key}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className={`rounded-full border px-3 py-1 text-xs ${
                  r.b > r.a ? 'border-[#E67E22]/40 bg-[#FDF3EA] text-[#C96A18]' : 'border-[#5E8B7E]/40 bg-[#F0F5F3] text-[#5E8B7E]'
                }`}
              >
                {r.label} {r.b > r.a ? '+' : ''}{fmtMoney(r.b - r.a)}
              </motion.span>
            ))}
          </div>
        )}

        <div className="mt-4">
          <Button variant="outline" onClick={askWhy} disabled={loadingWhy} className="gap-2 border-[#C96A18]/40 bg-white text-[#C96A18] hover:bg-[#FDF3EA] hover:text-[#C96A18]">
            {loadingWhy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {why ? 'Ask again' : 'Why did it change?'}
          </Button>
          {why && (
            <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="mt-3 rounded-lg border border-[#E9E0D4] bg-[#FAF7F2] p-4 text-sm leading-relaxed text-[#2B1B12]/85">
              {why}
            </motion.div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}