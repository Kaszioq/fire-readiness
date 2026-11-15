// Mirrors docs/CONTRACTS.md 1:1. Frozen after the 15:30 sync on Saturday.
// Change only with team agreement, and update docs/CONTRACTS.md in the same commit.
// Units (CONTRACTS section 0): O2 as mole fraction 0..1, pressure in kPa, flow in cm/s, time in s, lengths in mm.

// ---------- 1. Provenance ----------

export type SourceType =
  | 'psi_api' // field taken directly from the PSI JSON record
  | 'experimental_table' // PSI experimental table CSV
  | 'psi_document' // a report / presentation / science document listed in PSI
  | 'publication' // peer-reviewed paper (DOI) or NTRS report
  | 'challenge_text' // the Space Apps challenge statement
  | 'nasa_web'; // nasa.gov pages (Combustion Science, Researcher's Guide)

export type ExtractionMethod = 'api_direct' | 'llm_extracted' | 'manual';

export interface SourceRef {
  url: string; // canonical URL (PSI investigation page, DOI link, file URL)
  file?: string; // file name if the value comes from a file
  locator?: string; // "page 12", "table 3", "row 17", "field: objective"
}

export interface Provenance {
  source_type: SourceType;
  source_ref: SourceRef;
  quote?: string; // verbatim snippet supporting the value (max ~300 chars). Required for llm_extracted and manual.
  method: ExtractionMethod;
  verified: boolean; // api_direct fields are verified=true by definition
  verified_by?: string; // initials of the human verifier
  verified_at?: string; // ISO timestamp
  note?: string; // caveats, e.g. "value read from a plot, approximate"
}

export interface Field<T> {
  value: T | null; // null = not reported in sources; UI shows "not reported"
  unit?: string; // always the internal unit from CONTRACTS section 0
  prov: Provenance;
}

export interface Range {
  min: number | null;
  max: number | null;
}

// ---------- 2. Investigation ----------

export type ProjectType = 'flight' | 'ground';
export type FuelPhase = 'solid' | 'liquid' | 'gas';
export type SafetyDomain = 'prevention' | 'detection' | 'suppression' | 'fundamental';
export type Tier = 1 | 2 | 3; // 1 = directly about spacecraft fire safety, 3 = context / modelling
export type GravityLevel = 'micro' | 'normal' | 'partial_emulated' | 'mixed';
export type HabitatId =
  | 'iss'
  | 'orion'
  | 'moon_base'
  | 'pressurized_rover'
  | 'mars_habitat'
  | 'spacesuit'
  | 'earth'
  | 'exploration_10_2' // NASA-considered exploration atmosphere 10.2 psia / 26.5% O2 (ACME BRE, PSI-20)
  | 'exploration_8_2'; // NASA-considered exploration atmosphere 8.2 psia / 34% O2 (ACME BRE, PSI-20)

export interface Investigation {
  psi_id: string; // "PSI-26": primary key everywhere
  acronym: string; // "BASS"
  title: string;
  doi: string | null;
  psi_url: string; // https://psi.nasa.gov/physci/repo/data/investigations/PSI-26
  project_type: ProjectType;

  hardware: Field<string[]>;
  platform: Field<string>; // "ISS", "Cygnus (after ISS departure)", "ground"
  start_date: Field<string>; // ISO date
  end_date: Field<string>;
  managing_center: Field<string>;
  license: Field<string>; // e.g. "CC0-1.0"

  objective_summary: Field<string>; // 1 to 3 sentences, plain English
  approach_summary: Field<string>;
  key_findings: Field<string>[]; // each finding separately cited

  fuel: {
    phase: Field<FuelPhase[]>;
    materials: Field<string[]>;
    geometry: Field<string>;
    size: Field<string>; // free text with units as reported
  };

  conditions: {
    o2_mole_fraction: Field<Range>;
    pressure_kpa: Field<Range>;
    flow_cm_s: Field<Range>;
    diluents: Field<string[]>; // "N2", "CO2", "He"
    gravity: Field<GravityLevel>;
    n_tests: Field<number>;
  };

  variables_varied: Field<string[]>;
  variables_constant: Field<string[]>;
  measurements: Field<string[]>; // sensors / diagnostics

  safety_domains: Field<SafetyDomain[]>;
  tier: Field<Tier>;
  habitat_relevance_notes: Partial<Record<HabitatId, Field<string>>>;

  uses_data_from: Field<string[]>; // PSI IDs whose data this investigation reused (ground studies)

  data_availability: {
    n_files: number;
    total_bytes: number;
    has_experimental_table: boolean;
    formats: string[]; // ["csv", "pdf", "avi", ...]
    prov: Provenance;
  };

  publications: { title: string; authors: string; doi: string | null }[];
}

// ---------- 3. Flammability points (predictor input) ----------

export type MaterialClass = 'thin_fabric' | 'thin_solid' | 'thick_solid' | 'liquid_droplet' | 'gas_jet' | 'fire_resistant'; // thin_solid = thin films and sheets that are not fabric (e.g. PMMA film); fire_resistant = inherently flame-resistant materials (silicone, Nomex) with their own flammability limit
export type Outcome = 'sustained' | 'marginal' | 'extinguished' | 'no_ignition';

export interface FlammabilityPoint {
  id: string; // `${psi_id}:${test_id}`
  psi_id: string;
  test_id: string; // as named in the source table
  material: string;
  material_class: MaterialClass;
  o2_mole_fraction: number;
  pressure_kpa: number;
  flow_cm_s: number | null; // null = quiescent or not reported
  diluent: string | null;
  gravity: GravityLevel;
  outcome: Outcome;
  spread_rate_mm_s: number | null;
  prov: Provenance;
}

// ---------- 4. Habitats ----------

export interface Habitat {
  id: HabitatId;
  name: string;
  o2_mole_fraction: number;
  pressure_kpa: number;
  flow_cm_s: number | null; // typical ventilation, null if no sourced value
  gravity_g: number; // 0 for orbit, 0.166 Moon, 0.38 Mars, 1 Earth
  is_assumption: boolean; // true when values are a scenario, not a sourced spec
  prov: Provenance;
}

// ---------- 5. Predictor (role C), used by UI (role B) ----------

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
  distance: number; // normalized distance in condition space
  outcome: Outcome;
}

export interface SuppressionNote {
  text: string;
  psi_id: string;
  prov: Provenance;
}

/** Fuel models of the physics layer (docs/PHYSICS.md). Solids use n-heptane as a surrogate. */
export type FuelModel = 'n-heptane' | 'methanol';

/**
 * How a prediction was made (docs/PHYSICS.md section 7).
 * data = nearest test runs; physics_only = outside the tested envelope, flame-temperature margin only;
 * none = neither applies (helium-diluted atmosphere, or no data and no physics).
 */
export type PredictionMode = 'data' | 'physics_only' | 'none';

export interface PhysicsEstimate {
  t_ad_k: number; // adiabatic flame temperature of the target atmosphere (fuel model below)
  fuel_model: FuelModel;
  surrogate: boolean; // true for solids
  limit_k: number | null; // fuel limit (droplets) or coldest tested condition of the class that still burned (solids)
  margin_k: number | null; // t_ad_k - limit_k
  margin_ratio_vs_iss: number | null; // margin_k / margin in ISS air (21% O2, 101.3 kPa), same limit_k; null at or below the limit
  valid: boolean; // false for helium-diluted atmospheres
  note: string;
}

export interface Prediction {
  zone: Zone;
  p_sustained: number | null; // null when zone = no_evidence
  confidence: number; // 0..1, evidence coverage (how close and how many test runs), not a probability
  evidence: EvidenceRef[]; // nearest supporting test runs, max 8
  suppression_notes: SuppressionNote[];
  explanation: string; // short, deterministic text built from evidence (no LLM)
  warnings: string[];
  mode: PredictionMode;
  physics?: PhysicsEstimate; // physics estimate, never test data; absent when mode = none
}

/** Diluent of the target atmosphere. `Conditions` has no diluent, so it is passed as an option. */
export type Diluent = 'N2' | 'CO2' | 'He';

export interface PredictOptions {
  diluent?: Diluent; // default 'N2'. 'He' and 'CO2' give mode 'none' (no estimate).
}

/** Signature of `predict` exported from src/lib/predict. */
export type PredictFn = (c: Conditions, points: FlammabilityPoint[], options?: PredictOptions) => Prediction;

// ---------- 6. Ranking (role C), used by UI (role B) ----------

export interface ScoreComponent {
  name: 'condition_coverage' | 'fuel_relevance' | 'safety_domain' | 'data_availability' | 'tier';
  value: number; // 0..1
  weight: number;
  reason: string; // human-readable, shown in UI tooltip
}

export interface RankedInvestigation {
  psi_id: string;
  score: number; // 0..1
  components: ScoreComponent[];
}

/** Signature of `rankInvestigations` exported from src/lib/rank. */
export type RankFn = (target: Conditions, investigations: Investigation[]) => RankedInvestigation[];

// ---------- 7. Report API (role C), used by UI (role B) ----------

export interface ReportRequest {
  conditions: Conditions;
  habitat_id?: HabitatId;
  language?: 'en';
}

export interface ReportResponse {
  markdown: string; // sections: What we know / How confident / Gaps / What LUCI & FM2 should measure
  citations: string[]; // PSI IDs used, all present in curated data
  stripped_citations: string[]; // invalid citations removed by the validator
  model: string; // for README References only, not shown in UI
  generated_at: string;
  cached: boolean; // true when served from data/cached_reports/
}

// ---------- 8. Smoke simulator (role C), embedded by UI (role B) ----------

export interface SmokeSimResult {
  detector_id: string;
  t_detect_s: number | null;
}

export interface SmokeSimProps {
  onResult?: (r: SmokeSimResult[]) => void;
}

// ---------- 9. Data files ----------

/** data/curated/flame_temperature.json, produced by scripts/compute_flame_temperature.py (docs/PHYSICS.md). */
export interface FlameTemperature {
  generated_at: string;
  method: string;
  units: { t_ad: string; pressure: string; o2: string };
  caveats: string[];
  /** Published FLEX limiting oxygen index converted to T_ad. */
  calibration: {
    fuel: FuelModel;
    atmosphere: string;
    o2: number;
    co2: number;
    quote: string;
    t_ad_k: number;
    source: string;
    pressure_kpa: number;
  }[];
  /** Limiting T_ad per fuel: mean of the calibration rows, with their spread. */
  limiting_t_ad: Record<FuelModel, { t_limit_k: number; spread_k: number; n: number }>;
  habitats: {
    habitat_id: HabitatId;
    o2: number;
    pressure_kpa: number;
    t_ad_methanol_k: number;
    margin_methanol_k: number;
    't_ad_n-heptane_k': number;
    'margin_n-heptane_k': number;
    margin_ratio_vs_iss_methanol: number;
    'margin_ratio_vs_iss_n-heptane': number;
  }[];
  /** Every FLEX test, including CO2 and He suppressant runs that are not predictor points. */
  flex_tests: {
    point_id: string;
    fuel: FuelModel;
    o2: number;
    co2: number;
    he: number;
    pressure_kpa: number;
    t_ad_k: number;
    margin_k: number;
    burn_time_s: string | null;
    test_end: string;
  }[];
  /** T_ad of every flammability point, keyed by FlammabilityPoint.id. */
  points: Record<string, { t_ad_k: number; fuel_model: FuelModel; surrogate: boolean }>;
  /** O2/N2 grid for client-side bilinear interpolation: t_ad_k[fuel][i_o2][i_pressure]. */
  grid: {
    o2: number[];
    pressure_kpa: number[];
    t_ad_k: Record<FuelModel, number[][]>;
    note: string;
  };
}

export interface Meta {
  fetched_at: string;
  psi_snapshot_hash: string;
  n_investigations: number;
  n_fields_total: number;
  n_fields_verified: number;
}
