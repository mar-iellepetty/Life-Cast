import { useEffect, useRef, useState } from 'react';
import { EXAMPLES, ExampleScenario } from '../data/templates';
import type { Plan } from '../lib/model';

interface Props {
  plans: Plan[];
  activeId: string;
  onSelect: (id: string) => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
  onNewPlan: () => void;
  onDuplicate: () => void;
  onCustomEvent: () => void;
  onExample: (ex: ExampleScenario) => void;
  onCompare?: () => void;
}

export function PlansBar(props: Props) {
  const { plans, activeId, onSelect, onRename, onDelete } = props;
  const [editing, setEditing] = useState<string | null>(null);
  const [menu, setMenu] = useState(false);

  return (
    <div className="plansbar">
      <div className="container plansbar-inner">
        <span className="plans-label">Plans</span>
        <div className="plan-tabs" role="tablist" aria-label="Plans">
          {plans.map((p) => {
            const active = p.id === activeId;
            if (editing === p.id) {
              return (
                <input
                  key={p.id}
                  className="plan-tab-input"
                  autoFocus
                  defaultValue={p.name}
                  aria-label="Plan name"
                  onFocus={(e) => e.target.select()}
                  onBlur={(e) => {
                    if (e.target.value.trim()) onRename(p.id, e.target.value.trim());
                    setEditing(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') e.currentTarget.blur();
                    if (e.key === 'Escape') setEditing(null);
                  }}
                />
              );
            }
            return (
              <div key={p.id} className={`plan-tab ${active ? 'active' : ''}`}>
                <button role="tab" aria-selected={active} onClick={() => onSelect(p.id)} onDoubleClick={() => setEditing(p.id)} title="Double-click to rename">
                  {p.name}
                </button>
                {active && (
                  <>
                    <button className="plan-tab-act" onClick={() => setEditing(p.id)} aria-label={`Rename ${p.name}`} title="Rename">
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                        <path d="M4 20h4L19 9l-4-4L4 16v4Z" />
                      </svg>
                    </button>
                    {plans.length > 1 && (
                      <button className="plan-tab-act" onClick={() => onDelete(p.id)} aria-label={`Delete ${p.name}`} title="Delete plan">
                        ×
                      </button>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>
        <div className="plans-actions">
          <div className="addnew-wrap">
            <button className="btn primary sm" onClick={() => setMenu(!menu)} aria-expanded={menu}>
              + Add New
            </button>
            {menu && <AddNewMenu {...props} onClose={() => setMenu(false)} />}
          </div>
          {props.onCompare && (
            <button className="btn secondary sm" onClick={props.onCompare}>
              Compare plans
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function AddNewMenu({ onNewPlan, onDuplicate, onCustomEvent, onExample, onClose }: Props & { onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.parentElement?.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  const act = (fn: () => void) => () => {
    onClose();
    fn();
  };

  return (
    <div className="addnew" ref={ref} role="menu">
      <div className="addnew-col">
        <p className="addnew-title">Create your own</p>
        <button role="menuitem" onClick={act(onNewPlan)}>
          <strong>New Plan</strong>
          <span>Start from your questionnaire answers</span>
        </button>
        <button role="menuitem" onClick={act(onDuplicate)}>
          <strong>Custom Scenario</strong>
          <span>Copy the current plan and adjust it</span>
        </button>
        <button role="menuitem" onClick={act(onCustomEvent)}>
          <strong>Custom Life Event</strong>
          <span>Add an event that is not in the list</span>
        </button>
      </div>
      <div className="addnew-col">
        <p className="addnew-title">Explore example plans</p>
        {EXAMPLES.map((ex) => (
          <button role="menuitem" key={ex.id} onClick={act(() => onExample(ex))}>
            <strong>{ex.name}</strong>
            <span>{ex.summary}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
