# v1.7 — EPL evidence repair (F2 = HOLD)

**Date:** 2026-09-22 · **Decision context:** founder packet `docs/V17_FOUNDER_DECISION_PACKET.md` §F2, option **Hold**.
**Scope:** the two evidence-capture defects (G1, G2) plus one the repair uncovered (G7). No status changed:
`epl` stays `EXPERIMENTAL_PUBLIC` in `app/src/lib/sport-capability-registry.ts`; no model status, no product
eligibility, no paid provider, no key. Raw history untouched; interpretation corrected.

## Before / after

| Count | Before (2026-09-22 00:00Z) | After |
|---|---|---|
| Graded rows in `app/public/data/soccer/epl/results/graded-forecasts.jsonl` | 36 | **46** |
| … under `epl-model-v1-split-poisson` (previous model) | 36 | 36 (unchanged, now a labelled prior bucket) |
| … under `epl-model-v2-elo-poisson` (P304, live) | 0 | **10** |
| P304 rows carrying the paired `control` block the forward protocol reads | 0 of 0 | **10 of 10** |
| P304 blind forward receipt `data/internal/research/epl/forward/receipt.json` | `ACCUMULATING`, n 0/60, `controlModelIds: []` | `ACCUMULATING`, **n 10/60**, control `epl-model-v1-split-poisson`, new LL 1.02769 vs previous 1.36769 (mean diff −0.34, no interval below minN) |
| P305-F totals shadow receipt `data/internal/research/epl/forward-totals/receipt.json` | n 0/60 | n 10/60, `ACCUMULATING` |
| Ungraded completed fixtures with a P304 forecast of record | 10 fixtures (23 forecast rows across the 09-17/18/19 files and snapshots) | **0** |
| `results/latest.json` | frozen at `2026-09-15T01:10:22Z`, 40 completed | `2026-09-22T14:47:34Z`, 50 completed (all 40 prior rows byte-equal on score/status; 10 new for 09-18 → 09-20) |
| `trackRecord` sentence on the public forecast set | "36 Premier League matches have been graded under this model …" (all 36 were the previous model's) | derived from the per-model split; regenerates on the next `epl-matchweek` build (not rebuilt here — the forecast set is not a graded/learning artifact) |

Figures for P304 at n = 10 are **not** evidence of anything and are reproduced only because the receipt prints them;
the protocol's bar is n ≥ 60 (`data/internal/research/epl/reports/epl-elo-poisson-forward-protocol.json`).

## G2 — results capture stalled 2026-09-15: root cause

**Runs (all `conclusion: success`, `.github/workflows/epl-settle.yml`, cron `0 23 * * *` firing ≈ 01:00Z):**

| Run | Created | Capture step printed |
|---|---|---|
| 34916132621 | 2026-09-15T01:09Z | `results/latest.json: state RESULTS, rows 40, completed 40` — **last good capture** |
| 35042672207 | 2026-09-16T01:05Z | `SOURCE_STALE: eng.1 scoreboard unavailable (no events array) — last-known-good artifact stands, nothing written` |
| 35169129136 · 35293568540 · 35411068768 · 35479291327 · 35548908691 · 35675723968 | 09-17 → 09-22 nightly | same line, every night |

`epl-matchweek.yml` (e.g. run 35660808920, 2026-09-21T22:05Z) printed the same `SOURCE_STALE` line followed by its
own `|| echo "no newly-settled EPL match — the honest state between matchweeks"`.

**The provider did not go down; it stopped honouring one query form.** `app/scripts/epl/capture-epl-results.mjs`
(old lines 27-30) built ONE request `…/eng.1/scoreboard?dates=<seasonStart>-<today>&limit=1000`. Probed
2026-09-22T14:40Z from this machine:

| Query form | Result |
|---|---|
| `dates=20260821-20260915` (the exact range that succeeded on 09-15) | **HTTP 400** `{"code":400,"message":"Failed to get events endpoint."}` |
| `dates=20260918-20260920`, with or without `limit` | HTTP 400 |
| `dates=20260919` (single day) | HTTP 200, 5 events |
| `dates=202609` (month) | HTTP 200, 30 events (09-04 → 09-20) |

So every range request has failed since the night of 09-16. The script treated the 400 body (no `events` array) as
`SOURCE_STALE` and — by its own design comment, "an outage must never look like an empty slate" — **exited 0**. The
`epl-settle` step ran under `set -euo pipefail`, so exit 0 was green; the graders then correctly reported
`NOTHING_NEW — 36 completed fixture(s) are already in the ledger and 4 were never forecast` against the frozen
artifact, and `classifyEmptyRun` had no way to know the capture had not happened. A green run that did no work.

**Fix (code + workflow):**
- `app/scripts/epl/capture-epl-results.mjs`: one request per **month** (`dates=YYYYMM`) from the season start to
  now, deduplicated by event id and filtered to `seasonStart ≤ date < end of today (UTC)` — the same window the range
  expressed, ten requests for a whole season. HTTP non-2xx / non-JSON / no `events` array ⇒ prints `SOURCE_STALE`,
  writes nothing, **exits 4** (`EXIT_SOURCE_STALE`). The artifact now records `source.requestForm` and
  `source.requests[]` (per-month event counts) so a future stall is visible in the file itself.
- `app/src/lib/soccer/epl-results-capture.mjs` (new): the pure month/window helpers, unit-tested in
  `epl-results-capture.test.mjs`, which also pins the script and both workflows.
- `.github/workflows/epl-settle.yml`: the capture step runs under `set -uo pipefail`, carries
  `RESULTS_CAPTURE=ok|stale|failed` (exit 0 / 4 / other) with a `::warning`, and the post-commit
  "Raise a grading refusal" step turns `stale`/`failed` into `::error` + `exit 1` — so the run goes **red** and the
  existing `Notify on failure` alerts, without ever costing the run its commit.
- `.github/workflows/epl-matchweek.yml`: the `|| echo "no newly-settled EPL match"` that relabelled a provider
  failure as a quiet matchweek is gone; the same status is carried and reported as a `::warning` notice after the
  commit. The red run stays with `epl-settle`, the owner of the nightly capture — this job fires up to eighteen
  times a matchweek and a red on each would be noise, not signal.

**Local recovery performed (deterministic, idempotent, official finals):** `capture-epl-results.mjs --now
2026-09-22T14:47:34Z` (free ESPN path the workflow uses) → `grade-epl-forecasts.mjs --write` (append-only, skips
already-graded ids, forecast of record = latest pre-kickoff revision) → `build-epl-forward-receipt.mjs` →
`build-epl-totals-shadow-receipt.mjs` → `report-epl-learning.mjs --write`. **Not run:** `accrete-epl-corpus.mjs`
(it feeds the model fit, not the evidence ledger — the next `epl-settle` run will accrete the 10 results;
`corpus.currentSeason` still reads 40) and the forecast builder (the public `trackRecord` regenerates on the next
matchweek build).

## G1 — the forecast builder counted the previous model's rows as P304's

`app/scripts/epl/build-epl-forecasts.mjs` (old 316-334) read `loadEplGradedRecord().team.matches` — the whole
ledger — into "N Premier League matches have been graded under this model". All 36 rows were
`modelId: epl-model-v1-split-poisson`; the live model was P304 with a forward n of 0.

**Fix:** `app/src/lib/soccer/epl-graded-by-model.mjs` (new, pure) splits the ledger by the `modelId` on each graded
row: `current` (the live model's rows only), `prior[]` (every other model, labelled), `unattributed`. Every figure is
`null` at n = 0 — never `0.0`. The builder now derives `trackRecord` from `eplTrackRecordSentence(split)` and ships
`gradedRecord: { modelId, gradedUnderThisModel, priorModels[], unattributed, ledgerTotal }` on both the private and
the public artifact so the count can be checked against the sentence. The sentence keeps the phrases
`public-route-inventory.test.mjs` pins ("no track record to cite" / "graded under this model") and adds, when a prior
record exists: "N matches were graded under the model this one replaced; that record is kept separately and is not
evidence for this model."

`app/src/lib/sports/epl/learning-report.mjs` + `scripts/epl/report-epl-learning.mjs`: the ledger-wide figures stay
(the freshness guard reads `sample.graded`) but are now labelled `sample.scope: "ALL_MODELS"`, and the report carries
`liveModel` (the newest forecast set's `matchModel.modelId`, falling back to the P304 id) and `byModel{}` buckets, each
with its own market comparison over its own paired rows. Today: v1 n 36 (30 paired), P304 n 10 (9 paired,
`SAMPLE_TOO_SMALL`).

Tests: `app/src/lib/soccer/epl-graded-by-model.test.mjs` — mixed versions separate; zero P304 rows ⇒ n 0 and null
figures; unattributed rows; the sentence; a LIVE split of the committed ledger; source pins on the builder and grader.

## G7 (found during the repair) — the forward protocol was unsatisfiable by its own producer

`app/src/lib/sports/epl/forward-receipt.mjs` counts only rows with `control.logLoss`. The lib grader
`grade-forecasts.mjs::buildGradedRows` wrote that block (and `grade-forecasts.test.mjs` proved it) — but the script
the workflows run, `app/scripts/epl/grade-epl-forecasts.mjs`, builds its rows inline and **never wrote `control` or
`shadowTotals`** (zero occurrences before this repair). Had G2 not stalled, the first P304 grades would have landed
without a control and been immutable: forward n = 0 forever, totals-shadow n = 0 forever.

**Fix:** the two blocks are extracted into exported helpers `scoreControlBlock(row, actual)` and
`scoreShadowTotalsBlock(row, actual, total)` in the lib; both graders spread them. Pinned by
`epl-graded-by-model.test.mjs` (source pin + LIVE check that every P304 row carries `control.modelId ===
epl-model-v1-split-poisson`) and by the updated pin in `totals-shadow.test.mjs`.

## Odds time-lock limitation (recorded, NOT fixed tonight — paid-credit path)

`app/public/data/soccer/epl/odds/latest.json` (captured 2026-09-19T22:35:26Z, 24 events, 2 credits):
- `rows[]` (what the forecasts and the lane consume): consensus across 11 US books, `matchResult` + `totalGoals`, **no
  `capturedAt` on any row, no bookmaker on any row** — only the file-level `capturedAt`.
- `shadowRows[]` (139, h2h only): `bookmaker` + `capturedAt`, but `capturedAt` is the run's `NOW` copied onto every
  row — a file-level instant with a per-row name, not the provider's per-market `last_update`.
- `odds/README.md:17-19` promises per-row `capturedAt`, a `book` and `MATCH_RESULT_1X2` only; the artifact ships none
  of the first two and does ship totals (packet G4).

The eligible-leg contract (`app/src/lib/products/eligible-leg/contract.mjs:101,161`) refuses a leg unless
`oddsForSide` carries all four of `american`, `bookmaker`, `capturedAt`, `receipt`, with `maxPriceAgeMs` 12 h
(`:81`); the EPL shadow run's own bound is 6 h. **A time-locked per-fixture capture would need:** (1) one named
bookmaker per leg (not a consensus median — a median of eleven books is not a price anyone posted); (2) the provider's
per-bookmaker/per-market `last_update` recorded as that row's `capturedAt`, asserted `< kickoffIso`; (3) the receipt
id on the row; (4) a capture instant per fixture close enough to kickoff to satisfy the 6 h/12 h bounds, i.e. the
lineup-time crons already in `epl-matchweek.yml` would have to write per-fixture snapshots rather than one file; and
(5) the README brought into line with what is shipped. Each capture costs receipt credits (102 of 500 used), so it is
a founder call, not an overnight change.

## Verification (2026-09-22)

| Suite | Result |
|---|---|
| `src/lib/soccer/epl-graded-by-model.test.mjs` (new) | 9/9 |
| `src/lib/soccer/epl-results-capture.test.mjs` (new) | 4/4 |
| `sports/epl/{grade-forecasts,totals-shadow,forward-receipt,learning-report,learning-report-freshness,graded-record,results-monotonicity,lane-status}.test.mjs`, `soccer/{epl-current-results,epl-results-hardening}.test.mjs` | all pass (see report) |
| `ops/{workflow-shell-syntax,workflow-script-cwd,push-failures-are-visible,shell-suites}.test.mjs`, `workflow-failure-visibility.test.mjs` | all pass |
| `npm run -s lint:scripts` | clean |
| `npx tsc --noEmit` | clean at 14:47Z on this lane's files; a later run showed 4 errors, all in Lane P2 files then being edited concurrently (`results-trust-center.ts:372`, `launch/page.tsx`, `moonshot/page.tsx`, `mr-dub/page.tsx`) — none touched by this repair |

## Still open

- `app/scripts/ops/build-model-health.mjs:61-69` (`epl_result` family) and `app/src/lib/command-center/model-status.ts:99-107`
  ("Live record") still read the whole ledger (now n 46 across two models) — labelled as the live record beside the
  P304 forward item. Not in this lane's ownership; the learning report's `byModel` is ready for them to read.
- Stale prose naming the old model: `sport-assessments.mjs:77`, `sport-capability-registry.ts:140-141` (packet G3),
  `app/src/app/epl/match/[slug]/page.tsx:59`, `simulate-lobby.tsx:449` ("no Premier League match has been graded under
  this model" hard-coded).
- Odds README vs artifact (G4), "3-day freshness" (G5), §29.3 (G6) — unchanged, as scoped.
- The public `trackRecord`/`gradedRecord` regenerate on the next `epl-matchweek` run (Thursday 21:00Z cron); until
  then the deployed sentence still reads "36 … graded under this model".
- `epl-settle` will go red on the next night ESPN cannot be read. That is the intended behaviour; the alert names the
  provider query form.
