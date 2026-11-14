import { useEffect, useRef } from 'react';
import { gsap, prefersReducedMotion } from '../lib/motion';

export function AnimatedNumber({ value }: { value: number }) {
  const ref = useRef<HTMLSpanElement | null>(null);
  const displayed = useRef(0);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const target = Number.isFinite(value) ? value : 0;
    if (prefersReducedMotion()) {
      displayed.current = target;
      element.textContent = String(target);
      return;
    }
    const holder = { current: displayed.current };
    const tween = gsap.to(holder, {
      current: target,
      duration: 1.3,
      ease: 'power3.out',
      onUpdate: () => {
        const rounded = Math.round(holder.current);
        displayed.current = rounded;
        element.textContent = String(rounded);
      },
      onComplete: () => {
        displayed.current = target;
        element.textContent = String(target);
      },
    });
    return () => {
      tween.kill();
    };
  }, [value]);

  return <span className="stat-num" ref={ref} />;
}
