// Role B. Shows a Prediction from predict() (role C). Never shows a result without its evidence coverage and evidence count.
import { clamp01, formatNumber, formatPercent, ZONE_LABEL } from '@/components/format';
import type { Prediction } from '@/lib/types';

export function PredictionCard({ prediction }: { prediction: Prediction }) {
  const warnings = [...new Set(prediction.warnings)];
  return (
    <div className="card card-stack">
      <div>
        <span className={`zone zone-${prediction.zone}`}>{ZONE_LABEL[prediction.zone] ?? prediction.zone}</span>
      </div>
      <div className="pred-figs">
        <div>
          <span className="bignum pred-num">
            {prediction.p_sustained === null ? 'n/a' : formatPercent(prediction.p_sustained).replace('%', '')}
            {prediction.p_sustained !== null && <small>%</small>}
          </span>
          <span className="meter">
            <i style={{ width: `${clamp01(prediction.p_sustained ?? 0) * 100}%` }} />
          </span>
          <small>share of similar tests that kept burning</small>
        </div>
        <div>
          <span className="bignum pred-num">{formatNumber(prediction.confidence)}</span>
          <span className="meter meter-cool">
            <i style={{ width: `${clamp01(prediction.confidence) * 100}%` }} />
          </span>
          <small>evidence coverage (0 to 1)</small>
        </div>
        <div>
          <span className="bignum pred-num">{prediction.evidence.length}</span>
          <span className="pred-pips" aria-hidden="true">
            {prediction.evidence.map((e) => (
              <i key={e.point_id} data-outcome={e.outcome} />
            ))}
          </span>
          <small>{prediction.evidence.length === 1 ? 'evidence test run' : 'evidence test runs'}</small>
        </div>
      </div>
      {prediction.explanation && <p className="muted">{prediction.explanation}</p>}
      {warnings.length > 0 && (
        <div className="callout" role="note">
          <ul>
            {warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
