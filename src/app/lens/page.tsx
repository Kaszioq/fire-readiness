// Role B. Skeleton that proves the wiring: habitat preset -> Conditions -> rankInvestigations() + predict().
// Replace with the real Habitat Lens (sliders, score breakdown, predictor panel, report). See docs/SPEC.md modules 2, 4, 5.
import Link from 'next/link';
import { flammabilityPoints, getHabitat, getInvestigation, habitats, investigations } from '@/lib/data';
import { predict } from '@/lib/predict';
import { rankInvestigations } from '@/lib/rank';
import type { Conditions } from '@/lib/types';

export default async function LensPage({ searchParams }: { searchParams: Promise<{ habitat?: string }> }) {
  const { habitat: habitatParam } = await searchParams;
  const habitat = getHabitat(habitatParam) ?? getHabitat('moon_base') ?? habitats[0];

  const conditions: Conditions = {
    o2_mole_fraction: habitat.o2_mole_fraction,
    pressure_kpa: habitat.pressure_kpa,
    flow_cm_s: habitat.flow_cm_s,
    material_class: 'thin_fabric',
    gravity_g: habitat.gravity_g,
  };

  const ranked = rankInvestigations(conditions, investigations);
  const prediction = predict(conditions, flammabilityPoints);

  return (
    <>
      <h1>Habitat Lens: {habitat.name}</h1>
      <p className="muted">
        {(conditions.o2_mole_fraction * 100).toFixed(0)}% O2, {conditions.pressure_kpa} kPa, {conditions.gravity_g} g,
        thin fabric
      </p>

      <h2>Predictor</h2>
      <p>
        Zone: <strong>{prediction.zone}</strong>, confidence {prediction.confidence.toFixed(2)},{' '}
        {prediction.evidence.length} evidence points
      </p>
      <ul>
        {prediction.warnings.map((w) => (
          <li key={w}>{w}</li>
        ))}
      </ul>

      <h2>Ranked investigations</h2>
      <ol className="row-list">
        {ranked.map((r) => (
          <li key={r.psi_id}>
            <Link href={`/investigations/${r.psi_id}`}>{getInvestigation(r.psi_id)?.acronym ?? r.psi_id}</Link>{' '}
            <span className="muted">score {r.score.toFixed(2)}</span>
          </li>
        ))}
      </ol>
    </>
  );
}
