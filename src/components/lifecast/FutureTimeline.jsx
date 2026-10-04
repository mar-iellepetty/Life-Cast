import { useRef, useState } from 'react';
import { X } from 'lucide-react';
import { Baby, Home, Briefcase, TrendingUp, TrendingDown, GraduationCap, CreditCard, Landmark, Key } from 'lucide-react';
import { EVENT_CARDS, CURRENT_YEAR, TIMELINE_SPAN } from '@/lib/calcEngine';

const ICONS = {
  baby: Baby,
  home: Home,
  briefcase: Briefcase,
  trending_up: TrendingUp,
  trending_down: TrendingDown,
  graduation_cap: GraduationCap,
  credit_card: CreditCard,
  landmark: Landmark,
  key: Key
};

const TICK_YEARS = [2026, 2030, 2035, 2040, 2045, 2050];

// The future timeline — drag a life event onto it (or tap an event, then tap a year).
export default function FutureTimeline({ events, onAdd, onRemove }) {
  const trackRef = useRef(null);
  const [selected, setSelected] = useState(null);

  const yearFromEvent = (clientX) => {
    const rect = trackRef.current.getBoundingClientRect();
    const fracPos = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    return Math.round(CURRENT_YEAR + fracPos * TIMELINE_SPAN);
  };

  const place = (type, year) => {
    onAdd({ type, year });
    setSelected(null);
  };

  return (
    <div className="rounded-xl border border-[#E9E0D4] bg-white p-5 shadow-[0_2px_16px_rgba(43,27,18,0.05)]">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-display text-lg text-[#4A1C1C]">Your Future Timeline</h3>
        <span className="text-xs text-[#8A7A6B]">Drag an event onto your future — or tap an event, then tap a year</span>
      </div>

      {/* event chips */}
      <div className="mb-5 flex flex-wrap gap-2">
        {EVENT_CARDS.map((card) => {
          const Icon = ICONS[card.icon];
          return (
            <div
              key={card.type}
              draggable
              onDragStart={(e) => e.dataTransfer.setData('text/plain', card.type)}
              onClick={() => setSelected(selected === card.type ? null : card.type)}
              title={card.hint}
              className={`flex cursor-grab items-center gap-2 rounded-lg border px-3 py-1.5 text-xs transition-colors active:cursor-grabbing ${
                selected === card.type
                  ? 'border-[#E67E22] bg-[#FDF3EA] text-[#2B1B12]'
                  : 'border-[#E9E0D4] bg-white text-[#2B1B12]/75 hover:border-[#E67E22]/50 hover:bg-[#FDF3EA]/60'
              }`}
            >
              <Icon className="h-3.5 w-3.5 text-[#E67E22]" />
              {card.label}
            </div>
          );
        })}
      </div>

      {/* timeline track */}
      <div
        ref={trackRef}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const type = e.dataTransfer.getData('text/plain');
          if (EVENT_CARDS.some((c) => c.type === type)) place(type, yearFromEvent(e.clientX));
        }}
        onClick={(e) => {
          if (selected) place(selected, yearFromEvent(e.clientX));
        }}
        className={`relative h-24 cursor-crosshair rounded-lg border bg-[#FAF7F2] ${
          selected ? 'border-[#E67E22]/60 ring-1 ring-[#E67E22]/30' : 'border-[#E9E0D4]'
        }`}
      >
        {/* axis */}
        <div className="absolute left-4 right-4 top-12 h-px bg-[#E9E0D4]" />
        {TICK_YEARS.map((y) => (
          <div key={y} className="absolute top-12 -translate-x-1/2" style={{ left: `${8 + ((y - CURRENT_YEAR) / TIMELINE_SPAN) * 84}%` }}>
            <div className="mx-auto h-1.5 w-px bg-[#C9B8A6]" />
            <div className="mt-1.5 text-[10px] tabular-nums text-[#8A7A6B]">{y}</div>
          </div>
        ))}

        {/* placed events */}
        {events.map((ev, i) => {
          const card = EVENT_CARDS.find((c) => c.type === ev.type);
          const Icon = ICONS[card?.icon];
          const left = 8 + ((ev.year - CURRENT_YEAR) / TIMELINE_SPAN) * 84;
          return (
            <div key={ev.id || i} className="group absolute -translate-x-1/2" style={{ left: `${left}%`, top: i % 2 === 0 ? '16px' : '52px' }}>
              <div
                className="flex items-center gap-2 rounded-lg border border-[#E67E22]/40 bg-white px-2.5 py-1.5 shadow-[0_2px_10px_rgba(230,126,34,0.15)]"
                style={{ animation: 'lifecast-pop 260ms ease-out' }}
              >
                <Icon className="h-3.5 w-3.5 text-[#E67E22]" />
                <span className="text-[11px] font-medium tabular-nums text-[#2B1B12]">{ev.year}</span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemove(ev.id);
                  }}
                  className="ml-0.5 text-[#8A7A6B] opacity-0 transition-opacity hover:text-[#B4401F] group-hover:opacity-100"
                  aria-label={`Remove ${card?.label}`}
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
              <div className="mx-auto mt-0.5 h-1.5 w-px bg-[#E67E22]/60" style={{ display: i % 2 === 0 ? 'none' : 'block' }} />
            </div>
          );
        })}
      </div>
      <style>{`@keyframes lifecast-pop { from { transform: scale(0.6); opacity: 0 } to { transform: scale(1); opacity: 1 } }`}</style>
    </div>
  );
}