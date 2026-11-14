'use client';

// Role B. On phones, navigation and preset chips are one swipeable row. This keeps the current item in view.
// `watch` is any value that changes when the current item changes (pathname, selected id).
import { useEffect, useRef, type ReactNode } from 'react';

export function ScrollRow({
  className,
  label,
  watch,
  children,
}: {
  className: string;
  label: string;
  watch: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const row = ref.current;
    const current = row?.querySelector<HTMLElement>('[aria-current]');
    if (!row || !current || row.scrollWidth <= row.clientWidth) return;
    // Instant, not animated: this is navigation the user did not ask to watch.
    row.scrollLeft = current.offsetLeft - (row.clientWidth - current.offsetWidth) / 2;
  }, [watch]);

  return (
    <nav className={className} aria-label={label} ref={ref}>
      {children}
    </nav>
  );
}
