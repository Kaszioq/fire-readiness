// Role C. One report: context -> LLM -> citation validator -> claim checks. Throws when the provider fails or
// the text does not pass; the caller (route or cache generator) decides what to do then.
// No Next.js imports here, so scripts/generate_cached_reports.ts can use it.
import type { Conditions, HabitatId, ReportResponse } from '@/lib/types';
import { buildReportContext, EXTERNAL_SOURCES } from './context';
import { chatCompletion, type LlmConfig } from './llm';
import { checkReport, normalizeTypography, REPORT_HEADINGS, tidyReport, validateCitations } from './validate';

export const SYSTEM_PROMPT = [
  'You write a fire-readiness briefing for an aerospace engineer. Use ONLY the context in the user message. No outside knowledge.',
  '',
  'Format: Markdown with exactly these four level-2 headings, in this order, and nothing before the first one:',
  ...REPORT_HEADINGS,
  'Length: 300 to 400 words in total. Short bullets, one fact per bullet.',
  '',
  'Rules:',
  '1. Every factual sentence ends with a citation: a PSI ID from the INVESTIGATIONS list in square brackets, for example [PSI-25]. For several, write [PSI-25][PSI-99]. Never cite an ID that is not in that list.',
  `2. Two facts come from NASA reports that are not PSI investigations. Cite them exactly as given in the context: ${EXTERNAL_SOURCES.map((s) => `(${s})`).join(' and ')}.`,
  '3. The predictor is not an investigation. Introduce its results as "the predictor" and cite the investigations that supplied the test runs. A flame-temperature margin must always be called a "physics estimate"; it is never a measurement or a test result.',
  '4. If the context does not support a statement, write "not covered by PSI data".',
  '5. Never say or imply that microgravity and Earth-gravity results bound, bracket or limit what happens in lunar or Martian gravity. Say that partial gravity is untested and may be more hazardous than both.',
  '6. Fire-resistant materials (silicone, Nomex) are never "safe" or "non-flammable". Some of their test runs kept burning and some did not: give the counts per material exactly as in DATA FACTS, and say that none was tested in PSI microgravity data at higher oxygen than stated there.',
  '7. State the limitation of the solid data (almost every run "sustained", so no flammability limit can be located) under "How confident we can be" or "Gaps".',
  '8. Evidence coverage is how well test runs cover the target. It is not a probability of fire. Do not call it one.',
  '9. Report counts exactly as the context gives them. When some runs burned and others did not, give both numbers; never generalise to "all" or "none".',
  '10. In the PREDICTOR OUTPUT, "TEST RUNS EXIST" means the tests cover this oxygen level and pressure for that material class; "NO TEST DATA" means they do not. Never report a covered class as a gap, and never ask future experiments for tests the context says exist.',
  '11. When the PREDICTOR OUTPUT says droplet TEST RUNS EXIST, say under "What the data says" what those droplet runs show and at which oxygen and pressure: they are the nearest test evidence for this atmosphere.',
  '12. Do not mention rockets or propellants. Do not mention any AI model, vendor or company. No preamble and no closing remarks.',
].join('\n');

export class ReportQualityError extends Error {
  constructor(
    public readonly problems: string[],
    /** The rejected text, for debugging only. Never shown to users. */
    public readonly rejected: string,
  ) {
    super(`report rejected: ${problems.join('; ')}`);
    this.name = 'ReportQualityError';
  }
}

export async function generateReport(
  conditions: Conditions,
  habitatId: HabitatId | undefined,
  cfg: LlmConfig,
): Promise<ReportResponse> {
  const context = buildReportContext(conditions, habitatId);
  const completion = await chatCompletion(
    cfg,
    [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: context.text },
    ],
    // A 400-word report is about 700 tokens; the rest is room for the model's reasoning. The provider counts
    // prompt + max_tokens against its tokens-per-minute limit (8000 on the free tier), so keep this modest.
    { maxTokens: 1800, temperature: 0.2 },
  );

  // Models sometimes add a title or a sentence before the first section.
  const text = normalizeTypography(completion.text);
  const start = text.indexOf(REPORT_HEADINGS[0]);
  const body = start > 0 ? text.slice(start) : text;

  const validated = validateCitations(body, context.allowedIds);
  const { citations, stripped } = validated;
  const markdown = tidyReport(validated.markdown);
  if (stripped.length > 0) console.warn(`[report] stripped citations not in context: ${stripped.join(', ')}`);

  const problems = checkReport(markdown, {
    dropletsCovered: context.dropletsCovered,
    fireResistantRuns: context.fireResistantRuns,
  });
  if (problems.length > 0) throw new ReportQualityError(problems, markdown);

  return {
    markdown,
    citations,
    stripped_citations: stripped,
    model: completion.model,
    generated_at: new Date().toISOString(),
    cached: false,
  };
}
