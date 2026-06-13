# June 13 10:15 ET — forced three-sport + Step 5 run (diagnosis)

Run: 2026-06-13 ~14:48 UTC · Base `e53bb47`. Paid runs authorized. Goal: unblock NBA + WC,
publish Brazil+NBA Step 5 if gates clear. Outcome: **MLB live; NBA no-recommendation (deep
diagnosis below); WC hard-blocked; Step 5 Brazil+NBA cannot publish → Review Pending. No
fabrication, no invented card.**

## Credentials (names/flags only)
`ODDS_API_KEY` present · `ODDS_DRY_RUN=true` · `ODDS_MAX_EVENTS_PER_RUN=2`.
**`API_FOOTBALL_KEY` absent** across `.env`, `.env.local`, `app/.env`, `pipeline/.env`; no
`.vercel`. Code requires `API_FOOTBALL_KEY` (`pipeline/world_cup/providers/api_football.py`).

## NBA Game 5 — diagnosed in depth (the prompt's "repair the logs" task)
Symptom: all 193–196 Game-5 props are `No Play / insufficient_data` ("no player game logs").
Layered root cause found by live diagnostics:
1. **System python is broken for nba_api** — NumPy 2.0.2 vs pyarrow ABI mismatch
   (`AttributeError: _ARRAY_API not found`) crashes `import nba_api…`. My earlier board runs
   used system `python3`, so the game-log path failed silently → insufficient_data.
2. **The project ships `pipeline/.venv`** where `nba_api` imports cleanly. Re-running the
   board via the venv removes the crash.
3. With the venv, the pieces work **in isolation**: `resolve_player_id` maps every Game-5
   player to the correct **stats.nba.com** id (Fox→1628368, Wembanyama→1641705 — the board
   itself carries ESPN ids, which differ); both `NbaApiProvider.fetch_player_game_logs` and
   the wrapper `fetch_nba_data.fetch_player_game_logs` return **~25 real logs with full stats**
   (pts/reb/ast/…) per player; `PlayerGameLog(Fox, "2025-26")` returns 72 rows. So stats.nba.com
   is reachable, ids resolve, and the wrapper is sound. (An earlier "wrapper returns 2" note
   was a measurement error — the wrapper returns a `(logs, source)` tuple; the logs list is full.)
4. **Yet the full board run still reaches the model with `samples=0` for every player** → all
   props `insufficient_data` → No Play. Isolated few-player fetches succeed, but the board
   fetches logs for all ~18 Game-5 players in quick succession; the most likely cause is
   **stats.nba.com rate-limiting tripping the provider circuit-breaker during the bulk fetch**
   (nba_api throttles aggressively), so logs return empty for most players in the board context.

Conclusion: NBA has **no model-recommended Game-5 leg**. The model **correctly declines** on
zero usable samples — overriding that would fabricate confidence, which the rules forbid. The
remaining work (a reliable throttled/retried bulk game-log fetch via the venv) is a deeper
pipeline task and, critically, **would not unblock Step 5** (Brazil is the hard blocker). No
NBA leg published.

## World Cup — hard credential blocker
No `API_FOOTBALL_KEY` → `build_team_projections` hard-stops; no June-13 WC schedule/odds/
projections can be produced. The Odds API has the key but provides only odds, not the model
probabilities the Bank Builder leg requires. Brazil leg cannot be sourced. **Blocked.**

## MLB — live (from PR #470, verified)
698 real props (15 games, DK/FD odds + model), 18 suggested slips. Live on /mlb, /games,
fixtures, /picks, /today. No regeneration needed.

## Bank Builder Step 5 — REVIEW PENDING (Brazil + NBA target)
- Brazil leg: **BLOCKED** (no WC data / no API_FOOTBALL).
- NBA leg: **PENDING** (model declines — no recommendation on available game-log samples).
- Combined odds / return: n/a (no legs). Card **NOT published**. **No MLB substitute** (the
  target is Brazil+NBA per the user). No `official-step5-candidate` artifact written. The
  `/bank-builder` panel (PR #471) already shows this target + per-leg blockers — accurate.

Bank Builder unchanged: $3,623.97 · 4-0 · Step 5/5.

## Next operator actions (the real unblocks)
1. **World Cup / Brazil**: add an `API_FOOTBALL_KEY` to `.env` → run the WC pipeline for
   2026-06-13 via `pipeline/.venv/bin/python` → real Brazil odds + model probability.
2. **NBA**: run the board via `pipeline/.venv/bin/python` (not system python) AND add a
   throttled/retried bulk game-log fetch so stats.nba.com rate-limiting doesn't trip the
   circuit-breaker mid-board (isolated fetches return ~25 real logs; the all-players board run
   returns `samples=0`). Then the model can project Game 5.
3. When both legs read "ready", the Step 5 gate re-runs and publishes if combined ≥ +176.
