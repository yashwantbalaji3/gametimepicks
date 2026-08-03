# Program 117-122 Execution Log (2026-08-03, 12:20–13:00 ET)

Recovery: local `5fd79393` → origin `b6da641d`, fast-forwarded; further bot commits reconciled by
rebase throughout. Final: `ea31e8a0`. Duplicate Vercel project still frozen at 07-31T17:16Z.

## Resolved paths (recorded before editing)

| Responsibility | Exact path |
|---|---|
| MLB board generator | `pipeline/mlb/generate_mlb_board.py` (`run()`, event loop ~L560) |
| Odds provider client + cache | `pipeline/mlb/mlb_odds.py` (`fetch_event_odds`, `_cache_get`) |
| Event classifier / top-up | `app/scripts/mlb-topup-{decision,classify}.mjs`, `.github/workflows/mlb-afternoon-topup.yml` |
| Patch validator/materializer | `app/src/lib/mlb/board-patches.mjs` |
| Base immutability guard | `app/src/lib/mlb/base-immutability.test.mjs` |
| Settlement | `.github/workflows/nightly-settle.yml`, `pipeline/mlb/settle_mlb_results.py` |
| Test runner | `scripts/run_all_tests.sh` |

## Three findings, all shipped

**1. Restamped cache — provenance defect in the canonical generator (`95d05491`).**
Verifying the 12:04 ET board regeneration showed it spent **0 credits** (`"after": "cache"`) yet
moved `capturedAt` on all 211 rows from `04:34Z` → `16:03Z`. Identical rows, identical model
values, brand-new capture timestamp. Root cause: `fetch_event_odds` served cache hits with
synthetic headers that discarded `cached_at`, so the generator could not distinguish a cache hit
from a live read and stamped `capturedAt = now()` unconditionally. This is precisely the
restamped-cache condition the append-only patch validator refuses — happening in the canonical
generator. Fixed: cache hits carry `x-gtp-observed-at`; the generator stamps from it. No leakage
occurred (16:03Z < 22:40Z first pitch), but the field had stopped meaning what it claims.

**2. `pipeline/mlb/*_test.py` was never executed (`95d05491`).**
`run_all_tests.sh` only reached `pipeline.<name>_test`, so settlement grading, board identity,
settlement lineage, model and export suites sat on disk unrun — including the July-30
void-denominator regression, only ever exercised by hand. All now wired; seven suites green.

**3. Event-scoped generation — the Program 108-111 blocker (`ea31e8a0`).**
`--event` narrows the provider event list immediately after listing; the narrowed list flows
through the identical cost estimate, credit guards, fetch loop, stamping and row generation, so
equivalence is structural rather than a parallel code path. `--event` **requires** `--rows-out`
(CLI exit 2 otherwise), and a scoped run writes rows to a standalone artifact and never touches
the board — a frozen base cannot be overwritten by a scoped top-up. Unknown event ids are refused.

## Equivalence proof (§4.2)

Fixture-based by necessity: the local `ODDS_API_KEY` returns **401 by design** (paid ingests are
CI-only). A live cache-based run was attempted, failed auth at the event-listing call, and the
one public file it touched (`mlb/schedule/2026-08-03.json`) was restored **byte-identically**.

Proven: `UNION(scoped_i) == full` by whole-row equality (so projection/policy/timing/provenance
drift fails, not merely identity); scoped output cannot contain another event; unknown ids
refused; distinct null-`playerId` players stay distinct (the Program 108-111 regression);
production generator shape pinned.

## Correction issued

`AUG3_BASE_BOARD_IMMUTABILITY_MANIFEST.md` carried a stale hash and an overstated claim: my
10:20 "cutover" did not bind the scheduled pipeline, which legitimately regenerated the board at
12:04 while all games were pregame. The manifest now records both hashes and states plainly that
a document cannot freeze a writer — only code can. The identity-digest pin (the real invariant)
stayed green throughout, which is what proved the population untouched.

## State at close

Coverage unchanged: 7 `ALREADY_COMPLETE`, 1 `MARKETS_AVAILABLE_ADD_OFFICIAL_PATCH` (LAD @ CHC),
0 frozen. The 15:30 ET top-up has **not** fired and was **not** competed with. Credits: **0 spent
this program**. Protected money byte-exact; `vp/` untouched; base identity digest green.
