// Role B. Habitat Lens (docs/SPEC.md modules 2 and 4). The page reads the URL and hands the curated data to the
// client workbench, which runs rankInvestigations() and predict() (role C) on every change.
import { MATERIAL_LABEL } from '@/components/format';
import { LensWorkbench } from '@/components/LensWorkbench';
import { PageBanner } from '@/components/PageBanner';
import { flammabilityPoints, getCachedReport, getHabitat, habitats, investigations } from '@/lib/data';
import type { MaterialClass } from '@/lib/types';

export const metadata = { title: 'Habitat Lens' };

type Param = string | string[] | undefined;

export default async function LensPage({
  searchParams,
}: {
  searchParams: Promise<{ habitat?: Param; material?: Param; o2?: Param; p?: Param; flow?: Param }>;
}) {
  const params = await searchParams;
  // ?habitat=a&habitat=b arrives as an array: take the first value.
  const first = (v: Param) => (Array.isArray(v) ? v[0] : v);
  const num = (v: Param, min: number, max: number) => {
    const n = Number(first(v));
    return first(v) !== undefined && Number.isFinite(n) && n >= min && n <= max ? n : null;
  };

  const habitatParam = first(params.habitat);
  const habitat = getHabitat(habitatParam) ?? getHabitat('moon_base') ?? habitats[0];
  const unknownParam = habitatParam !== undefined && habitatParam !== habitat.id;
  const materialParam = first(params.material);
  const material = (materialParam && materialParam in MATERIAL_LABEL ? materialParam : 'thin_fabric') as MaterialClass;

  return (
    <>
      <PageBanner
        src="/media/orion-moon-earth-art001e002083.jpg"
        caption="Orion, the Moon and a crescent Earth, Artemis I, 5 December 2022."
        creditHref="https://images.nasa.gov/details/art001e002083"
        position="70% 60%"
      />
      {unknownParam && (
        <div className="callout" role="status" style={{ marginBottom: 16 }}>
          No habitat preset called “{habitatParam.slice(0, 40)}”. Showing {habitat.name} instead.
        </div>
      )}
      <LensWorkbench
        // A new habitat in the URL (link from another page) starts the workbench from that preset.
        key={habitat.id}
        habitats={habitats}
        investigations={investigations}
        points={flammabilityPoints}
        cachedReports={Object.fromEntries(habitats.map((h) => [h.id, getCachedReport(h.id)]))}
        initial={{
          habitatId: habitat.id,
          material,
          o2: num(params.o2, 0, 1),
          kpa: num(params.p, 1, 1000),
          flow: num(params.flow, 0, 1000),
        }}
      />
    </>
  );
}
