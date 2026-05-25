# Alternate-line parlay lane — implementation plan

Status: **not shipped this PR.** Documented for the next pass.

The product brief asked for an alternate-line parlay lane that
prefers easier/smaller lines where available — lower variance,
slightly worse price, better hit profile. We do not ship that lane
yet because the data isn't reliably present in the current snapshot.

## Audit of available alt-line coverage (2026-05-25 slate)

```
NBA player+market combos with multiple distinct lines: 7 / 46
  Donovan Mitchell AST    [3.5, 4.5]
  Max Strus AST           [1.5, 2.5]
  Donovan Mitchell PTS    [26.5, 27.5]
  Jalen Brunson PTS       [26.5, 27.5]
  Miles McBride PTS       [4.5, 5.5]
  …

MLB player+market combos with multiple distinct lines: 1 / 580
  Shane McClanahan strikeouts  [5.5, 6.5]
```

What's there today comes from the natural line drift between
DraftKings and FanDuel on the same prop — not a true alt-line
fetch. It is incidental and inconsistent.

## Why it isn't enough yet

1. **Coverage**: 7 NBA combos out of 46 (~15%) and 1 MLB combo
   out of 580 (~0.2%). A "lane" sourced from this would surface
   the same handful of stars every night and look fabricated.
2. **No alt-line market fetch**: `pipeline/fetch_odds_data.py`
   currently asks the Odds API for `player_points` /
   `player_rebounds` / `player_assists` only. The Odds API DOES
   expose `player_points_alternate` / `player_rebounds_alternate`
   etc. — but each adds ~1× to the per-event credit cost. At
   today's budget (≈100 credits) that's a meaningful spend.
3. **No alt-line metadata on legs**: `OptimizerLean` has no
   concept of "main line" vs "alt line" — we'd need to add
   `mainLine` / `altLine` / `lineType` fields and wire them
   through the snapshot writer + UI + grader.

## What to ship when we add it

### Data layer

- Extend `pipeline/fetch_odds_data.py` to optionally fetch
  alternate markets: `player_points_alternate`,
  `player_rebounds_alternate`, `player_assists_alternate`,
  `batter_hits_alternate`, `batter_total_bases_alternate`,
  `pitcher_strikeouts_alternate`. Gate behind an env var so the
  paid-credit cost is opt-in.
- Persist every line for the same (player, market) — not just
  the closest-to-fair one. Existing pipeline collapses to a
  single main line per book.

### Optimizer layer

- Add `lineType: "main" | "alt"` to `OptimizerLean`.
- Add `mainLine: float | None` to `OptimizerLean` (so an alt
  line at 5.5 can display "alt 5.5 vs main 7.5").
- New `safer_alt` profile in `parlay_optimizer.py`:
  - 2 legs
  - prefer star players (current star-boost layer)
  - prefer alt lines that are clearly easier than main (≥1.0
    line below main for NBA PTS/REB, ≥0.5 below for AST/MLB
    hits)
  - cap at 1 leg per game
  - reject any leg where alt and main are within 0.5 of each
    other (no marginal alt)
- New bucket in `OptimizerSnapshot.buckets`: `safer_alt`.

### Snapshot writer

- `pipeline/snapshot_optimizer.py` adds a `safer_alt` profile
  call alongside the existing three. Skip cleanly when the slate
  has no alt-line coverage above threshold.

### Grading

- `pipeline/grade_optimizer.py` already keys settled lookups on
  `(playerId, market, side, line)` — alt-line legs grade
  naturally because the line is part of the key. No code change
  needed beyond making sure alt-line legs persist `line` correctly.

### UI

- New 4th risk card on the homepage + Parlay Lab: "Alt-line
  safer profile". Each leg shows the alt line + the main line
  next to it ("Over 5.5 (alt) · main 7.5").
- Badge: "Alt line".
- Copy: "Alt-line parlays. Lower variance, lower payout. No
  guarantees."
- If no alt-line slips exist for a date, the card renders an
  honest empty state — same pattern as the existing risk cards.

### Tests

- Optimizer: alt-line profile prefers alts ≥1.0 below main.
- Grader: alt-line legs grade correctly against settled
  finalStat (current logic already supports this).
- UI: alt-line badge renders only when `lineType === "alt"`.

## Cost estimate

- ~3-4× per-event credit increase on the Odds API fetch.
- One model engineering day for the alt-line profile + tests.
- One UI day for the new card + badge.

## When to ship

After the next replenishment of the Odds API budget AND a
confirmed slate where alt-line coverage exceeds 50% of
recognizable players. Until then, this stays in `docs/`.
