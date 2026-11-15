// Role B places the component; role C owns <SmokeSim /> (docs/SPEC.md module 6).
// Below the simulator: the real NASA smoke detection research, every finding from the curated data with its source.
// SAME and SAME-R disagree on smoke particle size, so both findings are shown.
import Link from 'next/link';
import { investigationName, SOURCE_LABEL, sourceHref } from '@/components/format';
import { PageBanner } from '@/components/PageBanner';
import { SmokeSim } from '@/components/smoke-sim/SmokeSim';
import { getInvestigation } from '@/lib/data';

export const metadata = { title: 'Smoke detection simulator' };

const SMOKE_INVESTIGATIONS = ['PSI-102', 'PSI-101', 'PSI-47'];

export default function SimulatorPage() {
  const research = SMOKE_INVESTIGATIONS.map((id) => getInvestigation(id)).filter((i) => i !== undefined);

  return (
    <>
      <PageBanner
        src="/media/candle-1g-vs-microgravity-grc-1998-c-00485.jpg"
        caption="A candle flame in normal gravity (left) and in microgravity (right)."
        creditHref="https://images.nasa.gov/details/GRC-1998-C-00485"
        position="center 40%"
      />
      <header className="page-head">
        <span className="eyebrow">Illustrative model</span>
        <h1>Smoke detection simulator</h1>
        <p className="lead">
          Without gravity, hot smoke does not rise. The same fire, vents and detectors run side by side in 0 g and 1 g,
          to show why detector placement depends on gravity and on the air flow.
        </p>
      </header>

      <SmokeSim />

      <section className="section smoke-research" aria-labelledby="smoke-research-h">
        <div className="section-head">
          <h2 id="smoke-research-h">What the NASA smoke experiments found</h2>
        </div>
        <p className="muted">
          The simulator moves smoke as a concentration. These investigations measured real smoke particles and
          detector response in low gravity. SAME and SAME-R disagree on whether low-gravity smoke particles are larger,
          so both findings are shown.
        </p>
        <div className="grid grid-3">
          {research.map((inv) => (
            <article key={inv.psi_id} className="card card-stack">
              <div>
                <h3>
                  <Link href={`/investigations/${encodeURIComponent(inv.psi_id)}`}>{investigationName(inv)}</Link>{' '}
                  <span className="muted small">{inv.psi_id}</span>
                </h3>
                <p className="muted small">{inv.title}</p>
              </div>
              {inv.key_findings.length === 0 ? (
                <p className="muted small">No findings recorded.</p>
              ) : (
                <ul className="lens-notes">
                  {inv.key_findings.map((f, n) => {
                    const href = sourceHref(f.prov.source_ref.url);
                    return (
                      <li key={n}>
                        {f.value ?? 'not reported'}{' '}
                        <span className="small">
                          {href ? (
                            <a href={href} target="_blank" rel="noreferrer">
                              {SOURCE_LABEL[f.prov.source_type] ?? 'source'}
                            </a>
                          ) : (
                            (SOURCE_LABEL[f.prov.source_type] ?? 'source')
                          )}
                          {f.prov.verified ? '' : ', unverified'}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </article>
          ))}
        </div>
      </section>
    </>
  );
}
