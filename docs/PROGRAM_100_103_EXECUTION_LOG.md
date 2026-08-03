# Program 100-103 Execution Log (2026-08-03, 00:04–01:15 ET)

Incident response: 62-hour public staleness. Recovery: local `24512ca7` (behind), origin/main
`20244a7b`, production `13ae79ce`. 2 historical stashes and `vp/` untouched throughout; no
protected artifact modified.

## Files actually touched (discovered before editing)

| Lane | Files |
|---|---|
| Root cause | `.github/workflows/nightly-settle.yml` (commit allowlist += `app/public/data/research/`) · `.github/workflows/morning-projections.yml` (`--phase generate`) · `app/scripts/health-check.mjs` (`--phase`, publish default) |
| Regression proof | `app/src/lib/freshness-incident-guards.test.mjs` (5) |
| Observer/SLO | `app/src/lib/daily-freshness-slo.mjs` + `.test.mjs` (8) · `app/scripts/public-beta-observe.mjs` |
| Data repair | `app/public/data/research/{terminal-summary,system-status,daily-brief}.json` (rebuilt from the ledger) |
| Test correctness | `app/src/lib/markets/normalize.test.mjs` (provider-family count → posted-family invariant) |

## Commits

`8559e9cf` root-cause fix (both layers) · `387cdd6f` contract rebuild 07-30→07-31 ·
`62bfafab`/`ddb8a33e` freshness SLO + observer escalation + midnight-hour fix ·
`d29fe59e` normalize-test correction + Aug 3 proofs · (docs tail follows).
Bot commits during the window: `541ff6cc` (morning projections Aug 3), `059f95fd` (production
slate Aug 3) — reconciled by rebase, never force-pushed.

## Live runs driven

| Run | Result |
|---|---|
| morning-projections 30784606069 (dispatch, post-fix) | **SUCCESS — first board since July 31**; 8 games, 7 covered, 211 rows, 20 credits |
| mlb-daily-production (workflow_run chain) | **SUCCESS** — sims, full-game sims, predictions for Aug 3 |
| Vercel canonical | `059f95fd` built 00:38 ET; single `Production` environment |

## Bugs found and fixed beyond the incident brief

1. **Midnight timezone anchor** (caught live at 00:33 ET): `Intl` with `hour12:false` formats the
   midnight hour as **24**, so the new SLO read midnight as "past 14:00" and would have fired a
   false outage every night. Fixed in `currentEtHour` (`% 24`) with 4 pinned hours.
2. **Provider-family count test**: asserted exactly 8 prop families against live data; the
   provider posted 7 on this slate. Replaced with the invariant that actually matters.

## Boundaries honored

No Aug 1/Aug 2 board fabricated (pregame snapshots exist for both days — deliberately not
promoted into a prediction population). No timestamp refresh or postgame regeneration. No model,
calibration, threshold, or market-policy change. No settlement history rewritten. Money hashes
verified before and after. Credits spent: **20** (the legitimate Aug 3 base board); no overnight
credits burned chasing an unposted 8th game.

## Validation at close

Full serial JS/TS suite **3,620 tests / 0 failures** · typecheck 0 errors · production build
clean (prune boundary intact) · health gate HEALTHY (publish phase) · Python suites green ·
ops-alert and cron-watchdog guards green · observer verified against production ·
protected hashes `affe6b21…` / `cb80473f…` intact · `vp/` untouched.
