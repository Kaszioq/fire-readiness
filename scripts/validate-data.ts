// `npm run validate:data`: zod-validates the data files and checks cross-references.
// For each file it validates data/curated/<name>.json when present, otherwise data/mock/<name>.mock.json.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import {
  FlameTemperatureSchema,
  FlammabilityPointSchema,
  HabitatSchema,
  InvestigationSchema,
  MetaSchema,
  ReportResponseSchema,
} from '../src/lib/schemas';

const root = process.cwd();
let failed = false;

function fail(label: string, message: string) {
  failed = true;
  console.error(`FAIL ${label}\n${message}\n`);
}

function load<S extends z.ZodType>(name: string, schema: S): z.infer<S> | null {
  const curated = join(root, 'data', 'curated', `${name}.json`);
  const mock = join(root, 'data', 'mock', `${name}.mock.json`);
  const path = existsSync(curated) ? curated : mock;
  const label = path === curated ? `data/curated/${name}.json` : `data/mock/${name}.mock.json (no curated file yet)`;
  if (!existsSync(path)) {
    fail(label, 'file not found');
    return null;
  }
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, 'utf8'));
  } catch (e) {
    fail(label, `not valid JSON: ${(e as Error).message}`);
    return null;
  }
  const result = schema.safeParse(raw);
  if (!result.success) {
    fail(label, z.prettifyError(result.error));
    return null;
  }
  console.log(`ok   ${label}`);
  return result.data;
}

const investigations = load('investigations', InvestigationSchema.array());
const points = load('flammability_points', FlammabilityPointSchema.array());
const habitats = load('habitats', HabitatSchema.array());
const meta = load('meta', MetaSchema);
// Physics layer. Curated only: there is no mock for it.
const flame = existsSync(join(root, 'data', 'curated', 'flame_temperature.json'))
  ? load('flame_temperature', FlameTemperatureSchema)
  : null;

function duplicates(values: string[]): string[] {
  return [...new Set(values.filter((v, i) => values.indexOf(v) !== i))];
}

if (investigations) {
  const ids = new Set(investigations.map((i) => i.psi_id));
  const dup = duplicates(investigations.map((i) => i.psi_id));
  if (dup.length) fail('investigations', `duplicate psi_id: ${dup.join(', ')}`);

  for (const inv of investigations) {
    const missing = (inv.uses_data_from.value ?? []).filter((id) => !ids.has(id));
    if (missing.length) fail('investigations', `${inv.psi_id}.uses_data_from points to unknown IDs: ${missing.join(', ')}`);
  }
  if (points) {
    const dupPoints = duplicates(points.map((p) => p.id));
    if (dupPoints.length) fail('flammability_points', `duplicate id: ${dupPoints.join(', ')}`);
    const orphans = [...new Set(points.filter((p) => !ids.has(p.psi_id)).map((p) => p.psi_id))];
    if (orphans.length) fail('flammability_points', `points reference unknown investigations: ${orphans.join(', ')}`);
  }
  if (meta && meta.n_investigations !== investigations.length) {
    fail('meta', `n_investigations is ${meta.n_investigations} but investigations has ${investigations.length} entries`);
  }
}

if (flame && points) {
  // fire_resistant points have no fuel model by design (material-specific limit, see data/curated/mappings.md).
  const missing = points.filter((p) => p.material_class !== 'fire_resistant' && !(p.id in flame.points)).map((p) => p.id);
  if (missing.length) {
    fail('flame_temperature', `no T_ad for ${missing.length} flammability points, e.g. ${missing.slice(0, 5).join(', ')}`);
  }
}
if (flame && habitats) {
  const known = new Set(flame.habitats.map((h) => h.habitat_id));
  const missing = habitats.filter((h) => !known.has(h.id)).map((h) => h.id);
  if (missing.length) fail('flame_temperature', `no T_ad for habitats: ${missing.join(', ')}`);
}

if (habitats) {
  const dup = duplicates(habitats.map((h) => h.id));
  if (dup.length) fail('habitats', `duplicate id: ${dup.join(', ')}`);
}

if (meta && meta.n_fields_verified > meta.n_fields_total) {
  fail('meta', 'n_fields_verified is greater than n_fields_total');
}

// Cached reports are optional until role C generates them.
if (habitats) {
  for (const h of habitats) {
    const path = join(root, 'data', 'cached_reports', `${h.id}.json`);
    if (!existsSync(path)) continue;
    const result = ReportResponseSchema.safeParse(JSON.parse(readFileSync(path, 'utf8')));
    if (!result.success) fail(`data/cached_reports/${h.id}.json`, z.prettifyError(result.error));
    else console.log(`ok   data/cached_reports/${h.id}.json`);
  }
}

if (failed) {
  console.error('Data validation failed.');
  process.exit(1);
}
console.log('Data validation passed.');
