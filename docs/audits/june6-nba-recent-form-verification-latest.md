# June-6 NBA Recent-Form Verification (latest)

> **N/A for June 6 — there is no NBA slate.** Free ESPN schedule shows **0 NBA
> games on 2026-06-06** (NBA Finals rest day). The only June-6 NBA board on disk
> is a placeholder (`generatedAt 2026-06-05T16:11`, 0 games / 0 leans).

## Why verification cannot run on June 6
The Phase-4 check (print ≥3 NBA players' last-10 `recentGames` with date /
opponent / stat / line, confirm playoff games included, correct order, no future
games, no stale regular-season-only fallback) requires NBA leans on the slate.
June 6 has none. Nothing to verify, and **NBA Low fails closed regardless** when
there is no trusted current form.

## Standing status of the #282 form fix (verified previously, still in effect)
- `pipeline/providers/nba_api_provider.py::fetch_player_game_logs` fetches BOTH
  `Playoffs` and `Regular Season`, merges, sorts desc, takes last_n — so playoff
  games are included in recent form (the prior Regular-Season-only bug that made
  Finals form look stale is fixed; 109 pipeline tests pass).
- On the latest real NBA-bearing slate (June 5), the leakage audit reported **0
  leakage** and flagged 38 NBA leans as **stale** (latest game > 21d before
  slate) → those correctly **fail Low closed**. Staleness now reflects the NBA
  off-season/rest-day data gap, not a code defect.

## Action when NBA returns
Re-run this verification on the next NBA-bearing slate (next Finals game). Expect
playoff games present in `recentGames`, descending order, no game dated ≥ slate,
and Low eligibility only where L10 form is fresh and ≥ 80%.

*Read-only. No paid API, no model/grading change.*
