# Moon Base Fire Readiness

NASA Space Apps Challenge 2026 entry (working name).

> Of the NASA PSI microgravity combustion investigations, which ones tell us whether a habitat atmosphere (e.g. the Artemis Moon base at 30%+ O2 and 10.2 psi) is fire-safe, how confident can we be, and what must future experiments (LUCI, FM2) still measure?

This is not an official NASA tool. Rockets and propellants are out of scope.

## Status

Skeleton. The app runs on mock data (`data/mock/*.mock.json`, fake values) and says so in a banner. The predictor, the ranking and the report route are stubs with the final signatures.

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

To be filled in before submission: NASA PSI investigations (PSI IDs and DOIs), publications, libraries with licenses, the LLM model and provider, fonts, icons.

## License

Apache 2.0, see [LICENSE](LICENSE).

<!-- Kuba, if you are reading this: yes, this really was just a minor fix. -->
