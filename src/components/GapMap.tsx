'use client';

// Role B. Coverage and gap map (docs/SPEC.md module 3): oxygen against pressure.
// Rectangles = the tested O2 and pressure range each investigation reports, dots = individual test runs,
// diamonds = habitat atmospheres. Every number is passed in from '@/lib/data'; nothing is hard-coded here.
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { scaleLinear, scaleLog } from 'd3-scale';
import {
  FUEL_LABEL,
  formatKpa,
  formatPercent,
  formatPsi,
  HABITAT_SHORT,
  MATERIAL_LABEL,
  plural,
} from '@/components/format';
import type { FuelPhase, Habitat, MaterialClass, Outcome, Range } from '@/lib/types';

export interface MapInvestigation {
  psi_id: string;
  name: string;
  phases: FuelPhase[];
  o2: Range | null;
  pressure: Range | null;
}

export interface MapPoint {
  id: string;
  psi_id: string;
  material: string;
  material_class: MaterialClass;
  o2: number;
  kpa: number;
  flow: number | null;
  outcome: Outcome;
}

const W = 860;
const H = 520;
const M = { top: 20, right: 58, bottom: 48, left: 56 };
const O2_DOMAIN: [number, number] = [0.1, 0.42];
const P_DOMAIN: [number, number] = [25, 550];
const O2_TICKS = [0.1, 0.15, 0.2, 0.25, 0.3, 0.35, 0.4];
const P_TICKS = [30, 50, 100, 200, 400];
const PSI_TICKS = [5, 10, 14.7, 30, 60];
const KPA_PER_PSI = 6.894757;

const xScale = scaleLinear().domain(O2_DOMAIN).range([M.left, W - M.right]);
const yScale = scaleLog().domain(P_DOMAIN).range([H - M.bottom, M.top]);
// Rounded so the server-rendered and client-rendered coordinates are the same string (log() differs in the last digit).
const x = (v: number) => Math.round(xScale(v) * 100) / 100;
const y = (v: number) => Math.round(yScale(v) * 100) / 100;

const PHASE_COLOR: Record<FuelPhase, string> = {
  solid: 'var(--accent)',
  liquid: 'var(--info)',
  gas: 'var(--gas)',
};

const OUTCOME_LABEL: Record<Outcome, string> = {
  sustained: 'Sustained burning',
  marginal: 'Marginal',
  extinguished: 'Extinguished',
  no_ignition: 'No ignition',
};
const OUTCOMES: Outcome[] = ['sustained', 'marginal', 'extinguished', 'no_ignition'];

function classPhase(cls: MaterialClass): FuelPhase {
  if (cls === 'liquid_droplet') return 'liquid';
  if (cls === 'gas_jet') return 'gas';
  return 'solid';
}

function materialLabel(cls: MaterialClass): string {
  return MATERIAL_LABEL[cls] ?? cls;
}

function hasRange(r: Range | null): r is { min: number; max: number } {
  return r !== null && r.min !== null && r.max !== null;
}

function inView(o2: number, kpa: number): boolean {
  return o2 >= O2_DOMAIN[0] && o2 <= O2_DOMAIN[1] && kpa >= P_DOMAIN[0] && kpa <= P_DOMAIN[1];
}

function clampTo(v: number, [lo, hi]: [number, number]): number {
  return Math.min(hi, Math.max(lo, v));
}

function formatRange(r: Range | null, fmt: (n: number) => string): string {
  if (!hasRange(r)) return 'not reported';
  return r.min === r.max ? fmt(r.min) : `${fmt(r.min)} to ${fmt(r.max)}`;
}

/** One mark per outcome, so the outcome reads without relying on colour. */
function OutcomeMark({ outcome, cx, cy, color }: { outcome: Outcome; cx: number; cy: number; color: string }) {
  if (outcome === 'sustained') return <circle cx={cx} cy={cy} r="3.2" fill={color} />;
  if (outcome === 'marginal') {
    return <path d={`M${cx} ${cy - 4.4} L${cx + 4.2} ${cy + 3.2} L${cx - 4.2} ${cy + 3.2} Z`} fill={color} />;
  }
  if (outcome === 'extinguished') {
    return <circle cx={cx} cy={cy} r="3.4" fill="var(--surface)" stroke={color} strokeWidth="1.6" />;
  }
  return (
    <path
      d={`M${cx - 3.4} ${cy - 3.4} L${cx + 3.4} ${cy + 3.4} M${cx + 3.4} ${cy - 3.4} L${cx - 3.4} ${cy + 3.4}`}
      stroke={color}
      strokeWidth="1.8"
      fill="none"
    />
  );
}

function writeUrl(habitat: string, material: string) {
  const params = new URLSearchParams();
  params.set('habitat', habitat);
  if (material) params.set('material', material);
  window.history.replaceState(null, '', `${window.location.pathname}?${params.toString()}`);
}

export function GapMap({
  investigations,
  points,
  habitats,
  initialHabitat,
  initialMaterial,
  partialGravityNote,
}: {
  investigations: MapInvestigation[];
  points: MapPoint[];
  habitats: Habitat[];
  initialHabitat: string;
  initialMaterial: string;
  /** Sourced wording for the partial-gravity gap (role C constant). */
  partialGravityNote: string;
}) {
  const [habitatId, setHabitatId] = useState(initialHabitat);
  const [material, setMaterial] = useState(initialMaterial);
  const [activeInv, setActiveInv] = useState<string | null>(null);

  const focus = habitats.find((h) => h.id === habitatId) ?? habitats[0];
  const classes = useMemo(() => Array.from(new Set(points.map((p) => p.material_class))), [points]);
  const materialClass = classes.find((c) => c === material) ?? null;
  const phaseFilter = materialClass ? classPhase(materialClass) : null;

  const pickHabitat = (id: string) => {
    setHabitatId(id);
    writeUrl(id, materialClass ?? '');
  };
  const pickMaterial = (cls: string) => {
    setMaterial(cls);
    writeUrl(focus.id, cls);
  };

  // Investigations: drawn only when both ranges are reported.
  const drawn = investigations.filter((i) => hasRange(i.o2) && hasRange(i.pressure));
  const notDrawn = investigations.filter((i) => !(hasRange(i.o2) && hasRange(i.pressure)));
  const visibleRects = drawn.filter((i) => !phaseFilter || i.phases.includes(phaseFilter));
  const covers = (i: MapInvestigation) =>
    hasRange(i.o2) &&
    hasRange(i.pressure) &&
    focus.o2_mole_fraction >= i.o2.min &&
    focus.o2_mole_fraction <= i.o2.max &&
    focus.pressure_kpa >= i.pressure.min &&
    focus.pressure_kpa <= i.pressure.max;
  const covering = drawn.filter(covers);

  const shownPoints = points.filter((p) => (!materialClass || p.material_class === materialClass) && inView(p.o2, p.kpa));
  const pointsOutside = points.filter((p) => !inView(p.o2, p.kpa)).length;

  // Habitats that share an atmosphere are drawn as one marker with a joined label.
  const groups = useMemo(() => {
    const map = new Map<string, Habitat[]>();
    for (const h of habitats) {
      const key = `${h.o2_mole_fraction}|${h.pressure_kpa}`;
      map.set(key, [...(map.get(key) ?? []), h]);
    }
    return Array.from(map.values()).sort((a, b) => a[0].o2_mole_fraction - b[0].o2_mole_fraction);
  }, [habitats]);
  const offChart = habitats.filter((h) => !inView(h.o2_mole_fraction, h.pressure_kpa));
  const focusInView = inView(focus.o2_mole_fraction, focus.pressure_kpa);
  const fx = x(clampTo(focus.o2_mole_fraction, O2_DOMAIN));
  const fy = y(clampTo(focus.pressure_kpa, P_DOMAIN));

  // Per material class: what the test runs say about the selected atmosphere. Counts only, no interpolation.
  const classRows = classes.map((cls) => {
    const own = points.filter((p) => p.material_class === cls);
    const o2s = own.map((p) => p.o2);
    const kpas = own.map((p) => p.kpa);
    return {
      cls,
      n: own.length,
      o2Min: Math.min(...o2s),
      o2Max: Math.max(...o2s),
      kpaMin: Math.min(...kpas),
      kpaMax: Math.max(...kpas),
      atOrAbove: own.filter((p) => p.o2 >= focus.o2_mole_fraction).length,
      atOrBelow: own.filter((p) => p.kpa <= focus.pressure_kpa).length,
    };
  });

  const sameAtmosphere = habitats.filter(
    (h) => h.o2_mole_fraction === focus.o2_mole_fraction && h.pressure_kpa === focus.pressure_kpa && h.id !== focus.id,
  );

  return (
    <div className="gapmap">
      <div className="filters card">
        <div className="filter-group">
          <span className="filter-label">Habitat atmosphere</span>
          <div className="filter-options">
            {habitats.map((h) => (
              <button
                key={h.id}
                type="button"
                className="chip"
                aria-pressed={h.id === focus.id}
                onClick={() => pickHabitat(h.id)}
              >
                {HABITAT_SHORT[h.id] ?? h.name}
              </button>
            ))}
          </div>
        </div>
        <div className="filter-group">
          <span className="filter-label">Material class</span>
          <div className="filter-options">
            <button type="button" className="chip" aria-pressed={materialClass === null} onClick={() => pickMaterial('')}>
              All
            </button>
            {classes.map((cls) => (
              <button
                key={cls}
                type="button"
                className="chip"
                aria-pressed={materialClass === cls}
                onClick={() => pickMaterial(cls)}
              >
                {materialLabel(cls)}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="gapmap-body">
        <figure className="figure gapmap-figure">
          <svg
            viewBox={`0 0 ${W} ${H}`}
            role="img"
            aria-label={`Oxygen against pressure: tested ranges of ${drawn.length} investigations, ${shownPoints.length} test runs, and the ${focus.name} atmosphere at ${formatPercent(focus.o2_mole_fraction)} oxygen and ${formatKpa(focus.pressure_kpa)}`}
          >
            {/* grid and axes */}
            {O2_TICKS.map((t) => (
              <g key={`x${t}`}>
                <line x1={x(t)} x2={x(t)} y1={M.top} y2={H - M.bottom} stroke="var(--border)" />
                <text x={x(t)} y={H - M.bottom + 17} textAnchor="middle" className="chart-tick" fill="var(--text-faint)">
                  {formatPercent(t)}
                </text>
              </g>
            ))}
            {P_TICKS.map((t) => (
              <g key={`y${t}`}>
                <line x1={M.left} x2={W - M.right} y1={y(t)} y2={y(t)} stroke="var(--border)" />
                <text x={M.left - 8} y={y(t) + 4} textAnchor="end" className="chart-tick" fill="var(--text-faint)">
                  {t}
                </text>
              </g>
            ))}
            {PSI_TICKS.map((t) => (
              <g key={`psi${t}`}>
                <line x1={W - M.right} x2={W - M.right + 5} y1={y(t * KPA_PER_PSI)} y2={y(t * KPA_PER_PSI)} stroke="var(--border-strong)" />
                <text x={W - M.right + 9} y={y(t * KPA_PER_PSI) + 4} className="chart-tick" fill="var(--text-faint)">
                  {t}
                </text>
              </g>
            ))}
            <text x={(M.left + W - M.right) / 2} y={H - 8} textAnchor="middle" className="chart-axis" fill="var(--text-muted)">
              Oxygen (mole fraction, %)
            </text>
            <text
              transform={`translate(14 ${(M.top + H - M.bottom) / 2}) rotate(-90)`}
              textAnchor="middle"
              className="chart-axis"
              fill="var(--text-muted)"
            >
              Pressure (kPa, log scale)
            </text>
            <text
              transform={`translate(${W - 8} ${(M.top + H - M.bottom) / 2}) rotate(90)`}
              textAnchor="middle"
              className="chart-axis"
              fill="var(--text-muted)"
            >
              psi
            </text>

            {/* tested ranges, one rectangle per investigation */}
            {visibleRects.map((i) => {
              if (!hasRange(i.o2) || !hasRange(i.pressure)) return null;
              const x0 = x(clampTo(i.o2.min, O2_DOMAIN));
              const x1 = x(clampTo(i.o2.max, O2_DOMAIN));
              const yTop = y(clampTo(i.pressure.max, P_DOMAIN));
              const yBottom = y(clampTo(i.pressure.min, P_DOMAIN));
              // A single reported pressure still needs a visible band.
              const h = Math.max(yBottom - yTop, 5);
              const color = PHASE_COLOR[i.phases[0] ?? 'solid'];
              const active = activeInv === i.psi_id;
              const dim = activeInv !== null && !active;
              return (
                <rect
                  key={i.psi_id}
                  className="gapmap-rect"
                  x={x0}
                  y={yBottom - h}
                  width={Math.max(x1 - x0, 5)}
                  height={h}
                  rx="3"
                  fill={color}
                  stroke={color}
                  fillOpacity={active ? 0.28 : dim ? 0.03 : 0.1}
                  strokeOpacity={active ? 1 : dim ? 0.2 : 0.55}
                  strokeWidth={active ? 2 : 1}
                  onMouseEnter={() => setActiveInv(i.psi_id)}
                  onMouseLeave={() => setActiveInv(null)}
                >
                  <title>{`${i.name} (${i.psi_id}): ${formatRange(i.o2, formatPercent)} O2, ${formatRange(i.pressure, formatKpa)}`}</title>
                </rect>
              );
            })}

            {/* crosshair for the selected atmosphere, under the data */}
            {focusInView && (
              <g stroke="var(--text)" strokeDasharray="3 4" opacity="0.45" pointerEvents="none">
                <line x1={fx} x2={fx} y1={M.top} y2={H - M.bottom} />
                <line x1={M.left} x2={W - M.right} y1={fy} y2={fy} />
              </g>
            )}

            {/* individual test runs */}
            <g opacity={activeInv ? 0.9 : 0.75}>
              {shownPoints.map((p) => (
                <g key={p.id} opacity={activeInv && activeInv !== p.psi_id ? 0.15 : 1}>
                  <OutcomeMark outcome={p.outcome} cx={x(p.o2)} cy={y(p.kpa)} color={PHASE_COLOR[classPhase(p.material_class)]} />
                  <title>{`${p.material} (${materialLabel(p.material_class)}), ${p.psi_id}: ${formatPercent(p.o2)} O2, ${formatKpa(p.kpa)}, ${p.flow === null ? 'flow not reported' : `${p.flow} cm/s`}, ${OUTCOME_LABEL[p.outcome].toLowerCase()}`}</title>
                </g>
              ))}
            </g>

            {/* habitat atmospheres */}
            {groups.map((group, index) => {
              const h = group[0];
              if (!inView(h.o2_mole_fraction, h.pressure_kpa)) return null;
              const hx = x(h.o2_mole_fraction);
              const hy = y(h.pressure_kpa);
              const selected = group.some((g) => g.id === focus.id);
              const names = group.map((g) => HABITAT_SHORT[g.id] ?? g.name);
              const label = selected
                ? [HABITAT_SHORT[focus.id] ?? focus.name, ...names.filter((n) => n !== (HABITAT_SHORT[focus.id] ?? focus.name))].join(', ')
                : names.length > 1
                  ? `${names[0]} +${names.length - 1}`
                  : names[0];
              const r = selected ? 8 : 6;
              return (
                <g key={h.id} className="gapmap-habitat" onClick={() => pickHabitat(selected ? focus.id : h.id)}>
                  {selected && <circle cx={hx} cy={hy} r="15" fill="none" stroke="var(--text)" strokeWidth="1.2" opacity="0.5" />}
                  <path
                    d={`M${hx} ${hy - r} L${hx + r} ${hy} L${hx} ${hy + r} L${hx - r} ${hy} Z`}
                    fill={selected ? 'var(--text)' : 'var(--bg)'}
                    stroke="var(--text)"
                    strokeWidth="1.6"
                  />
                  <text
                    x={hx}
                    y={selected ? hy - 22 : hy + 20 + (index % 2) * 14}
                    textAnchor="middle"
                    className={selected ? 'chart-label' : 'chart-sublabel'}
                    fill={selected ? 'var(--text)' : 'var(--text-muted)'}
                    stroke="var(--surface)"
                    strokeWidth="4"
                    strokeLinejoin="round"
                    style={{ paintOrder: 'stroke' }}
                  >
                    {label}
                  </text>
                  <title>{`${group.map((g) => g.name).join(', ')}: ${formatPercent(h.o2_mole_fraction)} O2, ${formatKpa(h.pressure_kpa)} (${formatPsi(h.pressure_kpa)})`}</title>
                </g>
              );
            })}
          </svg>

          <figcaption>
            <div className="legend">
              {(Object.keys(PHASE_COLOR) as FuelPhase[]).map((phase) => (
                <span key={phase} style={{ color: PHASE_COLOR[phase] }}>
                  <i className="swatch" /> {FUEL_LABEL[phase]}
                </span>
              ))}
              <span>◆ Habitat atmosphere</span>
            </div>
            <div className="legend">
              {OUTCOMES.map((o) => (
                <span key={o}>
                  <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true">
                    <OutcomeMark outcome={o} cx={6} cy={6} color="var(--text-muted)" />
                  </svg>
                  {OUTCOME_LABEL[o]} ({shownPoints.filter((p) => p.outcome === o).length})
                </span>
              ))}
            </div>
            <div>
              Each rectangle spans the oxygen and pressure range one investigation reports; it is a bounding box, and not
              every combination inside it was tested. Marks are individual test runs. Flow speed is not shown on this
              chart.
              {pointsOutside > 0 && ` ${plural(pointsOutside, 'test run')} outside the chart area.`}
              {offChart.length > 0 &&
                ` Off the chart: ${offChart.map((h) => `${HABITAT_SHORT[h.id] ?? h.name} (${formatPercent(h.o2_mole_fraction)} O2, ${formatKpa(h.pressure_kpa)})`).join(', ')}.`}
            </div>
          </figcaption>
        </figure>

        <aside className="gapmap-side">
          <section className="card">
            <span className="eyebrow">Selected atmosphere</span>
            <h2 className="gapmap-title">{focus.name}</h2>
            <p className="gapmap-readout">
              {formatPercent(focus.o2_mole_fraction)} O2 · {formatKpa(focus.pressure_kpa)}{' '}
              <span className="muted">({formatPsi(focus.pressure_kpa)})</span> · {focus.gravity_g} g
            </p>
            {focus.is_assumption && <p className="muted small">Scenario values, not a sourced specification.</p>}
            {sameAtmosphere.length > 0 && (
              <p className="muted small">
                Same oxygen and pressure as {sameAtmosphere.map((h) => HABITAT_SHORT[h.id] ?? h.name).join(', ')}.
              </p>
            )}
            <Link href={`/lens?habitat=${focus.id}`} className="btn gapmap-cta">
              Open in Habitat Lens
            </Link>
          </section>

          <section className="card">
            <h3>Investigations whose tested range includes it</h3>
            {covering.length === 0 ? (
              <p className="muted">
                No investigation reports a tested oxygen and pressure range that includes this atmosphere.
              </p>
            ) : (
              <ul className="gapmap-list">
                {covering.map((i) => (
                  <li
                    key={i.psi_id}
                    onMouseEnter={() => setActiveInv(i.psi_id)}
                    onMouseLeave={() => setActiveInv(null)}
                    data-active={activeInv === i.psi_id}
                  >
                    <i className="swatch" style={{ color: PHASE_COLOR[i.phases[0] ?? 'solid'] }} />
                    <Link href={`/investigations/${i.psi_id}`}>{i.name}</Link>
                    <span className="muted">{i.phases.map((p) => FUEL_LABEL[p]).join(', ')}</span>
                  </li>
                ))}
              </ul>
            )}
            <p className="muted small">
              {covering.length} of {drawn.length} investigations with both ranges reported. Inside a range does not mean
              this exact atmosphere was tested.
            </p>
          </section>

        </aside>
      </div>

      <section className="gapmap-below">
        <div className="callout">
          <strong>Gravity gap.</strong> {partialGravityNote}
        </div>

        <div className="card">
          <h3>Test runs by material class, against {HABITAT_SHORT[focus.id] ?? focus.name}</h3>
          <div className="table-scroll">
            <table className="gapmap-table">
              <thead>
                <tr>
                  <th scope="col">Material class</th>
                  <th scope="col">Test runs</th>
                  <th scope="col">Oxygen tested</th>
                  <th scope="col">Pressure tested</th>
                  <th scope="col">Runs at or above {formatPercent(focus.o2_mole_fraction)} O2</th>
                  <th scope="col">Runs at or below {formatKpa(focus.pressure_kpa)}</th>
                </tr>
              </thead>
              <tbody>
                {classRows.map((row) => (
                  <tr key={row.cls}>
                    <th scope="row">{materialLabel(row.cls)}</th>
                    <td>{row.n}</td>
                    <td>{formatRange({ min: row.o2Min, max: row.o2Max }, formatPercent)}</td>
                    <td>{formatRange({ min: row.kpaMin, max: row.kpaMax }, formatKpa)}</td>
                    <td data-gap={row.atOrAbove === 0}>{row.atOrAbove === 0 ? 'none' : row.atOrAbove}</td>
                    <td data-gap={row.atOrBelow === 0}>{row.atOrBelow === 0 ? 'none' : row.atOrBelow}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="muted small">
            Counts of individual test runs in the PSI microgravity data. The two right-hand columns are counted
            separately: a run in one is not necessarily in the other.
          </p>
        </div>

        <div className="card">
          <h3>All investigations with a drawn range</h3>
          <ul className="gapmap-list gapmap-list-wide">
            {drawn.map((i) => (
              <li
                key={i.psi_id}
                onMouseEnter={() => setActiveInv(i.psi_id)}
                onMouseLeave={() => setActiveInv(null)}
                data-active={activeInv === i.psi_id}
                data-muted={phaseFilter !== null && !i.phases.includes(phaseFilter)}
              >
                <i className="swatch" style={{ color: PHASE_COLOR[i.phases[0] ?? 'solid'] }} />
                <Link href={`/investigations/${i.psi_id}`}>{i.name}</Link>
                <span className="muted">
                  {formatRange(i.o2, formatPercent)} O2 · {formatRange(i.pressure, formatKpa)}
                </span>
                {covers(i) && <span className="tag tag-accent">includes {HABITAT_SHORT[focus.id] ?? focus.name}</span>}
              </li>
            ))}
          </ul>
        </div>

        <div className="card">
          <h3>Not drawn: conditions not reported</h3>
          <p className="muted small">
            {plural(notDrawn.length, 'investigation')} without both an oxygen and a pressure range in the curated data.
          </p>
          <ul className="gapmap-list gapmap-list-wide">
            {notDrawn.map((i) => (
              <li key={i.psi_id}>
                <Link href={`/investigations/${i.psi_id}`}>{i.name}</Link>
                <span className="muted">
                  O2 {formatRange(i.o2, formatPercent)} · pressure {formatRange(i.pressure, formatKpa)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  );
}
