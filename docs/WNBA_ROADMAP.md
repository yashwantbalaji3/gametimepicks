# WNBA — feasibility audit + implementation roadmap (PR #113)

Status: **DEFERRED** for this PR. Audit completed 2026-05-26.

The user asked whether WNBA could ship as a new tab/sport because the
methodology should be similar to NBA. The answer is "eventually, yes,
but not safely today." This doc captures what's required so a future
PR can pick it up without re-doing the audit.

---

## Feasibility findings

| Question | Answer | Notes |
|----------|--------|-------|
| Does the Odds API expose WNBA? | **Yes** | Sport key `basketball_wnba`. Standard markets (`h2h`, `spreads`, `totals`) confirmed available across the same regions/books we use for `basketball_nba`. |
| Player props supported? | **Yes (book-dependent)** | Major books (DraftKings, FanDuel) post `player_points`, `player_rebounds`, `player_assists`, sometimes `player_threes`. Coverage is thinner than NBA. |
| Free schedule source? | **Yes** | ESPN WNBA scoreboard JSON works (mirrors the NBA endpoint shape we already consume in `pipeline/fetch_nba_scoreboard.py`). |
| Free player-stats source? | **PARTIAL** | The `nba_api` package does **not** cover WNBA. ESPN does provide box scores. An unofficial `py-wnba-api` exists but has bus-factor risk. |
| Player ID / headshot mapping reliable? | **PARTIAL** | ESPN exposes WNBA player IDs that resolve to headshot URLs; the templating is different from NBA. Our `PlayerAvatar` component needs a `sport: "wnba"` branch and a new URL template. |
| Settlement path? | **Not yet built** | We'd need a WNBA grader analogous to `pipeline/grade.py` that hits the ESPN box-score endpoint. |
| Daily API credit cost (estimate) | **~80–120 credits/day** | Comparable to NBA: 2–3 player-prop markets × ~4–6 games × bookmakers. Well under the 300-credit floor. |
| Today (2026-05-26) has WNBA games? | **Unknown without a fetch** | Memorial Day often has games — `gh api` / Odds API would confirm. |

## Why we're not shipping WNBA today

The honesty constraints in this product are non-negotiable:

1. **No fabricated performance.** Without a recent-form data source
   wired in, every WNBA projection at launch would be a cold-start
   guess. We can't responsibly stamp confidence tiers on it.
2. **No fake "live" wording.** Without a settlement path we'd be
   ranking picks we can't grade, which defeats the public-tracking
   promise.
3. **No "75–80%" promises.** Adding a sport without a baseline hit
   rate would inflate the surface area faster than we can validate.
4. **No empty tabs.** The spec explicitly says "no visible empty tab
   unless useful."

Shipping WNBA before the four prerequisites below are met would
break at least three of these contracts.

## Prerequisites before re-opening the WNBA work

In rough dependency order:

### 1. Pipeline scaffolding (backend)
- [ ] Add `"wnba": "basketball_wnba"` to `SPORT_KEYS` in
      `pipeline/fetch_game_markets.py` (low-effort).
- [ ] Add `pipeline/fetch_wnba_scoreboard.py` that consumes the
      ESPN scoreboard endpoint and writes `app/public/data/wnba/boards/<date>.json`.
- [ ] Pick a player-stats source. Two options:
      - **A. ESPN-only.** Lower bus factor; we already use ESPN for
        cricket scoreboards. Probably the right pick.
      - **B. `py-wnba-api` package.** Faster to integrate but
        depends on a community wrapper that could break.
- [ ] Add `pipeline/wnba_recent_form.py` that produces a
      `recent10`-equivalent payload per WNBA player.

### 2. Settlement scaffolding (backend)
- [ ] Add a WNBA-aware grader. The existing `grade_optimizer.py`
      is sport-agnostic in the slip dimension; the per-leg result
      computation needs a `sport === "wnba"` branch that hits the
      ESPN box-score endpoint.
- [ ] Add `app/public/data/wnba/results/` mirror layout
      (`settled_leans.jsonl`, `lifetime_summary.json`,
      `comparison_report_*.json`) matching the NBA shape.

### 3. UI scaffolding (frontend)
- [ ] Add a `"wnba"` branch to:
      - `data-projections.ts` loader
      - `PlayerAvatar` (new URL template)
      - `TeamLogo` (new WNBA logo set; ESPN serves these)
      - sport-pill rows on `/projections` and `ParlayLabBuilder`
      - market ticker (`_wnbaProjectionsItem`)
- [ ] Decide on a settle-first launch order:
      1. **Projections-only beta** — one WNBA day with player props
         rendered but slips excluded from optimizer; flagged "data
         pilot."
      2. After ≥3 settled WNBA days, lift the projection-only flag
         and let WNBA legs enter the optimizer.
      3. After ≥7 settled WNBA days with documented hit rate,
         promote to full equal-footing with NBA.

### 4. Audit + safety filter generalization
- [ ] Confirm the PR #110 safety filters (max_legs, edge clip,
      Star Power same-game cap, mixed-sport penalty, AST/PTS
      recent10 gate) make sense for WNBA. PTS/REB/AST shapes are
      similar; pace adjustments will differ.
- [ ] Add WNBA fixtures to `pipeline/parlay_optimizer_test.py`.

## What today's PR (#113) ships instead

- Cricket unwired from every user-facing surface so the slate is
  clean before any new sport lands.
- This roadmap (`docs/WNBA_ROADMAP.md`).
- An updated `docs/MODEL_LEARNING_LOOP.md` that documents the
  promotion gate WNBA will have to pass.

## Estimate

A safe WNBA MVP — projections-only, no parlays — is roughly a
**2–3 PR sequence** of ~1 day each:

1. **PR-A**: pipeline scaffold (`fetch_wnba_scoreboard.py`,
   `wnba_recent_form.py`, schedule export).
2. **PR-B**: UI scaffold (projections tab, PlayerAvatar branch,
   TeamLogo set). Behind a feature flag until ≥1 day has settled.
3. **PR-C**: settlement scaffold (ESPN box-score grader, results
   mirror). Unlocks WNBA parlays per the staged launch above.

None of these require new third-party paid APIs.

## Decision

For 2026-05-26, **defer WNBA**. Revisit after the model-learning
loop (PR #113's other deliverable) has produced at least one full
audit cycle on NBA/MLB.
