# MLB Pregame Capture — CI Reliability Report (2026-07-22)

Reliability review of the first several `mlb-pregame-capture` workflow runs. Internal research pipeline; no modeling, no public change. Money md5 `affe6b21071f2b3be96bb2774eb347c3` unchanged.

## Runs reviewed (4)

| # | run id | trigger | started (UTC) | conclusion | StatsAPI | team markets | player props | artifact |
|---|---|---|---|---|---|---|---|---|
| 1 | [29874416773](https://github.com/yashwantbalaji3/gametimepicks/actions/runs/29874416773) | dispatch | 2026‑07‑21 22:37 | **success** | 17/17 eligible, 0 post‑start | abort (credit guard) | abort (credit guard) | ✓ |
| 2 | [29877334547](https://github.com/yashwantbalaji3/gametimepicks/actions/runs/29877334547) | **schedule** | 2026‑07‑21 23:30 | **success** | 9 eligible / 3 partial / 3 post‑start rejected | abort (credit guard) | abort (credit guard) | ✓ |
| 3 | [29878296984](https://github.com/yashwantbalaji3/gametimepicks/actions/runs/29878296984) | **schedule** | 2026‑07‑21 23:48 | **success** | 7 eligible / 3 partial / 5 post‑start rejected | abort (credit guard) | abort (credit guard) | ✓ |
| 4 | [29883223706](https://github.com/yashwantbalaji3/gametimepicks/actions/runs/29883223706) | dispatch | 2026‑07‑22 01:29 | **success** | 17/17 eligible, 0 post‑start | **916 records (all eligible)** | **3 events, 2,295 records (all eligible)** | ✓ |

### Run 4 (the one clean paid run — post-secret-funding) detail
- **Max-events cap applied:** 3 (enforced).
- **Credits before → after:** ~15,379 → **15,349**. **Spent:** ~30 (team ~3 + props 27).
- **Team-market records:** 916 (all 916 eligible).
- **Player-prop records:** 2,295; **eligible:** 2,295 (100%).
- **Paired vs over-only:** 1,912 paired / 383 over-only. **De-vig coverage:** 83.3%.
- **Skipped games (cap):** 14 (17 − 3). **provider_unavailable:** 0.
- All 9 markets captured (`pitcher_outs, pitcher_strikeouts, pitcher_earned_runs, batter_hits, batter_total_bases, batter_home_runs, batter_rbis, batter_runs_scored, batter_hits_runs_rbis`).

## Reliability summary

- **Run completion: 4/4 (100%).** No hard failures — the non-blocking (`continue-on-error`) design held every time; even the credit-guard aborts left the run green and StatsAPI + artifact upload intact.
- **StatsAPI capture: 4/4 (100%).** Post-start games correctly **rejected** on the evening runs (3 and 5 post-start), never faked — honest per-game eligibility working as designed.
- **Artifacts: 4/4 uploaded.**
- **Credit floor: worked.** The 3 pre-funding runs aborted safely (`remaining 0 < floor 2000`), spending nothing.
- **Paid capture: 1/4 succeeded — but not a reliability defect.** Runs 1–3 aborted only because the GitHub `ODDS_API_KEY` secret was unfunded (0 credits); the founder funded it at 2026‑07‑22T01:27Z, after which run 4 captured team + capped player props cleanly. So the paid-capture **sample size is n=1 clean run** — mechanics proven, but daily reliability needs a few more funded scheduled runs to confirm.
- **Schedule fired.** Two cron runs executed (approximate timing, ~1h drift — expected for GitHub cron). Note: scheduled runs use the default date = **today UTC**; early-UTC runs capture the full pregame slate, while late-evening-UTC runs (23:xx) capture a slate that has largely started → low eligibility (correctly rejected). Player-prop + market capture will land best on the **earlier UTC runs** (11:00–17:00) when games are still pregame.

## Recommendation

```
KEEP CAP 3  +  ENABLE MANIFEST/STATUS COMMITS
```

1. **Keep cap 3.** The capped paid capture is reliable, cheap (~30 credits/run), and complete (all 9 markets, 83% de-vig, 100% eligible). Only one clean paid run exists so far — accumulate ~7 clean daily runs before scaling. Do **not** move to full slate or cap 5 yet.
2. **Enable manifest/status commits** (`PREGAME_ARCHIVE_COMMIT=true`). Today the pipeline is artifact-only — each run's data lives in a 90-day artifact and does **not** accumulate across runs into one committed dataset, so the committed `status/latest.json` + `monitor.json` don't reflect CI progress toward the 30-date gate. A path-scoped, non-blocking commit of the small manifests + status would let the archive durably accumulate and make daily progress visible. (Large raw/normalized payloads stay gitignored → artifacts.)
   - **✅ DONE (2026‑07‑22).** `PREGAME_ARCHIVE_COMMIT=true` set; the commit step was hardened (path-scoped + 128 KiB size guard + money/public/settlement safety-assert + rebase-safe push, no force). Small metadata (manifests, status, snapshots, freezes, summaries) now accumulates in-repo; large market payloads stay gitignored → artifacts. See `MLB_PREGAME_COLLECTION_OPERATING_PLAN.md` → Persistence.
3. **Do not pause.** Runs are healthy and cheap; there's no reliability reason to stop.
4. **Optional cadence tune (later):** if evening-UTC scheduled runs contribute little (games started), trim those cron times or point the capture at the next-day slate to lift pregame coverage per run.

## Guardrails held
No modeling. No public output change. Bank Builder / Moonshot / product eligibility unchanged. Official settlement + money untouched (md5 `affe6b21071f2b3be96bb2774eb347c3`). Archive never web-served. Research gate **not met** (dates 2/30) — no modeling until met + founder approval.
