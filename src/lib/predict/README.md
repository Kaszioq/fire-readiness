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
6. Envelope check on T_ad, pressure and flow **before** any neighbour search. Outside → `physics_only`. T_ad and pressure have a margin of half a distance unit. Flow has none: a target flow below the lowest or above the highest tested flow of the class is outside.
7. Distance-weighted kNN in `(T_ad / 100 K, log10(P) / 0.15, flow / 5 cm/s)` over the up to 8 nearest runs **within distance 2**. A run farther than 2 neither votes nor is listed as evidence. No run within 2 → `physics_only`.
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

Set on 2026-11-14. The two envelope rules marked "before this" were added after 22:00 CET as correctness fixes, on the tech lead's decision; no number was tuned against outcomes.

| Parameter | Value | Reason |
|---|---|---|
| `T_AD_SCALE_K` | 100 K | Given in PHYSICS.md section 7. Near the limit, 1% O2 is about 75 to 85 K, so one unit is a little more than one tested oxygen step. |
| `LOG_P_SCALE` | 0.15 | Given in SPEC module 4 and PHYSICS.md. One unit is a factor of 1.41 in pressure, so 0.7 atm and 1 atm are about one unit apart. |
| `FLOW_SCALE_CM_S` | 5 cm/s | Given in SPEC module 4. BASS-II reports the SIBAL quenching boundary between 1 and 5 cm/s, so 5 cm/s is the scale on which flow changes the outcome. |
| `K_NEIGHBOURS` | 8 | Given in SPEC module 4. Also the cap on `evidence` in the contract. |
| `WEIGHT_EPS` | 0.1 | Weight is `1 / (d + 0.1)`. A coincident run then counts 10 times a run one unit away, so one repeat cannot fully override its neighbours. Not tuned against outcomes. |
| `MAX_NEAREST_DISTANCE` | 2 | Given in SPEC module 4: nearest run farther than 2 → no data result. Applied to every neighbour, not only the nearest: before this, runs beyond 2 still voted (thick solids at 30 to 60 cm/s were "sustained" on 7 of 8 voters beyond the limit). |
| `LIMIT_POINT_DISTANCE` | 0.5 | If the nearest run is a measured limit point (outcome `marginal`: a FLEX limiting-oxygen-index run or a BASS-II extinction-velocity point) closer than half a distance unit, the zone is `marginal` whatever the weighted share. A measured limit at the target is the answer; runs that burned farther from the limit must not outvote it. Before this, thin PMMA in air at 1 cm/s came out "sustained" (77%) although 1 cm/s is the measured extinction velocity. General rule, no per-material case. Half a unit is the same margin as `ENVELOPE_MARGIN`. |
| ties at the cut-off | all tied runs vote and share the places left | When more runs sit at exactly the distance of the eighth neighbour than there are places left, the choice among them would depend on their ids. All of them vote, each with `places left / number tied` of its weight; the evidence list still shows eight. Without such a tie nothing changes. Found by an independent recomputation on 2026-11-15: thin solids at 22% O2 without a flow had 8 runs with different outcomes tied at the cut-off. A limit point that ties with the nearest run counts as nearest for `LIMIT_POINT_DISTANCE`. |
| flow envelope | tested range of the class, no margin | Both ends of the flow range are extinction mechanisms: quenching at low flow, blowoff at high flow. Thin fabric was tested at 5 to 20 cm/s and BASS-II puts the SIBAL quenching boundary between 1 and 5 cm/s, so a "sustained" result must not be carried down to still air. Before this, thin fabric in air at 0 cm/s came out "sustained". |
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
- **Flow.** If the target has no flow (all habitat presets), the flow dimension is dropped and a warning gives the flow range of the evidence runs, which is the range the result applies to. If a neighbour has no reported flow, flow is ignored for that run and a warning counts those runs. Every data explanation states the flow range of its evidence.
- **One material family.** When all evidence runs are one material (for example only silicone), a warning says that no other material of the class was tested near the target.
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
- **The solid data cannot locate a flammability limit.** 134 of the 140 solid runs are "sustained": the six others are silicone (4), Nomex (1) and one PMMA rod that did not ignite at 13.6% O2. So inside the envelope a solid result is "sustained" almost everywhere, and what it really says is "runs like this burned", not "this is above a limit". Below the coldest tested condition the answer is `physics_only`, not "extinguishes".
- `material_class` mixes materials with different chemistry. Thin solids at 20 cm/s come out "extinguishes" because the only runs near that flow are silicone; the warnings say so.
