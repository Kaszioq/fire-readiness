# Ranking

`rankInvestigations(target, investigations)` in `index.ts`. Spec: `docs/SPEC.md` module 2.
Score = sum of `value x weight` over five components. Every component has a `reason` written for the UI.

## Weights

| Component | Weight | Source |
|---|---|---|
| `condition_coverage` | 0.35 | SPEC module 2 |
| `fuel_relevance` | 0.25 | SPEC module 2 |
| `safety_domain` | 0.20 | SPEC module 2 |
| `data_availability` | 0.10 | SPEC module 2 |
| `tier` | 0.10 | SPEC module 2 |

No weight was changed. A change needs a written reason here. Sensitivity to the weights: `docs/EVALUATION.md`.

## Components

### condition_coverage

- Both ranges reported (oxygen and pressure): 1.0 when the target is inside both. Outside, `1 / (1 + d)`, where `d` is the distance to the range box: oxygen in mole fraction / 0.1, pressure in log10(kPa) / 0.3 (SPEC module 2). One distance unit halves the coverage.
- One range reported: the same formula on that axis, times 0.5. A record that reports only oxygen cannot show that it covers the target pressure, so it gets at most half credit. Example: Saffire-I and Saffire-II report oxygen but not pressure.
- No range reported: 0, reason "conditions not reported".
- A range with one bound is treated as that single value.
- "Inside" means inside the range box. It does not prove that this exact oxygen and pressure combination was tested; the reason says so.

### fuel_relevance

The target material class has a phase: `thin_fabric`, `thin_solid`, `thick_solid` and `fire_resistant` are solid, `liquid_droplet` is liquid, `gas_jet` is gas.

| Investigation fuel | Solid target | Liquid target | Gas target |
|---|---|---|---|
| solid | 1.0 | 0.6 | 0.6 |
| liquid | 0.6 | 1.0 | 0.6 |
| gas | 0.4 | 0.4 | 1.0 |

The first column is the SPEC mapping (solids 1.0, liquids 0.6, gas jets 0.4). For a liquid or gas target the matching phase gets 1.0 and the others keep their SPEC value, at most 0.6. Several phases: the best one counts. No phase in the record: the phases of the investigations whose data it reuses (`uses_data_from`), and the reason names them; if there are none, 0 with "fuel not reported".

The mapping does not look at the material inside a phase: a thin-fabric target gives every solid-fuel investigation 1.0.

### safety_domain

Best of the investigation's domains: prevention, detection or suppression 1.0, fundamental 0.4. None reported: 0.

### data_availability

Experimental table in PSI 1.0; no table but files listed 0.5; nothing 0.

### tier

Tier 1 = 1.0, tier 2 = 0.6, tier 3 = 0.3. Not assigned: 0.

## Ties

Equal scores are ordered by PSI number, lowest first, so the order is stable.

## What the ranking is not

It measures how relevant an investigation is to the target, not how hazardous the target is. FLEX and FLEX-2 lead for the Moon base because their tested oxygen and pressure ranges contain it, although they burn droplets; the solid-fuel experiments rank below them because none was run above about 22% O2 or away from about 1 atm. That ordering is the data gap, shown as a ranking.
