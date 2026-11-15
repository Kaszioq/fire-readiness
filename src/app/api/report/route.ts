// Role C. POST /api/report, see docs/CONTRACTS.md section 7 and docs/SPEC.md module 5.
// Live report when an LLM is configured and answers in time with a text that passes the checks;
// otherwise the pre-generated report for the habitat (or the nearest preset), with cached: true.
// The UI always gets a report.
import { NextResponse } from 'next/server';
import { getCachedReport } from '@/lib/data';
import { ReportRequestSchema } from '@/lib/schemas';
import type { ReportResponse } from '@/lib/types';
import { nearestHabitatId } from './context';
import { generateReport } from './generate';
import { getLlmConfig } from './llm';

// The provider timeout is 25 s (llm.ts); leave room for the fallback.
export const maxDuration = 30;

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Request body is not valid JSON.' }, { status: 400 });
  }

  const parsed = ReportRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request.', issues: parsed.error.issues }, { status: 400 });
  }
  const { conditions, habitat_id } = parsed.data;
  const fallback = (): ReportResponse => getCachedReport(habitat_id ?? nearestHabitatId(conditions));

  const cfg = getLlmConfig();
  if (!cfg) return NextResponse.json(fallback());

  try {
    return NextResponse.json(await generateReport(conditions, habitat_id, cfg));
  } catch (e) {
    // Provider error, rate limit (HTTP 429), timeout, or a text that failed the checks.
    console.warn(`[report] serving the cached report: ${e instanceof Error ? e.message : String(e)}`);
    return NextResponse.json(fallback());
  }
}
