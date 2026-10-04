import LincolnSequence from '@/components/lifecast/LincolnSequence';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ArrowRight,
  Layers,
  Calculator,
  ShieldCheck,
  Sparkles,
  Baby,
  Home,
  Briefcase,
  GraduationCap,
  TrendingUp,
  TrendingDown
} from 'lucide-react';
import ParallaxSection from '@/components/lifecast/ParallaxSection';
import { Button } from '@/components/ui/button';

const fadeUp = (delay = 0) => ({
  initial: { opacity: 0, y: 16 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: '-60px' },
  transition: { duration: 0.55, delay }
});

const SECTIONS = [
  {
    n: '01',
    tag: 'Conversational intake',
    title: 'Describe your situation, not your paperwork',
    body: 'No forms to fill. Share your situation in plain language — dependents, income, debts, existing coverage — and LifeCast reads it into a structured financial model you can inspect and edit.',
    visual: (
      <div className="rounded-xl border border-[#E9E0D4] bg-white p-6 shadow-[0_2px_16px_rgba(43,27,18,0.06)]">
        <p className="text-sm leading-relaxed text-[#2B1B12]/80">
          “I'm 31, married, with a 4-year-old daughter. I make $105,000, my spouse makes $52,000. We owe $340,000 on our mortgage and I have $150,000 of coverage through work.”
        </p>
        <div className="mt-4 flex items-center gap-2 rounded-lg bg-[#FAF7F2] px-3 py-2.5 text-xs text-[#8A7A6B]">
          <Sparkles className="h-3.5 w-3.5 text-[#E67E22]" />
          Parsed into a structured profile — every value editable
        </div>
      </div>
    )
  },
  {
    n: '02',
    tag: 'Scenario simulation',
    title: 'Place life events on your future timeline',
    body: 'A new child in 2029. Employer coverage gone in 2033. A mortgage paid off in 2040. Place events on your timeline — the model re-runs deterministically, and both futures can be compared side by side.',
    visual: (
      <div className="rounded-xl border border-[#E9E0D4] bg-white p-6 shadow-[0_2px_16px_rgba(43,27,18,0.06)]">
        <div className="flex flex-wrap gap-2.5">
          {[
            { icon: Baby, label: 'Another child', year: 2029 },
            { icon: Home, label: 'Mortgage paid', year: 2040 },
            { icon: Briefcase, label: 'Coverage change', year: 2033 },
            { icon: GraduationCap, label: 'College', year: 2038 }
          ].map((e) => (
            <div key={e.label} className="flex items-center gap-2 rounded-lg border border-[#E9E0D4] bg-[#FAF7F2] px-3 py-2">
              <e.icon className="h-4 w-4 text-[#E67E22]" />
              <div>
                <p className="text-xs font-medium text-[#2B1B12]">{e.label}</p>
                <p className="text-[10px] tabular-nums text-[#8A7A6B]">{e.year}</p>
              </div>
            </div>
          ))}
        </div>
        <div className="relative mt-5 h-px bg-[#E9E0D4]">
          <div className="absolute inset-y-0 left-[10%] right-[30%] bg-[#E67E22]/60" />
          <span className="absolute -top-5 left-0 text-[10px] tabular-nums text-[#8A7A6B]">2026</span>
          <span className="absolute -top-5 right-0 text-[10px] tabular-nums text-[#8A7A6B]">2050</span>
        </div>
      </div>
    )
  },
  {
    n: '03',
    tag: 'Layered transparency',
    title: 'The need, shown as layers',
    body: 'Instead of one opaque number, your modeled need is broken into income replacement, home, education, and other obligations — each with its source, assumption, and exact formula one click away.',
    visual: (
      <div className="rounded-xl border border-[#E9E0D4] bg-white p-6 shadow-[0_2px_16px_rgba(43,27,18,0.06)]">
        <div className="space-y-3">
          {[
            ['Income replacement', 74, '#E67E22'],
            ['Home & mortgage', 50, '#D9A05B'],
            ['Education', 30, '#6B8F82'],
            ['Other obligations', 14, '#C9A227']
          ].map(([label, w, color]) => (
            <div key={label} className="flex items-center gap-4">
              <span className="w-36 shrink-0 text-xs text-[#2B1B12]/70">{label}</span>
              <div className="h-3 flex-1 rounded-full bg-[#FAF7F2]">
                <div className="h-full rounded-full" style={{ width: `${w}%`, background: color }} />
              </div>
            </div>
          ))}
        </div>
        <div className="mt-4 flex items-center justify-between border-t border-[#E9E0D4] pt-3 text-xs">
          <span className="text-[#8A7A6B]">Modeled coverage gap</span>
          <span className="font-display text-base tabular-nums text-[#4A1C1C]">$1,060,000</span>
        </div>
      </div>
    )
  },
  {
    n: '04',
    tag: 'Explainable by design',
    title: 'The engine calculates. The AI explains.',
    body: 'A deterministic calculation engine does all the math — never the AI. Ask “why did it change?” and LifeCast names exactly which assumptions moved and how each contributed to the result.',
    visual: (
      <div className="rounded-xl border border-[#E9E0D4] bg-white p-6 shadow-[0_2px_16px_rgba(43,27,18,0.06)]">
        <p className="text-sm leading-relaxed text-[#2B1B12]/80">
          “Your modeled protection need changed because this scenario adds another dependent and additional future obligations.”
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <span className="flex items-center gap-1.5 rounded-full bg-[#FDF3EA] px-3 py-1 text-xs text-[#C96A18]">
            <TrendingUp className="h-3 w-3" /> Education +$150,000
          </span>
          <span className="flex items-center gap-1.5 rounded-full bg-[#F0F5F3] px-3 py-1 text-xs text-[#5E8B7E]">
            <TrendingDown className="h-3 w-3" /> Coverage −$150,000
          </span>
        </div>
      </div>
    )
  }
];

export default function Landing() {
  return (
    <div className="min-h-screen bg-[#FAF7F2] text-[#2B1B12]">
      {/* nav */}
      <header className="lincoln-site-header sticky top-0 z-40 border-b border-[#E9E0D4] bg-white/85 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3.5">
          <Link to="/" className="flex items-center gap-2.5">
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-[#4A1C1C] font-display text-sm text-[#F5EBDD]">L</span>
            <span className="font-display text-lg tracking-tight">LifeCast</span>
          </Link>
          <nav className="hidden items-center gap-6 text-sm text-[#2B1B12]/70 md:flex">
            <a href="#how" className="transition-colors hover:text-[#2B1B12]">How it works</a>
            <a href="#approach" className="transition-colors hover:text-[#2B1B12]">Our approach</a>
          </nav>
          <Button asChild className="bg-[#E67E22] text-white hover:bg-[#C96A18]">
            <Link to="/studio">Start assessment</Link>
          </Button>
        </div>
      </header>

      <LincolnSequence />
      <div className="trust-strip"><span><ShieldCheck size={16}/> Deterministic calculation engine</span><span><Layers size={16}/> Every number explainable</span><span><Calculator size={16}/> Educational — not a product recommendation</span></div>

      {/* how it works */}
      <div id="how" className="mx-auto max-w-6xl space-y-24 px-6 py-24">
        {SECTIONS.map((s, i) => (
          <ParallaxSection key={s.n} className="grid items-center gap-10 md:grid-cols-2" drift={i % 2 === 0 ? 28 : -28}>
            <div className={i % 2 === 1 ? 'md:order-2' : ''}>
              <p className="flex items-center gap-3 text-[11px] font-medium uppercase tracking-[0.25em] text-[#C96A18]">
                <span className="font-display text-2xl tracking-normal text-[#E9E0D4]">{s.n}</span>
                {s.tag}
              </p>
              <h2 className="mt-3 font-display text-3xl leading-tight text-[#4A1C1C]">{s.title}</h2>
              <p className="mt-4 text-sm leading-relaxed text-[#2B1B12]/60">{s.body}</p>
            </div>
            <div className={i % 2 === 1 ? 'md:order-1' : ''}>
              <motion.div
                whileHover={{ rotateX: 2, rotateY: i % 2 === 0 ? -2 : 2 }}
                transition={{ type: 'spring', stiffness: 200, damping: 22 }}
                className="[perspective:900px]"
              >
                {s.visual}
              </motion.div>
            </div>
          </ParallaxSection>
        ))}
      </div>

      <section className="meet-section"><div><p className="eyebrow">A CONVERSATION WITH CLARITY</p><h2>Planning, made clearer.<br/>Your guide to what comes next.</h2><p>Explore your model with Lincoln’s chat. Ask about your assessment, understand the assumptions, and take the conversation at your own pace.</p><Link to="/studio" className="voice-primary">Start your assessment <ArrowRight size={16} /></Link></div><div className="lincoln-portrait"><img src="/assets/lincoln-realistic.png" alt="Lifelike portrait of Abraham Lincoln in a dark suit and bow tie" loading="lazy" /><div className="lincoln-portrait__caption"><span>Your planning guide</span><Link to="/studio">Explore your plan <ArrowRight size={13} /></Link></div></div></section>
      {/* approach */}
      <section id="approach" className="bg-[#2B1B12] py-20 text-[#F5EBDD]">
        <div className="mx-auto max-w-5xl px-6">
          <motion.h2 {...fadeUp()} className="max-w-xl font-display text-3xl leading-tight sm:text-4xl">
            Built to be trusted, not just impressive.
          </motion.h2>
          <div className="mt-10 grid gap-8 sm:grid-cols-3">
            {[
              { icon: Calculator, title: 'Deterministic math', body: 'A transparent calculation engine computes every number. The AI only converses and explains results.' },
              { icon: Layers, title: 'Explainable results', body: 'Each figure carries its source, assumption, and formula — with a range instead of false precision.' },
              { icon: ShieldCheck, title: 'Responsible by design', body: 'Minimal personal data, user-owned scenario storage, and no product recommendations — ever.' }
            ].map((f, i) => (
              <motion.div key={f.title} {...fadeUp(0.1 * i)}>
                <f.icon className="h-5 w-5 text-[#E67E22]" />
                <h3 className="mt-3 font-display text-lg">{f.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-[#F5EBDD]/60">{f.body}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-3xl px-6 py-24 text-center">
        <motion.h2 {...fadeUp()} className="font-display text-3xl leading-tight text-[#4A1C1C] sm:text-4xl">
          Your future is a model.<br />Run it.
        </motion.h2>
        <motion.div {...fadeUp(0.15)}>
          <Button asChild className="mt-8 gap-2 bg-[#E67E22] px-7 py-2.5 text-white hover:bg-[#C96A18]">
            <Link to="/studio">
              Start your assessment <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </motion.div>
      </section>

      <footer className="border-t border-[#E9E0D4] px-6 py-8">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 text-xs text-[#8A7A6B] sm:flex-row">
          <p>LifeCast — an educational needs-modeling prototype for the codeLinc 11 coding challenge.</p>
          <p>Not insurance advice. No product recommendations.</p>
        </div>
      </footer>
    </div>
  );
}
