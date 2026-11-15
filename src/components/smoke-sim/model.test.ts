import { describe, expect, it } from 'vitest';
import { cellVelocity, makeGrid, SmokeModel, solveFlow, type Layout, type ModelParams } from './model';

const layout: Layout = {
  lengthM: 6,
  heightM: 3,
  inlet: { wall: 'left', pos: 2.4 },
  outlet: { wall: 'right', pos: 0.6 },
  fire: { x: 1.8, y: 0.2 },
  detectors: [
    { id: 'ceiling', x: 2.0, y: 2.9 },
    { id: 'outlet', x: 5.85, y: 0.9 },
  ],
};
const params: ModelParams = { inletSpeed: 0.2, mixing: 0.01, riseSpeed: 0.5, coolingS: 20, threshold: 5 };

function run(l: Layout, p: ModelParams, t: number) {
  const g = makeGrid(l.lengthM, l.heightM);
  const flow = solveFlow(g, l.inlet, l.outlet);
  const models = (['0g', '1g'] as const).map((m) => new SmokeModel(g, flow, l, p, m));
  for (const m of models) m.advanceTo(t);
  return { g, flow, zero: models[0], one: models[1] };
}

describe('ventilation flow', () => {
  it('is divergence-free and carries the inlet flux to the outlet', () => {
    const g = makeGrid(layout.lengthM, layout.heightM);
    const f = solveFlow(g, layout.inlet, layout.outlet);
    const { nx, ny, dx, dy } = g;
    let worst = 0;
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const out =
          (f.u[j * (nx + 1) + i + 1] - f.u[j * (nx + 1) + i]) * dy + (f.v[(j + 1) * nx + i] - f.v[j * nx + i]) * dx;
        worst = Math.max(worst, Math.abs(out));
      }
    }
    expect(worst).toBeLessThan(1e-4);
    let inflow = 0;
    let outflow = 0;
    for (let j = 0; j < ny; j++) {
      inflow += Math.max(0, f.u[j * (nx + 1)]) * dy;
      outflow += Math.max(0, f.u[j * (nx + 1) + nx]) * dy;
    }
    expect(inflow).toBeGreaterThan(0);
    expect(outflow).toBeCloseTo(inflow, 6);
    expect(f.blocked).toBe(false);
  });

  it('reports a blocked flow when the inlet covers the outlet', () => {
    const g = makeGrid(6, 3);
    const f = solveFlow(g, { wall: 'top', pos: 3 }, { wall: 'top', pos: 3 });
    expect(f.blocked).toBe(true);
    const { ux, uy } = cellVelocity(g, f, 0.2);
    expect(Math.max(...ux.map(Math.abs), ...uy.map(Math.abs))).toBe(0);
  });
});

describe('smoke transport', () => {
  it('conserves smoke when the ventilation is off', () => {
    const { zero, one } = run(layout, { ...params, inletSpeed: 0 }, 60);
    for (const m of [zero, one]) {
      expect(m.total()).toBeCloseTo(m.emissionRate() * m.t, 3);
      expect(Math.min(...m.c)).toBeGreaterThanOrEqual(0);
    }
  });

  it('loses smoke only through the outlet when the ventilation is on', () => {
    const { zero } = run(layout, params, 120);
    expect(zero.total()).toBeLessThan(zero.emissionRate() * zero.t);
    expect(zero.total()).toBeGreaterThan(0);
  });

  it('in 1 g, a ceiling detector above the fire alarms well before it does in 0 g', () => {
    const { zero, one } = run(layout, params, 300);
    const ceiling1g = one.detectAt[0];
    const ceiling0g = zero.detectAt[0];
    expect(ceiling1g).not.toBeNull();
    expect(ceiling0g === null || (ceiling1g as number) < (ceiling0g as number) / 2).toBe(true);
  });

  it('gives no detection when the threshold is out of reach', () => {
    const { zero, one } = run(layout, { ...params, threshold: 1e9 }, 60);
    expect([...zero.detectAt, ...one.detectAt].every((t) => t === null)).toBe(true);
  });
});
