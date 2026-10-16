# Live Hub V2 — multi-sport prerequisites (from code, 2026-10-16)

**Question:** what would MLB, NBA, UFC and soccer each need for live tracking equivalent to NFL's?

**What NFL has.** The gateway `app/api/live.mjs` + `_live-core.mjs` reads the ESPN scoreboard, and also the per-event summary when `players=1`. `normalizeNflPlayerStats` (`lib/live/adapters/espn-nfl.mjs`) maps player stats by ESPN athlete id. Settlement runs through:
- the producer `scripts/nfl/capture-live-props.mjs`;
- the ledger `lib/sports/nfl/prop-settlement-ledger.mjs` with `scripts/nfl/settle-nfl-live-props.mjs`;
- the post-final sweep in `nfl-event-window.yml`.

The capture kit (`docs/live/capture/`) verifies all of it against ESPN.

**Gateway today:**
- `SUPPORTED_SPORTS = ["nfl", "mlb"]` (`app/api/_live-core.mjs:17`).
- `publicSports()` defaults to `["mlb"]` and drops unknown names (`:35-40`).
- `upstreamUrls()` has only an MLB branch (StatsAPI schedule, `summary: null`) and an NFL branch (`:114-141`).
- Production's `LIVE_PUBLIC_SPORTS=mlb,nfl` (since 2026-09-25) is recorded only in comments (`lib/ask/tools/live.mjs:11`, `lib/live/rollout.test.mjs:6`). No repo config holds it.

| Sport | Free source in code | Gateway | Player/bout stat mapping | Settlement path | Product eligibility (`lib/live/multisport-matrix.mjs`) | What is missing for NFL-equivalent tracking |
|---|---|---|---|---|---|---|
| **MLB** | StatsAPI. The adapter `adapters/mlb-statsapi.mjs` reads the schedule. Offline settlers read `/game/{pk}/feed/live` (e.g. `scripts/settle-mlb-player-props.mjs`) | **Yes**: supported and public | **None live.** `mlb-statsapi.mjs:154` sets `playerStats: null`. Per-player box reading exists only in offline settlers | `nightly-settle.yml` (linescores, `settle-mlb-player-props --apply`, ladder/lab cards). No live-props producer, no tracked-prediction adapter | All 4 markets `DEMOTE_TO_MARKET_CONTEXT` (`lib/mlb/model-calibration-status.ts`). The matrix reads "gateway fetches schedule only … no boxscore call exists" (`multisport-matrix.mjs:189-194`) | **Blocked by product, not engineering.** The model is demoted, so live *prediction* tracking would present a demoted model as a forecast. Game-state live tracking already works. If a market is ever re-qualified, it would need a boxscore call in the gateway, a player mapper and an MLB tracked adapter |
| **NBA** | ESPN scoreboard (`lib/sports/espn-scoreboard-window.mjs`, `scripts/nba/capture-nba-results.mjs`). The ESPN summary is read offline (`scripts/nba/grade-nba-experimental-forecasts.mjs`, `build-nba-boxscore-corpus.mjs`) | **No.** `rollout.test.mjs` asserts "nba" is dropped | None live; offline summary parsing for grading only | `nba-results-refresh.yml` (results/finals); experimental grading | **Absent**: no NBA rows | Everything:<br>• an adapter (scoreboard + summary);<br>• a gateway branch and allowlist entry;<br>• a player-stat mapper;<br>• an eligibility row (the forecasts are experimental/internal research);<br>• a tracked adapter and a settlement ledger |
| **UFC** | ESPN MMA scoreboard (`scripts/ufc/build-ufc-card.mjs`, `capture-ufc-results.mjs`). **A live adapter exists**: `adapters/espn-mma.mjs` (bout-level state) | **No.** `espn-mma.mjs` is consumed only by `adapters/ufc-tracked.mjs`, which only its own test imports | Not applicable: the feed has no fight stats and no method field (`espn-mma.mjs` header; `ufc-tracked.mjs`) | `ufc-post-card.yml` (`capture-ufc-results`, `grade-ufc-model-vs-market`): winner-only | `fight_winner` trackable when its verdict is PASS. `fight_rounds` measurable but not graded (settlement is winner-only). `fight_method` unsupported (no KO/SUB/DEC in the feed) (`multisport-matrix.mjs:203-230`) | **Closest to ready:** wire `espn-mma` into `SUPPORTED_SPORTS` and `upstreamUrls()`, add a producer or sweep and a hub card. Method stays unmeasurable on this source |
| **Soccer (EPL; other leagues)** | ESPN `soccer/eng.1` (`scripts/epl/capture-epl-results.mjs`, `capture-epl-espn-players.mjs`, `grade-epl-player-projections.mjs`), FPL crosswalk; other leagues use openfootball (`scripts/soccer/capture-openfootball.mjs`) | **No**, and no adapter file | None live. Per-player actuals are built offline (`grade-epl-player-projections.mjs`) | `epl-settle.yml` (nightly results, forecasts, derived markets, player projections); `soccer-leagues.yml` (`grade-league-forecasts`) | EPL: one hard-coded row, `eligible:false, trackable:false`, "architecture only until the identity join is reviewed" (`multisport-matrix.mjs:255-259`). Other leagues absent | An adapter with an explicit `dates=` window (the NFL lesson in `_live-core.mjs`), a gateway branch, an identity-join review, a player mapper and a tracked adapter. Non-EPL leagues have no free per-player live source in code |

**UI copy.** `/live` reads: "NBA, Premier League and UFC are not tracked live yet…" (`components/live/live-sport-tabs.tsx:25`). It shows tabs only for NFL and MLB.

## Reconciliation with `docs/CROSS_SPORT_LIVE_CAPABILITY_MATRIX.md` (dated 2026-09-26)
These are code facts that differ from the doc. The doc itself is unchanged here; this list says where it is out of date.

1. **UFC "canonical gateway owner: none" / "needs a gateway adapter".** Out of date: `espn-mma.mjs` and `ufc-tracked.mjs` landed later that day (commit `1c578ecefe`). The adapter exists, but it is still not wired into the gateway.
2. **UFC "result yes; method untested".** Settled since:
   - the feed has no method field, and the summary endpoint errors;
   - settlement is winner-only, so rounds are measurable but ungraded.
3. **EPL "players untested".** `grade-epl-player-projections.mjs` already reads per-player ESPN actuals offline, in production via `epl-settle.yml`.
4. **§6, "/live and /my read `useLiveSlate("mlb")`, labelled 'MLB · beta'".** Out of date:
   - `/live` has NFL and MLB tabs;
   - the nav label is "beta";
   - only `/my` still calls `useLiveSlate("mlb")`.
5. **MLB rationale.** The doc cites the lack of a per-player GameTime range. The code's blockers are `DEMOTE_TO_MARKET_CONTEXT` and "no boxscore call".
6. **MLB "public today: yes / confirmed lineups".** Presented as current, although the regular season has ended. Postseason only.
7. **NBA and non-EPL soccer leagues** are missing from both the doc and `multisport-matrix.mjs`, although the UI names NBA as untracked.
8. **`SUPPORTED_SPORTS` vs public.** The doc quotes `SUPPORTED_SPORTS` without noting that public enablement is `LIVE_PUBLIC_SPORTS` (default MLB only). NFL being public rests on a production env var that no repo config records.

**For the V2 promotion rule:** the third required window is one MLB postseason game. Game-state tracking for it works through the existing MLB gateway path. There is no MLB player-stat tracking to verify, by design (row 1).
