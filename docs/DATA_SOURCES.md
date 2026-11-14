# DATA_SOURCES.md: where every piece of data comes from

Primary key everywhere: the **PSI ID** (e.g. `PSI-26` = BASS).

## 1. Sources

| Priority | Source | URL | What we take | Access |
|---|---|---|---|---|
| 1 | **NASA PSI Data Repository, investigation pages** | `https://psi.nasa.gov/physci/repo/data/investigations/<PSI-ID>` (e.g. [PSI-26](https://psi.nasa.gov/physci/repo/data/investigations/PSI-26)) | Human-readable page used for verification and for links in the app | Public |
| 1 | **PSI JSON API, single record** | `https://psi.nasa.gov/geode-py/ws/repo/investigations/<PSI-ID>` | Title, acronym, DOI, objective, hypothesis, approach, research impacts, hardware (+ link), flight program, dates, managing NASA center, license, publications (with DOI), full file list, experimental table file reference | Public. Undocumented: it is the API the PSI web app itself calls. |
| 1 | **PSI JSON API, search** | `https://psi.nasa.gov/geode-py/ws/repo/search?term=combustion&source=psi&type=investigation&sort=Public%20Release%20Date&order=desc` | List of combustion investigations (26 hits as of 2026-11-14) | Public |
| 1 | **PSI experimental tables (CSV)** | URL from the `experimentalTable[].remote_url` field of each record, resolved against `https://psi.nasa.gov` (example file: `PSI-26_Experimental table_BASS.csv`) | Per-test conditions: fuel, O2, pressure, flow, outcome. **Main input for the predictor.** | Public (check: some files may be flagged `restricted`) |
| 2 | **PSI documents** | File list of each record (`added[]`: `remote_path`, `remote_url`): final reports, presentations, science documents | Quantitative findings not present in the CSV | Public unless `restricted: true` |
| 2 | **Publications** | `https://doi.org/<doi>` from the record's `publications[]` | Limiting oxygen concentrations, flame spread rates, extinction limits | Some paywalled: use abstracts, NTRS versions, or skip |
| 3 | **NASA Technical Reports Server** | https://ntrs.nasa.gov | Free full texts of NASA reports and many papers | Public |
| 3 | **A Researcher's Guide to ISS Combustion Science (2015)** | https://www.nasa.gov/missions/station/a-researchers-guide-to-combustion-science/ | Conditions and hardware when PSI text is truncated | Public |
| 3 | **NASA Combustion Science (Glenn)** | https://www.nasa.gov/glenn/glenn-expertise-space-exploration/physical-sciences-program/combustion-science/ | Short descriptions of investigations | Public |
| 4 | **Challenge statement** | Space Apps challenge page (text saved in `docs/challenge.md`) | Habitat atmospheres (30%+ O2 at 10.2 psi or less, suit 100% O2 at 4.3 psi, Earth 14.7 psi), scope notes | Public |
| 4 | Context pages | [Apollo 1](https://sma.nasa.gov/sma-disciplines/accllp/apollo-1), [Apollo 13](https://sma.nasa.gov/sma-disciplines/accllp/apollo-13), [Mir fire](https://www.nasa.gov/history/25-years-ago-fire-aboard-space-station-mir/), Spinoffs: [air tanks](https://spinoff.nasa.gov/node/9582), [fire detector](https://spinoff.nasa.gov/node/9407), [fire attire](https://spinoff.nasa.gov/node/9918) | About section and Earth applications tab only | Public |

## 2. Investigations in scope

Search returned 26 hits on 2026-11-14. Preliminary tiers (to be confirmed during extraction; the `tier` field carries the final value with provenance):

| PSI ID | Acronym | Type | Prelim. tier | Note |
|---|---|---|---|---|
| PSI-26 | BASS | flight | 1 | solids, MSG flow duct |
| PSI-25 | BASS-II | flight | 1 | solids, MSG flow duct |
| PSI-98 | Saffire-I | flight | 1 | large-scale fabric fire on Cygnus |
| PSI-99 | Saffire-II | flight | 1 | |
| PSI-100 | Saffire-III | flight | 1 | |
| PSI-69 | FLEX | flight | 1 | droplets, suppression (CO2, He), LOI |
| PSI-68 | FLEX-2 | flight | 1 | O2 0.1 to 0.4, 0.5 to 3 atm (per PSI search summary, verify) |
| PSI-102 | SAME | flight | 1 | smoke detection |
| PSI-101 | SAME-R | flight | 1 | smoke detection |
| PSI-20 | ACME BRE | flight | 1 | materials flammability emulated with gaseous fuel |
| PSI-47 | DAFT / DAFT-2 | flight | 2 | dust vs smoke instrument |
| PSI-159 | ACME CFI-G | flight | 2 | highest O2 (up to 85% from burner) |
| PSI-22 | ACME E-FIELD | flight | 2 | electric field mimics partial gravity |
| PSI-107 | SPICE | flight | 2 | soot / smoke point |
| PSI-106 | SLICE | flight | 2 | flame structure, liftoff |
| PSI-39 | CFI | flight | 2 | droplets, 0.25 to 5 atm |
| PSI-10 | ACME Flame Design | flight | 3 | |
| PSI-21 | ACME CLD Flame | flight | 3 | |
| PSI-23 | ACME s-Flame | flight | 3 | |
| PSI-60 | SPICE data analysis | ground | 3 | uses PSI-107 |
| PSI-62 | Concurrent flame spread FGM | ground | 3 | uses PSI-25, PSI-26 |
| PSI-115 | SAME smoke modelling | ground | 3 | uses PSI-102 |
| PSI-117 | Cool flame CFD | ground | 3 | uses PSI-69 |
| PSI-142 | Cool flame counterflow | ground | 3 | uses PSI-69 |
| PSI-108 | ? | ? | ? | new in search, identify during extraction |
| PSI-181 | ? | ? | ? | new in search, identify during extraction |

The `uses_data_from` values above come from the "Highlights" lines of the PSI search page and must be confirmed from the records.

## 3. Snapshot procedure (role A, `scripts/fetch_psi.py`)

1. Call the search endpoint, collect PSI IDs. Fallback: the explicit list of 26 IDs in section 2. (Search hits are Elasticsearch documents: inspect `hits.hits[]._source` to find the PSI ID field; do not assume its name.)
2. For each ID, fetch the record and save it unmodified to `data/raw/records/<PSI-ID>.json`.
3. For each `experimentalTable[]` entry that is not `restricted`, download the CSV to `data/raw/tables/<PSI-ID>/<file_name>`.
4. Do **not** bulk-download documents (some investigations have hundreds of files and GBs of video). Download individual PDFs only when needed for a specific field, into `data/raw/docs/<PSI-ID>/`.
5. Write `data/raw/MANIFEST.json`: `fetched_at`, URL and sha256 of every saved file.
6. Be polite: one request at a time, 0.5 s delay, a descriptive User-Agent.
7. If a request from Python is blocked, run the same fetches in the browser console on psi.nasa.gov and save the results.

The app never calls PSI at runtime. It only reads `data/curated/`.

## 4. What we extract (and how)

| Target field (see CONTRACTS.md) | Source | Method |
|---|---|---|
| psi_id, acronym, title, doi, psi_url, dates, managing_center, license, hardware, publications, data_availability | PSI record | `api_direct` (no human check needed) |
| project_type | PSI record `projectType` | `api_direct` |
| objective_summary, approach_summary | PSI record text | `llm_extracted` (summary + quote) |
| key_findings | `researchImpacts`, final reports, publications | `llm_extracted` |
| fuel.* | PSI record text, experimental table | `llm_extracted` or `manual` |
| conditions.* (ranges) | experimental table first, then text | computed from table (`manual` method with locator = column names) or `llm_extracted` from text |
| variables_varied / constant | experimental table columns + text | `llm_extracted` |
| measurements | approach text, hardware docs | `llm_extracted` |
| safety_domains, tier, habitat_relevance_notes | everything above | `llm_extracted`, then reviewed |
| uses_data_from | ground investigation records | `llm_extracted` |
| flammability_points | experimental tables, then reports | parsed from CSV where possible; outcome mapping documented per investigation in `data/curated/mappings.md` |

## 5. Verification workflow

- Extraction produces `data/curated/*.json` plus `data/verification.csv` with one row per non-`api_direct` field: `psi_id, field_path, value, quote, source_url, locator, status (todo/ok/fixed/rejected), verifier, comment`.
- The verifier opens `source_url`, finds `quote` at `locator`, checks that `value` matches. Marks `ok`, or corrects the value and marks `fixed`, or marks `rejected` (value becomes `null`).
- `scripts/apply_verification.py` writes statuses back into the JSON (`verified`, `verified_by`, `verified_at`) and updates `meta.json` counters.
- Priority order for verification: tier 1 conditions and flammability points, then tier 1 findings, then tier 2, then the rest.
- The app shows "N of M extracted fields human-verified" and visually marks unverified fields.

## 6. Licensing and citation

- Record the `licenseName` / `licenseLink` of every investigation (PSI-26 is CC0-1.0). If any dataset we use is not openly licensed, flag it before using it.
- `README.md` References must list: PSI (with every PSI ID and DOI used), every publication cited in the app, the Researcher's Guide, the NASA pages above, the challenge statement, all libraries with licenses, the LLM model and provider.
