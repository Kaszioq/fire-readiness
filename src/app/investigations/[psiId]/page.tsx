// Role B. Base detail card. Still to build (docs/SPEC.md module 1): every field with its source popover, lineage.
import { notFound } from 'next/navigation';
import { DOMAIN_LABEL, FUEL_LABEL, SOURCE_LABEL, sourceHref } from '@/components/format';
import { getInvestigation, investigations } from '@/lib/data';
import type { Field } from '@/lib/types';

export function generateStaticParams() {
  return investigations.map((inv) => ({ psiId: inv.psi_id }));
}

function TextField({ label, field }: { label: string; field: Field<string> }) {
  const href = sourceHref(field.prov.source_ref.url);
  const sourceLabel = SOURCE_LABEL[field.prov.source_type] ?? field.prov.source_type;
  // An empty string is "not reported" too, not a blank row.
  const value = field.value?.trim() ? field.value : null;
  return (
    <div className="field">
      <dt>{label}</dt>
      <dd>
        {value ?? <span className="not-reported">not reported</span>}
        <div className="field-meta">
          {href ? (
            <a href={href} target="_blank" rel="noreferrer">
              {sourceLabel}
            </a>
          ) : (
            <span className="muted">{sourceLabel}</span>
          )}
          {field.prov.source_ref.locator && <span className="muted">{field.prov.source_ref.locator}</span>}
          {!field.prov.verified && <span className="tag tag-accent">unverified</span>}
        </div>
      </dd>
    </div>
  );
}

export default async function InvestigationPage({ params }: { params: Promise<{ psiId: string }> }) {
  const { psiId } = await params;
  // Links typed by hand often come in lower case ("psi-26").
  const inv = getInvestigation(psiId) ?? getInvestigation(psiId.toUpperCase());
  if (!inv) notFound();

  const href = sourceHref(inv.psi_url);

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
        </div>
      </header>

      <div className="card">
        <dl className="fields">
          <TextField label="Objective" field={inv.objective_summary} />
          <TextField label="Approach" field={inv.approach_summary} />
          <TextField label="Platform" field={inv.platform} />
          <TextField label="Fuel geometry" field={inv.fuel.geometry} />
        </dl>
      </div>

      {href && (
        <div className="btn-row" style={{ marginTop: 20 }}>
          <a href={href} target="_blank" rel="noreferrer" className="btn">
            Open in the NASA PSI repository
          </a>
        </div>
      )}
    </>
  );
}
