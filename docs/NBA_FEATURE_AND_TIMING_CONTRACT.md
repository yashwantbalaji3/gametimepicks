# NBA Leakage-Safe Feature & Timing Contract

_The feature/timing spec the NBA player-prop pipeline already satisfied during the 2026 playoffs, and that any
re-validated NBA model MUST satisfy before backtest or public exposure. NBA is **HISTORICAL_ONLY**
([docs/NBA_ENGINE_FORENSIC_AUDIT.md](NBA_ENGINE_FORENSIC_AUDIT.md)) — freshest real data 2026-06-13, no current
output. Analogous to [docs/UFC_FEATURE_CONTRACT.md](UFC_FEATURE_CONTRACT.md) and the MLB pregame archive
([app/src/lib/mlb/pregame-archive/eligibility.ts](../app/src/lib/mlb/pregame-archive/eligibility.ts)). Enforced by
[app/src/lib/nba/feature-timing-contract.ts](../app/src/lib/nba/feature-timing-contract.ts) + `.test.mjs`.
No modeling, no probability, no money, not public._

## The one rule

A feature value is eligible only when it was provably known **before tip-off** AND was built **only from games
strictly earlier than the slate date**:

```
boardGeneratedAt < tipoffTime
  AND (newsCapturedAt == null OR newsCapturedAt < tipoffTime)
  AND every sourceGameDate < slateDate
```

Equality is ineligible. A **display-only tip-off** (`"8:30 PM ET"`), a missing capture time, or an undated source
game is ineligible — timing is never inferred. Settlement is the one deliberately *post-game* step (it reads the
final box score) and is the intended direction, not leakage.

## Feature contract

Sources: `pipeline/build_features.py` (trailing-form features), `pipeline/attach_recent10.py` (recent-form
attachment + leakage filter), `pipeline/generate_daily_board.py` (schedule/odds/board assembly),
`pipeline/config.py` (`NEWS_DATA_MODE`/`INJURY_DATA_MODE = "manual"`). "Timing" is relative to tip-off.

| Feature | Source | Timing (availability vs tip-off) | Leakage boundary | Null / fallback behavior | Leakage risk |
|---|---|---|---|---|---|
| `last5_{pts,reb,ast,min}` rolling avg | prior game logs (nba_api / ESPN box scores) | pregame (board gen ~9–11 AM ET) | source games **strictly < slateDate** | `_empty_features()` zeros; `insufficient_data` confidence | LOW — filter enforced by `attach_recent10` |
| `last10_{pts,reb,ast,min}` rolling avg | prior game logs | pregame | source games < slateDate | zeros if no logs | LOW |
| `season_{pts,reb,ast,min}` avg | all available prior logs | pregame | source games < slateDate | zeros | LOW |
| `home_{pts,reb,ast}` / `away_{pts,reb,ast}` splits | prior logs split by venue | pregame | source games < slateDate | falls back to base avg | LOW |
| `minutes_trend` (OLS slope over last 10) | prior logs (chronological) | pregame | source games < slateDate | 0.0 if <3 games | LOW |
| `games_played_window` (sample-size sanity) | prior logs | pregame | source games < slateDate | 0.0 | LOW |
| `dispersion_{pts,reb,ast,3pm,pra,blk,stl}` (σ for the normal model) | prior logs std-dev, floored | pregame | source games < slateDate | calibrated floor (e.g. σ_pts≥6) | LOW |
| `last5/last10/season_{3pm,pra,blk,stl}` | prior logs (expanded markets) | pregame | source games < slateDate | zeros | LOW — but **settlement of these markets is broken (see below)** |
| `recent10` / `recentGames[]` (per-game sparkline) | `attach_recent10.extract_recent_games_all_markets` | pregame; re-attach is idempotent + date-filtered | any game **on/after slateDate is dropped** | preserves prior form on fetch miss (never erased) | LOW — verified 0 leaks (below) |
| sportsbook line + `oddsOver`/`oddsUnder` + de-vig `impliedProbability` | `the_odds_api` at board generation | pregame (generation-time snapshot) | captured at `boardGeneratedAt` < tip-off | lean excluded if no odds | LOW if generation is pregame |
| `bookmaker` | the_odds_api | pregame | with the odds snapshot | — | none |
| `newsAction` / `newsSignals[]` (injury/news) | **manual** `manual_overrides/news_signals.json` (`INJURY_DATA_MODE=manual`) | pregame **manual** layer | `newsCapturedAt` **must be** < tip-off | `"none"` / `[]` default | **MEDIUM — no automated `capturedAt<tipoff` enforcement today** |
| identity: `team`,`opponent`,`homeAway`,`playerId`,`playerName`,`gameId` | schedule (nba_api → ESPN fallback) + roster cache | pregame (schedule resolves at generation) | static per slate | lean dropped if unresolved | none |
| `tipoff` | schedule | pregame, but stored **display-only** (`"8:30 PM ET"`) | **not a proven instant → unprovable under the contract** | — | **reactivation gap (see below)** |

Model **outputs** (not inputs) written per lean: `modelProjection`, `modelProbability`, `edgePct`, `confidence`,
`reason`, `riskFlags`. These are derived from the features above; they are not themselves features.

## Timing / leakage boundary (grounded in the real 2026-06-13 board)

`app/public/data/boards/2026-06-13.json` (196 leans, `dataMode:"Live"`):

- **Board generated pregame.** `generatedAt` = `2026-06-13T15:17:23Z` = **11:17 AM ET** vs every lean's `tipoff`
  `"8:30 PM ET"` → ~9 hours pregame. The daily cron (`.github/workflows/morning-projections.yml`, `30 13 * * *` =
  9:30 AM ET) fires the generation before any game.
- **Trailing form is strictly prior.** Across all 196 leans there are 1,960 `recentGames` rows; **every one is
  strictly earlier than the 2026-06-13 slate** (max source date `2026-06-11`, **0 leaks**). `attach_recent10.py`
  documents that its stale-cache fallback "filters out any game on/after the slate date so today's game can never
  leak in"; the data confirms the filter held.
- **Odds captured at generation** (`oddsSource:"the_odds_api"`, embedded `oddsOver`/`oddsUnder` per lean) — a
  pregame snapshot.
- **News layer inert here** (`newsAction:"none"` for all 196), but it is a *manual* pregame layer with no structural
  timestamp guard.
- **Settlement is post-game** (`nightly-settle.yml`, 05:30 + 07:30 UTC) → `finalStat` from the box score. Correct
  direction.

## Reactivation risks this contract makes explicit

1. **Display-only tip-off.** Boards store `tipoff` as `"8:30 PM ET"`, not an ISO instant. Under the contract that is
   **unprovable** (`Date.parse ⇒ NaN` ⇒ ineligible). A reactivation MUST record an ISO tip-off instant so the
   `boardGeneratedAt < tipoffTime` gate can be enforced mechanically rather than assumed. (The test encodes both:
   the display string is ineligible; the reconstructed ISO tip-off `2026-06-14T00:30:00Z` is eligible.)
2. **Manual news/injury has no automated pre-tip enforcement.** `INJURY_DATA_MODE=manual` — nothing structurally
   prevents a post-tip edit to `news_signals.json` from being applied. The contract requires a proven
   `newsCapturedAt < tipoffTime`; a reactivation should add an immutable capture timestamp (mirror the MLB pregame
   archive). No *actual* post-tip leak was found in the 2026 artifacts.
3. **Four markets are unsettleable today.** `3PM`/`PRA`/`STL`/`BLK` graded 100% invalid (0 of 903 rows) — a
   settlement-join gap, not a timing leak, but it blocks validation of those families (see
   [status/nba-first-market-recommendation.json](../status/nba-first-market-recommendation.json)).

## Rules

- **No imputation of unavailable information.** A missing feature is a zero/floor/`null` per the table, never guessed.
- **Point-in-time trailing form only.** Rolling/season/dispersion features are rebuilt from games strictly earlier
  than the slate; the slate's own games are never in their own feature set.
- **Same gate everywhere.** Capture, recent-10 attach, and any future join all pass through
  `nbaFeatureTimingEligible` (or its `sourceGamesStrictlyPrior` helper).
- **HISTORICAL_ONLY.** Everything here is `NBA_CONTRACT_FLAGS = { public:false, approvedForProduction:false,
  productEligible:false }`. This contract gates a *future* re-validated model; it approves nothing now.
