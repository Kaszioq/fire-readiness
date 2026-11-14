// Role B. Small O2 vs pressure chart for the home page: every curated test run plus the habitat presets.
// It is a teaser of the gap map (/map). All numbers come from '@/lib/data'; nothing is hard-coded.
import { scaleLinear, scaleLog } from 'd3-scale';
import { formatKpa, formatPercent, HABITAT_SHORT, plural, SOLID_CLASSES } from '@/components/format';
import type { FlammabilityPoint, Habitat } from '@/lib/types';

const W = 560;
const H = 380;
const M = { top: 16, right: 16, bottom: 44, left: 52 };
const O2_DOMAIN: [number, number] = [0.1, 0.42];
const P_DOMAIN: [number, number] = [25, 550];
const O2_TICKS = [0.1, 0.15, 0.2, 0.25, 0.3, 0.35, 0.4];
const P_TICKS = [30, 50, 100, 200, 400];

const x = scaleLinear().domain(O2_DOMAIN).range([M.left, W - M.right]);
const y = scaleLog().domain(P_DOMAIN).range([H - M.bottom, M.top]);

function inView(o2: number, kpa: number): boolean {
  return o2 >= O2_DOMAIN[0] && o2 <= O2_DOMAIN[1] && kpa >= P_DOMAIN[0] && kpa <= P_DOMAIN[1];
}

export function CoverageTeaser({
  points,
  habitats,
  focus,
}: {
  points: FlammabilityPoint[];
  habitats: Habitat[];
  focus: Habitat;
}) {
  const shown = points.filter((p) => inView(p.o2_mole_fraction, p.pressure_kpa));
  const isSolid = (p: FlammabilityPoint) => SOLID_CLASSES.includes(p.material_class);
  const solids = points.filter(isSolid);
  const others = points.length - solids.length;
  const solidsAtFocus = solids.filter((p) => p.o2_mole_fraction >= focus.o2_mole_fraction).length;
  const maxSolidO2 = solids.reduce((max, p) => Math.max(max, p.o2_mole_fraction), 0);

  const otherHabitats = habitats.filter((h) => h.id !== focus.id && inView(h.o2_mole_fraction, h.pressure_kpa));
  const offChart = habitats.filter((h) => !inView(h.o2_mole_fraction, h.pressure_kpa));

  const focusInView = inView(focus.o2_mole_fraction, focus.pressure_kpa);
  const fx = x(focus.o2_mole_fraction);
  const fy = y(focus.pressure_kpa);

  return (
    <figure className="figure">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`Tested oxygen and pressure conditions of ${points.length} NASA PSI test runs, with the ${focus.name} atmosphere marked`}
      >
        {/* grid and axes */}
        {O2_TICKS.map((t) => (
          <g key={`x${t}`}>
            <line x1={x(t)} x2={x(t)} y1={M.top} y2={H - M.bottom} stroke="var(--border)" strokeWidth="1" />
            <text x={x(t)} y={H - M.bottom + 16} textAnchor="middle" className="chart-tick" fill="var(--text-faint)">
              {formatPercent(t)}
            </text>
          </g>
        ))}
        {P_TICKS.map((t) => (
          <g key={`y${t}`}>
            <line x1={M.left} x2={W - M.right} y1={y(t)} y2={y(t)} stroke="var(--border)" strokeWidth="1" />
            <text x={M.left - 8} y={y(t) + 4} textAnchor="end" className="chart-tick" fill="var(--text-faint)">
              {t}
            </text>
          </g>
        ))}
        <text x={(M.left + W - M.right) / 2} y={H - 8} textAnchor="middle" className="chart-axis" fill="var(--text-muted)">
          Oxygen (mole fraction, %)
        </text>
        <text
          transform={`translate(13 ${(M.top + H - M.bottom) / 2}) rotate(-90)`}
          textAnchor="middle"
          className="chart-axis"
          fill="var(--text-muted)"
        >
          Pressure (kPa, log scale)
        </text>

        {/* focus crosshair, under the data */}
        <g className="chart-cross" display={focusInView ? undefined : 'none'} stroke="var(--accent)" strokeDasharray="3 4" opacity="0.55">
          <line x1={fx} x2={fx} y1={M.top} y2={H - M.bottom} />
          <line x1={M.left} x2={W - M.right} y1={fy} y2={fy} />
        </g>

        {/* test runs: droplets first so the solid-material runs stay visible on top */}
        {shown
          .filter((p) => !isSolid(p))
          .map((p) => (
            <circle key={p.id} cx={x(p.o2_mole_fraction)} cy={y(p.pressure_kpa)} r="2.6" fill="var(--info)" opacity="0.45" />
          ))}
        {shown.filter(isSolid).map((p) => (
          <circle key={p.id} cx={x(p.o2_mole_fraction)} cy={y(p.pressure_kpa)} r="2.8" fill="var(--accent)" opacity="0.7" />
        ))}

        {/* other habitat presets */}
        {otherHabitats.map((h) => {
          const hx = x(h.o2_mole_fraction);
          const hy = y(h.pressure_kpa);
          return (
            <path
              key={h.id}
              d={`M${hx} ${hy - 6} L${hx + 6} ${hy} L${hx} ${hy + 6} L${hx - 6} ${hy} Z`}
              fill="var(--bg)"
              stroke="var(--text)"
              strokeWidth="1.4"
            >
              <title>{`${h.name}: ${formatPercent(h.o2_mole_fraction)} O2, ${formatKpa(h.pressure_kpa)}`}</title>
            </path>
          );
        })}

        {/* focus habitat */}
        <g className="chart-focus" display={focusInView ? undefined : 'none'}>
          <circle cx={fx} cy={fy} r="11" fill="none" stroke="var(--accent)" strokeWidth="1.5" opacity="0.5" />
          <circle cx={fx} cy={fy} r="5" fill="var(--accent)" stroke="var(--bg)" strokeWidth="2" />
        </g>
        <g
          display={focusInView ? undefined : 'none'}
          textAnchor="end"
          stroke="var(--surface)"
          strokeWidth="4"
          strokeLinejoin="round"
          style={{ paintOrder: 'stroke' }}
        >
          <text x={fx - 12} y={fy + 26} className="chart-label" fill="var(--text)">
            {HABITAT_SHORT[focus.id] ?? focus.name}
          </text>
          <text x={fx - 12} y={fy + 44} className="chart-sublabel" fill="var(--text-muted)">
            {formatPercent(focus.o2_mole_fraction)} O2 · {formatKpa(focus.pressure_kpa)}
          </text>
        </g>
      </svg>

      <figcaption>
        <div className="legend">
          <span style={{ color: 'var(--accent)' }}>
            <i className="dot" /> Solid-material test runs ({solids.length})
          </span>
          <span style={{ color: 'var(--info)' }}>
            <i className="dot" /> Other test runs ({others})
          </span>
          <span>◇ Habitat presets</span>
        </div>
        <div>
          {solids.length === 0 ? (
            'No solid-material test runs in the dataset.'
          ) : (
            <>
              <strong style={{ color: 'var(--text)' }}>
                {solidsAtFocus} of {solids.length}
              </strong>{' '}
              solid-material test runs are at or above {formatPercent(focus.o2_mole_fraction)} O2. The highest oxygen
              level tested on a solid is {formatPercent(maxSolidO2)}.
            </>
          )}
          {shown.length < points.length && ` ${plural(points.length - shown.length, 'test run')} outside this chart.`}
          {offChart.length > 0 && ` Off the chart: ${offChart.map((h) => HABITAT_SHORT[h.id] ?? h.name).join(', ')}.`}
        </div>
      </figcaption>
    </figure>
  );
}
