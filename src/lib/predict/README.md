# Predictor

`predict(conditions, points, options?)` in `index.ts`. Spec: `docs/PHYSICS.md` section 7, `docs/SPEC.md` modules 4 and 4b.
Deterministic TypeScript, no LLM. Flame temperatures are read from `data/curated/flame_temperature.json` (Cantera, offline) and only interpolated (`physics.ts`).

## What it returns

| mode | when | zone | what to show |
|---|---|---|---|
| `data` | target inside the tested envelope of the material class and a test run within distance 2 | `extinguishes`, `marginal` or `sustained` | share of nearby runs that kept burning, the evidence runs, plus the physics estimate as context |
| `physics_only` | outside the envelope (flame temperature or pressure), or no run within distance 2 | `no_evidence` | "physics estimate, no test data at these conditions" and the margin |
| `none` | helium- or CO2-diluted target, a class with no fuel model (gas jets), or a target outside the flame-temperature grid | `no_evidence` | the reason only |

`confidence` is **evidence coverage**, not a probability: it says how many test runs lie close to the target. Every `explanation` ends with that sentence.

`physics.note` always starts with "Physics estimate, not test data:". A margin is a thermodynamic estimate; it never overrides a test result.

Partial gravity is covered by no mode. `PARTIAL_GRAVITY_WARNING` is added whenever `0 < gravity_g < 1`.

## Steps

1. Helium or CO2 diluent (third argument, default N2) → `none`.
2. Fuel model: droplets are evaluated for methanol and for n-heptane separately; solids use n-heptane as a surrogate; gas jets have none → `none`.
3. Target flame temperature T_ad by interpolation on the O2 x pressure grid. Outside the grid → `none`.
4. Physics estimate. Droplets: margin above the fuel limit calibrated on the FLEX limiting oxygen index, and its ratio to the margin in ISS air. Solids: distance above the hottest tested condition of the class and above the coldest condition that still burned.
5. Fewer than 5 test runs for the class → no data result.
6. Envelope check on T_ad and pressure **before** any neighbour search. Outside → `physics_only`.
7. Distance-weighted kNN in `(T_ad / 100 K, log10(P) / 0.15, flow / 5 cm/s)`. Nearest run farther than 2 → `physics_only`.
8. Share that kept burning = weighted mean of sustained = 1, marginal = 0.5, extinguished or no ignition = 0. Zones from that share.

Droplets without a fuel: both fuels are evaluated and the more flammable result is the headline; `explanation` names both. `predictDropletByFuel()` returns both, `options.fuel` forces one.

## Parameters and why

Set on 2026-11-14 before 22:00 CET. No tuning after that time.

| Parameter | Value | Reason |
|---|---|---|
| `T_AD_SCALE_K` | 100 K | Given in PHYSICS.md section 7. Near the limit, 1% O2 is about 75 to 85 K, so one unit is a little more than one tested oxygen step. |
| `LOG_P_SCALE` | 0.15 | Given in SPEC module 4 and PHYSICS.md. One unit is a factor of 1.41 in pressure, so 0.7 atm and 1 atm are about one unit apart. |
| `FLOW_SCALE_CM_S` | 5 cm/s | Given in SPEC module 4. BASS-II reports the SIBAL quenching boundary between 1 and 5 cm/s, so 5 cm/s is the scale on which flow changes the outcome. |
| `K_NEIGHBOURS` | 8 | Given in SPEC module 4. Also the cap on `evidence` in the contract. |
| `WEIGHT_EPS` | 0.1 | Weight is `1 / (d + 0.1)`. A coincident run then counts 10 times a run one unit away, so one repeat cannot fully override its neighbours. Not tuned against outcomes. |
| `MAX_NEAREST_DISTANCE` | 2 | Given in SPEC module 4: nearest run farther than 2 → no data result. |
| `CLOSE_DISTANCE` | 1 | Given in SPEC module 4 ("neighbours within d < 1"). |
| `MIN_POINTS_PER_CLASS` | 5 | Given in SPEC module 4. |
| `ZONE_EXTINGUISHES_BELOW`, `ZONE_SUSTAINED_ABOVE` | 0.25, 0.6 | Given in SPEC module 4. Kept: with them, the published FLEX limits land where they should (n-heptane 13% O2 → extinguishes, 15% → marginal, 16% → sustained; methanol 12% → marginal, 13% → sustained). |
| `ENVELOPE_MARGIN` | 0.5 scale units (50 K in T_ad, a factor of 1.19 in pressure) | Half a distance unit on each axis: a target just outside the tested range is still at most half a unit from a tested value. Wide enough that BASS-II's measured 99.2 to 99.5 kPa and the 101.3 kPa used in the data count as the same pressure; narrow enough that 70.3 kPa is outside the solid data (all at about 101 kPa) and that 56.5 kPa is outside the droplet data (71 to 103 kPa). |
| confidence | `(runs within distance 1) / 8 / (1 + mean distance of the 8)` | Both ingredients are named in SPEC module 4. Eight coincident runs give 1; sparse or distant evidence goes towards 0. |
| `ISS_REFERENCE` | 21% O2, 101.3 kPa | The ISS preset in `habitats.json` and the reference row of PHYSICS.md section 5. |

Nothing was tuned against the outcomes: the SPEC and PHYSICS values gave the required behaviour on the real data on the first run.

## Choices that differ from a literal reading of the spec

- **Interpolation is linear in O2 and in log(pressure)**, not in pressure. T_ad depends on pressure through dissociation, close to linear in log P. Linear-in-pressure was 7 K off for the spacesuit atmosphere (29.6 kPa, between the 20 and 40 kPa grid columns); log-pressure is within 1 K of the precomputed habitat values.
- **Solids get no `margin_ratio_vs_iss`.** The coldest burning test is an upper bound on the true limit, not a measured limit; a ratio built on it would overstate how much more margin a habitat has. Droplets have a calibrated limit, so they do get the ratio.
- **A margin ratio is given only above the limit.** Below it the ratio has no meaning.
- **Helium and CO2 need a third argument.** `Conditions` has no diluent, so the target is O2/N2 unless `options.diluent` says otherwise. CO2 gives `none` as well: there is no CO2 fraction in `Conditions` and the grid is O2/N2 only.
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
