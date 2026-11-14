// Role B. The target atmosphere as a row of numbers, with the habitat's source underneath.
import { formatKpa, formatPercent, formatPsi, MATERIAL_LABEL, SOURCE_LABEL, sourceHref } from '@/components/format';
import type { Conditions, Habitat } from '@/lib/types';

export function ConditionStats({ conditions, habitat }: { conditions: Conditions; habitat: Habitat }) {
  const href = sourceHref(habitat.prov.source_ref.url);
  return (
    <>
      <div className="stats">
        <div className="stat">
          <span className="stat-value">{formatPercent(conditions.o2_mole_fraction)}</span>
          <span className="stat-label">oxygen (mole fraction)</span>
        </div>
        <div className="stat">
          <span className="stat-value">
            {formatKpa(conditions.pressure_kpa)} <small>{formatPsi(conditions.pressure_kpa)}</small>
          </span>
          <span className="stat-label">pressure</span>
        </div>
        <div className="stat">
          <span className="stat-value">
            {conditions.flow_cm_s === null ? <small>not reported</small> : `${Number(conditions.flow_cm_s.toFixed(1))} cm/s`}
          </span>
          <span className="stat-label">ventilation flow</span>
        </div>
        <div className="stat">
          <span className="stat-value">{Number(conditions.gravity_g.toFixed(3))} g</span>
          <span className="stat-label">gravity</span>
        </div>
        <div className="stat">
          <span className="stat-value stat-value-text">
            {MATERIAL_LABEL[conditions.material_class] ?? conditions.material_class}
          </span>
          <span className="stat-label">material class</span>
        </div>
      </div>
      <p className="card-foot" style={{ marginTop: 8 }}>
        Atmosphere source: {SOURCE_LABEL[habitat.prov.source_type] ?? habitat.prov.source_type}
        {href && (
          <>
            ,{' '}
            <a href={href} target="_blank" rel="noreferrer">
              open source
            </a>
          </>
        )}
        {habitat.prov.verified ? '' : ' (not yet human-verified)'}
      </p>
    </>
  );
}
