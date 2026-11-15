'use client';

// Role B. An interface mockup of a habitat's environment console, shown over the Moon footage.
// It is a picture of an interface, not a control system: every value comes from the curated data
// (the habitat preset and counts of test runs), and the panel says so. Gauges fill once when it scrolls into view.
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { formatKpa, formatPercent } from '@/components/format';

export interface ConsoleData {
  id: string;
  short: string;
  o2: number;
  kpa: number;
  g: number;
  /** Earth sea level, for the reference marks. Null if the preset is missing. */
  earth: { o2: number; kpa: number; g: number } | null;
  classes: { label: string; n: number; atOrAbove: number }[];
  partialGravityRuns: number;
  totalRuns: number;
}

function Gauge({ label, value, share, mark, markLabel }: { label: string; value: string; share: number; mark?: number; markLabel?: string }) {
  const pct = Math.round(Math.min(1, Math.max(0, share)) * 1000) / 10;
  return (
    <div className="hc-gauge">
      <svg viewBox="0 0 80 80" aria-hidden="true">
        <circle className="hc-ring-bg" cx="40" cy="40" r="32" pathLength="100" />
        <circle className="hc-ring" cx="40" cy="40" r="32" pathLength="100" style={{ strokeDasharray: `${pct} 100` }} />
        {mark !== undefined && (
          <line className="hc-mark" x1="40" y1="3" x2="40" y2="13" transform={`rotate(${Math.round(mark * 3600) / 10} 40 40)`} />
        )}
      </svg>
      <div>
        <b>{value}</b>
        <span>{label}</span>
        {markLabel && <small>{markLabel}</small>}
      </div>
    </div>
  );
}

export function HabitatConsole({ data }: { data: ConsoleData }) {
  const ref = useRef<HTMLDivElement>(null);
  const [live, setLive] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        setLive(true);
        io.disconnect();
      },
      { threshold: 0.35 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const e = data.earth;
  const ppO2 = data.o2 * data.kpa;
  // Scales: oxygen as a share of the whole atmosphere; pressure and gravity as a share of Earth's.
  const pShare = e ? data.kpa / e.kpa : 0;
  const gShare = e ? data.g / e.g : 0;

  return (
    <div className="hc glass" ref={ref} data-live={live} role="img" aria-label={`Interface mockup: ${data.short} at ${formatPercent(data.o2)} oxygen, ${formatKpa(data.kpa)}, ${data.g} g`}>
      <div className="hc-top">
        <span className="hc-dot" />
        <span className="hc-name">Habitat console · {data.short}</span>
        <span className="hc-badge">Interface mockup</span>
      </div>

      <div className="hc-gauges">
        <Gauge label="oxygen" value={formatPercent(data.o2)} share={data.o2} mark={e?.o2} markLabel={e ? `Earth ${formatPercent(e.o2)}` : undefined} />
        <Gauge label="pressure" value={formatKpa(data.kpa)} share={pShare} markLabel={e ? `Earth ${formatKpa(e.kpa)}` : undefined} />
        <Gauge label="gravity" value={`${data.g} g`} share={gShare} markLabel={e ? `Earth ${e.g} g` : undefined} />
      </div>

      <div className="hc-row">
        <span>Oxygen partial pressure</span>
        <b>{formatKpa(ppO2)}</b>
        {e && <small>Earth {formatKpa(e.o2 * e.kpa)} · fraction × pressure</small>}
      </div>

      <div className="hc-list">
        <span className="hc-head">Fire test evidence at this oxygen level</span>
        {data.classes.map((c, i) => (
          <div key={c.label} className="hc-item" style={{ transitionDelay: `${700 + i * 120}ms` }}>
            <span>{c.label}</span>
            <span className="hc-count">
              {c.atOrAbove} of {c.n} runs
            </span>
            <span className="hc-pill" data-none={c.atOrAbove === 0}>
              {c.atOrAbove === 0 ? 'no test' : 'tested'}
            </span>
          </div>
        ))}
        <div className="hc-item" style={{ transitionDelay: `${700 + data.classes.length * 120}ms` }}>
          <span>Partial gravity</span>
          <span className="hc-count">
            {data.partialGravityRuns} of {data.totalRuns} runs
          </span>
          <span className="hc-pill" data-none={data.partialGravityRuns === 0}>
            {data.partialGravityRuns === 0 ? 'no test' : 'tested'}
          </span>
        </div>
      </div>

      <div className="hc-foot">
        <small>Values from the curated NASA PSI data. Not a real control system.</small>
        <Link href={`/lens?habitat=${data.id}`} className="btn btn-primary">
          Open the Lens
        </Link>
      </div>
    </div>
  );
}
