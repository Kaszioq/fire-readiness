'use client';

// Role B. A section with its own scroll: while it is pinned under the header, vertical scrolling moves its
// row of items sideways. The position is eased towards the scroll target every frame, so a mouse wheel's
// coarse steps come out as one smooth glide instead of jumps.
// On narrow screens and with reduced motion nothing is pinned: the row is an ordinary swipeable strip.
import { useEffect, useRef, type ReactNode } from 'react';

export function PinScroll({ head, children }: { head: ReactNode; children: ReactNode }) {
  const wrap = useRef<HTMLDivElement>(null);
  const view = useRef<HTMLDivElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const bar = useRef<HTMLElement>(null);

  useEffect(() => {
    const w = wrap.current;
    const v = view.current;
    const t = track.current;
    if (!w || !v || !t) return;
    const mq = window.matchMedia('(min-width: 861px) and (prefers-reduced-motion: no-preference)');
    let raf = 0;
    let current = 0;
    let target = 0;
    let max = 0;
    let active = false;

    const paint = () => {
      t.style.transform = `translate3d(${-current.toFixed(1)}px, 0, 0)`;
      if (bar.current) bar.current.style.transform = `scaleX(${max > 0 ? current / max : 0})`;
    };
    const tick = () => {
      current += (target - current) * 0.14;
      if (Math.abs(target - current) < 0.4) current = target;
      paint();
      raf = current === target ? 0 : requestAnimationFrame(tick);
    };
    const onScroll = () => {
      if (!active) return;
      const rect = w.getBoundingClientRect();
      const top = parseFloat(getComputedStyle(v).top) || 0;
      const distance = rect.height - v.offsetHeight;
      const progress = distance > 0 ? Math.min(1, Math.max(0, (top - rect.top) / distance)) : 0;
      target = progress * max;
      if (!raf) raf = requestAnimationFrame(tick);
    };
    const measure = () => {
      active = mq.matches;
      if (!active) {
        w.style.height = '';
        w.dataset.pinned = 'false';
        t.style.transform = '';
        return;
      }
      w.dataset.pinned = 'true';
      max = Math.max(0, t.scrollWidth - v.clientWidth);
      // One pixel of vertical scroll moves the row one pixel sideways.
      w.style.height = `${v.offsetHeight + max}px`;
      onScroll();
    };

    measure();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', measure, { passive: true });
    mq.addEventListener('change', measure);
    // Images arriving can change the row's width.
    const ro = new ResizeObserver(measure);
    ro.observe(t);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', measure);
      mq.removeEventListener('change', measure);
      ro.disconnect();
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div className="pin" ref={wrap} data-pinned="false" data-fx-skip>
      <div className="pin-view" ref={view}>
        <div className="pin-head">
          {head}
          <span className="pin-bar" aria-hidden="true">
            <i ref={bar} />
          </span>
        </div>
        <div className="pin-track" ref={track}>
          {children}
        </div>
      </div>
    </div>
  );
}
