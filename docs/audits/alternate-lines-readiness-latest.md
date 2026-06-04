# Alternate Lines — Readiness Audit (2026-06-04)

> READ-ONLY audit. **Status: BLOCKED — true alternate lines do not exist in the
> current data feed.** No fabrication. Supporting alternate lines requires
> requesting alternate-market keys from The Odds API (more credits) plus de-vig
> + grading + neutral UI. Nothing here is wired live.

## 1. What was inspected
- `app/public/data/mlb/boards/2026-06-04.json` (9 games, 426 leans)
- `app/public/data/parlays/optimizer/2026-06-04.json`
- `app/public/data/odds_props.json` (raw odds cache)
- `pipeline/config.py` (which Odds API markets are requested)

## 2. Findings — no true alternate ladders

**MLB June 4 markets (standard only):**

| market | leans | distinct line values across slate | two-way odds | per-player lines |
|--------|------:|-----------------------------------|:-----------:|------------------|
| `batter_hits` | 162 | 0.5, 1.5 | 162/162 | one standard line/player |
| `batter_hits_runs_rbis` | 162 | 0.5, 1.5, 2.5 | 162/162 | one standard line/player |
| `batter_total_bases` | 85 | 1.5 | 85/85 | one standard line/player |
| `pitcher_strikeouts` | 17 | 3.5, 4.5, 5.5, 6.5, 7.5 | 17/17 | one standard line/player |

- **Per player+market combos with >1 distinct line: 2 of 424** (JT Ginn and Ryne
  Nelson at pitcher_strikeouts 3.5 *and* 4.5). These are **incidental duplicates
  / line-move artifacts, not an alternate ladder** — a true alternate market
  gives the *same* player several lines (e.g. hits 0.5/1.5/2.5) systematically.
- The per-market "distinct line values" are different *standard* lines for
  different players (heavier/lighter hitters), **not** ladders per player.
- **No `alternate` / `_alternate` string** anywhere in the June 4 artifacts.
- `odds_props.json` = `{"source":"unavailable","props":[]}` (the NBA odds cache;
  empty because June 4 is an NBA off-day). No alternate markets hiding there.
- **All 426 MLB leans carry two-way odds** (`oddsOver` + `oddsUnder`) → standard
  lines *are* fully de-viggable today; alternates are simply not fetched.

## 3. Root cause (provider request scope)
`pipeline/config.py` requests only standard player-prop markets:
- NBA: `player_points`, `player_rebounds`, `player_assists`
- MLB (separate path): `batter_hits`, `batter_hits_runs_rbis`,
  `batter_total_bases`, `pitcher_strikeouts`

The Odds API exposes **alternate** variants (e.g. `batter_hits_alternate`,
`batter_total_bases_alternate`, `batter_rbis_alternate`,
`pitcher_strikeouts_alternate`, `batter_home_runs_alternate`, …) that return a
**ladder of lines per player with two-way odds**. These are **not requested**, so
no alternate data is on disk. **Each added alternate market multiplies per-event
Odds API credit cost** (markets × regions × events).

## 4. Required to unblock (proposal — NOT implemented)

### 4a. Provider market keys to request (The Odds API)
- MLB: `batter_hits_alternate`, `batter_total_bases_alternate`,
  `batter_rbis_alternate`, `batter_runs_scored_alternate`,
  `pitcher_strikeouts_alternate` (+ `batter_home_runs_alternate` if used)
- NBA (when in season): `player_points_alternate`, `player_rebounds_alternate`,
  `player_assists_alternate`, `player_threes_alternate`
- Add these to `ODDS_MARKETS` (or an `ODDS_ALT_MARKETS` list) behind a flag;
  budget the extra credits (each alt market ≈ one more market's cost per event).

### 4b. Storage schema (per alternate line)
```
{
  playerId, sport, gameId, market, line,
  overOdds, underOdds,          // American, two-way
  devigOver, devigUnder,        // = impliedSide / (impliedOver + impliedUnder)
  asOf, provider                // timestamp + bookmaker key
}
```
- Store as a ladder: many rows per (playerId, market), one per `line`.
- Keep `asOf`/`provider` so line moves are auditable and de-vig is reproducible.

### 4c. Grading requirements
- Settle each alternate line against the **actual final stat** (same source as
  standard settlement): over hits iff `actual > line`; under iff `actual < line`;
  `actual == line` = push (excluded from W/L).
- Grade per (playerId, market, line) so each rung is independently settled.
- Feed settled alternate legs into the unbiased de-vigged validation
  (`audit-v2-candidate-search.mjs`) before any public surfacing — they must clear
  the same hardened launch gates.

### 4d. UI plan (neutral copy — no banned terms)
- Surface as a **line ladder** per player: each rung shows the line, the
  **de-vigged probability**, and the payout. Let the user trade probability for
  payout explicitly.
- Allowed framing: "lower line / higher de-vigged probability / smaller payout"
  and "higher line / lower probability / bigger payout".
- **Banned:** "safe", "safer", "lock", "guaranteed", "sure thing",
  "better/improved hit rate". No certainty language; show the probability number
  and let it speak.

## 5. Decision
**Alternate lines are BLOCKED on data availability** (provider request scope), not
on modeling. No alternate data exists to validate, so there is nothing to expose
and no audit beyond this readiness note. **Do not surface anything.** Unblock by:
(1) approving the extra Odds API credits for alternate markets, (2) implementing
the schema + grading above behind a flag, (3) validating the settled alternate
legs through the hardened gates, then (4) a neutral ladder UI — each step gated
by operator approval.

*Generated 2026-06-04. Read-only; no public/model/data change.*
