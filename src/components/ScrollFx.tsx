'use client';

// Role B. One scroll behaviour for every page: blocks below the fold arrive once, with a short rise, when they
// scroll into view, and numbers marked data-count count up the first time they are seen.
// Blocks already on screen are never hidden. Without JavaScript, with reduced motion, or in a background tab,
// nothing is hidden at all. Renders nothing.
import { usePathname } from 'next/navigation';
import { useEffect } from 'react';

const TARGETS = '.card, .figure, .stats, .callout, .section-head, .filters, .row-list > li, .placeholder';
const SKIP = '.story, .hero-intro, .reel, [data-fx-skip]';

function countUp(el: HTMLElement) {
  const end = Number(el.textContent);
  if (!Number.isFinite(end) || end <= 0) return;
  const start = performance.now();
  const duration = 900;
  const step = (now: number) => {
    const t = Math.min(1, (now - start) / duration);
    el.textContent = String(Math.round(end * (1 - (1 - t) ** 3)));
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

export function ScrollFx() {
  const pathname = usePathname();

  useEffect(() => {
    if (document.hidden || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const main = document.querySelector('main');
    if (!main) return;

    let pending: HTMLElement[] = [];
    let counts: HTMLElement[] = [];
    let timer = 0;

    const check = () => {
      const line = window.innerHeight * 0.9;
      let order = 0;
      pending = pending.filter((el) => {
        if (!el.isConnected) return false;
        if (el.getBoundingClientRect().top > line) return true;
        el.style.transitionDelay = `${Math.min(order++, 5) * 55}ms`;
        el.dataset.fx = 'shown';
        // Hand the element back to its own styles once it has arrived.
        window.setTimeout(() => {
          delete el.dataset.fx;
          el.style.transitionDelay = '';
        }, 1100);
        return false;
      });
      counts = counts.filter((el) => {
        if (!el.isConnected) return false;
        if (el.getBoundingClientRect().top > line) return true;
        countUp(el);
        return false;
      });
      if (pending.length === 0 && counts.length === 0) stop();
    };
    const stop = () => {
      window.removeEventListener('scroll', check);
      window.removeEventListener('resize', check);
      window.clearInterval(timer);
    };

    // After the first paint of the new page, so layout is final.
    const frame = requestAnimationFrame(() => {
      const fold = window.innerHeight * 0.95;
      pending = Array.from(main.querySelectorAll<HTMLElement>(TARGETS)).filter(
        (el) => !el.closest(SKIP) && !el.parentElement?.closest(TARGETS) && el.getBoundingClientRect().top > fold,
      );
      for (const el of pending) el.dataset.fx = 'hidden';
      counts = Array.from(main.querySelectorAll<HTMLElement>('[data-count]'));
      window.addEventListener('scroll', check, { passive: true });
      window.addEventListener('resize', check, { passive: true });
      // Layout can change without a scroll (filters, collapsed sections): look again now and then.
      timer = window.setInterval(check, 700);
      check();
    });

    return () => {
      cancelAnimationFrame(frame);
      stop();
      for (const el of pending) delete el.dataset.fx;
    };
  }, [pathname]);

  return null;
}
