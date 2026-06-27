# GameTimePicks — Recovery Runbook

How to detect, contain, and recover from a corrupted state. The canonical money lives in git, so every bad
state is reversible. **Never** hand-edit money files to "fix" a number — restore from a known-good commit
and re-run the official pipeline.

---

## Known-good anchors

Each fully-verified state is tagged `known-good-<date>` (lightweight git tag). To list them:
```bash
git tag -l 'known-good-*' --sort=-creatordate
```
A known-good tag means: all 3 money gates green, 1486+ tests green, tsc clean, build clean, money reconciled.

## Detecting a bad state (do this first)

```bash
cd app
npx tsx scripts/verify-money-integrity.mjs     # invariant violations
npx tsx scripts/forensic-money-audit.mjs        # full $100→bankroll reconciliation
npx tsx scripts/health-check.mjs --today "$(TZ=America/New_York date +%F)"   # files + drift + slate integrity
node scripts/check-heartbeat.mjs --max-hours 26  # did the lifecycle stop running?
```
Any non-zero exit = a problem. The error text names the exact failing invariant (e.g. `daily=canonical-bankroll`,
`active-no-legs`, `reconcile:crown`).

## Recovery decision tree

1. **A bad value is on disk but NOT yet committed** → `git checkout -- app/public/data/mr-dub/` (and any other
   touched dir) to discard. Re-run the gates.
2. **A bad commit was pushed to `automation-health-gate` (not main, not deployed)** → identify the last green
   commit (`git log --oneline` / the newest `known-good-*` tag) and restore just the money files from it:
   ```bash
   git checkout <good-sha> -- app/public/data/mr-dub/ app/public/data/methodology/launch/dual-bank-builder-active.json
   ( cd app && npx tsx scripts/build-master-ledger.mjs --date "$(TZ=America/New_York date +%F)" )
   # re-run all 3 gates; commit the restore with a clear message
   ```
3. **A settlement applied a wrong result** → settlement is replayable + idempotent. Restore the money +
   ladder files from the last good commit (step 2), then re-run settlement with the OFFICIAL bundle:
   ```bash
   OFFICIAL=/path/to/verified-bundle.json bash scripts/settle_soccer_day.sh --date <DATE> --apply
   ```
   The seed model skips already-settled rungs, so a clean re-run reproduces the correct state.
4. **A bad deploy reached production** (only if someone published) → Vercel keeps every deployment; promote the
   last good one in the Vercel dashboard (instant), then fix `main` with `git revert <bad-sha>` and re-push.
   There is no automated production rollback — this is a manual, deliberate step.

## Hard rules

- **Never** edit `portfolio.json` / `banked-ladders.json` / `ledger.json` / the ladder by hand to change a
  money value. Restore from git + re-run the official pipeline. The gates will reject a hand-faked value.
- **Crown is immutable** — it only grows via official completed-ladder banking. If crown changed unexpectedly,
  that is corruption: restore from the last known-good.
- After ANY recovery: all 3 gates must be green before committing. Commit with a message starting `RECOVERY:`.

## Money invariants (what "correct" means)

- `bankroll = crown − Σ dual-lane lost seeds` (currently `$20,465.40 − $500 = $19,965.40`).
- `settledProfit = bankroll − $100` initial seed.
- `Σ ledger paperProfit = settledProfit`.
- `crown = Σ banked completed-ladder finals` (immutable).
- `daily-summary` last-day closing `= currentBankroll`; the day chain is continuous.
- `drawdown = crown − bankroll`.
