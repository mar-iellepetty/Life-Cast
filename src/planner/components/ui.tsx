import { ReactNode, useEffect, useRef } from 'react';
import type { EventType } from '../lib/model';

// ---------- Modal ----------
export function Modal({ title, eyebrow, onClose, children, wide, footer }: { title: string; eyebrow?: string; onClose: () => void; children: ReactNode; wide?: boolean; footer?: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      prev?.focus();
    };
  }, [onClose]);

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} ref={ref}>
        <div className="modal-head">
          <div>
            {eyebrow && <p className="eyebrow">{eyebrow}</p>}
            <h2 className="modal-title">{title}</h2>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

// ---------- Information button ----------
export function InfoButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button className="info-btn" onClick={onClick} aria-label={label} title={label}>
      i
    </button>
  );
}

// ---------- Inputs ----------
export function MoneyField({ value, onChange, label, id, large }: { value: number; onChange: (n: number) => void; label: string; id?: string; large?: boolean }) {
  return (
    <label className={`input money ${large ? 'lg' : ''}`}>
      <span className="prefix">$</span>
      <input
        id={id}
        aria-label={label}
        inputMode="numeric"
        value={value.toLocaleString('en-US')}
        onFocus={(e) => e.target.select()}
        onChange={(e) => onChange(Math.min(1e9, Number(e.target.value.replace(/[^0-9]/g, '')) || 0))}
      />
    </label>
  );
}

export function NumberField(props: { value: number; onChange: (n: number) => void; min: number; max: number; label: string; suffix?: string; large?: boolean; stepper?: boolean }) {
  const { value, onChange, min, max, label, suffix, large, stepper } = props;
  const clamp = (n: number) => Math.min(max, Math.max(min, n));
  return (
    <div className={`input number ${large ? 'lg' : ''}`}>
      {stepper && (
        <button type="button" onClick={() => onChange(clamp(value - 1))} aria-label={`Decrease ${label}`}>
          −
        </button>
      )}
      <input
        aria-label={label}
        inputMode="numeric"
        value={value}
        onFocus={(e) => e.target.select()}
        onChange={(e) => {
          const n = Number(e.target.value.replace(/[^0-9]/g, ''));
          if (Number.isFinite(n)) onChange(Math.min(max, n));
        }}
        onBlur={() => onChange(clamp(value))}
      />
      {suffix && <span className="suffix">{suffix}</span>}
      {stepper && (
        <button type="button" onClick={() => onChange(clamp(value + 1))} aria-label={`Increase ${label}`}>
          +
        </button>
      )}
    </div>
  );
}

// ---------- Icons ----------
const eventPaths: Record<EventType, string> = {
  marriage: 'M9 14a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm6 0a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z',
  child: 'M12 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm-5 13v-6a5 5 0 0 1 10 0v6',
  home: 'M4 11 12 4l8 7M6 9.5V20h12V9.5M10 20v-5h4v5',
  education: 'M2 9l10-5 10 5-10 5L2 9Zm4 2v5c3 2.5 9 2.5 12 0v-5',
  career: 'M4 8h16v11H4V8Zm5 0V5h6v3M4 13h16',
  retirement: 'M12 3v2m0 14v2M3 12h2m14 0h2M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z',
  custom: 'M12 5v14M5 12h14',
};

export function EventIcon({ type, size = 20 }: { type: EventType; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={eventPaths[type]} />
    </svg>
  );
}

export function Chevron({ open, size = 16 }: { open?: boolean; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} className={`chev ${open ? 'open' : ''}`} aria-hidden="true">
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}
