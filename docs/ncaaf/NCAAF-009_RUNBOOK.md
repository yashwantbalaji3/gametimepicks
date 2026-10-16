# NCAAF-009 — Local runbook and automation proposal (v1)

**Everything below runs locally by hand. No workflow, scheduler or deploy exists for NCAAF**, and creating one
is a founder/ops decision. Commands run from `app/` with the project Node 20.4.0 on PATH.

## Weekly cycle (manual)

| When (ET) | Command | Effect | Cost |
|---|---|---|---|
| Thu/Fri before the week's first kickoff | `node scripts/ncaaf/run-shadow-forecasts.mjs --season 2026 --week <W>` | write-once SHADOW receipts for every forecastable week-W game (≥ 10 min before kickoff) | ≤ 2W + 2 free ESPN requests |
| Optional: Saturday morning | same command | new receipts for the same games, listing predecessors. Latest pre-kickoff receipt becomes the forecast of record. Results from slates before the earliest target slate are included. | same |
| Sunday after the last final | `node scripts/ncaaf/grade-shadow.mjs --season 2026` | appends grades. PENDING stays pending; re-runs are NOOPs | ≤ 2 × weeks-with-receipts requests |
| After grading | commit `data/internal/research/ncaaf/{forecasts,grades}/` by explicit path | evidence trail | — |

**Failure behaviour.** Any HTTP error refuses the whole run, so a partial snapshot is never written. A provider
conflict in the snapshot refuses. Uncommitted forecasting code refuses. An existing receipt path refuses. A
kickoff < 10 minutes away is refused per game. None of these produces a partial or backdated record.

**Recovery.** A missed capture cannot be backfilled: a forecast made after kickoff is never of record. The
week simply has fewer receipts, and the run manifest shows what was refused and why.

## Automation proposal (for founder/ops, not applied)

- One scheduled job per week: capture Thu 12:00 ET and Sat 09:00 ET, grade Sun 12:00 ET. Free ESPN only, ~30
  requests per week. Commit with `scripts/ci/commit-generated.sh`, using `GENERATED_PATHS` limited to
  `data/internal/research/ncaaf/forecasts/` and `.../grades/`.
- Escalation through the shared `scripts/ops_alert.sh` (the `sport-owners.mjs` pattern). That needs an `ncaaf`
  entry in `SPORT_OWNERS`, which is a shared registry change.
- **No site rebuild per capture:** receipts live under `data/internal/`, outside `app/public/`, and nothing
  public reads them, so a capture commit needs no Vercel build. (COST-001: no needless builds.)
- Live factual tracking (009.4/009.5): not started. NCAAF would reuse the existing live gateway's ESPN
  scoreboard path. A pregame number must never be shown as a live probability.
