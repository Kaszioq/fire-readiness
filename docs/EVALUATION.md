# EVALUATION.md: what the predictor and the ranking can and cannot show

Run on 2026-11-15 on the curated snapshot of 2026-11-14 (243 test runs, 24 investigations). Reproduce with:

```bash
npx tsx scripts/eval_predictor.ts
npx tsx scripts/eval_rank_sensitivity.ts
```

The tables below are the unedited output of those two scripts.

## Summary in plain numbers

- **Droplets: 101 of 101 runs reproduced. This is a consistency check, not a prediction score.** The droplet outcomes were assigned from the published FLEX limiting oxygen index (above it = sustained, at it = marginal, below it = extinguished; `data/curated/mappings.md`). The predictor works on flame temperature, which rises with oxygen, so it is recovering the labelling rule. It shows the code is consistent with the rule; it does not show that the predictor forecasts an independent measurement.
- **Solids: the predictor does no better than "always sustained".** Balanced accuracy is 49% for thick solids and 46% for thin solids, against a baseline of 50%. 131 of the 134 ordinary solid runs are "sustained", and the predictor reproduces those. Of the three that are not, it reproduces none when the run is left out: the PMMA rod that did not ignite at 13.6% O2 comes out "sustained", the extinction-velocity point at 16% O2 comes out "sustained", and the one at 21% O2 gets no data result because it is the lowest flow tested. One sustained thin-solid run that sits next to a measured extinction-velocity point comes out "marginal", because a measured limit at the target decides the zone.
- **Thin fabric: 31 of 31, which says nothing.** Every thin-fabric run in the data is "sustained", so any method that answers "sustained" scores 100%.
- **The 91% in the "all" row is carried by the droplets.** Do not quote it as the accuracy of the tool.
- **Ranking: stable, not validated.** With each weight moved by 20%, the top 5 for the Moon base is the same five investigations in all 10 variants. For ISS air and the 8.2 psia exploration atmosphere it is the same five in 8 and 9 of 10 variants; in the others one investigation in fifth place is swapped (overlap 0.67). There is no ground truth for relevance, so this measures stability only.

## What this evaluation cannot test

- **Outside the tested envelope.** Every exploration atmosphere is outside the solid data (no solid run above about 22% O2 or away from about 1 atm). The answer there is `no_evidence` with a physics estimate, and no run exists to check that estimate against. Leave-one-out only probes conditions that were tested.
- **The physics margin.** For droplets the limiting flame temperature is calibrated on the same limiting oxygen index that labels the runs, so agreement is built in. The independent result is the one in `docs/PHYSICS.md` section 3: the limits measured in nitrogen and with CO2 give the same flame temperature per fuel (within 17 K for methanol, 2 K for n-heptane). For solids the margin is relative to the coldest tested condition that still burned, which is not a measured limit.
- **Partial gravity and 1 g.** Every run is a microgravity run.
- **Fire-resistant materials.** Excluded here because the predictor gives no estimate for that class.
- **Material within a class.** Thick and thin solids are almost all PMMA and thin fabric is almost all SIBAL; nothing here tests another material of the same class.
- **Label quality.** BASS-II outcomes are the result at the initial flow and are parsed from the experimental table; they are not yet verified by a human (`data/verification.csv`).

## How leave-one-out was done

For each run: remove it from the data, build the conditions of that run (oxygen, pressure, flow, material class, 0 g), call the predictor, compare its zone with the recorded outcome. `sustained` ↔ sustained, `marginal` ↔ marginal, `extinguishes` ↔ extinguished or no ignition ("not burning"). A run for which the predictor gives no data result counts as a miss. Droplets are evaluated with the fuel of the run. Balanced accuracy is the mean of the recalls of the outcomes present in the class. The baseline is the balanced accuracy of answering "sustained" every time.

## Predictor: leave-one-out (235 runs, fire_resistant excluded)

| Class | Runs | Outcomes in the data | No data result | Recall sustained | Recall marginal | Recall not burning | Balanced accuracy | "Always sustained" baseline |
|---|---|---|---|---|---|---|---|---|
| liquid_droplet (methanol) | 54 | 46 sustained, 8 marginal | 0 (0%) | 46/46 (100%) | 8/8 (100%) | none in data | 100% | 50% |
| liquid_droplet (n-heptane) | 47 | 36 sustained, 5 marginal, 6 not burning | 0 (0%) | 36/36 (100%) | 5/5 (100%) | 6/6 (100%) | 100% | 33% |
| thick_solid | 79 | 78 sustained, 1 not burning | 1 (1%) | 77/78 (99%) | none in data | 0/1 (0%) | 49% | 50% |
| thin_fabric | 31 | 31 sustained | 0 (0%) | 31/31 (100%) | none in data | none in data | 100% | 100% |
| thin_solid | 24 | 22 sustained, 2 marginal | 2 (8%) | 20/22 (91%) | 0/2 (0%) | none in data | 46% | 50% |
| all | 235 | 213 sustained, 15 marginal, 7 not burning | 3 (1%) | 210/213 (99%) | 13/15 (87%) | 6/7 (86%) | 90% | 33% |

Runs not reproduced: 6 of 235.

| Run | Class | Material | O2 | Flow cm/s | Recorded | Predicted without it |
|---|---|---|---|---|---|---|
| PSI-25:B9 | thin_solid | PMMA film (2 cm   0.1 mm PMMA film) | 21% | 2 | sustained | marginal |
| PSI-25:B14 | thin_solid | PMMA film (1 cm wide 200 micron thick PM | 15% | 5 | sustained | no data result (physics_only) |
| PSI-25:M12 | thick_solid | PMMA (slab, rod or spherical section) (2 | 21.7% | 1 | sustained | no data result (physics_only) |
| PSI-25:O12 | thick_solid | PMMA (slab, rod or spherical section) (3 | 13.6% | not reported | not burning | sustained |
| PSI-25:Vcr-21 | thin_solid | PMMA film 0.1 to 0.4 mm (extinction velo | 21% | 1 | marginal | no data result (physics_only) |
| PSI-25:Vcr-16 | thin_solid | PMMA film 0.1 to 0.4 mm (extinction velo | 16% | 3 | marginal | sustained |

## Ranking: sensitivity to the weights (each weight +/-20%, renormalised; thin fabric target)

### moon_base

Baseline top 5: PSI-68, PSI-69, PSI-20, PSI-25, PSI-99

| Weight changed | -20%: overlap | -20%: top 5 | +20%: overlap | +20%: top 5 |
|---|---|---|---|---|
| condition_coverage (0.35) | 1.00 | PSI-68, PSI-69, PSI-25, PSI-20, PSI-99 | 1.00 | PSI-68, PSI-69, PSI-20, PSI-25, PSI-99 |
| fuel_relevance (0.25) | 1.00 | PSI-68, PSI-69, PSI-20, PSI-25, PSI-99 | 1.00 | PSI-68, PSI-69, PSI-25, PSI-20, PSI-99 |
| safety_domain (0.2) | 1.00 | PSI-68, PSI-69, PSI-20, PSI-25, PSI-99 | 1.00 | PSI-68, PSI-69, PSI-20, PSI-25, PSI-99 |
| data_availability (0.1) | 1.00 | PSI-68, PSI-69, PSI-20, PSI-25, PSI-99 | 1.00 | PSI-68, PSI-69, PSI-20, PSI-25, PSI-99 |
| tier (0.1) | 1.00 | PSI-68, PSI-69, PSI-20, PSI-25, PSI-99 | 1.00 | PSI-68, PSI-69, PSI-20, PSI-25, PSI-99 |

Lowest overlap 1.00, mean 1.00; the top 5 kept the same order in 8 of 10 variants.

### iss

Baseline top 5: PSI-25, PSI-68, PSI-69, PSI-20, PSI-98

| Weight changed | -20%: overlap | -20%: top 5 | +20%: overlap | +20%: top 5 |
|---|---|---|---|---|
| condition_coverage (0.35) | 0.67 | PSI-25, PSI-68, PSI-69, PSI-98, PSI-99 | 1.00 | PSI-25, PSI-68, PSI-69, PSI-20, PSI-98 |
| fuel_relevance (0.25) | 1.00 | PSI-25, PSI-68, PSI-69, PSI-20, PSI-98 | 0.67 | PSI-25, PSI-68, PSI-69, PSI-98, PSI-99 |
| safety_domain (0.2) | 1.00 | PSI-25, PSI-68, PSI-69, PSI-20, PSI-98 | 1.00 | PSI-25, PSI-68, PSI-69, PSI-20, PSI-98 |
| data_availability (0.1) | 1.00 | PSI-25, PSI-68, PSI-69, PSI-20, PSI-98 | 1.00 | PSI-25, PSI-68, PSI-69, PSI-20, PSI-98 |
| tier (0.1) | 1.00 | PSI-25, PSI-68, PSI-69, PSI-20, PSI-98 | 1.00 | PSI-25, PSI-68, PSI-69, PSI-20, PSI-98 |

Lowest overlap 0.67, mean 0.93; the top 5 kept the same order in 8 of 10 variants.

### exploration_8_2

Baseline top 5: PSI-20, PSI-69, PSI-68, PSI-25, PSI-99

| Weight changed | -20%: overlap | -20%: top 5 | +20%: overlap | +20%: top 5 |
|---|---|---|---|---|
| condition_coverage (0.35) | 1.00 | PSI-20, PSI-25, PSI-69, PSI-68, PSI-99 | 0.67 | PSI-20, PSI-69, PSI-68, PSI-25, PSI-159 |
| fuel_relevance (0.25) | 1.00 | PSI-20, PSI-69, PSI-68, PSI-25, PSI-99 | 1.00 | PSI-20, PSI-69, PSI-25, PSI-68, PSI-99 |
| safety_domain (0.2) | 1.00 | PSI-20, PSI-69, PSI-68, PSI-25, PSI-99 | 1.00 | PSI-20, PSI-69, PSI-68, PSI-25, PSI-99 |
| data_availability (0.1) | 1.00 | PSI-20, PSI-69, PSI-68, PSI-25, PSI-99 | 1.00 | PSI-20, PSI-69, PSI-68, PSI-25, PSI-99 |
| tier (0.1) | 1.00 | PSI-20, PSI-69, PSI-68, PSI-25, PSI-99 | 1.00 | PSI-20, PSI-69, PSI-68, PSI-25, PSI-99 |

Lowest overlap 0.67, mean 0.97; the top 5 kept the same order in 7 of 10 variants.
