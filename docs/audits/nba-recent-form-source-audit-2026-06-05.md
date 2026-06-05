# NBA Recent-Form Source Audit (2026-06-05)

> Root-cause audit of the inaccurate NBA recent-form (the user's Keldon Johnson
> observation). No paid API run. No data edited.

## Symptom
On the June 5 board, Keldon Johnson's `recentGames` (the L10 source) are:
`2026-03-25 MEM, 03-28 MIL, 03-30 CHI, 04-01 GSW, 04-02 LAC, 04-04 DEN, 04-06 PHI,
04-08 POR, 04-10 DAL, 04-12 DEN` — all **regular-season games ending 2026-04-12**.
The playoff games the user described (Knicks Finals G1, the OKC series, the
Minnesota series) are entirely absent. His "L10 = 10/10" is computed against
~54-day-old regular-season data.

## Exact last-10 used (date · opponent · home/away · value vs line 6.5)
MEM 15, MIL 16, CHI(H) 15, GSW 11, LAC 13, DEN 10, PHI(H) 13, POR(H) 20,
DAL(H) 17, DEN(H) 18 — all > 6.5 → 10/10. (No game after 2026-04-12.)

## Root cause (isolated)
`pipeline/providers/nba_api_provider.py :: fetch_player_game_logs` hardcoded:
```python
playergamelog.PlayerGameLog(player_id=..., season_type_all_star="Regular Season", ...)
```
The NBA player game-log query requested **Regular Season only**. During the
postseason this returns the last regular-season games and **never the playoff
games**, so "recent form" freezes at the end of the regular season. The leg was
NOT from the stale-cache fallback (no `_recent10Source` stamp) — it's the
provider's season-type filter itself.

It is therefore:
- ✗ NOT a sort bug (dates are correctly descending within the regular season)
- ✗ NOT a future-leak (no games after the slate)
- ✗ NOT a wrong player/team mapping
- ✗ NOT the 14-day stale-cache fallback (that rejects >14-day caches)
- ✓ **A season-type bug**: playoff logs are excluded by `season_type_all_star="Regular Season"`.

## Fix implemented (future-slate)
`fetch_player_game_logs` now fetches **both "Playoffs" and "Regular Season"**,
merges, sorts by date descending, and takes the most-recent N. Outside the
postseason, Playoffs returns empty (no-op). A `_parse_player_gamelog_rows` helper
was extracted so both season types share one parse path. Unit-tested via the
merge/parse logic (live nba_api can't be hit offline).

## Limitation / what still requires action
- This is a **provider/code fix** → it takes effect on the **next generation**
  (next `morning-projections` run, which re-fetches game logs). It does **NOT**
  retroactively fix June 5's already-baked board.
- To correct June 5 specifically would require **regenerating June 5** (a game-log
  refetch + the paid Odds API morning-projections) → **STOP / operator approval
  required** (per mission guardrail).
- Belt-and-suspenders: the new Low-Risk gate `_form_is_stale` fails closed when
  dated `recentGames` show the latest game is > 21 days before the slate — so even
  if stale NBA logs reappear, they cannot enter Low Risk.

*Root-cause audit. Code fix is future-slate; June 5 needs regeneration (paid) — not run.*
