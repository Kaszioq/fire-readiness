// Role B. One habitat preset as a card that opens the Habitat Lens for it.
import Link from 'next/link';
import { formatKpa, formatPercent, formatPsi, SOURCE_LABEL } from '@/components/format';
import type { Habitat } from '@/lib/types';

export function HabitatCard({ habitat }: { habitat: Habitat }) {
  return (
    <Link href={`/lens?habitat=${habitat.id}`} className="card habitat-card">
      <div className="habitat-card-head">
        <h3>{habitat.name}</h3>
        {habitat.is_assumption && <span className="tag tag-accent">scenario</span>}
      </div>
      <div className="habitat-values">
        <div>
          <span className="num">{formatPercent(habitat.o2_mole_fraction)}</span>
          <small>oxygen</small>
        </div>
        <div>
          <span className="num" title={formatPsi(habitat.pressure_kpa)}>
            {formatKpa(habitat.pressure_kpa)}
          </span>
          <small>{formatPsi(habitat.pressure_kpa)}</small>
        </div>
        <div>
          <span className="num">{Number(habitat.gravity_g.toFixed(3))} g</span>
          <small>gravity</small>
        </div>
      </div>
      <div className="card-foot">
        Source: {SOURCE_LABEL[habitat.prov.source_type]}
        {habitat.is_assumption ? ', values are an assumption' : ''}
      </div>
    </Link>
  );
}
