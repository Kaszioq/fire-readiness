// Role C. Writes data/cached_reports/<habitat_id>.json for every habitat preset: the fallback of POST /api/report
// and the instant report in the demo.
//
//   npm run reports                 all habitats
//   npm run reports -- moon_base    only the named ones
//   npm run reports -- --dry        print the LLM context of each habitat and its size, call nothing
//
// Needs LLM_BASE_URL, LLM_API_KEY and LLM_MODEL (.env.local). Paced for a free tier with a low tokens-per-minute
// limit: one request, then a pause; on HTTP 429 it waits and tries again. A text that fails the checks in
// src/app/api/report/validate.ts is never written.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildReportContext } from '../src/app/api/report/context';
import { generateReport, ReportQualityError } from '../src/app/api/report/generate';
import { getLlmConfig, LlmHttpError } from '../src/app/api/report/llm';
import { habitats } from '../src/lib/data';
import { ReportResponseSchema } from '../src/lib/schemas';
import type { Conditions, Habitat } from '../src/lib/types';

const OUT = join(process.cwd(), 'data', 'cached_reports');
const PAUSE_MS = 62_000;
const MAX_ATTEMPTS = 4;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** The cached report describes the atmosphere; thin fabric is the class the Habitat Lens opens with. */
function conditionsFor(h: Habitat): Conditions {
  return {
    o2_mole_fraction: h.o2_mole_fraction,
    pressure_kpa: h.pressure_kpa,
    flow_cm_s: h.flow_cm_s,
    material_class: 'thin_fabric',
    gravity_g: h.gravity_g,
  };
}

async function main() {
  const args = process.argv.slice(2);
  const dry = args.includes('--dry');
  const wanted = args.filter((a) => !a.startsWith('--'));
  const unknown = wanted.filter((id) => !habitats.some((h) => h.id === id));
  if (unknown.length) throw new Error(`unknown habitat id: ${unknown.join(', ')}`);
  const todo = habitats.filter((h) => wanted.length === 0 || wanted.includes(h.id));

  if (dry) {
    for (const h of todo) {
      const context = buildReportContext(conditionsFor(h), h.id);
      console.log(`\n===== ${h.id}: ${context.text.length} characters, may cite ${context.allowedIds.join(', ')}\n`);
      console.log(context.text);
    }
    return;
  }

  const cfg = getLlmConfig();
  if (!cfg) throw new Error('LLM_BASE_URL, LLM_API_KEY and LLM_MODEL must be set (see .env.example).');
  mkdirSync(OUT, { recursive: true });

  const failed: string[] = [];
  for (const [i, h] of todo.entries()) {
    let done = false;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS && !done; attempt += 1) {
      try {
        const report = await generateReport(conditionsFor(h), h.id, cfg);
        const cached = ReportResponseSchema.parse({ ...report, cached: true });
        writeFileSync(join(OUT, `${h.id}.json`), `${JSON.stringify(cached, null, 2)}\n`);
        const words = cached.markdown.split(/\s+/).length;
        console.log(`ok   ${h.id}: ${words} words, cites ${cached.citations.join(', ')}` +
          (cached.stripped_citations.length ? `, stripped ${cached.stripped_citations.join(', ')}` : ''));
        done = true;
      } catch (e) {
        if (e instanceof ReportQualityError) {
          console.warn(`retry ${h.id} (attempt ${attempt}): ${e.problems.join('; ')}`);
          if (process.argv.includes('--show-rejected')) console.warn(`---- rejected text ----\n${e.rejected}\n----`);
        } else if (e instanceof LlmHttpError && e.status === 429) {
          const wait = (e.retryAfterSeconds ?? 60) + 2;
          console.warn(`retry ${h.id} (attempt ${attempt}): rate limited, waiting ${Math.round(wait)} s`);
          await sleep(wait * 1000);
          continue;
        } else {
          console.warn(`retry ${h.id} (attempt ${attempt}): ${e instanceof Error ? e.message : String(e)}`);
        }
      }
      if (!done || i < todo.length - 1) await sleep(PAUSE_MS);
    }
    if (!done) failed.push(h.id);
  }

  if (failed.length) {
    console.error(`FAILED: ${failed.join(', ')}. Their files were not written.`);
    process.exit(1);
  }
  console.log(`Wrote ${todo.length} reports to data/cached_reports/.`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
