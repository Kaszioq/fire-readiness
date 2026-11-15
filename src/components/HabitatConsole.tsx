'use client';

// Role B. An animated interface mockup of a Moon base console, shown over the Moon footage: a schematic of the
// base that is scanned module by module, ducts with moving flow, pulsing sensors, a status ticker and gauges.
// It is a picture of an interface, not a control system. The floor plan is illustrative and labelled so;
// every number comes from the curated data (the habitat preset and counts of test runs).
// Motion runs only while the panel is on screen and stops entirely with reduced motion.
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

// Illustrative floor plan: four modules around a hub. Names are generic; nothing here is a NASA design.
const MODULES = [
  { name: 'HABITAT', x: 40, y: 125, w: 140, h: 90, r: 45 },
  { name: 'LAB', x: 340, y: 125, w: 140, h: 90, r: 45 },
  { name: 'AIRLOCK', x: 205, y: 22, w: 110, h: 78, r: 22 },
  { name: 'STORAGE', x: 205, y: 240, w: 110, h: 78, r: 22 },
];

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
  const [running, setRunning] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        // Gauges fill the first time; the looping motion pauses whenever the panel is off screen.
        if (entry.isIntersecting) setLive(true);
        setRunning(entry.isIntersecting);
      },
      { threshold: 0.2 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const e = data.earth;
  const solidRuns = data.classes.reduce((sum, c) => sum + c.n, 0);
  const solidAtOrAbove = data.classes.reduce((sum, c) => sum + c.atOrAbove, 0);
  // Status lines for the ticker: plain restatements of the data, one at a time.
  const ticker = [
    `Oxygen ${formatPercent(data.o2)}${e ? ` · Earth air ${formatPercent(e.o2)}` : ''}`,
    `Pressure ${formatKpa(data.kpa)}${e ? ` · ${formatPercent(data.kpa / e.kpa)} of Earth sea level` : ''}`,
    `Solid materials at or above ${formatPercent(data.o2)} O2 · ${solidAtOrAbove} of ${solidRuns} test runs`,
    `Gravity ${data.g} g · ${data.partialGravityRuns} of ${data.totalRuns} test runs at partial gravity`,
  ];
  const ppO2 = data.o2 * data.kpa;
  // Scales: oxygen as a share of the whole atmosphere; pressure and gravity as a share of Earth's.
  const pShare = e ? data.kpa / e.kpa : 0;
  const gShare = e ? data.g / e.g : 0;

  return (
    <div className="hc glass" ref={ref} data-live={live} data-running={running} role="img" aria-label={`Interface mockup: ${data.short} at ${formatPercent(data.o2)} oxygen, ${formatKpa(data.kpa)}, ${data.g} g`}>
      <div className="hc-top">
        <span className="hc-dot" />
        <span className="hc-name">{data.short} · environment console</span>
        <span className="hc-badge">Interface mockup</span>
      </div>

      <div className="hc-main">
        <div className="hc-plan">
          <svg viewBox="0 0 520 340" aria-hidden="true">
            <defs>
              <pattern id="hc-grid" width="20" height="20" patternUnits="userSpaceOnUse">
                <path d="M20 0H0V20" fill="none" stroke="rgba(255,255,255,0.05)" />
              </pattern>
              <linearGradient id="hc-sweep" x1="0" x2="1">
                <stop offset="0" stopColor="#ffb454" stopOpacity="0" />
                <stop offset="1" stopColor="#ffb454" stopOpacity="0.35" />
              </linearGradient>
            </defs>
            <rect width="520" height="340" fill="url(#hc-grid)" />

            {/* ducts from the hub to each module, with flow moving outwards */}
            <g className="hc-ducts">
              <path d="M222 170 H180" />
              <path d="M298 170 H340" />
              <path d="M260 132 V100" />
              <path d="M260 208 V240" />
            </g>

            {/* radar sweep around the hub */}
            <g className="hc-sweep">
              <path d="M260 170 L260 20 A150 150 0 0 1 366 64 Z" fill="url(#hc-sweep)" />
            </g>

            {MODULES.map((m, i) => (
              <g key={m.name} className="hc-module" style={{ animationDelay: `${i * 2.4}s` }}>
                <rect x={m.x} y={m.y} width={m.w} height={m.h} rx={m.r} />
                <text x={m.x + m.w / 2} y={m.y + m.h / 2 - 3} textAnchor="middle" className="hc-mod-name">
                  {m.name}
                </text>
                <text x={m.x + m.w / 2} y={m.y + m.h / 2 + 11} textAnchor="middle" className="hc-mod-val">
                  {formatPercent(data.o2)} O2
                </text>
                <circle className="hc-sensor" cx={m.x + m.w - 14} cy={m.y + 14} r="3" style={{ animationDelay: `${i * 0.5}s` }} />
              </g>
            ))}

            <g className="hc-hub">
              <circle cx="260" cy="170" r="38" />
              <circle cx="260" cy="170" r="24" className="hc-hub-inner" />
              <text x="260" y="174" textAnchor="middle" className="hc-mod-name">
                HUB
              </text>
            </g>

            {/* frame ticks */}
            <path className="hc-frame" d="M8 28V8H28 M492 8H512V28 M512 312V332H492 M28 332H8V312" />
          </svg>
          <div className="hc-ticker" aria-hidden="true">
            {ticker.map((line, i) => (
              <span key={line} style={{ animationDelay: `${i * 3}s` }}>
                {line}
              </span>
            ))}
          </div>
          <small className="hc-plan-note">Illustrative floor plan. Readings repeat the habitat preset.</small>
        </div>

        <div className="hc-tele">
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
