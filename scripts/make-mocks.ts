// Generates data/mock/*.mock.json: fake but plausible values in the real schemas.
// Deterministic (no randomness). Re-run with `npm run mocks` after a contract change.
// Nothing in these files comes from NASA sources. Never show them as real data.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type {
  ExtractionMethod,
  Field,
  FlammabilityPoint,
  FuelPhase,
  GravityLevel,
  Habitat,
  Investigation,
  MaterialClass,
  Meta,
  Outcome,
  ProjectType,
  Provenance,
  Range,
  ReportResponse,
  SafetyDomain,
  Tier,
} from '../src/lib/types';

const OUT = join(process.cwd(), 'data', 'mock');
const MOCK_NOTE = 'MOCK DATA: fake value for development, not from NASA sources';
const MOCK_DATE = '2026-11-14T00:00:00.000Z';
const psiUrl = (id: string) => `https://psi.nasa.gov/physci/repo/data/investigations/${id}`;

function prov(psiId: string, method: ExtractionMethod, verified: boolean, locator = 'mock'): Provenance {
  return {
    source_type: 'psi_api',
    source_ref: { url: psiUrl(psiId), locator },
    ...(method === 'api_direct' ? {} : { quote: 'MOCK quote supporting this value.' }),
    method,
    verified: method === 'api_direct' ? true : verified,
    ...(method !== 'api_direct' && verified ? { verified_by: 'XX', verified_at: MOCK_DATE } : {}),
    note: MOCK_NOTE,
  };
}

function f<T>(
  psiId: string,
  value: T | null,
  opts: { unit?: string; method?: ExtractionMethod; verified?: boolean } = {},
): Field<T> {
  return {
    value,
    ...(opts.unit ? { unit: opts.unit } : {}),
    prov: prov(psiId, opts.method ?? 'llm_extracted', opts.verified ?? false),
  };
}

interface Spec {
  psi_id: string;
  acronym: string;
  title: string;
  project_type: ProjectType;
  platform: string;
  hardware: string[];
  phase: FuelPhase[];
  materials: string[];
  geometry: string;
  size: string;
  o2: Range | null;
  pressure: Range | null;
  flow: Range | null;
  diluents: string[];
  gravity: GravityLevel;
  n_tests: number | null;
  domains: SafetyDomain[];
  tier: Tier;
  uses: string[];
  has_table: boolean;
  verified: boolean; // whether the mock "extracted" fields count as human-verified
}

const SPECS: Spec[] = [
  {
    psi_id: 'PSI-26', acronym: 'BASS', title: '[MOCK] Solid fuel burning and suppression study',
    project_type: 'flight', platform: 'ISS', hardware: ['Mock glovebox', 'Mock flow duct'],
    phase: ['solid'], materials: ['mock acrylic sphere', 'mock cotton-fiberglass fabric'],
    geometry: 'thin flat sample', size: '10 mm x 100 mm',
    o2: { min: 0.15, max: 0.24 }, pressure: { min: 101.3, max: 101.3 }, flow: { min: 1, max: 40 },
    diluents: ['N2'], gravity: 'micro', n_tests: 40, domains: ['prevention', 'suppression'], tier: 1,
    uses: [], has_table: true, verified: true,
  },
  {
    psi_id: 'PSI-25', acronym: 'BASS-II', title: '[MOCK] Solid fuel burning and suppression study II',
    project_type: 'flight', platform: 'ISS', hardware: ['Mock glovebox', 'Mock flow duct'],
    phase: ['solid'], materials: ['mock cotton-fiberglass fabric', 'mock acrylic slab'],
    geometry: 'thin flat sample', size: '20 mm x 100 mm',
    o2: { min: 0.15, max: 0.4 }, pressure: { min: 50, max: 101.3 }, flow: { min: 0, max: 20 },
    diluents: ['N2'], gravity: 'micro', n_tests: 100, domains: ['prevention'], tier: 1,
    uses: [], has_table: true, verified: false,
  },
  {
    psi_id: 'PSI-98', acronym: 'Saffire-I', title: '[MOCK] Large-scale spacecraft fire experiment',
    project_type: 'flight', platform: 'Cygnus (after ISS departure)', hardware: ['Mock flow duct module'],
    phase: ['solid'], materials: ['mock cotton-fiberglass fabric'],
    geometry: 'large thin sheet', size: '400 mm x 940 mm',
    o2: { min: 0.21, max: 0.21 }, pressure: { min: 101.3, max: 101.3 }, flow: { min: 20, max: 25 },
    diluents: ['N2'], gravity: 'micro', n_tests: 2, domains: ['prevention', 'detection'], tier: 1,
    uses: [], has_table: false, verified: false,
  },
  {
    psi_id: 'PSI-69', acronym: 'FLEX', title: '[MOCK] Droplet flame extinguishment experiment',
    project_type: 'flight', platform: 'ISS', hardware: ['Mock combustion rack', 'Mock droplet apparatus'],
    phase: ['liquid'], materials: ['mock n-heptane', 'mock methanol'],
    geometry: 'spherical droplet', size: '2 to 5 mm diameter',
    o2: { min: 0.1, max: 0.4 }, pressure: { min: 50.7, max: 303.9 }, flow: null,
    diluents: ['N2', 'CO2', 'He'], gravity: 'micro', n_tests: 300, domains: ['suppression', 'fundamental'], tier: 1,
    uses: [], has_table: true, verified: true,
  },
  {
    psi_id: 'PSI-102', acronym: 'SAME', title: '[MOCK] Smoke aerosol measurement experiment',
    project_type: 'flight', platform: 'ISS', hardware: ['Mock glovebox', 'Mock aerosol instruments'],
    phase: ['solid'], materials: ['mock wire insulation', 'mock cellulose'],
    geometry: 'heated sample', size: 'not reported',
    o2: null, pressure: null, flow: null,
    diluents: ['N2'], gravity: 'micro', n_tests: null, domains: ['detection'], tier: 1,
    uses: [], has_table: false, verified: false,
  },
  {
    psi_id: 'PSI-159', acronym: 'ACME CFI-G', title: '[MOCK] Gaseous coflow flame study',
    project_type: 'flight', platform: 'ISS', hardware: ['Mock combustion rack', 'Mock gas burner insert'],
    phase: ['gas'], materials: ['mock methane', 'mock ethylene'],
    geometry: 'co-flow burner tube', size: '2 mm nozzle',
    o2: { min: 0.21, max: 0.85 }, pressure: { min: 101.3, max: 101.3 }, flow: { min: 5, max: 30 },
    diluents: ['N2'], gravity: 'micro', n_tests: 60, domains: ['fundamental'], tier: 2,
    uses: [], has_table: true, verified: false,
  },
  {
    psi_id: 'PSI-62', acronym: 'FGM', title: '[MOCK] Ground modelling of concurrent flame spread',
    project_type: 'ground', platform: 'ground', hardware: [],
    phase: ['solid'], materials: ['mock cotton-fiberglass fabric'],
    geometry: 'thin flat sample', size: 'not reported',
    o2: { min: 0.18, max: 0.3 }, pressure: { min: 101.3, max: 101.3 }, flow: { min: 5, max: 20 },
    diluents: ['N2'], gravity: 'mixed', n_tests: null, domains: ['fundamental'], tier: 3,
    uses: ['PSI-25', 'PSI-26'], has_table: false, verified: false,
  },
];

function buildInvestigation(s: Spec): Investigation {
  const id = s.psi_id;
  const api = { method: 'api_direct' as const };
  const ext = { verified: s.verified };
  return {
    psi_id: id,
    acronym: s.acronym,
    title: s.title,
    doi: null,
    psi_url: psiUrl(id),
    project_type: s.project_type,

    hardware: f(id, s.hardware, api),
    platform: f(id, s.platform, ext),
    start_date: f(id, '2012-01-01', api),
    end_date: f(id, '2013-12-31', api),
    managing_center: f(id, 'Mock Research Center', api),
    license: f(id, 'CC0-1.0', api),

    objective_summary: f(id, `MOCK objective of ${s.acronym}: study how ${s.materials[0]} burns and goes out.`, ext),
    approach_summary: f(id, `MOCK approach of ${s.acronym}: ignite samples and vary the atmosphere.`, ext),
    key_findings: [
      f(id, `MOCK finding 1 of ${s.acronym}: flames persisted at lower oxygen than expected.`, ext),
      f(
        id,
        s.diluents.includes('CO2')
          ? `MOCK finding 2 of ${s.acronym}: adding CO2 raised the oxygen level needed to keep burning.`
          : `MOCK finding 2 of ${s.acronym}: flow speed changed the outcome.`,
        { verified: false },
      ),
    ],

    fuel: {
      phase: f(id, s.phase, ext),
      materials: f(id, s.materials, ext),
      geometry: f(id, s.geometry, ext),
      size: f(id, s.size === 'not reported' ? null : s.size, ext),
    },

    conditions: {
      o2_mole_fraction: f(id, s.o2, { ...ext, unit: 'mole fraction' }),
      pressure_kpa: f(id, s.pressure, { ...ext, unit: 'kPa' }),
      flow_cm_s: f(id, s.flow, { ...ext, unit: 'cm/s' }),
      diluents: f(id, s.diluents, ext),
      gravity: f(id, s.gravity, ext),
      n_tests: f(id, s.n_tests, ext),
    },

    variables_varied: f(id, ['oxygen concentration', 'flow speed'], ext),
    variables_constant: f(id, ['pressure'], ext),
    measurements: f(id, ['video', 'radiometer', 'thermocouples'], ext),

    safety_domains: f(id, s.domains, ext),
    tier: f(id, s.tier, ext),
    habitat_relevance_notes:
      s.tier === 1
        ? { moon_base: f(id, `MOCK note: how ${s.acronym} relates to a 30% O2, 70 kPa habitat.`, { verified: false }) }
        : {},

    uses_data_from: f(id, s.uses, ext),

    data_availability: {
      n_files: s.has_table ? 120 : 15,
      total_bytes: s.has_table ? 2_500_000_000 : 40_000_000,
      has_experimental_table: s.has_table,
      formats: s.has_table ? ['csv', 'pdf', 'avi'] : ['pdf'],
      prov: prov(id, 'api_direct', true),
    },

    publications: [{ title: `[MOCK] Publication about ${s.acronym}`, authors: 'Mock A., Mock B.', doi: null }],
  };
}

// ---------- flammability points ----------

const round = (x: number, digits: number) => Number(x.toFixed(digits));

/** Fake rule, only to give the predictor and the charts something with a visible boundary. */
function mockOutcome(o2: number, pressure: number, flow: number | null, limit: number): Outcome {
  const margin = o2 - limit + 0.05 * Math.log10(pressure / 101.3) - (flow !== null && flow < 3 ? 0.02 : 0);
  if (margin > 0.02) return 'sustained';
  if (margin > -0.02) return 'marginal';
  return 'extinguished';
}

function buildPoints(): FlammabilityPoint[] {
  const points: FlammabilityPoint[] = [];
  const add = (
    psi_id: string,
    material: string,
    material_class: MaterialClass,
    o2: number,
    pressure: number,
    flow: number | null,
    limit: number,
    diluent = 'N2',
  ) => {
    const n = points.filter((p) => p.psi_id === psi_id).length + 1;
    const test_id = `MOCK-${String(n).padStart(3, '0')}`;
    const outcome = mockOutcome(o2, pressure, flow, limit);
    points.push({
      id: `${psi_id}:${test_id}`,
      psi_id,
      test_id,
      material,
      material_class,
      o2_mole_fraction: o2,
      pressure_kpa: pressure,
      flow_cm_s: flow,
      diluent,
      gravity: 'micro',
      outcome,
      spread_rate_mm_s: outcome === 'sustained' ? round(1 + 10 * (o2 - 0.15), 2) : null,
      prov: {
        source_type: 'experimental_table',
        source_ref: { url: psiUrl(psi_id), file: `${psi_id}_mock_table.csv`, locator: `row ${n}` },
        quote: 'MOCK row.',
        method: 'manual',
        verified: false,
        note: MOCK_NOTE,
      },
    });
  };

  for (const o2 of [0.15, 0.18, 0.21, 0.24, 0.27, 0.3, 0.34, 0.4]) {
    for (const pressure of [50, 70.3, 101.3]) {
      for (const flow of [0, 5, 20]) {
        add('PSI-25', 'mock cotton-fiberglass fabric', 'thin_fabric', o2, pressure, flow, 0.17);
      }
    }
  }
  for (const flow of [20, 25]) {
    add('PSI-98', 'mock cotton-fiberglass fabric', 'thin_fabric', 0.21, 101.3, flow, 0.17);
  }
  for (const o2 of [0.15, 0.17, 0.19, 0.21, 0.24]) {
    for (const flow of [2, 10, 40]) {
      add('PSI-26', 'mock acrylic sphere', 'thick_solid', o2, 101.3, flow, 0.16);
    }
  }
  for (const o2 of [0.1, 0.14, 0.18, 0.21, 0.3, 0.4]) {
    for (const pressure of [50.7, 101.3, 303.9]) {
      add('PSI-69', 'mock n-heptane', 'liquid_droplet', o2, pressure, null, 0.13, pressure > 200 ? 'CO2' : 'N2');
    }
  }
  // Deliberately fewer than 5 points: exercises the "not enough data for this class" path.
  for (const o2 of [0.21, 0.4, 0.85]) {
    add('PSI-159', 'mock methane', 'gas_jet', o2, 101.3, 10, 0.15);
  }
  return points;
}

// ---------- habitats (values from docs/SPEC.md section 3; provenance is still mock) ----------

function habitat(
  id: Habitat['id'],
  name: string,
  o2: number,
  pressure: number,
  gravity_g: number,
  is_assumption: boolean,
): Habitat {
  return {
    id,
    name,
    o2_mole_fraction: o2,
    pressure_kpa: pressure,
    flow_cm_s: null,
    gravity_g,
    is_assumption,
    prov: {
      source_type: 'challenge_text',
      source_ref: { url: 'docs/SPEC.md', locator: 'section 3, habitat presets' },
      quote: 'MOCK quote.',
      method: 'manual',
      verified: false,
      note: MOCK_NOTE,
    },
  };
}

const HABITATS: Habitat[] = [
  habitat('earth', 'Earth (sea level)', 0.21, 101.3, 1, false),
  habitat('iss', 'ISS', 0.21, 101.3, 0, false),
  habitat('orion', 'Orion (scenario)', 0.21, 101.3, 0, true),
  habitat('moon_base', 'Moon base', 0.3, 70.3, 0.166, false),
  habitat('pressurized_rover', 'Pressurized rover', 0.3, 70.3, 0.166, false),
  habitat('mars_habitat', 'Mars habitat (scenario)', 0.3, 70.3, 0.38, true),
  habitat('spacesuit', 'Spacesuit', 1.0, 29.6, 0.166, false),
];

// ---------- meta ----------

/** Counts every non-api_direct provenance block: these are the fields a human has to verify. */
function countFields(node: unknown, acc = { total: 0, verified: 0 }) {
  if (Array.isArray(node)) {
    node.forEach((n) => countFields(n, acc));
  } else if (node && typeof node === 'object') {
    const p = (node as { prov?: Provenance }).prov;
    if (p && p.method !== 'api_direct') {
      acc.total += 1;
      if (p.verified) acc.verified += 1;
    }
    Object.values(node).forEach((n) => countFields(n, acc));
  }
  return acc;
}

// ---------- write ----------

const investigations = SPECS.map(buildInvestigation);
const points = buildPoints();
const counts = countFields(investigations);

const meta: Meta = {
  fetched_at: MOCK_DATE,
  psi_snapshot_hash: 'MOCK',
  n_investigations: investigations.length,
  n_fields_total: counts.total,
  n_fields_verified: counts.verified,
};

const report: ReportResponse = {
  markdown: [
    '## What the data says',
    'MOCK report. Thin fabric samples kept burning at oxygen levels below the habitat value in these mock tests [PSI-25].',
    '',
    '## How confident we can be',
    'MOCK. The nearest mock tests sit close to the target oxygen level and pressure [PSI-25]. Large samples were tested only at Earth-like conditions [PSI-98].',
    '',
    '## Gaps',
    'MOCK. Partial gravity is not covered by PSI data.',
    '',
    '## What future experiments (e.g. LUCI, FM2) should measure',
    'MOCK. Flame spread on thin fabrics at 30% oxygen and reduced pressure under lunar gravity, with suppression by CO2 dilution as studied for droplets [PSI-69].',
  ].join('\n'),
  citations: ['PSI-25', 'PSI-98', 'PSI-69'],
  stripped_citations: [],
  model: 'mock',
  generated_at: MOCK_DATE,
  cached: true,
};

mkdirSync(OUT, { recursive: true });
const write = (name: string, data: unknown) => {
  writeFileSync(join(OUT, name), JSON.stringify(data, null, 2) + '\n');
  console.log(`wrote data/mock/${name}`);
};
write('investigations.mock.json', investigations);
write('flammability_points.mock.json', points);
write('habitats.mock.json', HABITATS);
write('meta.mock.json', meta);
write('report.mock.json', report);
