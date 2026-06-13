# June 13 data-availability review — pipeline actually run

Run: 2026-06-13 ~10:40 UTC · Base `8799234`. PR #468 found June-13 WC/MLB data missing but
did not run the generators. This run RAN them to determine the exact cause.

## Pipeline configuration (from .env, values redacted)
- `ODDS_API_KEY`: set (32 chars, provider the_odds_api) — live key present.
- `ODDS_DRY_RUN=true` — the user's deliberate cost guard. Live odds are PAID; dry-run skips
  the paid fetch and writes a schedule/pending board instead. Per-run cap = 2 events;
  credit floor protection on.
- `API_FOOTBALL`: **absent** (not in .env, not in env). World Cup data (schedule, odds,
  player stats) flows through `pipeline/world_cup/providers/api_football.py` /
  `build_stats.py`, which require this key.

## Result per sport
| Sport | Schedule | Odds / props | Status |
|---|---|---|---|
| **NBA** | ✅ real (ESPN) | ✅ real (the_odds_api, 193 props) | LIVE board `boards/2026-06-13.json` — NY @ SA Game 5. Already active. |
| **MLB** | ✅ real (MLB Stats API, 15 games) | ❌ none (dry-run skips paid fetch; cap 2) | **schedule-only**. Generated `mlb/schedule/2026-06-13.json`; surfaces on /mlb upcoming + game tiles with official logos. No fabricated odds. |
| **World Cup** | ❌ | ❌ | **BLOCKED** — no `API_FOOTBALL` key. Cannot fetch June-13 WC schedule/odds/projections. /world-cup shows June 12 (latest real). |

I ran `python3 -m pipeline.mlb.generate_mlb_board --date 2026-06-13` in its configured
dry-run mode → real 15-game schedule (STL@MIN, NYY@TOR, SD@BAL, SEA@WSH, MIA@PIT, AZ@CIN, …)
with real team IDs (official mlbstatic logos resolve). NO odds/props written (dry-run).

## The concrete unblock (operator actions — not taken here)
- **World Cup**: add an `API_FOOTBALL` key to `.env`, then run the WC projection pipeline
  for 2026-06-13. (No key → cannot proceed honestly.)
- **MLB odds/props**: set `ODDS_DRY_RUN=false` and run the MLB board generator with paid
  The-Odds-API credits (cap 2 events/run). NOT done here — flipping the user's cost guard and
  spending paid credits unattended is an outward-facing money action left to the operator;
  and it would not unblock the preferred NBA+WC Step 5 (WC still needs API_FOOTBALL).
- **NBA**: already live; no action.

No data was fabricated. Missing data is shown as honest schedule-only / unavailable states.
