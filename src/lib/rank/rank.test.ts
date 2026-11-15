// Runs on the real curated data.
import { describe, expect, it } from 'vitest';
import { habitats, investigations } from '@/lib/data';
import type { Conditions, HabitatId, MaterialClass, RankedInvestigation } from '@/lib/types';
import { rankInvestigations, WEIGHTS } from './index';

const CLASSES: MaterialClass[] = ['thin_fabric', 'thin_solid', 'thick_solid', 'liquid_droplet', 'gas_jet', 'fire_resistant'];

function conditions(id: HabitatId, cls: MaterialClass): Conditions {
  const h = habitats.find((x) => x.id === id);
  if (!h) throw new Error(`habitat ${id} missing`);
  return { o2_mole_fraction: h.o2_mole_fraction, pressure_kpa: h.pressure_kpa, flow_cm_s: h.flow_cm_s, material_class: cls, gravity_g: h.gravity_g };
}

const component = (r: RankedInvestigation | undefined, name: string) => r?.components.find((c) => c.name === name);
const find = (ranked: RankedInvestigation[], id: string) => ranked.find((r) => r.psi_id === id);

describe('rankInvestigations', () => {
  it('weights sum to 1', () => {
    expect(Object.values(WEIGHTS).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 10);
  });

  it.each(habitats.flatMap((h) => CLASSES.map((cls) => [h.id, cls] as const)))('%s / %s: complete, explained, sorted', (id, cls) => {
    const c = conditions(id, cls);
    const ranked = rankInvestigations(c, investigations);
    expect(ranked.length).toBe(investigations.length);
    expect(new Set(ranked.map((r) => r.psi_id)).size).toBe(investigations.length);

    for (const r of ranked) {
      expect(r.score).toBeGreaterThanOrEqual(0);
      expect(r.score).toBeLessThanOrEqual(1);
      expect(r.components.map((x) => x.name)).toEqual(['condition_coverage', 'fuel_relevance', 'safety_domain', 'data_availability', 'tier']);
      for (const x of r.components) {
        expect(x.value).toBeGreaterThanOrEqual(0);
        expect(x.value).toBeLessThanOrEqual(1);
        expect(x.weight).toBe(WEIGHTS[x.name]);
        expect(x.reason.length).toBeGreaterThan(10);
        expect(x.reason).not.toMatch(/STUB|undefined|NaN|null/);
      }
      expect(r.score).toBeCloseTo(r.components.reduce((s, x) => s + x.value * x.weight, 0), 3);
    }
    for (let i = 1; i < ranked.length; i += 1) expect(ranked[i - 1].score).toBeGreaterThanOrEqual(ranked[i].score);
    // Deterministic, and independent of the input order.
    expect(rankInvestigations(c, [...investigations].reverse())).toEqual(ranked);
  });

  it('Moon base: droplet and gas-burner studies cover the atmosphere, solid studies do not', () => {
    const ranked = rankInvestigations(conditions('moon_base', 'thin_fabric'), investigations);
    // FLEX tested 12 to 34% O2 and down to about 70 kPa; ACME BRE 21 to 40% O2 and 57 to 100 kPa.
    expect(component(find(ranked, 'PSI-69'), 'condition_coverage')?.value).toBe(1);
    expect(component(find(ranked, 'PSI-20'), 'condition_coverage')?.value).toBe(1);
    // BASS-II: solids, but only up to 22.2% O2 at about 1 atm.
    const bass2 = component(find(ranked, 'PSI-25'), 'condition_coverage');
    expect(bass2?.value).toBeLessThan(1);
    expect(bass2?.reason).toContain('outside the tested');
    expect(component(find(ranked, 'PSI-25'), 'fuel_relevance')?.value).toBe(1);
  });

  it('ISS air: the solid-fuel flight experiments cover the atmosphere', () => {
    const ranked = rankInvestigations(conditions('iss', 'thin_fabric'), investigations);
    expect(component(find(ranked, 'PSI-25'), 'condition_coverage')?.value).toBe(1);
    expect(ranked.slice(0, 3).map((r) => r.psi_id)).toContain('PSI-25');
  });

  it('unknown ranges give 0 coverage with "conditions not reported"', () => {
    const ranked = rankInvestigations(conditions('moon_base', 'thin_fabric'), investigations);
    const unknown = investigations.filter(
      (inv) => inv.conditions.o2_mole_fraction.value === null && inv.conditions.pressure_kpa.value === null,
    );
    expect(unknown.length).toBeGreaterThan(0);
    for (const inv of unknown) {
      const c = component(find(ranked, inv.psi_id), 'condition_coverage');
      expect(c?.value).toBe(0);
      expect(c?.reason).toMatch(/conditions not reported/i);
    }
  });

  it('one reported range gives at most half credit', () => {
    const ranked = rankInvestigations(conditions('iss', 'thin_fabric'), investigations);
    const oneAxis = investigations.filter(
      (inv) => (inv.conditions.o2_mole_fraction.value === null) !== (inv.conditions.pressure_kpa.value === null),
    );
    expect(oneAxis.length).toBeGreaterThan(0);
    for (const inv of oneAxis) {
      const c = component(find(ranked, inv.psi_id), 'condition_coverage');
      expect(c?.value).toBeLessThanOrEqual(0.5);
      expect(c?.reason).toContain('not reported');
    }
  });

  it('fuel relevance follows the target material class', () => {
    const fuel = (cls: MaterialClass, id: string) =>
      component(find(rankInvestigations(conditions('iss', cls), investigations), id), 'fuel_relevance')?.value;
    for (const cls of ['thin_fabric', 'thin_solid', 'thick_solid', 'fire_resistant'] as const) {
      expect(fuel(cls, 'PSI-25')).toBe(1); // BASS-II, solid
      expect(fuel(cls, 'PSI-69')).toBe(0.6); // FLEX, liquid
      expect(fuel(cls, 'PSI-20')).toBe(0.4); // ACME BRE, gas
    }
    expect(fuel('liquid_droplet', 'PSI-69')).toBe(1);
    expect(fuel('liquid_droplet', 'PSI-25')).toBe(0.6);
    expect(fuel('gas_jet', 'PSI-20')).toBe(1);
  });

  it('a ground study takes its fuel from the investigations whose data it reuses', () => {
    const ranked = rankInvestigations(conditions('iss', 'liquid_droplet'), investigations);
    const c = component(find(ranked, 'PSI-117'), 'fuel_relevance'); // reuses FLEX (PSI-69) data
    expect(c?.value).toBe(1);
    expect(c?.reason).toContain('PSI-69');
  });
});
