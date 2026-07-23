# NBA Engine — Forensic Audit (for next-season reactivation)

**Audit date:** 2026-07-23 (NBA off-season; 2026 Finals ended 2026-06-13)
**Scope:** Read-only, artifact-backed. Every claim below cites a path that was opened and read (JSON internals, newest date inside, game counts). No code or data was modified except this document.

---

## 1. Summary

The NBA stack is **not a scaffold** — a complete, tested, automated player-prop pipeline (schedule → odds → projections → simulation-shadow → settlement → results) genuinely ran end-to-end during the 2026 playoffs, producing 54 daily boards, ~196 model leans per slate, and **3,635 box-score-settled outcomes** spanning **2026-05-15 → 2026-06-13** (`app/public/data/results/lifetime_summary.json`). But every *current-season* artifact is empty: the served `app/public/data/board.json` has **0 leans**, `dataMode: "ScheduleUnavailable"`, `scheduleProviderStatus: "failed"` (generated 2026-07-22), and boards for 2026-07-22…07-25 are 2,769-byte empty scaffolds whose `failureReason` is a `stats.nba.com` read-timeout. No current data exists and none can be produced now, for two independent reasons: (a) it is the NBA off-season — the season ended 2026-06-13, next games ~Oct 2026 — so the ESPN schedule fallback returns 0 games; and (b) the primary data source `stats.nba.com` (via `nba_api`) is timing out from CI. The routes, nav, and automation are all still live (the footer even labels NBA "· off-season"). The prediction pipeline is **leakage-safe by design** (boards generated pregame; trailing `recent10` from prior games via a "leakage-filtered" cache; manual pregame news layer; settlement uses post-game `finalStat`). Honest performance caveat: lifetime hit rate is **0.4908** (below a coin flip) on 3,635 decisive leans, and ~20% of settled rows are `invalid`. Final classification: **HISTORICAL_ONLY** (real past data, no current output, machinery intact and reactivatable).

---

## 2. Component matrix

Legend: ✓ yes · ✗ no · ◐ partial. "Last valid date" = newest date with *real* content found inside the artifacts.

| Component | Exists | Last valid date | Current-season capable | Automated | Tested | Leakage-safe | Evidence |
|---|---|---|---|---|---|---|---|
| **Routes** | ✓ | live (renders now, empty) | ✓ | n/a | ◐ | n/a | `app/src/app/nba/{page,board,power,parlays,results}/page.tsx`, `app/src/app/results/nba/page.tsx`; board route re-exports `/board` |
| **Nav visibility** | ✓ | current | ✓ | n/a | ✓ | n/a | `command-rail.tsx:51` `{href:"/nba",label:"NBA",glyph:"🏀"}`; `footer.tsx:76-77` NBA "· off-season"; `nav.tsx:60` SPORT_RE includes `nba` |
| **Schedule ingestion** | ✓ | 2026-06-13 (last real games) | ✓ but **currently failing** | ✓ | ✓ | ✓ | `pipeline/fetch_nba_schedule.py`, `pipeline/providers/nba_api_provider.py` (stats.nba.com), ESPN fallback; current failure in `board.json.failureReason` (read timeout) |
| **Team map** | ✓ | current (static) | ✓ | n/a | ✓ | n/a | `sport-identity.ts:75-84` (nba entry) + aliases `:153-155`; board `team`/`teamFullName` (NY/SA) |
| **Player map** | ✓ | 2026-06-13 | ✓ but tied to stats.nba.com | ✓ | ✓ | ✓ | board `playerId`/`playerName`; `pipeline/cache/nba_api_roster_{NY,SA}.json`; no dedicated player-identity.ts (uses nba_api ids) |
| **Injuries** | ◐ | 2026-06-13 (fields present) | ✓ (manual) | ✗ (manual) | ◐ | ◐ | `config.py:84,92` `INJURY_DATA_MODE=manual` → `manual_overrides/news_signals.json`; board `newsAction`/`newsSignals` (empty in sample) — no automated feed |
| **Expected minutes** | ✗ | none | ✗ | ✗ | ✗ | n/a | grep for `expected_minutes`/`minutes_projection` = none; only **planned** in `app/src/app/nba/power/page.tsx` (`inputsPlanned`, "Pending … per-player log wiring") |
| **Market ingestion (odds)** | ✓ | 2026-06-13 (board) / 2026-06-10 (probe) | ✓ | ✓ | ✓ | ✓ | board `oddsSource:"the_odds_api"`; `app/public/data/nba/game-markets/*.json`; `market-probe-latest.json`; `pipeline/fetch_game_markets_test.py` |
| **Player props** | ✓ | 2026-06-13 | ✓ | ✓ | ✓ | ✓ | the 196 leans ARE props (PTS/REB/AST/PRA/BLK/3PM/STL) in `boards/2026-06-13.json`; `market-probe-latest.json` lists 10 available prop markets; `pipeline/nba_sgp_test.py` (26 tests) |
| **Team markets** | ◐ | 2026-06-10 | ✓ | ◐ (manual dispatch) | ✓ | ✓ | `app/public/data/nba/game-markets/2026-06-10.json` (ML/spread/total, 1 game); only 5 dates ever (5/20-23, 6/10); `team_projections/` only 2 files (5/20-21) |
| **Prediction generation** | ✓ | 2026-06-13 (196 leans) | ✓ | ✓ | ✓ | ✓ | `pipeline/generate_daily_board.py`, `build_features.py`, `attach_recent10.py` → `modelProjection`/`edgePct`/`modelProbability`/`confidence` |
| **Simulation** | ◐ | 2026-05-26 | ◐ (shadow only) | ◐ | ✓ | ✓ | `pipeline/monte_carlo_validation.py` + `app/public/data/audit/monte_carlo_shadow_2026-05-{22,23,25,26}.json`; explicitly shadow/validation, not production scoring |
| **Settlement** | ✓ | 2026-06-13 | ✓ | ✓ | ✓ | ✓ | `pipeline/audit_daily.py` + `export_results.py` → `settled_leans.jsonl` with `finalStat` from box scores (e.g. Mikal Bridges AST finalStat 4.0 vs line 2.5 → win); `nightly-settle.yml` |
| **Results** | ✓ | 2026-06-13 | ✓ | ✓ | ✓ | ✓ | `results/lifetime_summary.json` (3,635 settled, hit 0.4908), `comparison_report_2026-06-13.json` (hit 0.42), `settled_leans.jsonl` (4,592 rows) |
| **Workflows** | ✓ | active cron | ✓ (empty off-season) | ✓ | n/a | n/a | `morning-projections.yml` (cron `30 13 * * *`, NBA+MLB, credit-guarded, `skip_nba` escape hatch), `nightly-settle.yml`, `nba-market-probe.yml` (manual dispatch only) |
| **Tests** | ✓ | current | ✓ | n/a | ✓ | n/a | ~46 NBA-specific py tests: `fetch_nba_data_test.py` (14), `nba_sgp_test.py` (26), `providers/nba_api_provider_test.py` (6); + `audit_daily_test`, `attach_recent10_test`, `build_features_test`, `model_audit_test`, `monte_carlo_validation_test`, `recent10_cache_fallback_test`; app: `nba-finals-cards.test.mjs`, `sport-identity.test.mjs` |

---

## 3. Freshest real data date per family (honesty check)

The newest date with genuine content actually found *inside* each family's JSON.

| Data family | Path (representative) | Freshest real date | Notes |
|---|---|---|---|
| Board leans (predictions) | `app/public/data/boards/2026-06-13.json` | **2026-06-13** | 196 real leans, `dataMode:"Live"`; boards 06-14 → 07-25 are empty scaffolds |
| Served "latest" board | `app/public/data/board.json` | 2026-07-22 (generatedAt) | **0 leans**, `dataMode:"ScheduleUnavailable"`, `scheduleProviderStatus:"failed"` |
| Player-prop odds (in board) | `boards/2026-06-13.json` (`oddsSource`) | 2026-06-13 | the_odds_api, embedded per-lean |
| Team game-markets | `app/public/data/nba/game-markets/2026-06-10.json` | 2026-06-10 | 1 game (NYK/SAS); only 5 dated files total |
| Team projections | `app/public/data/nba/team_projections/2026-05-21.json` | 2026-05-21 | only 2 files ever produced |
| Market probe | `app/public/data/nba/market-probe-latest.json` | 2026-06-10 | 10 of 11 prop markets available from OddsAPI |
| Settled leans | `app/public/data/results/settled_leans.jsonl` | 2026-06-13 | 4,592 rows; 1,784 win / 1,851 loss / 903 invalid / 54 stats_unavailable |
| Comparison reports | `app/public/data/results/comparison_report_2026-06-13.json` | 2026-06-13 | per-date audit; 19 dated reports (05-05 → 06-13) |
| Lifetime summary | `app/public/data/results/lifetime_summary.json` | `newestDate` 2026-06-13 | 3,635 decisive, hit 0.4908, regenerated today (no new data) |
| Monte-Carlo shadow (sim) | `app/public/data/audit/monte_carlo_shadow_2026-05-26.json` | 2026-05-26 | shadow-mode only |
| nba_api cache (schedule) | `pipeline/cache/nba_api_schedule_diag_2026-06-23.json` | 2026-06-23 | post-season probes; 0 games |

**Single freshest real NBA data point (a real game / prediction / outcome): 2026-06-13** — the last game of the season. Everything after is empty or off-season.

---

## 4. Leakage assessment

**Prediction generation: leakage-safe by design.**
- Boards are generated **pregame**: `boards/2026-06-13.json` `generatedAt` = 2026-06-13T15:17:23Z (11:17 AM ET) vs sample lean `tipoff` = "8:30 PM ET".
- Trailing form `recent10` uses **prior** game logs; `pipeline/attach_recent10.py` explicitly handles a "leakage-filtered" on-disk cache and preserves prior form rather than pulling same-day results.
- Injury/news is a **manual pregame** layer (`news_signals.json`), surfaced as `newsAction`/`newsSignals` on the lean.
- Settlement correctly uses **post-game** `finalStat` (that is the intended direction, not leakage).

**Caveat / reactivation risk:** the manual injury layer has **no automated `capturedAt < tipoff` enforcement** — nothing structurally prevents a post-tipoff news edit from being applied. A reactivation should add an immutability/timestamp guard analogous to the MLB pregame archive (`researchEligible = capturedAt < eventStart`). No evidence of an *actual* post-tipoff leak was found in the 2026 artifacts.

---

## 5. Classification

### **HISTORICAL_ONLY**

**Justification (evidence-grounded):**

- **Why not SCAFFOLD_ONLY:** abundant real data flowed. 54 boards, 196 leans/slate, 3,635 box-score-settled outcomes, 19 comparison reports, real OddsAPI odds and Monte-Carlo shadow files. A full, tested pipeline demonstrably ran end-to-end for a month of live playoffs. This is the opposite of "routes/scripts but little real data ever flowed."
- **Why not PUBLIC_BETA_CAPABLE now:** every current artifact is empty. The served `board.json` has 0 leans and `dataMode:"ScheduleUnavailable"`; boards through 2026-07-25 are empty scaffolds; the NBA hub renders no leans today. A live registry entry + route scaffold + active cron over **empty** current boards is not "capable now."
- **Why HISTORICAL_ONLY over RESEARCH_ONLY:** the NBA surface is public (indexed routes in nav/footer/command-rail showing historical results/audit), not an internal research-only artifact. The data is genuine *historical* product output, currently frozen.

The stack sits at the **capable end** of HISTORICAL_ONLY: the machinery (scripts, providers, tests, credit-guarded workflows) is intact and automated, so reactivation is closer to "turn it back on and fix the data source" than "rebuild." But **as of 2026-07-23 it produces nothing**, so the honest present-tense label is HISTORICAL_ONLY.

### Top reactivation blockers

1. **Primary data source `stats.nba.com` (`nba_api`) is unreliable from CI.** It is *literally timing out right now* — `board.json.failureReason` = `scoreboardv2 … Read timed out; leaguegamefinder … Read timed out`. `fetch_nba_data.py` documents that "NBA.com periodically blocks GitHub Actions IPs," a circuit breaker was added, and `morning-projections.yml` carries a `skip_nba` escape hatch for exactly this. The projection model *and* settlement both depend on `nba_api` game logs / box scores (ESPN only covers the schedule), so a resilient replacement or proxy is the #1 dependency.
2. **Off-season.** No live schedule or odds exist to ingest until the 2026-27 season (~Oct 2026); the ESPN fallback correctly returns 0 games, so there is nothing to serve regardless of #1. This is structural and resolves with the calendar.

### Secondary blockers / quality debt

- **Model has not shown an edge:** lifetime hit rate **0.4908** on 3,635 decisive leans; `comparison_report_2026-06-13` hit rate 0.42. Reactivating as a *public* product (vs research) needs recalibration, mirroring the MLB "demoted markets" finding.
- **Settlement join quality:** **903 / 4,592 (~20%) settled rows are `invalid`** — a name/id/market join gap to fix before results are trustworthy.
- **Team-markets pipeline barely exercised:** only 5 game-market dates and 2 team-projection dates ever produced; `nba-market-probe.yml` is manual-dispatch only.

---

*End of audit. Read-only; no code or data modified.*
