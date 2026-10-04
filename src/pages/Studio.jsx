import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { HeartPulse, Loader2, RotateCcw, Save, SlidersHorizontal } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import IntakeChat from '@/components/lifecast/IntakeChat';
import DependencyGraph from '@/components/lifecast/DependencyGraph';
import ProtectionXray from '@/components/lifecast/ProtectionXray';
import FutureTimeline from '@/components/lifecast/FutureTimeline';
import FutureFork from '@/components/lifecast/FutureFork';
import CoverageTimeline from '@/components/lifecast/CoverageTimeline';
import AskBar from '@/components/lifecast/AskBar';
import AssumptionPanel from '@/components/lifecast/AssumptionPanel';
import { normalizeProfile, DEFAULT_ASSUMPTIONS, fmtMoney, EVENT_CARDS } from '@/lib/calcEngine';

import { calculate } from '@/api/lifecastApi';
import { buildCalculation, modelFromCalculation } from '@/lib/lifecastModel';

export default function Studio() {
  const { toast } = useToast();
  const [loaded, setLoaded] = useState(false);
  const [profile, setProfile] = useState(null);
  const [events, setEvents] = useState([]);
  const [assumptions, setAssumptions] = useState(DEFAULT_ASSUMPTIONS);
  const [lossMode, setLossMode] = useState(false);
  const [pulseKey, setPulseKey] = useState(0);
  const [savedId, setSavedId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);

  const [calculation, setCalculation] = useState(null);
  const [calculationError, setCalculationError] = useState('');
  const [retry, setRetry] = useState(0);
  const calculationCache = useRef(new Map());

  // Restore a scenario saved in this running browser session.
  useEffect(() => {
    (async () => {
      try {
        const page = await base44.entities.Scenario.filter();
        const s = page.items && page.items[0];
        if (s && s.profile) {
          setProfile(normalizeProfile(s.profile));
          setEvents(Array.isArray(s.events) ? s.events : []);
          setAssumptions({ ...DEFAULT_ASSUMPTIONS, ...(s.assumptions || {}) });
          setSavedId(s.id);
        }
      } catch (e) {
        /* A new browser session begins with intake. */
      } finally {
        setLoaded(true);
      }
    })();
  }, []);

  const requests = useMemo(() => profile ? {
    baseline: buildCalculation(profile, [], assumptions),
    scenario: buildCalculation(profile, events, assumptions),
  } : null, [profile, events, assumptions]);
  const requestKey = JSON.stringify(requests);
  const model = calculation?.model;
  const baseline = calculation?.baseline;
  const calculating = Boolean(profile && calculation?.key !== requestKey && !calculationError);

  useEffect(() => {
    if (!requests) return;
    const controller = new AbortController();
    setCalculationError('');
    const timer = setTimeout(async () => {
      try {
        const load = async (input) => {
          const key = JSON.stringify(input);
          if (calculationCache.current.has(key)) return calculationCache.current.get(key);
          const result = modelFromCalculation(await calculate(input, controller.signal), input);
          if (!controller.signal.aborted) {
            if (calculationCache.current.size > 24) calculationCache.current.clear();
            calculationCache.current.set(key, result);
          }
          return result;
        };
        const base = await load(requests.baseline);
        const current = JSON.stringify(requests.baseline) === JSON.stringify(requests.scenario)
          ? base : await load(requests.scenario);
        if (!controller.signal.aborted) setCalculation({ key: requestKey, baseline: base, model: current });
      } catch (error) {
        if (!controller.signal.aborted) setCalculationError(error.message);
      }
    }, 350);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [requests, requestKey, retry]);

  const addEvents = (newEvents) => {
    const valid = (Array.isArray(newEvents) ? newEvents : [newEvents])
      .filter((e) => EVENT_CARDS.some((c) => c.type === e.type))
      .map((e) => ({
        ...e,
        year: Math.min(2050, Math.max(2026, Number(e.year) || 2026)),
        id: Math.random().toString(36).slice(2)
      }));
    if (valid.length === 0) return;
    setEvents((prev) => [...prev, ...valid]);
    setPulseKey((k) => k + 1);
  };

  const removeEvent = (id) => {
    setEvents((prev) => prev.filter((e) => e.id !== id));
    setPulseKey((k) => k + 1);
  };

  const save = async () => {
    setSaving(true);
    try {
      const payload = { title: 'My LifeCast', profile, events, assumptions };
      if (savedId) {
        await base44.entities.Scenario.update(savedId, payload);
      } else {
        const rec = await base44.entities.Scenario.create(payload);
        setSavedId(rec.id);
      }
      toast({ title: 'LifeCast saved', description: 'Saved for this browser session. Refreshing the page clears this saved scenario.' });
    } catch (e) {
      toast({ title: 'Could not save', description: e.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const onFocus = (focus) => {
    const id = { xray: 'xray', gap: 'xray', timeline: 'timeline', graph: 'graph', coverage: 'coverage' }[focus] || 'graph';
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  if (!loaded) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#FAF7F2]">
        <Loader2 className="h-7 w-7 animate-spin text-[#E67E22]" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FAF7F2] pb-32 text-[#2B1B12]">
      {/* header */}
      <header className="sticky top-0 z-30 border-b border-[#E9E0D4] bg-white/90 px-6 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3">
          <Link to="/" className="flex items-center gap-2.5 font-display text-lg text-[#4A1C1C]">
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-[#4A1C1C] text-sm text-[#F5EBDD]">L</span>
            LifeCast
          </Link>
          {profile && (
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" onClick={() => setPanelOpen(true)} className="gap-2 border-[#E9E0D4] bg-white text-xs text-[#2B1B12] hover:bg-[#FAF7F2] hover:text-[#2B1B12]">
                <SlidersHorizontal className="h-3.5 w-3.5 text-[#C96A18]" /> Assumptions
              </Button>
              <Button
                variant="outline"
                onClick={() => setLossMode(!lossMode)}
                className={`gap-2 border-[#E9E0D4] bg-white text-xs hover:bg-[#FAF7F2] ${
                  lossMode ? 'border-[#B4401F]/50 text-[#B4401F]' : 'text-[#2B1B12]'
                }`}
              >
                <HeartPulse className="h-3.5 w-3.5" /> {lossMode ? 'Restore my income' : 'Simulate loss of my income'}
              </Button>
              {model && baseline && <FutureFork baseline={baseline} model={model} profile={profile} events={events} />}
              <Button variant="outline" onClick={save} disabled={saving} className="gap-2 border-[#E9E0D4] bg-white text-xs text-[#2B1B12] hover:bg-[#FAF7F2] hover:text-[#2B1B12]">
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin text-[#C96A18]" /> : <Save className="h-3.5 w-3.5 text-[#C96A18]" />} Save
              </Button>
            </div>
          )}
        </div>
      </header>

      <p className="bg-[#eee6db] px-6 py-2 text-center text-xs text-[#796756]">Bedrock Nova Lite · Polly voice · CalcXML calculator · browser-session saving</p>
      {profile && (calculating || calculationError) && (
        <div role={calculationError ? 'alert' : 'status'} className="mx-auto max-w-7xl px-6 pt-5 text-sm text-[#796756]">
          {calculationError ? <>{calculationError} {model && 'The last successful result is shown below.'} <button className="underline" onClick={() => { setCalculationError(''); setRetry((value) => value + 1); }}>Retry calculation</button></>
            : <><Loader2 className="mr-2 inline h-4 w-4 animate-spin" /> Calculating with CalcXML… {model && 'Updating the previous result.'}</>}
        </div>
      )}
      {!profile ? (
        <div className="mx-auto max-w-6xl px-6 py-16">
          <IntakeChat
            onProfile={(p) => {
              setProfile(normalizeProfile(p));
              setPulseKey((k) => k + 1);
            }}
          />
        </div>
      ) : model ? (
        <main className="mx-auto max-w-7xl space-y-6 px-6 py-8">
          {/* summary line */}
          <p className="text-sm text-[#2B1B12]/70">
            <span className="font-display text-xl text-[#4A1C1C]">Your LifeCast.</span>{' '}
            Snapshot {model.scenarioYear} · Age {model.household.person.age}, {model.children} dependent{model.children === 1 ? '' : 's'}, modeled obligations of{' '}
            <span className="font-medium text-[#C96A18]">{fmtMoney(model.totalNeeds)}</span> against {fmtMoney(model.resources)} in resources — a modeled gap of{' '}
            <span className="font-medium text-[#C96A18]">{fmtMoney(model.gap)}</span>.
          </p>

          <div id="graph" className="grid gap-6 lg:grid-cols-5">
            <div className="lg:col-span-3">
              <DependencyGraph profile={profile} model={model} pulseKey={pulseKey} lossMode={lossMode} />
            </div>
            <div id="xray" className="lg:col-span-2">
              <ProtectionXray model={model} lossMode={lossMode} onOpenAssumptions={() => setPanelOpen(true)} />
            </div>
          </div>

          <div id="timeline">
            <FutureTimeline events={events} onAdd={addEvents} onRemove={removeEvent} />
          </div>

          <div id="coverage">
            <CoverageTimeline model={model} />
          </div>

          <div className="flex items-center justify-between rounded-xl border border-[#E9E0D4] bg-white px-5 py-4">
            <p className="text-xs leading-relaxed text-[#8A7A6B]">
              CalcXML Ins01 calculates. Bedrock explains the returned results. Future events produce a snapshot after the final selected event; balances do not automatically grow or amortize. This is an educational model — not insurance advice.
            </p>
            <Button
              variant="ghost"
              onClick={() => {
                setEvents([]);
                setLossMode(false);
                setPulseKey((k) => k + 1);
              }}
              className="gap-2 text-xs text-[#8A7A6B] hover:bg-[#FAF7F2] hover:text-[#2B1B12]"
            >
              <RotateCcw className="h-3.5 w-3.5" /> Reset scenario
            </Button>
          </div>
        </main>
      ) : null}

      {profile && model && <AskBar model={model} profile={profile} events={events} onApplyEvents={addEvents} onFocus={onFocus} />}

      {profile && (
        <AssumptionPanel
          open={panelOpen}
          onOpenChange={setPanelOpen}
          profile={profile}
          assumptions={assumptions}
          onProfileChange={setProfile}
          onAssumptionsChange={(a) => {
            setAssumptions(a);
            setPulseKey((k) => k + 1);
          }}
        />
      )}
    </div>
  );
}
