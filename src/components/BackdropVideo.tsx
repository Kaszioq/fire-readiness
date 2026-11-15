'use client';

// Role B. A silent NASA clip used as a moving backdrop. It plays only while on screen; with reduced motion
// it never plays and the poster frame stays.
import { useEffect, useRef } from 'react';

export function BackdropVideo({ src, poster }: { src: string; poster: string }) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = ref.current;
    if (!video || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) video.play().catch(() => {});
        else video.pause();
      },
      { threshold: 0.15 },
    );
    io.observe(video);
    return () => io.disconnect();
  }, []);

  return <video ref={ref} className="backdrop-video" src={src} poster={poster} muted loop playsInline preload="none" aria-hidden="true" tabIndex={-1} />;
}
