// Role B (content agreed with role A). Method, provenance, verification stats, limits, sources, license, team.
// Every number on this page is computed from '@/lib/data'; the prose states only what docs/STATUS.md records.
import Link from 'next/link';
import type { ReactNode } from 'react';
import {
  formatKpa,
  formatPercent,
  HABITAT_SHORT,
  investigationName,
  plural,
  SOLID_CLASSES,
  solidDataLimitation,
} from '@/components/format';
import { flammabilityPoints, getHabitat, habitats, investigations, meta } from '@/lib/data';
import { REPO_URL, repoFile } from '@/components/site';
import { PageBanner } from '@/components/PageBanner';
import { PARTIAL_GRAVITY_WARNING } from '@/lib/predict';

export const metadata = { title: 'About' };

/** A link when the repository URL is configured, plain text otherwise. */
function RepoLink({ href, children }: { href: string | null; children: ReactNode }) {
  return href ? (
    <a href={href} target="_blank" rel="noreferrer">
      {children}
    </a>
  ) : (
    <>{children}</>
  );
}

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
  // How the fields of the investigations became verified: copied from PSI, or checked by a person.
  const fieldStats = { direct: 0, checked: 0, open: 0 };
  const countFields = (node: unknown) => {
    if (Array.isArray(node)) node.forEach(countFields);
    else if (node && typeof node === 'object') {
      const f = node as { prov?: { method?: string; verified?: boolean }; value?: unknown };
      if (f.prov && 'value' in f) {
        if (f.prov.method === 'api_direct') fieldStats.direct += 1;
        else if (f.prov.verified) fieldStats.checked += 1;
        else fieldStats.open += 1;
        return;
      }
      for (const [k, v] of Object.entries(node)) if (k !== 'prov') countFields(v);
    }
  };
  countFields(investigations);
  const pointInvestigations = new Set(flammabilityPoints.map((p) => p.psi_id)).size;
  const scenarios = habitats.filter((h) => h.is_assumption);
  const verifiedShare = meta.n_fields_total > 0 ? meta.n_fields_verified / meta.n_fields_total : null;

  return (
    <>
      <PageBanner
        src="/media/sun-plasma-pia21866.jpg"
        caption="A sheet of plasma leaving the Sun, Solar Dynamics Observatory, 28 July 2017. Decorative: not combustion data."
        creditHref="https://images.nasa.gov/details/PIA21866"
        position="80% 55%"
      />
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
            <span className="stat-value"><span data-count>{investigations.length}</span></span>
            <span className="stat-label">PSI combustion investigations</span>
          </div>
          <div className="stat">
            <span className="stat-value"><span data-count>{flammabilityPoints.length}</span></span>
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
              <RepoLink href={repoFile('data/curated/excluded.json')}>the repository</RepoLink>
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
              evidence coverage (0 to 1) and the test runs behind it, and outside the tested range it answers “no evidence”.
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
            <li>
              <strong>Solid-material data.</strong> {solidDataLimitation(flammabilityPoints)}
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
              <strong>Verification.</strong> {meta.n_fields_verified} of {meta.n_fields_total} extracted fields are
              verified: {fieldStats.direct} were copied or computed directly from the PSI record, and{' '}
              {fieldStats.checked} that were extracted by hand or by a language model were checked against their
              source by a team member.
              {fieldStats.open > 0 && ` ${fieldStats.open} still await review.`} {pointsVerified} of{' '}
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
            <RepoLink href={REPO_URL ? `${REPO_URL}#references` : null}>README</RepoLink>
            . How each table was mapped, with every assumption, is in{' '}
            <RepoLink href={repoFile('data/curated/mappings.md')}>mappings.md</RepoLink>
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
            <RepoLink href={repoFile('LICENSE')}>Apache 2.0 license</RepoLink>
            . Photos and video are NASA material from the NASA Image and Video Library; no NASA insignia is used and no
            endorsement is implied. The illustrations and the site icon are original. The site uses system fonts only.
          </p>
          <h2>Team</h2>
          <ul>
            <li>Kacper: data and science</li>
            <li>Johny: frontend and demo</li>
            <li>Kuba: models and AI</li>
          </ul>
          {REPO_URL && (
            <p className="muted small">
              Source code:{' '}
              <a href={REPO_URL} target="_blank" rel="noreferrer">
                {REPO_URL.replace(/^https:\/\//, '')}
              </a>
            </p>
          )}
        </section>
      </div>
    </>
  );
}
