# Operator Onboarding — the current loop (Program 204)

One page for a new operator (hi, Dhruv). Everything here names commands and receipts you can run
and read today; nothing here contains a credential, and no step asks you to type one into a doc.
The loop is **Observe → Verify → Build → Release → Close**, and most of it runs itself.

## What runs by itself (the cadence)

| Window (UTC) | Workflow | What it owns | Receipt to read |
|---|---|---|---|
| ~08:12 | `nightly-settle` | THE one settlement writer: MLB game/prop grading, lab-card settlement, ledger rebuild, money gates | `app/public/data/parlays/lab-settled/<date>.json`, prediction ledger |
| ~13:40 | `sport-schedules` | four-sport schedule capture + cadence receipt (quiet-run vs dead-lane) | `schedule-cadence.json` |
| ~15:30 | `daily-products` | MLB board/props/predictions, ladders, lab ledger, risk-coverage matrix, daily receipt | `app/public/data/parlays/coverage-matrix.json` |
| 21:00 Thu–Sun | `epl-matchweek` | EPL results capture, forecast grading, next-matchday forecasts/ladder | `soccer/epl/results/latest.json`, graded ledgers |
| fight week daily | `ufc-fight-week` | card capture, lineage classifier, ladder; post-card job settles in the same workflow | `ufc/card-latest.json`, lineage ledger |
| on capture | `nfl-odds-capture` | authorized odds capture + NFL ladder (receipt-gated, ledger-accounted) | `nfl/markets/latest.json`, credit ledger |

**A green workflow without its artifact is a contradiction** — always read the receipt, not the
checkmark. Crons drift 1–1.5h; wait, don't re-dispatch.

## Observe (start here every day)

- Protected console: **/launch** (gtp-ops deployment; authenticated; never in the public export).
  The top shows environment, deployed commit, incidents, today's states and the top actions.
  The operating-record card shows the current record's checksums (html + verified pdf).
- Public truth: `/today`, `/results`, `/build` — these render the same owners the console reads.

## Verify (before you trust or change anything)

```bash
cd app
npm test            # canonical suite — read the "# fail" FOOTER, never the exit code alone
npx tsc --noEmit
npm run build       # public export; internal build: NEXT_PUBLIC_INTERNAL_ROUTES=1 npm run build
```

Focused integrity builders (run with a pinned `--now` ISO stamp):
`scripts/audits/build-route-inventory.mjs --out out` · `build-product-truth.mjs` ·
`scripts/ops/build-closure-packets.mjs` · `scripts/parlays/build-risk-coverage.mjs` ·
`scripts/audits/build-signature-product-audit.mjs` ·
`scripts/ops/build-operating-record.mjs` then `verify-operating-record-pdf.mjs` (verifies the
actual PDF bytes and writes the checksum receipt /launch renders).

## Build → Release (when you change code)

1. Small, coherent, rollbackable releases; guards restated **never weakened**.
2. Gate to a FILE and read the fail count — never `command | grep` (that chain has shipped a red
   suite twice).
3. Commit subject convention `P<program> R-<x>: …` — the register conservation guard derives the
   release register from these; each release registers its predecessor's row in
   `src/lib/launch/release-history.mjs` (the newest convention commit may be unregistered).
4. `git pull --rebase --autostash` before push (bot commits ride main); never blind-stash.
5. Production converges by ANCESTRY: `git merge-base --is-ancestor <tip> <deployed-sha>` against
   `/data/build-info.json` — a newer bot commit serving is normal; a missing deploy is not.

## Money, providers, and decisions (who owns what)

- **Protected money** (`mr-dub/portfolio.json`, banked ladders): changes ONLY through
  `nightly-settle`. Canonical md5 is pinned in guards; verify before/after any session.
- **Paid providers**: The Odds API (`ODDS_API_KEY` env var — the NAME, never the value here) under
  three committed receipts (NFL / UFC / EPL) with cumulative ceilings and per-request ledgers in
  `data/internal/research/odds/*/`. Dry-run first; stop on quota/schema drift. Free sources (MLB
  StatsAPI, ESPN) still get rate discipline.
- **Founder-owned decisions** live in the Founder Reply Box on /launch (closed token sets): NFL
  actives rights, NBA markets/model/calibration/publication, analytics enablement. Engineering
  never resolves these by implementation.

## When something is wrong

- Distinguish states: NO_PLAY / OFF_SEASON are answers; SOURCE_STALE preserves last-known-good;
  INCIDENT means an owner broke. Missing evidence is UNKNOWN or a named quarantine — never zero.
- Fix the canonical owner, never the page where the symptom appeared; backfill only from
  contemporaneous pre-event evidence; corrections append.
- Recovery paths: `docs/RECOVERY_RUNBOOK.md`; per-sport event-day runbooks sit beside it. The
  runbook registry (`src/lib/launch/runbook-registry.mjs`) maps all of them by sport × stage.

> The old manual loop in `docs/DAILY_OPS.md` (settle_soccer_day / refresh_daily_products) is the
> retired June-era process, kept for history — the cadence above replaced it.
