import { useEffect, useRef } from 'react';

const prefersReduced = () =>
  typeof window !== 'undefined' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Adds an `in` class the first time the element enters the viewport, which is
 * what every CSS reveal in the landing hangs off. Under reduced motion the
 * class is applied immediately so nothing depends on a transition running.
 */
export function useReveal({ threshold = 0.15, rootMargin = '0px 0px -8% 0px' } = {}) {
  const ref = useRef(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;

    if (prefersReduced()) {
      el.classList.add('in');
      return undefined;
    }

    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            el.classList.add('in');
            io.disconnect();
          }
        }
      },
      { threshold, rootMargin }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [threshold, rootMargin]);

  return ref;
}

/**
 * Reports how far a tall section has been scrolled through, 0 at the moment its
 * top hits the viewport top and 1 when its bottom does. Pairs with a sticky
 * child to build a scrubbable scene.
 *
 * The callback is held in a ref so passing an inline function does not tear
 * down and rebuild the listeners on every render.
 *
 * Updates are coalesced to one per scroll burst. rAF normally wins the race,
 * but a throttled or hidden tab can starve frames and leave a half-drawn scene
 * on screen, so a short timer backs it up; whichever fires first clears the
 * flag and the other becomes a no-op.
 */
export function useScrollProgress(ref, onProgress) {
  const cb = useRef(onProgress);
  cb.current = onProgress;

  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;

    let queued = false;
    let alive = true;

    const measure = () => {
      const r = el.getBoundingClientRect();
      const span = r.height - window.innerHeight;
      const p = span > 0 ? Math.min(1, Math.max(0, -r.top / span)) : 0;
      cb.current(p);
    };

    const run = () => {
      if (!alive || !queued) return;
      queued = false;
      measure();
    };

    const schedule = () => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(run);
      setTimeout(run, 120);
    };

    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule, { passive: true });
    measure();

    return () => {
      alive = false;
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
    };
  }, [ref]);
}

/** Progress within a sub-window of an outer 0..1 range. */
export const seg = (p, a, b) => Math.min(1, Math.max(0, (p - a) / (b - a)));

/** Per-item offset inside a window so a group draws in sequence, not together. */
export function stagger(t, i, n, spread = 0.55) {
  const step = n > 1 ? spread / (n - 1) : 0;
  const dur = 1 - spread || 1;
  return Math.min(1, Math.max(0, (t - i * step) / dur));
}

export const lerp = (a, b, t) => a + (b - a) * t;
