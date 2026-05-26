# Prop market expansion — audit table

Last updated: 2026-05-26 (PR #115).

This doc captures the audit-by-market state today so the next
pipeline PR can ship new markets in priority order without
re-discovering which inputs are missing.

PR #115 does NOT add any new markets to the official lanes. It
ships the docs + the Custom Parlay Generator so the user can
already opt into the broader pool while validation runs.

---

## NBA candidate markets

| Market | Odds API | Fetched today | Scored today | Recent form | Settlement | Audit | Status |
|--------|----------|---------------|--------------|-------------|------------|-------|--------|
| PTS | ✅ | ✅ | ✅ | ✅ recent10 | ✅ box score | ✅ tracked | **Official** |
| REB | ✅ | ✅ | ✅ | ✅ recent10 | ✅ | ✅ | **Official** |
| AST | ✅ | ✅ | ✅ | ✅ recent10 | ✅ | ⚠ 5/25 audit 0/5 — PR #110 gate `recent10Count >= 7` | **Official (gated)** |
| 3PM | ✅ player_threes | ❌ not fetched | n/a | partial — ESPN logs carry 3PM | ✅ from box score | none yet | **Custom-only** in PR #115. Promote after ≥25 decisive at ≥45%. |
| Steals | ✅ player_steals | ❌ | n/a | partial | ✅ | none | **Custom-only**. High variance — likely Longshot before any safe lane. |
| Blocks | ✅ player_blocks | ❌ | n/a | partial | ✅ | none | **Custom-only**. Same as steals. |
| PTS+REB | ✅ player_points_rebounds | ❌ | n/a | derivable | ✅ | none | **Deferred** — methodology needs a different correlation model. |
| PTS+AST | ✅ player_points_assists | ❌ | n/a | derivable | ✅ | none | **Deferred**. |
| REB+AST | ✅ player_rebounds_assists | ❌ | n/a | derivable | ✅ | none | **Deferred**. |
| PRA | ✅ player_points_rebounds_assists | ❌ | n/a | derivable | ✅ | none | **Deferred**. |

## MLB candidate markets

| Market | Odds API | Fetched today | Scored today | Recent form | Settlement | Audit | Status |
|--------|----------|---------------|--------------|-------------|------------|-------|--------|
| Hits (Over 0.5) | ✅ batter_hits | ✅ | ✅ | ✅ recentSeries | ✅ | ✅ 5/25 audit 61.7% on 79 legs | **Official — safest single-leg foundation** |
| Total Bases | ✅ batter_total_bases | ✅ | ✅ | ✅ recentSeries | ✅ | tracked but thin | **Official, monitored** |
| Runs | ✅ batter_runs | ❌ not fetched | n/a | partial | ✅ | none | **Custom-only**. Runs are spiky → likely Longshot before any safe lane. |
| RBIs | ✅ batter_rbis | ❌ | n/a | partial | ✅ | none | **Custom-only**. Same variance profile as Runs. |
| H+R+RBI | ✅ batter_hits_runs_rbis | ❌ | n/a | derivable | ✅ | none | **Deferred** — composite, methodology needs design. |
| Home runs | ✅ batter_home_runs | ❌ | n/a | partial — need season-long HR rate | ✅ | none | **HR Longshot only** — separate lane, never Conservative/Balanced. Roadmap in §3. |
| Pitcher strikeouts | ✅ pitcher_strikeouts | ✅ | ✅ | ✅ recentSeries | ✅ | ⚠ marked `isVolatileMlb` — excluded from Conservative/Balanced. Audit weak. | **Longshot only today** |

## 1. Why expansion isn't happening in PR #115

To turn on a new market for an **official** lane, all five of
the following must be true (from `docs/PARLAY_METHODOLOGY.md` §9):

1. Odds API returns it for our books.
2. The fetch script writes it to the NBA/MLB board JSON.
3. The grader can settle it from a public box-score endpoint.
4. The audit has ≥25 decisive legs in a rolling 14-day window
   with hit rate ≥45%.
5. The market has a clear `isVolatile*` flag if its variance is
   above the documented threshold.

For every "Custom-only" or "Deferred" row above, at least one of
fetch/score/audit is missing. Shipping them now would either
require new API calls + new fetch scripts + new settlement
plumbing (large change) or fake projections (banned).

## 2. What PR #115 ships instead

- **Docs:** this audit table + `PARLAY_METHODOLOGY.md`.
- **DNP guard** in the Python optimizer so the legs we DO have
  are filtered correctly before entering official lanes.
- **Custom Parlay Generator** in Parlay Lab that lets users
  build off the existing PTS / REB / AST / Hits / Total Bases /
  Strikeouts pool with sport + risk + game/team/player picks.
- **Display visible-per-lane cap raised** from 2 → 5 (when the
  safe pool supports 5 visible slips after diversity rotation).

## 3. Home Run Longshot — separate roadmap

Per the user brief, HR Longshot is a **separate lane**, not part
of the safer lanes.

Prerequisites (none ship in PR #115):

- [ ] Add `batter_home_runs` to `pipeline/fetch_game_markets.py`
      `SPORT_KEYS`-adjacent market list.
- [ ] Persist HR odds + odds-implied probability on the board
      lean.
- [ ] Add `recent_hr_rate` per batter (season-to-date HR / PA).
- [ ] Add `park_hr_factor` from a static park-factor JSON.
- [ ] (Optional) Add opposing-pitcher HR/9 from box scores.
- [ ] Add HR settlement in `pipeline/grade.py` (already trivial —
      `home_runs` is in every box score).
- [ ] Add `HrLongshotRules` to `pipeline/parlay_optimizer.py`
      with `max_legs=3`, `require_recent10=False`,
      no `require_star`, and a hard "longshot-only" flag.
- [ ] Add a new lane bucket in the snapshot serializer.
- [ ] UI: render in its own collapsed section under the existing
      Longshot toggle.

Estimated effort: ~2 PRs (pipeline fetch+grade ~1 day,
optimizer+UI ~1 day). No new API providers needed.

## 4. Per-PR sequencing

Recommended order for follow-up PRs:

1. **PR-A** — Backfill `recentGames` metadata (see
   `docs/RECENT_FORM_METADATA_TODO.md`). Unlocks the rich
   drawer view + better DNP signal. Lowest risk.

2. **PR-B** — Add HR market (fetch + grade + HR Longshot lane).
   Needs HR rate + park factor. Medium risk.

3. **PR-C** — Add NBA 3PM as an official-eligible market.
   Already in box scores; just needs fetch + grader + 14 days
   of audit before flipping the flag.

4. **PR-D** — Daily audit automation
   (`pipeline/audit_daily.py`) — enables market auto-demotion
   per `docs/MODEL_LEARNING_LOOP.md` §3. After PR-D lands,
   subsequent market expansions can be flipped on
   automatically once the rolling audit window clears the
   threshold.

5. **Later** — Steals / blocks / runs / RBIs / composites. Each
   needs ≥25 decisive legs in audit before flipping from
   Custom-only to Official.

## 5. Honest framing in the UI

When the Custom Parlay Generator surfaces a non-official market
(3PM, steals, blocks, runs, RBIs, composites, HR), the slip
preview will carry an explicit chip:

> Custom market · not yet in official audit

If the slip is built from official markets only (PTS / REB /
AST / Hits / TB), the chip reads:

> Custom slip · officially-audited markets only

In both cases the slip is **never persisted** and **never
counted in the public hit rate**. The label is the user's
contract with us: official lanes get the same legs the
optimizer ranked, generator slips are clearly experimental.
