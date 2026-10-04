import { motion } from 'framer-motion';
import { Info } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { fmtMoney } from '@/lib/calcEngine';

function Why({ row, onChangeAssumption }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className="text-[#8A7A6B] transition-colors hover:text-[#E67E22]" aria-label={`Why is ${row.label} ${fmtMoney(row.value)}?`}>
          <Info className="h-3.5 w-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent side="top" className="w-72 border-[#E9E0D4] bg-white text-[#2B1B12] shadow-lg">
        <p className="mb-1 text-xs font-medium uppercase tracking-wider text-[#C96A18]">{row.label}</p>
        <dl className="space-y-1.5 text-xs text-[#2B1B12]/80">
          <div><dt className="inline text-[#8A7A6B]">Source: </dt><dd className="inline">{row.source}</dd></div>
          <div><dt className="inline text-[#8A7A6B]">Assumption: </dt><dd className="inline">{row.assumption}</dd></div>
          <div><dt className="inline text-[#8A7A6B]">Calculation: </dt><dd className="inline font-mono text-[#C96A18]">{row.formula}</dd></div>
          <div><dt className="inline text-[#8A7A6B]">Confidence: </dt><dd className="inline">Based on supplied information</dd></div>
        </dl>
        {row.note && <p className="mt-2 text-xs italic text-[#8A7A6B]">{row.note}</p>}
        <button onClick={() => onChangeAssumption?.(row.key)} className="mt-3 text-xs text-[#C96A18] underline underline-offset-4 hover:text-[#E67E22]">
          Change assumption →
        </button>
      </PopoverContent>
    </Popover>
  );
}

// Protection X-Ray — the modeled need shown as layers, every number explainable.
export default function ProtectionXray({ model, lossMode, onOpenAssumptions }) {
  const max = Math.max(model.totalNeeds, model.resources, 1);

  return (
    <div className="flex h-full flex-col rounded-xl border border-[#E9E0D4] bg-white p-5 shadow-[0_2px_16px_rgba(43,27,18,0.05)]">
      <div className="mb-4 flex items-baseline justify-between">
        <h3 className="font-display text-lg text-[#4A1C1C]">Protection X-Ray</h3>
        <span className="text-[10px] uppercase tracking-[0.2em] text-[#8A7A6B]">What are you protecting?</span>
      </div>

      <div className="space-y-3">
        {model.needsRows.map((row) => (
          <div key={row.key} className="flex items-center gap-2.5">
            <span className="w-[104px] shrink-0 truncate text-xs text-[#2B1B12]/75">{row.label}</span>
            <div className="h-4 flex-1 overflow-hidden rounded-full bg-[#FAF7F2]">
              <motion.div
                className="h-full rounded-full"
                style={{ background: row.color }}
                initial={{ width: 0 }}
                animate={{ width: `${Math.max(0.5, (row.value / max) * 100)}%` }}
                transition={{ type: 'spring', stiffness: 120, damping: 20 }}
              />
            </div>
            <span className="w-[74px] shrink-0 text-right text-xs font-medium tabular-nums text-[#2B1B12]">{fmtMoney(row.value)}</span>
            <Why row={row} onChangeAssumption={onOpenAssumptions} />
          </div>
        ))}
      </div>

      <div className="my-4 border-t border-dashed border-[#E9E0D4]" />
      <div className="flex items-center justify-between text-sm">
        <span className="text-[#2B1B12]/65">Modeled obligations</span>
        <span className="font-display text-lg tabular-nums text-[#4A1C1C]">{fmtMoney(model.totalNeeds)}</span>
      </div>

      <div className="mt-4 space-y-3">
        {model.resourceRows.map((row) => (
          <div key={row.key} className="flex items-center gap-2.5">
            <span className="w-[104px] shrink-0 text-xs text-[#2B1B12]/75">{row.label}</span>
            <div className="h-4 flex-1 overflow-hidden rounded-full bg-[#FAF7F2]">
              <motion.div className="h-full rounded-full bg-[#5E8B7E]" initial={{ width: 0 }} animate={{ width: `${(row.value / max) * 100}%` }} />
            </div>
            <span className="w-[74px] shrink-0 text-right text-xs tabular-nums text-[#5E8B7E]">−{fmtMoney(row.value)}</span>
            <Why row={row} onChangeAssumption={onOpenAssumptions} />
          </div>
        ))}
      </div>

      <div className="mt-5 rounded-lg border border-[#E67E22]/25 bg-[#FDF3EA] p-4">
        <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-[#C96A18]">Modeled coverage gap</p>
        <p className="font-display text-3xl tabular-nums text-[#4A1C1C]">{fmtMoney(model.gap)}</p>
        <p className="mt-1 text-xs text-[#8A7A6B]">
          CalcXML Ins01 estimate using your selected assumptions. Change the inputs to compare scenarios.
        </p>
      </div>

      {lossMode && (
        <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-4 text-xs leading-relaxed text-[#2B1B12]/75">
          Primary income: removed. Under the entered assumptions, your existing coverage of {fmtMoney(model.existingCoverage)} represents about{' '}
          <span className="font-semibold">{model.coverageYears.toFixed(1)} years</span> of the income your household depends on — against a modeled{' '}
          {model.horizon}-year dependency window.
        </motion.p>
      )}
    </div>
  );
}