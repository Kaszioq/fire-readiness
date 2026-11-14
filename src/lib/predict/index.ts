// Role C. STUB: correct signature and shape, placeholder numbers.
// The real algorithm (distance-weighted kNN, zones, confidence) is specified in docs/SPEC.md, module 4.
import type { Conditions, FlammabilityPoint, Prediction } from '@/lib/types';

export const MIN_POINTS_PER_CLASS = 5;
export const MAX_EVIDENCE = 8;

export const PARTIAL_GRAVITY_WARNING =
  'No partial-gravity combustion data in PSI. Result is from microgravity (and normal-gravity where available) tests, which bound but do not replace partial gravity.';

export const STUB_WARNING = 'STUB: placeholder result, the real predictor is not implemented yet.';

export function predict(c: Conditions, points: FlammabilityPoint[]): Prediction {
  const sameClass = points.filter((p) => p.material_class === c.material_class);

  const warnings = [STUB_WARNING];
  if (c.gravity_g > 0 && c.gravity_g < 1) warnings.push(PARTIAL_GRAVITY_WARNING);

  if (sameClass.length < MIN_POINTS_PER_CLASS) {
    return {
      zone: 'no_evidence',
      p_sustained: null,
      confidence: 0,
      evidence: [],
      suppression_notes: [],
      explanation: `Only ${sameClass.length} test runs for this material class, fewer than the ${MIN_POINTS_PER_CLASS} needed.`,
      warnings: [...warnings, 'Not enough test runs for this material class.'],
    };
  }

  const evidence = sameClass.slice(0, MAX_EVIDENCE).map((p, i) => ({
    point_id: p.id,
    psi_id: p.psi_id,
    distance: i * 0.25,
    outcome: p.outcome,
  }));

  return {
    zone: 'marginal',
    p_sustained: 0.5,
    confidence: 0.3,
    evidence,
    suppression_notes: [],
    explanation: `STUB: showing the first ${evidence.length} test runs for this material class, not the nearest ones.`,
    warnings,
  };
}
