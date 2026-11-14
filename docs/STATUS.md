# STATUS.md: where the project stands (updated Sat 2026-11-14, 15:40 CET)

Read this after `CLAUDE.md` and before starting work. It records what changed since the app skeleton commit (`cb172c7`) so no session works from stale assumptions.

## 1. The app now runs on real NASA data

- `src/lib/data/index.ts` imports `data/curated/*.json` (no longer `data/mock/`). `DATA_IS_MOCK = false`.
- **Exception:** the report still comes from `data/mock/report.mock.json` until role C generates `data/cached_reports/<habitat_id>.json`. The mock report text says "MOCK". Do not demo it.
- `data/mock/` stays in the repo for tests and reference, but production pages must not import it.

## 2. Curated dataset (`data/curated/`)

| File | Content |
|---|---|
| `investigations.json` | 24 PSI combustion investigations (tier 1: 10, tier 2: 6, tier 3: 8), every field with provenance. 352 publications (full lists from PSI). |
| `flammability_points.json` | 413 test runs: FLEX (PSI-69) 273, BASS-II (PSI-25) 128, Saffire-I (PSI-98) 2, Saffire-II (PSI-99) 10 |
| `habitats.json` | 9 presets: earth, iss, orion, moon_base, pressurized_rover, mars_habitat, spacesuit, exploration_10_2, exploration_8_2 |
| `meta.json` | counters for the header (622 fields, 299 verified against NASA source) |
| `excluded.json` | PSI-181 (solder) and PSI-108 (thermocapillary flow): returned by the PSI "combustion" search but not combustion |
| `mappings.md` | **Read before using the data.** How every table was mapped, all assumptions, all sources. |

Other data files:
- `data/raw/psi_combustion_snapshot.json`: snapshot of all 26 PSI records (text fields) and their 25 experimental-table CSVs, taken 2026-11-14 via the PSI web API.
- `data/extracts/flex_tests.txt`, `bass2_tests.txt`: per-test extracts used by the builder. `psi_publications.json`: full PSI publication lists.
- `data/raw/docs/` (gitignored): large PSI documents read during curation (BASS-II Summary Report PDF, Saffire-I workbook).
- `data/verification.csv`: 472 rows to check by hand (role A, Kacper), sorted tier 1 first.

## 3. How to regenerate and check

```bash
python scripts/build_seed_data.py   # rebuilds everything in data/curated/ + data/verification.csv
python scripts/check_quotes.py      # every quote attributed to PSI must appear verbatim in the snapshot (171/171 pass)
npm run validate:data               # zod schemas + cross references
```
Edit data only through `scripts/build_seed_data.py`, then rerun all three. Never hand-edit the JSON.

`scripts/fetch_psi.py` does not exist yet. psi.nasa.gov was reachable only from a browser, so the snapshot was taken in the browser. The working download endpoint is documented in `docs/DATA_SOURCES.md` section 3.

## 4. Contract changes (team-approved, 2026-11-14)

Applied in `src/lib/types.ts`, `src/lib/schemas.ts`, `docs/CONTRACTS.md`, `docs/SPEC.md`:
- `MaterialClass` gained `'thin_solid'` (thin PMMA films, thin silicone). BASS-II films use it.
- `HabitatId` gained `'exploration_10_2'` (10.2 psia, 26.5% O2) and `'exploration_8_2'` (8.2 psia, 34% O2), NASA-considered exploration atmospheres quoted in the ACME BRE (PSI-20) objective.

Code that maps over `MaterialClass` or `HabitatId` (ranking fuel weights, UI labels, selectors) must handle the new values.

## 5. Data facts every role must respect

1. **No solid-material test point exists at the Moon base atmosphere** (30% O2, 70 kPa). All solid points are at about 1 atm and at most about 22% O2. The predictor must return `no_evidence` (or very low confidence) for solids at Moon base conditions. This gap is a key message of the demo, not a bug.
2. What does exist near Moon base conditions: FLEX droplets at 30 to 34% O2 near 0.7 atm, and ACME BRE gas-burner emulation at 26.5, 34 and 40% O2 and 0.57 to 1 bar (findings only, no per-test points).
3. **FLEX outcome mapping**: Completion/Disruption = `sustained`; Extinction with burn time < 2 s = `extinguished`; other Extinction = `marginal`. The 2 s threshold is a curator choice (see `mappings.md`). Droplets self-extinguishing before burnout is normal droplet physics, not "non-flammable". Explanations must say so.
4. **BASS-II**: flow units (cm/s) and pressure (about 1 atm) are confirmed from the BASS-II Summary Report (NASA/TM-20210011385). The outcome per test is parsed from free text and is still unverified.
5. **Saffire pressure (101.3 kPa) is an assumption**, flagged in `prov.note`.
6. **Orion** values come only from a secondary source (Wikipedia): `is_assumption: true`, show as "scenario".
7. **SAME vs SAME-R disagree** on whether low-gravity smoke particles are larger than in 1 g. Show both findings; do not pick one.
8. `key_findings` now include findings from publications (`source_type: 'publication'`) and from the BASS-II report (`'psi_document'`), each with a verbatim quote from an abstract or report page. All are `llm_extracted` and unverified.
9. Header counter text is "verified against NASA source": `api_direct` fields count as verified by contract; they were not checked by a human.

## 6. Open work, by role

- **A (Kacper):** verification, using the `priority` column in `data/verification.csv`:
  - **P1 (184 rows, do first):** 35 findings from publications and the BASS-II report (open the URL, confirm the quote and that our one-line summary says the same thing, especially the numbers); 9 habitat presets; Saffire points (12, quotes are the raw CSV rows); BASS-II points (128): spot-check about 15, all `marginal` and the `no_ignition` row, against the "Fan display" / "Air display" columns in `data/raw/psi_combustion_snapshot.json` (PSI-25 table). Also review the FLEX 2 s outcome threshold in `mappings.md` against Dietrich et al. 2014.
  - **P2 (99 rows):** tier and safety-domain judgements; tier 1 summaries and conditions.
  - **P3 (45 rows):** tier 2 and 3 summaries. Quotes are already machine-checked (`check_quotes.py`), so only check that the summary matches the quote.
  - **P4 (144 rows):** `null` = "not reported". Skip unless time allows.
  - Write `scripts/apply_verification.py` to copy statuses back into the JSON (DATA_SOURCES section 5). Optionally `scripts/fetch_psi.py`.
- **B (Johny):** build pages on real data; handle `null` values ("not reported"), unverified markers, the new habitat and material values, and the `publication` / `psi_document` source types in source tooltips. Show the Moon base solid-material gap clearly on the gap map.
- **C (Kuba):** implement `predict()` and `rankInvestigations()` on real points (respect fact 1 and 3), the report route, and generate `data/cached_reports/` for every habitat preset.
