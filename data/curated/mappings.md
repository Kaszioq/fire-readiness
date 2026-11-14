# mappings.md: how source tables were turned into curated data

Snapshot date: 2026-11-14. Built by `scripts/build_seed_data.py` (run `python scripts/build_seed_data.py` to regenerate).

## Scope

- PSI search `combustion` returned 26 investigations. 24 are in scope.
- Excluded (see `excluded.json`): PSI-181 (solder materials) and PSI-108 (STDCE-1, thermocapillary flow). Neither involves combustion.

## Field methods

| method | meaning | counts as verified |
|---|---|---|
| `api_direct` | copied from the PSI record, or computed deterministically (min, max, row count) from the experimental table | yes |
| `llm_extracted` | summary or interpretation by an LLM with a verbatim `quote`. All 111 record quotes were machine-checked as exact substrings of the PSI record text on 2026-11-14 | no, needs human check |
| `manual` | curator judgement or assumption (tier, safety domains, outcome mapping, assumed pressure) | no, needs human check |

## flammability_points.json

413 points from 4 investigations. **All solid-material points are at roughly 0.21 to 0.22 O2 or below, and at about 1 atm.** There is no solid-material test point at the Moon base atmosphere (0.30 O2, 70 kPa). Only FLEX droplets and ACME BRE (gas burner emulation, no point data) come close. This is a real data gap and should be shown as such.

### FLEX (PSI-69), 273 points, `liquid_droplet`
Source: `PSI-69_Experimental table_FLEX.csv`, one point per test row. Test 114 dropped (pressure listed as 0 mmHg).
- `o2_mole_fraction` = "O initial ambient composition; mole fraction"
- `pressure_kpa` = "Ambient pressure; mmHg" x 0.1333224
- `diluent` = CO2 or He fraction from the table, balance N2
- `flow_cm_s` = 0 (quiescent chamber, **assumed**)
- `outcome` from "Test end":
  - Completion or Disruption → `sustained` (flame burned until the droplet was consumed or broke up)
  - Extinction with burn time < 2 s → `extinguished` (flame survived only briefly; FLEX defines its limit as "flame exists for only a short time after ignition")
  - Extinction with burn time ≥ 2 s → `marginal` (flame burned, then self-extinguished before the droplet was consumed)
  - **The 2 s threshold is a curator choice. Review it with the FLEX publications before the demo.**
- Burn time, test-end mode and initial diameter are kept in `prov.note`.

### BASS-II (PSI-25), 128 points, solids
Source: `PSI-25_Experimental table_BASS-II.csv`. Wax candle row (F4) dropped.
- `o2_mole_fraction` = "Calibrated initial O2 % by vol" / 100
- `material_class`: SIBAL and Nomex → `thin_fabric`; PMMA films (≤ 0.4 mm) → `thin_solid`; PMMA slabs ≥ 1 mm, rods, spherical sections → `thick_solid`
- `outcome` parsed from the free-text "Fan display" and "Air display" columns: "no ign" → `no_ignition`; "ext", "blowoff", "out", "would not stay" → `marginal` (flame lost during a flow sweep); otherwise `sustained`
- `flow_cm_s` = first number in "Air display". **Confirmed:** the video overlay showed the "air velocity transducer reading (cm/s)" (BASS-II Summary Report, NASA/TM-20210011385, pdf p. 12).
- `pressure_kpa` = 101.3. **Confirmed approximately:** "Ambient pressure was 1 atm." (pdf p. 102) and total pressure "varied from 99.2 to 99.5 kPa" (pdf p. 46).
- Outcome parsing from free text is still a curator interpretation: all BASS-II points stay `manual` and unverified until a human checks them.

### Saffire-I (PSI-98) 2 points, Saffire-II (PSI-99) 10 points
Rows typed from the CSV (quotes are the raw CSV rows).
- Saffire-II "Burn Time = Insignificant" → `extinguished`
- Saffire-II sample 2-7 split into PMMA (`sustained`, fully consumed) and Nomex (`no_ignition`, from Note 2)
- `spread_rate_mm_s` filled for SIBAL samples 2-5 and 2-6 (2.1 and 2.6 mm/s)
- `pressure_kpa` = 101.3, **assumed** (Cygnus cabin; pressure was measured but is not in the table). The Saffire-I workbook in PSI (`SAFFIRE-1_MergeResult-jpeg_Update_Final_v2.xlsx`) is only an image-file index and does not contain pressure.
- Saffire-III (PSI-100) has no outcome columns, so no points.

## Proposed contract changes (need team OK, not yet in CONTRACTS.md)

1. `MaterialClass`: add `'thin_solid'` (thin PMMA films and thin silicone are thermally thin solids but not fabrics).
2. `HabitatId`: add `'exploration_10_2'` and `'exploration_8_2'`, NASA-considered exploration atmospheres quoted in the ACME BRE (PSI-20) objective: 10.2 psia / 26.5% O2 and 8.2 psia / 34% O2.

## Known record anomalies (kept, flagged in prov.note)

- Saffire-I dates in PSI (2001 to 2008) predate the 2016 flight: set to null.
- Saffire-II record has 0 files listed and empty file formats.
- PSI-10 (ACME Flame Design) has an empty license field.
- FLEX-2 record text says O2 0.1 to 0.4; the table matrix lists 0.17 to 0.30.
- Saffire-II CSV column header "?-g" is likely "µ-g" (encoding loss).

## PSI file download (for scripts/fetch_psi.py)

Experimental table and document URLs in the record (`remote_url`) return 404. The working endpoint is:

`GET https://psi.nasa.gov/geode-py/ws/studies/<PSI-ID>/download?file=<url-encoded file_name>&version=1&redirect=false`

It returns a short-lived signed S3 URL as plain text. GET that URL to download the file.

## Findings from publications and PSI documents (added 2026-11-14)

`key_findings` now also include results from publications (`source_type: publication`) and from the BASS-II Summary Report in PSI (`source_type: psi_document`). Each has a verbatim quote from the abstract or report page and is `llm_extracted`, unverified. Sources used:

- BASS: Ferkul et al., ASGSR 2013 (NTRS 20140011099)
- BASS-II: NASA/TM-20210011385 (Summary Report); Olson et al., ICES-2019; Scientific Reports 2018 (doi 10.1038/s41598-017-18398-4)
- Saffire: Urban et al. 2019, Combustion and Flame 199 (doi 10.1016/j.combustflame.2018.10.012); NTRS 20170008805
- FLEX: Dietrich et al. 2014, Microgravity Sci. Technol. (doi 10.1007/s12217-014-9372-2); Nayagam et al. 2013 (NTRS 20130014061)
- SAME / SAME-R: NTRS 20140006585; Yang et al. 2018, Fire Safety Journal 98 (doi 10.1016/j.firesaf.2018.04.004); NTRS 20130000422. **Note:** these disagree on whether low-gravity smoke particles are larger than in 1 g. Show both.
- ACME BRE: Dehghani, PhD dissertation (UMD); Wright 2021 MS thesis (UMD), which also supplies the pressure range 0.57 to 1 bar; ACME JASMAC-33 overview (NTRS 20210022542)

Only abstracts and openly available pages were read. Paywalled full texts were not used.

## Habitat sources (added 2026-11-14)

- ISS: NASA ICES-2024-128 (NTRS 20240005117), sea-level 14.7 psia, 21% O2.
- Orion: only a secondary source (Wikipedia) so far: sea level or 55.2 to 70.3 kPa. Kept as `is_assumption: true`.
- exploration_10_2 and exploration_8_2: ACME BRE objective in PSI; 8.2 psia / 34% also appears in NASA-STD-3001 technical brief OCHMO-TB-037.
