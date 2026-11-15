'use client';

// Role B. Habitat Lens (docs/SPEC.md modules 2 and 4): presets plus sliders -> Conditions ->
// rankInvestigations() and predict() (role C), recomputed in the browser on every change.
// This file only displays what those functions and the curated data return.
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { scaleLinear } from 'd3-scale';
import { classPhase, OUTCOME_LABEL, OUTCOMES, OutcomeMark, PHASE_COLOR } from '@/components/GapMap';
import {
  formatKpa,
  formatNumber,
  formatPercent,
  formatPsi,
  HABITAT_SHORT,
  investigationName,
  MATERIAL_LABEL,
  plural,
  SOURCE_LABEL,
  sourceHref,
} from '@/components/format';
import { PredictionCard } from '@/components/PredictionCard';
import { RankedList } from '@/components/RankedList';
import { ReportPanel } from '@/components/ReportPanel';
import { predict } from '@/lib/predict';
import { rankInvestigations } from '@/lib/rank';
import type {
  Conditions,
  FlammabilityPoint,
  Habitat,
  Investigation,
  MaterialClass,
  Prediction,
  ReportResponse,
} from '@/lib/types';

const O2_RANGE = { min: 0.1, max: 1, step: 0.005 };
const P_RANGE = { min: 20, max: 150, step: 0.1 };
const FLOW_RANGE = { min: 0, max: 50, step: 0.5 };
const TOP_N = 10; // the report context uses the top 10 ranked investigations (SPEC module 5)
const DEFAULT_FLOW = 10; // only the slider's starting position when the user switches flow on; not a habitat value

export interface LensInitial {
  habitatId: string;
  material: MaterialClass;
  o2: number | null;
  kpa: number | null;
  flow: number | null;
}

const clamp = (v: number, r: { min: number; max: number }) => Math.min(r.max, Math.max(r.min, v));

function writeUrl(habitat: string, c: Conditions, custom: boolean) {
  const params = new URLSearchParams({ habitat, material: c.material_class });
  if (custom) {
    params.set('o2', String(c.o2_mole_fraction));
    params.set('p', String(c.pressure_kpa));
  }
  if (c.flow_cm_s !== null) params.set('flow', String(c.flow_cm_s));
  window.history.replaceState(null, '', `${window.location.pathname}?${params.toString()}`);
}

// ---- mini flammability map: oxygen against flow for one material class ----

const MW = 520;
const MH = 300;
const MM = { top: 14, right: 16, bottom: 42, left: 48 };

function MiniMap({ points, target }: { points: FlammabilityPoint[]; target: Conditions }) {
  const withFlow = points.filter((p) => p.flow_cm_s !== null);
  const noFlow = points.length - withFlow.length;
  if (withFlow.length === 0) {
    return <p className="muted small">No test runs with a reported flow for this material class.</p>;
  }
  const o2s = [...withFlow.map((p) => p.o2_mole_fraction), target.o2_mole_fraction];
  const flows = [...withFlow.map((p) => p.flow_cm_s as number), target.flow_cm_s ?? 0];
  const x = scaleLinear()
    .domain([Math.min(...o2s) - 0.02, Math.max(...o2s) + 0.02])
    .range([MM.left, MW - MM.right]);
  const y = scaleLinear()
    .domain([0, Math.max(...flows, 1) * 1.08])
    .range([MH - MM.bottom, MM.top]);
  const r2 = (v: number) => Math.round(v * 100) / 100;
  const color = PHASE_COLOR[classPhase(target.material_class)];
  const tx = r2(x(target.o2_mole_fraction));
  return (
    <figure className="figure">
      <svg
        viewBox={`0 0 ${MW} ${MH}`}
        role="img"
        aria-label={`Oxygen against flow speed for ${withFlow.length} test runs of this material class, with the target atmosphere marked`}
      >
        {x.ticks(6).map((t) => (
          <g key={`x${t}`}>
            <line x1={r2(x(t))} x2={r2(x(t))} y1={MM.top} y2={MH - MM.bottom} stroke="var(--border)" />
            <text x={r2(x(t))} y={MH - MM.bottom + 16} textAnchor="middle" className="chart-tick" fill="var(--text-faint)">
              {formatPercent(t)}
            </text>
          </g>
        ))}
        {y.ticks(5).map((t) => (
          <g key={`y${t}`}>
            <line x1={MM.left} x2={MW - MM.right} y1={r2(y(t))} y2={r2(y(t))} stroke="var(--border)" />
            <text x={MM.left - 8} y={r2(y(t)) + 4} textAnchor="end" className="chart-tick" fill="var(--text-faint)">
              {t}
            </text>
          </g>
        ))}
        <text x={(MM.left + MW - MM.right) / 2} y={MH - 6} textAnchor="middle" className="chart-axis" fill="var(--text-muted)">
          Oxygen (mole fraction, %)
        </text>
        <text
          transform={`translate(13 ${(MM.top + MH - MM.bottom) / 2}) rotate(-90)`}
          textAnchor="middle"
          className="chart-axis"
          fill="var(--text-muted)"
        >
          Flow (cm/s)
        </text>

        <g stroke="var(--text)" strokeDasharray="3 4" opacity="0.5">
          <line x1={tx} x2={tx} y1={MM.top} y2={MH - MM.bottom} />
          {target.flow_cm_s !== null && (
            <line x1={MM.left} x2={MW - MM.right} y1={r2(y(target.flow_cm_s))} y2={r2(y(target.flow_cm_s))} />
          )}
        </g>

        <g opacity="0.8">
          {withFlow.map((p) => (
            <g key={p.id}>
              <OutcomeMark outcome={p.outcome} cx={r2(x(p.o2_mole_fraction))} cy={r2(y(p.flow_cm_s as number))} color={color} />
              <title>{`${p.material}, ${p.psi_id}: ${formatPercent(p.o2_mole_fraction)} O2, ${p.flow_cm_s} cm/s, ${formatKpa(p.pressure_kpa)}, ${OUTCOME_LABEL[p.outcome].toLowerCase()}`}</title>
            </g>
          ))}
        </g>

        {target.flow_cm_s !== null && (
          <path
            d={`M${tx} ${r2(y(target.flow_cm_s)) - 8} l8 8 l-8 8 l-8 -8 Z`}
            fill="var(--text)"
            stroke="var(--bg)"
            strokeWidth="1.5"
          />
        )}
      </svg>
      <figcaption>
        <div className="legend">
          {OUTCOMES.map((o) => (
            <span key={o}>
              <svg viewBox="0 0 12 12" aria-hidden="true">
                <OutcomeMark outcome={o} cx={6} cy={6} color="var(--text-muted)" />
              </svg>
              {OUTCOME_LABEL[o]} ({withFlow.filter((p) => p.outcome === o).length})
            </span>
          ))}
        </div>
        <div>
          Test runs of this material class at any pressure; pressure is not shown here. The dashed line is the target
          oxygen level{target.flow_cm_s === null ? ' (no flow set, so no flow line)' : ' and flow'}.
          {noFlow > 0 && ` ${plural(noFlow, 'test run')} without a reported flow not shown.`}
        </div>
      </figcaption>
    </figure>
  );
}

// ---- optional fields of the hybrid predictor (module 4b). Read defensively: shown only when present. ----

interface PhysicsLike {
  t_ad_k?: number;
  fuel_model?: string;
  surrogate?: boolean;
  limit_k?: number | null;
  margin_k?: number | null;
  margin_ratio_vs_iss?: number | null;
  valid?: boolean;
  note?: string;
}
const MODE_LABEL: Record<string, string> = {
  data: 'Based on nearest test runs',
  physics_only: 'Outside the tested envelope: physics estimate only',
  none: 'No test data and no physics estimate',
};

function ModePanel({ prediction }: { prediction: Prediction }) {
  const extra = prediction as Prediction & { mode?: string; physics?: PhysicsLike };
  if (!extra.mode && !extra.physics) return null;
  const ph = extra.physics;
  const k = (v: number | null | undefined) => (typeof v === 'number' && Number.isFinite(v) ? `${Math.round(v)} K` : 'n/a');
  return (
    <div className="card card-stack">
      {extra.mode && <span className="tag">{MODE_LABEL[extra.mode] ?? extra.mode}</span>}
      {ph && ph.valid !== false && typeof ph.t_ad_k === 'number' && (
        <>
          <div className="habitat-values">
            <div>
              <span className="num">{k(ph.t_ad_k)}</span>
              <small>adiabatic flame temperature{ph.fuel_model ? ` (${ph.fuel_model}${ph.surrogate ? ', surrogate' : ''})` : ''}</small>
            </div>
            <div>
              <span className="num">{k(ph.limit_k)}</span>
              <small>limit temperature</small>
            </div>
            <div>
              <span className="num">{k(ph.margin_k)}</span>
              <small>margin above the limit</small>
            </div>
          </div>
          {typeof ph.margin_ratio_vs_iss === 'number' && (
            <p className="muted small">Margin is {formatNumber(ph.margin_ratio_vs_iss)} times the margin in ISS air.</p>
          )}
        </>
      )}
      {ph?.note && <p className="muted small">{ph.note}</p>}
    </div>
  );
}

export function LensWorkbench({
  habitats,
  investigations,
  points,
  initial,
  cachedReports,
}: {
  habitats: Habitat[];
  investigations: Investigation[];
  points: FlammabilityPoint[];
  initial: LensInitial;
  /** Pre-generated report per habitat ID, shown before any request is made. */
  cachedReports: Partial<Record<string, ReportResponse>>;
}) {
  const [habitatId, setHabitatId] = useState(initial.habitatId);
  const habitat = habitats.find((h) => h.id === habitatId) ?? habitats[0];
  const [o2, setO2] = useState(initial.o2 ?? habitat.o2_mole_fraction);
  const [kpa, setKpa] = useState(initial.kpa ?? habitat.pressure_kpa);
  const [flow, setFlow] = useState<number | null>(initial.flow ?? habitat.flow_cm_s);
  const [material, setMaterial] = useState<MaterialClass>(initial.material);
  const [showAll, setShowAll] = useState(false);

  const conditions: Conditions = useMemo(
    () => ({
      o2_mole_fraction: o2,
      pressure_kpa: kpa,
      flow_cm_s: flow,
      material_class: material,
      gravity_g: habitat.gravity_g,
    }),
    [o2, kpa, flow, material, habitat.gravity_g],
  );
  const custom = o2 !== habitat.o2_mole_fraction || kpa !== habitat.pressure_kpa;

  const ranked = useMemo(() => rankInvestigations(conditions, investigations), [conditions, investigations]);
  const prediction = useMemo(() => predict(conditions, points), [conditions, points]);
  const byId = useMemo(() => new Map(investigations.map((i) => [i.psi_id, i])), [investigations]);
  const pointById = useMemo(() => new Map(points.map((p) => [p.id, p])), [points]);
  const classPoints = useMemo(() => points.filter((p) => p.material_class === material), [points, material]);
  const materials = Object.keys(MATERIAL_LABEL) as MaterialClass[];
  const names = useMemo(
    () => Object.fromEntries(investigations.map((i) => [i.psi_id, investigationName(i)])),
    [investigations],
  );

  const apply = (next: Partial<{ habitatId: string; o2: number; kpa: number; flow: number | null; material: MaterialClass }>) => {
    const h = habitats.find((x) => x.id === (next.habitatId ?? habitatId)) ?? habitat;
    const c: Conditions = {
      o2_mole_fraction: next.o2 ?? o2,
      pressure_kpa: next.kpa ?? kpa,
      flow_cm_s: next.flow !== undefined ? next.flow : flow,
      material_class: next.material ?? material,
      gravity_g: h.gravity_g,
    };
    if (next.habitatId !== undefined) setHabitatId(next.habitatId);
    if (next.o2 !== undefined) setO2(next.o2);
    if (next.kpa !== undefined) setKpa(next.kpa);
    if (next.flow !== undefined) setFlow(next.flow);
    if (next.material !== undefined) setMaterial(next.material);
    writeUrl(h.id, c, c.o2_mole_fraction !== h.o2_mole_fraction || c.pressure_kpa !== h.pressure_kpa);
  };
  const pickHabitat = (h: Habitat) =>
    apply({ habitatId: h.id, o2: h.o2_mole_fraction, kpa: h.pressure_kpa, flow: h.flow_cm_s });

  return (
    <>
      <header className="page-head">
        <span className="eyebrow">Habitat Lens</span>
        <h1>
          {habitat.name}
          {custom && <span className="lens-custom"> · adjusted</span>}
        </h1>
        <p className="lead">
          Which investigations matter most for this atmosphere, and what the test data says about a fire in it.
          {habitat.is_assumption && ' The values for this habitat are a scenario, not a sourced specification.'}
        </p>
        <div className="chips" role="group" aria-label="Habitat presets">
          {habitats.map((h) => (
            <button
              key={h.id}
              type="button"
              className="chip"
              aria-pressed={h.id === habitat.id && !custom}
              onClick={() => pickHabitat(h)}
            >
              {HABITAT_SHORT[h.id] ?? h.name}
            </button>
          ))}
        </div>
      </header>

      <section className="lens-deck section" aria-label="Adjust the atmosphere">
        <div className="lens-slider">
          <label htmlFor="lens-o2">
            Oxygen <span className="num">{formatPercent(o2)}</span>
          </label>
          <input
            id="lens-o2"
            type="range"
            {...O2_RANGE}
            value={clamp(o2, O2_RANGE)}
            onChange={(e) => apply({ o2: Number(e.target.value) })}
          />
        </div>
        <div className="lens-slider">
          <label htmlFor="lens-p">
            Pressure{' '}
            <span className="num">
              {formatKpa(kpa)} <span className="muted">({formatPsi(kpa)})</span>
            </span>
          </label>
          <input
            id="lens-p"
            type="range"
            {...P_RANGE}
            value={clamp(kpa, P_RANGE)}
            onChange={(e) => apply({ kpa: Number(e.target.value) })}
          />
        </div>
        <div className="lens-slider">
          <label htmlFor="lens-flow">
            Ventilation flow <span className="num">{flow === null ? 'not set' : `${flow} cm/s`}</span>
          </label>
          <input
            id="lens-flow"
            type="range"
            {...FLOW_RANGE}
            value={flow ?? 0}
            disabled={flow === null}
            onChange={(e) => apply({ flow: Number(e.target.value) })}
          />
          <label className="lens-check">
            <input
              type="checkbox"
              checked={flow !== null}
              onChange={(e) => apply({ flow: e.target.checked ? DEFAULT_FLOW : null })}
            />
            Set a flow speed (no sourced value for this habitat)
          </label>
        </div>
        <div className="lens-slider lens-fixed">
          <span className="lens-label">
            Gravity <span className="num">{Number(habitat.gravity_g.toFixed(3))} g</span>
          </span>
          <span className="lens-hint">Set by the habitat preset. No test run in the dataset is at partial gravity.</span>
        </div>
        <div className="lens-slider lens-material">
          <span className="lens-label" id="lens-mat">
            Material class
          </span>
          <div className="filter-options" role="group" aria-labelledby="lens-mat">
            {materials.map((m) => (
              <button key={m} type="button" className="chip" aria-pressed={m === material} onClick={() => apply({ material: m })}>
                {MATERIAL_LABEL[m]}
              </button>
            ))}
          </div>
        </div>
        {custom && (
          <div className="lens-reset">
            <span className="muted small">
              Adjusted from the {HABITAT_SHORT[habitat.id] ?? habitat.name} preset ({formatPercent(habitat.o2_mole_fraction)} O2,{' '}
              {formatKpa(habitat.pressure_kpa)}). Gravity stays at {Number(habitat.gravity_g.toFixed(3))} g.
            </span>
            <button type="button" className="btn" onClick={() => pickHabitat(habitat)}>
              Reset to preset
            </button>
          </div>
        )}
      </section>

      <p className="card-foot lens-source">
        Atmosphere source: {SOURCE_LABEL[habitat.prov.source_type] ?? habitat.prov.source_type}
        {sourceHref(habitat.prov.source_ref.url) && (
          <>
            ,{' '}
            <a href={sourceHref(habitat.prov.source_ref.url)} target="_blank" rel="noreferrer">
              open source
            </a>
          </>
        )}
        {habitat.prov.verified ? '' : ' (not yet human-verified)'}
      </p>

      <div className="split split-wide-first section">
        <section className="card-stack" aria-labelledby="predictor-h">
          <h2 id="predictor-h">Fire risk predictor</h2>
          <p className="muted small" style={{ margin: 0 }}>
            Evidence-based estimate from the nearest test runs, not a certified model.
          </p>
          <PredictionCard prediction={prediction} />
          <ModePanel prediction={prediction} />

          <div className="card card-stack">
            <h3 className="lens-h3">Evidence: nearest test runs</h3>
            {prediction.evidence.length === 0 ? (
              <p className="muted">No test runs support a prediction for these conditions.</p>
            ) : (
              <div className="table-scroll">
                <table className="gapmap-table">
                  <thead>
                    <tr>
                      <th scope="col">Test run</th>
                      <th scope="col">Material</th>
                      <th scope="col">O2</th>
                      <th scope="col">Pressure</th>
                      <th scope="col">Flow</th>
                      <th scope="col">Outcome</th>
                      <th scope="col">Distance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {prediction.evidence.map((e) => {
                      const p = pointById.get(e.point_id);
                      const href = sourceHref(p?.prov.source_ref.url);
                      return (
                        <tr key={e.point_id}>
                          <th scope="row">
                            <Link href={`/investigations/${encodeURIComponent(e.psi_id)}`}>
                              {investigationName(byId.get(e.psi_id), e.psi_id)}
                            </Link>{' '}
                            <span className="muted">#{p?.test_id ?? e.point_id}</span>
                            {href && (
                              <>
                                {' '}
                                <a href={href} target="_blank" rel="noreferrer" className="muted">
                                  source
                                </a>
                              </>
                            )}
                          </th>
                          <td className="wrap">{p?.material ?? 'not reported'}</td>
                          <td>{p ? formatPercent(p.o2_mole_fraction) : 'n/a'}</td>
                          <td>{p ? formatKpa(p.pressure_kpa) : 'n/a'}</td>
                          <td>{p?.flow_cm_s == null ? 'not reported' : `${p.flow_cm_s} cm/s`}</td>
                          <td>{OUTCOME_LABEL[e.outcome] ?? e.outcome}</td>
                          <td>{formatNumber(e.distance)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            <p className="muted small">Distance is the normalized distance in condition space used by the predictor; 0 is an identical condition.</p>
          </div>

          {prediction.suppression_notes.length > 0 && (
            <div className="card card-stack">
              <h3 className="lens-h3">Suppression findings</h3>
              <ul className="lens-notes">
                {prediction.suppression_notes.map((n) => {
                  const href = sourceHref(n.prov.source_ref.url);
                  return (
                    <li key={`${n.psi_id}${n.text}`}>
                      {n.text} <Link href={`/investigations/${encodeURIComponent(n.psi_id)}`}>{investigationName(byId.get(n.psi_id), n.psi_id)}</Link>
                      {href && (
                        <>
                          {' · '}
                          <a href={href} target="_blank" rel="noreferrer">
                            source
                          </a>
                        </>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          <div className="card-stack">
            <h3 className="lens-h3">{MATERIAL_LABEL[material] ?? material}: oxygen against flow</h3>
            <MiniMap points={classPoints} target={conditions} />
          </div>
        </section>

        <section className="card-stack" aria-labelledby="ranked-h">
          <h2 id="ranked-h">Most relevant investigations</h2>
          <RankedList ranked={showAll ? ranked : ranked.slice(0, TOP_N)} lookup={(id) => byId.get(id)} />
          {ranked.length > TOP_N && (
            <button type="button" className="btn" onClick={() => setShowAll((v) => !v)} aria-expanded={showAll}>
              {showAll ? `Show the top ${TOP_N} only` : `Show all ${ranked.length} investigations`}
            </button>
          )}
        </section>
      </div>

      <ReportPanel
        // A different habitat has its own pre-generated report: start the panel again.
        key={habitat.id}
        conditions={conditions}
        habitatId={habitat.id}
        presetConditions={!custom && flow === habitat.flow_cm_s}
        cached={cachedReports[habitat.id]}
        names={names}
      />
    </>
  );
}
