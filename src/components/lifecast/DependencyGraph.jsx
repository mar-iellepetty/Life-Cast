import { motion } from 'framer-motion';
import { fmtShort } from '@/lib/calcEngine';

// Financial Dependency Graph (SVG). A pulse ripples through it whenever the
// model re-runs, and the income node dims in loss mode.
export default function DependencyGraph({ profile, model, pulseKey, lossMode }) {
  const children = [];
  const total = Math.min(4, model.children);
  for (let i = 0; i < total; i++) {
    const isFuture = i >= profile.dependents.length;
    children.push(
      <g key={i} transform={`translate(${352 + i * 52}, 296)`}>
        {isFuture && (
          <motion.circle
            key={`pulse-${pulseKey}`}
            r={12}
            fill="none"
            stroke="#E67E22"
            strokeWidth={2}
            initial={{ scale: 0.4, opacity: 0.8 }}
            animate={{ scale: 2.4, opacity: 0 }}
            transition={{ duration: 1.1 }}
          />
        )}
        <circle r={11} fill={isFuture ? '#FDF3EA' : '#FFFFFF'} stroke={isFuture ? '#E67E22' : '#D9C7B8'} strokeWidth={1.5} />
        <text y={3.5} textAnchor="middle" fontSize="9" fontWeight="600" fill="#2B1B12">
          {isFuture ? '+' : model.household.children[i]?.age}
        </text>
        {isFuture && <text y={-16} textAnchor="middle" fontSize="7.5" fill="#C96A18">NEW</text>}
      </g>
    );
  }
  if (model.children > 4) {
    children.push(
      <text key="more" x={352 + 4 * 52} y={300} fontSize="11" fontWeight="600" fill="#2B1B12">
        +{model.children - 4}
      </text>
    );
  }

  const edge = (d, delay, dim) => (
    <motion.path
      d={d}
      fill="none"
      stroke={dim ? '#D9C7B8' : '#C9B8A6'}
      strokeWidth={1.6}
      strokeDasharray={dim ? '4 4' : undefined}
      initial={{ pathLength: 0 }}
      animate={{ pathLength: 1 }}
      transition={{ duration: 0.9, delay }}
    />
  );

  const node = (x, y, r, title, value, opts = {}) => (
    <g transform={`translate(${x}, ${y})`} opacity={opts.dim ? 0.3 : 1}>
      {opts.accent && <circle r={r + 5} fill="rgba(230,126,34,0.10)" />}
      <circle
        r={r}
        fill={opts.fill || '#FFFFFF'}
        stroke={opts.stroke || '#D9C7B8'}
        strokeWidth={1.6}
      />
      <text y={opts.valueY ?? -2} textAnchor="middle" fontSize="10" letterSpacing="1.5" fill="rgba(43,27,18,0.55)">
        {title}
      </text>
      <text y={opts.valueY !== undefined ? opts.valueY + 16 : 13} textAnchor="middle" fontSize="12" fontWeight="600" fill={opts.valueColor || '#2B1B12'}>
        {value}
      </text>
      {opts.sub && (
        <text y={r + 14} textAnchor="middle" fontSize="8" fill="#8A7A6B">
          {opts.sub}
        </text>
      )}
    </g>
  );

  return (
    <div className="h-full overflow-hidden rounded-xl border border-[#E9E0D4] bg-white shadow-[0_2px_16px_rgba(43,27,18,0.05)]">
      <svg viewBox="0 0 640 470" className="w-full">
        {edge('M320 108 Q230 130 130 190', 0.1, lossMode)}
        {edge('M320 108 Q320 130 320 190', 0.2, false)}
        {edge('M320 108 Q410 130 510 190', 0.3, false)}
        {edge('M320 236 Q280 250 262 288', 0.45, false)}
        {edge('M320 236 Q350 250 352 296', 0.5, false)}
        {edge('M130 232 Q140 260 140 330', 0.55, false)}
        {edge('M510 232 Q510 260 505 330', 0.6, false)}
        {edge('M140 362 Q240 410 300 428', 0.7, false)}
        {edge('M505 362 Q410 410 340 428', 0.75, false)}
        {edge('M320 236 Q320 340 320 420', 0.8, false)}

        {/* pulse through the future node when the model re-runs */}
        <motion.circle
          key={`future-${pulseKey}`}
          cx={320}
          cy={428}
          r={26}
          fill="none"
          stroke="#E67E22"
          strokeWidth={2}
          initial={{ scale: 0.3, opacity: 0.7 }}
          animate={{ scale: 2.2, opacity: 0 }}
          transition={{ duration: 1.2 }}
          style={{ transformOrigin: '320px 428px' }}
        />

        {node(320, 70, 36, 'YOU', `AGE ${model.household.person.age}`, { accent: true, stroke: '#E67E22', valueY: 4 })}
        {node(130, 212, 30, 'INCOME', lossMode ? 'REMOVED' : fmtShort(model.incomeBase), { dim: lossMode, valueColor: lossMode ? '#B4401F' : undefined })}
        {node(320, 212, 30, 'FAMILY', `${model.children} DEPENDENT${model.children === 1 ? '' : 'S'}`, { valueY: -2 })}
        {node(510, 212, 30, 'COVERAGE', model.coverageLost ? '$0' : fmtShort(model.existingCoverage), {
          valueColor: model.coverageLost ? '#B4401F' : undefined,
          sub: model.coverageLost ? 'employer coverage lost' : profile.coverageSource === 'employer' ? 'through work' : 'existing'
        })}
        {model.savings > 0 && node(420, 296, 20, 'SAVINGS', fmtShort(model.savings), { valueY: -2 })}

        {profile.maritalStatus !== 'single' && node(262, 322, 18, 'SPOUSE', fmtShort(profile.spouseIncome), { valueY: -2 })}

        {children}

        {node(140, 344, 26, 'HOME', fmtShort(model.household.debts.mortgage), { valueY: -2 })}
        {node(505, 344, 26, 'DEBT', fmtShort(model.household.debts.other), { valueY: -2 })}

        {node(320, 428, 34, 'FINANCIAL FUTURE', fmtShort(model.totalNeeds), {
          accent: true,
          fill: '#FDF3EA',
          stroke: '#E67E22',
          valueColor: '#4A1C1C',
          valueY: 2,
          sub: 'modeled obligations'
        })}
      </svg>
    </div>
  );
}
