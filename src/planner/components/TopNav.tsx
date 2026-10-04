import { Link } from 'react-router-dom';

export const STAGES = ['Introduction', 'Financial Planning', 'Life Events', 'Review & Plan', 'Report'];

interface Props {
  stage: number;
  maxReached: number;
  onNavigate: (stage: number) => void;
  onSave?: () => void;
  savedAt?: number | null;
}

export function TopNav({ stage, maxReached, onNavigate, onSave, savedAt }: Props) {
  return (
    <header className="topnav">
      <nav className="stepper" aria-label="Planning progress">
        <ol className="container">
          {STAGES.map((label, i) => (
            <li key={label} className={i === stage ? 'active' : i < stage ? 'done' : ''}>
              <button onClick={() => onNavigate(i)} disabled={i > maxReached} aria-current={i === stage ? 'step' : undefined}>
                <span className="step-num">
                  {i < stage ? (
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" aria-label="Completed">
                      <path d="m5 12 5 5L20 7" />
                    </svg>
                  ) : (
                    i + 1
                  )}
                </span>
                <span className="step-label">{label}</span>
              </button>
            </li>
          ))}
        </ol>
      </nav>
      <div className="brandbar">
        <div className="container brandbar-inner">
          <Link to="/" className="brand" aria-label="LifeCast home">
            <span className="planner-brand-mark" aria-hidden="true">L</span>
            <div>
              <div className="brand-name">LifeCast</div>
              <div className="brand-sub">A clearer view of what comes next</div>
            </div>
          </Link>
          <div className="brand-progress">
            <strong>
              Step {stage + 1} of {STAGES.length}: {STAGES[stage]}
            </strong>
            {stage < STAGES.length - 1 && <span> · Next: {STAGES[stage + 1]}</span>}
          </div>
          <div className="planner-header-actions"><Link to="/" className="planner-home">Home</Link>{onSave && <button className="btn ghost sm" onClick={onSave}>{savedAt ? 'Saved' : 'Save plans'}</button>}</div>
        </div>
      </div>
    </header>
  );
}
