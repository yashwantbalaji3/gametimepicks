# Recent-form metadata — pipeline backfill TODO

Status: **NOT BLOCKING PR #114.** The UI is ready. The pipeline
write-out is a small, isolated follow-up.

PR #114 shipped a `ParlayLeg.recentGames?: { date, opponent,
isHome, value }[]` schema and the rich rendering inside the
recent-form drawer. The drawer falls back to the legacy numeric
view + an honest note whenever `recentGames` is missing — which
is the state on disk today.

This doc captures exactly where the data already lives and what
the next pipeline PR has to wire up. No new API calls required.

---

## Where the data already exists (read-only audit, 2026-05-26)

| File | What it does | What it has |
|------|--------------|-------------|
| `pipeline/providers/base.py` — `GameLog` | dataclass returned by NBA + MLB providers | ✅ `game_date`, `opponent_abbr`, `home_away`, plus stat fields |
| `pipeline/recent10_extractor.py` | builds the `recent10` arrays attached to NBA board leans | ❌ **discards** date/opponent — extracts numeric values only |
| `pipeline/attach_recent10.py` | calls `fetch_player_game_logs(pid, last_n=10)` and bolts `recent10` onto each board lean | ❌ same — numeric only |
| `pipeline/mlb/mlb_model.py` | builds `recentSeries` for MLB | ❌ numeric only |
| `pipeline/build_features.py` — `build_trend_payload()` | builds the data behind the **trends page** | ✅ **already constructs** `recentGames: [{date, opponent, homeAway, pts, reb, ast}]` (lines 99-108) |
| `pipeline/parlay_optimizer.py` | normalizes board leans into `OptimizerLean` | ❌ passes `recentSeries` through as a flat tuple only |
| `pipeline/snapshot_optimizer.py` | serializes `OptimizerLean` → JSON | ❌ writes `recentSeries` only |
| `app/public/data/parlays/optimizer-graded/2026-05-25.json` | the file the drawer actually reads | ❌ flat numeric arrays |

**Bottom line:** every leg's recent-game metadata is fetched live
from the providers, then discarded by `recent10_extractor.py` and
its MLB counterpart. The trends page already shows the rich view
because `build_features.py` keeps the metadata. The optimizer
snapshots throw it away on the way through.

## What the next PR has to do

Two paths — A is cleaner, B is faster:

### Path A — store per-game metadata on the board lean

1. Modify `pipeline/recent10_extractor.py`:
   - In addition to the numeric `recent10` array, return a parallel
     `recentGames: List[{date, opponent_abbr, home_away, value}]`
     for each (player, market) pair.
2. Modify `pipeline/attach_recent10.py`:
   - Write the new `recentGames` field alongside `recent10` on
     every board lean.
3. Modify `pipeline/parlay_optimizer.py` — extend the `OptimizerLean`
   dataclass with an optional `recent_games: tuple | None`.
4. Modify `pipeline/snapshot_optimizer.py`:
   - At the point where each leg is serialized
     (`"recentSeries": list(leg.recentSeries)`), add
     `"recentGames": [...]` from the new field.
5. Mirror the same shape for MLB — `pipeline/mlb/mlb_model.py`
   already pulls the game logs; same surgery there.
6. Add tests:
   - `pipeline/snapshot_optimizer_test.py` — assert `recentGames`
     keys present on serialized legs when the upstream board has
     them.
   - `pipeline/recent10_extractor_test.py` — assert per-game
     metadata round-trips.
7. Regenerate today's snapshot:
   - Run the cron pipeline (`scripts/automation_projections.sh`)
     once on 5/27 — no extra credits beyond the normal daily run.
   - DO NOT re-fetch historical days. We will not retro-enrich
     5/25 because that data is already settled and tracked.

Estimated effort: **~50–80 lines** across 4 files + tests.

### Path B — read the data live in the loader (fallback)

If we want this to ship before the next pipeline run, the
TypeScript loader for the optimizer snapshot can attempt to join
each leg with the matching `trends.json` payload at render time
(both are server-side reads). The trends file already has
`recentGames` per player. This avoids any pipeline change.

Trade-off: Path B duplicates lookup work on every page request
and the join is fuzzy (player name + market + date). Path A is
the right long-term answer.

## What the UI already does

Already shipped in PR #114:

- `ParlayLeg.recentGames?: { date, opponent, isHome, value }[]` —
  optional field on the type.
- `EnrichedRecentList` component in
  `app/src/components/player-recent-form-drawer.tsx` — renders
  one row per game with the format the user asked for:
  ```
  May 23 · vs NYK [logo] · 8 REB · UNDER
  May 21 · @ CLE [logo] · 10 REB · OVER
  ```
- Honest fallback: when `recentGames` is absent the drawer falls
  back to the legacy G−1 / G−2 numeric view + a note explaining
  the gap.
- Zero fabrication. The drawer never invents a date or opponent.

## Why we are not shipping the backfill in PR #114

1. **Scope.** PR #114 is UI/UX cleanup. Touching the optimizer
   snapshot serializer expands the blast radius.
2. **Credits.** Today's 5/26 snapshot has 0 slips anyway (PR #110
   safety filters tightened generation). A pipeline change
   wouldn't render any data until 5/27's cron.
3. **Cron alignment.** The morning-projections cron runs around
   03:00 ET. Doing this on its schedule keeps API credit use
   inside the existing budget.

The cleanest sequence is: merge PR #114 → land the pipeline
follow-up before the next cron → first enriched drawer view
shows up on 5/27.

## Acceptance criteria for the follow-up PR

- [ ] At least one new NBA snapshot on disk has `recentGames`
      populated on every leg.
- [ ] At least one new MLB snapshot has the same.
- [ ] Drawer renders the rich rows (date + opponent + logo) for
      a real leg in production.
- [ ] No banned copy.
- [ ] No fabricated dates / opponents.
- [ ] Settlement math untouched (hit rate denominator unchanged).
- [ ] No retro-rewrite of any pre-2026-05-27 snapshot.

## Related docs

- `docs/MODEL_LEARNING_LOOP.md` — daily settle / audit cycle.
- `docs/WNBA_ROADMAP.md` — WNBA expansion sequence.
