// Role C. STUB: correct signature and shape, placeholder scores.
// Real component definitions and weights are specified in docs/SPEC.md, module 2.
import type { Conditions, Investigation, RankedInvestigation, ScoreComponent } from '@/lib/types';

/** Initial weights from docs/SPEC.md. Tune only with a stated reason. */
export const WEIGHTS: Record<ScoreComponent['name'], number> = {
  condition_coverage: 0.35,
  fuel_relevance: 0.25,
  safety_domain: 0.2,
  data_availability: 0.1,
  tier: 0.1,
};

const TIER_VALUE = { 1: 1.0, 2: 0.6, 3: 0.3 } as const;

export function rankInvestigations(target: Conditions, investigations: Investigation[]): RankedInvestigation[] {
  return investigations
    .map((inv) => {
      const tier = inv.tier.value;
      const components: ScoreComponent[] = [
        { name: 'condition_coverage', value: 0.5, weight: WEIGHTS.condition_coverage, reason: 'STUB: not computed yet' },
        { name: 'fuel_relevance', value: 0.5, weight: WEIGHTS.fuel_relevance, reason: 'STUB: not computed yet' },
        { name: 'safety_domain', value: 0.5, weight: WEIGHTS.safety_domain, reason: 'STUB: not computed yet' },
        {
          name: 'data_availability',
          value: inv.data_availability.has_experimental_table ? 1.0 : 0.5,
          weight: WEIGHTS.data_availability,
          reason: inv.data_availability.has_experimental_table ? 'has an experimental table' : 'documents only',
        },
        {
          name: 'tier',
          value: tier === null ? 0 : TIER_VALUE[tier],
          weight: WEIGHTS.tier,
          reason: tier === null ? 'tier not assigned' : `tier ${tier}`,
        },
      ];
      const score = components.reduce((sum, c) => sum + c.value * c.weight, 0);
      return { psi_id: inv.psi_id, score, components };
    })
    .sort((a, b) => b.score - a.score || a.psi_id.localeCompare(b.psi_id));
}
