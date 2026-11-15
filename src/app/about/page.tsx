// Role B (content agreed with role A). Method, provenance, verification stats, limits, sources, license, team.
// Every number on this page is computed from '@/lib/data'; the prose states only what docs/STATUS.md records.
import Link from 'next/link';
import { formatKpa, formatPercent, HABITAT_SHORT, investigationName, plural, SOLID_CLASSES } from '@/components/format';
import { flammabilityPoints, getHabitat, habitats, investigations, meta } from '@/lib/data';
import { PARTIAL_GRAVITY_WARNING } from '@/lib/predict';

export const metadata = { title: 'About' };

const REPO = 'https://github.com/Kaszioq/fire-readiness';

const SOURCES = [
  {
    label: 'NASA Physical Sciences Informatics (PSI)',
    href: 'https://psi.nasa.gov',
    note: 'Investigation records, experimental tables and documents. The primary source of every investigation and test run.',
  },
  {
    label: 'Ferkul et al., LPSC 2026 (NTRS 20260000646)',
    href: 'https://ntrs.nasa.gov/citations/20260000646',
    note: 'Flammability of Materials on the Moon (FM2): why microgravity and Earth-gravity tests do not bound lunar gravity.',
  },
  {
    label: 'NASA: Flammability of Materials on the Moon (FM2)',
    href: 'https://www.nasa.gov/flammability-of-materials-on-the-moon-fm2/',
    note: 'The planned lunar-surface flammability experiment.',
  },
  {
    label: 'NASA Image and Video Library',
    href: 'https://images.nasa.gov',
    note: 'The flame photo and the two video clips on the home page.',
  },
];

export default function AboutPage() {
  const moon = getHabitat('moon_base');
  const solids = flammabilityPoints.filter((p) => SOLID_CLASSES.includes(p.material_class));
  const solidsAtMoon = moon ? solids.filter((p) => p.o2_mole_fraction >= moon.o2_mole_fraction).length : null;
  const pointsVerified = flammabilityPoints.filter((p) => p.prov.verified).length;
  const pointInvestigations = new Set(flammabilityPoints.map((p) => p.psi_id)).size;
  const scenarios = habitats.filter((h) => h.is_assumption);
  const verifiedShare = meta.n_fields_total > 0 ? meta.n_fields_verified / meta.n_fields_total : null;

  return (
    <>
      <header className="page-head">
        <span className="eyebrow">About</span>
        <h1>Method, sources and limits</h1>
        <p className="lead">
          A NASA Space Apps Challenge 2026 entry that summarizes, ranks and interprets NASA PSI combustion investigations
          for spacecraft fire safety.
        </p>
      </header>

      <div className="callout" role="note">
        This is not an official NASA tool and NASA does not endorse it. It is a hackathon project and must not be used
        for design or safety decisions. Rockets and propellants are out of scope, as stated in the challenge.
      </div>

      <section className="section" aria-label="Dataset in numbers">
        <div className="stats">
          <div className="stat">
            <span className="stat-value">{investigations.length}</span>
            <span className="stat-label">PSI combustion investigations</span>
          </div>
          <div className="stat">
            <span className="stat-value">{flammabilityPoints.length}</span>
            <span className="stat-label">test runs from {plural(pointInvestigations, 'investigation')}</span>
          </div>
          <div className="stat">
            <span className="stat-value">
              {meta.n_fields_verified} <small>of {meta.n_fields_total}</small>
            </span>
            <span className="stat-label">
              extracted fields verified against NASA source{verifiedShare !== null && ` (${formatPercent(verifiedShare)})`}
            </span>
          </div>
          <div className="stat">
            <span className="stat-value">{meta.fetched_at}</span>
            <span className="stat-label">date of the PSI snapshot</span>
          </div>
        </div>
      </section>

      <div className="about section">
        <section className="card prose">
          <h2>The question</h2>
          <p>
            Of the NASA PSI microgravity combustion investigations, which ones tell us whether a habitat atmosphere is
            fire-safe, how confident can we be, and what must future experiments still measure?
          </p>
          <h2>How it works</h2>
          <ol>
            <li>
              <strong>Source.</strong> Combustion investigations are taken from a dated snapshot of the NASA PSI
              repository. Search results that are not combustion studies are excluded and listed, with the reason, in{' '}
              <a href={`${REPO}/blob/main/data/curated/excluded.json`} target="_blank" rel="noreferrer">
                the repository
              </a>
              .
            </li>
            <li>
              <strong>Curate.</strong> Conditions, findings and test runs are extracted into one schema. Every field
              carries its source, a locator, a verbatim quote where it was extracted by hand or by a language model, and
              a verified flag. A value that the sources do not report is shown as “not reported”.
            </li>
            <li>
              <strong>Rank.</strong> The <Link href="/lens">Habitat Lens</Link> scores each investigation for a chosen
              atmosphere. Every score is the sum of named components, each with its reason.
            </li>
            <li>
              <strong>Predict.</strong> The predictor compares the chosen conditions with the nearest test runs of the
              same material class. It is an evidence-based estimate, not a certified model: it always shows its
              confidence and the test runs behind it, and outside the tested range it answers “no evidence”.
            </li>
            <li>
              <strong>Report.</strong> A language model writes a short report from the curated data only. It may cite
              only investigations that are in the data; any other citation is removed and counted.
            </li>
          </ol>
        </section>

        <section className="card prose">
          <h2>Limits you should know</h2>
          <ul>
            <li>
              <strong>Gravity.</strong> {PARTIAL_GRAVITY_WARNING}
            </li>
            {moon && solidsAtMoon !== null && (
              <li>
                <strong>Solid materials at the Moon base atmosphere.</strong>{' '}
                {solidsAtMoon === 0 ? 'None' : solidsAtMoon} of the {solids.length} solid-material test runs in the PSI
                microgravity data {solidsAtMoon === 1 ? 'is' : 'are'} at or above {formatPercent(moon.o2_mole_fraction)}{' '}
                oxygen ({HABITAT_SHORT[moon.id]}: {formatPercent(moon.o2_mole_fraction)} O2,{' '}
                {formatKpa(moon.pressure_kpa)}). This is a statement about this dataset only: ground tests at elevated
                oxygen exist outside PSI. See the <Link href="/map?habitat=moon_base">gap map</Link>.
              </li>
            )}
            <li>
              <strong>Verification.</strong> {meta.n_fields_verified} of {meta.n_fields_total} extracted fields count
              as verified because they were copied or computed directly from the PSI record. The remaining fields were
              extracted by hand or by a language model and await human review. {pointsVerified} of{' '}
              {flammabilityPoints.length} test runs are marked verified.
            </li>
            {scenarios.length > 0 && (
              <li>
                <strong>Scenario atmospheres.</strong> The values for{' '}
                {scenarios.map((h) => HABITAT_SHORT[h.id] ?? h.name).join(', ')} are scenarios, not sourced
                specifications, and are labelled as such.
              </li>
            )}
            <li>
              <strong>Tested ranges.</strong> A rectangle on the gap map is the range an investigation reports. It does
              not mean every combination inside it was tested.
            </li>
            <li>
              <strong>Scope.</strong> Rockets and propellants are not covered.
            </li>
          </ul>
        </section>

        <section className="card prose">
          <h2>Sources</h2>
          <ul className="about-sources">
            {SOURCES.map((s) => (
              <li key={s.href}>
                <a href={s.href} target="_blank" rel="noreferrer">
                  {s.label}
                </a>
                <span className="muted">{s.note}</span>
              </li>
            ))}
          </ul>
          <p className="muted small">
            The full reference list (publications, libraries, the language model and its provider, media credits) is in
            the{' '}
            <a href={`${REPO}#references`} target="_blank" rel="noreferrer">
              README
            </a>
            . How each table was mapped, with every assumption, is in{' '}
            <a href={`${REPO}/blob/main/data/curated/mappings.md`} target="_blank" rel="noreferrer">
              mappings.md
            </a>
            .
          </p>
          <h2>Investigations in the dataset</h2>
          <ul className="about-inv">
            {investigations.map((i) => (
              <li key={i.psi_id}>
                <Link href={`/investigations/${i.psi_id}`}>{investigationName(i)}</Link>{' '}
                <a href={i.psi_url} target="_blank" rel="noreferrer" className="muted">
                  {i.psi_id} on PSI
                </a>
              </li>
            ))}
          </ul>
        </section>

        <section className="card prose">
          <h2>License and media</h2>
          <p>
            The code is open source under the{' '}
            <a href={`${REPO}/blob/main/LICENSE`} target="_blank" rel="noreferrer">
              Apache 2.0 license
            </a>
            . Photos and video are NASA material from the NASA Image and Video Library; no NASA insignia is used and no
            endorsement is implied. The illustrations and the site icon are original. The site uses system fonts only.
          </p>
          <h2>Team</h2>
          <ul>
            <li>Kacper: data and science</li>
            <li>Johny: frontend and demo</li>
            <li>Kuba: models and AI</li>
          </ul>
          <p className="muted small">
            Source code:{' '}
            <a href={REPO} target="_blank" rel="noreferrer">
              github.com/Kaszioq/fire-readiness
            </a>
          </p>
        </section>
      </div>
    </>
  );
}
