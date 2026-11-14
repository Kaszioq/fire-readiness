import { describe, expect, it } from 'vitest';
import { flammabilityPoints } from '@/lib/data';
import type { Conditions } from '@/lib/types';
import { MAX_EVIDENCE, PARTIAL_GRAVITY_WARNING, predict } from './index';

const moonBase: Conditions = {
  o2_mole_fraction: 0.3,
  pressure_kpa: 70.3,
  flow_cm_s: 5,
  material_class: 'thin_fabric',
  gravity_g: 0.166,
};

describe('predict', () => {
  it('always returns a confidence and at most 8 evidence points', () => {
    const p = predict(moonBase, flammabilityPoints);
    expect(p.confidence).toBeGreaterThanOrEqual(0);
    expect(p.confidence).toBeLessThanOrEqual(1);
    expect(p.evidence.length).toBeLessThanOrEqual(MAX_EVIDENCE);
  });

  it('warns about partial gravity between 0g and 1g', () => {
    expect(predict(moonBase, flammabilityPoints).warnings).toContain(PARTIAL_GRAVITY_WARNING);
    expect(predict({ ...moonBase, gravity_g: 0 }, flammabilityPoints).warnings).not.toContain(PARTIAL_GRAVITY_WARNING);
    expect(predict({ ...moonBase, gravity_g: 1 }, flammabilityPoints).warnings).not.toContain(PARTIAL_GRAVITY_WARNING);
  });

  it('returns no_evidence when the material class has fewer than 5 points', () => {
    const p = predict({ ...moonBase, material_class: 'thin_fabric' }, flammabilityPoints.slice(0, 3));
    expect(p.zone).toBe('no_evidence');
    expect(p.p_sustained).toBeNull();
  });

  // Required by docs/SPEC.md module 4 once the real algorithm replaces the stub.
  it.todo('far from all data returns no_evidence');
  it.todo('an exact duplicate of a sustained point returns sustained with high confidence');
});
