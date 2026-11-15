// Role C. Checks on the LLM text before it is shown: citations first, then claims the app must never make.
// Deterministic string checks. A report that fails a check is not shown; the cached report is served instead.

export const REPORT_HEADINGS = [
  '## What the data says',
  '## How confident we can be',
  '## Gaps',
  '## What future experiments (e.g. LUCI, FM2) should measure',
] as const;

export interface CitationResult {
  markdown: string;
  /** Valid PSI IDs cited, in order of first use. */
  citations: string[];
  /** IDs that were cited but are not in the context; removed from the text. */
  stripped: string[];
}

// One bracket holding one or more PSI IDs: [PSI-25], [PSI-25, PSI-99], [PSI-25; PSI-99].
const CITATION_GROUP = /\[\s*(PSI-\d+(?:\s*[,;]\s*PSI-\d+)*)\s*\]/gi;

/** Removes every cited PSI ID that is not in `allowedIds` and reports what was removed. */
export function validateCitations(markdown: string, allowedIds: string[]): CitationResult {
  const allowed = new Set(allowedIds.map((id) => id.toUpperCase()));
  const citations: string[] = [];
  const stripped: string[] = [];

  const cleaned = markdown.replace(CITATION_GROUP, (_match, group: string) => {
    const ids = group.split(/[,;]/).map((s) => s.trim().toUpperCase());
    const kept = ids.filter((id) => {
      const ok = allowed.has(id);
      const list = ok ? citations : stripped;
      if (!list.includes(id)) list.push(id);
      return ok;
    });
    return kept.map((id) => `[${id}]`).join('');
  });

  return {
    // Tidy what a removed citation leaves behind: a space before punctuation, doubled spaces.
    markdown: cleaned.replace(/[ \t]+([.,;:])/g, '$1').replace(/[ \t]{2,}/g, ' ').trim(),
    citations,
    stripped,
  };
}

/** Plain hyphens, spaces and quotes: models emit non-breaking variants that break searching and matching. */
export function normalizeTypography(text: string): string {
  return text
    .replace(/[‐‑‒–−]/g, '-')
    .replace(/[   ]/g, ' ')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    // Some models write citations in lenticular brackets: 【PSI-25】.
    .replace(/【/g, '[')
    .replace(/】/g, ']');
}

/**
 * Cosmetic clean-up after the citation validator: NTRS sources belong in round brackets (square brackets are for
 * PSI IDs, which the UI turns into links), written once, and lines carry no trailing spaces.
 */
export function tidyReport(markdown: string): string {
  return markdown
    .replace(/\[\s*(NTRS \d+)\s*\]/g, '($1)')
    .replace(/(\(NTRS \d+\))(\s*\1)+/g, '$1')
    .split('\n')
    .map((line) => line.replace(/[ \t]+$/, '').replace(/(\S)(\[PSI-\d+\])/, '$1 $2'))
    .join('\n')
    .trim();
}

const NEGATION =/\b(not|no|never|cannot|can't|neither|nor|don't|doesn't|do not|does not|untested)\b/i;
const sentences = (text: string) => text.split(/(?<=[.!?])\s+|\n+/).filter((s) => s.trim().length > 0);

export interface ReportFacts {
  /** Droplet test runs exist near the target, so droplets must not be described as untested. */
  dropletsCovered?: boolean;
  /** Fire-resistant test runs per material family. A text cannot count more runs of a material than exist. */
  fireResistantRuns?: Record<string, number>;
}

/** Problems that make a report unusable. An empty list means the report may be shown. */
export function checkReport(markdown: string, facts: ReportFacts = {}): string[] {
  const problems: string[] = [];

  let cursor = -1;
  for (const heading of REPORT_HEADINGS) {
    const at = markdown.indexOf(heading);
    if (at < 0) problems.push(`missing section "${heading}"`);
    else if (at < cursor) problems.push(`section "${heading}" is out of order`);
    else cursor = at;
  }

  const words = markdown.split(/\s+/).filter(Boolean).length;
  if (words < 150) problems.push(`too short (${words} words)`);
  if (words > 650) problems.push(`too long (${words} words)`);

  if (!/\[PSI-\d+\]/.test(markdown)) problems.push('no PSI citation');
  if (/\b(rocket|propellant)s?\b/i.test(markdown)) problems.push('mentions rockets or propellants (out of scope)');

  for (const s of sentences(markdown)) {
    // Microgravity and 1 g results do not bound partial gravity (docs/STATUS.md point 10).
    if (
      /\b(bound|bounds|bounded|bounding|bracket|brackets|bracketed|bracketing)\b/i.test(s) &&
      /\b(lunar|moon|mars|martian|partial[- ]gravity)\b/i.test(s) &&
      !NEGATION.test(s)
    ) {
      problems.push(`claims that tests bound partial gravity: "${s.trim().slice(0, 120)}"`);
    }
    // Fire-resistant is not "safe" (docs/STATUS.md point 12).
    if (
      /\b(silicone|nomex|fire[- ]resistant|flame[- ]resistant)\b/i.test(s) &&
      /\b(is|are|remains?|proved|proven)\s+(fire[- ]?)?(safe|non[- ]?flammable|inflammable)\b/i.test(s) &&
      !NEGATION.test(s)
    ) {
      problems.push(`calls a fire-resistant material safe: "${s.trim().slice(0, 120)}"`);
    }
    // Some fire-resistant runs burned (Nomex III): "they did not burn" as a blanket statement is false.
    if (
      /\b(nomex|fire[- ]resistant|flame[- ]resistant)\b/i.test(s) &&
      /\b(did not|didn't|none|never|no runs?)\b[^.;]*\b(burn|burned|sustain|sustained|ignite|ignited)\b/i.test(s) &&
      !/\b(\d+ of|kept burning|some|silicone runs?|nomex run did not ignite)\b/i.test(s)
    ) {
      problems.push(`generalises that fire-resistant materials did not burn: "${s.trim().slice(0, 120)}"`);
    }
    // Droplets tested near the target are evidence, not a gap.
    if (
      facts.dropletsCovered &&
      /\b(droplets?|liquid[- ]fuel)\b/i.test(s) &&
      /\b(no (test )?(data|runs)|not (include|cover|covered)|does not include|lacks?|untested|extend)\b/i.test(s) &&
      !/\b(partial|lunar gravity|martian|0\.166|0\.38|gravity)\b/i.test(s)
    ) {
      problems.push(`describes droplets as untested although droplet runs cover the target: "${s.trim().slice(0, 120)}"`);
    }
  }

  // Droplet runs that cover the target are the nearest evidence there is: the report must say what they show.
  if (facts.dropletsCovered && !/\bdroplets?\b/i.test(markdown)) {
    problems.push('omits the droplet test runs that cover this atmosphere');
  }
  // "5 silicone runs" when only 4 exist.
  for (const [family, n] of Object.entries(facts.fireResistantRuns ?? {})) {
    const counts = [...markdown.matchAll(new RegExp(`\\b(\\d+)\\s+${family}\\s+(?:test\\s+)?runs?\\b`, 'gi'))].map((m) => Number(m[1]));
    const tooMany = counts.find((c) => c > n);
    if (tooMany !== undefined) problems.push(`counts ${tooMany} ${family} runs, but the data hold ${n}`);
  }

  // A flame-temperature margin is a physics estimate, never a test result.
  if (/\bmargin/i.test(markdown) && !/physics estimate/i.test(markdown)) {
    problems.push('mentions a margin without calling it a physics estimate');
  }
  return problems;
}
