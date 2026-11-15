# Moon Base Fire Readiness

NASA Space Apps Challenge 2026 entry (working name).

> Of the NASA PSI microgravity combustion investigations, which ones tell us whether a habitat atmosphere (e.g. the Artemis Moon base at 30%+ O2 and 10.2 psi) is fire-safe, how confident can we be, and what must future experiments (LUCI, FM2) still measure?

This is not an official NASA tool. Rockets and propellants are out of scope.

## Status

The app runs on a curated snapshot of the NASA PSI repository taken on 2026-11-14: 24 combustion investigations, 241 individual test runs and 9 habitat atmospheres, every field with its source. See [docs/STATUS.md](docs/STATUS.md) for the current state of each module and of the data.

## Docs

- [docs/SPEC.md](docs/SPEC.md): modules, acceptance criteria, timeline
- [docs/CONTRACTS.md](docs/CONTRACTS.md): shared types and interfaces (source of truth)
- [docs/DATA_SOURCES.md](docs/DATA_SOURCES.md): every data source and the provenance rules

## Run

Node 22 or newer.

```bash
npm install
npm run dev            # http://localhost:3000
npm run build          # must pass before every PR
npm run lint
npm run typecheck
npm test
npm run validate:data  # validates data/curated/*.json, or the mocks while curated files do not exist
npm run mocks          # regenerates data/mock/*.mock.json
```

The report route needs no key: without `LLM_*` variables it serves cached reports. To call a model, copy `.env.example` to `.env.local` and fill it in.

## Who owns what

| Role | Folders |
|---|---|
| A: Data & Science | `data/`, `scripts/`, `src/lib/data/` |
| B: Frontend & Demo | `src/app/` (except `src/app/api/`), `src/components/` (except `src/components/smoke-sim/`), `src/styles/`, `public/` |
| C: Models & AI | `src/lib/predict/`, `src/lib/rank/`, `src/app/api/report/`, `src/components/smoke-sim/` |
| Shared | `src/lib/types.ts`, `src/lib/schemas.ts`, `docs/`, `README.md` |

Branches: `a/data`, `b/ui`, `c/models`, small PRs into `main`. Commit messages start with `[A]`, `[B]` or `[C]`.

Rules that keep the three roles independent:

- Import data only through `@/lib/data`. ESLint rejects direct imports from `data/`.
- `src/lib/types.ts` mirrors `docs/CONTRACTS.md`; `src/lib/schemas.ts` must match it (the build fails if they drift). Change them only with team agreement.
- When real data lands, role A switches the imports in `src/lib/data/index.ts` from `data/mock/` to `data/curated/`. Nothing else changes.

## References

Everything the project uses, as required by the Space Apps rules. This is not an official NASA tool and NASA does not endorse it.

### NASA data

- **NASA Physical Sciences Informatics (PSI)**, <https://psi.nasa.gov>: investigation records, experimental tables and documents. Snapshot of 2026-11-14 in `data/raw/psi_combustion_snapshot.json`; how it was fetched is in [docs/DATA_SOURCES.md](docs/DATA_SOURCES.md), how it was mapped is in [data/curated/mappings.md](data/curated/mappings.md).
- **NASA Space Apps Challenge 2026** challenge statement, <https://www.spaceappschallenge.org/>, saved in [docs/challenge.md](docs/challenge.md).

The 24 investigations in the dataset (license as recorded in PSI):

| PSI ID | Investigation | DOI | Data license |
|---|---|---|---|
| [PSI-26](https://psi.nasa.gov/physci/repo/data/investigations/PSI-26) | BASS | [10.60555/58h4-dy80](https://doi.org/10.60555/58h4-dy80) | CC0-1.0 |
| [PSI-25](https://psi.nasa.gov/physci/repo/data/investigations/PSI-25) | BASS-II | [10.60555/4qc4-de67](https://doi.org/10.60555/4qc4-de67) | CC0-1.0 |
| [PSI-98](https://psi.nasa.gov/physci/repo/data/investigations/PSI-98) | Saffire-I | [10.60555/0t15-1z43](https://doi.org/10.60555/0t15-1z43) | CC0-1.0 |
| [PSI-99](https://psi.nasa.gov/physci/repo/data/investigations/PSI-99) | Saffire-II | [10.60555/2chp-m469](https://doi.org/10.60555/2chp-m469) | CC0-1.0 |
| [PSI-100](https://psi.nasa.gov/physci/repo/data/investigations/PSI-100) | Saffire-III | [10.60555/040q-4h36](https://doi.org/10.60555/040q-4h36) | CC0-1.0 |
| [PSI-69](https://psi.nasa.gov/physci/repo/data/investigations/PSI-69) | FLEX | [10.60555/mbq8-0451](https://doi.org/10.60555/mbq8-0451) | CC0-1.0 |
| [PSI-68](https://psi.nasa.gov/physci/repo/data/investigations/PSI-68) | FLEX-2 | [10.60555/byp8-h018](https://doi.org/10.60555/byp8-h018) | CC0-1.0 |
| [PSI-102](https://psi.nasa.gov/physci/repo/data/investigations/PSI-102) | SAME | [10.60555/gd4k-8h62](https://doi.org/10.60555/gd4k-8h62) | CC0-1.0 |
| [PSI-101](https://psi.nasa.gov/physci/repo/data/investigations/PSI-101) | SAME-R | [10.60555/2np7-jv14](https://doi.org/10.60555/2np7-jv14) | CC0-1.0 |
| [PSI-20](https://psi.nasa.gov/physci/repo/data/investigations/PSI-20) | ACME BRE | [10.60555/vb93-3y72](https://doi.org/10.60555/vb93-3y72) | CC0-1.0 |
| [PSI-47](https://psi.nasa.gov/physci/repo/data/investigations/PSI-47) | DAFT / DAFT-2 | [10.60555/ztgj-d202](https://doi.org/10.60555/ztgj-d202) | CC0-1.0 |
| [PSI-159](https://psi.nasa.gov/physci/repo/data/investigations/PSI-159) | ACME CFI-G | [10.60555/cyt1-kh64](https://doi.org/10.60555/cyt1-kh64) | CC0-1.0 |
| [PSI-22](https://psi.nasa.gov/physci/repo/data/investigations/PSI-22) | ACME E-FIELD Flames | [10.60555/se5a-8c73](https://doi.org/10.60555/se5a-8c73) | CC0-1.0 |
| [PSI-107](https://psi.nasa.gov/physci/repo/data/investigations/PSI-107) | SPICE | [10.60555/9kbh-e962](https://doi.org/10.60555/9kbh-e962) | CC0-1.0 |
| [PSI-106](https://psi.nasa.gov/physci/repo/data/investigations/PSI-106) | SLICE | [10.60555/pm12-rg61](https://doi.org/10.60555/pm12-rg61) | CC0-1.0 |
| [PSI-39](https://psi.nasa.gov/physci/repo/data/investigations/PSI-39) | CFI | [10.60555/m6pj-a914](https://doi.org/10.60555/m6pj-a914) | CC0-1.0 |
| [PSI-10](https://psi.nasa.gov/physci/repo/data/investigations/PSI-10) | ACME Flame Design | [10.60555/w4zy-bt45](https://doi.org/10.60555/w4zy-bt45) | not reported |
| [PSI-21](https://psi.nasa.gov/physci/repo/data/investigations/PSI-21) | ACME CLD Flame | [10.60555/23e1-9950](https://doi.org/10.60555/23e1-9950) | CC0-1.0 |
| [PSI-23](https://psi.nasa.gov/physci/repo/data/investigations/PSI-23) | ACME s-Flame | [10.60555/k57n-p030](https://doi.org/10.60555/k57n-p030) | CC0-1.0 |
| [PSI-117](https://psi.nasa.gov/physci/repo/data/investigations/PSI-117) | Effect of External Thermo-Convective Perturbation on Cool Flame Dynamics: A Multidimensional Multi-Physics CFD Analysis | [10.60555/gz0q-b577](https://doi.org/10.60555/gz0q-b577) | CC0-1.0 |
| [PSI-62](https://psi.nasa.gov/physci/repo/data/investigations/PSI-62) | Concurrent Flame Spread Modeling using Flamelet Generated Manifolds in Microgravity with Comparison to BASS Experiments using Two-Color Tomography | [10.60555/e9xp-ex83](https://doi.org/10.60555/e9xp-ex83) | CC0-1.0 |
| [PSI-60](https://psi.nasa.gov/physci/repo/data/investigations/PSI-60) | Computational and Experimental Analysis of SPICE Data Sets | [10.60555/mzjm-yv57](https://doi.org/10.60555/mzjm-yv57) | CC0-1.0 |
| [PSI-142](https://psi.nasa.gov/physci/repo/data/investigations/PSI-142) | Quantitative Studies of Cool Flame Transitions at Radiation / Stretch Extinction Using Counterflow Flames | [10.60555/80qf-vj95](https://doi.org/10.60555/80qf-vj95) | CC0-1.0 |
| [PSI-115](https://psi.nasa.gov/physci/repo/data/investigations/PSI-115) | Utilization of the Smoke Aerosol Measurement Experiment Data for Advanced Modeling and Simulation of Smoke Generation in Micro-Gravity | [10.60555/q0v5-1v28](https://doi.org/10.60555/q0v5-1v28) | CC0-1.0 |

Two results of the PSI "combustion" search are excluded because they are not combustion studies; they are listed with the reason in `data/curated/excluded.json`.

### Publications and reports

Sources of values and findings in `data/curated/` beyond the PSI records themselves. Only abstracts and openly available pages were read; paywalled full texts were not used. Each value in the data carries the exact source, locator and quote.

- Dietrich et al. 2014, Microgravity Science and Technology, [doi:10.1007/s12217-014-9372-2](https://doi.org/10.1007/s12217-014-9372-2): FLEX limiting oxygen index, used for the FLEX test outcomes.
- BASS-II Summary Report, NASA/TM-20210011385, <https://ntrs.nasa.gov/citations/20210011385>.
- Ferkul et al., ASGSR 2013, <https://ntrs.nasa.gov/citations/20140011099> (BASS).
- Scientific Reports 2018, [doi:10.1038/s41598-017-18398-4](https://doi.org/10.1038/s41598-017-18398-4) (BASS-II).
- Olson et al., ICES-2019, "Flammability Limits from BASS-II Testing in Microgravity Compared to Normal Gravity Limits", <https://ttu-ir.tdl.org/items/1922ad9f-ef4c-4f52-96a4-980c23debe5e> (BASS-II).
- Urban et al. 2019, Combustion and Flame 199, [doi:10.1016/j.combustflame.2018.10.012](https://doi.org/10.1016/j.combustflame.2018.10.012) (Saffire).
- Ferkul et al., "Results of Large-Scale Spacecraft Flammability Tests", <https://ntrs.nasa.gov/citations/20170008805> (Saffire).
- Nayagam et al. 2013, <https://ntrs.nasa.gov/citations/20130014061> (FLEX).
- NTRS 20140006585, <https://bvbvf1.bib-bvb.de/vufind/PrimoRecord/cdi_nasa_ntrs_20140006585> (SAME).
- Yang et al. 2018, Fire Safety Journal 98, [doi:10.1016/j.firesaf.2018.04.004](https://doi.org/10.1016/j.firesaf.2018.04.004) (SAME / SAME-R).
- NTRS 20130000422, <https://ntrs.nasa.gov/citations/20130000422> (SAME / SAME-R).
- Dehghani, PhD dissertation, University of Maryland, <https://drum.lib.umd.edu/handle/1903/29303> (ACME BRE).
- Wright 2021, MS thesis, University of Maryland, <https://drum.lib.umd.edu/items/b21822b4-9024-46d6-8cef-88f1e01a9d31> (ACME BRE).
- ACME overview, JASMAC-33, <https://ntrs.nasa.gov/citations/20210022542>.
- NASA ICES-2024-128, NTRS 20240005117, <https://ntrs.nasa.gov/api/citations/20240005117/downloads/ICES-2024-128-Final%20Manuscript-No%20Tracked%20Changes.pdf> (ISS atmosphere).
- Wikipedia, "Orion (spacecraft)", <https://en.wikipedia.org/wiki/Orion_(spacecraft)>: the only source so far for the Orion cabin atmosphere, a secondary source, so Orion is flagged as a scenario.

Partial gravity (why microgravity and Earth-gravity tests do not bound lunar gravity):

- Ferkul et al., LPSC 2026, <https://ntrs.nasa.gov/citations/20260000646>.
- NASA, "Fire on the Moon" overview charts, <https://ntrs.nasa.gov/api/citations/20210020516/downloads/Fire%20on%20the%20Moon-Overview%20charts-v1.pdf>.
- NASA, Flammability of Materials on the Moon (FM2), <https://www.nasa.gov/flammability-of-materials-on-the-moon-fm2/>.

The 352 publications that PSI lists for the investigations are stored per investigation in `data/curated/investigations.json` and shown, with DOI links, on each investigation page.

### Software

| Library | Version | License | Used for |
|---|---|---|---|
| [Next.js](https://nextjs.org) | 16.4.6 | MIT | App framework |
| [React](https://react.dev), React DOM | 19.3.1 | MIT | UI |
| [d3-scale](https://github.com/d3/d3-scale) | 4.0.3 | ISC | Chart scales |
| [zod](https://zod.dev) | 4.6.7 | MIT | Data validation |
| [TypeScript](https://www.typescriptlang.org) | 5.9.3 | Apache-2.0 | Language (development) |
| [ESLint](https://eslint.org), eslint-config-next | 9.39.5, 16.4.6 | MIT | Linting (development) |
| [Vitest](https://vitest.dev) | 5.1.0 | MIT | Tests (development) |
| [tsx](https://github.com/privatenumber/tsx) | 4.23.15 | MIT | Running data scripts (development) |
| @types/node, @types/react, @types/react-dom, @types/d3-scale | see `package.json` | MIT | Type definitions (development) |

Data scripts in `scripts/` use the Python 3 standard library only.

### Language model

The report route (`src/app/api/report/`) talks to any OpenAI-compatible endpoint set by environment variables. The default configuration in `.env.example` is the model `openai/gpt-oss-120b` served by Groq (<https://groq.com>, free tier). The model receives only the curated data and may cite only investigations present in it. No model or provider name is shown in the app.

### Development tools

Parts of the code and documentation were written with the help of AI coding assistants (Claude Code by Anthropic). All data values come from the NASA sources above, never from a model's memory.

### Media

All photos and video on the site are NASA material from the [NASA Image and Video Library](https://images.nasa.gov), used under the [NASA media usage guidelines](https://www.nasa.gov/nasa-brand-center/images-and-media/) (not copyrighted; no NASA insignia is used and no endorsement is implied). Files live in `public/media/`. The two clips were trimmed and re-encoded; nothing else was altered.

| File | What it shows | NASA ID and source |
|---|---|---|
| `bass-ii-iss040e088023.jpg` | Flame over a solid fuel sample, BASS-II (PSI-25), ISS, 2014 | [iss040e088023](https://images.nasa.gov/details/iss040e088023) |
| `saffire-vi-pmma.mp4`, `.jpg` | Saffire-VI PMMA sample burning inside a Cygnus cargo spacecraft (14 s excerpt and poster frame). Not part of the PSI snapshot. | [Saf-VI S8C3+C4 1-sided PMMA](https://images.nasa.gov/details/Saf-VI%20S8C3+C4%201-sided%20PMMA_unmapped_jpeg-20x%20no%20text) |
| `sofie-gel.mp4`, `.jpg` | SoFIE-GEL flame shrinking towards extinction (16 s excerpt and poster frame). Not part of the PSI snapshot. | [SoFIE-GEL](https://images.nasa.gov/details/SoFIE-GEL) |
| `moon-flyover.mp4`, `.jpg` | Flyover of the Taurus-Littrow valley (Apollo 17 site) from Lunar Reconnaissance Orbiter data (9 s excerpt and poster frame) | [GSFC_20190513_m4714_Lee_Lincoln_Scarp_Moon_Flyover](https://images.nasa.gov/details/GSFC_20190513_m4714_Lee_Lincoln_Scarp_Moon_Flyover) |
| `orion-moon-earth-art001e002083.jpg` | Orion, the Moon and Earth, Artemis I, 2022 | [art001e002083](https://images.nasa.gov/details/art001e002083) |
| `orion-earth-moon-art001e001822.jpg` | Earth and the Moon beside Orion's solar array, Artemis I, 2022 | [art001e001822](https://images.nasa.gov/details/art001e001822) |
| `sun-plasma-pia21866.jpg` | Plasma leaving the Sun, Solar Dynamics Observatory, 2017 (timestamp strip cropped). Decorative, not combustion data. | [PIA21866](https://images.nasa.gov/details/PIA21866) |

The flame drawing in the intro and the site icon are original SVG. Background textures are CSS only. The site uses system fonts only.

## License

Apache 2.0, see [LICENSE](LICENSE).

<!-- Kuba, if you are reading this: yes, this really was just a minor fix. -->
