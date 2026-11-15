import Link from 'next/link';
import { BackdropVideo } from '@/components/BackdropVideo';
import { ExplainerReel, type ReelData } from '@/components/ExplainerReel';
import { HabitatConsole, type ConsoleData } from '@/components/HabitatConsole';
import { ExploreTiles, HabitatStrips, NumbersBand } from '@/components/HomeSections';
import { IntroStory } from '@/components/IntroStory';
import { PinScroll } from '@/components/PinScroll';
import {
  formatKpa,
  formatPercent,
  formatPsi,
  HABITAT_SHORT,
  investigationName,
  MATERIAL_LABEL,
  SOLID_CLASSES,
  SOURCE_LABEL,
} from '@/components/format';
import { flammabilityPoints, getHabitat, habitats, investigations, meta } from '@/lib/data';
import { PARTIAL_GRAVITY_WARNING } from '@/lib/predict';


// Context photos (NASA Image and Video Library). Captions restate NASA's own descriptions.
const GALLERY = [
  {
    id: 'GRC-1998-C-00485',
    file: 'candle-1g-vs-microgravity-grc-1998-c-00485.jpg',
    size: 'shot-wide shot-zoom',
    position: 'center',
    alt: 'Two candle flames side by side: a tall yellow teardrop and a small blue dome',
    caption: 'A candle flame in normal gravity (left) and in microgravity (right).',
  },
  {
    id: 'sts098-713a-004',
    file: 'iss-over-earth-sts098-713a-004.jpg',
    size: 'shot-tall',
    position: 'center',
    alt: 'The International Space Station above a blue and white Earth',
    caption: 'The International Space Station with its Destiny laboratory, 2001.',
  },
  {
    id: '9902615',
    file: 'candle-microgravity-9902615.jpg',
    size: '',
    position: 'center',
    alt: 'A dim blue candle flame in microgravity',
    caption: 'Candle Flames in Microgravity experiment.',
  },
  {
    id: 'iss028e007274',
    file: 'earth-limb-iss028e007274.jpg',
    size: '',
    position: 'center',
    alt: "The Sun rising over the curve of the Earth's horizon",
    caption: "The Sun over Earth's limb, from the space station, 2011.",
  },
  {
    id: 'as17-134-20435',
    file: 'apollo17-site-as17-134-20435.jpg',
    size: '',
    position: '50% 62%',
    alt: 'Grey lunar plain with a lander and a rover in the distance under a black sky',
    caption: 'Apollo 17 landing site in the Taurus-Littrow valley, 1972.',
  },
  {
    id: 'as17-137-20979',
    file: 'apollo17-rover-as17-137-20979.jpg',
    size: '',
    position: 'center',
    alt: 'Close view of the lunar roving vehicle on the Moon',
    caption: 'Lunar roving vehicle at Taurus-Littrow, Apollo 17, 1972.',
  },
];

export default function HomePage() {
  const focus = getHabitat('moon_base') ?? habitats[0];

  // Everything the hero walkthrough shows, computed here from the curated data.
  const solids = flammabilityPoints.filter((p) => SOLID_CLASSES.includes(p.material_class));
  const solidClasses = Array.from(new Set(solids.map((p) => p.material_class)));
  const cited = investigations.find((i) => i.key_findings.some((f) => f.value && f.prov.quote));
  const finding = cited?.key_findings.find((f) => f.value && f.prov.quote);
  const reel: ReelData = {
    habitats: habitats.map((h) => ({ id: h.id, short: HABITAT_SHORT[h.id] ?? h.name })),
    focus: {
      id: focus.id,
      short: HABITAT_SHORT[focus.id] ?? focus.name,
      name: focus.name,
      o2: focus.o2_mole_fraction,
      kpa: focus.pressure_kpa,
      g: focus.gravity_g,
    },
    points: flammabilityPoints.map((p) => ({
      o2: p.o2_mole_fraction,
      kpa: p.pressure_kpa,
      solid: SOLID_CLASSES.includes(p.material_class),
    })),
    solids: solids.length,
    solidsAtFocus: solids.filter((p) => p.o2_mole_fraction >= focus.o2_mole_fraction).length,
    classes: solidClasses.map((cls) => {
      const own = solids.filter((p) => p.material_class === cls);
      return { label: MATERIAL_LABEL[cls] ?? cls, n: own.length, o2Max: Math.max(...own.map((p) => p.o2_mole_fraction)) };
    }),
    finding:
      cited && finding && finding.value
        ? {
            text: finding.value,
            quote: finding.prov.quote ?? null,
            source: SOURCE_LABEL[finding.prov.source_type] ?? finding.prov.source_type,
            locator: finding.prov.source_ref.locator ?? null,
            psiId: cited.psi_id,
            name: investigationName(cited),
            verified: finding.prov.verified,
          }
        : null,
    partialGravityRuns: flammabilityPoints.filter((p) => p.gravity === 'partial_emulated').length,
    gravityNote: PARTIAL_GRAVITY_WARNING,
    nInvestigations: investigations.length,
  };

  const earth = getHabitat('earth');
  const consoleData: ConsoleData = {
    id: focus.id,
    short: HABITAT_SHORT[focus.id] ?? focus.name,
    o2: focus.o2_mole_fraction,
    kpa: focus.pressure_kpa,
    g: focus.gravity_g,
    earth: earth ? { o2: earth.o2_mole_fraction, kpa: earth.pressure_kpa, g: earth.gravity_g } : null,
    classes: solidClasses.map((cls) => {
      const own = solids.filter((p) => p.material_class === cls);
      return {
        label: MATERIAL_LABEL[cls] ?? cls,
        n: own.length,
        atOrAbove: own.filter((p) => p.o2_mole_fraction >= focus.o2_mole_fraction).length,
      };
    }),
    partialGravityRuns: reel.partialGravityRuns,
    totalRuns: flammabilityPoints.length,
  };

  return (
    <>
      <section className="hero hero-intro">
        <div className="hero-backdrop" aria-hidden="true" />
        {/* eslint-disable-next-line @next/next/no-img-element -- decorative backdrop, absolutely positioned */}
        <img className="hero-bg" src="/media/earth-limb-iss028e007274.jpg" alt="" aria-hidden="true" />
        <div className="hero-grid">
          <div className="hero-copy">
            <span className="eyebrow rise">NASA PSI microgravity combustion data</span>
            <h1 className="rise rise-1">
              Is this habitat atmosphere <em>fire-safe</em>?
            </h1>
            <p className="lead rise rise-2">
              Which NASA combustion investigations tell us whether a crewed habitat is fire-safe, how confident can we
              be, and what must future experiments still measure?
            </p>
            <div className="btn-row rise rise-3">
              <Link href={`/lens?habitat=${focus.id}`} className="btn btn-primary">
                Check the {focus.name.replace(/\s*\(.*\)$/, '')}
              </Link>
              <a href="#check" className="btn">
                Skip the intro
              </a>
            </div>
          </div>
          <ExplainerReel data={reel} />
        </div>
        <div className="hero-figs">
          <div>
            <b className="bignum">{investigations.length}</b>
            <span>NASA investigations</span>
          </div>
          <div>
            <b className="bignum">{flammabilityPoints.length}</b>
            <span>individual test runs</span>
          </div>
          <div>
            <b className="bignum">
              {reel.solidsAtFocus}
              <small>of {reel.solids}</small>
            </b>
            <span>
              solid-material runs at or above {formatPercent(focus.o2_mole_fraction)} oxygen
            </span>
          </div>
          <p className="hero-credit">
            The Sun over Earth&apos;s limb, from the International Space Station.{' '}
            <a href="https://images.nasa.gov/details/iss028e007274" target="_blank" rel="noreferrer">
              Photo: NASA
            </a>
          </p>
        </div>
      </section>

      <IntroStory
        points={flammabilityPoints}
        habitats={habitats}
        focus={focus}
        earth={getHabitat('earth')}
        nInvestigations={investigations.length}
        nFieldsVerified={meta.n_fields_verified}
        nFieldsTotal={meta.n_fields_total}
        partialGravityNote={PARTIAL_GRAVITY_WARNING}
      />

      <section className="band band-video" aria-labelledby="moon-h">
        <BackdropVideo src="/media/moon-flyover.mp4" poster="/media/moon-flyover.jpg" />
        <div className="band-grid">
          <div className="band-inner">
            <span className="eyebrow">Where this matters</span>
            <h2 id="moon-h" className="band-title">
              {focus.name.replace(/\s*\(.*\)$/, '')}: {formatPercent(focus.o2_mole_fraction)} oxygen at{' '}
              {formatKpa(focus.pressure_kpa)}, {focus.gravity_g} g.
            </h2>
            <p className="lead">
              More oxygen than the air on Earth, at lower pressure ({formatPsi(focus.pressure_kpa)}), in gravity that no
              test in this dataset has reached.
            </p>
            <p className="band-credit">
              Flyover of the Taurus-Littrow valley, the Apollo 17 landing site, built from Lunar Reconnaissance Orbiter
              data.{' '}
              <a
                href="https://images.nasa.gov/details/GSFC_20190513_m4714_Lee_Lincoln_Scarp_Moon_Flyover"
                target="_blank"
                rel="noreferrer"
              >
                Video: NASA
              </a>
            </p>
          </div>
          <HabitatConsole data={consoleData} />
        </div>
      </section>

      <section aria-labelledby="gallery-h">
        <PinScroll
          head={
            <div className="section-head">
              <h2 id="gallery-h">From a candle flame to the Moon</h2>
              <span className="muted">Context photos from NASA. They are not part of the dataset.</span>
            </div>
          }
        >
          {GALLERY.map((g) => (
            <figure key={g.id} className={`shot ${g.size.includes('shot-zoom') ? 'shot-zoom' : ''}`}>
              {/* eslint-disable-next-line @next/next/no-img-element -- static local photo with fixed aspect box */}
              <img src={`/media/${g.file}`} alt={g.alt} loading="lazy" style={{ objectPosition: g.position }} />
              <figcaption>
                {g.caption}{' '}
                <a href={`https://images.nasa.gov/details/${g.id}`} target="_blank" rel="noreferrer">
                  Photo: NASA
                </a>
              </figcaption>
            </figure>
          ))}
        </PinScroll>
      </section>

      <section className="band tex-carbon" aria-label="Dataset summary" id="check">
        <div className="section-head">
          <h2>The dataset in numbers</h2>
          <span className="muted">Snapshot of the NASA PSI repository, {meta.fetched_at}.</span>
        </div>
        <NumbersBand investigations={investigations} points={flammabilityPoints} habitats={habitats} meta={meta} />
      </section>

      <section className="band tex-hex">
        <div className="section-head">
          <h2>Check a habitat</h2>
          <span className="muted">Each preset opens the Habitat Lens with its atmosphere.</span>
        </div>
        <HabitatStrips habitats={habitats} />
      </section>

      <section className="band tex-brushed">
        <div className="section-head">
          <h2>Explore</h2>
        </div>
        <ExploreTiles focus={focus} points={flammabilityPoints} investigations={investigations} />
      </section>
    </>
  );
}
