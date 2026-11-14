# Predictor

`predict(conditions, points, options?)` in `index.ts`. Spec: `docs/PHYSICS.md` section 7, `docs/SPEC.md` modules 4 and 4b.
Deterministic TypeScript, no LLM. Flame temperatures are read from `data/curated/flame_temperature.json` (Cantera, offline) and only interpolated (`physics.ts`).

## What it returns

| mode | when | zone | what to show |
|---|---|---|---|
| `data` | target inside the tested envelope of the material class and a test run within distance 2 | `extinguishes`, `marginal` or `sustained` | share of nearby runs that kept burning, the evidence runs, plus the physics estimate as context |
| `physics_only` | outside the envelope (flame temperature or pressure), or no run within distance 2 | `no_evidence` | "physics estimate, no test data at these conditions" and the margin |
| `none` | helium- or CO2-diluted target, a class with no fuel model (gas jets), or a target outside the flame-temperature grid | `no_evidence` | the reason only |

`confidence` is **evidence coverage**, not a probability: it says how well the target is covered by test runs. Every `explanation` ends with that sentence.

`physics.note` always starts with "Physics estimate, not test data:". A margin is a thermodynamic estimate; it never overrides a test result.

Partial gravity is covered by no mode. `PARTIAL_GRAVITY_WARNING` is added whenever `0 < gravity_g < 1`.

## Steps

1. `options.diluent` is `He` or `CO2` (default `N2`) → `none`.
2. Fuel model: droplets are evaluated for methanol and for n-heptane separately; solids use n-heptane as a surrogate; gas jets have none → `none`.
3. Target flame temperature T_ad by interpolation on the O2 x pressure grid. Outside the grid → `none`.
4. Physics estimate (below).
5. Fewer than 5 test runs for the class → no data result.
6. Envelope check on T_ad and pressure **before** any neighbour search. Outside → `physics_only`.
7. Distance-weighted kNN in `(T_ad / 100 K, log10(P) / 0.15, flow / 5 cm/s)`. Nearest run farther than 2 → `physics_only`.
8. Share that kept burning = weighted mean of sustained = 1, marginal = 0.5, extinguished or no ignition = 0. Zones from that share.

Droplets: `predict()` evaluates both fuels and shows the more flammable result; `explanation` names both. `predictDropletByFuel(c, points, options)` returns each one.

## Physics estimate

| | Droplets | Solids |
|---|---|---|
| fuel model | methanol or n-heptane | n-heptane, as a surrogate |
| `limit_k` | limiting T_ad of the fuel, calibrated on the FLEX limiting oxygen index | coldest tested condition of the class that still burned |
| `margin_k` | `t_ad_k - limit_k` | `t_ad_k - limit_k` |
| `margin_ratio_vs_iss` | margin / margin in ISS air, same limit | margin / margin in ISS air, same limit |

For solids the ratio is "relative to the coldest tested condition that still burned". That condition is the coldest one tested, not a measured flammability limit, and the note says so. No ratio is given at or below the limit.

## Parameters and why

Set on 2026-11-14. Frozen at 22:00 CET: no tuning after that time.

| Parameter | Value | Reason |
|---|---|---|
| `T_AD_SCALE_K` | 100 K | Given in PHYSICS.md section 7. Near the limit, 1% O2 is about 75 to 85 K, so one unit is a little more than one tested oxygen step. |
| `LOG_P_SCALE` | 0.15 | Given in SPEC module 4 and PHYSICS.md. One unit is a factor of 1.41 in pressure, so 0.7 atm and 1 atm are about one unit apart. |
| `FLOW_SCALE_CM_S` | 5 cm/s | Given in SPEC module 4. BASS-II reports the SIBAL quenching boundary between 1 and 5 cm/s, so 5 cm/s is the scale on which flow changes the outcome. |
| `K_NEIGHBOURS` | 8 | Given in SPEC module 4. Also the cap on `evidence` in the contract. |
| `WEIGHT_EPS` | 0.1 | Weight is `1 / (d + 0.1)`. A coincident run then counts 10 times a run one unit away, so one repeat cannot fully override its neighbours. Not tuned against outcomes. |
| `MAX_NEAREST_DISTANCE` | 2 | Given in SPEC module 4: nearest run farther than 2 → no data result. |
| `MIN_POINTS_PER_CLASS` | 5 | Given in SPEC module 4. |
| `ZONE_EXTINGUISHES_BELOW`, `ZONE_SUSTAINED_ABOVE` | 0.25, 0.6 | Given in SPEC module 4. Kept: with them, the published FLEX limits land where they should (n-heptane 13% O2 → extinguishes, 15% → marginal, 16% → sustained; methanol 12% → marginal, 13% → sustained). |
| `ENVELOPE_MARGIN` | 0.5 scale units (50 K in T_ad, a factor of 1.19 in pressure) | Half a distance unit on each axis: a target just outside the tested range is still at most half a unit from a tested value. Wide enough that BASS-II's measured 99.2 to 99.5 kPa and the 101.3 kPa used in the data count as the same pressure; narrow enough that 70.3 kPa is outside the solid data (all at about 101 kPa) and that 56.5 kPa is outside the droplet data (71 to 103 kPa). |
| evidence coverage (`confidence`) | `(1/k) * sum(exp(-d_i^2 / 2))` over the `k = 8` nearest runs | One Gaussian kernel with a bandwidth of one distance unit, so distance is penalised once. A run on the target counts 1, at distance 1 it counts 0.61, at distance 2 it counts 0.14; missing neighbours count 0. It replaces the earlier `(runs within 1) / 8 / (1 + mean distance)`, which penalised distance twice and gave 0.13 for thin fabric in air at 10 cm/s although 35 fabric runs surround that condition. |
| `ISS_REFERENCE` | 21% O2, 101.3 kPa | The ISS preset in `habitats.json` and the reference row of PHYSICS.md section 5. |

The distance scales, k, zone thresholds and limits are the SPEC and PHYSICS values; none was tuned against the outcomes.

## Numbers in text

Numeric fields keep exact values (one decimal for temperatures); tests compare with a tolerance of 5 K. Text shown to users (`explanation`, `physics.note`) rounds temperatures to the nearest 10 K: "about 220 K above the hottest tested condition (about 2330 K)". A difference that rounds to 0 is written as "at".

## Other choices

- **Interpolation is linear in O2 and in log(pressure)**, not in pressure. T_ad depends on pressure through dissociation, close to linear in log P. Linear-in-pressure was 7 K off for the spacesuit atmosphere (29.6 kPa, between the 20 and 40 kPa grid columns); log-pressure is within 1 K of the precomputed habitat values.
- **Diluent is an option**, `predict(c, points, { diluent })`, because `Conditions` has no diluent. Helium gives `none` (the physics is invalid for helium and helium runs are not points). CO2 gives `none` as well: there is no CO2 fraction in `Conditions` and the grid is O2/N2 only.
- **Flow.** If the target has no flow (all habitat presets), the flow dimension is dropped and a warning says so. If a neighbour has no reported flow, flow is ignored for that run and a warning counts those runs.
- **Normal gravity.** At `gravity_g >= 1` a warning says that every test run is a microgravity run.

## Suppression notes

Verbatim `key_findings` from curated data with their provenance, never generated: for droplets from FLEX (PSI-69) and FLEX-2 (PSI-68), for solids from BASS (PSI-26) and BASS-II (PSI-25), keeping findings whose text matches `suppress`, `quench` or `dilut`.

## Material names

`material_class` is coarse, so the explanation lists the material families of the evidence runs (first word of the material name: SIBAL, Nomex, PMMA, silicone) and warns when a family did not burn in nearby runs.

## Known limits

- Every test run is a microgravity run. Nothing here predicts partial gravity or 1 g.
- No solid-material test in the PSI microgravity data is above about 22% O2 or away from about 1 atm, so every exploration atmosphere is `physics_only` for solids.
- Droplet outcomes are positions relative to the published FLEX limiting oxygen index (see `data/curated/mappings.md`), so droplet results near the limit restate that rule.
- BASS-II outcomes are the result at the initial flow; later extinctions during flow sweeps are not points.
