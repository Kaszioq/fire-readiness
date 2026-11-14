# CONTRACTS.md: shared types and interfaces

This file is the source of truth for everything that crosses role boundaries. `src/lib/types.ts` implements it 1:1. **Frozen after the 15:30 sync on Saturday.** Changes only with team agreement, and this file is updated in the same commit.

## 0. Units (internal representation)

- Oxygen: **mole fraction 0 to 1** (0.21 = 21%). Display as %.
- Pressure: **kPa**. Display kPa with psi and atm in tooltips. 1 atm = 101.325 kPa = 14.696 psi; 1 psi = 6.894757 kPa.
- Flow velocity: **cm/s**.
- Time: seconds. Lengths: mm.
- Convert at the edges (data ingestion and display), never in the middle of logic.

## 1. Provenance (attached to every extracted field)

```ts
export type SourceType =
  | 'psi_api'             // field taken directly from the PSI JSON record
  | 'experimental_table'  // PSI experimental table CSV
  | 'psi_document'        // a report / presentation / science document listed in PSI
  | 'publication'         // peer-reviewed paper (DOI) or NTRS report
  | 'challenge_text'      // the Space Apps challenge statement
  | 'nasa_web';           // nasa.gov pages (Combustion Science, Researcher's Guide)

export type ExtractionMethod = 'api_direct' | 'llm_extracted' | 'manual';

export interface SourceRef {
  url: string;            // canonical URL (PSI investigation page, DOI link, file URL)
  file?: string;          // file name if the value comes from a file
  locator?: string;       // "page 12", "table 3", "row 17", "field: objective"
}

export interface Provenance {
  source_type: SourceType;
  source_ref: SourceRef;
  quote?: string;         // verbatim snippet supporting the value (max ~300 chars). Required for llm_extracted and manual.
  method: ExtractionMethod;
  verified: boolean;      // api_direct fields are verified=true by definition
  verified_by?: string;   // initials of the human verifier
  verified_at?: string;   // ISO timestamp
  note?: string;          // caveats, e.g. "value read from a plot, approximate"
}

export interface Field<T> {
  value: T | null;        // null = not reported in sources; UI shows "not reported"
  unit?: string;          // always the internal unit from section 0
  prov: Provenance;
}

export interface Range {
  min: number | null;
  max: number | null;
}
```

## 2. Investigation

```ts
export type ProjectType = 'flight' | 'ground';
export type FuelPhase = 'solid' | 'liquid' | 'gas';
export type SafetyDomain = 'prevention' | 'detection' | 'suppression' | 'fundamental';
export type Tier = 1 | 2 | 3;   // 1 = directly about spacecraft fire safety, 3 = context / modelling
export type GravityLevel = 'micro' | 'normal' | 'partial_emulated' | 'mixed';
export type HabitatId = 'iss' | 'orion' | 'moon_base' | 'pressurized_rover' | 'mars_habitat' | 'spacesuit' | 'earth';

export interface Investigation {
  psi_id: string;                 // "PSI-26": primary key everywhere
  acronym: string;                // "BASS"
  title: string;
  doi: string | null;
  psi_url: string;                // https://psi.nasa.gov/physci/repo/data/investigations/PSI-26
  project_type: ProjectType;

  hardware: Field<string[]>;      // e.g. ["Microgravity Science Glovebox", "SPICE flow duct"]
  platform: Field<string>;        // "ISS", "Cygnus (after ISS departure)", "ground"
  start_date: Field<string>;      // ISO date
  end_date: Field<string>;
  managing_center: Field<string>;
  license: Field<string>;         // e.g. "CC0-1.0"

  objective_summary: Field<string>;    // 1 to 3 sentences, plain English
  approach_summary: Field<string>;
  key_findings: Field<string>[];       // each finding separately cited

  fuel: {
    phase: Field<FuelPhase[]>;
    materials: Field<string[]>;        // "cotton-fiberglass fabric (75/25)", "n-heptane", "ethylene"
    geometry: Field<string>;           // "thin flat sample", "spherical droplet", "co-flow burner tube"
    size: Field<string>;               // free text with units as reported
  };

  conditions: {
    o2_mole_fraction: Field<Range>;
    pressure_kpa: Field<Range>;
    flow_cm_s: Field<Range>;
    diluents: Field<string[]>;         // "N2", "CO2", "He"
    gravity: Field<GravityLevel>;
    n_tests: Field<number>;
  };

  variables_varied: Field<string[]>;
  variables_constant: Field<string[]>;
  measurements: Field<string[]>;       // sensors / diagnostics

  safety_domains: Field<SafetyDomain[]>;
  tier: Field<Tier>;
  habitat_relevance_notes: Partial<Record<HabitatId, Field<string>>>;

  uses_data_from: Field<string[]>;     // PSI IDs whose data this investigation reused (ground studies)

  data_availability: {
    n_files: number;
    total_bytes: number;
    has_experimental_table: boolean;
    formats: string[];                 // ["csv", "pdf", "avi", ...]
    prov: Provenance;
  };

  publications: { title: string; authors: string; doi: string | null }[];
}
```

## 3. Flammability points (predictor input)

One row = one test run from an experimental table or a value reported in a document.

```ts
export type MaterialClass = 'thin_fabric' | 'thick_solid' | 'liquid_droplet' | 'gas_jet';
export type Outcome = 'sustained' | 'marginal' | 'extinguished' | 'no_ignition';

export interface FlammabilityPoint {
  id: string;                    // `${psi_id}:${test_id}`
  psi_id: string;
  test_id: string;               // as named in the source table
  material: string;
  material_class: MaterialClass;
  o2_mole_fraction: number;
  pressure_kpa: number;
  flow_cm_s: number | null;      // null = quiescent or not reported
  diluent: string | null;
  gravity: GravityLevel;
  outcome: Outcome;
  spread_rate_mm_s: number | null;
  prov: Provenance;
}
```

## 4. Habitats

```ts
export interface Habitat {
  id: HabitatId;
  name: string;
  o2_mole_fraction: number;
  pressure_kpa: number;
  flow_cm_s: number | null;      // typical ventilation, null if no sourced value
  gravity_g: number;             // 0 for orbit, 0.166 Moon, 0.38 Mars, 1 Earth
  is_assumption: boolean;        // true when values are a scenario, not a sourced spec
  prov: Provenance;
}
```
Values and sources for each habitat are listed in `docs/SPEC.md` section "Habitat presets".

## 5. Predictor (role C), used by UI (role B)

```ts
export interface Conditions {
  o2_mole_fraction: number;
  pressure_kpa: number;
  flow_cm_s: number | null;
  material_class: MaterialClass;
  gravity_g: number;
}

export type Zone = 'extinguishes' | 'marginal' | 'sustained' | 'no_evidence';

export interface EvidenceRef {
  point_id: string;
  psi_id: string;
  distance: number;              // normalized distance in condition space
  outcome: Outcome;
}

export interface SuppressionNote {
  text: string;                  // e.g. "In FLEX, CO2 dilution extinguished ... at ..."
  psi_id: string;
  prov: Provenance;
}

export interface Prediction {
  zone: Zone;
  p_sustained: number | null;    // null when zone = no_evidence
  confidence: number;            // 0..1
  evidence: EvidenceRef[];       // nearest supporting test runs, max 8
  suppression_notes: SuppressionNote[];
  explanation: string;           // short, deterministic text built from evidence (no LLM)
  warnings: string[];            // e.g. "partial gravity: no direct data, result bounded by 0g and 1g tests"
}

export function predict(c: Conditions, points: FlammabilityPoint[]): Prediction;
```

## 6. Ranking (role C), used by UI (role B)

```ts
export interface ScoreComponent {
  name: 'condition_coverage' | 'fuel_relevance' | 'safety_domain' | 'data_availability' | 'tier';
  value: number;                 // 0..1
  weight: number;
  reason: string;                // human-readable, shown in UI tooltip
}

export interface RankedInvestigation {
  psi_id: string;
  score: number;                 // 0..1
  components: ScoreComponent[];
}

export function rankInvestigations(
  target: Conditions,
  investigations: Investigation[]
): RankedInvestigation[];
```

## 7. Report API (role C), used by UI (role B)

`POST /api/report`

```ts
// request
{ conditions: Conditions; habitat_id?: HabitatId; language?: 'en' }

// response 200
{
  markdown: string;              // sections: What we know / How confident / Gaps / What LUCI & FM2 should measure
  citations: string[];           // PSI IDs used, all present in curated data
  stripped_citations: string[];  // invalid citations removed by the validator
  model: string;                 // for README References only, not shown in UI
  generated_at: string;
  cached: boolean;               // true when served from data/cached_reports/
}
```
On provider error or timeout (>25 s), the route returns the cached report for the nearest habitat preset with `cached: true`. The UI always shows something.

## 8. Smoke simulator (role C), embedded by UI (role B)

```tsx
<SmokeSim onResult?={(r: { detector_id: string; t_detect_s: number | null }[]) => void} />
```
Self-contained component. B only places it on a page. All state lives inside it.

## 9. Data files (role A delivers, everyone reads)

| File | Type |
|---|---|
| `data/curated/investigations.json` | `Investigation[]` |
| `data/curated/flammability_points.json` | `FlammabilityPoint[]` |
| `data/curated/habitats.json` | `Habitat[]` |
| `data/curated/meta.json` | `{ fetched_at, psi_snapshot_hash, n_investigations, n_fields_total, n_fields_verified }` |
| `data/cached_reports/<habitat_id>.json` | report API response objects |
| `data/mock/*.mock.json` | same schemas, fake but plausible values, used only before real data lands |
