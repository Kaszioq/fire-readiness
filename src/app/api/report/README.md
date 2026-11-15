# Report route

`POST /api/report` (contract: `docs/CONTRACTS.md` section 7, spec: `docs/SPEC.md` module 5).

## Flow

1. `context.ts` builds the only text the model sees:
   - the target atmosphere;
   - the deterministic predictor output for thin fabric, thin solid, thick solid, droplets and fire-resistant materials;
   - data facts computed from the curated test runs (how many solid runs are "sustained", what the fire-resistant runs did) plus two facts from NASA reports that are not PSI investigations (`NTRS 20070018178`, `NTRS 20260000646`, both from `docs/STATUS.md`);
   - the 10 top-ranked investigations and any investigation that supplied test runs: summary, tested conditions, findings. No provenance quotes.
2. `llm.ts` calls an OpenAI-compatible endpoint (`LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL`), 25 s timeout.
3. `validate.ts`:
   - `validateCitations` removes every `[PSI-xx]` that is not in the context and returns it in `stripped_citations`;
   - `checkReport` rejects the text if a section is missing or out of order, if it is too short or long, has no citation, mentions rockets or propellants, says that 0 g and 1 g tests bound partial gravity, calls a fire-resistant material safe or says such materials "did not burn" as a blanket statement, counts more runs of a fire-resistant material than the data hold, mentions a margin without calling it a physics estimate, describes droplets as untested when droplet runs cover the target, or leaves those droplet runs out;
   - `normalizeTypography` and `tidyReport` only clean the text (plain hyphens and brackets, NTRS sources in round brackets, no trailing spaces).
4. `route.ts` returns the live report, or the cached report for the habitat (or the nearest preset) with `cached: true` when no LLM is configured, the provider fails, is rate limited (HTTP 429) or times out, or the text is rejected.

## Cached reports

`npm run reports` writes `data/cached_reports/<habitat_id>.json` for every preset through the same pipeline, so a cached report has passed the same checks. `npm run reports -- --dry` prints the context without calling the model.

The checks are string checks. They catch the claims listed above, not every possible error, so read a regenerated cached report before committing it.

## Token budget

The free tier counts prompt plus `max_tokens` against 8000 tokens per minute. The context is about 4400 tokens and `max_tokens` is 1800, so one report per minute; a second request inside the minute gets HTTP 429 and the route serves the cached report. gpt-oss models get `reasoning_effort: low` (see `.env.example`), otherwise they spend the budget on reasoning and return an empty or cut-off text.
