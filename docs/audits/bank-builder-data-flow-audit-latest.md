# Bank Builder Data-Flow Audit
_2026-06-10. How the Bank Builder paper bankroll is generated, settled, and displayed._

## What Bank Builder is
An **educational $100 → $3,000 paper-bankroll ladder** (5 doubling rungs; reset to $100 on
a loss). NOT a model, NOT a tip service, NO real money. The "Builder Pick" each slate is a
**presentation/filter over the published optimizer Suggested pool** — the pending official
slip priced nearest **+100** combined odds (2-leg preferred), via
`selectPlus100BuilderSlip` (`app/src/lib/parlay-suggested.ts`) over
`filterOfficialSuggestedSlips`.

## Where things live
- **Generation:** Builder Pick selected at render from the day's snapshot
  (`app/public/data/parlays/snapshots/<date>.json`). The selector is the single source of truth.
- **Settlement:** `nightly-settle` grades all suggested slips →
  `app/public/data/parlays/graded/<date>.json` (per-leg `result`/`finalStat`/`settlementSource`,
  slip `status` = win/loss/push). Matching is by `slipId`.
- **Display:** `/bank-builder` page.

## The gap found (now fixed)
The page **had no durable ladder history** — its own header said *"no ladder history is
persisted yet (§4.2)"* and it always rendered **Step 1 / $100**, so a settled Builder Pick
never moved the bankroll. June 9's win was invisible.

## The fix
- `app/src/lib/bank-builder-progression.ts` — PURE ladder math (win ×decimal, loss→base,
  push holds), unit-tested.
- `app/scripts/build-bank-builder-ledger.mjs` — reuses the site selector + ladder + pure
  math over settled history → `app/public/data/bank-builder/{ledger-latest,summary-latest,
  ledger-<date>}.json`. Idempotent; settled-only; no fabrication.
- `app/src/lib/data-bank-builder.ts` — fail-closed loader.
- `/bank-builder` page reads the persisted summary (real bankroll/step/record/streak +
  last settled pick + next-pick status).
- `nightly-settle` runs the ledger builder after grading + commits the artifacts.
