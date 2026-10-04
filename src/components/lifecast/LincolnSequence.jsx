import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, useMotionValueEvent, useReducedMotion, useScroll, useTransform } from 'framer-motion';
import { ArrowDown, ArrowRight, Play, ShieldCheck } from 'lucide-react';
import './LincolnSequence.css';

const VIEWS = [
  { src: '/assets/lincoln-front.jpg', label: 'Front', view: 'Start facing front', alt: 'A full frontal view of the seated Abraham Lincoln statue.' },
  { src: '/assets/lincoln-right.jpg', label: 'Turn right', view: 'Turn to the right-facing profile', alt: 'The Lincoln statue in profile, facing right, with marble columns behind it.' },
  { src: '/assets/lincoln-left.jpg', label: 'Around', view: 'Continue to the opposite-side profile', alt: 'The opposite side of the Lincoln statue, facing left, surrounded by marble columns.' },
  { src: '/assets/lincoln-front.jpg', label: 'Front again', view: 'Return to the front-facing view', alt: 'The photographic journey returns to the front-facing Lincoln statue.' },
];

// Every photograph lives in this one pinned scene. The overlapping opacity
// ramps and independent transforms make the complete sequence scrub in both
// directions with the user's scroll, rather than running a timed slideshow.
export default function LincolnSequence({ onOpenAvatar }) {
  const sequenceRef = useRef(null);
  const reducedMotion = useReducedMotion();
  const [activeView, setActiveView] = useState(0);
  const { scrollYProgress } = useScroll({
    target: sequenceRef,
    offset: ['start 68px', 'end end'],
  });

  // A fresh photograph fades over an opaque preceding view, avoiding dark
  // flashes between perspectives. These are three supplied viewpoints, not
  // invented rear views or a claim of continuous 360-degree geometry.
  const rightOpacity = useTransform(scrollYProgress, [0, 0.1, 0.27, 1], [0, 0, 1, 1]);
  const leftOpacity = useTransform(scrollYProgress, [0, 0.43, 0.6, 1], [0, 0, 1, 1]);
  const returnOpacity = useTransform(scrollYProgress, [0, 0.76, 0.93, 1], [0, 0, 1, 1]);
  const frontX = useTransform(scrollYProgress, [0, 0.27], ['0%', '-3%']);
  const rightX = useTransform(scrollYProgress, [0.1, 0.6], ['3%', '-3%']);
  const leftX = useTransform(scrollYProgress, [0.43, 0.93], ['3%', '-3%']);
  const returnX = useTransform(scrollYProgress, [0.76, 1], ['3%', '0%']);
  const frontY = useTransform(scrollYProgress, [0, 0.27], ['1%', '-1%']);
  const rightY = useTransform(scrollYProgress, [0.1, 0.6], ['2%', '-2%']);
  const leftY = useTransform(scrollYProgress, [0.43, 0.93], ['2%', '-2%']);
  const returnY = useTransform(scrollYProgress, [0.76, 1], ['2%', '1%']);
  const frontScale = useTransform(scrollYProgress, [0, 0.27], [1.035, 1.09]);
  const rightScale = useTransform(scrollYProgress, [0.1, 0.6], [1.08, 1.025]);
  const leftScale = useTransform(scrollYProgress, [0.43, 0.93], [1.08, 1.025]);
  const returnScale = useTransform(scrollYProgress, [0.76, 1], [1.08, 1.035]);
  const titleY = useTransform(scrollYProgress, [0, 1], [0, -28]);
  const atmosphereX = useTransform(scrollYProgress, [0, 1], ['-12%', '12%']);
  const viewStyles = [
    { opacity: 1, x: frontX, y: frontY, scale: frontScale },
    { opacity: rightOpacity, x: rightX, y: rightY, scale: rightScale },
    { opacity: leftOpacity, x: leftX, y: leftY, scale: leftScale },
    { opacity: returnOpacity, x: returnX, y: returnY, scale: returnScale },
  ];

  useMotionValueEvent(scrollYProgress, 'change', (progress) => {
    if (!reducedMotion) setActiveView(progress < 0.185 ? 0 : progress < 0.515 ? 1 : progress < 0.845 ? 2 : 3);
  });

  function goToView(index) {
    if (reducedMotion) {
      setActiveView(index);
      return;
    }
    const target = sequenceRef.current;
    if (!target) return;
    const start = window.scrollY + target.getBoundingClientRect().top - 68;
    const distance = target.offsetHeight - (window.innerHeight - 68);
    window.scrollTo({ top: start + distance * [0, 1 / 3, 2 / 3, 1][index], behavior: 'smooth' });
  }

  return (
    <section ref={sequenceRef} className={`lincoln-sequence${reducedMotion ? ' lincoln-sequence--still' : ''}`} aria-label="The Lincoln photographic journey: front, turn right, around, and front again">
      <div className="lincoln-sequence__stage">
        <div className="lincoln-sequence__photographs">
          {VIEWS.map((view, index) => (
            <motion.img
              key={view.view}
              src={view.src}
              alt={view.alt}
              aria-hidden={activeView !== index}
              className={`lincoln-sequence__photo lincoln-sequence__photo--${index + 1}`}
              style={reducedMotion ? { opacity: activeView === index ? 1 : 0 } : viewStyles[index]}
              fetchPriority={index === 0 ? 'high' : 'auto'}
              decoding="async"
            />
          ))}
        </div>
        <div className="lincoln-sequence__scrim" />
        <motion.div className="lincoln-sequence__atmosphere" style={{ x: reducedMotion ? 0 : atmosphereX }} aria-hidden="true" />

        <div className="lincoln-sequence__content">
          <motion.div className="lincoln-sequence__editorial" style={{ y: reducedMotion ? 0 : titleY }}>
            <p className="lincoln-sequence__eyebrow"><span /> A legacy of looking forward</p>
            <h1>A living model of the future your coverage protects.</h1>
            <p className="lincoln-sequence__intro">LifeCast turns a conversation into a personalized, explainable life-insurance needs assessment. Explore the life you’re building — and see what it takes to protect it.</p>
            <div className="lincoln-sequence__actions">
              <Link to="/studio" className="lincoln-sequence__primary">Start your assessment <ArrowRight size={17} /></Link>
              <a href="#how" className="lincoln-sequence__secondary">How it works <ArrowDown size={15} /></a>
            </div>
            <p className="lincoln-sequence__assurance"><ShieldCheck size={15} /> Every number explainable. Every future personal.</p>
            <button className="guide-invitation lincoln-sequence__guide" onClick={onOpenAvatar}>
              <img src="/assets/lincoln-realistic.png" alt="" />
              <span><strong>Meet your guide, Lincoln</strong><small>A conversation about what comes next</small></span>
              <span className="lincoln-sequence__play"><Play size={12} fill="currentColor" /></span>
            </button>
          </motion.div>
        </div>

        <div className="lincoln-sequence__footer">
          <div className="lincoln-sequence__scroll"><ArrowDown size={17} /><span>{reducedMotion ? 'Explore every perspective' : 'Scroll to change your perspective'}</span></div>
          <div className="lincoln-sequence__views" role="group" aria-label="Choose a Lincoln perspective">
            {VIEWS.map((view, index) => (
              <button key={view.view} onClick={() => goToView(index)} aria-label={view.view} aria-pressed={activeView === index} className={activeView === index ? 'is-active' : ''}>
                <span className="lincoln-sequence__view-number">0{index + 1}</span>
                <span className="lincoln-sequence__view-name">{view.label}</span>
                <span className="lincoln-sequence__view-line" />
              </button>
            ))}
          </div>
        </div>
        <div className="lincoln-sequence__progress" aria-hidden="true"><motion.div style={{ scaleX: reducedMotion ? (activeView + 1) / VIEWS.length : scrollYProgress }} /></div>
      </div>
    </section>
  );
}
