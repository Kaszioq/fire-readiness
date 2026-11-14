// Role C. POST /api/report, see docs/CONTRACTS.md section 7 and docs/SPEC.md module 5.
// STUB: validates the request and always serves the cached report.
// To do: rank -> trimmed context for the top 10 investigations -> chatCompletion() from ./llm
// -> citation validator -> response; on provider error or timeout fall back to the cached report.
import { NextResponse } from 'next/server';
import { getCachedReport } from '@/lib/data';
import { ReportRequestSchema } from '@/lib/schemas';
import type { ReportResponse } from '@/lib/types';

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

  const report: ReportResponse = getCachedReport(parsed.data.habitat_id);
  return NextResponse.json(report);
}
