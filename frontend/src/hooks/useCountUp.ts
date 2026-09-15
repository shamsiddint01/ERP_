import { useEffect, useRef, useState } from 'react';

/**
 * Animates a KPI number from 0 to `target` once, on the first real value it
 * receives (e.g. the first successful query response) — never replays on
 * subsequent refetches, and snaps instantly under prefers-reduced-motion.
 */
export function useCountUp(target: number | undefined, duration = 600): number {
  const [display, setDisplay] = useState(0);
  const hasAnimated = useRef(false);

  useEffect(() => {
    if (target === undefined || Number.isNaN(target)) return;
    const targetValue = target;

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (hasAnimated.current || reduceMotion) {
      setDisplay(targetValue);
      return;
    }
    hasAnimated.current = true;

    const start = performance.now();
    let raf: number;
    function tick(now: number) {
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - (1 - progress) ** 3;
      setDisplay(Math.round(targetValue * eased));
      if (progress < 1) raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);

  return display;
}
