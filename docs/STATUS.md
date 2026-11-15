# STATUS.md: where the project stands (updated Sun 2026-11-15, 06:10 CET)

Read this after `CLAUDE.md` and before starting work. It records what changed since the app skeleton commit (`cb172c7`) so no session works from stale assumptions.

## 1. The app now runs on real NASA data

- `src/lib/data/index.ts` imports `data/curated/*.json` (no longer `data/mock/`). `DATA_IS_MOCK = false`.
- Reports: `POST /api/report` serves a live report when an LLM is configured, otherwise `data/cached_reports/<habitat_id>.json` (all 9 presets, written by `npm run reports`). Nothing in the app reads `data/mock/` anymore.
- `data/mock/` stays in the repo for tests and reference, but production pages must not import it.

## 2. Curated dataset (`data/curated/`)

| File | Content |
|---|---|
| `investigations.json` | 24 PSI combustion investigations (tier 1: 10, tier 2: 6, tier 3: 8), every field with provenance. 352 publications (full lists from PSI). |
| `flammability_points.json` | 243 test runs: FLEX (PSI-69) 101 (O2/N2 only), BASS-II (PSI-25) 128 + 2 extinction-velocity limit points (Table 2.1 of the BASS-II report), Saffire-I (PSI-98) 2, Saffire-II (PSI-99) 10. 8 silicone/Nomex runs are class `fire_resistant` |
| `habitats.json` | 9 presets: earth, iss, orion, moon_base, pressurized_rover, mars_habitat, spacesuit, exploration_10_2, exploration_8_2 |
| `meta.json` | counters for the header: 622 of 622 fields verified, 0 of 243 test runs unverified (human verification applied 2026-11-15, section 3) |
| `excluded.json` | PSI-181 (solder) and PSI-108 (thermocapillary flow): returned by the PSI "combustion" search but not combustion |
| `mappings.md` | **Read before using the data.** How every table was mapped, all assumptions, all sources. |

Other data files:
- `data/raw/psi_combustion_snapshot.json`: snapshot of all 26 PSI records (text fields) and their 25 experimental-table CSVs, taken 2026-11-14 via the PSI web API.
- `data/extracts/flex_tests.txt`, `bass2_tests.txt`: per-test extracts used by the builder. `psi_publications.json`: full PSI publication lists.
- `data/raw/docs/` (gitignored): large PSI documents read during curation (BASS-II Summary Report PDF, Saffire-I workbook).
- `data/verification.csv`: 575 rows, all checked by verifier K on 2026-11-15 (573 ok, 2 fixed). `data/verification_ledger.csv` keeps those decisions across rebuilds.

## 3. How to regenerate and check

```bash
python scripts/build_seed_data.py   # rebuilds everything in data/curated/ + data/verification.csv
python scripts/check_quotes.py      # every quote attributed to PSI must appear verbatim in the snapshot (171/171 pass)
npm run validate:data               # zod schemas + cross references
```
Edit data only through `scripts/build_seed_data.py`, then rerun all three. Never hand-edit the JSON.

**Human verification.** `npm run verify:apply` writes the statuses of `data/verification.csv` into the curated JSON (`prov.verified`, `verified_by`, `verified_at`) and recounts `meta.json`. `build_seed_data.py` resets `verification.csv` to "todo" on every rebuild, so run `npm run verify:apply` after each rebuild: rows whose value, quote and source did not change get their decision back from `data/verification_ledger.csv`; changed rows stay "todo" and must be verified again. `validate:data` fails when `meta.json` and the data disagree.

Two corrections came out of the verification and are in the builder as well: the full FLEX procedure quote (PSI-69, `key_findings[0]`) and the NTRS URL for the SAME smoke-particle finding (PSI-102, `key_findings[1]`; the old link was dead).

`scripts/fetch_psi.py` does not exist yet. psi.nasa.gov was reachable only from a browser, so the snapshot was taken in the browser. The working download endpoint is documented in `docs/DATA_SOURCES.md` section 3.

## 4. Contract changes (team-approved, 2026-11-14)

Applied in `src/lib/types.ts`, `src/lib/schemas.ts`, `docs/CONTRACTS.md`, `docs/SPEC.md`:
- `MaterialClass` gained `'thin_solid'` (thin PMMA films). BASS-II films use it.
- 2026-11-15 00:50: `MaterialClass` gained `'fire_resistant'` (silicone, Nomex), approved by Kuba. Reason and rule: `data/curated/mappings.md`. The predictor gives no estimate for it; `SOLID_CLASSES` in `src/components/format.ts` includes it (they are solid test runs).
- `HabitatId` gained `'exploration_10_2'` (10.2 psia, 26.5% O2) and `'exploration_8_2'` (8.2 psia, 34% O2), NASA-considered exploration atmospheres quoted in the ACME BRE (PSI-20) objective.

Code that maps over `MaterialClass` or `HabitatId` (ranking fuel weights, UI labels, selectors) must handle the new values.

## 5. Data facts every role must respect

1. **No solid-material test point exists at the Moon base atmosphere** (30% O2, 70 kPa). All solid points are at about 1 atm and at most about 22% O2. The predictor must return `no_evidence` (or very low confidence) for solids at Moon base conditions. This gap is a key message of the demo, not a bug.
2. What does exist near Moon base conditions: FLEX droplets at 30 to 34% O2 near 0.7 atm, and ACME BRE gas-burner emulation at 26.5, 34 and 40% O2 and 0.57 to 1 bar (findings only, no per-test points).
3. **FLEX points (revised 16:10)**: only the 101 O2/N2 tests are predictor points (CO2 and He suppressant tests are excluded because `Conditions` has no diluent; their effect is in `key_findings`). Outcome = position relative to the **published LOI** (methanol 0.12, heptane 0.15; Dietrich et al. 2014): above = sustained, within 0.005 = marginal, below = extinguished. The earlier burn-time rule was dropped because it could not tell 12% from 21% O2. Burn time and test end are kept in `prov.note`. Droplets self-extinguishing before burnout is normal droplet physics, not "non-flammable".
4. **BASS-II (revised 16:10)**: flow units (cm/s) and pressure (about 1 atm) are confirmed from the BASS-II Summary Report (NASA/TM-20210011385). Outcome is now the result at the INITIAL O2 and flow: every ignited test is `sustained`, the one 'no ign' test is `no_ignition`. Extinctions that happened later during flow sweeps are noted in `prov.note` and are not attached to the initial flow anymore.
5. **Saffire pressure (101.3 kPa) is an assumption**, flagged in `prov.note`.
6. **Orion** values come only from a secondary source (Wikipedia): `is_assumption: true`, show as "scenario".
7. **SAME vs SAME-R disagree** on whether low-gravity smoke particles are larger than in 1 g. Show both findings; do not pick one.
8. `key_findings` now include findings from publications (`source_type: 'publication'`) and from the BASS-II report (`'psi_document'`), each with a verbatim quote from an abstract or report page. All are `llm_extracted` and unverified.
9. Header counter text is "verified against NASA source": `api_direct` fields count as verified by contract; they were not checked by a human.
10. **Partial gravity is NOT bounded by 0g and 1g.** The challenge text suggests it might be, but NASA's FM2 team (the planned lunar flammability experiment) reports that the oxygen concentration needed for flammability may reach a minimum near lunar gravity, so a lunar-habitat fire can be worse than in 0g and possibly worse than in 1g. Sources: Ferkul et al., LPSC 2026 (https://ntrs.nasa.gov/citations/20260000646); NASA "Fire on the Moon" overview (https://ntrs.nasa.gov/api/citations/20210020516/downloads/Fire%20on%20the%20Moon-Overview%20charts-v1.pdf); NASA FM2 page (https://www.nasa.gov/flammability-of-materials-on-the-moon-fm2/). The predictor warning text (`PARTIAL_GRAVITY_WARNING` in `src/lib/predict/index.ts`, SPEC module 4) was updated accordingly. Use this as a key demo message, never the opposite.
11. **Scope the main gap precisely:** "no solid-material test in the PSI microgravity data at the Moon base atmosphere". Ground (1 g) tests at elevated O2 exist outside PSI, so never say "nobody has tested this".
12. **Fire-resistant materials (2026-11-15)**: silicone and Nomex are class `fire_resistant`, not pooled with cotton/PMMA, because each has its own oxygen limit. Never present them as "safe": Nomex failed NASA-STD-6001 Test 1 at 30% O2 and 70.1 kPa in 1 g (NTRS 20070018178), and no fire-resistant material was tested in PSI microgravity data above about 22% O2.
13. **Solid data are almost all "sustained" (131 of 134 ordinary solid runs; the rest are 2 extinction-velocity limit points and 1 no-ignition run)**: PSI records few extinctions with a stated flow. The two BASS-II extinction-velocity points are the only measured low-flow limits for thin solids. State this as a limitation in the UI and README; do not hide it.

## 5b. Plan change at 19:00: physics layer (role C)

- New: `docs/PHYSICS.md`, `scripts/compute_flame_temperature.py`, `data/curated/flame_temperature.json` (adiabatic flame temperature for every test, habitat and a slider grid).
- Key result: FLEX LOI in N2 and with CO2 give the same flame temperature per fuel (1674/1657 K methanol, 1910/1908 K heptane), so a calibrated limiting flame temperature is used as the physics axis. It fails for helium (documented).
- The predictor becomes hybrid (modes `data`, `physics_only`, `none`). The smoke simulator (module 6) was cut here; it was built later on 2026-11-15 as an illustrative model (`/simulator`, `src/components/smoke-sim/README.md`).
- `flame_temperature.json` is not validated by zod yet; role C adds the types (PHYSICS.md section 7), role A then loads it in `src/lib/data/index.ts`.
- Requires `pip install cantera` only to regenerate the file, not to run the app.

## 5c. Role C state (2026-11-15 05:00): predictor, ranking, report

- **Predictor** (`src/lib/predict`, parameters and reasons in its README): modes `data`, `physics_only`, `none`. Rules added after the first version, all general: a target flow outside the tested flow range of the class is not a data result (no margin: quenching at low flow, blowoff at high flow); runs farther than distance 2 neither vote nor count as evidence; a measured limit point (`marginal`) closer than 0.5 to the target makes the zone `marginal`; `fire_resistant` gives `none` with the material-specific reason and a "not safe" warning.
- **`confidence` is evidence coverage**, `(1/8) * sum(exp(-d^2 / 2))` over the nearest runs. It is not a probability. Label it "evidence coverage" in the UI.
- **`physics.limit_k` for solids is the coldest tested condition that still burned, not a flammability limit.** Do not label it "limit temperature" for solids (`physics.surrogate === true`).
- **Ranking** (`src/lib/rank`, mapping in its README): SPEC weights unchanged. FLEX and FLEX-2 lead for the Moon base because their tested ranges contain it; the solid experiments rank below because none was run above about 22% O2 or away from 1 atm.
- **Evaluation** (`docs/EVALUATION.md`): droplets 101 of 101, which only shows consistency with the LOI labelling rule; solids no better than "always sustained" (131 of 134 runs are sustained). Do not quote the overall 90% as accuracy.
- **Report** (`src/app/api/report`, README there): context = predictor output for all classes + data facts + top 10 investigations; citation validator strips unknown `[PSI-xx]`; claim checks reject texts that say 0 g and 1 g bound partial gravity, call fire-resistant materials safe, or present a margin as a measurement; cached fallback on error, HTTP 429 or timeout. Free tier: one live report per minute.
- **Not in curated JSON:** the Nomex NASA-STD-6001 fact (NTRS 20070018178) is written in the predictor warning and the report context from this file, point 12. Role A: add it as a `key_finding` through `scripts/build_seed_data.py` if it should be citable as data.

## 6. Open work, by role

- **A (Kacper):** verification is done (575 of 575 rows, applied with `npm run verify:apply`). Left: add the Nomex NASA-STD-6001 fact (NTRS 20070018178, point 12) as a `key_finding` through `scripts/build_seed_data.py`, then rerun the builder, `check_quotes.py`, `npm run verify:apply` and `npm run validate:data`. Optionally `scripts/fetch_psi.py`.
- **B (Johny):** (also: SPEC module 4b UI, the T_ad chart and the prediction mode badge)  build pages on real data; handle `null` values ("not reported"), unverified markers, the new habitat and material values, and the `publication` / `psi_document` source types in source tooltips. Show the Moon base solid-material gap clearly on the gap map.
- **C (Kuba):** done: predictor, ranking, evaluation, report route and cached reports (section 5c). Left: review the cached reports once more after any data change (`npm run reports`), final review of physics claims in the UI, video and slides.
