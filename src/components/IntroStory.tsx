// Role B. The story on the home page in six chapters, each with its own layout: a photo split, a two-screen
// cinema, a versus table of large figures, a chart with side figures, a full-width zero, and a pipeline track.
// Each chapter plays a short, time-based reveal the first time it scrolls into view (StoryReveal sets
// data-visible, CSS transitions on .rv do the rest). Nothing is tied to the scroll position itself, so the motion
// is the same with a mouse wheel, a trackpad or a finger. Without JavaScript the chapters are simply visible.
// Every number comes from '@/lib/data'; the two quotes are verbatim from the challenge statement.
import Link from 'next/link';
import { CoverageTeaser } from '@/components/CoverageTeaser';
import { formatKpa, formatPercent, formatPsi, HABITAT_SHORT, SOLID_CLASSES, sourceHref } from '@/components/format';
import { LoopVideo } from '@/components/LoopVideo';
import { StoryReveal } from '@/components/StoryReveal';
import type { FlammabilityPoint, Habitat } from '@/lib/types';

function Head({ index, total, kicker, title }: { index: number; total: number; kicker: string; title: string }) {
  return (
    <>
      <span className="story-count num rv" style={{ ['--i' as string]: 0 }}>
        {String(index).padStart(2, '0')} <i>/ {String(total).padStart(2, '0')}</i>
      </span>
      <span className="eyebrow rv" style={{ ['--i' as string]: 1 }}>
        {kicker}
      </span>
      <h2 id={`story-${index}`} className="ch-title rv" style={{ ['--i' as string]: 2 }}>
        {title}
      </h2>
    </>
  );
}

function Quote({ text, habitat, i }: { text: string; habitat: Habitat | undefined; i: number }) {
  const href = sourceHref(habitat?.prov.source_ref.url);
  return (
    <blockquote className="ch-quote rv" style={{ ['--i' as string]: i }}>
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

const ICONS = [
  // database
  <path key="a" d="M4 6c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3zm0 0v6c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6" />,
  // quote mark in a tag
  <path key="b" d="M4 5h10l6 7-6 7H4zM8 10v4M11 10v4" />,
  // chart
  <path key="c" d="M4 20V4M4 20h16M8 16v-4M12 16V8M16 16v-6" />,
  // document
  <path key="d" d="M6 3h8l4 4v14H6zM14 3v4h4M9 12h6M9 16h6" />,
];

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
  const maxSolidO2 = solids.reduce((max, p) => Math.max(max, p.o2_mole_fraction), 0);
  const focusShort = HABITAT_SHORT[focus.id] ?? focus.name;
  const pp = (v: number) => `${v > 0 ? '+' : ''}${Number((v * 100).toFixed(1))} points`;
  const rel = (v: number) => `${v > 0 ? '+' : ''}${Number((v * 100).toFixed(0))}%`;
  const versus = earth
    ? [
        {
          label: 'Oxygen',
          from: formatPercent(earth.o2_mole_fraction),
          to: formatPercent(focus.o2_mole_fraction),
          delta: pp(focus.o2_mole_fraction - earth.o2_mole_fraction),
          up: focus.o2_mole_fraction > earth.o2_mole_fraction,
        },
        {
          label: 'Pressure',
          from: formatKpa(earth.pressure_kpa),
          to: formatKpa(focus.pressure_kpa),
          delta: rel(focus.pressure_kpa / earth.pressure_kpa - 1),
          up: focus.pressure_kpa > earth.pressure_kpa,
          sub: formatPsi(focus.pressure_kpa),
        },
        {
          label: 'Gravity',
          from: `${earth.gravity_g} g`,
          to: `${focus.gravity_g} g`,
          delta: rel(focus.gravity_g / earth.gravity_g - 1),
          up: focus.gravity_g > earth.gravity_g,
        },
      ]
    : [];
  const stages = [
    {
      title: 'Source',
      text: 'Combustion investigations in the NASA PSI repository, snapshotted once. The app never guesses beyond it.',
      big: String(nInvestigations),
      unit: 'investigations',
      href: '/investigations',
      link: 'Browse them',
    },
    {
      title: 'Curate',
      text: 'Every extracted field keeps its source, a verbatim quote and a verified flag. Unknown stays “not reported”.',
      big: String(nFieldsVerified),
      unit: `of ${nFieldsTotal} fields verified`,
      href: '/about',
      link: 'Method',
    },
    {
      title: 'Analyse',
      text: 'Rank investigations for a habitat, map tested conditions, and estimate fire behaviour from the nearest test runs.',
      big: String(points.length),
      unit: 'test runs',
      href: '/lens',
      link: 'Open the Lens',
    },
    {
      title: 'Report',
      text: 'A written summary that may only cite PSI IDs present in the data. Anything else is stripped and flagged.',
      big: 'PSI',
      unit: 'citations only',
      href: undefined,
      link: undefined,
    },
  ];

  return (
    <div className="story">
      <div className="story-progress" aria-hidden="true" />
      <StoryReveal />

      {/* 1. Photo split: the real comparison, edge to edge. */}
      <section className="story-step ch ch-split" aria-labelledby="story-1">
        <div className="ch-copy">
          <Head index={1} total={total} kicker="Why space fire is different" title="Without buoyancy, a flame stops being a flame you know" />
          <Quote
            i={3}
            text="Instead of a flickering teardrop, a candle flame becomes a ghostly blue sphere reliant on diffusion for its oxygen."
            habitat={focus}
          />
          <p className="muted rv" style={{ ['--i' as string]: 4 }}>
            Hot gas no longer rises, so what feeds a fire is air flow and oxygen level. Earth intuition does not carry
            over directly.
          </p>
        </div>
        <figure className="ch-photo rv" style={{ ['--i' as string]: 3 }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- static local photo in a fixed aspect box */}
          <img
            src="/media/candle-1g-vs-microgravity-grc-1998-c-00485.jpg"
            alt="A tall yellow candle flame in normal gravity beside a small blue dome-shaped flame in microgravity"
            loading="lazy"
          />
          <span className="ch-tag ch-tag-l">Earth gravity</span>
          <span className="ch-tag ch-tag-r">Microgravity</span>
          <figcaption>
            A candle flame in normal gravity and in microgravity.{' '}
            <a href="https://images.nasa.gov/details/GRC-1998-C-00485" target="_blank" rel="noreferrer">
              Photo: NASA
            </a>
          </figcaption>
        </figure>
      </section>

      {/* 2. Cinema: two screens. */}
      <section className="story-step ch ch-cinema" aria-labelledby="story-2">
        <div className="ch-center">
          <Head index={2} total={total} kicker="What it looks like" title="Real flames, filmed in orbit" />
          <p className="muted rv" style={{ ['--i' as string]: 3 }}>
            NASA has been lighting fires in space on purpose for decades, to learn how materials burn before a crew has
            to find out.
          </p>
        </div>
        <div className="rv" style={{ ['--i' as string]: 4 }}>
          <FootageScene />
        </div>
        <p className="card-foot rv" style={{ ['--i' as string]: 5 }}>
          These two clips are from NASA experiments that are not part of the PSI snapshot analysed here. They are shown
          for context only.
        </p>
      </section>

      {/* 3. Versus: Earth against the habitat, figure by figure. */}
      <section className="story-step ch ch-versus" aria-labelledby="story-3">
        <div className="ch-copy">
          <Head index={3} total={total} kicker="The atmosphere changes" title="The Moon base will have more oxygen at lower pressure" />
          <Quote
            i={3}
            text="The intermediate oxygen concentration used on the Moon will likely be 30% or greater, with a corresponding pressure of 10.2 psi or less."
            habitat={focus}
          />
          <p className="muted rv" style={{ ['--i' as string]: 4 }}>
            That shortens the oxygen pre-breathe before a spacewalk. It also makes materials easier to burn.
          </p>
        </div>
        <div className="versus">
          <div className="versus-head rv" style={{ ['--i' as string]: 3 }}>
            <span />
            <span>{earth ? (HABITAT_SHORT[earth.id] ?? earth.name) : ''}</span>
            <span />
            <span>{focusShort}</span>
          </div>
          {versus.map((v, k) => (
            <div key={v.label} className="versus-row rv" style={{ ['--i' as string]: 4 + k }}>
              <span className="versus-label">{v.label}</span>
              <b className="versus-from">{v.from}</b>
              <span className="versus-arrow" aria-hidden="true" />
              <b className="versus-to">
                {v.to}
                {v.sub && <small>{v.sub}</small>}
              </b>
              <span className="versus-delta" data-up={v.up}>
                {v.delta}
              </span>
            </div>
          ))}
          {focus.is_assumption && <p className="card-foot">Scenario values are assumptions.</p>}
        </div>
      </section>

      {/* 4. Chart with side figures. */}
      <section className="story-step ch ch-chart" aria-labelledby="story-4">
        <div className="ch-center">
          <Head index={4} total={total} kicker="What has been tested" title="Every test run on one chart" />
          <p className="muted rv" style={{ ['--i' as string]: 3 }}>
            Each dot is one test run from the NASA PSI repository, placed by the oxygen level and pressure it was run
            at. The crosshair is the {focusShort} atmosphere.
          </p>
        </div>
        <div className="ch-chart-grid">
          <div className="rv" style={{ ['--i' as string]: 4 }}>
            <CoverageTeaser points={points} habitats={habitats} focus={focus} />
          </div>
          <div className="ch-figs">
            <div className="rv" style={{ ['--i' as string]: 5 }}>
              <b className="bignum">{nInvestigations}</b>
              <span>investigations</span>
            </div>
            <div className="rv" style={{ ['--i' as string]: 6 }}>
              <b className="bignum">{points.length}</b>
              <span>test runs</span>
            </div>
            <div className="rv" style={{ ['--i' as string]: 7 }}>
              <b className="bignum">
                {formatPercent(maxSolidO2).replace('%', '')}
                <small>%</small>
              </b>
              <span>highest oxygen level tested on a solid material</span>
            </div>
          </div>
        </div>
      </section>

      {/* 5. The gap: one number, full width. */}
      <section className="story-step ch ch-gap band tex-carbon" aria-labelledby="story-5">
        <Head index={5} total={total} kicker="The gap" title="The data stops short of where the crew will live" />
        <p className="ch-zero rv" style={{ ['--i' as string]: 3 }}>
          {solidsAtFocus}
          <small>of {solids.length}</small>
        </p>
        <p className="ch-zero-cap rv" style={{ ['--i' as string]: 4 }}>
          solid-material test runs in the PSI microgravity data are at or above {formatPercent(focus.o2_mole_fraction)}{' '}
          oxygen. Fabrics and plastics are what a habitat is full of.
        </p>
        <div className="callout rv" style={{ ['--i' as string]: 5 }}>
          {partialGravityNote}
        </div>
      </section>

      {/* 6. Pipeline track. */}
      <section className="story-step ch ch-flow" aria-labelledby="story-6">
        <div className="ch-center">
          <Head index={6} total={total} kicker="How this tool works" title="From NASA records to an answer you can trace" />
          <p className="muted rv" style={{ ['--i' as string]: 3 }}>
            Four steps, and every number on screen can be followed back through them.
          </p>
        </div>
        <ol className="track">
          {stages.map((st, k) => (
            <li key={st.title} className="track-step rv" style={{ ['--i' as string]: 4 + k * 1.5 }}>
              <span className="track-node" aria-hidden="true">
                <svg viewBox="0 0 24 24">{ICONS[k]}</svg>
              </span>
              <span className="track-no" aria-hidden="true">
                {String(k + 1).padStart(2, '0')}
              </span>
              <h3>{st.title}</h3>
              <p className="track-big">
                <b className="bignum">{st.big}</b>
                <span>{st.unit}</span>
              </p>
              <p className="muted">{st.text}</p>
              {st.href && (
                <Link href={st.href} className="flow-link">
                  {st.link} →
                </Link>
              )}
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
