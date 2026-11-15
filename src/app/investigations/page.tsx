// Role B. Investigation database: searchable, filterable list (docs/SPEC.md module 1).
// The page is static; only the fields the list needs are sent to the client component.
import { investigationName } from '@/components/format';
import { InvestigationBrowser, type InvestigationItem } from '@/components/InvestigationBrowser';
import { PageBanner } from '@/components/PageBanner';
import { investigations } from '@/lib/data';

/** PSI spells the same hardware in several ways ("… Glovebox" / "… Glovebox (MSG)"): compare without case and brackets. */
function hardwareKey(name: string): string {
  return name
    .replace(/\([^)]*\)/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export default function InvestigationsPage() {
  // key -> the most complete spelling found in the data, used as the option label
  const hardwareLabels = new Map<string, string>();
  for (const inv of investigations) {
    for (const h of inv.hardware.value ?? []) {
      const key = hardwareKey(h);
      if (!key) continue;
      const known = hardwareLabels.get(key);
      if (!known || h.length > known.length) hardwareLabels.set(key, h);
    }
  }
  const hardwareOptions = [...hardwareLabels]
    .map(([key, label]) => ({ key, label }))
    .sort((a, b) => a.label.localeCompare(b.label));

  const items: InvestigationItem[] = investigations.map((inv) => {
    const hardware = inv.hardware.value ?? [];
    return {
      psi_id: inv.psi_id,
      name: investigationName(inv),
      hasAcronym: Boolean(inv.acronym),
      title: inv.title,
      project_type: inv.project_type,
      tier: inv.tier.value,
      phases: inv.fuel.phase.value ?? [],
      domains: inv.safety_domains.value ?? [],
      hardware: [...new Set(hardware.map(hardwareKey).filter(Boolean))],
      hasTable: inv.data_availability.has_experimental_table,
      searchText: [
        inv.psi_id,
        inv.acronym,
        inv.title,
        inv.platform.value,
        inv.objective_summary.value,
        ...(inv.fuel.materials.value ?? []),
        ...hardware,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase(),
    };
  });

  return (
    <>
      <PageBanner
        src="/media/bass-ii-iss040e088023.jpg"
        caption="Flame over a solid fuel sample in microgravity, BASS-II (PSI-25) on the ISS."
        creditHref="https://images.nasa.gov/details/iss040e088023"
        position="75% 50%"
      />
      <header className="page-head">
        <span className="eyebrow">Investigation database</span>
        <h1>Investigations</h1>
        <p className="lead">
          Combustion investigations from the NASA Physical Science Informatics (PSI) repository. Search or filter, then
          open one to see every field with its source.
        </p>
      </header>
      <InvestigationBrowser items={items} hardwareOptions={hardwareOptions} />
    </>
  );
}
