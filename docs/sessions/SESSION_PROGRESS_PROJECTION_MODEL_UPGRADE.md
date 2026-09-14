# Session progress — projection model upgrade

> Generated 2026-05-17. Untracked. Do not commit.

## Phase 0 — branch

- Started from `main` at `a5c7b4b` (PR #46 merge).
- Branch: `feature/projection-model-upgrade-sports`.
- No paid API will be run in this PR.

## Phase 1 — existing model architecture (verified by reading code)

### NBA model (`pipeline/score_model.py`)

```
projection = 0.45·last5 + 0.35·last10 + 0.20·season
              + 0.30·(home_split | away_split) blend
P(over)    = 1 − Φ((line − projection) / σ)
σ          = max(stdev(season), market_floor)   floors: PTS=6.0, REB=3.0, AST=2.5
```

- Inputs in `build_features.py`: `last5_{pts,reb,ast}`, `last10_*`, `season_*`, `home_*`, `away_*`, `dispersion_*`, `games_played_window`, `minutes_trend` (OLS slope, used only in reason text).
- No teammate / usage / opponent-pace / on-off data is currently ingested.
- Markets: PTS, REB, AST.

### MLB model (`pipeline/mlb/mlb_model.py`)

```
Pitcher K:   proj = 0.55·mean(last3 K) + 0.45·mean(season K)
             σ    = max(stdev(season), 1.6)
Batter:      proj = 0.50·mean(last10) + 0.50·mean(season)
             σ    = max(stdev(season), floor)   floors: hits=0.85, TB=1.10, HRR=1.20
P(over)      = 1 − Φ((line − proj) / σ)
```

- Min samples: pitcher 3, batter 5.
- Markets on main board: pitcher_strikeouts, batter_hits, batter_total_bases. (HR markets stay on Power Board.)

### Guardrails (`pipeline/confidence_guardrails.py`)

| Rule | Trigger | Effect |
|---|---|---|
| R1 | no recent10 logs | insufficient_data, No Play |
| R2 | abs(edge) > 30 AND logs < 8 | no_play, No Play (hard suppress) |
| R5 | abs(edge) ≥ 25 (any sample) | confidence → Low, riskFlags += "suspicious_edge" |
| R4 | logs < 5 | Low |
| R3 | logs < 8 AND confidence == High | Medium |

R1 has an exception so `trends_pending` is not downgraded (it is a deferred-fetch sentinel).

### Settlement outputs (`settle_results.py`, `mlb/settle_mlb_results.py`)

NBA settled-row fields: `date, gameId, playerId, playerName, team, opponent, market, side, line, bookmaker, oddsOver, oddsUnder, modelProjection, edgePct, confidence, finalStat, result (win|loss|push|stats_unavailable|invalid)`.

MLB settled-row fields: `id, date, gamePk, playerId, playerName, playerTeamAbbr, opponentAbbr, playerRole, marketKey, line, lean, confidence, projection, edgePct, actual, outcome (Win|Loss|Push)`.

## Phase 2 — results-driven audit findings

### NBA May 15 (n = 145 decisive, 55.2% hit rate)

By market:
- PTS: 31-22 (n=53) · **58.5%**
- REB: 26-24 (n=50) · 52.0%
- AST: 23-19 (n=42) · 54.8%

By confidence:
- Medium: 11-6 (n=17) · **64.7%** (outperformed High on this single slate)
- High: 54-43 (n=97) · 55.7%
- Low: 15-16 (n=31) · 48.4%

By |edge|:
- 5-10pp: 12-22 (n=34) · **35.3%** — the worst clean bucket. Counter-intuitive.
- 10-15pp: 13-5 (n=18) · **72.2%** — sweet spot.
- 15-20pp: 19-10 (n=29) · 65.5%
- 20-25pp: 10-6 (n=16) · 62.5%
- 25-35pp (R5 territory): 10-12 (n=22) · 45.5%
- 35+pp: 5-4 (n=9) · 55.6% — sample too small

By riskFlags join (proper join via playerId+market):
- **R5_anomaly: 15-15 (n=30) · 50.0%** — a pure coin flip after the R5 cap.
- Clean: 65-50 (n=115) · **56.5%** — meaningful edge.

By side:
- Over: 57-54 (n=111) · 51.4%
- Under: 23-11 (n=34) · 67.6%

Note: Under-bias is a single-slate signal (only 34 Unders). Do not encode.

### MLB May 16 (n = 272 decisive, 52.9% hit rate)

By market:
- batter_hits: 88-75 (n=163) · 54.0%
- batter_total_bases: 45-41 (n=86) · 52.3%
- pitcher_strikeouts: 11-12 (n=23) · **47.8%** — losing market on this slate.

By confidence:
- Low: 64-55 (n=119) · 53.8%
- High: 61-55 (n=116) · 52.6%
- Medium: 19-18 (n=37) · 51.4%

By |edge|:
- 0-5pp: 80-72 (n=152) · 52.6%
- 5-10pp: 37-31 (n=68) · 54.4%
- 10-15pp: 13-9 (n=22) · 59.1%
- 15-20pp: 9-8 (n=17) · 52.9%
- **20-25pp: 2-7 (n=9) · 22.2%** — borderline-R5, badly losing despite small n.

By market × side:
- batter_hits / Over: 56-39 (n=95) · **58.9%** — strongest cell.
- batter_hits / Under: 32-36 (n=68) · 47.1%
- batter_total_bases / Over: 30-32 (n=62) · 48.4%
- batter_total_bases / Under: 15-9 (n=24) · **62.5%** — strong, smaller n.
- pitcher_strikeouts / Over: 6-9 (n=15) · 40.0% — losing.
- pitcher_strikeouts / Under: 5-3 (n=8) · 62.5% — tiny n.

By market × confidence:
- batter_hits High 33-24 (n=57) · 57.9%
- batter_hits Medium 9-13 (n=22) · **40.9%** — weakest hits cell.
- batter_total_bases Medium 10-4 (n=14) · **71.4%** — best but tiny n.

## Phase 2 — model lessons

### Robust lessons worth encoding (NBA + MLB)

1. **R5 anomalies hit ~50%.** They are a coin flip. The R5 cap to Low + warn-chip is the right honest treatment. **Stronger action: route R5 anomalies out of the main Parlay Lab candidate pool** (already done for Conservative + Balanced; confirmed in `lib/parlay-builder.ts`).
2. **MLB 20-25pp |edge| is failing badly (22.2% on n=9).** Borderline-R5. Tighten MLB R5 threshold from ≥25pp to **≥20pp** is the conservative move. Sample is small so we tighten the cap, not the lean's confidence; risk of overfit is bounded because tightening only adds caution.
3. **High edges trade off against sample size more than confidence tier does.** Both sports show the strongest clean buckets are 10-20pp |edge|, not 25+ or <5. The existing guardrails are mostly right.

### Single-slate noise NOT worth encoding

- NBA Under-bias 67.6% vs Over 51.4% — n=34 Unders.
- MLB pitcher_strikeouts Over 40% — n=15.
- MLB batter_total_bases Medium 71.4% — n=14.
- NBA Medium > High (64.7% vs 55.7%) — n=17 Medium.
- "Star players underperformed" — true on this slate (Wembanyama 0-6, Randle 0-6, Gobert 0-4), but role players overperformed (Tobias Harris 6-0, Jarrett Allen 6-0). Star bias would require multiple slates.

### Immediate guardrail tweaks (this PR)

1. **MLB R5 anomaly threshold** tightened from ≥25pp to ≥20pp. Reason: 20-25pp bucket hit 22.2% on n=9; ≥25pp behaved similarly to NBA R5 (~50%). Both confirm anomaly territory starts earlier in MLB than NBA.
2. **Context tag attached to each lean** at enrich-time:
   - `clean` — confidence High or Medium, no riskFlags.
   - `sample-watch` — confidence ≤ Medium and recent10 length 5-7.
   - `model-anomaly` — `suspicious_edge` riskFlag set (i.e., R5).
   - `recent-form-backed` — confidence High and recent10 length ≥ 8.
   - `volatile-market` — placeholder for HR/sixes/goals on Power Board surfaces.
3. **Per-market sample floor** documented for future tightening (not enforced this PR to avoid overfit).

### Future data needs (not in this PR)

- Teammate/usage data (NBA): minutes, usage%, on-off.
- Opponent pace + opponent defensive splits by position.
- MLB park factors, weather, batting order, pitcher handedness vs batter.
- NHL: per-skater shots-on-goal logs + opponent SOG-allowed.
- IPL: per-batsman/per-bowler innings — requires paid provider; ESPN free does not expose.

## Phase 3 — cross-sport projection model design proposal

### Unified concept

Each lean carries the same shape across sports:

```
{
  sport: "NBA" | "MLB" | "NHL" | "IPL",
  date, gameId/matchId, playerId, playerName, team, opponent,
  market, line, side, bookmaker, oddsOver, oddsUnder,
  modelProjection, modelProbability, edgePct, confidence,
  riskFlags[],          // e.g. ["suspicious_edge", "sample-watch"]
  contextTag,           // NEW: "clean" | "sample-watch" | "model-anomaly" | "recent-form-backed" | "volatile-market"
  reason[],             // human-readable bullets
  recent10,             // array, oldest→newest, sport-appropriate metric
  _guardrail, _originalConfidence  // audit-only
}
```

Confidence remains High/Medium/Low/insufficient_data/no_play across sports. The R5 anomaly cap activates per-sport with sport-specific thresholds (NBA 25pp, MLB 20pp; NHL/IPL future).

### Per-sport input inventory (today vs planned)

| Input | NBA | MLB | NHL (planned) | IPL (planned) |
|---|---|---|---|---|
| Last-5 mean | ✓ | pitcher only | ✓ | requires provider |
| Last-10 mean | ✓ | batter only | ✓ | requires provider |
| Season mean | ✓ | ✓ | ✓ | requires provider |
| Home/away split | ✓ | — | — | — |
| Minutes / TOI trend | ✓ (text only) | — | planned | — |
| Opponent pace / pitchers / shots-allowed | — | — | planned (free) | — |
| Teammate / usage / on-off | — | — | — | — |
| Park / venue context | — | — | — | planned |

### Dependency / correlation notes (future — see Phase 8)

Sketched in the unified `ParlayLeg` shape and documented in §8. No code changes for dependency correlation in this PR — premature without snapshot persistence.

## Phase 4 — safe model improvements (THIS PR)

1. **MLB R5 threshold lowered from 25 → 20pp.** Code change in `pipeline/mlb/mlb_model.py`. Added test confirming both 20pp and 25pp edges trip the cap.
2. **Lean `contextTag` field.** New helper in `pipeline/confidence_guardrails.py` (`infer_context_tag(lean)`) applied during NBA enrichment; new equivalent applied during MLB scoring. Pure derivative of existing data — no fabrication.
3. **UI honoring contextTag** — non-NBA/MLB shells already say "warming up"; NBA + MLB results pages get a small "model lessons" callout summarizing what we learned from the latest settled slate.

## Phase 5 — NHL feasibility (free data, no fetch yet)

- NHL public API `https://api-web.nhle.com/v1/schedule/<date>` works free; this PR already wrote `app/public/data/nhl/schedule/2026-05-18.json` in PR #46.
- Player game logs available at `https://api-web.nhle.com/v1/player/<id>/game-log/<season>/<gameType>`. Boxscore at `/v1/gamecenter/<id>/boxscore` gives `sog`, `saves`, `shotsAgainst`, etc.
- **For this PR**: do NOT prototype the model. Keep `/nhl/board` as the honest pending shell. The NHL projection prototype belongs in a follow-up PR that runs the free fetcher once we have a per-skater + per-goalie log loader.
- Reason for deferring: implementing real per-player NHL ingestion needs a `pipeline/nhl/nhl_stats.py`, a `pipeline/nhl/nhl_model.py`, and at least one paid odds run for line data. None of that is safely doable inside a no-paid-API session.

## Phase 6 — IPL feasibility (free data only)

- Schedule load works from ESPN cricket league 8048 (PR #46 already wrote `app/public/data/ipl/schedule/2026-05-18.json`).
- ESPN free summary endpoint returns:
  - team-level innings (runs, wickets, overs).
  - NOT per-batsman/per-bowler scorecards in `rosters[].roster[].stats` (empty in our probe).
- **Blocker confirmed:** per-player IPL stats require a paid provider (Cricbuzz, SportRadar, RapidAPI cricket). Free ESPN endpoints alone cannot support `batter_runs` or `bowler_wickets` projections.
- IPL UI explicitly says model board is pending until a per-player stats provider is wired — already shipped in PR #46.

## Phase 7 — moneyline + game-total feasibility

Not implementable on existing data:

- NBA / MLB game totals require team-level offense/defense models we do not have. Aggregating individual player projections is biased because role players are absent from props.
- Moneyline (win-probability) requires team strength + situational adjustments (rest, travel, B2B, bullpen, weather) that none of the four sport models ingest.
- NHL/IPL: schedule-only today.

Conclusion: defer to a dedicated PR. **No game-line shells in this PR** — adding empty UI for moneyline/total would muddle the projection-focused board pages.

## Phase 8 — parlay dependency / correlation plan

Unified `ParlayLeg` schema (also documented in the prior PR's progress log):

```ts
interface ParlayLeg {
  sport: "NBA" | "MLB" | "NHL" | "IPL";
  date: string;
  gameId: string;          // unified per-sport id
  playerId: number | string | null;
  playerName: string;
  team: string;
  opponent: string;
  market: string;
  side: "Over" | "Under";
  line: number;
  odds: number;
  bookmaker: string;
  projection: number | null;
  edgePct: number | null;
  confidence: string;
  riskFlags: string[];     // includes contextTag-equivalents
}
```

Correlation classes to surface (UI warnings, no math yet):

1. Same-player legs — hard-disallow (already in NBA builder).
2. Same-game legs — soft warn, allow.
3. Same-team legs — soft warn (e.g., scorer + assist on same team correlate positively).
4. Teammate usage competition — e.g., two same-team PTS Overs reduce ball-share.
5. Pitcher / batter direct correlation — opposing pitcher K Under + opposing batter Hits Over correlate.
6. Cross-sport mixes — lower direct correlation but never zero (news cycles, sportsbook line shading).

Snapshot persistence (still blocked, same as before): we cannot claim parlay hit rates until candidate slips are saved to `app/public/data/parlays/<sport>/<date>.json` before first game and graded after settlement.

This PR adds no parlay code — the schema is documented, builder code stays as-is.

## Phase 9 — UI changes in this PR

- Each sport's Results page gets a small "model lessons" callout that summarizes one or two robust lessons from the latest settled slate (NBA + MLB only). Copy is short and uses approved language ("clean leans", "model anomaly", "risk-aware").
- Board pages stay projection-first. The new `contextTag` field flows into `BoardData.leans` but is not surfaced as a chip in this PR — that's a UI polish iteration.

## Open items / next PRs

1. NHL projection prototype (free data, separate PR).
2. IPL paid-stats-provider decision.
3. Multi-slate guardrail tuning once 4-5 settled slates exist.
4. Parlay candidate-snapshot persistence (the standing unblocker).
5. Game-total + moneyline model design.
