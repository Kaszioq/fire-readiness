// Role B. Scroll-driven introduction on the home page: what the problem is, in four pinned chapters.
// No JavaScript: the motion is CSS scroll-driven animation (animation-timeline: view()), and browsers
// without it, or users who prefer reduced motion, get the same content as a plain static page.
// Every number comes from '@/lib/data'; the two quotes are verbatim from the challenge statement.
import type { ReactNode } from 'react';
import { CoverageTeaser } from '@/components/CoverageTeaser';
import { formatKpa, formatPercent, formatPsi, SOLID_CLASSES, sourceHref } from '@/components/format';
import type { FlammabilityPoint, Habitat } from '@/lib/types';

function Chapter({
  index,
  total,
  kicker,
  title,
  children,
  scene,
}: {
  index: number;
  total: number;
  kicker: string;
  title: string;
  children: ReactNode;
  scene: ReactNode;
}) {
  return (
    <section className="story-step" aria-labelledby={`story-${index}`}>
      <div className="story-pin">
        <div className="story-copy">
          <span className="story-count num">
            {String(index).padStart(2, '0')} <i>/ {String(total).padStart(2, '0')}</i>
          </span>
          <span className="eyebrow">{kicker}</span>
          <h2 id={`story-${index}`}>{title}</h2>
          {children}
        </div>
        <div className="story-scene">{scene}</div>
      </div>
    </section>
  );
}

function Quote({ text, habitat }: { text: string; habitat: Habitat | undefined }) {
  const href = sourceHref(habitat?.prov.source_ref.url);
  return (
    <blockquote className="story-quote">
      “{text}”
      <footer>
        {href ? (
          <a href={href} target="_blank" rel="noreferrer">
            Challenge statement
          </a>
        ) : (
          'Challenge statement'
        )}
      </footer>
    </blockquote>
  );
}

/** Two flames side by side. An illustration of the description in the challenge statement, not data. */
function FlameScene() {
  return (
    <figure className="hud">
      <svg viewBox="0 0 400 260" role="img" aria-label="Illustration: a teardrop flame in Earth gravity next to a spherical blue flame in microgravity">
        <defs>
          <radialGradient id="flame-1g" cx="50%" cy="78%" r="70%">
            <stop offset="0" stopColor="#fff6da" />
            <stop offset="0.35" stopColor="#ffb454" />
            <stop offset="1" stopColor="#c2410c" stopOpacity="0.15" />
          </radialGradient>
          <radialGradient id="flame-0g" cx="50%" cy="50%" r="50%">
            <stop offset="0" stopColor="#0b1220" stopOpacity="0" />
            <stop offset="0.55" stopColor="#3b82f6" stopOpacity="0.35" />
            <stop offset="0.82" stopColor="#6cb6ff" />
            <stop offset="1" stopColor="#6cb6ff" stopOpacity="0" />
          </radialGradient>
        </defs>
        <g className="flame-flicker">
          <path
            d="M110 40 C128 88 150 112 150 150 C150 178 132 196 110 196 C88 196 70 178 70 150 C70 112 92 88 110 40 Z"
            fill="url(#flame-1g)"
          />
        </g>
        <rect x="107" y="188" width="6" height="28" rx="2" fill="var(--text-faint)" />
        <rect x="287" y="150" width="6" height="66" rx="2" fill="var(--text-faint)" opacity="0.6" />
        <g className="flame-breathe">
          <circle cx="290" cy="150" r="52" fill="url(#flame-0g)" />
        </g>
        <text x="110" y="244" textAnchor="middle" className="chart-label" fill="var(--text)">
          Earth gravity
        </text>
        <text x="290" y="244" textAnchor="middle" className="chart-label" fill="var(--text)">
          Microgravity
        </text>
      </svg>
      <figcaption>Illustration of the description above, not experimental data.</figcaption>
    </figure>
  );
}

/** Oxygen and pressure of two habitats as bars. Values straight from the habitat presets. */
function AtmosphereScene({ rows }: { rows: Habitat[] }) {
  const maxKpa = Math.max(...rows.map((h) => h.pressure_kpa));
  return (
    <figure className="hud">
      <div className="atmo">
        {rows.map((h) => (
          <div key={h.id} className="atmo-row">
            <h3>{h.name}</h3>
            <div className="atmo-bar">
              <span>Oxygen</span>
              <div className="atmo-track">
                <div className="atmo-fill atmo-o2" style={{ width: `${h.o2_mole_fraction * 100}%` }} />
              </div>
              <strong className="num">{formatPercent(h.o2_mole_fraction)}</strong>
            </div>
            <div className="atmo-bar">
              <span>Pressure</span>
              <div className="atmo-track">
                <div className="atmo-fill" style={{ width: `${(h.pressure_kpa / maxKpa) * 100}%` }} />
              </div>
              <strong className="num">
                {formatKpa(h.pressure_kpa)} <small>{formatPsi(h.pressure_kpa)}</small>
              </strong>
            </div>
          </div>
        ))}
      </div>
      <figcaption>
        Oxygen bar: share of the atmosphere. Pressure bar: relative to {formatKpa(maxKpa)}.
        {rows.some((h) => h.is_assumption) && ' Scenario values are assumptions.'}
      </figcaption>
    </figure>
  );
}

export function IntroStory({
  points,
  habitats,
  focus,
  earth,
  nInvestigations,
  partialGravityNote,
}: {
  points: FlammabilityPoint[];
  habitats: Habitat[];
  focus: Habitat;
  earth: Habitat | undefined;
  nInvestigations: number;
  /** Vetted wording owned by role C (PARTIAL_GRAVITY_WARNING), shown verbatim. */
  partialGravityNote: string;
}) {
  const solids = points.filter((p) => SOLID_CLASSES.includes(p.material_class));
  const solidsAtFocus = solids.filter((p) => p.o2_mole_fraction >= focus.o2_mole_fraction).length;
  const total = 4;

  return (
    <div className="story">
      <div className="story-progress" aria-hidden="true" />

      <Chapter
        index={1}
        total={total}
        kicker="Why space fire is different"
        title="Without buoyancy, a flame stops being a flame you know"
        scene={<FlameScene />}
      >
        <Quote
          text="Instead of a flickering teardrop, a candle flame becomes a ghostly blue sphere reliant on diffusion for its oxygen."
          habitat={focus}
        />
        <p className="muted">
          Hot gas no longer rises, so what feeds a fire is air flow and oxygen level. Earth intuition does not carry
          over directly.
        </p>
      </Chapter>

      <Chapter
        index={2}
        total={total}
        kicker="The atmosphere changes"
        title="The Moon base will have more oxygen at lower pressure"
        scene={<AtmosphereScene rows={earth ? [earth, focus] : [focus]} />}
      >
        <Quote
          text="The intermediate oxygen concentration used on the Moon will likely be 30% or greater, with a corresponding pressure of 10.2 psi or less."
          habitat={focus}
        />
        <p className="muted">
          That shortens the oxygen pre-breathe before a spacewalk. It also makes materials easier to burn.
        </p>
      </Chapter>

      <Chapter
        index={3}
        total={total}
        kicker="What has been tested"
        title={`${nInvestigations} investigations, ${points.length} test runs, one chart`}
        scene={<CoverageTeaser points={points} habitats={habitats} focus={focus} />}
      >
        <p className="muted">
          Each dot is one test run from the NASA PSI repository, placed by the oxygen level and pressure it was run at.
          The crosshair is the {focus.name.replace(/\s*\(.*\)$/, '')} atmosphere.
        </p>
      </Chapter>

      <Chapter
        index={4}
        total={total}
        kicker="The gap"
        title="The data stops short of where the crew will live"
        scene={
          <figure className="hud gap-scene">
            <div className="gap-number num">
              {solidsAtFocus} <small>of {solids.length}</small>
            </div>
            <p>
              solid-material test runs in the PSI microgravity data are at or above{' '}
              {formatPercent(focus.o2_mole_fraction)} oxygen
            </p>
          </figure>
        }
      >
        <p className="muted">
          Fabrics and plastics are what a habitat is full of, and they are the materials with no microgravity test in
          PSI near the Moon base atmosphere.
        </p>
        <div className="callout">{partialGravityNote}</div>
      </Chapter>
    </div>
  );
}
