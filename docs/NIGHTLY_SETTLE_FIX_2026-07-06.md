# Nightly automation failure — root cause & permanent fix (2026-07-06)

## Symptom
Overnight both scheduled workflows FAILED and produced no commit, so the July-5 slate never settled
and the site stayed on the stale July-5 state:
- `nightly-settle` — failed 09:14 UTC and 11:47 UTC (exit 1)
- `daily-lifecycle` — failed 12:25 UTC (exit 1)
- (`auto-refresh` runs were `cancelled` at 25 min — concurrency/timeout, not a failure; unrelated.)

Both failures carried the identical error:
```
[money-integrity] ✗ 1 CRITICAL violation(s) — refusing to proceed:
  ✗ daily=canonical-bankroll: daily activeBankroll 19265.4 ≠ portfolio bankroll 19065.4
  ✗ MONEY-INTEGRITY GATE FAILED — settlement produced an inconsistent bankroll.
```

## Root cause (classification: **code / orchestration bug**, not API/credential/env)
`scripts/settle_soccer_day.sh` settles the active lanes → this moves `portfolio.json`'s canonical
bankroll (July-5: two lanes lost → $19,265.40 → $19,065.40) and rebuilds the Mr. Dub ledger — **but it
never regenerated the derived `daily-portfolio.json`**, which kept advertising the PRE-settlement
`activeBankroll` ($19,265.40). The very next step in the same script is the money-integrity gate, whose
`daily=canonical-bankroll` invariant requires `daily.activeBankroll === portfolio.currentBankroll`. The
stale daily portfolio failed that invariant → exit 1 → the commit/push step never ran.

Why it only bit now: the gate passed on prior nights because those slates had **no active lanes to
settle**, so the bankroll never moved and the (untouched) daily portfolio stayed consistent. July-5 was
the first night in a while with two ACTIVE lanes that settled — the moment the bankroll moved, the
latent bug surfaced. The gate itself was working correctly (fail-closed: it refused to publish an
inconsistent bankroll and made no commit — money was never corrupted).

This is the shared root cause of BOTH workflows: `nightly-settle.yml` calls `settle_soccer_day.sh`
directly; `daily-lifecycle.yml` calls `roll_to_next_day.sh` → `settle_soccer_day.sh`. The failing gate
is `settle_soccer_day.sh`'s own internal step, which runs before either workflow's later stages.

## Permanent fix (not a workaround)
`scripts/settle_soccer_day.sh` now ROLLS THE DAILY PORTFOLIO FORWARD after the ledger rebuild and
**before** the money gate (new step 5/6):
```bash
ROLL_DATE=$(TZ=America/New_York date +%F)          # today in ET = the roll-forward day
npx tsx app/scripts/activate-daily-portfolio.mjs --date "$ROLL_DATE" --apply || exit 1
```
Regenerating for **today in ET** (not the settled "yesterday") is important: the date-gated approved
card no longer matches "today", so **no stale settled lane resurfaces** — the daily portfolio simply
reflects the new canonical bankroll with whatever is genuinely active today (an empty/no-play portfolio
until today's card is approved). `activeBankroll` now always tracks `portfolio.currentBankroll`, so the
gate passes. This is paper-only: `activate-daily-portfolio` never mutates canonical money (the promote
path md5-guards it), so the fix cannot itself move the bankroll.

Proven locally end-to-end: from the clean pre-settlement state, `settle_soccer_day.sh --date 2026-07-05
--apply` now settles (17-12 → 17-14, $19,265.40 → $19,065.40), rolls the daily portfolio to 2026-07-06
(0 active lanes, activeBankroll $19,065.40), and passes the money-integrity + forensic + health gates.

## Regression protection
1. `app/src/lib/lifecycle-automation.test.mjs` — new test asserts `settle_soccer_day.sh` contains the
   `activate-daily-portfolio … --apply` roll-forward keyed to `date +%F`, AND that it appears **before**
   `verify-money-integrity.mjs` in the script (ordering is load-bearing).
2. `app/src/lib/money-integrity.test.mjs` already pins the `daily=canonical-bankroll` invariant (this is
   the check that caught the bug) — retained.

Together: the invariant stays enforced, and the orchestration step that keeps it satisfied can't be
silently removed or reordered.
