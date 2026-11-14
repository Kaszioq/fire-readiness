// Role B. Scroll-driven introduction on the home page: what the problem is, in four pinned chapters.
// Each chapter plays a short, time-based reveal the first time it scrolls into view (StoryReveal sets
// data-visible, CSS transitions do the rest). Nothing is tied to the scroll position itself, so the motion
// is the same with a mouse wheel, a trackpad or a finger. Without JavaScript the chapters are simply visible.
// Every number comes from '@/lib/data'; the two quotes are verbatim from the challenge statement.
import type { ReactNode } from 'react';
import Link from 'next/link';
import { CoverageTeaser } from '@/components/CoverageTeaser';
import { formatKpa, formatPercent, formatPsi, SOLID_CLASSES, sourceHref } from '@/components/format';
import { LoopVideo } from '@/components/LoopVideo';
import { StoryReveal } from '@/components/StoryReveal';
import type { FlammabilityPoint, Habitat } from '@/lib/types';

function Chapter({
  index,
  total,
  kicker,
  title,
  children,
  scene,
  wide = false,
}: {
  index: number;
  total: number;
  kicker: string;
  title: string;
  children: ReactNode;
  scene: ReactNode;
  /** Text above, scene across the full width below. */
  wide?: boolean;
}) {
  return (
    <section className="story-step" aria-labelledby={`story-${index}`}>
      <div className={wide ? 'story-pin story-wide' : 'story-pin'}>
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

/** Real footage. These two experiments are NASA fire-safety work but are not in the PSI snapshot analysed here. */
function FootageScene() {
  return (
    <div className="clips">
      <LoopVideo
        src="/media/saffire-vi-pmma.mp4"
        poster="/media/saffire-vi-pmma.jpg"
        label="A plastic sample burning in microgravity: bright yellow flames spreading along the sample"
        caption="Saffire-VI: a PMMA plastic sample burning inside a Cygnus cargo spacecraft."
        creditHref="https://images.nasa.gov/details/Saf-VI%20S8C3+C4%201-sided%20PMMA_unmapped_jpeg-20x%20no%20text"
      />
      <LoopVideo
        src="/media/sofie-gel.mp4"
        poster="/media/sofie-gel.jpg"
        label="A blue flame wrapped around a small sphere, shrinking and breaking apart until it goes out"
        caption="SoFIE-GEL: a flame around a solid sphere shrinking towards extinction."
        creditHref="https://images.nasa.gov/details/SoFIE-GEL"
      />
    </div>
  );
}

/** The method as a four-stage pipeline. Numbers come from the dataset. */
function FlowScene({
  nInvestigations,
  nPoints,
  nVerified,
  nFields,
}: {
  nInvestigations: number;
  nPoints: number;
  nVerified: number;
  nFields: number;
}) {
  const stages: { title: string; text: string; stat: string; href?: string; link?: string }[] = [
    {
      title: 'Source',
      text: 'Combustion investigations in the NASA PSI repository, snapshotted once. The app never guesses beyond it.',
      stat: `${nInvestigations} investigations`,
      href: '/investigations',
      link: 'Browse them',
    },
    {
      title: 'Curate',
      text: 'Every extracted field keeps its source, a verbatim quote and a verified flag. Unknown stays “not reported”.',
      stat: `${nVerified} of ${nFields} fields verified`,
      href: '/about',
      link: 'Method',
    },
    {
      title: 'Analyse',
      text: 'Rank investigations for a habitat, map tested conditions, and estimate fire behaviour from the nearest test runs.',
      stat: `${nPoints} test runs`,
      href: '/lens',
      link: 'Open the Lens',
    },
    {
      title: 'Report',
      text: 'A written summary that may only cite PSI IDs present in the data. Anything else is stripped and flagged.',
      stat: 'citations checked',
    },
  ];
  return (
    <ol className="flow">
      {stages.map((st, i) => (
        <li key={st.title} className="flow-node hud">
          <span className="flow-index num">{String(i + 1).padStart(2, '0')}</span>
          <h3>{st.title}</h3>
          <p className="muted">{st.text}</p>
          <span className="tag tag-accent">{st.stat}</span>
          {st.href && (
            <Link href={st.href} className="flow-link">
              {st.link} →
            </Link>
          )}
        </li>
      ))}
    </ol>
  );
}

export function IntroStory({
  points,
  habitats,
  focus,
  earth,
  nInvestigations,
  nFieldsVerified,
  nFieldsTotal,
  partialGravityNote,
}: {
  points: FlammabilityPoint[];
  habitats: Habitat[];
  focus: Habitat;
  earth: Habitat | undefined;
  nInvestigations: number;
  nFieldsVerified: number;
  nFieldsTotal: number;
  /** Vetted wording owned by role C (PARTIAL_GRAVITY_WARNING), shown verbatim. */
  partialGravityNote: string;
}) {
  const solids = points.filter((p) => SOLID_CLASSES.includes(p.material_class));
  const solidsAtFocus = solids.filter((p) => p.o2_mole_fraction >= focus.o2_mole_fraction).length;
  const total = 6;

  return (
    <div className="story">
      <div className="story-progress" aria-hidden="true" />
      <StoryReveal />

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
        kicker="What it looks like"
        title="Real flames, filmed in orbit"
        scene={<FootageScene />}
      >
        <p className="muted">
          NASA has been lighting fires in space on purpose for decades, to learn how materials burn before a crew has to
          find out.
        </p>
        <p className="card-foot">
          These two clips are from NASA experiments that are not part of the PSI snapshot analysed here. They are shown
          for context only.
        </p>
      </Chapter>

      <Chapter
        index={3}
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
        index={4}
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
        index={5}
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

      <Chapter
        index={6}
        total={total}
        kicker="How this tool works"
        title="From NASA records to an answer you can trace"
        wide
        scene={
          <FlowScene
            nInvestigations={nInvestigations}
            nPoints={points.length}
            nVerified={nFieldsVerified}
            nFields={nFieldsTotal}
          />
        }
      >
        <p className="muted">Four steps, and every number on screen can be followed back through them.</p>
      </Chapter>
    </div>
  );
}
