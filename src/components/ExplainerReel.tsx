'use client';

// Role B. A self-playing walkthrough of the product in the hero: five short scenes drawn as an interface mockup.
// It is motion graphics built from the real curated data passed in by the page; no number is typed in here.
// The active progress segment is a CSS animation: when it ends, the next scene starts, and pausing it pauses
// everything. With reduced motion nothing plays by itself and the scenes are stepped by hand.
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { scaleLinear, scaleLog } from 'd3-scale';
import { formatKpa, formatPercent } from '@/components/format';

export interface ReelData {
  habitats: { id: string; short: string }[];
  focus: { id: string; short: string; name: string; o2: number; kpa: number; g: number };
  points: { o2: number; kpa: number; solid: boolean }[];
  solids: number;
  solidsAtFocus: number;
  classes: { label: string; n: number; o2Max: number }[];
  finding: { text: string; quote: string | null; source: string; locator: string | null; psiId: string; name: string; verified: boolean } | null;
  partialGravityRuns: number;
  gravityNote: string;
  nInvestigations: number;
}

const SCENES = [
  { id: 'habitat', label: 'Pick an atmosphere' },
  { id: 'tested', label: 'See what was tested' },
  { id: 'gap', label: 'Find the gap' },
  { id: 'source', label: 'Trace every number' },
  { id: 'gravity', label: 'Know the limits' },
] as const;
const SCENE_MS = 6200;

const CW = 420;
const CH = 220;
const O2_DOMAIN: [number, number] = [0.1, 0.42];
const P_DOMAIN: [number, number] = [25, 550];
const cx = scaleLinear().domain(O2_DOMAIN).range([28, CW - 12]);
const cy = scaleLog().domain(P_DOMAIN).range([CH - 22, 10]);
const r2 = (v: number) => Math.round(v * 100) / 100;
const inChart = (o2: number, kpa: number) =>
  o2 >= O2_DOMAIN[0] && o2 <= O2_DOMAIN[1] && kpa >= P_DOMAIN[0] && kpa <= P_DOMAIN[1];

function Scene({ id, data }: { id: (typeof SCENES)[number]['id']; data: ReelData }) {
  const f = data.focus;
  if (id === 'habitat') {
    return (
      <div className="reel-scene">
        <p className="reel-kicker a1">Which habitat?</p>
        <div className="reel-chips a2">
          {data.habitats.map((h) => (
            <span key={h.id} className="reel-chip" data-on={h.id === f.id}>
              {h.short}
            </span>
          ))}
        </div>
        <div className="reel-readout">
          <div className="a3">
            <b>{formatPercent(f.o2)}</b>
            <span>oxygen</span>
          </div>
          <div className="a4">
            <b>{formatKpa(f.kpa)}</b>
            <span>pressure</span>
          </div>
          <div className="a5">
            <b>{f.g} g</b>
            <span>gravity</span>
          </div>
        </div>
        <p className="reel-note a6">{f.name}</p>
      </div>
    );
  }
  if (id === 'tested') {
    const shown = data.points.filter((p) => inChart(p.o2, p.kpa));
    const fx = r2(cx(f.o2));
    const fy = r2(cy(f.kpa));
    return (
      <div className="reel-scene">
        <p className="reel-kicker a1">
          {data.points.length} test runs, oxygen against pressure
        </p>
        <svg className="reel-chart" viewBox={`0 0 ${CW} ${CH}`} role="img" aria-label="Tested conditions and the selected habitat">
          {[0.15, 0.2, 0.25, 0.3, 0.35, 0.4].map((t) => (
            <g key={t}>
              <line x1={r2(cx(t))} x2={r2(cx(t))} y1="10" y2={CH - 22} />
              <text x={r2(cx(t))} y={CH - 8} textAnchor="middle">
                {formatPercent(t)}
              </text>
            </g>
          ))}
          {[50, 100, 200, 400].map((t) => (
            <g key={t}>
              <line x1="28" x2={CW - 12} y1={r2(cy(t))} y2={r2(cy(t))} />
              <text x="24" y={r2(cy(t)) + 3} textAnchor="end">
                {t}
              </text>
            </g>
          ))}
          {shown.map((p, i) => (
            <circle
              key={i}
              className="reel-dot"
              data-solid={p.solid}
              cx={r2(cx(p.o2))}
              cy={r2(cy(p.kpa))}
              r="2.6"
              style={{ animationDelay: `${300 + i * 7}ms` }}
            />
          ))}
          {inChart(f.o2, f.kpa) && (
            <g className="reel-target">
              <line x1={fx} x2={fx} y1="10" y2={CH - 22} />
              <line x1="28" x2={CW - 12} y1={fy} y2={fy} />
              <circle cx={fx} cy={fy} r="11" />
              <path d={`M${fx} ${fy - 6} l6 6 l-6 6 l-6 -6 Z`} />
            </g>
          )}
        </svg>
        <p className="reel-note a6">
          <i className="reel-key" data-solid="true" /> solid materials <i className="reel-key" /> other fuels{' '}
          <i className="reel-key reel-key-target" /> {f.short}
        </p>
      </div>
    );
  }
  if (id === 'gap') {
    const max = O2_DOMAIN[1];
    return (
      <div className="reel-scene">
        <p className="reel-kicker a1">Solid materials at or above {formatPercent(f.o2)} oxygen</p>
        <p className="reel-big a2">
          {data.solidsAtFocus} <small>of {data.solids} test runs</small>
        </p>
        <div className="reel-bars">
          {data.classes.map((c, i) => (
            <div key={c.label} className="reel-bar">
              <span>{c.label}</span>
              <div className="reel-track">
                <i style={{ width: `${r2((c.o2Max / max) * 100)}%`, animationDelay: `${500 + i * 110}ms` }} />
              </div>
              <span className="reel-bar-value">up to {formatPercent(c.o2Max)}</span>
            </div>
          ))}
          <div className="reel-bar-line" style={{ left: `calc(var(--reel-label) + (100% - var(--reel-label) - var(--reel-value)) * ${r2(f.o2 / max)})` }}>
            <span>{f.short}</span>
          </div>
        </div>
        <p className="reel-note a6">Highest oxygen level tested per material class, PSI microgravity data.</p>
      </div>
    );
  }
  if (id === 'source') {
    const x = data.finding;
    if (!x) return <div className="reel-scene"><p className="reel-kicker">No findings in the curated data.</p></div>;
    return (
      <div className="reel-scene">
        <p className="reel-kicker a1">
          {x.name} · {x.psiId}
        </p>
        <p className="reel-finding a2">{x.text}</p>
        {x.quote && <blockquote className="reel-quote a3">“{x.quote}”</blockquote>}
        <div className="reel-tags">
          <span className="reel-tag a4">{x.source}</span>
          {x.locator && <span className="reel-tag a5">{x.locator}</span>}
          {!x.verified && <span className="reel-tag reel-tag-warn a6">unverified</span>}
        </div>
      </div>
    );
  }
  return (
    <div className="reel-scene">
      <p className="reel-kicker a1">
        {f.short}: {f.g} g
      </p>
      <p className="reel-big a2">
        {data.partialGravityRuns} <small>of {data.points.length} test runs at partial gravity</small>
      </p>
      <p className="reel-finding reel-small a3">{data.gravityNote}</p>
      <Link href={`/lens?habitat=${f.id}`} className="btn btn-primary reel-cta a5">
        Check the {f.short}
      </Link>
    </div>
  );
}

export function ExplainerReel({ data }: { data: ReelData }) {
  const [scene, setScene] = useState(0);
  const [paused, setPaused] = useState(false);
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time read of a media query after hydration
      setReduced(true);
    }
  }, []);

  const go = (i: number) => setScene((i + SCENES.length) % SCENES.length);
  const stopped = paused || reduced;

  return (
    <div className="reel glass" data-paused={stopped} role="group" aria-roledescription="walkthrough" aria-label="How the tool works">
      <div className="reel-bar-top">
        <span className="reel-lights" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
        <span className="reel-title">
          <span className="num">
            {String(scene + 1).padStart(2, '0')} / {String(SCENES.length).padStart(2, '0')}
          </span>{' '}
          {SCENES[scene].label}
        </span>
        <span className="reel-controls">
          <button type="button" onClick={() => go(scene - 1)} aria-label="Previous step">
            ‹
          </button>
          {!reduced && (
            <button type="button" onClick={() => setPaused((p) => !p)} aria-label={paused ? 'Play' : 'Pause'} aria-pressed={paused}>
              {paused ? '▶' : '❙❙'}
            </button>
          )}
          <button type="button" onClick={() => go(scene + 1)} aria-label="Next step">
            ›
          </button>
        </span>
      </div>

      <div className="reel-progress">
        {SCENES.map((s, i) => (
          <button key={s.id} type="button" onClick={() => go(i)} aria-label={`Step ${i + 1}: ${s.label}`} aria-current={i === scene ? 'step' : undefined}>
            <i
              key={i === scene ? `on-${scene}` : 'off'}
              data-state={i < scene ? 'done' : i === scene ? 'on' : 'todo'}
              style={i === scene ? { animationDuration: `${SCENE_MS}ms` } : undefined}
              // The bar's own fill (on ::after) also ends here: advance only on the clock.
              onAnimationEnd={i === scene ? (e) => e.animationName === 'reel-clock' && go(scene + 1) : undefined}
            />
          </button>
        ))}
      </div>

      {/* Remounted per scene so its entrance animations run again. */}
      <div className="reel-stage" key={scene} aria-live="off">
        <Scene id={SCENES[scene].id} data={data} />
      </div>
    </div>
  );
}
