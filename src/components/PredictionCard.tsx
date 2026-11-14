// Role B. Shows a Prediction from predict() (role C). Never shows a result without its confidence and evidence count.
import { formatNumber, formatPercent, ZONE_LABEL } from '@/components/format';
import type { Prediction } from '@/lib/types';

export function PredictionCard({ prediction }: { prediction: Prediction }) {
  const warnings = [...new Set(prediction.warnings)];
  return (
    <div className="card card-stack">
      <div>
        <span className={`zone zone-${prediction.zone}`}>{ZONE_LABEL[prediction.zone] ?? prediction.zone}</span>
      </div>
      <div className="habitat-values">
        <div>
          <span className="num">{prediction.p_sustained === null ? 'n/a' : formatPercent(prediction.p_sustained)}</span>
          <small>share of similar tests that kept burning</small>
        </div>
        <div>
          <span className="num">{formatNumber(prediction.confidence)}</span>
          <small>confidence (0 to 1)</small>
        </div>
        <div>
          <span className="num">{prediction.evidence.length}</span>
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
