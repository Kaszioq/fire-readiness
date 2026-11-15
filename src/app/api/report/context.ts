// Role C. Builds the only text the LLM sees: curated data for the top-ranked investigations, the deterministic
// predictor output for the target atmosphere, and a few data facts. Trimmed for a small tokens-per-minute budget:
// summaries, conditions and findings, no provenance quotes.
import { flammabilityPoints, getHabitat, getInvestigation, habitats, investigations } from '@/lib/data';
import { PARTIAL_GRAVITY_WARNING, PHYSICS_NOTE_PREFIX, predict, predictDropletByFuel } from '@/lib/predict';
import { rankInvestigations } from '@/lib/rank';
import type {
  Conditions,
  Field,
  FlammabilityPoint,
  HabitatId,
  Investigation,
  MaterialClass,
  Prediction,
  Range,
} from '@/lib/types';

export const TOP_N = 10;
const MAX_OBJECTIVE_CHARS = 240;
const MAX_FINDING_CHARS = 280;
const MAX_FINDINGS = 6;

/** Facts from NASA reports that are not PSI investigations. Sources: docs/STATUS.md points 10 and 12. */
export const EXTERNAL_SOURCES = ['NTRS 20070018178', 'NTRS 20260000646'] as const;

export interface ReportContext {
  text: string;
  /** PSI IDs the report may cite: the investigations listed in `text`. */
  allowedIds: string[];
  habitatId: HabitatId | null;
  /** True when droplet test runs exist near the target: the report must not call droplets a gap. */
  dropletsCovered: boolean;
  /** Number of fire-resistant test runs per material family, e.g. { Nomex: 4, silicone: 4 }. */
  fireResistantRuns: Record<string, number>;
}

const CLASS_TEXT: Record<MaterialClass, string> = {
  thin_fabric: 'thin fabric',
  thin_solid: 'thin solid (films, sheets)',
  thick_solid: 'thick solid',
  liquid_droplet: 'liquid fuel droplets (methanol, n-heptane)',
  gas_jet: 'gas jet',
  fire_resistant: 'fire-resistant materials (silicone, Nomex)',
};
const ORDINARY_SOLIDS: MaterialClass[] = ['thin_fabric', 'thin_solid', 'thick_solid'];
const REPORT_CLASSES: MaterialClass[] = [...ORDINARY_SOLIDS, 'liquid_droplet', 'fire_resistant'];

const pct = (x: number) => `${Number((x * 100).toFixed(1))}%`;
const clip = (s: string, max: number) => (s.length <= max ? s : `${s.slice(0, max - 1).trimEnd()}…`);

function rangeText(f: Field<Range>, format: (x: number) => string, unit: string): string | null {
  const r = f.value;
  if (!r || (r.min === null && r.max === null)) return null;
  if (r.min !== null && r.max !== null) {
    return r.min === r.max ? `${format(r.min)}${unit}` : `${format(r.min)} to ${format(r.max)}${unit}`;
  }
  return r.max !== null ? `up to ${format(r.max)}${unit}` : `from ${format(r.min as number)}${unit}`;
}

/** Nearest habitat preset in (O2 / 0.05, log10 P / 0.15): used for the cached fallback when no habitat is given. */
export function nearestHabitatId(c: Conditions): HabitatId {
  let best = habitats[0];
  let bestD = Infinity;
  for (const h of habitats) {
    const d = Math.hypot(
      (h.o2_mole_fraction - c.o2_mole_fraction) / 0.05,
      (Math.log10(h.pressure_kpa) - Math.log10(c.pressure_kpa)) / 0.15,
    );
    if (d < bestD) {
      best = h;
      bestD = d;
    }
  }
  return best.id;
}

function predictionLine(cls: MaterialClass, p: Prediction, asked: boolean): string {
  const head = `- ${CLASS_TEXT[cls]}${asked ? ' (the material class asked about)' : ''}: `;
  const physics = p.physics ? ` ${p.physics.note}` : '';
  if (p.mode === 'none') return `${head}no estimate. ${p.explanation}`;
  if (p.mode === 'physics_only') {
    return `${head}NO TEST DATA at these conditions (zone no_evidence). ${p.explanation}`;
  }
  return (
    `${head}TEST RUNS EXIST near these conditions. Data result "${p.zone}", evidence coverage ${p.confidence} on a 0 to 1 scale. ` +
    `${p.explanation}${physics.replace(PHYSICS_NOTE_PREFIX, 'Physics estimate, not test data: ')}`
  );
}

function dataFacts(points: FlammabilityPoint[]): string[] {
  const solids = points.filter((p) => ORDINARY_SOLIDS.includes(p.material_class));
  const count = (o: FlammabilityPoint['outcome']) => solids.filter((p) => p.outcome === o).length;
  const solidIds = [...new Set(solids.map((p) => p.psi_id))].join(', ');
  const o2 = solids.map((p) => p.o2_mole_fraction);
  const pressures = solids.map((p) => p.pressure_kpa);
  const resistant = points.filter((p) => p.material_class === 'fire_resistant');
  const resistantIds = [...new Set(resistant.map((p) => p.psi_id))].join(', ');
  const resistantBurned = resistant.filter((p) => p.outcome === 'sustained').length;

  const others = [
    [count('marginal'), 'measured extinction-velocity limit point'],
    [count('extinguished'), 'extinguished run'],
    [count('no_ignition'), 'no-ignition run'],
  ]
    .filter(([n]) => (n as number) > 0)
    .map(([n, label]) => `${n} ${label}${n === 1 ? '' : 's'}`)
    .join(', ');
  const pLo = Math.min(...pressures);
  const pHi = Math.max(...pressures);
  const facts = [
    `Limitation of the solid data: ${count('sustained')} of the ${solids.length} ordinary solid test runs (${solidIds}) are "sustained"` +
      (others ? `; the others are ${others}. ` : '. ') +
      `With so few non-burning runs the data cannot locate a flammability limit for solids. All solid runs are at ${pct(Math.min(...o2))} to ${pct(Math.max(...o2))} O2 ` +
      `and ${pLo === pHi ? `about ${pLo}` : `${pLo} to ${pHi}`} kPa, in microgravity.`,
  ];
  if (resistant.length) {
    // Outcomes per material, so a count is never turned into "none of them burned".
    const families = [...new Set(resistant.map((p) => p.material.trim().split(/[\s,(]+/)[0]))];
    const breakdown = families
      .map((family) => {
        const runs = resistant.filter((p) => p.material.trim().startsWith(family));
        const burned = runs.filter((p) => p.outcome === 'sustained').length;
        const ids = [...new Set(runs.map((p) => p.psi_id))].join(', ');
        return `${burned} of the ${runs.length} ${family} runs kept burning and ${runs.length - burned} did not (${ids})`;
      })
      .join('; ');
    const notBurnedBy = families
      .map((family) => {
        const n = resistant.filter((p) => p.material.trim().startsWith(family) && p.outcome !== 'sustained').length;
        return n > 0 ? `${n} ${family}` : null;
      })
      .filter((x): x is string => x !== null)
      .join(', ');
    facts.push(
      `Fire-resistant does NOT mean it cannot burn, and these materials are NOT "safe": ${breakdown}. In total ${resistantBurned} of the ${resistant.length} fire-resistant runs (${resistantIds}) kept burning ` +
        `and ${resistant.length - resistantBurned} did not (${notBurnedBy}), all at no more than ${pct(Math.max(...resistant.map((p) => p.o2_mole_fraction)))} O2. ` +
        'Copy these counts exactly; do not merge the materials. Each such material has its own oxygen limit, ' +
        'so the predictor gives no estimate for them. Outside PSI: Nomex HT90-40 failed NASA-STD-6001 Test 1 at 30% O2 and 70.1 kPa in 1 g; ' +
        'cite that fact as (NTRS 20070018178).',
    );
  }
  facts.push(`Partial gravity: ${PARTIAL_GRAVITY_WARNING} Cite this as (NTRS 20260000646).`);
  return facts;
}

function investigationBlock(inv: Investigation, score: number | null): string {
  const name = inv.acronym ? `${inv.acronym}: ${inv.title}` : inv.title;
  const phases = inv.fuel.phase.value?.join(', ') ?? 'not reported';
  const materials = inv.fuel.materials.value?.slice(0, 5).join('; ') ?? 'not reported';
  const tested = [
    rangeText(inv.conditions.o2_mole_fraction, (x) => `${Number((x * 100).toFixed(1))}`, '% O2'),
    rangeText(inv.conditions.pressure_kpa, (x) => `${Number(x.toFixed(1))}`, ' kPa'),
    rangeText(inv.conditions.flow_cm_s, (x) => `${Number(x.toFixed(1))}`, ' cm/s flow'),
  ].filter((x): x is string => x !== null);
  const findings = inv.key_findings
    .flatMap((f) => (f.value ? [clip(f.value, MAX_FINDING_CHARS)] : []))
    .slice(0, MAX_FINDINGS);
  const lines = [
    `[${inv.psi_id}] ${name}. ${inv.project_type}, tier ${inv.tier.value ?? 'not assigned'}` +
      (score === null ? '' : `, relevance ${score.toFixed(2)}`) +
      `; safety domains: ${inv.safety_domains.value?.join(', ') ?? 'not reported'}.`,
    `  Fuel: ${phases} (${materials}). Tested conditions: ${tested.length ? tested.join(', ') : 'not reported'}.`,
  ];
  if (inv.uses_data_from.value?.length) lines.push(`  Ground study that reuses data from ${inv.uses_data_from.value.join(', ')}.`);
  if (inv.objective_summary.value) lines.push(`  Objective: ${clip(inv.objective_summary.value, MAX_OBJECTIVE_CHARS)}`);
  lines.push(findings.length ? `  Findings: ${findings.map((f) => `(${findings.indexOf(f) + 1}) ${f}`).join(' ')}` : '  Findings: none recorded.');
  return lines.join('\n');
}

export function buildReportContext(conditions: Conditions, habitatId?: HabitatId): ReportContext {
  const habitat = getHabitat(habitatId);
  const points = flammabilityPoints;

  // Predictor for every material class of interest, so the report covers the atmosphere, not one material.
  const predictions = REPORT_CLASSES.map((cls) => {
    const c = { ...conditions, material_class: cls };
    return { cls, prediction: predict(c, points) };
  });
  const droplets = predictDropletByFuel(conditions, points);

  // Investigations: top N by relevance, plus any investigation whose runs are evidence for a prediction.
  const ranked = rankInvestigations(conditions, investigations);
  const scoreOf = new Map(ranked.map((r) => [r.psi_id, r.score]));
  const ids = ranked.slice(0, TOP_N).map((r) => r.psi_id);
  const evidenceIds = [
    ...predictions.flatMap((x) => x.prediction.evidence.map((e) => e.psi_id)),
    ...Object.values(droplets).flatMap((p) => p.evidence.map((e) => e.psi_id)),
    ...points.filter((p) => p.material_class !== 'liquid_droplet').map((p) => p.psi_id),
  ];
  for (const id of evidenceIds) if (!ids.includes(id)) ids.push(id);
  const listed = ids.flatMap((id) => {
    const inv = getInvestigation(id);
    return inv ? [inv] : [];
  });

  const flow = conditions.flow_cm_s === null ? 'ventilation flow not given' : `${conditions.flow_cm_s} cm/s ventilation flow`;
  const target =
    `${habitat ? `${habitat.name}${habitat.is_assumption ? ' (a scenario, not a sourced specification)' : ''}: ` : ''}` +
    `${pct(conditions.o2_mole_fraction)} O2, ${Number(conditions.pressure_kpa.toFixed(1))} kPa, ${flow}, gravity ${conditions.gravity_g} g.`;

  const text = [
    'TARGET ATMOSPHERE',
    target,
    `Material class asked about: ${CLASS_TEXT[conditions.material_class]}.`,
    '',
    'PREDICTOR OUTPUT (deterministic; built only from PSI test runs and a flame-temperature model calibrated on FLEX)',
    ...predictions.map((x) => predictionLine(x.cls, x.prediction, x.cls === conditions.material_class)),
    `  Droplets by fuel: methanol ${droplets.methanol.zone} (${droplets.methanol.mode}); n-heptane ${droplets['n-heptane'].zone} (${droplets['n-heptane'].mode}).`,
    '',
    'DATA FACTS (state them where relevant)',
    ...dataFacts(points).map((f, i) => `${i + 1}. ${f}`),
    '',
    `INVESTIGATIONS (the ${listed.length} most relevant PSI investigations; these are the ONLY IDs you may cite)`,
    ...listed.map((inv) => investigationBlock(inv, scoreOf.get(inv.psi_id) ?? null)),
  ].join('\n');

  return {
    text,
    allowedIds: listed.map((inv) => inv.psi_id),
    habitatId: habitat?.id ?? null,
    dropletsCovered: Object.values(droplets).some((p) => p.mode === 'data'),
    fireResistantRuns: points
      .filter((p) => p.material_class === 'fire_resistant')
      .reduce<Record<string, number>>((acc, p) => {
        const family = p.material.trim().split(/[\s,(]+/)[0];
        acc[family] = (acc[family] ?? 0) + 1;
        return acc;
      }, {}),
  };
}
