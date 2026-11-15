// Role C. Hybrid fire-risk predictor: test data inside the tested envelope, a flame-temperature margin outside it.
// Spec: docs/PHYSICS.md section 7 and docs/SPEC.md modules 4 and 4b. Deterministic, no LLM.
// Every tuned number below is listed with its reason in ./README.md.
import { investigations } from '@/lib/data';
import type {
  Conditions,
  Diluent,
  EvidenceRef,
  FlammabilityPoint,
  FuelModel,
  MaterialClass,
  Outcome,
  PhysicsEstimate,
  Prediction,
  PredictOptions,
  SuppressionNote,
  Zone,
} from '@/lib/types';
import {
  fuelLimitK,
  fuelModelsForClass,
  interpolateTad,
  isSolid,
  ISS_REFERENCE,
  pointFuel,
  pointTad,
  publishedLoi,
} from './physics';

export type { Diluent, PredictOptions } from '@/lib/types';
export { interpolateTad, ISS_REFERENCE } from './physics';

// ---------- Tuned parameters (reasons in README.md) ----------

/** Distance scales: one unit = 100 K of T_ad, 0.15 in log10(pressure), 5 cm/s of flow. */
export const T_AD_SCALE_K = 100;
export const LOG_P_SCALE = 0.15;
export const FLOW_SCALE_CM_S = 5;

export const K_NEIGHBOURS = 8;
export const MAX_EVIDENCE = K_NEIGHBOURS;
export const MIN_POINTS_PER_CLASS = 5;
/** Weight of a neighbour is 1 / (distance + WEIGHT_EPS). */
export const WEIGHT_EPS = 0.1;
/** If the nearest test run is farther than this, there is no data result. */
export const MAX_NEAREST_DISTANCE = 2;
/** Zones on the weighted share of runs that kept burning. */
export const ZONE_EXTINGUISHES_BELOW = 0.25;
export const ZONE_SUSTAINED_ABOVE = 0.6;
/** Two distances closer than this are a tie. */
const TIE_EPS = 1e-9;
/** If the nearest run is a measured limit point ('marginal') closer than this, the zone is marginal. */
export const LIMIT_POINT_DISTANCE = 0.5;
/** How far outside the tested T_ad and pressure range a target may be and still use data, in scale units. */
export const ENVELOPE_MARGIN = 0.5;

// ---------- Fixed texts ----------

export const PARTIAL_GRAVITY_WARNING =
  'No partial-gravity combustion data in PSI. Microgravity and Earth-gravity tests do NOT bound lunar or Martian gravity: NASA FM2 researchers report that the oxygen level needed for flame spread may reach its minimum near lunar gravity, so partial gravity can be more hazardous than both (Ferkul et al., LPSC 2026, NTRS 20260000646).';

export const NORMAL_GRAVITY_WARNING =
  'All test runs used here are microgravity runs. At 1 g, buoyant flow changes flame behaviour, so this is not a normal-gravity prediction.';

export const HELIUM_WARNING =
  'Helium-diluted atmosphere: the flame-temperature estimate is not valid (helium raises heat loss, which adiabatic flame temperature does not capture) and helium test runs are not predictor points. No estimate is given.';

export const CO2_WARNING =
  'CO2-diluted atmosphere: the conditions carry no CO2 fraction and the flame-temperature grid covers O2/N2 only, so no estimate is given. See the FLEX suppression findings.';

export const FIRE_RESISTANT_WARNING =
  'Fire-resistant does not mean safe: no fire-resistant material was tested in the PSI microgravity data above about 22% O2, and in 1 g Nomex HT90-40 failed NASA-STD-6001 Test 1 at 30% O2 and 70.1 kPa (NTRS 20070018178).';

export const SURROGATE_WARNING =
  'Flame temperature for solids uses n-heptane as a surrogate fuel. Material chemistry is not captured: some materials do not burn even where others do.';

/** Every physics note starts with this, so a margin is never mistaken for a test result. */
export const PHYSICS_NOTE_PREFIX = 'Physics estimate, not test data: ';

export const CONFIDENCE_SENTENCE =
  'Confidence is evidence coverage (how many test runs lie close to these conditions), not the probability of a fire.';

/**
 * Evidence coverage of a set of neighbour distances: (1 / k) * sum(exp(-d^2 / 2)) over the k nearest runs.
 * A run at distance 0 counts 1, at 1 counts 0.61, at 2 counts 0.14. Missing neighbours count 0.
 */
export function evidenceCoverage(distances: number[]): number {
  return distances.slice(0, K_NEIGHBOURS).reduce((s, d) => s + Math.exp(-(d * d) / 2), 0) / K_NEIGHBOURS;
}

// ---------- Small helpers ----------

const CLASS_LABEL: Record<MaterialClass, string> = {
  thin_fabric: 'thin fabric',
  thin_solid: 'thin solid',
  thick_solid: 'thick solid',
  liquid_droplet: 'droplet',
  gas_jet: 'gas jet',
  fire_resistant: 'fire-resistant material',
};

const round = (x: number, digits: number) => Number(x.toFixed(digits));
// Text shows temperatures to the nearest 10 K ("about 220 K"); the numeric fields keep the exact values.
const round10 = (x: number) => Math.round(x / 10) * 10;
const kelvin = (x: number) => `about ${round10(x)} K`;
const pct = (x: number) => `${round(x * 100, 1)}%`;
const unique = <T>(xs: T[]) => [...new Set(xs)];

function classLabel(cls: MaterialClass, fuel: FuelModel | null): string {
  return cls === 'liquid_droplet' && fuel ? `${fuel} droplet` : CLASS_LABEL[cls];
}

function range(values: number[], digits: number, unit: string): string {
  const lo = round(Math.min(...values), digits);
  const hi = round(Math.max(...values), digits);
  return lo === hi ? `${lo}${unit}` : `${lo} to ${hi}${unit}`;
}

function temperatureRange(values: number[]): string {
  const lo = round10(Math.min(...values));
  const hi = round10(Math.max(...values));
  return lo === hi ? `about ${lo} K` : `about ${lo} to ${hi} K`;
}

function aboveBelow(delta: number): string {
  const size = round10(Math.abs(delta));
  return size === 0 ? 'at' : `about ${size} K ${delta >= 0 ? 'above' : 'below'}`;
}

/** Short material family: the first word of the material name ("SIBAL", "Nomex", "PMMA", "silicone"). */
function materialFamily(material: string): string {
  return material.trim().split(/[\s,(]+/)[0] ?? material;
}

function countOutcomes(outcomes: Outcome[]): string {
  const labels: [Outcome, string][] = [
    ['sustained', 'sustained'],
    ['marginal', 'marginal'],
    ['extinguished', 'extinguished'],
    ['no_ignition', 'did not ignite'],
  ];
  return labels
    .map(([o, label]) => [outcomes.filter((x) => x === o).length, label] as const)
    .filter(([n]) => n > 0)
    .map(([n, label]) => `${n} ${label}`)
    .join(', ');
}

function zoneFor(p: number): Zone {
  if (p < ZONE_EXTINGUISHES_BELOW) return 'extinguishes';
  if (p > ZONE_SUSTAINED_ABOVE) return 'sustained';
  return 'marginal';
}

// ---------- Suppression notes: curated key_findings only, never generated ----------

const SUPPRESSION_SOURCES: Partial<Record<MaterialClass, string[]>> = {
  liquid_droplet: ['PSI-69', 'PSI-68'],
  thin_fabric: ['PSI-26', 'PSI-25'],
  thin_solid: ['PSI-26', 'PSI-25'],
  thick_solid: ['PSI-26', 'PSI-25'],
};
const SUPPRESSION_PATTERN = /suppress|quench|dilut/i;

export function suppressionNotesFor(cls: MaterialClass): SuppressionNote[] {
  const sources = SUPPRESSION_SOURCES[cls] ?? [];
  return sources.flatMap((psiId) => {
    const inv = investigations.find((i) => i.psi_id === psiId);
    if (!inv) return [];
    return inv.key_findings.flatMap((f) =>
      f.value !== null && SUPPRESSION_PATTERN.test(f.value) ? [{ text: f.value, psi_id: psiId, prov: f.prov }] : [],
    );
  });
}

// ---------- Physics estimate ----------

interface ClassPoint {
  point: FlammabilityPoint;
  tAd: number;
}

function classPointsFor(points: FlammabilityPoint[], cls: MaterialClass, fuel: FuelModel): ClassPoint[] {
  return points.flatMap((point) => {
    if (point.material_class !== cls || pointFuel(point) !== fuel) return [];
    const tAd = pointTad(point, fuel);
    return tAd === null ? [] : [{ point, tAd }];
  });
}

/**
 * Flame-temperature margin of an O2/N2 target atmosphere. Droplets: against the fuel limit calibrated on FLEX.
 * Solids (n-heptane surrogate): against the coldest condition of the class that still burned.
 * Returns null when the target is outside the T_ad grid.
 */
export function physicsEstimate(
  c: Conditions,
  points: FlammabilityPoint[],
  fuel: FuelModel,
): PhysicsEstimate | null {
  const tAd = interpolateTad(fuel, c.o2_mole_fraction, c.pressure_kpa);
  if (tAd === null) return null;
  const surrogate = c.material_class !== 'liquid_droplet';
  const label = classLabel(c.material_class, fuel);

  if (!surrogate) {
    const limit = fuelLimitK(fuel);
    const margin = tAd - limit;
    const tIss = interpolateTad(fuel, ISS_REFERENCE.o2_mole_fraction, ISS_REFERENCE.pressure_kpa);
    const marginIss = tIss === null ? null : tIss - limit;
    // A ratio of margins only means something while the target is clearly above the limit (text says "at" below 5 K).
    const ratio =
      marginIss !== null && marginIss > 0 && round10(margin) > 0 ? round(margin / marginIss, 2) : null;
    return {
      t_ad_k: round(tAd, 1),
      fuel_model: fuel,
      surrogate: false,
      limit_k: round(limit, 1),
      margin_k: round(margin, 1),
      margin_ratio_vs_iss: ratio,
      valid: true,
      note:
        `${PHYSICS_NOTE_PREFIX}for ${fuel} droplets the adiabatic flame temperature (${kelvin(tAd)}) is ${aboveBelow(margin)} ` +
        `the limiting flame temperature (${kelvin(limit)}) calibrated on the FLEX limiting oxygen index` +
        (ratio === null || ratio === 1 ? '.' : `, ${ratio} times the margin in ISS air.`) +
        ' Adiabatic flame temperature is an upper bound on flame temperature and has no gravity, flow or heat-loss term.',
    };
  }

  const cls = classPointsFor(points, c.material_class, fuel);
  const burning = cls.filter((x) => x.point.outcome === 'sustained');
  const hottest = cls.length ? Math.max(...cls.map((x) => x.tAd)) : null;
  const coldestBurning = burning.length ? Math.min(...burning.map((x) => x.tAd)) : null;
  // Same limit for the margin and for the ratio: the coldest tested condition of the class that still burned.
  const margin = coldestBurning === null ? null : tAd - coldestBurning;
  const tIss = interpolateTad(fuel, ISS_REFERENCE.o2_mole_fraction, ISS_REFERENCE.pressure_kpa);
  const marginIss = tIss === null || coldestBurning === null ? null : tIss - coldestBurning;
  const ratio =
    margin !== null && marginIss !== null && marginIss > 0 && round10(margin) > 0
      ? round(margin / marginIss, 2)
      : null;
  return {
    t_ad_k: round(tAd, 1),
    fuel_model: fuel,
    surrogate: true,
    limit_k: coldestBurning === null ? null : round(coldestBurning, 1),
    margin_k: margin === null ? null : round(margin, 1),
    margin_ratio_vs_iss: ratio,
    valid: true,
    note:
      `${PHYSICS_NOTE_PREFIX}with n-heptane as a surrogate fuel the adiabatic flame temperature (${kelvin(tAd)})` +
      (hottest === null || coldestBurning === null
        ? ` has no ${label} test run to compare with.`
        : ` is ${aboveBelow(tAd - hottest)} the hottest ${label} condition tested in the PSI microgravity data ` +
          `(${kelvin(hottest)}) and ${aboveBelow(tAd - coldestBurning)} the coldest tested condition that still burned ` +
          `(${kelvin(coldestBurning)})` +
          (ratio === null || ratio === 1
            ? '.'
            : `, ${ratio} times the margin in ISS air relative to the coldest tested condition that still burned.`) +
          ' That condition is the coldest one tested, not a measured flammability limit.') +
      ' Material chemistry, gravity, flow and heat losses are not in this estimate.',
  };
}

// ---------- Core: one material class, one fuel model ----------

function gravityWarnings(c: Conditions): string[] {
  if (c.gravity_g > 0 && c.gravity_g < 1) return [PARTIAL_GRAVITY_WARNING];
  if (c.gravity_g >= 1) return [NORMAL_GRAVITY_WARNING];
  return [];
}

function noResult(
  c: Conditions,
  mode: 'physics_only' | 'none',
  explanation: string,
  warnings: string[],
  physics: PhysicsEstimate | undefined,
): Prediction {
  return {
    zone: 'no_evidence',
    p_sustained: null,
    confidence: 0,
    evidence: [],
    suppression_notes: suppressionNotesFor(c.material_class),
    explanation: `${explanation} ${CONFIDENCE_SENTENCE}`,
    warnings: unique(warnings),
    mode,
    ...(physics && mode !== 'none' ? { physics } : {}),
  };
}

function predictForFuel(
  c: Conditions,
  points: FlammabilityPoint[],
  fuel: FuelModel | null,
  diluent: Diluent,
): Prediction {
  const warnings = gravityWarnings(c);
  const label = classLabel(c.material_class, fuel);

  if (diluent === 'He') {
    return noResult(c, 'none', 'No estimate: helium-diluted atmosphere.', [...warnings, HELIUM_WARNING], undefined);
  }
  if (diluent === 'CO2') {
    return noResult(c, 'none', 'No estimate: CO2-diluted atmosphere.', [...warnings, CO2_WARNING], undefined);
  }
  if (c.material_class === 'fire_resistant') {
    // Each fire-resistant material has its own oxygen limit, so runs of one say nothing about another.
    const runs = points.filter((p) => p.material_class === 'fire_resistant');
    const burned = runs.filter((p) => p.outcome === 'sustained').length;
    const tested = runs.length
      ? ` The data hold ${runs.length} such test runs (${unique(runs.map((p) => materialFamily(p.material))).join(', ')}), ` +
        `all at no more than ${pct(Math.max(...runs.map((p) => p.o2_mole_fraction)))} O2: ${burned} kept burning and ${runs.length - burned} did not.`
      : '';
    return noResult(
      c,
      'none',
      `No estimate: the flammability limit of a fire-resistant material is material-specific, so test runs of one material do not predict another.${tested}`,
      [...warnings, FIRE_RESISTANT_WARNING],
      undefined,
    );
  }
  if (fuel === null) {
    const n = points.filter((p) => p.material_class === c.material_class).length;
    return noResult(
      c,
      'none',
      `No estimate: ${n} ${label} test runs in the data and no flame-temperature model for this class.`,
      warnings,
      undefined,
    );
  }

  const physics = physicsEstimate(c, points, fuel);
  if (physics === null) {
    return noResult(
      c,
      'none',
      'No estimate: the target is outside the flame-temperature grid (10 to 100% O2, 20 to 320 kPa), and no test run is that far out either.',
      warnings,
      undefined,
    );
  }
  if (physics.surrogate) warnings.push(SURROGATE_WARNING);
  const tTarget = physics.t_ad_k;
  // A physics margin needs a limit to compare with. Solids take theirs from the class test runs.
  const fallbackMode = physics.limit_k === null ? 'none' : 'physics_only';
  const physicsSentence = `Physics estimate, no test data at these conditions: ${physics.note.slice(PHYSICS_NOTE_PREFIX.length)}`;

  const cls = classPointsFor(points, c.material_class, fuel);
  if (cls.length < MIN_POINTS_PER_CLASS) {
    return noResult(
      c,
      fallbackMode,
      `Only ${cls.length} ${label} test runs in the data, fewer than the ${MIN_POINTS_PER_CLASS} needed for a data result.` +
        (fallbackMode === 'physics_only' ? ` ${physicsSentence}` : ''),
      [...warnings, `Not enough ${label} test runs for a data result.`],
      physics,
    );
  }

  // Envelope check on T_ad and pressure, before any neighbour search.
  const tMin = Math.min(...cls.map((x) => x.tAd));
  const tMax = Math.max(...cls.map((x) => x.tAd));
  const pMin = Math.min(...cls.map((x) => x.point.pressure_kpa));
  const pMax = Math.max(...cls.map((x) => x.point.pressure_kpa));
  const tMargin = ENVELOPE_MARGIN * T_AD_SCALE_K;
  const logPMargin = ENVELOPE_MARGIN * LOG_P_SCALE;
  const logP = Math.log10(c.pressure_kpa);
  const outside: string[] = [];
  if (tTarget > tMax + tMargin) {
    outside.push(
      `target flame temperature ${kelvin(tTarget)} is ${aboveBelow(tTarget - tMax)} the hottest tested condition (${kelvin(tMax)})`,
    );
  } else if (tTarget < tMin - tMargin) {
    outside.push(
      `target flame temperature ${kelvin(tTarget)} is ${aboveBelow(tTarget - tMin)} the coldest tested condition (${kelvin(tMin)})`,
    );
  }
  if (logP > Math.log10(pMax) + logPMargin || logP < Math.log10(pMin) - logPMargin) {
    outside.push(`pressure ${round(c.pressure_kpa, 1)} kPa is outside the tested ${range([pMin, pMax], 1, ' kPa')}`);
  }
  // Flow has no margin: both ends of the tested range are extinction mechanisms (quenching at low flow,
  // blowoff at high flow), so a result must not be carried past the lowest or highest tested flow.
  const testedFlows = cls.flatMap((x) => (x.point.flow_cm_s === null ? [] : [x.point.flow_cm_s]));
  if (c.flow_cm_s !== null && testedFlows.length > 0) {
    const fMin = Math.min(...testedFlows);
    const fMax = Math.max(...testedFlows);
    if (c.flow_cm_s < fMin - 1e-9) {
      outside.push(`flow ${round(c.flow_cm_s, 1)} cm/s is below the lowest tested flow (${round(fMin, 1)} cm/s)`);
    } else if (c.flow_cm_s > fMax + 1e-9) {
      outside.push(`flow ${round(c.flow_cm_s, 1)} cm/s is above the highest tested flow (${round(fMax, 1)} cm/s)`);
    }
  }
  if (outside.length > 0) {
    return noResult(
      c,
      'physics_only',
      `No ${label} test run in the PSI microgravity data at these conditions: ${outside.join('; ')}. ${physicsSentence}`,
      warnings,
      physics,
    );
  }

  // Distance-weighted kNN in (T_ad / 100 K, log10 P / 0.15, flow / 5 cm/s).
  const useFlow = c.flow_cm_s !== null;
  const scored = cls
    .map(({ point, tAd }) => {
      const dT = (tAd - tTarget) / T_AD_SCALE_K;
      const dP = (Math.log10(point.pressure_kpa) - logP) / LOG_P_SCALE;
      const flowUsed = useFlow && point.flow_cm_s !== null;
      const dU = flowUsed ? ((point.flow_cm_s as number) - (c.flow_cm_s as number)) / FLOW_SCALE_CM_S : 0;
      return { point, tAd, flowUsed, d: Math.sqrt(dT * dT + dP * dP + dU * dU) };
    })
    .sort((a, b) => a.d - b.d || a.point.id.localeCompare(b.point.id));
  // Only runs within the distance limit are evidence: a run farther away neither votes nor is listed.
  const neighbours = scored.filter((n) => n.d <= MAX_NEAREST_DISTANCE).slice(0, K_NEIGHBOURS);

  if (neighbours.length === 0) {
    const flowNote =
      useFlow && testedFlows.length
        ? ` (tests ran at ${range(testedFlows, 1, ' cm/s')} flow; target ${round(c.flow_cm_s as number, 1)} cm/s)`
        : '';
    return noResult(
      c,
      'physics_only',
      `No ${label} test run close to these conditions: the nearest is at normalized distance ` +
        `${round(scored[0].d, 2)}, beyond the limit of ${MAX_NEAREST_DISTANCE}${flowNote}. ${physicsSentence}`,
      warnings,
      physics,
    );
  }

  const evidenceFlows = neighbours.flatMap((n) => (n.point.flow_cm_s === null ? [] : [n.point.flow_cm_s]));
  const flowText = evidenceFlows.length ? `${range(evidenceFlows, 1, ' cm/s')} flow` : 'flow not reported';
  if (!useFlow) {
    warnings.push(
      'Ventilation flow was not given, so the flow dimension was dropped. ' +
        (evidenceFlows.length
          ? `The evidence runs had ${flowText}, so the result applies to that range only`
          : 'The evidence runs have no reported flow') +
        (isSolid(c.material_class) ? '; for low flow see the quenching findings in the suppression notes.' : '.'),
    );
  }

  const weightOf = (d: number) => 1 / (d + WEIGHT_EPS);
  const burnValue: Record<Outcome, number> = { sustained: 1, marginal: 0.5, extinguished: 0, no_ignition: 0 };
  // Ties at the cut-off: when more runs sit at exactly the distance of the last neighbour than there are places
  // left, which of them fills the places would depend on their ids. Instead all of them vote and share the
  // remaining places equally, so the result does not depend on an arbitrary order. Without such a tie this is
  // the plain weighted vote of the neighbours.
  const cutoff = neighbours[neighbours.length - 1].d;
  const inside = neighbours.filter((n) => n.d < cutoff - TIE_EPS);
  const tied = scored.filter((n) => Math.abs(n.d - cutoff) <= TIE_EPS);
  const placesLeft = neighbours.length - inside.length;
  const voters = [
    ...inside.map((n) => ({ n, w: weightOf(n.d) })),
    ...tied.map((n) => ({ n, w: (weightOf(n.d) * placesLeft) / tied.length })),
  ];
  const totalWeight = voters.reduce((s, v) => s + v.w, 0);
  const pSustained = voters.reduce((s, v) => s + v.w * burnValue[v.n.point.outcome], 0) / totalWeight;
  const tiedExtra = tied.length - placesLeft;
  const confidence = evidenceCoverage(neighbours.map((n) => n.d));
  // A measured limit (a 'marginal' run: FLEX limiting oxygen index, BASS-II extinction velocity) right at the
  // target is the answer itself; runs that burned farther from the limit must not outvote it. A limit point
  // that ties with the nearest run counts as nearest.
  const onLimit =
    neighbours[0].d < LIMIT_POINT_DISTANCE &&
    scored.some((n) => n.d <= neighbours[0].d + TIE_EPS && n.point.outcome === 'marginal');

  const noFlow = neighbours.filter((n) => useFlow && !n.flowUsed).length;
  if (noFlow > 0) {
    warnings.push(`${noFlow} of the ${neighbours.length} nearest test runs have no reported flow; flow was ignored for them.`);
  }
  if (isSolid(c.material_class)) {
    const notBurning = unique(
      neighbours
        .filter((n) => n.point.outcome === 'extinguished' || n.point.outcome === 'no_ignition')
        .map((n) => materialFamily(n.point.material)),
    );
    if (notBurning.length) {
      warnings.push(
        `Material matters beyond flame temperature: ${notBurning.join(', ')} did not sustain burning in nearby test runs.`,
      );
    }
    const evidenceFamilies = unique(neighbours.map((n) => materialFamily(n.point.material)));
    if (evidenceFamilies.length === 1) {
      warnings.push(
        `All evidence runs are ${evidenceFamilies[0]}: no other ${label} material was tested near these conditions, so the result may not hold for other materials of this class.`,
      );
    }
  } else {
    const loi = publishedLoi(fuel);
    warnings.push(
      'Droplet outcomes are positions relative to the published FLEX limiting oxygen index' +
        (loi === null ? '' : ` (${loi} for ${fuel} in O2/N2)`) +
        ', not burn-to-completion: a droplet flame that goes out before the droplet is consumed is normal droplet physics.',
    );
  }
  const unverified = neighbours.filter((n) => !n.point.prov.verified).length;
  if (unverified > 0) {
    warnings.push(`${unverified} of the ${neighbours.length} evidence test runs are not yet verified against the NASA source.`);
  }

  const evidence: EvidenceRef[] = neighbours.map((n) => ({
    point_id: n.point.id,
    psi_id: n.point.psi_id,
    distance: round(n.d, 3),
    outcome: n.point.outcome,
  }));
  const families = unique(neighbours.map((n) => materialFamily(n.point.material)));
  const explanation =
    `${neighbours.length} nearest ${label} test runs (${unique(neighbours.map((n) => n.point.psi_id)).join(', ')}; ` +
    `${families.join(', ')}) at ${range(neighbours.map((n) => n.point.o2_mole_fraction * 100), 1, '% O2')} and ` +
    `${range(neighbours.map((n) => n.point.pressure_kpa), 1, ' kPa')}, ${flowText}, flame temperature ` +
    `${temperatureRange(neighbours.map((n) => n.tAd))} against a target of ${kelvin(tTarget)}` +
    `${physics.surrogate ? ' (n-heptane surrogate)' : ''}: ${countOutcomes(neighbours.map((n) => n.point.outcome))}. ` +
    `Distance-weighted share that kept burning: ${pct(pSustained)}.` +
    (tiedExtra > 0
      ? ` ${tied.length} runs tie at the cut-off distance for ${placesLeft} places; they all vote and share those places equally.`
      : '') +
    (onLimit
      ? ` The nearest run (${neighbours[0].point.id}, at distance ${round(neighbours[0].d, 2)}) is a measured limit point, ` +
        'so the zone is marginal whatever the share.'
      : '') +
    ` ${CONFIDENCE_SENTENCE}`;

  return {
    zone: onLimit ? 'marginal' : zoneFor(pSustained),
    p_sustained: round(pSustained, 3),
    confidence: round(confidence, 3),
    evidence,
    suppression_notes: suppressionNotesFor(c.material_class),
    explanation,
    warnings: unique(warnings),
    mode: 'data',
    physics,
  };
}

// ---------- Public API ----------

/** Droplets: methanol and n-heptane evaluated separately (the fuel is not part of Conditions). */
export function predictDropletByFuel(
  c: Conditions,
  points: FlammabilityPoint[],
  options: PredictOptions = {},
): Record<FuelModel, Prediction> {
  const droplet: Conditions = { ...c, material_class: 'liquid_droplet' };
  const diluent = options.diluent ?? 'N2';
  return {
    methanol: predictForFuel(droplet, points, 'methanol', diluent),
    'n-heptane': predictForFuel(droplet, points, 'n-heptane', diluent),
  };
}

const ZONE_RANK: Record<Zone, number> = { sustained: 3, marginal: 2, extinguishes: 1, no_evidence: 0 };

function fuelSummary(fuel: FuelModel, p: Prediction): string {
  const parts = [`zone ${p.zone}`, `mode ${p.mode}`];
  if (p.p_sustained !== null) parts.push(`${pct(p.p_sustained)} of nearby runs kept burning`);
  if (p.physics?.margin_k != null) parts.push(`physics margin about ${round10(p.physics.margin_k)} K`);
  return `${fuel}: ${parts.join(', ')}`;
}

/**
 * Contract entry point (docs/CONTRACTS.md section 5). `options.diluent` is the diluent of the target atmosphere,
 * default N2. For droplets both FLEX fuels are evaluated; use predictDropletByFuel() to get each one.
 */
export function predict(c: Conditions, points: FlammabilityPoint[], options: PredictOptions = {}): Prediction {
  const diluent = options.diluent ?? 'N2';
  if (c.material_class !== 'liquid_droplet') {
    return predictForFuel(c, points, fuelModelsForClass(c.material_class)[0] ?? null, diluent);
  }
  // Helium and CO2 give the same "no estimate" for either fuel.
  if (diluent !== 'N2') return predictForFuel(c, points, 'methanol', diluent);

  const byFuel = predictDropletByFuel(c, points, options);
  const fuels: FuelModel[] = ['methanol', 'n-heptane'];
  // Headline = the more flammable result: higher zone, then higher share burning, then larger physics margin.
  const key = (f: FuelModel) => {
    const p = byFuel[f];
    return [ZONE_RANK[p.zone], p.p_sustained ?? -1, p.physics?.margin_k ?? -Infinity];
  };
  const head = [...fuels].sort((a, b) => {
    const ka = key(a);
    const kb = key(b);
    for (let i = 0; i < ka.length; i += 1) if (ka[i] !== kb[i]) return kb[i] - ka[i];
    return 0; // stable sort keeps methanol first on a full tie
  })[0];
  const other = head === 'methanol' ? 'n-heptane' : 'methanol';
  const chosen = byFuel[head];
  return {
    ...chosen,
    explanation:
      `The fuel is not part of the conditions, so both FLEX fuels were evaluated and the more flammable result is shown (${head}). ` +
      `${fuelSummary('methanol', byFuel.methanol)}. ${fuelSummary('n-heptane', byFuel['n-heptane'])}. ${chosen.explanation}`,
    warnings: unique([...chosen.warnings, ...byFuel[other].warnings]),
  };
}
