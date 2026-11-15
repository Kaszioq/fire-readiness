// Role C. Leave-one-out evaluation of predict() on the curated test runs. Prints Markdown.
//   npx tsx scripts/eval_predictor.ts
//
// For each run: remove it, ask the predictor for its conditions, compare the zone with the recorded outcome.
// fire_resistant runs are left out: the predictor gives no estimate for that class by design.
// Read docs/EVALUATION.md before quoting any number from here.
import { flammabilityPoints } from '../src/lib/data';
import { predict, predictDropletByFuel } from '../src/lib/predict';
import type { Conditions, FlammabilityPoint, Outcome, Prediction, Zone } from '../src/lib/types';

type Label = 'sustained' | 'marginal' | 'not_burning';
const LABELS: Label[] = ['sustained', 'marginal', 'not_burning'];
const labelOfOutcome = (o: Outcome): Label => (o === 'sustained' ? 'sustained' : o === 'marginal' ? 'marginal' : 'not_burning');
const labelOfZone = (z: Zone): Label | null =>
  z === 'sustained' ? 'sustained' : z === 'marginal' ? 'marginal' : z === 'extinguishes' ? 'not_burning' : null;

const fuelOf = (p: FlammabilityPoint) => (/methanol/i.test(p.material) ? 'methanol' : 'n-heptane');
const groupOf = (p: FlammabilityPoint) => (p.material_class === 'liquid_droplet' ? `liquid_droplet (${fuelOf(p)})` : p.material_class);

function predictWithout(p: FlammabilityPoint): Prediction {
  const rest = flammabilityPoints.filter((x) => x.id !== p.id);
  const c: Conditions = {
    o2_mole_fraction: p.o2_mole_fraction,
    pressure_kpa: p.pressure_kpa,
    flow_cm_s: p.flow_cm_s,
    material_class: p.material_class,
    gravity_g: 0,
  };
  return p.material_class === 'liquid_droplet' ? predictDropletByFuel(c, rest)[fuelOf(p)] : predict(c, rest);
}

const pct = (n: number, d: number) => (d === 0 ? 'n/a' : `${Math.round((100 * n) / d)}%`);

const rows = flammabilityPoints
  .filter((p) => p.material_class !== 'fire_resistant')
  .map((p) => {
    const prediction = predictWithout(p);
    return { p, group: groupOf(p), actual: labelOfOutcome(p.outcome), predicted: labelOfZone(prediction.zone), mode: prediction.mode };
  });

const groups = [...new Set(rows.map((r) => r.group))].sort();
const lines: string[] = [];
lines.push('| Class | Runs | Outcomes in the data | No data result | Recall sustained | Recall marginal | Recall not burning | Balanced accuracy | "Always sustained" baseline |');
lines.push('|---|---|---|---|---|---|---|---|---|');

for (const group of [...groups, 'all']) {
  const g = group === 'all' ? rows : rows.filter((r) => r.group === group);
  const present = LABELS.filter((l) => g.some((r) => r.actual === l));
  // A run with no data result counts as a miss for its outcome.
  const recall = (l: Label) => {
    const of = g.filter((r) => r.actual === l);
    return { hit: of.filter((r) => r.predicted === l).length, n: of.length };
  };
  const recalls = present.map((l) => recall(l));
  const balanced = recalls.reduce((s, r) => s + r.hit / r.n, 0) / present.length;
  const counts = present.map((l) => `${recall(l).n} ${l.replace('_', ' ')}`).join(', ');
  const cell = (l: Label) => (present.includes(l) ? `${recall(l).hit}/${recall(l).n} (${pct(recall(l).hit, recall(l).n)})` : 'none in data');
  lines.push(
    `| ${group} | ${g.length} | ${counts} | ${g.filter((r) => r.predicted === null).length} (${pct(g.filter((r) => r.predicted === null).length, g.length)}) | ` +
      `${cell('sustained')} | ${cell('marginal')} | ${cell('not_burning')} | ${pct(Math.round(balanced * 1000), 1000)} | ${pct(1, present.length)} |`,
  );
}

console.log(`## Predictor: leave-one-out (${rows.length} runs, fire_resistant excluded)\n`);
console.log(lines.join('\n'));

const misses = rows.filter((r) => r.predicted !== r.actual);
console.log(`\nRuns not reproduced: ${misses.length} of ${rows.length}.\n`);
console.log('| Run | Class | Material | O2 | Flow cm/s | Recorded | Predicted without it |');
console.log('|---|---|---|---|---|---|---|');
for (const r of misses) {
  console.log(
    `| ${r.p.id} | ${r.group} | ${r.p.material.slice(0, 40)} | ${Number((r.p.o2_mole_fraction * 100).toFixed(1))}% | ${r.p.flow_cm_s ?? 'not reported'} | ${r.actual.replace('_', ' ')} | ${r.predicted?.replace('_', ' ') ?? `no data result (${r.mode})`} |`,
  );
}
