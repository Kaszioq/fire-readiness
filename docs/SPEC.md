# SPEC.md: Moon Base Fire Readiness

## 0. Goal and judging

Space Apps judging criteria: **Impact, Creativity, Validity, Relevance, Presentation.** Global judges are NASA and partner-agency experts, so **Validity is our differentiator**: fully traceable data, honest uncertainty, correct physics. Presentation is the second lever: one clear demo story.

Target users: aerospace engineers, researchers, students.

Challenge objectives we answer:
1. Identify investigations most relevant to habitable crew environments (spacecraft, stations, lunar/Mars bases, pressurized rovers) → modules 2, 3
2. Extract data that supports predictive modelling of flammability → modules 1, 4, 7
3. Highlight research that informs next-generation fire safety equipment → modules 4 (suppression notes), 5, 6
4. Bonus: Earth applications → module 8

## 1. Modules

Priority: **P0** = must ship, **P1** = should ship, **P2** = stretch.

### Module 1: Investigation database (P0, role A)
- `data/curated/investigations.json` for all in-scope investigations (see DATA_SOURCES.md section 2).
- UI (role B): searchable, filterable list (fuel phase, safety domain, tier, flight/ground, hardware) and a detail card per investigation.
- Detail card shows each field with a small source icon: hover = quote + link; unverified fields marked.
- Header counter: "N investigations, X of Y extracted fields human-verified" from `meta.json`.
- **Done when:** all investigations load from curated JSON, every displayed field has a working source link, unverified fields are visibly marked.

### Module 2: Habitat Lens (P0, B for UI, C for ranking)
- Preset buttons (section 3) plus sliders for O2 (%), pressure (kPa, with psi shown), ventilation flow (cm/s), material class.
- Ranked list from `rankInvestigations()`. Each row: score bar, and on click the score breakdown with each component's `reason`.
- **Ranking (role C), initial weights, tune only with a stated reason:**
  - `condition_coverage` 0.35: 1.0 if target O2 and pressure both fall inside the investigation's tested ranges; otherwise decays with normalized distance to the range box (O2 distance in mole fraction / 0.1, pressure in log10(kPa) / 0.3). 0 if ranges unknown, with reason "conditions not reported".
  - `fuel_relevance` 0.25: solids (fabrics, plastics) 1.0 for habitat fire safety, liquids 0.6, gas jets 0.4 (gas flames still inform flame physics). Exact mapping documented in `src/lib/rank/README.md`.
  - `safety_domain` 0.20: prevention / detection / suppression 1.0, fundamental 0.4.
  - `data_availability` 0.10: has experimental table 1.0, documents only 0.5, nothing 0.
  - `tier` 0.10: tier 1 = 1.0, tier 2 = 0.6, tier 3 = 0.3.
- **Done when:** changing a preset re-ranks instantly, every score is explainable in the UI, and the ranking for the Moon base preset is reviewed by Kuba for sanity.

### Module 3: Coverage and gap map (P0, role B, data from A)
- SVG chart: x = O2 (%), y = pressure (kPa, log scale, psi on a secondary axis).
- Each investigation = translucent rectangle spanning its tested O2 and pressure range, coloured by fuel phase. Investigations with unknown ranges are listed below the chart ("conditions not reported"), not drawn.
- Individual flammability points as dots, shape by outcome.
- Habitat presets as labelled markers; the current slider target as a crosshair.
- Gap callouts (text, sourced): no partial-gravity data in PSI (LUCI, FM2 planned); which material classes have data near the Moon base point and which do not.
- Toggle: filter by material class.
- **Done when:** the Moon base marker is visible and you can see at a glance which investigations cover it.

### Module 4: Fire Risk Predictor (P0, role C, UI by B)
- Implements `predict()` from CONTRACTS.md. Pure TypeScript, deterministic, no LLM.
- Algorithm:
  1. Filter points by `material_class` (if fewer than 5 points for the class, return `no_evidence` with a warning).
  2. Features: O2 mole fraction, log10(pressure_kpa), flow (cm/s; if target or point flow is null, drop the flow dimension and add a warning). Normalize each feature by a fixed scale documented in code (start: O2 0.05, log10 P 0.15, flow 5 cm/s).
  3. Distance-weighted kNN (k = 8, weights 1/(d + eps)). `p_sustained` = weighted share of `sustained` (marginal counts 0.5).
  4. `confidence` = f(mean distance of the k neighbours, number of neighbours within d < 1). If the nearest point has d > 2 → `zone = no_evidence`, `p_sustained = null`.
  5. Zones: p < 0.25 `extinguishes`, 0.25 to 0.6 `marginal`, > 0.6 `sustained`.
  6. `gravity_g` between 0 and 1 (not 0, not 1) always adds the warning: "No partial-gravity combustion data in PSI. Microgravity and Earth-gravity tests do NOT bound lunar or Martian gravity: NASA FM2 researchers report that the oxygen level needed for flame spread may reach its minimum near lunar gravity, so partial gravity can be more hazardous than both (Ferkul et al., LPSC 2026, NTRS 20260000646)."
  7. `suppression_notes`: curated findings from FLEX/FLEX-2 (and BASS where relevant) about CO2 / He dilution, taken from `key_findings` with provenance. Shown only for the relevant material classes. Never generated.
  8. `explanation`: template text from evidence ("8 nearest BASS-II tests at 17 to 21% O2 ... 6 burned, 2 extinguished").
- Optional derived display: O2 partial pressure (O2 fraction x pressure). Useful for showing that a habitat can have Earth-like O2 partial pressure but a higher O2 fraction. Any physical claim about what that means must be backed by a cited source in curated data.
- UI: zone badge, probability with confidence band, evidence table (click → investigation card), warnings in a visible box, mini flammability map (O2 vs flow) for the selected material class with the target point.
- Unit tests (`src/lib/predict/predict.test.ts`): far-from-data → `no_evidence`; exact duplicate of a sustained point → `sustained` with high confidence; partial gravity → warning present.
- **Done when:** tests pass, UI shows evidence for every prediction, and no prediction appears without confidence.

### Module 5: AI fire-readiness report with citations (P0, role C)
- `POST /api/report` per CONTRACTS.md.
- Context passed to the LLM: only curated JSON for the top 10 ranked investigations + the predictor output + the habitat definition. No web access, no free knowledge.
- System prompt requirements:
  - Write for an aerospace engineer, about 350 words, English.
  - Sections: **What the data says**, **How confident we can be**, **Gaps**, **What future experiments (e.g. LUCI, FM2) should measure**.
  - Every factual sentence ends with a citation in the form `[PSI-26]`. Only PSI IDs present in the provided context are allowed.
  - If the data does not support a statement, say "not covered by PSI data".
  - Do not mention rockets or propellants.
- Server-side validator: extract all `[PSI-xx]` tags, strip any not in context into `stripped_citations`, log them.
- Pre-generate `data/cached_reports/<habitat_id>.json` for every preset (fallback + instant demo).
- UI (B): rendered markdown, citations as chips linking to investigation cards, a "Regenerate" button, and a small "AI-generated from cited NASA data" label.
- **Done when:** report for every preset renders, all citations are valid, and the fallback works with the API key removed.

### Module 6: Smoke detection simulator (P2, role C)
- `<SmokeSim />`: 2D top-down or side view of a generic module (dimensions user-adjustable, not a real vehicle layout), grid ~80 x 40.
- Ventilation: user places one inlet and one outlet; velocity field from a simple potential-flow / precomputed channel solution.
- Smoke: advection-diffusion of concentration from a user-placed source. Toggle "microgravity" (no buoyancy) vs "1g" (adds upward drift) to show why detector placement differs.
- User places up to 4 detectors with a threshold; output: time to detection per detector.
- Runs in a Web Worker on CPU; renders to canvas.
- Clearly labelled "illustrative model". Link to SAME / SAME-R / DAFT cards for the real detection research. Any statement about smoke particle behaviour must cite curated findings.
- Kuba may port code from his own aircraft cabin particle model; it must be included in this repo under the same open-source license.
- **Done when:** the 0g vs 1g toggle visibly changes the time to detection, and it runs at more than 20 fps on a laptop.

### Module 7: Data lineage (P1 as a simple list, role B, data from A)
- On each flight investigation card: "Data reused by" list of ground investigations (`uses_data_from` inverted). On ground cards: "Built on".
- Small badge "modelling-ready" when at least one ground study has used the data.
- Stretch: small node-link graph.

### Module 8: Earth applications (P2, role B)
- Static page with 3 to 5 sourced items (fine water mist, smoke detectors that tell smoke from dust, firefighter air tanks and clothing), each linking to the NASA Spinoff page and, where it makes sense, to a related investigation (e.g. DAFT and SAME for smoke vs dust).

### Extra: Side-by-side comparison (P2, role B)
- Pick 2 or 3 investigations, show aligned fields (fuel, conditions, variables, measurements) with differences highlighted.

## 2. Pages

- `/`: hero with the pitch sentence, habitat preset buttons, CTA "Check a habitat"
- `/lens`: Habitat Lens + predictor + report (main demo page)
- `/map`: coverage and gap map
- `/investigations` and `/investigations/[psiId]`
- `/simulator`: smoke sim (if shipped)
- `/earth`: Earth applications (if shipped)
- `/about`: method, data provenance, verification stats, limitations, out of scope (rockets), references, license, team

Visual direction: clean, technical, dark theme suitable for a demo video; high-contrast charts; no NASA logo.

## 3. Habitat presets (`data/curated/habitats.json`, role A)

| id | O2 | Pressure | Gravity (g) | Source | is_assumption |
|---|---|---|---|---|---|
| earth | 0.21 | 101.3 kPa (14.7 psi) | 1 | challenge text (14.7 psi) | false |
| iss | 0.21 | 101.3 kPa | 0 | **source to add** (NASA ISS page), verify before demo | false once sourced |
| orion | **TBD** | **TBD** | 0 | **source needed**; until found, mirror ISS values and set is_assumption = true | true |
| moon_base | 0.30 | 70.3 kPa (10.2 psi) | 0.166 | challenge text: "30% or greater ... 10.2 psi or less" | false |
| pressurized_rover | 0.30 | 70.3 kPa | 0.166 | challenge text (same intermediate atmosphere) | false |
| mars_habitat | 0.30 | 70.3 kPa | 0.38 | no spec; scenario reusing the lunar atmosphere | true |
| spacesuit | 1.00 | 29.6 kPa (4.3 psi) | varies (use 0.166) | challenge text | false |
| exploration_10_2 | 0.265 | 70.3 kPa (10.2 psia) | 0.166 | ACME BRE (PSI-20) objective: NASA-considered atmosphere | false |
| exploration_8_2 | 0.34 | 56.5 kPa (8.2 psia) | 0.166 | ACME BRE (PSI-20) objective: NASA-considered atmosphere | false |

Every preset is shown with its source; assumptions are labelled "scenario" in the UI. Optional extra preset if a source is found: NASA Exploration Atmospheres Working Group recommendation (reported as 34% O2 at 8.2 psi; **verify and cite before use**).

## 4. Demo scenario (drives priorities and the video)

"I'm an engineer designing a lunar surface habitat."
1. Open `/`, click **Moon base**.
2. Lens shows the top-ranked investigations with explanations; point out that FLEX-2 tested an O2 / pressure range around the Moon base point (only if the curated data confirms it).
3. Switch to the gap map: Moon base marker, which rectangles cover it, which material classes have no nearby data, no partial gravity data.
4. Predictor: thin fabric, 30% O2, 70 kPa, low ventilation flow → zone, confidence, evidence tests, partial-gravity warning, suppression notes.
5. Report: "What LUCI and FM2 should measure" with citations.
6. (If shipped) smoke sim: same fire, 1g vs 0g, detector times change.
7. About: "every number traceable, X% human-verified".

Target length of the demo video: check the current Space Apps submission guide; keep a 30 s cut and a longer cut.

## 5. Timeline (Saturday 14:30 to Sunday 13:00 CET)

| Time | A: Data & Science | B: Frontend & Demo | C: Models & AI (Kuba) |
|---|---|---|---|
| 14:30-15:30 | `fetch_psi.py`, raw snapshot, mocks | repo, Next.js skeleton, Vercel, layout, pages | `types.ts`, zod schemas, rank + predict skeletons on mocks |
| **15:30 sync** | **freeze contracts** | | |
| 15:30-18:30 | curated tier 1 records + flammability points, start verification | investigation list + cards, Habitat Lens UI on mocks | ranking implementation, predictor + tests |
| **18:30 sync** | | | |
| 18:30-21:30 | tier 2 and 3, habitats.json, verification | gap map | report API + validator + prompt |
| **21:30 sync** | swap mocks for real data | integrate predictor + report | cached reports, tune on real data |
| 21:30-01:30 | verification, mappings.md, meta.json | polish lens, lineage list | smoke sim start (only if P0 done) |
| **01:30 sync** | **decide: smoke sim in or out** | | |
| 01:30-07:00 | **sleep** | **sleep** | **sleep** |
| 07:00-10:30 | README References, licenses, About content | demo flow polish, comparison or Earth page if time | smoke sim finish or cut, fixes |
| **10:30 feature freeze** | | | |
| 10:30-12:30 | Space Apps project page text | record demo video | slides, final review of physics claims |
| **12:30 submit** | | | |

Each sync: 10 minutes, what's done, what's blocked, what's cut.

## 6. Submission checklist

- [ ] Public GitHub repo, `LICENSE` (Apache 2.0), `README.md` with: pitch, live link, screenshots, how to run, method, limitations, **References** (all sources, libraries, LLM model/provider)
- [ ] Live Vercel deployment works without an LLM key (cached reports)
- [ ] Demo video: original content, royalty-free music with license noted, no minors, no NASA logo
- [ ] Space Apps project page: challenge selected, description, links, all resources cited in the submission form
- [ ] Physics review by Kuba: every claim in UI, report templates, video and slides traceable to curated data
- [ ] Verification counter shows a real number, not a placeholder
