// Role B, development only. Worst-case fixtures for /dev/break. FAKE VALUES: never shown in production,
// never to be read as NASA data. Each value is something the real pipeline could plausibly produce:
// long curated names, a null or non-finite number from an unfinished model, a PSI ID with no record, zero rows.
import type { Conditions, FlammabilityPoint, Habitat, Prediction, Provenance, RankedInvestigation } from '@/lib/types';

const prov: Provenance = {
  source_type: 'publication',
  source_ref: { url: 'https://example.org/a/very/long/path/that-has-no-spaces-and-cannot-wrap-anywhere-0123456789.pdf (note)' },
  method: 'manual',
  verified: false,
};

export const worstHabitats: Habitat[] = [
  {
    id: 'pressurized_rover',
    name: 'Pressurized lunar rover with suitport airlock, long-duration polar traverse configuration (scenario)',
    o2_mole_fraction: 0.345678,
    pressure_kpa: 56.5370074,
    flow_cm_s: 12.3456789,
    gravity_g: 0.16543210987,
    is_assumption: true,
    prov,
  },
  {
    id: 'spacesuit',
    name: 'EVA',
    o2_mole_fraction: 1,
    pressure_kpa: 29.6,
    flow_cm_s: 0,
    gravity_g: 0,
    is_assumption: false,
    prov: { ...prov, source_ref: { url: 'docs/challenge.md' }, verified: true },
  },
  {
    id: 'earth',
    name: 'Hyperbaric-chamber-reference-atmosphere/ground-test',
    o2_mole_fraction: 0.999,
    pressure_kpa: 1013.25,
    flow_cm_s: null,
    gravity_g: 1,
    is_assumption: true,
    prov,
  },
];

export const worstConditions: Conditions = {
  o2_mole_fraction: worstHabitats[0].o2_mole_fraction,
  pressure_kpa: worstHabitats[0].pressure_kpa,
  flow_cm_s: worstHabitats[0].flow_cm_s,
  material_class: 'thin_solid',
  gravity_g: worstHabitats[0].gravity_g,
};

export const worstPredictions: Prediction[] = [
  {
    mode: 'physics_only',
    zone: 'no_evidence',
    p_sustained: null,
    confidence: 0,
    evidence: [],
    suppression_notes: [],
    explanation:
      'The nearest test run (PSI-25:BASS-II_test_F12_SIBAL_concurrent_flow_sweep_run_0047_repeat_after_relight) is at a normalized distance of 6.42, far outside the tested envelope, so no estimate is given for this material class at these conditions.',
    warnings: [
      'No partial-gravity combustion data in PSI.',
      'No partial-gravity combustion data in PSI.',
      'Ventilation flow is not reported for 128 of the 140 solid-material test runs, so the flow dimension was dropped from the distance and the result does not depend on the flow you entered.',
      'Outcome parsed from free text <b>and not yet verified</b> & may change.',
      'Saffire pressure (101.3 kPa) is an assumption.',
    ],
  },
  {
    mode: 'data',
    zone: 'sustained',
    p_sustained: 1,
    confidence: 0.9999,
    evidence: [{ point_id: 'PSI-99:2-5', psi_id: 'PSI-99', distance: 0, outcome: 'sustained' }],
    suppression_notes: [],
    explanation: '',
    warnings: [],
  },
  {
    mode: 'data',
    zone: 'marginal',
    p_sustained: Number.NaN,
    confidence: Number.NaN,
    evidence: [],
    suppression_notes: [],
    explanation: 'A model bug produced a non-finite number.',
    warnings: [],
  },
];

const longReason =
  'Target oxygen (34.6%) is outside the tested range of 13.6 to 22.2% and target pressure (56.5 kPa) is outside 99.2 to 101.3 kPa; normalized distance to the tested box is 1.31, so coverage decays to 0.27.';

export const worstRanked: RankedInvestigation[] = [
  {
    psi_id: 'PSI-117',
    score: 1.37,
    components: [
      { name: 'condition_coverage', value: 1, weight: 0.35, reason: longReason },
      { name: 'fuel_relevance', value: 0.6, weight: 0.25, reason: '' },
      { name: 'safety_domain', value: Number.NaN, weight: 0.2, reason: 'safety domains not reported' },
    ],
  },
  { psi_id: 'PSI-99999', score: -0.2, components: [] },
  {
    psi_id: 'PSI-25',
    score: Number.NaN,
    components: [{ name: 'tier', value: 1, weight: 0.1, reason: 'tier 1' }],
  },
  { psi_id: 'PSI-62', score: 0, components: [{ name: 'tier', value: 0.3, weight: 0.1, reason: 'tier 3' }] },
];

function point(i: number, o2: number, kpa: number, cls: FlammabilityPoint['material_class']): FlammabilityPoint {
  return {
    id: `PSI-00:${i}`,
    psi_id: 'PSI-00',
    test_id: String(i),
    material: 'fixture',
    material_class: cls,
    o2_mole_fraction: o2,
    pressure_kpa: kpa,
    flow_cm_s: null,
    diluent: null,
    gravity: 'micro',
    outcome: 'sustained',
    spread_rate_mm_s: null,
    prov,
  };
}

/** Points on every edge of the chart, far outside it, and exactly on the focus marker. */
export const worstPoints: FlammabilityPoint[] = [
  point(1, 0.1, 25, 'liquid_droplet'),
  point(2, 0.42, 550, 'liquid_droplet'),
  point(3, 0.95, 20, 'liquid_droplet'),
  point(4, 0.05, 2000, 'gas_jet'),
  point(5, worstHabitats[0].o2_mole_fraction, worstHabitats[0].pressure_kpa, 'liquid_droplet'),
];

export const onePoint: FlammabilityPoint[] = [point(1, 0.21, 101.3, 'thin_fabric')];
