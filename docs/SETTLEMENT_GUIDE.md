# Settlement Guide (Operator)

This doc walks through how to settle a completed slate so its results appear on the public `/results` page. **This is operator-facing documentation only — public users never see file paths or terminal commands.**

## What "settle" means

For each lean the model published, settlement looks at the final box score and labels the lean as:

- **win** — the actual stat beat the line in the model's predicted direction (Over/Under)
- **loss** — the actual stat went the other way
- **push** — the actual stat exactly matched the line
- **stats_unavailable** — we couldn't verify the stat (used as soft skip; doesn't count as win/loss)

Settled leans are written to `pipeline/validation/settled_leans.jsonl`. The export step then aggregates them into `app/public/data/results/lifetime_summary.json` and per-date result files that the `/results` page reads.

## Quickest path: settle a single date

```bash
# 1. Generate a fresh template from the slate's board
python -m pipeline.settle_template --date 2026-05-05

# 2. Open the template, fill in PTS / REB / AST for each player from
#    NBA.com (or basketball-reference.com) box scores.
#    Leave stats null only when you genuinely can't verify them.
#    File: pipeline/overrides/results_overrides.json

# 3. Run settlement (manual-only because we trust the verified stats)
python -m pipeline.settle_results --date 2026-05-05 --manual-only

# 4. Export the aggregated results so the /results page can read them
python -m pipeline.export_results

# 5. Verify the smoke test passes
bash scripts/smoke_test.sh

# 6. Commit and push
git add app/public/data/results/ pipeline/validation/
git commit -m "Settle slate 2026-05-05"
git push
```

After Vercel redeploys, `/results` should show the settled-day breakdown and `lifetime_summary.json` will have updated win/loss/push counts.

## When stats aren't available

Use `null` in the template — settlement will mark those rows as `stats_unavailable` and exclude them from win-rate calculations. **Never guess.** The site's credibility depends on every "win" being verifiable.

## When the slate hasn't been generated yet

`settle_template` reads from `app/public/data/boards/<date>.json`. If that file doesn't exist, settle the date once it does — there's nothing to settle until the model has actually published leans.

## Re-settling after a correction

Settlement is **idempotent** for a given date. Re-running `pipeline.settle_results --date <X>` rewrites `<X>`'s rows in `settled_leans.jsonl`; other dates are preserved. So if you discover a typo or NBA.com revised a stat, just fix the override file and re-run steps 3–4.

## Troubleshooting

**"No board file at .../boards/2026-05-05.json"** — the slate wasn't generated for that date. Either you have the wrong date, or the pipeline never ran for it.

**Template overwrite warning** — `settle_template` won't clobber an existing template that already targets the same date. Use `--force` only after you've copied off any operator work.

**Some leans don't settle** — check the player name spelling in the override matches the lean's player name. Settlement matches by playerId first, then by normalized name. The template auto-fills both.

**`/results` still shows empty after settle** — did you run `pipeline.export_results`? Settlement only writes to `pipeline/validation/`; the public-facing `/results` data is at `app/public/data/results/`.

## What this script CAN'T do

- It can't fabricate stats. You must enter real numbers from a verifiable source.
- It can't undo past settlements (other than re-running with corrected stats — there's no rollback).
- It can't call the NBA API automatically. The auto-settlement path via nba_api works *only if the date is recent enough that nba_api still has the box score* AND the gameId in the lean matches an nba_api gameId. Manual mode (this guide) is more reliable.

## Sources for verifying stats

- **NBA.com box scores** — most authoritative. Player → Game Log → click the date.
- **basketball-reference.com** — easier UI for finding historical games. Cross-check against NBA.com if anything feels off.
- **ESPN** — fine for cross-referencing, but use NBA.com or BR as the primary source.

Never use sportsbook stat tickers as the source of truth — they sometimes round or display props differently than the official line scoring.
