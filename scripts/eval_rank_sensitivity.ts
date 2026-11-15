// Role C. How much the ranking depends on its weights. Prints Markdown.
//   npx tsx scripts/eval_rank_sensitivity.ts
//
// Each weight is moved by +20% and -20% in turn, the five weights are renormalised to sum 1, and the top 5
// is compared with the baseline top 5 (Jaccard overlap: shared / union; 1.00 = same five investigations).
import { habitats, investigations } from '../src/lib/data';
import { rankInvestigations, WEIGHTS } from '../src/lib/rank';
import type { Conditions, HabitatId, RankedInvestigation, ScoreComponent } from '../src/lib/types';

const HABITATS: HabitatId[] = ['moon_base', 'iss', 'exploration_8_2'];
const TOP = 5;
type Name = ScoreComponent['name'];
const NAMES = Object.keys(WEIGHTS) as Name[];

function conditionsFor(id: HabitatId): Conditions {
  const h = habitats.find((x) => x.id === id);
  if (!h) throw new Error(`habitat ${id} missing`);
  return { o2_mole_fraction: h.o2_mole_fraction, pressure_kpa: h.pressure_kpa, flow_cm_s: h.flow_cm_s, material_class: 'thin_fabric', gravity_g: h.gravity_g };
}

const idNumber = (psiId: string) => Number(psiId.replace(/\D+/g, ''));

/** Re-score the baseline components with other weights; same tie-break as rankInvestigations. */
function topWith(ranked: RankedInvestigation[], weights: Record<Name, number>): string[] {
  return ranked
    .map((r) => ({ id: r.psi_id, score: r.components.reduce((s, c) => s + c.value * weights[c.name], 0) }))
    .sort((a, b) => b.score - a.score || idNumber(a.id) - idNumber(b.id))
    .slice(0, TOP)
    .map((x) => x.id);
}

function varied(name: Name, factor: number): Record<Name, number> {
  const raw = Object.fromEntries(NAMES.map((n) => [n, WEIGHTS[n] * (n === name ? factor : 1)])) as Record<Name, number>;
  const sum = NAMES.reduce((s, n) => s + raw[n], 0);
  return Object.fromEntries(NAMES.map((n) => [n, raw[n] / sum])) as Record<Name, number>;
}

const jaccard = (a: string[], b: string[]) => {
  const shared = a.filter((x) => b.includes(x)).length;
  return shared / (a.length + b.length - shared);
};

console.log('## Ranking: sensitivity to the weights (each weight +/-20%, renormalised; thin fabric target)\n');
for (const id of HABITATS) {
  const ranked = rankInvestigations(conditionsFor(id), investigations);
  const base = topWith(ranked, WEIGHTS);
  console.log(`### ${id}\n`);
  console.log(`Baseline top ${TOP}: ${base.join(', ')}\n`);
  console.log('| Weight changed | -20%: overlap | -20%: top 5 | +20%: overlap | +20%: top 5 |');
  console.log('|---|---|---|---|---|');
  const overlaps: number[] = [];
  let sameOrder = 0;
  for (const name of NAMES) {
    const cells = [0.8, 1.2].map((factor) => {
      const top = topWith(ranked, varied(name, factor));
      const j = jaccard(base, top);
      overlaps.push(j);
      if (top.join() === base.join()) sameOrder += 1;
      return `${j.toFixed(2)} | ${top.join(', ')}`;
    });
    console.log(`| ${name} (${WEIGHTS[name]}) | ${cells.join(' | ')} |`);
  }
  console.log(
    `\nLowest overlap ${Math.min(...overlaps).toFixed(2)}, mean ${(overlaps.reduce((a, b) => a + b, 0) / overlaps.length).toFixed(2)}; ` +
      `the top ${TOP} kept the same order in ${sameOrder} of ${overlaps.length} variants.\n`,
  );
}
