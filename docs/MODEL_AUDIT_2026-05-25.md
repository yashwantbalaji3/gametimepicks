# Model audit — 2026-05-25

Brutally honest end-to-end review of the GameTime Picks projection
methodology as of May 25, 2026. Written from the codebase + the
on-disk audit (`app/public/data/audit/model_audit.json`) covering 8
NBA dates and 7 MLB dates settled with real final stats.

This is an internal engineering document. It is not user-facing.

## 1. How NBA projections are computed today

Pipeline (`pipeline/generate_daily_board.py` → `score_model.py`):

1. **Schedule** — ESPN scoreboard (`?dates=YYYYMMDD`). Mapped to
   internal `Game` records via `pipeline/providers/espn_provider.py`.
2. **Odds + props** — The Odds API (`/v4/sports/basketball_nba/odds`)
   pulled per-event with markets `player_points` /
   `player_rebounds` / `player_assists` and books DraftKings +
   FanDuel.
3. **Player resolution** — `player_resolver.resolve_player_id` maps
   the bookmaker's player name to nba_api's canonical playerId via
   a static index plus an alias file.
4. **Team rosters** — `nba_api/commonteamroster` per team in the
   slate. (Bug fixed 5/25: ESPN-vs-nba_api abbreviation mismatch —
   NY→NYK etc. — and diacritic-stripped name fallback.)
5. **Game logs** — `nba_api/playergamelog`, last 12 games per
   player. Cached to `pipeline/cache/`.
6. **Feature build** — `build_features.py` computes:
   - last-5 / last-10 / season averages for PTS, REB, AST, MIN
   - home/away splits
   - opponent splits (rolling)
7. **Projection** — `score_model.score_prop`:
   - Blends last-5 (0.45), last-10 (0.30), season (0.20),
     home/away (0.05).
   - Applies an opponent-adjustment term (small).
   - Returns `(projection, modelProbability, edgePct, confidence,
     lean)`.
8. **Confidence guardrails** (`confidence_guardrails.py`):
   - R1: 0 game logs → `insufficient_data`
   - R2: |edge| > extreme threshold AND thin sample → `no_play`
   - R5: |edge| > suspicious threshold AND actionable → cap to Low
     + `suspicious_edge` flag
9. **`attach_recent10`** — populates `recent10` on every lean for
   sparkline rendering and downstream optimizer/parlay scoring.

Inputs **actually used today**:
- Player game logs (PTS/REB/AST/MIN, last 12)
- Home/away split (very thin signal)
- Opponent split (rolling)
- Bookmaker line + de-vigged odds for the leg

Inputs **NOT used today** (despite copy sometimes implying otherwise):
- Pace projection (slot in audit JSON is always `null`)
- Park factor (always `null`)
- Series state / elimination flag (always `null`)
- Specific opponent rotation / matchup (only blanket opponent split)
- Injuries (no automated injury feed)
- Rest / back-to-back flags
- Vegas team total / spread for game-script context
- Rotations / minute projection from beat reporters

## 2. How MLB projections are computed today

Pipeline (`pipeline/mlb/generate_mlb_board.py` →
`pipeline/mlb/mlb_model.py`):

1. **Schedule** — MLB Stats API. Probable pitchers populated when
   available.
2. **Odds + props** — The Odds API
   (`/v4/sports/baseball_mlb/odds`) with markets
   `pitcher_strikeouts` / `batter_hits` / `batter_total_bases` /
   `batter_hits_runs_rbis`. Same books as NBA.
3. **Player resolution** — name + team match against MLB Stats API
   player index. No diacritic patch yet (parallel fix to NBA's would
   be cheap).
4. **Recent stats** — recent-game stat lines pulled from MLB Stats
   API.
5. **Projection** — `mlb_model.score_*` — separate functions per
   market. Last-N blended with season; opponent split.
6. **Confidence** — heuristic based on sample size + edge.
7. **`recentSeries`** stored on each lean (parallel to NBA's
   `recent10`).

Inputs **actually used today**:
- Last-N game stats (per market)
- Season averages
- Probable pitcher (matters most for strikeouts)
- Opponent
- De-vigged odds

Inputs **NOT used today**:
- Park factor (`null` in audit even though MLB cares more about
  this than basketball does)
- Weather (significant for total bases / wind)
- Bullpen fatigue (significant for late-game pitcher props)
- Confirmed lineup vs. probable lineup (mid-day lineup releases
  flip projections for batters)
- L/R split vs. starting pitcher
- Travel / time-zone splits

## 3. Confidence assignment

```
NBA score_model:
  edge >= 7pp  → High
  edge >= 4pp  → Medium
  edge >= 2pp  → Low
  else          → no_play

MLB mlb_model:
  edge >= 8pp  → High
  edge >= 4pp  → Medium
  edge >= 2pp  → Low
  else          → no_play
```

Then `confidence_guardrails` apply R1/R2/R5.

## 4. Edge calculation

`edgePct = modelProbability − impliedProbability`

Where `impliedProbability` is the de-vigged probability for the side
the model agrees with (Over / Under), and `modelProbability` is the
score-model's predicted probability of that side hitting.

This is conventionally "edge in probability points" not dollars.

## 5. Calibration

`confidence-calibration.ts` / `pipeline.calibration_report` build a
per-(sport, confidence-tier) lookup from settled rows. The TS layer
classifies a tier as:

- **strong** — empirical hit rate ≥ 57% on ≥100 decisive picks
- **inverted** — empirical hit rate < tier's prior by ≥1.5pp
- **unknown** — sample too thin to classify

Today's table marks MLB High as **inverted** (48.3% < 50.4% baseline).

The UI calibration overlay maps tiers to user-visible strings:
- strong → "Stronger signal"
- inverted → "Calibration watch"
- unknown → just the raw tier

## 6. Optimizer scoring (`pipeline/parlay_optimizer.py`)

Per-leg score:
```
score =
    confidence_weight × tier(0.30/0.65/1.0)
  + edge_weight × clip(edgePct, 0..20) / 20
  + recent10_bonus  (when ≥5 numeric values)
  + pid_bonus       (when playerId is real)
  × market_stability_weight
  × calibration_factor
```

`market_stability_weight` (from code):
```
NBA REB         1.10
NBA PTS         0.95
NBA AST         0.90
MLB batter_hits 1.10
MLB total_bases 0.90
MLB strikeouts  0.85
MLB H+R+RBI     0.80
```

Slip score = `avg(leg_scores) − correlation_penalty`.

`correlation_penalty` grows with same-game / same-team /
volatile-MLB stacks.

## 7. Where the model is weak (audit-evidence-based)

### NBA — by market (826 decisive total, 53.3% lifetime)

| Market | W-L | Hit rate | Sample |
|---|---:|---:|---:|
| REB | 157-123 | **56.1%** | 280 |
| PTS | 163-149 | 52.2% | 312 |
| AST | 120-114 | 51.3% | 234 |

**REB is the strongest cohort.** PTS and AST are very close to
coin flip. The current optimizer weight (REB 1.10 / PTS 0.95 /
AST 0.90) is qualitatively correct — but the *magnitude* of the
difference between AST (51%) and REB (56%) suggests we may want
a wider spread (e.g. AST 0.80, REB 1.20).

### NBA — by confidence tier

| Tier | W-L | Hit rate | Sample |
|---|---:|---:|---:|
| High | 311-287 | 52.0% | 598 |
| Medium | 61-37 | **62.2%** | 98 |
| Low | 67-62 | 51.9% | 129 |

**Surprising: Medium outperforms High.** High has plenty of
sample (N=598) and is barely above coin flip. Medium is at 62.2%
on N=98 — SE ~5pp, so the true rate could be anywhere from 57% to
67%. Not conclusive but a real anomaly.

Hypothesis: the High tier (edge ≥7pp) is catching mispriced
markets that are mispriced *because* the public is reading the
same signal we are — so the line moves *with* us and we get
no real edge. Medium picks happen to land on quieter spots.

### MLB — by market (1187 decisive, 50.4% lifetime)

| Market | W-L | Hit rate | Sample |
|---|---:|---:|---:|
| batter_hits | 433-401 | **51.9%** | 834 |
| batter_total_bases | 124-135 | 47.9% | 259 |
| pitcher_strikeouts | 41-53 | **43.6%** | 94 |

**Strikeouts are a losing market for us.** Total bases is also
below coin flip. batter_hits is the only positive cohort.

The optimizer weight for strikeouts (0.85) probably isn't strong
enough. Total bases at 0.90 may also need to drop. Future PR
should consider effectively excluding strikeouts from balanced
slips entirely until we have a starter-by-starter model.

### MLB — by confidence tier

| Tier | W-L | Hit rate | Sample |
|---|---:|---:|---:|
| High | 227-243 | **48.3%** | 470 |
| Medium | 95-90 | 51.4% | 185 |
| Low | 276-256 | 51.9% | 532 |

**MLB High is calibration-inverted.** Already documented in
`confidence-calibration.ts` but the optimizer still treats High
as tier-weight 1.0. Should be revisited — maybe 0.65 (= Medium's
existing weight) until we have a recalibration.

## 8. Where to improve (priority order)

### Immediate, safe, no new data sources

1. **Diacritic-stripped name match in the MLB pipeline** — same
   fix as NBA got 5/25. Cheap.
2. **MLB High weight = Medium weight** in the optimizer. Audit
   says High underperforms — stop trusting the tier alone.
3. **Widen NBA AST penalty / REB bonus.** REB is +6pp over AST in
   the audit; current weights only differ by 0.20.
4. **MLB strikeouts: drop from `balanced` mlb_allowed_markets**
   in `parlay_optimizer.py`. Keep in aggressive only.
5. **Diversified `All` tab order on the homepage.** Already
   shipped this PR — locked by tests.
6. **NBA-aware sport grouping** — slips containing NBA legs
   should appear on the NBA tab even when sport-tagged "multi".
   Already shipped this PR.

### Near-term (with existing data)

7. **Recent10 hard requirement for High tier.** Today's
   guardrail downgrades insufficient_data → no_play, but a
   player with 1-2 recent games can still earn High. Tighten:
   require ≥5 recent games for tier ≥ Medium.
8. **Minute-projection sanity check (NBA).** If `last_5.minutes`
   < 18 and the line implies a starter (e.g. PTS line ≥ 12.5),
   downgrade to insufficient_data. Stops projections on bench
   players who happen to have an unusual recent stat line.
9. **Player whitelist for Conservative.** Today's conservative
   profile is "any High-tier MLB batter_hits leg" — but the
   audit shows even hits run 51.9%, marginal. Restrict
   conservative to top-30 lineup-regular batters per team
   (data already available from rosters).
10. **Probabilistic combined odds.** Use the joint probability
    correctly when slips have overlapping events. Out of scope
    for this PR but a real win.

### Needs new free data (see DATA_SOURCE_ROADMAP)

11. **Confirmed MLB lineups** (MLB Stats API late-afternoon
    update). If a starter is OUT of the lineup, every prop
    instantly invalid.
12. **Park factors** (Baseball Savant, static-ish per ballpark).
    Cheap to embed.
13. **Weather** for outdoor MLB. wind affects total bases.
14. **NBA injury report** (ESPN public endpoint or NBA.com).
    A starter sitting changes every minute-driven projection.

### Needs paid sources / heavy lifting

15. **Real pace + matchup model for NBA.** Pace is recorded
    nightly in lots of places but blending it correctly is a
    rewrite.
16. **L/R split vs. starting pitcher.** Massive for total bases
    and hits. Available in MLB Stats but the join is non-trivial.
17. **Bullpen fatigue.** Days since usage × pitch count.
    Available; not yet wired.

## 9. What MUST NOT change without further validation

- The confidence-tier thresholds (edge ≥ 7/4/2pp). Changing these
  shifts the entire distribution of tiers and invalidates the
  calibration table.
- The blend weights (last-5 0.45 / last-10 0.30 / season 0.20 /
  H/A 0.05). These are not arbitrary — they are tuned to the
  audit. Changing them without rerunning settlement is dangerous.
- The push-exclusion rule. Pushes are excluded from hit rate
  reporting everywhere; introducing them as half-wins would
  inflate numbers dishonestly.
- The "no fabrication" rule. Every UI surface returns honest
  empty states when the model produces nothing.

## 10. Honest read on the current product

- The optimizer + UI is now solid; the underlying projection
  model is mediocre at best and **only the REB market is doing
  real work**.
- "Calibrated" in the copy is honest because we DO calibrate
  per-tier — but the calibration table tells us that one tier is
  inverted (MLB High) and another isn't reliably distinguishable
  (NBA Medium vs. Low).
- The lifetime cross-sport hit rate of 51.6% is a real number.
  It is not a profitable hit rate at standard juice (-110
  requires ~52.4% to break even). We should keep saying that
  honestly on the methodology page.
- The next 2–3 PRs should focus on **data quality (lineups,
  injuries, park factors)** before any model-architecture
  change. Better inputs > better blending.
