// Role B. Base list. Still to build (docs/SPEC.md module 1): search and filters.
import Link from 'next/link';
import { DOMAIN_LABEL, FUEL_LABEL, investigationName, plural } from '@/components/format';
import { investigations } from '@/lib/data';

export default function InvestigationsPage() {
  return (
    <>
      <header className="page-head">
        <span className="eyebrow">Investigation database</span>
        <h1>Investigations</h1>
        <p className="lead">
          {plural(investigations.length, 'combustion investigation')} from the NASA Physical Science Informatics (PSI)
          repository.
        </p>
      </header>
      {investigations.length === 0 && <div className="placeholder">No investigations in the dataset.</div>}
      <ul className="row-list">
        {investigations.map((inv) => (
          <li key={inv.psi_id}>
            <div className="row-title">
              <Link href={`/investigations/${inv.psi_id}`}>{investigationName(inv)}</Link>
              {inv.acronym && <span className="num muted">{inv.psi_id}</span>}
            </div>
            <div className="row-sub">{inv.title}</div>
            <div className="tags" style={{ marginTop: 8 }}>
              <span className="tag">{inv.project_type}</span>
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
              {inv.data_availability.has_experimental_table && <span className="tag tag-ok">experimental table</span>}
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
