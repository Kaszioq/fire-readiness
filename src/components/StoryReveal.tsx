'use client';

// Role B. Marks each story chapter with data-visible the first time it scrolls into view, so CSS can play a
// short, time-based reveal. Fired once per chapter: a reveal that replays on every pass fights the reader.
// Renders nothing. Without JavaScript the chapters are simply visible.
import { useEffect, useRef } from 'react';

export function StoryReveal() {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const story = ref.current?.closest<HTMLElement>('.story');
    if (!story) return;
    // A page opened in a background tab is not painted, so transitions would not run: leave it static.
    if (document.hidden) return;
    const steps = Array.from(story.querySelectorAll<HTMLElement>('.story-step'));

    // Chapters already on screen or above it (reload mid-page, anchor link) are shown at once, with no
    // animation, before the hidden starting state is switched on.
    for (const step of steps) {
      if (step.getBoundingClientRect().top < window.innerHeight * 0.85) step.dataset.visible = 'instant';
    }
    story.dataset.reveal = 'on';

    // A plain scroll check instead of IntersectionObserver: six rectangles per scroll event is trivial, and it
    // does not depend on the browser delivering observer callbacks (they stall when a tab is not being painted).
    let pending = steps.filter((step) => !step.dataset.visible);
    const check = () => {
      const line = window.innerHeight * 0.75;
      pending = pending.filter((step) => {
        if (step.getBoundingClientRect().top > line) return true;
        step.dataset.visible = 'true';
        return false;
      });
      if (pending.length === 0) stop();
    };
    const stop = () => {
      window.removeEventListener('scroll', check);
      window.removeEventListener('resize', check);
    };
    window.addEventListener('scroll', check, { passive: true });
    window.addEventListener('resize', check, { passive: true });
    return stop;
  }, []);

  return <span ref={ref} hidden />;
}
