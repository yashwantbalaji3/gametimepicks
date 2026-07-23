# Multi-Sport Research Engine Roadmap — GameTimePicks

_Design doc. Written 2026-07-23. This is a **plan**, not a claim that anything below is built._

## What this document is (and is not)

This is a truthful, artifact-grounded priority map for building a **leakage-safe pregame research engine per
sport**, mirroring the one that already exists for MLB (`data/internal/mlb/pregame-archive/`). Its purpose is to
say — for each sport with meaningful scaffolding — what a research engine would need, in what order, and against
what honesty gate, so that a future model can be evaluated on data that was provably known **before** each event
started.

It contains:
- No code and no data. Nothing here creates artifacts, ingests feeds, or changes money. Money md5 stays
  `affe6b21071f2b3be96bb2774eb347c3`; every modeling gate stays where the audit found it.
- No profitability, "edge", "value", "lock", or "beats-the-market" claims. The honest target for every sport is
  **calibration** — whether a challenger model can _out-predict the de-vigged market_ on held-out, settled,
  leakage-safe observations (Brier + log-loss). That is a measurement, not a promise, and — as MLB proves below —
  it can and does come back negative.
- No new market surfacing. Ground truth for what may be shown, and how, stays with
  `app/src/lib/market-coverage.ts` (per-sport-per-market), `app/src/lib/sports-coverage.ts` (per-sport level), and
  `app/src/lib/multi-sport-report/schema.ts` (the report contract's `sourceMode` / `publicClaims` guard).

Two source documents are the spine of everything here and should be read alongside it:
- `docs/MULTI_SPORT_CAPABILITY_AUDIT.md` — the current, artifact-verified capability tier per sport.
- `docs/MLB_RESEARCH_TIMESTAMP_INCIDENT.md` — how a real leak entered the MLB research archive, and the gate that
  now closes it. **Every sport below must adopt that same gate before any of its research counts.**

---

## The one rule every sport inherits first: the leakage-safe eligibility gate

Before a sport's research engine collects a single usable row, it must adopt the canonical MLB gate. This is not
optional and not sport-specific — it is the honesty spine.

**Canonical gate:** `app/src/lib/mlb/pregame-archive/eligibility.ts` (`researchEligibility`, capture-time) and
`app/scripts/lib/research-eligibility.mjs` (`revalidateMarketEligibility`, re-validated at every join/assembler
boundary). The single rule:

> A captured value is research-eligible **only** when it was provably known before the event started:
> `capturedAt < eventStartTime` **AND** `availableAt < eventStartTime` **AND** a proven source timestamp.
> Equality (`capturedAt == eventStartTime`) is ineligible. An inherited `researchEligible` flag is **never**
> trusted — it is re-validated against the join's own authoritative event start.

The MLB incident is the cautionary tale each sport must design against: 278 market rows carried an inherited
`researchEligible=true` while actually captured **after** first pitch, because a settlement join copied the
provider's `commence_time`-based flag instead of re-checking against the official StatsAPI first pitch. The fix
was a single canonical gate re-validated at every boundary, plus an assembler that **drops** post-start rows. Any
new sport that skips this will silently poison its own backtest.

**Universal minimum collection gate** (from `DEFAULT_COLLECTION_GATE` in `eligibility.ts`) — a sport may not even
_consider_ a trained challenger until it clears all four, on leakage-safe rows only:

| Threshold | Value |
|---|---|
| Distinct settled dates | ≥ **30** |
| Settled-eligible observations | ≥ **500** |
| Feature coverage | ≥ **80%** |
| Timestamp-proven rows | ≥ **90%** |

> **Cadence caveat.** The `≥ 30 distinct dates` bar interacts with how often a sport plays. Daily sports (MLB, NBA,
> NHL) clear it in roughly a month of collection; weekly/event sports (UFC ~1 card/week; single-league soccer) take
> far longer, which is itself a ranking input below. UFC already encodes an analogous, stricter market-specific bar:
> **150 clean graded rows** before a public moneyline (`app/public/data/ufc/readiness-latest.json`, currently
> `0/150`).

**Accuracy before breadth.** The correct build order for any single sport is: (1) leakage-safe capture with proven
timestamps → (2) official settlement join → (3) reach the collection gate → (4) a leakage-safe backtest of _one_
market → and only then (5) consider a second market. Adding market families before the first is timestamp-clean and
calibrated is how a research program lies to itself.

---

## MLB — PRODUCTION_READY (the reference implementation)

_Tier per audit: the only production-grade sport. Its archive is the structure every other sport mirrors:
`market-snapshots/<date>/`, `snapshots/<date>/`, `freezes/<date>/`, `settlement-joins/<date>/`,
`manifests/<date>/`, `research-observations/<date>.jsonl`, `pregame-features/<family>/`, `status/`, plus
`schema.json` / `source-registry.json` / `settlement-join-plan.json`._

1. **Supported market families.** Team markets (moneyline, run line, total — de-vigged sportsbook lines,
   market-anchored) and player props. Four props are _modeled_ today: pitcher strikeouts, batter hits, total bases,
   H+R+RBI (`app/src/lib/mlb/model-calibration-status.ts`).
2. **Best first public markets.** Team moneyline / run line / total (already `settlementSupport: supported` in
   `market-coverage.ts`), then pitcher strikeouts as the cleanest single-actor counting prop.
3. **Required pregame features.** Confirmed lineup, pitcher status/workload, bullpen availability, batter form /
   splits / batter-vs-pitcher, plate-appearance opportunity, opponent defense, park factors, team offensive form,
   travel/rest, environment (weather/roof), umpire — the 15 families already captured under
   `data/internal/mlb/pregame-archive/pregame-features/` and `app/scripts/capture-mlb-pregame-*.mjs`.
4. **Timing-sensitive info (leakage risk).** Confirmed starting lineup and starting pitcher (scratches), the final
   pregame market freeze, and same-day weather/roof — all must be captured before first pitch.
5. **Free/public sources already in the repo.** `statsapi.mlb.com` (free) — schedule `/api/v1/schedule`, box/line
   score `/api/v1.1/game/` and `/api/v1/game/`, people `/api/v1/people/`, teams `/api/v1/teams` — wired across ~27
   files including `app/scripts/capture-mlb-pregame-*.mjs`, `fetch-mlb-pitcher-stats.mjs`, and
   `join-mlb-pregame-settlements.mjs`.
6. **Paid data dependencies.** The Odds API (`api.the-odds-api.com/v4/sports/baseball` + `/v4/historical/...`) for
   team lines and player-prop markets; paid ingests run in CI only.
7. **Settlement source.** Official box/line score via `statsapi.mlb.com` (join keyed on `gamePk`).
8. **Leakage risks.** The proven one: a capture running after first pitch because the Odds-API `commence_time`
   differs from the official StatsAPI first pitch (the 2026-07-22 incident, 4 games). Also: inheriting a
   superseded lineup/pitcher state, and backfilling a "pregame" weather value from an observed postgame reading.
9. **Minimum research gate.** The canonical `30 dates / 500 settled-eligible / 80% coverage / 90% timestamp-proven`.
   Currently **not met** — the archive reports `1/30` qualifying dates; the gate stays BLOCKED.
10. **Suggested simulation method.** Per-market Monte Carlo from pregame features — e.g. negative-binomial for
    strikeouts, count models for hits/TB — sampled `N(projection, σ)` where a projection + sigma exist, exactly the
    existing player-prop sim shape.
11. **Suggested baseline model.** The de-vigged market line. Any challenger must out-predict _that_ on Brier +
    log-loss, on leakage-safe settled rows.
12. **Public-beta threshold.** Already met and shipped: markets are surfaced as market-anchored / market-implied
    "public beta" simulations with no edge claim, gated by `market-coverage.ts` + the report `sourceMode` contract.
13. **Future trained-model threshold.** The cautionary result: all four modeled markets were audited on 18k+
    settled leans and **every one lost** to the market on Brier + log-loss (`verdict: DEMOTE_TO_MARKET_CONTEXT`),
    so they are demoted to market-context, not presented as an advantage. A trained model earns promotion only by
    reversing that on held-out, leakage-safe data after the collection gate is met.

---

## NBA — HISTORICAL_ONLY (off-season; highest ceiling)

_Tier per audit: a genuine full pipeline that ran through the 2026 Finals (last real board 2026-06-13) but now
emits empty `ScheduleUnavailable` boards; `sports-coverage.ts` `level:"full"` is aspirational until the season
returns (~October). No pregame research archive exists._

1. **Supported market families.** Player props (points, rebounds, assists, threes, and PRA combinations) and team
   markets. Today only stale `nba/game-markets/2026-06-10.json` and `nba/market-probe-latest.json` exist.
2. **Best first public markets.** Points, then rebounds and assists — the highest-liquidity single-actor props with
   clean official settlement; threes and PRA combos second (threes are noisier; PRA is a correlated sum).
3. **Required pregame features.** Expected minutes, injury/lineup/rest status (including load management and
   back-to-backs), usage rate with teammates absent, team pace, opponent positional defense, and starter-vs-bench
   role. Minutes and usage-with-absences are the load-bearing features — almost every prop scales off projected
   minutes.
4. **Timing-sensitive info (leakage risk).** Official inactives / starting lineup, which post ~30–60 minutes before
   tip; late star rest or "did not dress" decisions; and any confirmed-minutes signal. Capturing usage or minutes
   after those drop is post-information.
5. **Free/public sources already in the repo.** `stats.nba.com` + `cdn.nba.com` (referenced in ~2 files; the repo's
   root/default board pipeline — `app/public/data/boards/`, `meta.json` `nbaScheduleSource`) and ESPN headshots
   (`a.espncdn.com/i/headshots/nba/...`). Existing data surfaces: `app/public/data/nba/{game-markets,
   team_projections, market-probe-latest.json}`.
6. **Paid data dependencies.** The Odds API for NBA player-prop markets (not yet ingested — only team `game-markets`
   have appeared). stats.nba.com is free but unreliable (documented `stats.nba.com` timeouts,
   `nbaScheduleSource:"unavailable"`), so a fallback schedule/box source (e.g. ESPN NBA scoreboard) is likely
   needed.
7. **Settlement source.** Official box score via `stats.nba.com` (needs wiring; today NBA shares the generic
   `/results` surface with no dedicated NBA settlement join).
8. **Leakage risks.** Last-minute injury/rest scratches that redistribute minutes and usage — the single biggest
   trap, because the interesting post-scratch usage is exactly the leaked state. Also back-to-back "rest" calls,
   and pace/defense features computed from a window that accidentally includes the game being predicted.
9. **Minimum research gate.** The canonical `30 / 500 / 80% / 90%`. Reachable in ~1 month of a live season given NBA
   volume — but **0% today** (no capture, no archive, off-season).
10. **Suggested simulation method.** Minutes model × per-minute rate → per-stat Monte Carlo: points/rebounds/assists
    as count distributions scaled by projected minutes; threes as a binomial/negative-binomial on attempts; PRA as
    a sum of correlated marginals (never independent).
11. **Suggested baseline model.** De-vigged market prop line, plus a minutes-scaled recent-rate projection as the
    naive comparator the challenger must beat.
12. **Public-beta threshold.** Once leakage-safe minutes/lineup capture is timestamp-proven and props settle from
    the official box score, NBA props may be shown as market-anchored public-beta reads (no edge claim) under the
    same `market-coverage.ts` gate as MLB.
13. **Future trained-model threshold.** The collection gate met on live-season rows, then a leakage-safe backtest
    showing the minutes+usage model out-predicts the de-vigged market on Brier + log-loss for at least one prop —
    with the explicit expectation (per the MLB result) that it may not, in which case it stays market-context.

---

## NHL — SCAFFOLD_ONLY

_Tier per audit: `/nhl` route scaffold with an empty board; the only real artifact is a stale free schedule
(`nhl/schedule/2026-05-24.json`). The page self-declares "honestly empty… we do not fabricate projections." No
odds, projection, settlement, or research pipeline was ever built._

1. **Supported market families.** None live. Target families: skater props (shots on goal, goals, assists), goalie
   props (saves), and team markets (puck line, total).
2. **Best first public markets.** Shots on goal (highest-volume, clean count) and goalie saves — both settle
   unambiguously from the official box score.
3. **Required pregame features.** Confirmed starting goalie, forward line / defensive-pair combinations, power-play
   unit membership, expected ice time (TOI) by role, opponent shots-against and save% tendencies, and travel /
   back-to-back status.
4. **Timing-sensitive info (leakage risk).** The confirmed starting goalie (often announced ~30–60 minutes before
   puck drop), scratches, and line/PP-unit changes at morning skate. Goalie identity is decisive for every saves
   prop.
5. **Free/public sources already in the repo.** `api-web.nhle.com` — the free public NHL API, already the
   documented `scheduleSource` inside `app/public/data/nhl/schedule/*.json`. It also exposes box scores and
   game-center detail for settlement.
6. **Paid data dependencies.** The Odds API for NHL prop and team markets (not ingested). No paid stats feed is
   strictly required — `api-web.nhle.com` covers schedule, rosters, and results for free.
7. **Settlement source.** Official box score via `api-web.nhle.com` game-center / boxscore endpoints.
8. **Leakage risks.** Confirmed-goalie timing is the sharpest: capturing the starter after the announcement, or
   inheriting the wrong goalie, invalidates every saves/goal-against row. Also line-shuffle and PP-unit changes
   between morning skate and puck drop, and TOI features that leak the game's own result.
9. **Minimum research gate.** Canonical `30 / 500 / 80% / 90%`, reachable in a live-season month by NHL volume —
   **0% today** (schedule stale to May, nothing captured).
10. **Suggested simulation method.** Low-rate count models: Poisson/negative-binomial for shots on goal and goals;
    saves as a function of expected shots-faced × goalie save%; assists as a low-rate Poisson tied to linemate
    scoring.
11. **Suggested baseline model.** De-vigged market line, plus an ice-time-scaled recent-rate projection as the naive
    comparator.
12. **Public-beta threshold.** After a real odds + projection pipeline is built from scratch, leakage-safe capture
    of the confirmed goalie/lines is timestamp-proven, and props settle from the official box score.
13. **Future trained-model threshold.** Collection gate met, then a leakage-safe backtest out-predicting the market
    on SOG or saves on Brier + log-loss.

---

## Soccer (EPL / Champions League / MLS, non-World-Cup) — SCAFFOLD_ONLY

_Tier per audit: no `/soccer`, `/epl`, or `/mls` route beyond an `/events` tab; only an MLS schedule snapshot baked
into `event-schedules.ts`. An internal FIFA/Poisson engine exists
(`data/internal/world-cup/projection-engine/`, `build-internal-soccer-projections.mjs`,
`backtest-soccer-2022-wc*.mjs`) but is research-only and unvalidated (N insufficient). World Cup itself is retired
/ archive-only._

1. **Supported market families.** None public. Target families: player props (shots, shots on target, anytime
   scorer, assists), team markets (team totals, both-teams-to-score, match result), and corners.
2. **Best first public markets.** Anytime goalscorer and shots on target — the props users want most and which
   settle cleanly from official event data; team totals second.
3. **Required pregame features.** Confirmed starting XI, expected minutes / rotation risk, set-piece roles (penalty
   + free-kick + corner takers), competition strength / opponent quality, referee tendencies (cards/penalties), and
   travel / rest / congestion.
4. **Timing-sensitive info (leakage risk).** The starting XI, released ~60 minutes before kickoff — every
   minutes-scaled prop and anytime-scorer read depends on who actually starts and who is rotated out.
5. **Free/public sources already in the repo.** ESPN soccer scoreboards
   (`site.api.espn.com/apis/site/v2/sports/soccer/usa.1/scoreboard` for MLS,
   `.../soccer/fifa.world/scoreboard`) for schedule/results; the internal soccer projection engine under
   `data/internal/world-cup/projection-engine/`.
6. **Paid data dependencies.** API-Football (`v3.football.api-sports`, key `API_FOOTBALL_KEY`) — already wired for
   lineups, player events, and settlement in `app/scripts/{settle-wc-player-props,build-wc-player-team-map,
   refresh-lineup-aware-slate}.mjs` — for confirmed XI, minutes, and per-player shot/SoT/goal events; plus The Odds
   API (`api.the-odds-api.com/v4/sports/soccer` + historical) for markets.
7. **Settlement source.** Official match result + player events via API-Football fixture stats, cross-checked
   against the ESPN scoreboard final.
8. **Leakage risks.** Starting-XI release timing is the sharpest — capturing XI or expected minutes after the sheet
   drops is post-information. Also in-play lineup leaks, set-piece-taker assignment that shifts on the confirmed XI,
   and low-scoring variance making any single-match "signal" fragile.
9. **Minimum research gate.** Canonical `30 / 500 / 80% / 90%`. Slower to reach than daily sports: a single league
   plays far fewer than 30 dates per month, so multiple competitions (EPL + UCL + MLS) must be pooled — and the
   internal engine's own history is flagged N-insufficient.
10. **Suggested simulation method.** Bivariate-Poisson for team goals (the internal engine's existing shape) feeding
    anytime-scorer via expected shots × conversion; player shots / SoT as negative-binomial scaled by expected
    minutes.
11. **Suggested baseline model.** De-vigged market line; for team goals, the internal bivariate-Poisson engine only
    after it is validated on a sufficient, leakage-safe sample.
12. **Public-beta threshold.** After a real public soccer surface exists, leakage-safe XI/minutes capture is
    timestamp-proven, and player events settle officially — shown as market-implied reads, never as an independent
    sim (the report contract forbids a `market_implied` report claiming an independent model).
13. **Future trained-model threshold.** Collection gate met across pooled competitions, then a leakage-safe backtest
    out-predicting the market on shots/SoT/anytime-scorer — with the engine's current unvalidated status treated as
    "not yet proven," not "pending success."

---

## Cricket / IPL — SCAFFOLD_ONLY

_Tier per audit: `/ipl` scaffold with a stale schedule ("providerPending… do not fabricate projections"); a
single orphaned `cricket/boards/2026-05-26.json` with no `/cricket` route. No per-player stats source is wired.
Library `cricket-projection.ts` + `data-cricket*.ts` exist but have no live feed behind them._

1. **Supported market families.** None live. Target families: batter props (runs, boundaries/fours, sixes), bowler
   props (wickets), and team totals.
2. **Best first public markets.** Batter runs and bowler wickets — the two headline per-player counts, where a
   market exists.
3. **Required pregame features.** Confirmed playing XI, batting order / role, expected overs or balls faced by
   role, venue / pitch profile, dew and weather (which reshape chasing), and the toss outcome + bat/bowl decision.
4. **Timing-sensitive info (leakage risk).** The **toss** — decided ~30 minutes before start and the single most
   outcome-shifting pregame event: it sets bat-first vs bowl-first, and the playing XI is confirmed at the toss.
5. **Free/public sources already in the repo.** ESPN cricket scoreboard
   (`site.api.espn.com/apis/site/v2/sports/cricket/8048/scoreboard`) for schedule/scores; ESPNcricinfo references
   for venue/team metadata. Existing surfaces: `app/public/data/cricket/{boards,context,player-projections}` and
   `app/public/data/ipl/schedule`.
6. **Paid data dependencies.** A reliable per-player cricket stats + odds provider — **the standing blocker**: the
   repo has no wired per-player stats source, and prop markets for cricket are thin. This gap must be filled before
   any research row can carry features.
7. **Settlement source.** Official scorecard via the ESPN cricket scoreboard / scorecard endpoints.
8. **Leakage risks.** Capturing the XI, role, or any feature **after the toss** — the toss both reveals conditions
   and confirms the XI, so post-toss capture is post-information. Also role/order changes and dew developing during
   the innings leaking into a "pregame" environment value.
9. **Minimum research gate.** Canonical `30 / 500 / 80% / 90%`. Hard to reach: IPL is a season-bound, short window;
   pooling other cricket competitions would be required, and no per-player feed exists yet — **0% today**.
10. **Suggested simulation method.** Role-adjusted innings simulation is heavy; a simpler leakage-safe start is a
    per-role distribution — negative-binomial for batter runs conditioned on batting position and expected balls
    faced, low-rate Poisson for bowler wickets conditioned on expected overs.
11. **Suggested baseline model.** De-vigged market line where offered; otherwise a role-and-venue-adjusted
    recent-form projection as the naive comparator.
12. **Public-beta threshold.** Lowest-priority and furthest away — requires first a stable per-player stats
    provider, a `/cricket` (or live `/ipl`) surface, leakage-safe post-XI-but-pre-first-ball capture, and official
    scorecard settlement.
13. **Future trained-model threshold.** Collection gate met (likely only by pooling seasons), then a leakage-safe
    backtest out-predicting the market on runs or wickets.

---

## UFC — RESEARCH_ONLY (richest dedicated non-MLB stack)

_Tier per audit: the richest dedicated non-MLB infrastructure — ESPN MMA schedule, The Odds API moneylines, a
2,695-fighter stats DB, connected grading (1,519 final bouts), a v1/v2 prediction engine, and 8 workflows — but it
**fail-closes**: `readiness-latest.json` reports `projectionsReady:false`, `backtestReady:false`,
`publicLevel:"grading-internal"`, blocker "no historical backtest yet (0/150 clean rows)"; all 8 workflows are
`workflow_dispatch` only._

1. **Supported market families.** Moneyline (market-backed, de-vigged — the only market the provider offers) plus
   model-derived, explicitly experimental fight-type / distance / method / round reads
   (`app/src/lib/ufc/ufc-prediction-engine.ts`). Sig-strikes and takedowns are computable from fighter-DB rates but
   have no market feed.
2. **Best first public markets.** Moneyline — it is already market-backed and grading is wired; it is the single
   fastest path to a validated second-sport public market. Method/distance next, as experimental only.
3. **Required pregame features.** Fighter pace and defense (sig strikes / takedowns per round), reach and stance,
   opponent quality, layoff, short-notice flag, weight-class, and age/experience deltas — the deltas already
   computed in `app/public/data/ufc/features-latest.json` (`winRate`, `finishRate`, `sigStrPerRound`,
   `takedownsPerRound`, `reachInches`, `ageYears`, `experience`).
4. **Timing-sensitive info (leakage risk).** The weigh-in result (missed weight), short-notice opponent
   replacements, and fight-night scratches — all of which can land after odds are captured and flip the entire read.
5. **Free/public sources already in the repo.** ESPN MMA scoreboard
   (`site.api.espn.com/apis/site/v2/sports/mma/ufc/scoreboard`) for schedule + results; the internal fighter stats
   DB `app/public/data/ufc/fighters-latest.json` (2,695 fighters) and derived `features-latest.json`. The backfill
   plan (`data/internal/ufc/backfill-status.json`) names ESPN MMA as the free results source.
6. **Paid data dependencies.** The Odds API MMA — but **h2h moneyline only**; method/distance/round props are
   `unavailable` because "Not offered by the current sportsbook feed" (`ops-status-latest.json`). Historical MMA
   odds (paid, founder-approved) are the missing input for the backfill.
7. **Settlement source.** Official bout result (winner, method, round) via the ESPN MMA scoreboard; grading is
   already connected (`graded-moneylines-latest.json`, 1,519 final bouts).
8. **Leakage risks.** Weigh-in / missed-weight and short-notice opponent swaps captured after the fact — the
   fighter-DB features are relatively stable, so the sharp leak is _matchup validity_ (the `isFutures` /
   "hypothetical matchup" warnings already flagged in `features-latest.json`) and odds `commence_time` vs the actual
   walkout time.
9. **Minimum research gate.** UFC already encodes a stricter, market-specific bar than the generic gate: **150 clean
   graded rows** before a public moneyline (`readiness-latest.json`, `backfill-status.json` `threshold:150`) —
   currently **0/150**, `status:"not-started"`. The canonical `30 dates` bar is slow here (~1 card/week), so
   moneyline validation is expected to run off the 150-row count, backfilled from history, rather than forward
   dates alone.
10. **Suggested simulation method.** Not a counting-stat sim for moneyline: de-vigged market probability combined
    with a logistic on fighter-DB deltas. Method/distance as a multinomial from finish-rate and style scores;
    sig-strikes/takedowns as negative-binomial from per-round rates × expected rounds — all experimental until a
    prop market and settlement exist.
11. **Suggested baseline model.** The de-vigged moneyline (`deVig` in the engine) — the conservative baseline the
    v1/v2 model must out-predict before any "validated" badge unlocks.
12. **Public-beta threshold.** Defined and gated: `publicLevel` lifts from `grading-internal` once the 150-row
    backtest is met and the moneyline is validated — until then the `/ufc` surface stays a fight card plus gated,
    experimental reads with no edge claim.
13. **Future trained-model threshold.** The 150 clean graded rows collected leakage-safe (pre-fight odds + official
    results), a backtest showing the model out-predicts the de-vigged moneyline on Brier + log-loss, and — for props
    — a provider feed that does not exist today.

---

## NFL / NCAAB — UNSUPPORTED (out of scope)

Neither has any data, route, script, workflow, or research scaffolding — NFL is a lone type literal in
`multi-sport-report/schema.ts`; NCAAB has zero references anywhere. Both are out of scope for this roadmap until
real scaffolding exists.

---

## Priority ranking — which research engine to build next

Ranked on evidence from the capability audit, weighing: closeness of the existing stack to MLB's, the cadence
needed to reach the gate, and whether the target markets are actually settleable with a real provider.

**1. UFC — build next, now.** It is the only non-MLB sport with a _dedicated pregame stack already in place_:
schedule, moneyline odds, a 2,695-fighter feature DB with computed deltas, connected grading over 1,519 bouts, a
v1/v2 engine, and — critically — an already-defined validation gate (**150 clean rows**, currently `0/150`). The
next build is not "invent a pipeline," it is "collect leakage-safe rows against a gate that already exists,"
backfillable from free ESPN results. Scope must stay **narrow: moneyline only** — because The Odds API MMA offers
no prop markets, method/distance/round/sig-strikes/takedowns are provider-blocked and cannot be validated regardless
of model quality. UFC's low cadence (~1 card/week) is the reason to keep scope tight, not a reason to wait.

**2. NBA — the highest-ceiling target, the moment the season returns (~October).** It has the richest prop menu
(points/rebounds/assists/threes/PRA), a full pipeline that already ran through the Finals, and — because it is a
daily, high-volume sport — it would clear the `30 dates / 500 obs` gate faster than any other. It is ranked second
only because it is **blocked today by the off-season** and by `stats.nba.com` reliability; it should be the primary
target the instant games resume, and pre-season is the right time to build its leakage-safe minutes/lineup capture.

**3. NHL — third.** Clean, unambiguously settleable counting props (shots on goal, saves) on a fully free feed
(`api-web.nhle.com`), and daily volume to reach the gate in a season-month — but it needs an odds + projection +
settlement pipeline built from scratch, so more net-new engineering than UFC or NBA.

**4. Soccer (non-WC) — fourth.** API-Football is already wired and an internal engine exists, but the engine is
unvalidated (N-insufficient), single leagues are low-cadence (pooling EPL/UCL/MLS is required to reach 30 dates),
and low-scoring variance makes per-match signal fragile.

**5. Cricket / IPL — last.** The standing blocker is structural: no per-player stats provider is wired, cricket
markets are thin, the board is orphaned with no route, and IPL is a short, season-bound window. It cannot start
until a provider gap is closed.

### The single hardest leakage risk per sport

| Sport | Hardest leakage risk |
|---|---|
| MLB | Capture running **after first pitch** (Odds-API `commence_time` vs official StatsAPI first pitch) |
| NBA | **Last-minute injury/rest scratches** redistributing minutes and usage |
| NHL | **Confirmed starting-goalie** timing (announced ~30–60 min pre-puck) |
| Soccer | **Starting-XI release** timing (~60 min pre-kick) |
| Cricket/IPL | The **toss** (bat/bowl decision + XI confirmation, ~30 min pre-start) |
| UFC | **Weigh-in result / short-notice opponent swap** invalidating the matchup |

### Non-negotiables for every sport

- **Accuracy before breadth.** One timestamp-clean, calibrated market beats five uncalibrated ones. Do not add a
  second market family until the first is leakage-safe and backtested.
- **The same eligibility gate first.** No sport's research counts until it adopts `capturedAt < eventStartTime`
  (with `availableAt < eventStartTime` and a proven timestamp), re-validated at every join — inherited flags are
  never trusted.
- **Calibration is the bar, and it can fail.** MLB's four modeled markets were all demoted for losing to the
  market on Brier + log-loss. A trained model earns promotion only by reversing that on held-out, leakage-safe data
  after the collection gate is met — never by assertion.
