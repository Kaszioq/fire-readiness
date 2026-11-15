// Role B. The three data sections of the home page, each with its own way of showing numbers:
// a bento of dataset figures with small charts, the habitats as instrument strips, and three entry tiles
// with a miniature of what each page shows. Everything is computed from the curated data passed in.
import Link from 'next/link';
import { scaleLinear, scaleLog } from 'd3-scale';
import { formatKpa, formatPercent, formatPsi, HABITAT_SHORT, investigationName, plural } from '@/components/format';
import type { FlammabilityPoint, Habitat, Investigation, Meta } from '@/lib/types';

const r1 = (v: number) => Math.round(v * 10) / 10;
const TIER_COLOR: Record<string, string> = { '1': 'var(--accent)', '2': 'var(--info)', '3': 'var(--neutral)' };
const SEG_COLORS = ['var(--accent)', 'var(--info)', 'var(--gas)', 'var(--ok)', 'var(--neutral)'];

// ---------- 1. Dataset in numbers ----------

export function NumbersBand({
  investigations,
  points,
  habitats,
  meta,
}: {
  investigations: Investigation[];
  points: FlammabilityPoint[];
  habitats: Habitat[];
  meta: Meta;
}) {
  const tiers = ['1', '2', '3'].map((t) => ({ tier: t, n: investigations.filter((i) => String(i.tier.value) === t).length }));
  const untiered = investigations.length - tiers.reduce((sum, t) => sum + t.n, 0);
  const sorted = [...investigations].sort((a, b) => (a.tier.value ?? 9) - (b.tier.value ?? 9));

  const byInv = Array.from(
    points.reduce((map, p) => map.set(p.psi_id, (map.get(p.psi_id) ?? 0) + 1), new Map<string, number>()),
  )
    .map(([id, n]) => ({ id, n, name: investigationName(investigations.find((i) => i.psi_id === id), id) }))
    .sort((a, b) => b.n - a.n);

  const share = meta.n_fields_total > 0 ? meta.n_fields_verified / meta.n_fields_total : 0;

  const spots = Array.from(
    habitats.reduce((map, h) => {
      const key = `${h.o2_mole_fraction}|${h.pressure_kpa}`;
      return map.set(key, [...(map.get(key) ?? []), h]);
    }, new Map<string, Habitat[]>()),
  ).map(([, group]) => group);
  const bySpotO2 = [...spots].sort((p, q) => p[0].o2_mole_fraction - q[0].o2_mole_fraction);

  return (
    <div className="numbers">
      <article className="tile tile-a">
        <span className="tile-label">Investigations</span>
        <p className="bignum">
          <span data-count>{investigations.length}</span>
        </p>
        <p className="tile-sub">NASA PSI combustion investigations in the dataset</p>
        <div className="dotgrid" aria-hidden="true">
          {sorted.map((i) => (
            <i key={i.psi_id} style={{ background: TIER_COLOR[String(i.tier.value)] ?? 'var(--border-strong)' }} />
          ))}
        </div>
        <div className="tile-legend">
          {tiers.map((t) => (
            <span key={t.tier}>
              <i style={{ background: TIER_COLOR[t.tier] }} /> tier {t.tier} <b>{t.n}</b>
            </span>
          ))}
          {untiered > 0 && (
            <span>
              <i /> no tier <b>{untiered}</b>
            </span>
          )}
        </div>
      </article>

      <article className="tile tile-b">
        <span className="tile-label">Test runs</span>
        <p className="bignum">
          <span data-count>{points.length}</span>
        </p>
        <p className="tile-sub">individual test runs from {plural(byInv.length, 'investigation')}</p>
        <div className="segbar" aria-hidden="true">
          {byInv.map((s, i) => (
            <i key={s.id} style={{ flexGrow: s.n, background: SEG_COLORS[i % SEG_COLORS.length] }} />
          ))}
        </div>
        <div className="tile-legend">
          {byInv.map((s, i) => (
            <span key={s.id}>
              <i style={{ background: SEG_COLORS[i % SEG_COLORS.length] }} /> {s.name} <b>{s.n}</b>
            </span>
          ))}
        </div>
      </article>

      <article className="tile tile-c">
        <span className="tile-label">Verified fields</span>
        <div className="ringwrap">
          <svg viewBox="0 0 120 120" aria-hidden="true">
            <circle className="ring-bg" cx="60" cy="60" r="50" pathLength="100" />
            <circle className="ring-fg" cx="60" cy="60" r="50" pathLength="100" style={{ strokeDasharray: `${r1(share * 100)} 100` }} />
          </svg>
          <p className="bignum bignum-ring">
            {formatPercent(share).replace('%', '')}
            <small>%</small>
          </p>
        </div>
        <p className="tile-sub">
          <b>
            <span data-count>{meta.n_fields_verified}</span> of {meta.n_fields_total}
          </b>{' '}
          extracted fields verified against the NASA source
        </p>
      </article>

      <article className="tile tile-d">
        <span className="tile-label">Habitat atmospheres</span>
        <p className="bignum">
          <span data-count>{habitats.length}</span>
          <small>presets, {spots.length} distinct atmospheres</small>
        </p>
        <ul className="atmos">
          {bySpotO2.map((group) => {
            const h = group[0];
            return (
              <li key={h.id}>
                <span className="atmos-dots" aria-hidden="true">
                  {group.map((g) => (
                    <i key={g.id} />
                  ))}
                </span>
                <b>{formatPercent(h.o2_mole_fraction)}</b>
                <span>O2 at</span>
                <b>{formatKpa(h.pressure_kpa)}</b>
                <small>{group.map((g) => HABITAT_SHORT[g.id] ?? g.name).join(', ')}</small>
              </li>
            );
          })}
        </ul>
      </article>
    </div>
  );
}

// ---------- 2. Habitats as instrument strips ----------

export function HabitatStrips({ habitats }: { habitats: Habitat[] }) {
  const earth = habitats.find((h) => h.id === 'earth');
  const maxKpa = Math.max(...habitats.map((h) => h.pressure_kpa));
  return (
    <div className="strips" role="list">
      <div className="strip strip-head" aria-hidden="true">
        <span>Habitat</span>
        <span>Oxygen</span>
        <span>Pressure</span>
        <span>Gravity</span>
        <span />
      </div>
      {habitats.map((h) => (
        <Link key={h.id} href={`/lens?habitat=${h.id}`} className="strip" role="listitem">
          <span className="strip-name">
            {HABITAT_SHORT[h.id] ?? h.name}
            {h.is_assumption && <em>scenario</em>}
          </span>
          <span className="strip-meter">
            <b>{formatPercent(h.o2_mole_fraction)}</b>
            <span className="meter">
              <i style={{ width: `${r1(h.o2_mole_fraction * 100)}%` }} />
              {earth && <u style={{ left: `${r1(earth.o2_mole_fraction * 100)}%` }} />}
            </span>
          </span>
          <span className="strip-meter">
            <b>
              {formatKpa(h.pressure_kpa)} <small>{formatPsi(h.pressure_kpa)}</small>
            </b>
            <span className="meter meter-cool">
              <i style={{ width: `${r1((h.pressure_kpa / maxKpa) * 100)}%` }} />
            </span>
          </span>
          <span className="strip-g">
            <b>{Number(h.gravity_g.toFixed(3))}</b> g
          </span>
          <span className="strip-go" aria-hidden="true">
            →
          </span>
        </Link>
      ))}
      {earth && (
        <p className="strip-note">
          The tick on each oxygen bar marks Earth air ({formatPercent(earth.o2_mole_fraction)}). Pressure bars are
          relative to {formatKpa(maxKpa)}.
        </p>
      )}
    </div>
  );
}

// ---------- 3. Entry tiles with a miniature of each page ----------

export function ExploreTiles({
  focus,
  points,
  investigations,
}: {
  focus: Habitat;
  points: FlammabilityPoint[];
  investigations: Investigation[];
}) {
  // A miniature, not the real chart: zoomed to where the test runs are so the shape of the data reads at this size.
  const kpas = points.map((p) => p.pressure_kpa).concat(focus.pressure_kpa);
  const x = scaleLinear().domain([0.1, 0.42]).range([10, 350]);
  const y = scaleLog().domain([Math.min(...kpas) * 0.85, Math.max(...kpas) * 1.15]).range([92, 10]);
  const sample = points.filter((_, i) => i % 2 === 0);
  return (
    <div className="entries">
      <Link href={`/lens?habitat=${focus.id}`} className="entry">
        <span className="entry-no">01</span>
        <div className="mini mini-lens" aria-hidden="true">
          <div className="mini-slider">
            <span>O2</span>
            <i style={{ ['--v' as string]: `${r1(focus.o2_mole_fraction * 100)}%` }} />
            <b>{formatPercent(focus.o2_mole_fraction)}</b>
          </div>
          <div className="mini-slider">
            <span>kPa</span>
            <i style={{ ['--v' as string]: `${r1((focus.pressure_kpa / 150) * 100)}%` }} />
            <b>{Number(focus.pressure_kpa.toFixed(1))}</b>
          </div>
        </div>
        <h3>Habitat Lens</h3>
        <p>Pick an atmosphere and see which investigations matter most for it, with every score explained.</p>
      </Link>

      <Link href="/map" className="entry">
        <span className="entry-no">02</span>
        <svg className="mini mini-map" viewBox="0 0 360 102" aria-hidden="true">
          {sample.map((p) => (
            <circle key={p.id} cx={r1(x(Math.min(0.42, p.o2_mole_fraction)))} cy={r1(y(p.pressure_kpa))} r="3" data-liquid={p.material_class === 'liquid_droplet'} />
          ))}
          <path
            className="mini-target"
            d={`M${r1(x(Math.min(0.42, focus.o2_mole_fraction)))} ${r1(y(focus.pressure_kpa)) - 6} l6 6 l-6 6 l-6 -6 Z`}
          />
        </svg>
        <h3>Coverage and gap map</h3>
        <p>Oxygen against pressure: what has been tested, where the habitats sit, and where the data runs out.</p>
      </Link>

      <Link href="/investigations" className="entry">
        <span className="entry-no">03</span>
        <div className="mini mini-db" aria-hidden="true">
          {investigations.slice(0, 4).map((i) => (
            <div key={i.psi_id}>
              <b>{investigationName(i)}</b>
              <span>{i.psi_id}</span>
              <i />
            </div>
          ))}
        </div>
        <h3>Investigation database</h3>
        <p>Every in-scope PSI combustion investigation, each field traceable to its NASA source.</p>
      </Link>
    </div>
  );
}
