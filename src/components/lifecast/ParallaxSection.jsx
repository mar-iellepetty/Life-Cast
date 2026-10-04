import { useRef } from 'react';
import { motion, useScroll, useTransform, useReducedMotion } from 'framer-motion';

// Wraps content in a parallax layer that drifts as you scroll past it.
export default function ParallaxSection({ children, className = '', drift = 36 }) {
  const ref = useRef(null);
  const reduced = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'end start'] });
  const y = useTransform(scrollYProgress, [0, 1], [drift, -drift]);

  return (
    <section ref={ref}>
      <motion.div style={{ y: reduced ? 0 : y }} className={className}>
        {children}
      </motion.div>
    </section>
  );
}