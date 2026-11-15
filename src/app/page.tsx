import Link from 'next/link';
import { ExplainerReel, type ReelData } from '@/components/ExplainerReel';
import { HabitatCard } from '@/components/HabitatCard';
import { IntroStory } from '@/components/IntroStory';
import { HABITAT_SHORT, investigationName, MATERIAL_LABEL, plural, SOLID_CLASSES, SOURCE_LABEL } from '@/components/format';
import { flammabilityPoints, getHabitat, habitats, investigations, meta } from '@/lib/data';
import { PARTIAL_GRAVITY_WARNING } from '@/lib/predict';

const FEATURES = [
  {
    href: '/lens',
    title: 'Habitat Lens',
    text: 'Pick an atmosphere and see which investigations matter most for it, with every score explained.',
  },
  {
    href: '/map',
    title: 'Coverage and gap map',
    text: 'Oxygen against pressure: what has been tested, where the habitats sit, and where the data runs out.',
  },
  {
    href: '/investigations',
    title: 'Investigation database',
    text: 'Every in-scope PSI combustion investigation, each field traceable to its NASA source.',
  },
];

export default function HomePage() {
  const focus = getHabitat('moon_base') ?? habitats[0];
  const pointInvestigations = new Set(flammabilityPoints.map((p) => p.psi_id)).size;

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

  return (
    <>
      <section className="hero hero-intro">
        <div className="hero-backdrop" aria-hidden="true" />
        {/* Real flame from BASS-II (PSI-25), one of the investigations in the dataset. Decorative here; credited below. */}
        {/* eslint-disable-next-line @next/next/no-img-element -- static decorative photo, no layout shift (absolutely positioned) */}
        <img className="hero-photo" src="/media/bass-ii-iss040e088023.jpg" alt="" aria-hidden="true" />
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
        <div className="scroll-cue rise rise-3" aria-hidden="true">
          <span>Scroll</span>
          <i />
        </div>
        <p className="hero-credit">
          Flame over a solid fuel sample in microgravity,{' '}
          <Link href="/investigations/PSI-25">BASS-II</Link> on the ISS.{' '}
          <a href="https://images.nasa.gov/details/iss040e088023" target="_blank" rel="noreferrer">
            Photo: NASA
          </a>
        </p>
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

      <section className="section" aria-label="Dataset summary" id="check">
        <div className="stats">
          <div className="stat">
            <span className="stat-value"><span data-count>{investigations.length}</span></span>
            <span className="stat-label">PSI combustion investigations</span>
          </div>
          <div className="stat">
            <span className="stat-value"><span data-count>{flammabilityPoints.length}</span></span>
            <span className="stat-label">
              {flammabilityPoints.length === 1 ? 'test run' : 'test runs'} from{' '}
              {plural(pointInvestigations, 'investigation')}
            </span>
          </div>
          <div className="stat">
            <span className="stat-value">
              <span data-count>{meta.n_fields_verified}</span> <small>of {meta.n_fields_total}</small>
            </span>
            <span className="stat-label">extracted fields verified against NASA source</span>
          </div>
          <div className="stat">
            <span className="stat-value"><span data-count>{habitats.length}</span></span>
            <span className="stat-label">habitat atmospheres to check</span>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="section-head">
          <h2>Check a habitat</h2>
          <span className="muted">Each preset opens the Habitat Lens with its atmosphere.</span>
        </div>
        <div className="grid grid-3">
          {habitats.map((h) => (
            <HabitatCard key={h.id} habitat={h} />
          ))}
        </div>
      </section>

      <section className="section">
        <div className="section-head">
          <h2>Explore</h2>
        </div>
        <div className="grid grid-3">
          {FEATURES.map((f) => (
            <Link key={f.href} href={f.href} className="card feature-card">
              <h3>{f.title}</h3>
              <p className="muted">{f.text}</p>
              <span className="arrow">Open →</span>
            </Link>
          ))}
        </div>
      </section>
    </>
  );
}
