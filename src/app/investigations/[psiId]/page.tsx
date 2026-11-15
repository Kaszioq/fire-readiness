// Role B. Investigation detail card (docs/SPEC.md modules 1 and 7): every curated field with its source,
// quote and verification state, plus the data lineage. Nothing here is computed beyond counting and formatting.
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import {
  DOMAIN_LABEL,
  formatKpa,
  formatPercent,
  FUEL_LABEL,
  HABITAT_SHORT,
  investigationName,
  plural,
  SOURCE_LABEL,
  sourceHref,
} from '@/components/format';
import { flammabilityPoints, getInvestigation, investigations } from '@/lib/data';
import type { Field, GravityLevel, HabitatId, Outcome, Provenance, Range } from '@/lib/types';

export function generateStaticParams() {
  return investigations.map((inv) => ({ psiId: inv.psi_id }));
}

const METHOD_LABEL: Record<Provenance['method'], string> = {
  api_direct: 'copied or computed directly from the PSI record',
  llm_extracted: 'extracted by a language model',
  manual: 'extracted by hand',
};

const GRAVITY_LABEL: Record<GravityLevel, string> = {
  micro: 'Microgravity',
  normal: 'Normal gravity (1 g)',
  partial_emulated: 'Partial gravity, emulated',
  mixed: 'Mixed',
};

const OUTCOME_TEXT: Record<Outcome, string> = {
  sustained: 'sustained burning',
  marginal: 'marginal',
  extinguished: 'extinguished',
  no_ignition: 'no ignition',
};

/** Where a value comes from: source link, locator, method, quote. Collapsed by default; works without JavaScript. */
function Source({ prov }: { prov: Provenance }) {
  const href = sourceHref(prov.source_ref.url);
  const label = SOURCE_LABEL[prov.source_type] ?? prov.source_type;
  return (
    <details className="source">
      <summary>
        <span className="source-icon" aria-hidden="true">
          i
        </span>
        {label}
        {!prov.verified && <span className="tag tag-accent">unverified</span>}
      </summary>
      <div className="source-body">
        {prov.quote && <blockquote>“{prov.quote}”</blockquote>}
        <ul>
          <li>
            {href ? (
              <a href={href} target="_blank" rel="noreferrer">
                Open the source
              </a>
            ) : (
              'No link recorded'
            )}
            {prov.source_ref.file && <> · file {prov.source_ref.file}</>}
          </li>
          {prov.source_ref.locator && <li>Where: {prov.source_ref.locator}</li>}
          <li>
            How: {METHOD_LABEL[prov.method] ?? prov.method}
            {prov.verified
              ? prov.verified_by
                ? `, verified by ${prov.verified_by}`
                : ', counted as verified'
              : ', not yet human-verified'}
          </li>
          {prov.note && <li>Note: {prov.note}</li>}
        </ul>
      </div>
    </details>
  );
}

const NOT_REPORTED = <span className="not-reported">not reported</span>;

function Row<T>({ label, field, render }: { label: string; field: Field<T>; render: (value: T) => ReactNode | null }) {
  const shown = field.value === null || field.value === undefined ? null : render(field.value);
  return (
    <div className="field">
      <dt>{label}</dt>
      <dd>
        {shown ?? NOT_REPORTED}
        <Source prov={field.prov} />
      </dd>
    </div>
  );
}

// An empty string or an empty list is "not reported" too, not a blank row.
const text = (v: string) => (v.trim() ? v : null);
const list = (v: string[]) => (v.length > 0 ? v.join(', ') : null);
const range =
  (fmt: (n: number) => string) =>
  (r: Range): string | null => {
    if (r.min === null && r.max === null) return null;
    if (r.min === null) return `up to ${fmt(r.max as number)}`;
    if (r.max === null) return `from ${fmt(r.min)}`;
    return r.min === r.max ? fmt(r.min) : `${fmt(r.min)} to ${fmt(r.max)}`;
  };

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return 'not reported';
  const units = ['B', 'kB', 'MB', 'GB', 'TB'];
  const i = Math.min(units.length - 1, Math.floor(Math.log10(bytes) / 3));
  return `${Number((bytes / 1000 ** i).toFixed(1))} ${units[i]}`;
}

export async function generateMetadata({ params }: { params: Promise<{ psiId: string }> }) {
  const { psiId } = await params;
  const inv = getInvestigation(psiId) ?? getInvestigation(psiId.toUpperCase());
  if (!inv) return { title: 'Investigation not found' };
  return { title: inv.acronym ? `${inv.acronym} (${inv.psi_id})` : inv.psi_id };
}

export default async function InvestigationPage({ params }: { params: Promise<{ psiId: string }> }) {
  const { psiId } = await params;
  // Links typed by hand often come in lower case ("psi-26").
  const inv = getInvestigation(psiId) ?? getInvestigation(psiId.toUpperCase());
  if (!inv) notFound();

  const href = sourceHref(inv.psi_url);
  const builtOn = (inv.uses_data_from.value ?? []).map((id) => ({ id, inv: getInvestigation(id) }));
  const reusedBy = investigations.filter((other) => (other.uses_data_from.value ?? []).includes(inv.psi_id));
  const runs = flammabilityPoints.filter((p) => p.psi_id === inv.psi_id);
  const outcomes = (Object.keys(OUTCOME_TEXT) as Outcome[])
    .map((o) => ({ o, n: runs.filter((p) => p.outcome === o).length }))
    .filter((x) => x.n > 0);
  const notes = Object.entries(inv.habitat_relevance_notes) as [HabitatId, Field<string>][];
  const c = inv.conditions;
  const drawable = c.o2_mole_fraction.value !== null && c.pressure_kpa.value !== null;

  return (
    <>
      <header className="page-head">
        <span className="eyebrow">
          {inv.psi_id} · {inv.project_type} investigation
        </span>
        {/* Ground investigations have no acronym in PSI: the title is the heading. */}
        {inv.acronym ? (
          <>
            <h1>{inv.acronym}</h1>
            <p className="lead">{inv.title}</p>
          </>
        ) : (
          <h1 className="h1-long">{inv.title}</h1>
        )}
        <div className="tags">
          {inv.tier.value !== null && <span className="tag">tier {inv.tier.value}</span>}
          {(inv.fuel.phase.value ?? []).map((p) => (
            <span key={p} className="tag">
              {FUEL_LABEL[p] ?? p}
            </span>
          ))}
          {(inv.safety_domains.value ?? []).map((d) => (
            <span key={d} className="tag">
              {DOMAIN_LABEL[d] ?? d}
            </span>
          ))}
          {reusedBy.length > 0 && <span className="tag tag-ok">modelling-ready</span>}
        </div>
        <div className="btn-row">
          {href && (
            <a href={href} target="_blank" rel="noreferrer" className="btn">
              Open in the NASA PSI repository
            </a>
          )}
          {inv.doi && (
            <a href={`https://doi.org/${inv.doi}`} target="_blank" rel="noreferrer" className="btn">
              DOI {inv.doi}
            </a>
          )}
        </div>
      </header>

      <p className="muted small inv-hint">
        Every value below names its source. Open “source” under a value for the quote, the link and how it was extracted.
      </p>

      <div className="inv-grid">
        <section className="card" aria-labelledby="s-overview">
          <h2 id="s-overview">Overview</h2>
          <dl className="fields">
            <Row label="Objective" field={inv.objective_summary} render={text} />
            <Row label="Approach" field={inv.approach_summary} render={text} />
            <Row label="Platform" field={inv.platform} render={text} />
            <Row label="Hardware" field={inv.hardware} render={list} />
            <Row label="Start" field={inv.start_date} render={text} />
            <Row label="End" field={inv.end_date} render={text} />
            <Row label="Managing center" field={inv.managing_center} render={text} />
            <Row label="Data license" field={inv.license} render={text} />
          </dl>
        </section>

        <section className="card" aria-labelledby="s-findings">
          <h2 id="s-findings">Key findings</h2>
          {inv.key_findings.length === 0 ? (
            <p className="not-reported">No findings in the curated data for this investigation.</p>
          ) : (
            <ol className="findings">
              {inv.key_findings.map((f, i) => (
                <li key={i}>
                  {f.value?.trim() ? f.value : NOT_REPORTED}
                  <Source prov={f.prov} />
                </li>
              ))}
            </ol>
          )}
        </section>

        <section className="card" aria-labelledby="s-conditions">
          <h2 id="s-conditions">Tested conditions</h2>
          <dl className="fields">
            <Row label="Oxygen" field={c.o2_mole_fraction} render={range(formatPercent)} />
            <Row label="Pressure" field={c.pressure_kpa} render={range(formatKpa)} />
            <Row label="Flow" field={c.flow_cm_s} render={range((n) => `${n} cm/s`)} />
            <Row label="Diluents" field={c.diluents} render={list} />
            <Row label="Gravity" field={c.gravity} render={(g) => GRAVITY_LABEL[g] ?? g} />
            <Row label="Number of tests" field={c.n_tests} render={(n) => String(n)} />
          </dl>
          {drawable && (
            <p className="small">
              <Link href="/map">See this range on the gap map</Link>
            </p>
          )}
        </section>

        <section className="card" aria-labelledby="s-fuel">
          <h2 id="s-fuel">Fuel and measurements</h2>
          <dl className="fields">
            <Row label="Fuel phase" field={inv.fuel.phase} render={(v) => list(v.map((p) => FUEL_LABEL[p] ?? p))} />
            <Row label="Materials" field={inv.fuel.materials} render={list} />
            <Row label="Geometry" field={inv.fuel.geometry} render={text} />
            <Row label="Size" field={inv.fuel.size} render={text} />
            <Row label="Variables varied" field={inv.variables_varied} render={list} />
            <Row label="Held constant" field={inv.variables_constant} render={list} />
            <Row label="Measurements" field={inv.measurements} render={list} />
          </dl>
        </section>

        {notes.length > 0 && (
          <section className="card" aria-labelledby="s-habitat">
            <h2 id="s-habitat">Relevance to habitats</h2>
            <dl className="fields">
              {notes.map(([id, field]) => (
                <Row key={id} label={HABITAT_SHORT[id] ?? id} field={field} render={text} />
              ))}
            </dl>
          </section>
        )}

        <section className="card" aria-labelledby="s-lineage">
          <h2 id="s-lineage">Data and lineage</h2>
          <dl className="fields">
            <div className="field">
              <dt>Files in PSI</dt>
              <dd>
                {plural(inv.data_availability.n_files, 'file')}, {formatBytes(inv.data_availability.total_bytes)}
                {inv.data_availability.formats.length > 0 && ` (${inv.data_availability.formats.join(', ')})`}.{' '}
                {inv.data_availability.has_experimental_table ? 'Has an experimental table.' : 'No experimental table.'}
                <Source prov={inv.data_availability.prov} />
              </dd>
            </div>
            <div className="field">
              <dt>Test runs in this dataset</dt>
              <dd>
                {runs.length === 0
                  ? 'None: no per-test points were curated for this investigation.'
                  : `${plural(runs.length, 'test run')}: ${outcomes.map((x) => `${x.n} ${OUTCOME_TEXT[x.o]}`).join(', ')}.`}
              </dd>
            </div>
            <div className="field">
              <dt>Built on</dt>
              <dd>
                {builtOn.length === 0 ? (
                  <span className="muted">No reused PSI data recorded.</span>
                ) : (
                  <ul className="lineage">
                    {builtOn.map((b) => (
                      <li key={b.id}>
                        <Link href={`/investigations/${b.id}`}>{investigationName(b.inv, b.id)}</Link>{' '}
                        <span className="muted">{b.id}</span>
                      </li>
                    ))}
                  </ul>
                )}
                <Source prov={inv.uses_data_from.prov} />
              </dd>
            </div>
            <div className="field">
              <dt>Data reused by</dt>
              <dd>
                {reusedBy.length === 0 ? (
                  <span className="muted">No investigation in this dataset records reusing this data.</span>
                ) : (
                  <ul className="lineage">
                    {reusedBy.map((o) => (
                      <li key={o.psi_id}>
                        <Link href={`/investigations/${o.psi_id}`}>{o.acronym || o.title}</Link>{' '}
                        <span className="muted">{o.psi_id}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </dd>
            </div>
          </dl>
        </section>
      </div>

      {inv.publications.length > 0 && (
        <details className="card pubs">
          <summary>
            <h2>{plural(inv.publications.length, 'publication')} listed in PSI</h2>
          </summary>
          <ol>
            {inv.publications.map((p, i) => (
              <li key={i}>
                {p.title}
                {p.authors && <span className="muted"> {p.authors}.</span>}{' '}
                {p.doi && (
                  <a href={`https://doi.org/${p.doi}`} target="_blank" rel="noreferrer">
                    doi:{p.doi}
                  </a>
                )}
              </li>
            ))}
          </ol>
        </details>
      )}
    </>
  );
}
