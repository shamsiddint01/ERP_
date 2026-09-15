import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Animates a KPI number from 0 to `target` once, starting only when the
 * returned `ref` scrolls into view (never while it's off-screen below the
 * fold) — on the first real value it receives (e.g. the first successful
 * query response). Never replays on subsequent refetches, and snaps
 * instantly under prefers-reduced-motion.
 */
export function useCountUp(target: number | undefined, duration = 600): { value: number; ref: (el: HTMLElement | null) => void } {
  const [display, setDisplay] = useState(0);
  const hasAnimated = useRef(false);
  const [node, setNode] = useState<HTMLElement | null>(null);
  const ref = useCallback((el: HTMLElement | null) => setNode(el), []);
  // Reduced motion is a synchronous, one-time read — computed directly as
  // the initial state value rather than set from inside an effect.
  const [inView, setInView] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  // Watch for the observed node entering the viewport — a callback ref (not
  // a plain useRef) so this re-runs once the value div actually mounts,
  // which happens later than the hook's own mount while `loading` is true.
  // setInView is only ever called from the observer's own async callback
  // here, never synchronously in the effect body.
  useEffect(() => {
    if (hasAnimated.current || inView || !node) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          observer.disconnect();
        }
      },
      { threshold: 0.2 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [node, inView]);

  useEffect(() => {
    if (target === undefined || Number.isNaN(target)) return;
    const targetValue = target;

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (hasAnimated.current || reduceMotion) {
      setDisplay(targetValue);
      return;
    }
    if (!inView) return;
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
  }, [target, duration, inView]);

  return { value: display, ref };
}
