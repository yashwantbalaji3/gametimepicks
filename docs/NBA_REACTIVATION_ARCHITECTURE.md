# NBA Reactivation Architecture

_Concrete architecture + ordered steps to bring the NBA player-prop pipeline back from **HISTORICAL_ONLY**
([docs/NBA_ENGINE_FORENSIC_AUDIT.md](NBA_ENGINE_FORENSIC_AUDIT.md)) to producing real, leakage-safe, validated
output when the 2026-27 season returns (~Oct 2026). The machinery is intact and automated — reactivation is
"turn it back on, fix the data source, and re-earn the validation gate", not "rebuild". Nothing here activates
anything public; NBA stays HISTORICAL_ONLY until the gate below passes and the founder approves._

## 1. Current state (why nothing serves today)

Two independent blockers, both evidenced:

1. **Off-season.** Season ended 2026-06-13; next games ~Oct 2026. The ESPN schedule fallback correctly returns 0
   games (`app/public/data/board.json` → `scheduleProviderHistory[espn_scoreboard].games = 0`). Resolves with the
   calendar.
2. **`stats.nba.com` is timing out from CI.** `board.json.failureReason` = `scoreboardv2 … Read timed out;
   leaguegamefinder … Read timed out`. `pipeline/fetch_nba_data.py` documents that NBA.com periodically blocks
   GitHub Actions IPs (circuit breaker added; the morning cron already raised its timeout 25→45s), and
   `morning-projections.yml` carries a `skip_nba` escape hatch + a `nba_data_provider` override for exactly this.

## 2. Pipeline stages (all exist; where each gets its data)

| Stage | Script(s) | Primary source | Fallback | Off-season / failure today |
|---|---|---|---|---|
| Schedule / scoreboard | `generate_daily_board.py` → `providers/nba_api_provider.py`, `fetch_nba_schedule.py` | stats.nba.com (`scoreboardv2`, `leaguegamefinder`) | ESPN scoreboard | stats.nba.com **times out**; ESPN returns 0 (off-season) |
| Odds ingest | `generate_daily_board.py` (the_odds_api), `credit_guard.py` | The Odds API (player props) | none (no fabrication) | credit-guarded; no live slate to price |
| **Per-player game logs** (trailing form) | `attach_recent10.py`, `fetch_nba_data.py`, `build_features.py` | **stats.nba.com game logs (nba_api)** | stale leakage-filtered on-disk cache; balldontlie (`ENABLE_BALLDONTLIE_FALLBACK`, default off) | **the real single point of failure** — see §3 |
| Board assembly / features | `generate_daily_board.py`, `build_features.py`, `enrich_board.py` | derived | — | produces empty scaffold when schedule fails |
| Manual news / injuries | `manual_overrides/news_signals.json` (`INJURY_DATA_MODE=manual`) | manual | — | inert (empty) |
| Settlement | `audit_daily.py`, `export_results.py`, `nightly-settle.yml` | **ESPN summary + nba_api box scores** | — | no games to settle |
| Results / calibration | `export_results.py`, `calibration_report.py`, `lifetime_summary.json` | derived | — | frozen at 2026-06-13 |

**Data-grounded refinement of the audit's #1 blocker:** the settled record shows box-score *settlement* is largely
resilient — of 3,635 decisive outcomes, **ESPN summary settled 3,429 (94%)** and nba_api only 206
(`settlementSource` in `app/public/data/results/settled_leans.jsonl`). The stats.nba.com dependency bites hardest on
the **projection side** — the per-player game logs that feed `recent10` / rolling / dispersion features. That is the
component to harden first.

## 3. Resolving the stats.nba.com timeout (the critical dependency)

Ordered by preference; adopt the first that proves reliable from CI:

1. **Alternate egress for nba_api.** NBA.com blocks GitHub Actions IPs intermittently. Route the game-log fetches
   through a proxy / rotating egress, or run hydration on a self-hosted / residential runner. The circuit breaker
   and raised timeout in `fetch_nba_data.py` already fail soft; this makes the healthy path reliable.
2. **Alternate game-log provider.** Wire an ESPN player-gamelog or balldontlie adapter behind the existing provider
   interface (`ENABLE_BALLDONTLIE_FALLBACK` already exists) so trailing form survives a stats.nba.com outage. Must
   emit the same `GameLog` shape `build_features.py` consumes, and must obey the same strictly-prior filter.
3. **Schedule already has ESPN.** Board generation's schedule step degrades to ESPN scoreboard automatically; no new
   work beyond confirming it returns games once the season starts.

Success test: `fetch_nba_data_test.py`, `providers/nba_api_provider_test.py`, and `recent10_cache_fallback_test.py`
green against the chosen source, and a dry-run board with non-empty `recent10` whose dates are all strictly prior.

## 4. Ordered reactivation steps

1. **Season-return trigger (~Oct 2026).** Confirm the ESPN scoreboard fallback returns a real slate; confirm
   `morning-projections.yml` `skip_nba` is OFF and `nba_data_provider` is default (or `espn_scoreboard` if
   stats.nba.com is still blocked).
2. **Harden the game-log source (§3).** This is the gating engineering task — without reliable per-player logs the
   trailing-form features are empty and every lean downgrades to `insufficient_data`.
3. **Re-enable ingest.** Schedule (nba_api→ESPN), odds (the_odds_api under `credit_guard`: per-run cap 75,
   floor 300, hard refusal when key unset — no fabrication).
4. **Record an ISO tip-off.** Fix the contract gap: boards store `tipoff` as a display string (`"8:30 PM ET"`).
   Capture an ISO tip-off instant so `boardGeneratedAt < tipoffTime` is enforceable by
   `app/src/lib/nba/feature-timing-contract.ts` rather than assumed.
5. **Regenerate boards** via `generate_daily_board.py` → `build_features.py` → `attach_recent10.py` (leakage filter
   drops any game on/after the slate) → `enrich_board.py`. Verify 0 source-game leaks (as the 2026-06-13 board
   showed: max source date 2026-06-11 < slate).
6. **Add the pre-tip news guard.** Give the manual news layer an immutable `newsCapturedAt`; enforce
   `newsCapturedAt < tipoffTime` (the audit's reactivation risk).
7. **Repair the settlement join.** `3PM`/`PRA`/`STL`/`BLK` graded 100% invalid (0 of 903 rows). Fix the box-score
   join so these families settle (ESPN summary primary, nba_api repair pass) via `audit_daily.py` /
   `nightly-settle.yml`. Until fixed, keep those families out of any surfaced product.
8. **Run the validation gate (§5) before ANY public exposure.**

## 5. The validation gate (must pass before public exposure)

Reactivation restores *data*, not *trust*. The honest performance record is below a coin flip (lifetime hit 0.4908
on 3,635 decisive; the model is worse than the de-vig market on Brier for all three settleable markets — see
[status/nba-first-market-recommendation.json](../status/nba-first-market-recommendation.json)). So exposure is gated
exactly like MLB:

1. **Rebuild ONE market first: REB** (the only settleable market above a coin flip and nearest market parity).
2. **Leakage contract passes.** `app/src/lib/nba/feature-timing-contract.ts` green on live boards (ISO tip-off,
   strictly-prior source games, pre-tip news).
3. **Strict chronological out-of-sample split.** Calibration refit ONLY on the train slates; test on held-out later
   slates. No re-use of the test window for tuning.
4. **Beat the de-vig market baseline** on BOTH Brier score AND log loss, and be probability-calibrated.
5. **Founder review**, then flip from research to public with `active:false → true` / `exposure:0` lifted — one
   market at a time. Everything stays `public:false`, paper-only, $0 until each item is met.

Money invariant throughout: portfolio.json and every bankroll artifact are untouched (md5
`affe6b21071f2b3be96bb2774eb347c3`). NBA reactivation is additive, paper-only, and never mutates money.
