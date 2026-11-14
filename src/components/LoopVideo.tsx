'use client';

// Role B. A short, silent, looping NASA clip with its credit. It plays only while it is on screen,
// and not at all for users who prefer reduced motion (they get the poster frame and native controls).
import { useEffect, useRef, useState } from 'react';

export function LoopVideo({
  src,
  poster,
  label,
  caption,
  creditHref,
}: {
  src: string;
  poster: string;
  /** Text alternative: what the clip shows. */
  label: string;
  caption: string;
  creditHref: string;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time read of a media query after hydration
      setReduced(true);
      return;
    }
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          // Autoplay can be refused (low-power mode, browser policy): the poster stays, which is fine.
          video.play().catch(() => {});
        } else {
          video.pause();
        }
      },
      { threshold: 0.35 },
    );
    io.observe(video);
    return () => io.disconnect();
  }, []);

  return (
    <figure className="clip">
      <video
        ref={ref}
        src={src}
        poster={poster}
        muted
        loop
        playsInline
        preload="none"
        controls={reduced}
        aria-label={label}
      />
      <figcaption>
        {caption}{' '}
        <a href={creditHref} target="_blank" rel="noreferrer">
          Video: NASA
        </a>
      </figcaption>
    </figure>
  );
}
