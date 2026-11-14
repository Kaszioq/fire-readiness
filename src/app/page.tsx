import Link from 'next/link';
import { HabitatCard } from '@/components/HabitatCard';
import { IntroStory } from '@/components/IntroStory';
import { plural } from '@/components/format';
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

  return (
    <>
      <section className="hero hero-intro">
        <div className="hero-backdrop" aria-hidden="true" />
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
        <div className="scroll-cue rise rise-3" aria-hidden="true">
          <span>Scroll</span>
          <i />
        </div>
      </section>

      <IntroStory
        points={flammabilityPoints}
        habitats={habitats}
        focus={focus}
        earth={getHabitat('earth')}
        nInvestigations={investigations.length}
        partialGravityNote={PARTIAL_GRAVITY_WARNING}
      />

      <section className="section" aria-label="Dataset summary" id="check">
        <div className="stats">
          <div className="stat">
            <span className="stat-value">{investigations.length}</span>
            <span className="stat-label">PSI combustion investigations</span>
          </div>
          <div className="stat">
            <span className="stat-value">{flammabilityPoints.length}</span>
            <span className="stat-label">
              {flammabilityPoints.length === 1 ? 'test run' : 'test runs'} from{' '}
              {plural(pointInvestigations, 'investigation')}
            </span>
          </div>
          <div className="stat">
            <span className="stat-value">
              {meta.n_fields_verified} <small>of {meta.n_fields_total}</small>
            </span>
            <span className="stat-label">extracted fields verified against NASA source</span>
          </div>
          <div className="stat">
            <span className="stat-value">{habitats.length}</span>
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
