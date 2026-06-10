# UFC Card Operations Runbook

_Last updated: 2026-06-09._ Repeatable MLB/NBA-style lifecycle so official validated
picks unlock automatically. Public **beta** moneyline already ships; this loop
accumulates the clean data that flips the **official** gates.

## Before each real card (PRE-CARD)
```bash
gh workflow run ufc-pre-card.yml -f max_events=20
```
Does: ESPN schedule → The Odds API h2h odds **+ immutable pregame snapshot** →
fighter stats → card-only features → internal model → suggested parlays → **beta
artifacts** → readiness → ops-status → commit derived UFC artifacts (no raw CSV).
- Run it **after the card is announced and lines are posted**, ideally within ~24h of the card so the pregame snapshot is close to fight-time.
- Re-run any time lines move; each run overwrites `*-latest` and appends a snapshot.

## After each real card (POST-CARD)
```bash
gh workflow run ufc-post-card.yml
```
Does: results refresh → grade moneylines → rebuild backtest dataset → calibration →
readiness → ops-status → commit. **This is what increases the clean graded row count.**
- Run it once results are final (usually the morning after the card).

## What to check in GitHub Actions
- Both jobs **green**; the "Summary" step prints matched/scheduled fights + ops stage.
- Pre-card commit touches only `app/public/data/ufc/**` (never MLB/NBA/picks).
- Post-card: `cleanGradedRows` in `ops-status-latest.json` went **up**.

## Artifacts that should change
| Step | Artifact |
|---|---|
| pre-card | `schedule-latest`, `odds-latest`, `odds-snapshots/`, `features-card-latest`, `projections-internal-card-latest`, `beta-projections-latest`, `beta-suggested-parlays-latest`, `readiness-latest`, `ops-status-latest` |
| post-card | `results-latest`, `graded-*`, `backtest-*`, calibration summary, `readiness-latest`, `ops-status-latest` |

## Verify pregame snapshot quality
- A new file under `app/public/data/ufc/odds-snapshots/` with `generatedAt` **before** every bout's `commenceTime` (features blocks post-commence odds).
- `features-card-latest.json` → `blockedCount` low, `matchedFightCount == scheduledFightCount` ideally.

## Verify graded rows increased
```bash
python3 -c "import json;print(json.load(open('app/public/data/ufc/ops-status-latest.json'))['cleanGradedRows'])"
```
Compare before/after post-card. Target for public moneyline: **150**.

## Troubleshooting
- **Schedule/odds mismatch:** check `features-card-latest.json` `unmatchedScheduledFights`; usually a name variant — the deterministic matcher is suffix-tolerant but blocks ambiguous names (correct, fail-closed).
- **Futures/hypotheticals:** features drops bouts not on the ESPN card and flags fighters appearing in multiple same-time bouts (`isFutures`). Beta excludes them.
- **Re-run prop discovery:** `gh workflow run ufc-prop-discovery.yml` then `python -m pipeline.ufc.build_prop_odds --write-status` (still h2h-only today → stays unavailable).

## When official moneyline unlocks
Automatically when `backtestReady=true` → **≥150 clean graded fights** + acceptable
calibration (Brier vs market, model not worse than market, max adjustment ≤4pp, zero
leakage). `projectionsReady` follows; `parlaySimReady` then unlocks official parlays.
No code change needed — the page reads the gates.

## Rollback
- Bad beta/projection artifact: `git revert` the auto-commit, or delete the artifact →
  readiness/ops-status recompute fail-closed and the page falls back to the locked state.
- Emergency: set the relevant gate false in `build_readiness` CURRENT_GATES → everything re-locks.
