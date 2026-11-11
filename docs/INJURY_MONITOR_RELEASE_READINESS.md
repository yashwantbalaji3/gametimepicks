# Injury monitor Phase 1 + forecast version chain — release readiness

Branch `claude/injury-monitor-release`, cut from main `b7d46a61d1` (after #1323). It is PR-ready, but the PR is **not
opened**: it opens when the CI freeze lifts, after #1326 merges. Nothing in this branch changes a public page, a
forecast, a grade or a social post on merge.

## Contents
| Part | Files |
|---|---|
| Stale flags: rule, append-only file, recovery clears, social contract, send-time recheck, monitor health | `app/src/lib/availability/stale-flags.mjs` and its test (12) |
| Monitor writer, alerting through `scripts/ops_alert.sh` (PHASE=injury-monitor) | `app/scripts/availability/build-stale-flags.mjs` |
| Version chain: v1 by back-reference, current, version of record, coalescing, guarded append | `app/src/lib/availability/forecast-versions.mjs` and its test (8) |
| Fixtures: the frozen 2026-11-11 lane and the seven NBA captures, trimmed to status facts | `app/src/lib/availability/__fixtures__/stale-flags-2026-11-11/` |
| Evidence script: material-event history over committed lanes | `scripts/research/nba/material-event-history.mjs` |
| Design notes | `docs/INJURY_MONITOR_STALE_FLAGS_PHASE1.md`, `docs/FORECAST_VERSIONING_DESIGN.md`, this file |

## What is inert on merge (why nothing public changes)
- **Nothing runs the writer on a schedule.** No workflow, launchd job or build phase invokes `build-stale-flags.mjs`.
  No `app/public/data/<sport>/stale-flags/` or `forecast-versions/` file exists or is created by the build.
- **Nothing reads the modules.** No page, component, route or build script imports `lib/availability/stale-flags.mjs`
  or `forecast-versions.mjs`. The only importers are their tests, the writer and the evidence script.
- **The grading rule is unchanged.** The frozen forecast stays the version of record. `versionOfRecord` exists but
  nothing grades through it.
- **Flag-OFF build check:** see "Verification" below for the out/ comparison against main.

## Founder approvals needed (each separate; none is implied by merging)
1. **Install the 5-minute injury poller** (launchd).
   - Proposal: `~/gtp-evidence/proposals/injury-poller/` (`com.gametimepicks.injury-poller.plist`, StartInterval 300;
     `run-injury-poll.mjs`).
   - Active only from 4 hours before the first start to the last start.
   - Free ESPN feed, 0 credits, no key.
   - It does **no commit, push or build**. The console's send-time recheck reads the local capture.
   - It is the only way to meet the latency target (median ≤ 10, p95 ≤ 20 min). Today's capture cadence gives median
     23.4 and p95 44.4.
2. **Set `OPS_WEBHOOK_URL`** where the poller and monitor run (the poller's launchd environment; optionally the CI
   secret).
   - Without it, `ops_alert.sh` logs locally and exits 0, so failure alerts (`CAPTURE_STALE`, `CAPTURE_MISSING`,
     `CAPTURE_MALFORMED`, `FLAGS_MALFORMED`) reach no one.
   - The founder owns the secret value; the engine never sees it.
3. **The grading-rule switch stays OUT of this release.**
   - Grading the version of record at start − 15 min instead of the frozen forecast is a separate, release-gated
     founder decision (design §7).
   - Until it is approved, v1 (the frozen forecast) remains the version of record, and superseded-version grading does
     not exist.

**Already sourced; confirm only if the founder wants to restate them.** None of these feeds a displayed number:
- NBA material ≥ 20 projected minutes, and Top-5 per stat family (founder directive 2026-11-11).
- NFL starting QB, top 2 rushers and top 3 receivers (same directive).
- The send-time capture age limit of 30 minutes, and the protection window of 4 hours (Phase 1 note).
- The version cutoff of start − 15 min and the coalescing window of 15 min (design §5 and §6, from the committed
  material-event history).

## Not in this release (each a later, separately gated step)
- A scheduled chain writer (re-run and approval automation) and its validated re-run paths for NBA and NFL.
- Page wiring: the stale-flag note and the version history view (Phase 2).
- Console integration: bb-social calls `postAllowed`, `evaluatePostAtSend` and `currentVersion`. The console is owned
  by bb-social and is not touched here.
- Publishing stale-flags files from the poller (Phase 2; commits batched so quiet polls cause no builds).

## Release mechanics
- One PR, one build on merge.
- No `Release` in the subject.
- No bracketed skip-ci marker anywhere in the head commit.
- Run the release gate (`~/gtp-evidence/bin/release_gate.sh`) on the PR head.

## Verification (2026-11-11, under the heavy lock)
| Check | Result |
|---|---|
| tsc | clean |
| Unit suite | 11,743 tests: 11,739 passed, 0 failed, 4 skipped |
| Flag-OFF build, branch and main (same absolute path, no GTP_* env) | both exit 0 |
| Post-build suite (branch) | 820 passed, 0 failed |
| out/ comparison | identical file list outside `_next` (8,508 files); `_next` file sets equal after normalizing hashes (155 vs 155) |

Every content difference examined was a build-instant field, so treat the comparison as a sample, not a full
normalized pass:
- the build id and chunk hashes;
- the commit sha and message;
- `builtAt`, `asOf` and `generatedAt`;
- `serverNowMs`, and the displayed "Nov 11, 3:49/3:57 PM EST" stamp.

## Poller — superseded by the terms re-evaluation
See `~/gtp-evidence/injury-poller-reevaluation-2026-11-11.md`. ESPN is covered by the Disney Terms of Use, which
prohibit automated access and commercial use (§2(B)(x), §2(B)(viii), §3(H)). That applies to the existing ESPN captures
as well. Approval 1 above is therefore **blocked on a founder or legal decision about the source**, not just on
installation.
