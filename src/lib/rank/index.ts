// Role C. Ranks investigations by relevance to a target atmosphere and material class.
// Spec: docs/SPEC.md module 2. Every component carries a readable reason for the UI. Weights and mappings: ./README.md.
import type {
  Conditions,
  Field,
  FuelPhase,
  Investigation,
  MaterialClass,
  Range,
  RankedInvestigation,
  SafetyDomain,
  ScoreComponent,
} from '@/lib/types';

/** Weights from docs/SPEC.md module 2. They sum to 1. Change one only with a written reason in README.md. */
export const WEIGHTS: Record<ScoreComponent['name'], number> = {
  condition_coverage: 0.35,
  fuel_relevance: 0.25,
  safety_domain: 0.2,
  data_availability: 0.1,
  tier: 0.1,
};

/** Distance scales for condition_coverage, from SPEC module 2. */
export const O2_SCALE = 0.1;
export const LOG_P_SCALE = 0.3;
/** Only one of the two ranges (oxygen, pressure) reported: at most half credit. */
export const ONE_AXIS_CREDIT = 0.5;

const TIER_VALUE = { 1: 1.0, 2: 0.6, 3: 0.3 } as const;
/** SPEC values for a solid target: solids 1.0, liquids 0.6, gas jets 0.4. */
const PHASE_VALUE: Record<FuelPhase, number> = { solid: 1.0, liquid: 0.6, gas: 0.4 };
const OFF_PHASE_CAP = 0.6;
const DOMAIN_VALUE: Record<SafetyDomain, number> = { prevention: 1.0, detection: 1.0, suppression: 1.0, fundamental: 0.4 };

const TARGET_PHASE: Record<MaterialClass, FuelPhase> = {
  thin_fabric: 'solid',
  thin_solid: 'solid',
  thick_solid: 'solid',
  fire_resistant: 'solid',
  liquid_droplet: 'liquid',
  gas_jet: 'gas',
};
const TARGET_LABEL: Record<MaterialClass, string> = {
  thin_fabric: 'a thin fabric',
  thin_solid: 'a thin solid',
  thick_solid: 'a thick solid',
  fire_resistant: 'a fire-resistant solid',
  liquid_droplet: 'a liquid fuel',
  gas_jet: 'a gas jet',
};

const num = (x: number, digits = 1) => String(Number(x.toFixed(digits)));
const o2Pct = (x: number) => `${num(x * 100)}%`;

interface Interval {
  lo: number;
  hi: number;
}

/** A reported range as an interval. A range with one bound is that single value; none → null. */
function interval(f: Field<Range>): Interval | null {
  const r = f.value;
  if (!r) return null;
  const lo = r.min ?? r.max;
  const hi = r.max ?? r.min;
  return lo === null || hi === null ? null : { lo: Math.min(lo, hi), hi: Math.max(lo, hi) };
}

/** Distance from v to the interval, 0 inside. */
const outsideBy = (v: number, i: Interval) => (v < i.lo ? i.lo - v : v > i.hi ? v - i.hi : 0);

const o2Range = (i: Interval) => (i.lo === i.hi ? o2Pct(i.lo) : `${num(i.lo * 100)} to ${o2Pct(i.hi)}`);
const pRange = (i: Interval) => (i.lo === i.hi ? `${num(i.lo)} kPa` : `${num(i.lo)} to ${num(i.hi)} kPa`);

function conditionCoverage(target: Conditions, inv: Investigation): { value: number; reason: string } {
  const o2 = interval(inv.conditions.o2_mole_fraction);
  const p = interval(inv.conditions.pressure_kpa);
  if (!o2 && !p) return { value: 0, reason: 'Conditions not reported: no oxygen or pressure range in the record.' };

  const dO2 = o2 ? outsideBy(target.o2_mole_fraction, o2) / O2_SCALE : 0;
  const dP = p ? outsideBy(Math.log10(target.pressure_kpa), { lo: Math.log10(p.lo), hi: Math.log10(p.hi) }) / LOG_P_SCALE : 0;
  const distance = Math.hypot(dO2, dP);
  const decay = 1 / (1 + distance);

  const parts: string[] = [];
  if (o2) {
    parts.push(
      dO2 === 0
        ? `target oxygen ${o2Pct(target.o2_mole_fraction)} is inside the tested ${o2Range(o2)}`
        : `target oxygen ${o2Pct(target.o2_mole_fraction)} is outside the tested ${o2Range(o2)}`,
    );
  }
  if (p) {
    parts.push(
      dP === 0
        ? `target pressure ${num(target.pressure_kpa)} kPa is inside the tested ${pRange(p)}`
        : `target pressure ${num(target.pressure_kpa)} kPa is outside the tested ${pRange(p)}`,
    );
  }
  const where = parts.join(' and ');
  const sentence = where.charAt(0).toUpperCase() + where.slice(1);

  if (o2 && p) {
    if (distance === 0) {
      return { value: 1, reason: `${sentence}. This is the range box, not proof that this exact combination was tested.` };
    }
    return { value: decay, reason: `${sentence}; normalized distance to the tested box ${num(distance, 2)}, so coverage ${num(decay, 2)}.` };
  }
  const missing = o2 ? 'pressure' : 'oxygen';
  const value = ONE_AXIS_CREDIT * decay;
  return {
    value,
    reason: `${sentence}. The ${missing} range is not reported, so at most half credit: coverage ${num(value, 2)}.`,
  };
}

function fuelRelevance(
  target: Conditions,
  inv: Investigation,
  byId: Map<string, Investigation>,
): { value: number; reason: string } {
  const targetPhase = TARGET_PHASE[target.material_class];
  let phases = inv.fuel.phase.value ?? [];
  let via = '';
  if (phases.length === 0) {
    // Ground studies often state no fuel of their own: use the investigations whose data they reuse.
    const sources = (inv.uses_data_from.value ?? []).flatMap((id) => {
      const src = byId.get(id);
      return src ? [src] : [];
    });
    phases = [...new Set(sources.flatMap((s) => s.fuel.phase.value ?? []))];
    if (phases.length) via = ` (taken from ${sources.map((s) => s.psi_id).join(', ')}, whose data it reuses)`;
  }
  if (phases.length === 0) return { value: 0, reason: 'Fuel not reported.' };

  const valueOf = (ph: FuelPhase) => (ph === targetPhase ? 1 : Math.min(PHASE_VALUE[ph], OFF_PHASE_CAP));
  const best = [...phases].sort((a, b) => valueOf(b) - valueOf(a))[0];
  const value = valueOf(best);
  const fuels = phases.join(' and ');
  return {
    value,
    reason:
      best === targetPhase
        ? `Burns ${fuels} fuel${via}, the same phase as the target (${TARGET_LABEL[target.material_class]}).`
        : `Burns ${fuels} fuel${via}; the target is ${TARGET_LABEL[target.material_class]}, so it informs flame physics rather than this material: ${num(value, 2)}.`,
  };
}

function safetyDomain(inv: Investigation): { value: number; reason: string } {
  const domains = inv.safety_domains.value ?? [];
  if (domains.length === 0) return { value: 0, reason: 'Safety domains not reported.' };
  const value = Math.max(...domains.map((d) => DOMAIN_VALUE[d]));
  const applied = domains.filter((d) => d !== 'fundamental');
  return {
    value,
    reason: applied.length
      ? `Addresses fire ${applied.join(', ')} directly.`
      : 'Fundamental combustion science, not a fire-safety function: 0.4.',
  };
}

function dataAvailability(inv: Investigation): { value: number; reason: string } {
  const d = inv.data_availability;
  if (d.has_experimental_table) return { value: 1, reason: 'Has a per-test experimental table in PSI.' };
  if (d.n_files > 0) return { value: 0.5, reason: `No experimental table; ${d.n_files} documents or files in PSI.` };
  return { value: 0, reason: 'No experimental table and no files listed in PSI.' };
}

function tierScore(inv: Investigation): { value: number; reason: string } {
  const tier = inv.tier.value;
  if (tier === null) return { value: 0, reason: 'Tier not assigned.' };
  const text = { 1: 'directly about spacecraft fire safety', 2: 'related combustion research', 3: 'context or modelling' }[tier];
  return { value: TIER_VALUE[tier], reason: `Tier ${tier}: ${text}.` };
}

const idNumber = (psiId: string) => Number(psiId.replace(/\D+/g, ''));

export function rankInvestigations(target: Conditions, investigations: Investigation[]): RankedInvestigation[] {
  const byId = new Map(investigations.map((inv) => [inv.psi_id, inv]));
  return investigations
    .map((inv) => {
      const parts: [ScoreComponent['name'], { value: number; reason: string }][] = [
        ['condition_coverage', conditionCoverage(target, inv)],
        ['fuel_relevance', fuelRelevance(target, inv, byId)],
        ['safety_domain', safetyDomain(inv)],
        ['data_availability', dataAvailability(inv)],
        ['tier', tierScore(inv)],
      ];
      const components: ScoreComponent[] = parts.map(([name, c]) => ({
        name,
        value: Number(c.value.toFixed(3)),
        weight: WEIGHTS[name],
        reason: c.reason,
      }));
      const score = Number(components.reduce((sum, c) => sum + c.value * c.weight, 0).toFixed(4));
      return { psi_id: inv.psi_id, score, components };
    })
    .sort((a, b) => b.score - a.score || idNumber(a.psi_id) - idNumber(b.psi_id));
}
