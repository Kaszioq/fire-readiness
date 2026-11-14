// Tests run on the REAL curated data (data/curated), not on mocks: they pin the behaviour the demo relies on.
import { describe, expect, it } from 'vitest';
import { flammabilityPoints, flameTemperature, habitats, investigations } from '@/lib/data';
import type { Conditions, FuelModel, HabitatId, MaterialClass } from '@/lib/types';
import {
  CONFIDENCE_SENTENCE,
  evidenceCoverage,
  HELIUM_WARNING,
  interpolateTad,
  MAX_EVIDENCE,
  PARTIAL_GRAVITY_WARNING,
  PHYSICS_NOTE_PREFIX,
  physicsEstimate,
  predict,
  predictDropletByFuel,
} from './index';

const P = flammabilityPoints;

function habitatConditions(id: HabitatId, cls: MaterialClass, flow?: number): Conditions {
  const h = habitats.find((x) => x.id === id);
  if (!h) throw new Error(`habitat ${id} missing from curated data`);
  return {
    o2_mole_fraction: h.o2_mole_fraction,
    pressure_kpa: h.pressure_kpa,
    flow_cm_s: flow ?? h.flow_cm_s,
    material_class: cls,
    gravity_g: h.gravity_g,
  };
}

const droplet = (o2: number): Conditions => ({
  o2_mole_fraction: o2,
  pressure_kpa: 101,
  flow_cm_s: 0,
  material_class: 'liquid_droplet',
  gravity_g: 0,
});

/** Code keeps exact values; tests compare temperatures with a tolerance (5 K unless stated). */
const within = (actual: number, expected: number, tolerance: number) => Math.abs(actual - expected) <= tolerance;

const SOLIDS: MaterialClass[] = ['thin_fabric', 'thin_solid', 'thick_solid'];
const ALL_CLASSES: MaterialClass[] = [...SOLIDS, 'liquid_droplet', 'gas_jet'];

describe('(a) Moon base, solid materials: no test data, physics margin only', () => {
  it.each(SOLIDS)('%s -> no_evidence, physics_only, solids margin reported', (cls) => {
    const p = predict(habitatConditions('moon_base', cls), P);
    expect(p.zone).toBe('no_evidence');
    expect(p.mode).toBe('physics_only');
    expect(p.p_sustained).toBeNull();
    expect(p.confidence).toBe(0);
    expect(p.evidence).toEqual([]);

    expect(p.physics).toBeDefined();
    expect(p.physics?.surrogate).toBe(true);
    expect(p.physics?.fuel_model).toBe('n-heptane');
    expect(p.physics?.valid).toBe(true);
    // Margin above the coldest tested condition of the class that still burned.
    expect(p.physics?.limit_k).not.toBeNull();
    expect(p.physics?.margin_k).toBeGreaterThan(500);
    expect(p.physics?.note.startsWith(PHYSICS_NOTE_PREFIX)).toBe(true);

    // PHYSICS.md section 6: the Moon base condition is about 220 K above every solid test (2326 K). Exact: 220.5 K.
    expect(within((p.physics?.t_ad_k ?? NaN) - 2326, 220, 5)).toBe(true);
    // Text rounds temperatures to the nearest 10 K.
    expect(p.explanation).toContain('about 220 K above the hottest tested condition (about 2330 K)');
    expect(p.explanation).toContain('Physics estimate, no test data at these conditions');
    expect(p.explanation).toContain('PSI microgravity data');
    expect(p.explanation).not.toMatch(/\d\d\d[1-9] K/); // no temperature printed to the kelvin
  });

  // [class, coldest tested condition that still burned (K), margin at Moon base (K), Moon base margin / ISS margin]
  const solids: [MaterialClass, number, number, number][] = [
    ['thick_solid', 1847.8, 698.7, 1.64],
    ['thin_solid', 1910.5, 636.0, 1.75],
    ['thin_fabric', 2012.1, 534.4, 2.04],
  ];

  it.each(solids)('%s: limit, margin and ratio vs ISS use the same limit', (cls, limit, margin, ratio) => {
    const moon = predict(habitatConditions('moon_base', cls), P).physics;
    const iss = predict(habitatConditions('iss', cls, 10), P).physics;
    expect(within(moon?.limit_k ?? NaN, limit, 5)).toBe(true);
    expect(within(moon?.margin_k ?? NaN, margin, 5)).toBe(true);
    expect(within(moon?.margin_ratio_vs_iss ?? NaN, ratio, 0.02)).toBe(true);
    // Same limit in both atmospheres, and the ratio is exactly the ratio of the two margins.
    expect(iss?.limit_k).toBe(moon?.limit_k);
    expect(iss?.margin_ratio_vs_iss).toBe(1);
    expect(within((moon?.margin_k ?? NaN) / (iss?.margin_k ?? NaN), moon?.margin_ratio_vs_iss ?? NaN, 0.01)).toBe(true);
    expect(moon?.note).toContain('relative to the coldest tested condition that still burned');
  });
});

describe('(b) ISS air with 20 cm/s flow, thin fabric: inside the tested envelope', () => {
  const p = predict(habitatConditions('iss', 'thin_fabric', 20), P);

  it('is a data result: sustained', () => {
    expect(p.mode).toBe('data');
    expect(p.zone).toBe('sustained');
    expect(p.p_sustained).toBeGreaterThan(0.6);
    expect(p.evidence.length).toBeGreaterThan(0);
  });

  it('says that the material matters when a nearby material did not burn', () => {
    expect(p.evidence.some((e) => e.outcome === 'no_ignition')).toBe(true);
    expect(p.warnings.some((w) => w.includes('Nomex'))).toBe(true);
  });

  it('carries the physics estimate as context, labelled as such', () => {
    expect(p.physics?.note.startsWith(PHYSICS_NOTE_PREFIX)).toBe(true);
    expect(within(p.physics?.t_ad_k ?? NaN, 2274, 5)).toBe(true);
  });
});

describe('(c) droplets at 101 kPa, around the FLEX limiting oxygen index', () => {
  it('n-heptane at 13% O2 is on the extinguished side', () => {
    const p = predictDropletByFuel(droplet(0.13), P)['n-heptane'];
    expect(p.mode).toBe('data');
    expect(p.zone).toBe('extinguishes');
    expect(p.physics?.margin_k).toBeLessThan(0);
    expect(p.physics?.margin_ratio_vs_iss).toBeNull(); // no ratio below the limit
  });

  it('n-heptane at 21% O2 is sustained', () => {
    const p = predictDropletByFuel(droplet(0.21), P)['n-heptane'];
    expect(p.mode).toBe('data');
    expect(p.zone).toBe('sustained');
  });

  it('methanol at 12% O2 is marginal', () => {
    const p = predictDropletByFuel(droplet(0.12), P).methanol;
    expect(p.mode).toBe('data');
    expect(p.zone).toBe('marginal');
  });

  it('without a fuel, both fuels are evaluated and the more flammable result is shown', () => {
    const both = predictDropletByFuel(droplet(0.13), P);
    expect(both.methanol.zone).toBe('sustained');
    expect(both['n-heptane'].zone).toBe('extinguishes');
    const head = predict(droplet(0.13), P);
    expect(head.zone).toBe('sustained');
    expect(head.physics?.fuel_model).toBe('methanol');
    expect(head.explanation).toContain('methanol: zone sustained');
    expect(head.explanation).toContain('n-heptane: zone extinguishes');
  });

  it('explains that droplet outcomes are positions relative to the LOI, not burn-to-completion', () => {
    const p = predictDropletByFuel(droplet(0.21), P)['n-heptane'];
    expect(p.warnings.some((w) => w.includes('limiting oxygen index') && w.includes('normal droplet physics'))).toBe(true);
  });
});

describe('evidence coverage (Prediction.confidence)', () => {
  it('is (1/8) * sum(exp(-d^2 / 2)) over the 8 nearest runs', () => {
    expect(evidenceCoverage([0, 0, 0, 0, 0, 0, 0, 0])).toBe(1);
    expect(evidenceCoverage([1, 1, 1, 1, 1, 1, 1, 1])).toBeCloseTo(Math.exp(-0.5), 10);
    expect(evidenceCoverage([0])).toBeCloseTo(1 / 8, 10); // missing neighbours count as 0
    expect(evidenceCoverage([])).toBe(0);
    const p = predict(habitatConditions('iss', 'thin_fabric', 20), P);
    expect(p.confidence).toBeCloseTo(evidenceCoverage(p.evidence.map((e) => e.distance)), 2);
  });

  it('ISS air, thin fabric, 20 cm/s: at least 0.5', () => {
    expect(predict(habitatConditions('iss', 'thin_fabric', 20), P).confidence).toBeGreaterThanOrEqual(0.5);
  });

  it('air, thin fabric, 10 cm/s: between 0.25 and 0.7', () => {
    const c = predict(habitatConditions('iss', 'thin_fabric', 10), P).confidence;
    expect(c).toBeGreaterThanOrEqual(0.25);
    expect(c).toBeLessThanOrEqual(0.7);
  });

  it('a target exactly on a test condition: at least 0.6', () => {
    for (const id of ['PSI-69:205', 'PSI-98:S1']) {
      const source = P.find((x) => x.id === id);
      expect(source).toBeDefined();
      if (!source) continue;
      const p = predict(
        {
          o2_mole_fraction: source.o2_mole_fraction,
          pressure_kpa: source.pressure_kpa,
          flow_cm_s: source.flow_cm_s,
          material_class: source.material_class,
          gravity_g: 0,
        },
        P,
      );
      expect(p.mode).toBe('data');
      expect(p.confidence).toBeGreaterThanOrEqual(0.6);
    }
  });

  it('is 0 when there is no data result', () => {
    expect(predict(habitatConditions('moon_base', 'thin_fabric'), P).confidence).toBe(0);
  });
});

describe('(d) partial gravity', () => {
  const base = habitatConditions('moon_base', 'thin_fabric');

  it('warns at lunar gravity, in every mode', () => {
    expect(base.gravity_g).toBeCloseTo(0.166, 3);
    expect(predict(base, P).warnings).toContain(PARTIAL_GRAVITY_WARNING);
    expect(predict(habitatConditions('moon_base', 'liquid_droplet'), P).warnings).toContain(PARTIAL_GRAVITY_WARNING);
    expect(predict({ ...base, material_class: 'gas_jet' }, P).warnings).toContain(PARTIAL_GRAVITY_WARNING);
    expect(predict(base, P, { diluent: 'He' }).warnings).toContain(PARTIAL_GRAVITY_WARNING);
  });

  it('does not warn at 0 g or 1 g', () => {
    expect(predict({ ...base, gravity_g: 0 }, P).warnings).not.toContain(PARTIAL_GRAVITY_WARNING);
    expect(predict({ ...base, gravity_g: 1 }, P).warnings).not.toContain(PARTIAL_GRAVITY_WARNING);
  });

  it('never claims that 0 g and 1 g bound partial gravity', () => {
    expect(PARTIAL_GRAVITY_WARNING).toContain('do NOT bound');
  });
});

describe('(e) invariants for every habitat and material class', () => {
  const cases = habitats.flatMap((h) => ALL_CLASSES.map((cls) => [h.id, cls] as const));

  it.each(cases)('%s / %s', (id, cls) => {
    const c = habitatConditions(id, cls);
    const p = predict(c, P);
    expect(p.evidence.length).toBeLessThanOrEqual(MAX_EVIDENCE);
    expect(p.confidence).toBeGreaterThanOrEqual(0);
    expect(p.confidence).toBeLessThanOrEqual(1);
    expect(Number.isFinite(p.confidence)).toBe(true);
    expect(['data', 'physics_only', 'none']).toContain(p.mode);
    expect(p.explanation).toContain(CONFIDENCE_SENTENCE);
    expect(p.explanation).not.toMatch(/STUB/i);
    expect(p.warnings.join(' ')).not.toMatch(/STUB/i);

    if (p.zone === 'no_evidence') {
      expect(p.p_sustained).toBeNull();
      expect(p.mode).not.toBe('data');
    } else {
      expect(p.mode).toBe('data');
      expect(p.p_sustained).not.toBeNull();
      expect(p.evidence.length).toBeGreaterThan(0);
    }
    if (p.mode === 'none') expect(p.physics).toBeUndefined();
    if (p.mode === 'physics_only') expect(p.physics).toBeDefined();

    // Deterministic: same input, same output, and the order of the points does not matter.
    expect(predict(c, P)).toEqual(p);
    expect(predict(c, [...P].reverse())).toEqual(p);
  });

  it('with flow given, too', () => {
    for (const cls of ALL_CLASSES) {
      const c = habitatConditions('iss', cls, 10);
      const p = predict(c, P);
      expect(p.evidence.length).toBeLessThanOrEqual(MAX_EVIDENCE);
      expect(p.confidence).toBeGreaterThanOrEqual(0);
      expect(p.confidence).toBeLessThanOrEqual(1);
      expect(predict(c, [...P].reverse())).toEqual(p);
    }
  });
});

describe('(f) habitat margins match docs/PHYSICS.md section 5', () => {
  // [habitat, n-heptane margin K, ratio vs ISS, methanol margin K, ratio vs ISS], copied from PHYSICS.md section 5.
  const table: [HabitatId, number, number, number, number][] = [
    ['iss', 364, 1.0, 555, 1.0],
    ['exploration_10_2', 549, 1.51, 718, 1.29],
    ['moon_base', 637, 1.75, 794, 1.43],
    ['exploration_8_2', 701, 1.93, 849, 1.53],
    ['spacesuit', 1040, 2.86, 1126, 2.03],
  ];

  it.each(table)('%s', (id, heptaneMargin, heptaneRatio, methanolMargin, methanolRatio) => {
    const c = habitatConditions(id, 'liquid_droplet');
    const check = (fuel: FuelModel, margin: number, ratio: number) => {
      const e = physicsEstimate(c, P, fuel);
      expect(e).not.toBeNull();
      expect(Math.abs((e?.margin_k ?? NaN) - margin)).toBeLessThanOrEqual(5);
      expect(Math.abs((e?.margin_ratio_vs_iss ?? NaN) - ratio)).toBeLessThanOrEqual(0.02);
      expect(e?.surrogate).toBe(false);
    };
    check('n-heptane', heptaneMargin, heptaneRatio);
    check('methanol', methanolMargin, methanolRatio);
  });

  it('interpolated T_ad agrees with the precomputed habitat values within 5 K', () => {
    for (const h of flameTemperature.habitats) {
      expect(Math.abs((interpolateTad('n-heptane', h.o2, h.pressure_kpa) ?? NaN) - h['t_ad_n-heptane_k'])).toBeLessThanOrEqual(5);
      expect(Math.abs((interpolateTad('methanol', h.o2, h.pressure_kpa) ?? NaN) - h.t_ad_methanol_k)).toBeLessThanOrEqual(5);
    }
  });
});

describe('modes outside the data', () => {
  it('helium-diluted atmosphere -> mode none, no physics, with the reason', () => {
    for (const cls of ALL_CLASSES) {
      const p = predict(habitatConditions('iss', cls, 10), P, { diluent: 'He' });
      expect(p.mode).toBe('none');
      expect(p.zone).toBe('no_evidence');
      expect(p.physics).toBeUndefined();
      expect(p.warnings).toContain(HELIUM_WARNING);
    }
  });

  it('gas jets: no test runs and no fuel model -> mode none', () => {
    const p = predict(habitatConditions('iss', 'gas_jet'), P);
    expect(p.mode).toBe('none');
    expect(p.zone).toBe('no_evidence');
    expect(p.physics).toBeUndefined();
  });

  it('far from all data -> no_evidence (SPEC module 4)', () => {
    // Inside the T_ad and pressure envelope, but no droplet was tested in forced flow.
    const p = predictDropletByFuel({ ...droplet(0.21), flow_cm_s: 40 }, P)['n-heptane'];
    expect(p.zone).toBe('no_evidence');
    expect(p.p_sustained).toBeNull();
    expect(p.mode).toBe('physics_only');
    // Outside the flame-temperature grid there is no physics either.
    const off = predict({ ...droplet(0.05), pressure_kpa: 500 }, P);
    expect(off.zone).toBe('no_evidence');
    expect(off.mode).toBe('none');
  });

  it('an exact duplicate of a sustained point -> sustained with high confidence (SPEC module 4)', () => {
    const source = P.find((x) => x.id === 'PSI-69:205');
    expect(source?.outcome).toBe('sustained');
    if (!source) return;
    const p = predictDropletByFuel(
      {
        o2_mole_fraction: source.o2_mole_fraction,
        pressure_kpa: source.pressure_kpa,
        flow_cm_s: source.flow_cm_s,
        material_class: source.material_class,
        gravity_g: 0,
      },
      P,
    )['n-heptane'];
    expect(p.zone).toBe('sustained');
    expect(p.confidence).toBeGreaterThan(0.9);
    expect(p.evidence[0].point_id).toBe(source.id);
    // Not exactly 0: the point's T_ad is the precomputed value, the target's is interpolated (within 1 K).
    expect(p.evidence[0].distance).toBeLessThan(0.01);
  });

  it('fewer than 5 test runs for the class -> no data result', () => {
    const p = predict(habitatConditions('iss', 'thin_fabric', 10), P.slice(0, 3));
    expect(p.zone).toBe('no_evidence');
    expect(p.p_sustained).toBeNull();
    expect(p.mode).not.toBe('data');
  });
});

describe('suppression notes', () => {
  it('are verbatim curated key_findings with their provenance, never generated', () => {
    const findings = new Map(
      investigations.flatMap((inv) => inv.key_findings.map((f) => [`${inv.psi_id}|${f.value}`, f.prov] as const)),
    );
    for (const cls of ALL_CLASSES) {
      for (const note of predict(habitatConditions('iss', cls, 10), P).suppression_notes) {
        const prov = findings.get(`${note.psi_id}|${note.text}`);
        expect(prov).toBeDefined();
        expect(note.prov).toEqual(prov);
      }
    }
  });

  it('droplets get the FLEX CO2 finding; gas jets get none', () => {
    const notes = predict(droplet(0.21), P).suppression_notes;
    expect(notes.some((n) => n.psi_id === 'PSI-69' && n.text.includes('CO2'))).toBe(true);
    expect(predict(habitatConditions('iss', 'gas_jet'), P).suppression_notes).toEqual([]);
  });
});

describe('flame temperature interpolation', () => {
  it('returns the grid value at a grid node and null outside the grid', () => {
    const { o2, pressure_kpa, t_ad_k } = flameTemperature.grid;
    expect(interpolateTad('methanol', o2[11], pressure_kpa[4])).toBeCloseTo(t_ad_k.methanol[11][4], 6);
    expect(interpolateTad('n-heptane', o2[0], pressure_kpa[0])).toBeCloseTo(t_ad_k['n-heptane'][0][0], 6);
    expect(interpolateTad('n-heptane', 0.05, 101.3)).toBeNull();
    expect(interpolateTad('n-heptane', 0.21, 10)).toBeNull();
    expect(interpolateTad('n-heptane', 0.21, 400)).toBeNull();
  });
});
