// Role C. Physics layer helpers: adiabatic flame temperature (T_ad) lookups. See docs/PHYSICS.md.
// Nothing is computed from chemistry here: values come from data/curated/flame_temperature.json
// (Cantera, offline) and are only interpolated.
import { flameTemperature } from '@/lib/data';
import type { FlammabilityPoint, FuelModel, MaterialClass } from '@/lib/types';

/** Diluent of the target atmosphere. `Conditions` has no diluent, so the default is N2. */
export type Diluent = 'N2' | 'CO2' | 'He';

/** Reference atmosphere for "vs ISS" ratios: ISS cabin air as in habitats.json and docs/PHYSICS.md section 5. */
export const ISS_REFERENCE = { o2_mole_fraction: 0.21, pressure_kpa: 101.3 } as const;

/** Fuel models evaluated for a material class. Solids use n-heptane as a surrogate; gas jets have no model. */
export function fuelModelsForClass(cls: MaterialClass): FuelModel[] {
  if (cls === 'liquid_droplet') return ['methanol', 'n-heptane'];
  if (cls === 'gas_jet') return [];
  return ['n-heptane'];
}

export function isSolid(cls: MaterialClass): boolean {
  return cls === 'thin_fabric' || cls === 'thin_solid' || cls === 'thick_solid';
}

/** Index i such that axis[i] <= v <= axis[i + 1], or null when v is outside the axis. */
function bracket(axis: number[], v: number): number | null {
  const eps = 1e-9;
  if (!Number.isFinite(v) || v < axis[0] - eps || v > axis[axis.length - 1] + eps) return null;
  let i = 0;
  while (i < axis.length - 2 && v > axis[i + 1]) i += 1;
  return i;
}

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

/**
 * T_ad in K for an O2/N2 atmosphere, by bilinear interpolation on the precomputed grid
 * (O2 0.10 to 1.00, pressure 20 to 320 kPa). Linear in O2 and in log(pressure): T_ad varies with pressure
 * through dissociation, which is close to linear in log P (linear-in-P was 7 K off at 29.6 kPa, log-P is within 1 K).
 * Returns null outside the grid: no extrapolation.
 */
export function interpolateTad(fuel: FuelModel, o2: number, pressureKpa: number): number | null {
  const { o2: xs, pressure_kpa: ys, t_ad_k: tables } = flameTemperature.grid;
  const table = tables[fuel];
  const i = bracket(xs, o2);
  const j = bracket(ys, pressureKpa);
  if (i === null || j === null) return null;
  const tx = clamp01((o2 - xs[i]) / (xs[i + 1] - xs[i]));
  const ty = clamp01(Math.log(pressureKpa / ys[j]) / Math.log(ys[j + 1] / ys[j]));
  const low = table[i][j] * (1 - ty) + table[i][j + 1] * ty;
  const high = table[i + 1][j] * (1 - ty) + table[i + 1][j + 1] * ty;
  return low * (1 - tx) + high * tx;
}

/** Fuel model of a test point: from flame_temperature.json, else from the class and material name. */
export function pointFuel(p: FlammabilityPoint): FuelModel | null {
  const known = Object.hasOwn(flameTemperature.points, p.id) ? flameTemperature.points[p.id] : undefined;
  if (known) return known.fuel_model;
  if (isSolid(p.material_class)) return 'n-heptane';
  if (p.material_class === 'liquid_droplet') {
    if (/methanol/i.test(p.material)) return 'methanol';
    if (/heptane/i.test(p.material)) return 'n-heptane';
  }
  return null;
}

/** T_ad of a test point: the precomputed value, else interpolated for O2/N2 points. */
export function pointTad(p: FlammabilityPoint, fuel: FuelModel): number | null {
  const known = Object.hasOwn(flameTemperature.points, p.id) ? flameTemperature.points[p.id] : undefined;
  if (known && known.fuel_model === fuel) return known.t_ad_k;
  if (p.diluent !== null && p.diluent !== 'N2') return null;
  return interpolateTad(fuel, p.o2_mole_fraction, p.pressure_kpa);
}

/** Limiting T_ad of a droplet fuel, calibrated on the FLEX limiting oxygen index. */
export function fuelLimitK(fuel: FuelModel): number {
  return flameTemperature.limiting_t_ad[fuel].t_limit_k;
}

/** Published FLEX limiting oxygen index in O2/N2 for a fuel (from the calibration rows), or null. */
export function publishedLoi(fuel: FuelModel): number | null {
  const row = flameTemperature.calibration.find((r) => r.fuel === fuel && r.co2 === 0);
  return row ? row.o2 : null;
}
