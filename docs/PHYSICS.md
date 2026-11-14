# PHYSICS.md: physics layer (adiabatic flame temperature) and the hybrid predictor

Added Sat 2026-11-14 19:00 CET. Replaces the smoke simulator (SPEC module 6) as role C's extra module.
Data: `data/curated/flame_temperature.json`, produced by `scripts/compute_flame_temperature.py` (needs `pip install cantera`).

## 1. Idea in one paragraph

A flame survives only if it is hot enough to outrun its heat losses. The **adiabatic flame temperature** (T_ad) of the fuel burning in a given atmosphere is a thermodynamic quantity: it depends on oxygen fraction, the diluent (N2, CO2, He) and pressure, and it can be computed exactly from chemical equilibrium. Fire-safety engineering uses a **limiting T_ad**: below it, a flame cannot be sustained. We compute T_ad with Cantera and NASA thermodynamic data, **calibrate the limit on NASA's own microgravity data** (FLEX limiting oxygen index), and use T_ad as the physical axis of the predictor. Data (test points) handle what the physics leaves out: heat losses, flow and material.

## 2. Method

- Cantera 3.2 chemical equilibrium at constant enthalpy and pressure; NASA Glenn thermodynamic database (`nasa_gas.yaml`, shipped with Cantera).
- Mixture: gaseous fuel at 298.15 K, stoichiometric with the ambient atmosphere (phi = 1). Latent heat of the liquid fuel is neglected (it cancels when comparing diluents for one fuel).
- Fuels: methanol and n-heptane (the FLEX fuels). Solids have no species in the database; **n-heptane is used as a surrogate** for solids, and solid thresholds are taken from BASS-II and Saffire data, not from FLEX.

## 3. Calibration result (the reason this layer exists)

Published FLEX limiting oxygen index (Dietrich et al. 2014, doi 10.1007/s12217-014-9372-2), converted to T_ad:

| Fuel | Atmosphere at LOI | T_ad at LOI |
|---|---|---|
| methanol | 12% O2 / 88% N2 | 1674 K |
| methanol | 14% O2 / 56% N2 / 30% CO2 | 1657 K |
| n-heptane | 15% O2 / 85% N2 | 1910 K |
| n-heptane | 17% O2 / 63% N2 / 20% CO2 | 1908 K |

For each fuel, the LOI in nitrogen and the LOI with CO2 suppressant give **the same flame temperature within 17 K (methanol) and 2 K (heptane)**. The limiting-flame-temperature concept holds on NASA microgravity droplet data. Limits used: methanol 1665 K, n-heptane 1910 K. The limit is **fuel-specific**, not universal.

## 4. Checks against all 274 FLEX tests (`flame_temperature.json` -> `flex_tests`)

Burn time shorter than 2 s is used only as a rough sign of a near-limit flame (see `mappings.md` for why burn time is not a flammability label).

| Diluent | Tests | Below limit, short burn | Below limit, long burn | Above limit, short burn | Above limit, long burn |
|---|---|---|---|---|---|
| N2 | 98 | 5 | 1 | 2 | 90 |
| CO2 | 119 | 7 | 6 | 0 | 106 |
| He | 50 | 0 | 0 | 6 | 44 |

- N2 and CO2: 196 of 198 tests above the limit burned long; most short burns are below the limit. The physics explains CO2 suppression.
- **Helium does not follow the rule**: 6 short burns happened well above the T_ad limit. Helium's high thermal diffusivity increases heat loss, which T_ad does not capture. **Never use the physics layer for helium-diluted atmospheres.** Say so in the UI.

## 5. Habitats (n-heptane / methanol margin above the limit)

| Habitat | T_ad heptane | Margin heptane | vs ISS | Margin methanol | vs ISS |
|---|---|---|---|---|---|
| ISS / Earth (21%, 101.3 kPa) | 2274 K | 364 K | 1.00 | 555 K | 1.00 |
| exploration 10.2 psia / 26.5% | 2459 K | 549 K | 1.51 | 718 K | 1.29 |
| **Moon base 10.2 psi / 30%** | 2547 K | 637 K | **1.75** | 794 K | **1.43** |
| exploration 8.2 psia / 34% | 2610 K | 701 K | 1.93 | 849 K | 1.53 |
| spacesuit 4.3 psi / 100% | | 1040 K | 2.86 | 1126 K | 2.03 |

Demo line: "In the Moon base atmosphere, a liquid fuel flame has 43 to 75% more thermal margin above extinction than in ISS air (physics, calibrated on NASA FLEX). For solids, the Moon base condition is 220 K hotter than any solid test in PSI."

## 6. Solids: what the data say on the T_ad axis (n-heptane surrogate)

| Class | Tests | Hottest tested condition | Coldest condition that still burned | Non-burning cases |
|---|---|---|---|---|
| thick_solid (PMMA) | 81 | 2326 K | 1848 K (14.2% O2) | no ignition at 1799 K (13.6% O2); silicone at 2322 K |
| thin_solid | 24 | 2326 K | 1911 K (15% O2) | thin silicone at 2296 and 2322 K |
| thin_fabric | 35 | 2326 K | 2012 K (16.4% O2) | Nomex at 2322 K |

- PMMA in microgravity has a limit between 1799 and 1848 K on this axis.
- Silicone and Nomex do not burn even in air: **material chemistry matters beyond T_ad**. The physics layer never overrides a material-specific test result.
- Moon base (2547 K) lies 220 K above every solid test: outside the data envelope, so the answer for solids is "no test data; physics margin only".

## 7. Hybrid predictor (to implement, role C)

Three modes, shown as such in the UI:

1. **`data` mode** (inside the envelope): distance-weighted kNN as in SPEC module 4, but the O2 axis is replaced by **T_ad**: `x = (T_ad / 100 K, log10(P) / 0.15, u / 5)`. For droplets use the fuel-specific T_ad of each point; for a droplet query evaluate methanol and n-heptane separately and report both. For solids use the n-heptane surrogate.
2. **`physics_only` mode** (outside the T_ad or pressure envelope of the class, and the diluent is N2 or CO2): no kNN result (`zone: 'no_evidence'`, `p_sustained: null`), plus the physics margin: for droplets `margin = T_ad - T_limit(fuel)`; for solids the distance above the hottest tested solid condition and above the coldest condition that still burned. Text must say "physics estimate, no test data at these conditions".
3. **`none`**: helium-diluted atmospheres (physics invalid) or no data and no physics: `no_evidence` with the reason.

Partial gravity: none of the modes covers it; the partial-gravity warning (FM2) always applies.

### Proposed contract additions (additive, optional fields; tell role B before merging)

```ts
// types.ts
export type PredictionMode = 'data' | 'physics_only' | 'none';
export interface PhysicsEstimate {
  t_ad_k: number;                 // target T_ad (fuel model below)
  fuel_model: 'n-heptane' | 'methanol';
  surrogate: boolean;             // true for solids
  limit_k: number | null;         // fuel limit (droplets) or coldest burning solid test (solids)
  margin_k: number | null;        // t_ad_k - limit_k
  margin_ratio_vs_iss: number | null;
  valid: boolean;                 // false for helium-diluted atmospheres
  note: string;
}
// Prediction gains:
//   mode: PredictionMode;
//   physics?: PhysicsEstimate;
```
`flame_temperature.json` stays outside the zod data validation until these types exist; then add a `FlameTemperatureSchema` and load it in `src/lib/data/index.ts` (role A).

### Client-side T_ad for slider values

Use bilinear interpolation on `grid` (O2 0.10 to 1.00 step 0.01, pressure 20 to 320 kPa step 20, N2 diluent). Do not run Cantera in the app.

## 8. Limits to state openly

- T_ad is a thermodynamic upper bound on flame temperature; real flames are cooler. Only the **limit**, calibrated on NASA data, gives it meaning.
- Calibrated on droplets; solids use a surrogate and data-derived thresholds.
- No gravity, no flow, no heat losses in the physics; those come from the test points.
- Invalid for helium.

## 9. Sources for README References

- Cantera (open source, BSD-3): https://cantera.org (version 3.2.0)
- NASA Glenn thermodynamic data (McBride, Zehe, Gordon, NASA/TP-2002-211556), via Cantera `nasa_gas.yaml`
- Dietrich et al. 2014, Microgravity Sci. Technol., doi 10.1007/s12217-014-9372-2 (FLEX LOI)
- NASA PSI FLEX (PSI-69), BASS-II (PSI-25), Saffire (PSI-98, PSI-99) data
