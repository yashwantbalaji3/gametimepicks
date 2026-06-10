# Tonight Readiness & Operations — 2026-06-10

## 1. What is live now (verified)
- **MLB June 10:** board live — 15 games, 685 leans.
- **NBA Finals Game 4:** board live — 96/96 projections via `espn_scoreboard`, leakage-safe
  (recentGames through 2026-06-09). Protected by repo var `NBA_DATA_PROVIDER=espn_scoreboard`.
- **Suggested Parlays:** 20 slips (18 MLB + 2 multi) in the legacy snapshot powering `/parlay-lab`.
- **Bank Builder:** paper bankroll $211.85, Step 2, June 9 WIN preserved, June 10 Step-2
  Builder Slip surfaced (MLB 2-leg +110).

## 2. Routes users should visit
`/` (orientation) · `/mlb` · `/nba` + `/nba/board` · `/parlay-lab` (Suggested Parlays) ·
`/bank-builder` · `/results`. (Use the dash domain only.)

## 3. NBA tip-off check (8:30 PM ET, Spurs @ Knicks)
Board is pre-game + leakage-safe; nothing to do before tip. After the final, settlement
runs overnight (below).

## 4. MLB slate status
15 games live. Settles overnight after games finish.

## 5. Bank Builder current slip
Today's Step-2 Builder Slip (MLB 2-leg +110, stake $211.85 → projected $444.19) is shown
as pending. It is a genuine qualifying slip from the official pool — not forced.

## 6–7. Overnight settlement (automatic)
`nightly-settle.yml` (cron ~05:30/07:30 UTC, often delayed) will: grade NBA Game 4 + MLB
June 10 from official results → update results/ + mlb/results/ → rebuild the Bank Builder
ledger (the workflow runs `build-bank-builder-ledger.mjs` after grading) → commit + deploy.
NBA stays on ESPN via the repo var, so the cron will not regress the board.

## 8. Verify tomorrow morning
- `/results` shows the new settled date (June 10) for NBA + MLB.
- Bank Builder bankroll/step updated from the June 10 slip result (win → ~$444 Step 3; loss
  → reset to $100 Step 1 — both honest).
- `app/public/data/mlb/results/available_dates.json` ends 2026-06-10.

## 9. Known non-blocking issues
- Duplicate no-dash Vercel project 404s on pages (cleanup item; dash domain is production).
- Deeper visual revamp (shared component system) is a scoped follow-up (see revamp plan).
- If `nightly-settle` fails, do not fabricate results — re-run `gh workflow run
  nightly-settle.yml -f settle_date=2026-06-10` once games are final.
