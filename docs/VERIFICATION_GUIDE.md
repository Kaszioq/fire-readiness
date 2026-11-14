# VERIFICATION_GUIDE.md: step-by-step data verification (role A, Kacper)

Goal: every number the demo shows is checked by a human against its NASA source. Budget: P1 about 1.5 h, P2 about 1 h. Work in `data/verification.csv` (open in Excel or LibreOffice).

## How to mark a row

Fill `status`, `verifier` (initials) and `comment`:
- `ok`: the quote is in the source at `locator`, and `value` says the same thing as the quote.
- `fixed`: value was wrong; write the correct value in `comment` (do NOT edit JSON files; role A changes `scripts/build_seed_data.py`).
- `rejected`: the source does not support the value; it will be set to `null`.

Where to find sources:
- `source_url` in each row. PSI pages: https://psi.nasa.gov/physci/repo/data/investigations/PSI-xx
- PSI record text and all experimental tables offline: `data/raw/psi_combustion_snapshot.json` (search for the PSI ID).
- BASS-II Summary Report PDF: `data/raw/docs/BASS-II Summary Report.pdf` (`locator` gives the pdf page).
- Publications: the DOI or NTRS link in `source_url`; abstracts are enough, quotes come from abstracts.

## P1 (do first, in this order)

1. **Findings from publications and the BASS-II report** (filter `field_path` containing `key_findings`, `source_url` not on psi.nasa.gov). Open the link, find the quote, check that our one-line summary says exactly that and that every number matches. Highest priority, because these appear in the demo and in the AI report:
   - FLEX LOI 0.12 (methanol) and 0.15 (heptane); with CO2 about 0.14 and 0.17
   - ACME BRE: flames in 21% O2 self-extinguished within 40 s; steady at 26.5, 34, 40%
   - BASS-II: sustained at 17% O2 in microgravity vs 18% in 1 g
   - SAME vs SAME-R: the two conflicting smoke-particle findings
2. **Habitats** (`psi_id` = `habitat`): O2 and pressure match the cited source; Orion must stay marked as scenario.
3. **Saffire points** (PSI-98, PSI-99): the quote is the raw CSV row; check the outcome mapping in `data/curated/mappings.md` ("Insignificant" burn time = extinguished, Nomex not ignited = no_ignition).
4. **BASS-II points** (PSI-25): do not check all 128. Check about 15, including the single `no_ignition` row (O12) and rows whose note says the flame was later extinguished. Compare with columns "Fuel Sample Material", "Calibrated initial O2 % by vol", "Fan display" and "Air display" in the PSI-25 table inside the snapshot.
5. **Physics calibration** (`docs/PHYSICS.md` section 3): confirm that the four LOI compositions used there match the Dietrich et al. 2014 abstract. The temperatures themselves are computed; you only check the inputs.

## P2

Tier and safety-domain judgements, and tier 1 summaries and conditions. Ask: would a NASA combustion engineer agree with the tier? Is the O2 / pressure / flow range right for that investigation?

## P3 and P4

- P3: tier 2 and 3 summaries (quotes already machine-checked, only check meaning) and the 101 FLEX points (rule-derived: check the LOI rule once, not every row).
- P4: `null` = "not reported". Skip.

## When done

Tell role A which rows are `fixed` or `rejected`. Then run:
```bash
python scripts/build_seed_data.py
python scripts/check_quotes.py
python scripts/compute_flame_temperature.py   # only if points or habitats changed (needs: pip install cantera)
npm run validate:data
```
The header counter in the app updates from `data/curated/meta.json` once statuses are written back (script `scripts/apply_verification.py`, still to write).
