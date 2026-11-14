// Role B. Ranked investigations from rankInvestigations() (role C), each with its score breakdown.
import Link from 'next/link';
import { clamp01, formatNumber, investigationName } from '@/components/format';
import type { Investigation, RankedInvestigation } from '@/lib/types';

export function RankedList({
  ranked,
  lookup,
}: {
  ranked: RankedInvestigation[];
  lookup: (psiId: string) => Investigation | undefined;
}) {
  if (ranked.length === 0) {
    return <div className="placeholder">No investigations to rank.</div>;
  }

  return (
    <ol className="row-list">
      {ranked.map((r, i) => {
        const inv = lookup(r.psi_id);
        return (
          <li key={r.psi_id}>
            <div className="row-title">
              <span className="num muted">{i + 1}</span>
              <Link href={`/investigations/${encodeURIComponent(r.psi_id)}`}>{investigationName(inv, r.psi_id)}</Link>
              {inv?.acronym && <span className="num muted">{r.psi_id}</span>}
            </div>
            {inv && <div className="row-sub">{inv.title}</div>}
            <div className="score">
              <div className="score-track" aria-hidden="true">
                <div className="score-fill" style={{ transform: `scaleX(${clamp01(r.score)})` }} />
              </div>
              <span className="num">{formatNumber(r.score)}</span>
            </div>
            {r.components.length > 0 && (
              <details className="breakdown">
                <summary>Why this score</summary>
                <table>
                  <thead>
                    <tr>
                      <th>Component</th>
                      <th>Value</th>
                      <th>Weight</th>
                      <th>Reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {r.components.map((c) => (
                      <tr key={c.name}>
                        <td>{c.name.replaceAll('_', ' ')}</td>
                        <td className="num">{formatNumber(c.value)}</td>
                        <td className="num">{formatNumber(c.weight)}</td>
                        <td className="muted">{c.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </details>
            )}
          </li>
        );
      })}
    </ol>
  );
}
