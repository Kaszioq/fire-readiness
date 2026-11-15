// Role B. Coverage and gap map, see docs/SPEC.md module 3.
import { investigationName } from '@/components/format';
import { GapMap, type MapInvestigation, type MapPoint } from '@/components/GapMap';
import { PageBanner } from '@/components/PageBanner';
import { flammabilityPoints, getHabitat, habitats, investigations } from '@/lib/data';
import { NORMAL_GRAVITY_WARNING, PARTIAL_GRAVITY_WARNING } from '@/lib/predict';

export const metadata = { title: 'Coverage and gap map' };

export default async function MapPage({
  searchParams,
}: {
  searchParams: Promise<{ habitat?: string | string[]; material?: string | string[] }>;
}) {
  const params = await searchParams;
  const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const habitat = getHabitat(first(params.habitat)) ?? getHabitat('moon_base') ?? habitats[0];

  // Only what the chart needs crosses to the client; provenance stays on the investigation pages.
  const mapInvestigations: MapInvestigation[] = investigations.map((i) => ({
    psi_id: i.psi_id,
    name: investigationName(i),
    phases: i.fuel.phase.value ?? [],
    o2: i.conditions.o2_mole_fraction.value,
    pressure: i.conditions.pressure_kpa.value,
  }));
  const mapPoints: MapPoint[] = flammabilityPoints.map((p) => ({
    id: p.id,
    psi_id: p.psi_id,
    material: p.material,
    material_class: p.material_class,
    o2: p.o2_mole_fraction,
    kpa: p.pressure_kpa,
    flow: p.flow_cm_s,
    outcome: p.outcome,
  }));

  return (
    <>
      <PageBanner
        src="/media/orion-earth-moon-art001e001822.jpg"
        caption="Earth and the Moon either side of Orion's solar array, Artemis I, 28 November 2022."
        creditHref="https://images.nasa.gov/details/art001e001822"
        position="70% 45%"
      />
      <header className="page-head">
        <span className="eyebrow">Coverage and gap map</span>
        <h1>What has been tested, and what has not</h1>
        <p className="lead">
          Oxygen against pressure for the NASA PSI combustion investigations, with the habitat atmospheres on top.
        </p>
      </header>
      <GapMap
        investigations={mapInvestigations}
        points={mapPoints}
        habitats={habitats}
        initialHabitat={habitat.id}
        initialMaterial={first(params.material) ?? ''}
        partialGravityNote={PARTIAL_GRAVITY_WARNING}
        normalGravityNote={NORMAL_GRAVITY_WARNING}
        microgravityRuns={flammabilityPoints.filter((p) => p.gravity === 'micro').length}
      />
    </>
  );
}
