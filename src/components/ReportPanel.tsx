'use client';

// Role B. Fire-readiness report (docs/SPEC.md module 5). Shows the pre-generated report for the habitat at once and
// asks POST /api/report (role C) for a fresh one on demand. If the request fails, the cached report stays.
// Citations are linked only when the PSI ID is in the response's validated list and in the curated data.
import Link from 'next/link';
import { Fragment, useState, type ReactNode } from 'react';
import type { Conditions, HabitatId, ReportResponse } from '@/lib/types';

const CITATION = /\[(PSI-\d+)\]/g;

function renderInline(text: string, known: (id: string) => string | undefined, keyBase: string): ReactNode[] {
  const out: ReactNode[] = [];
  // Split on citations first, then on **bold** inside the plain parts.
  const parts = text.split(CITATION);
  parts.forEach((part, i) => {
    if (i % 2 === 1) {
      const name = known(part);
      out.push(
        name !== undefined ? (
          <Link key={`${keyBase}c${i}`} href={`/investigations/${part}`} className="cite" title={name}>
            {part}
          </Link>
        ) : (
          <span key={`${keyBase}c${i}`} className="cite cite-unknown" title="Not in the curated data">
            {part}
          </span>
        ),
      );
      return;
    }
    part.split(/\*\*(.+?)\*\*/g).forEach((chunk, j) => {
      if (!chunk) return;
      out.push(j % 2 === 1 ? <strong key={`${keyBase}b${i}-${j}`}>{chunk}</strong> : <Fragment key={`${keyBase}t${i}-${j}`}>{chunk}</Fragment>);
    });
  });
  return out;
}

type Block = { kind: 'h' | 'p'; text: string } | { kind: 'ul'; items: string[] };

/** Line-by-line parse of the report's markdown subset: headings, paragraphs, bullet lists. */
function parseBlocks(markdown: string): Block[] {
  const blocks: Block[] = [];
  let para: string[] = [];
  let list: string[] = [];
  const flush = () => {
    if (para.length) blocks.push({ kind: 'p', text: para.join(' ') });
    if (list.length) blocks.push({ kind: 'ul', items: list });
    para = [];
    list = [];
  };
  for (const raw of markdown.replace(/\r\n/g, '\n').split('\n')) {
    const line = raw.trim();
    const heading = /^#{1,4}\s+(.*)$/.exec(line);
    const bullet = /^[-*]\s+(.*)$/.exec(line);
    if (!line) flush();
    else if (heading) {
      flush();
      blocks.push({ kind: 'h', text: heading[1] });
    } else if (bullet) {
      if (para.length) flush();
      list.push(bullet[1]);
    } else {
      if (list.length) flush();
      para.push(line);
    }
  }
  flush();
  return blocks;
}

function ReportBody({ markdown, known }: { markdown: string; known: (id: string) => string | undefined }) {
  return (
    <div className="report-body">
      {parseBlocks(markdown).map((block, i) => {
        if (block.kind === 'h') return <h3 key={i}>{renderInline(block.text, known, `h${i}`)}</h3>;
        if (block.kind === 'ul') {
          return (
            <ul key={i}>
              {block.items.map((item, j) => (
                <li key={j}>{renderInline(item, known, `l${i}-${j}`)}</li>
              ))}
            </ul>
          );
        }
        return <p key={i}>{renderInline(block.text, known, `p${i}`)}</p>;
      })}
    </div>
  );
}

function formatWhen(iso: string): string {
  const d = new Date(iso);
  // Fixed UTC format so server and client render the same text.
  return Number.isNaN(d.getTime()) ? 'unknown time' : `${d.toISOString().slice(0, 16).replace('T', ' ')} UTC`;
}

export function ReportPanel({
  conditions,
  habitatId,
  presetConditions,
  cached,
  names,
}: {
  conditions: Conditions;
  habitatId: HabitatId;
  /** True when the conditions are exactly the habitat preset (the cached report was written for the preset). */
  presetConditions: boolean;
  cached: ReportResponse | undefined;
  /** PSI ID -> display name, for every investigation in the curated data. */
  names: Record<string, string>;
}) {
  const [fresh, setFresh] = useState<{ report: ReportResponse; sig: string } | null>(null);
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle');

  const sig = JSON.stringify(conditions);
  const report = fresh?.report ?? cached;
  const stale = fresh ? fresh.sig !== sig : !presetConditions;
  const allowed = new Set(report?.citations ?? []);
  const known = (id: string) => (allowed.has(id) ? names[id] : undefined);

  const regenerate = async () => {
    setStatus('loading');
    try {
      const res = await fetch('/api/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conditions, habitat_id: habitatId, language: 'en' }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as ReportResponse;
      if (typeof json.markdown !== 'string' || !Array.isArray(json.citations)) throw new Error('Malformed report');
      setFresh({ report: json, sig });
      setStatus('idle');
    } catch {
      setStatus('error');
    }
  };

  return (
    <section className="card card-stack report section" aria-labelledby="report-h" aria-busy={status === 'loading'}>
      <div className="report-head">
        <div>
          <h2 id="report-h">Fire-readiness report</h2>
          <span className="tag">AI-generated from cited NASA data</span>
        </div>
        <button type="button" className="btn" onClick={regenerate} disabled={status === 'loading'}>
          {status === 'loading' ? 'Generating…' : 'Regenerate for these conditions'}
        </button>
      </div>

      {status === 'error' && (
        <div className="callout" role="alert">
          The report service did not answer. {report ? 'Showing the last available report.' : 'No cached report is available.'}
        </div>
      )}
      {report?.model === 'mock' && (
        <div className="callout" role="note">
          Placeholder report: the text below is a development mock, not generated from the curated data yet.
        </div>
      )}
      {report && stale && status !== 'loading' && (
        <p className="muted small" role="status">
          This report was written for {fresh ? 'earlier settings' : 'the habitat preset'}, not for the conditions set
          above. Regenerate to update it.
        </p>
      )}

      {report ? (
        <>
          <ReportBody markdown={report.markdown} known={known} />
          <div className="report-foot">
            <span>
              {report.cached ? 'Pre-generated report' : 'Generated on request'}, {formatWhen(report.generated_at)}
            </span>
            {report.citations.length > 0 && (
              <span className="report-cites">
                Cited:{' '}
                {report.citations.map((id) =>
                  names[id] !== undefined ? (
                    <Link key={id} href={`/investigations/${id}`} className="cite">
                      {names[id]} · {id}
                    </Link>
                  ) : (
                    <span key={id} className="cite cite-unknown">
                      {id}
                    </span>
                  ),
                )}
              </span>
            )}
            {report.stripped_citations.length > 0 && (
              <span>
                {report.stripped_citations.length} citation{report.stripped_citations.length === 1 ? '' : 's'} removed
                by the validator because the source is not in the curated data.
              </span>
            )}
          </div>
        </>
      ) : (
        status !== 'error' && <p className="muted">No report yet for this habitat.</p>
      )}
    </section>
  );
}
