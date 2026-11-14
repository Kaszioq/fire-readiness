// Role B. Base version of the Habitat Lens: habitat preset -> Conditions -> rankInvestigations() + predict().
// Still to build (docs/SPEC.md modules 2, 4, 5): sliders, material selector, evidence table, mini map, report.
import Link from 'next/link';
import { ConditionStats } from '@/components/ConditionStats';
import { HABITAT_SHORT } from '@/components/format';
import { PredictionCard } from '@/components/PredictionCard';
import { RankedList } from '@/components/RankedList';
import { ScrollRow } from '@/components/ScrollRow';
import { flammabilityPoints, getHabitat, getInvestigation, habitats, investigations } from '@/lib/data';
import { predict } from '@/lib/predict';
import { rankInvestigations } from '@/lib/rank';
import type { Conditions } from '@/lib/types';

export default async function LensPage({
  searchParams,
}: {
  searchParams: Promise<{ habitat?: string | string[] }>;
}) {
  const { habitat: raw } = await searchParams;
  // ?habitat=a&habitat=b arrives as an array: take the first value.
  const habitatParam = Array.isArray(raw) ? raw[0] : raw;
  const habitat = getHabitat(habitatParam) ?? getHabitat('moon_base') ?? habitats[0];
  const unknownParam = habitatParam !== undefined && habitatParam !== habitat.id;

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
      <header className="page-head">
        <span className="eyebrow">Habitat Lens</span>
        <h1>{habitat.name}</h1>
        <p className="lead">
          Which investigations matter most for this atmosphere, and what the test data says about a fire in it.
          {habitat.is_assumption && ' The values for this habitat are a scenario, not a sourced specification.'}
        </p>
        {unknownParam && (
          <div className="callout" role="status">
            No habitat preset called “{habitatParam.slice(0, 40)}”. Showing {habitat.name} instead.
          </div>
        )}
        <ScrollRow className="chips" label="Habitat presets" watch={habitat.id}>
          {habitats.map((h) => (
            <Link
              key={h.id}
              href={`/lens?habitat=${h.id}`}
              className="chip"
              aria-current={h.id === habitat.id ? 'true' : undefined}
              scroll={false}
            >
              {HABITAT_SHORT[h.id] ?? h.name}
            </Link>
          ))}
        </ScrollRow>
      </header>

      <ConditionStats conditions={conditions} habitat={habitat} />

      <div className="split section">
        <section className="card-stack" aria-labelledby="predictor-h">
          <h2 id="predictor-h">Fire risk predictor</h2>
          <PredictionCard prediction={prediction} />
        </section>

        <section className="card-stack" aria-labelledby="ranked-h">
          <h2 id="ranked-h">Most relevant investigations</h2>
          <RankedList ranked={ranked} lookup={getInvestigation} />
        </section>
      </div>
    </>
  );
}
