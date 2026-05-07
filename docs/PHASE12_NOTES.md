# Phase 12 — public alpha polish, data integrity, and Parlay Lab foundation

This package fixes the critical data-integrity bug surfaced by the Phase 11 audit, sweeps the remaining lime/amber palette references across the site, removes dead code, and lays a responsible foundation for the Parlay Lab — all in one cohesive pass.

## What changed

### Critical: data integrity (Part 1)

`app/src/lib/grouping.ts` previously built `cardKey = ${date}-${gameId}-${playerId}`. When the daily board generator emits leans with `playerId = 0` (because the nba_api schedule provider couldn't resolve the player), multiple distinct players collapse into one card. The card header showed the first player's name, but the PTS/REB/AST rows pulled from ALL leans in the bucket — silently mis-attributing data.

Fix: when `playerId` is 0 / NaN / null / undefined / negative / non-numeric, the cardKey now falls back to `name:<normalized-player-name>`. Valid playerIds keep their existing behavior (no regression).

Normalization rule (must stay in sync with `pipeline/grouping_collision_test.py`):
- NFD-decompose, strip diacritics
- lowercase
- replace `[^a-z0-9]+` with `_`
- trim leading/trailing `_`

`Nikola Jokić` and `Nikola Jokic` collapse to one card (correct). `LeBron James` and `LeBron James Jr.` produce different cardKeys (correct — false collisions are far worse than false splits).

**31 new regression assertions** in `pipeline/grouping_collision_test.py` enforce the rule.

### Recent10 / trend reliability (Part 2)

No new code here — Phase 11 already added the `inspect_trends` diagnostic and the loud nba_api import check. Phase 12 wires the new tests (`grouping_collision_test`, `parlay_lab_test`) into both `scripts/run_all_tests.sh` and `scripts/automation_refresh.sh`, so the workflow log will surface them automatically.

The trend graph problem is not a code bug — it's that 87% of leans in the sandbox board have `playerId=0`, which is upstream of `attach_recent10`. The cardKey fix means those players at least display correctly even if their trend data can't be hydrated. Regenerating boards with valid playerIds (manual operator step, see `docs/TROUBLESHOOTING.md`) is still the path to high coverage.

### UI polish — lime sweep (Part 3)

43 `var(--lime)` / `var(--amber)` / `#A3E635` / `#65A30D` references swept across 13 files:
- `app/src/app/methodology/page.tsx`
- `app/src/app/responsible-use/page.tsx`
- `app/src/components/board-with-tabs.tsx`
- `app/src/components/kpi-tile.tsx`
- `app/src/components/game-card.tsx`
- `app/src/components/props-unavailable.tsx`
- `app/src/components/data-source-badge.tsx`
- `app/src/components/trends-client.tsx`
- `app/src/components/trend-sparkline.tsx`
- `app/src/components/demo-fallback-banner.tsx`

After Phase 12, `grep -rn "var(--lime)\|var(--amber)" app/src` returns zero matches.

### Parlay Lab foundation (Part 4)

A safe, educational analysis layer at `/parlay-lab`. Users paste a parlay slip from any sportsbook (DraftKings, FanDuel, etc.) — one leg per line — and the page checks each leg against the model.

- **No scraping.** Users paste their own slip; we never fetch from sportsbook pages.
- **No fabricated alternate lines.** If the slip says "LeBron Over 26.5 PTS" but the model only has "LeBron Over 25.5 PTS", the leg is reported as `no_matching_line` with the available lines listed.
- **No profitability claims.** Per-leg verdicts describe whether the model AGREES, OPPOSES, or PASSED on the prop — never whether it would be a winning bet.
- **Same-game correlation warning** when 2+ legs share a game.
- **Data quality flags** for legs whose lean has `playerId=0` or missing `recent10`.
- **Risk profile labels** (Conservative / Balanced / Aggressive / Uncertain) — labels, not advice.
- **Combined American odds** computed only when every leg has odds. Implied probability is annotated with "assumes legs are independent — they're not when same game."

The page is server-rendered (loads slate data from existing per-day board JSONs); the interactive paste/analyze panel is a client component. **Zero network calls, zero API keys, zero Odds API credits.**

44 new test assertions in `pipeline/parlay_lab_test.py` validate the matching/parsing logic (Python port of the TS implementation).

### Cleanup

Deleted (verified zero importers):
- `app/src/components/calibration-chart.tsx`
- `app/src/components/hit-rate-chart.tsx`
- `app/src/components/status-badge.tsx`
- `app/public/data/hit_rates.json` (legacy demo data, no longer read after Phase 11)
- `getHitRates()` and `HitRatesData` import in `lib/data.ts` (dead after Phase 11)

Component count down from 25 → 22.

### Nav update

Removed unmaintained `/trends` link, added `/parlay-lab`. The `/trends` page itself stays in the codebase (no broken external link) but isn't promoted in the nav.

## Test coverage summary

10 Python suites, 444 assertions, all green:

| Suite | Assertions |
|---|---|
| filter_test | 58 |
| settle_test | 66 |
| grouping_test | 69 |
| diagnostics_test | 43 |
| recent10_test | 23 |
| export_results_test | 38 |
| confidence_guardrails_test | 43 |
| inspect_trends_test | 29 |
| **grouping_collision_test (NEW)** | **31** |
| **parlay_lab_test (NEW)** | **44** |
| **Total** | **444** |

## Known acceptable limitations after Phase 12

- **Internal CSS token names use `--vault-*` prefix.** This is a holdover from earlier phases when "vault" was the internal codename. Users never see this — the brand presented in copy and nav is "GametimePicks." Renaming the tokens to `--gtp-*` is a pure cosmetic refactor that's worth doing but not now (would touch 200+ references and risks build breakage).

- **`/trends` page still exists** but is no longer linked from the nav. The data file `trends.json` is stale (May 5 single-player snapshot). The page renders but is not maintained. Decide later whether to delete the page entirely or refresh the data source.

- **Recent10 coverage is bounded by playerId quality at board-generation time.** The Phase 12 cardKey fix means low-coverage boards now display correctly without merging players, but the trend graphs themselves still need real playerIds. The actual fix for that lives in `pipeline/generate_daily_board.py` and the nba_api install in your run environment. See `docs/TROUBLESHOOTING.md`.

## What was intentionally NOT built

- **Scraping DraftKings/FanDuel suggested parlays** — explicitly off-limits.
- **Automated import from sportsbook APIs** — no compliant free API for suggested parlays exists.
- **Multi-sport support** — NBA must be excellent first.
- **Real-money betting integrations** — out of scope.
- **Confidence threshold recalibration** — needs ≥50 settled picks first.
- **X / social posting** — only after model is validated.
- **Internal CSS token rename** — see "known limitations" above.

## Next phases (proposed)

- **Phase 13**: settle May 5 + populate the lifetime summary; verify home page tiles light up with real numbers.
- **Phase 14**: the actual generate_daily_board.py investigation — why playerId=0 keeps shipping. May involve a small change to the nba_api wiring.
- **Phase 15**: optional CSS token rename `--vault-*` → `--gtp-*` for cleaner internal naming.
- **Phase 16**: visual refinements only after settled data exists and trend graph coverage is high.
