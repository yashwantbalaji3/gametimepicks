# Program 134 — Aug 4 Autonomous-Day Proof, Signature-State Clarity, Coverage-Refresh Watchdog

**Session anchor: 2026-08-04 14:59 ET.** Baseline HEAD `c50b28fb` (matched the handoff anchor),
`origin/main` `9680568c` — **12 commits ahead, all bot-generated**, fast-forwarded. Working tree
dirty only under `vp/` (cowork-owned; untouched, never staged).

## Verdict: Aug 4 is `READY_CURRENT` and the day was fully autonomous

**No human or Claude intervention was required for the normal day.** The entire chain ran on its
own overnight and through the morning:

| ET | Run | Result |
|---|---|---|
| 03:59 | nightly-settle | Aug 3 settled · **research contract auto-committed** |
| 06:11 | nightly-settle | second pass, contract already current |
| 11:51 | morning-projections | Aug 4 board generated |
| 11:54 / 12:25 | mlb-daily-production | slate completed |
| 02:42 / 10:35 / 14:02 | auto-refresh | props refreshed |

## Phase 1 — Aug 3 settlement acceptance

| Check | Evidence |
|---|---|
| Settled once, against the published population | 190 ledger rows, all ids ⊆ the frozen board; `finalGamesSettled: 7` of 8 final |
| LAD @ CHC contributed zero | 0 rows; absent from every denominator |
| Patch population | **0** — no append-only patch was written |
| Decisive denominator | 71 W + 102 L = **173 decisive**, 17 Void excluded → 41.04% |
| Base immutability | guard green; board regenerated 16:48 ET, **before** the 18:40 first pitch; `capturedAt` preserved at 04:34Z (provenance fix holding in production) |
| Protected hashes / `vp/` | unchanged (full hashes below) |

### Second research-contract persistence proof — CONFIRMED BY CONTENT

Commit **`8ab89fd8`** ("auto: nightly settle 2026-08-04 03:59 ET") contains the actual paths, not
merely a log line claiming it:

```
app/public/data/research/daily-brief.json       | 57 +-
app/public/data/research/system-status.json     |  4 +-
app/public/data/research/terminal-summary.json  | 75 +-
```

Contract `asOfSettledDate` = `2026-08-03` = ledger newest settled. This is the **second
independent automated persistence** after `bbd2bdd9`, so contract persistence downgrades from
active defect to **monitored invariant**. (`76bee2bd` at 06:11 shows no research paths because
the contract was already current — correct, not a miss.)

### DEFECT FOUND AND REPAIRED — population did not reconcile

Aug 3 published **211** rows. The report said `settled: 190`, `unavailableCount: 6`. **15 rows
were accounted for nowhere.**

Root cause: three `continue` branches in `settle_mlb_results.py` dropped rows with no record —
`confidence == "insufficient_data"`, `lean in (None, "Pass", "No Play")`, and missing
line/projection. All 15 were `lean='Pass' / insufficient_data`: the model **correctly** declining
to take a side, and **correctly** excluded from the decisive denominator. The grading policy was
right; the accounting was silent.

**Reconciliation now closes exactly: 190 settled + 15 no-play + 6 unavailable = 211.**

Repair is status-reporting only — **no historical settlement outcome was altered**. The report
gains `publishedRows`, `noPlayCount`, `noPlay[]`, `unresolvedCount`, `reconciles`; the log line
gains `no_play`/`published`/`reconciles`, and a non-fatal `::warning::` fires when the identity
fails. Pinned by `test_population_reconciles_published_to_settled`.

## Phase 2 — Aug 4 chain reconciliation

| Stage | Owner | Date | Count | Status |
|---|---|---|---|---|
| Schedule | MLB StatsAPI | Aug 4 | **15 games** | ✅ |
| Base board | morning-projections 11:51 ET | Aug 4 | **678 rows / 15 covered (100%)** | ✅ |
| Market coverage | Odds API | Aug 4 | 15/15 — **no uncovered events** | ✅ |
| Player sims | pipeline | Aug 4 | 15 | ✅ |
| Full-game sims | pipeline | Aug 4 | 15 | ✅ |
| Predictions | exporter | Aug 4 | 15 | ✅ |
| Team markets / props | ingest | Aug 4 | 15 / 1,223 | ✅ |
| Research contract | nightly-settle | settled-through Aug 3 | agrees with ledger | ✅ |
| Deployment | canonical `gametime-picks` | — | `b95a0447` @ 18:06Z | ✅ |
| Observer | ops:public-beta-observe | Aug 4 | board 0d old, **678/678 natively stamped**, 5/5 alerts | ✅ |

Provenance: all 678 rows stamped `2026-08-04T15:47Z`; earliest first pitch `22:35Z` — **pregame
by ~6h48m**. Credits: `19,161 → 19,101`, **60 spent by the pipeline** (none by me).

Duplicate `gametimepicks` remains frozen at `2026-07-31T17:16:04Z`.

**Today is a full-coverage day**, so unlike Aug 3 there is no external no-market condition:
`READY_CURRENT`.

## Phase 4 — two improvements shipped

**User-facing — signature-product state derivation** (`app/src/lib/signature-state.mjs`).
Uses the repository's existing `product-status.ts` vocabulary rather than inventing one (guard
asserts every derived key exists there). States resolve in precedence order so a product can
never advertise a readiness later than its earliest unmet precondition:
date → freshness → markets → candidates → qualification → approval.
`ARCHIVED` can never render live; a prior-day artifact is `STALE`, never `ACTIVE` — the
file-existence trap that produced "SIMULATION READY" above "GENERATED PICKS 0". Approval is never
bypassed and no card is fabricated. 11 assertions incl. a stale-input failure and precedence.

**Reliability — coverage-refresh watchdog completion** (`scripts/cron_watchdog.sh`).
The missed-refresh branch shipped yesterday; what it lacked was observable machine-readable state.
It now emits `WATCHDOG_STATE=` with a closed taxonomy — `BOARD_MISSING`, `REFRESH_MISSING`,
`REFRESH_COMPLETE`, `NO_MARKET_EXTERNAL`, `ACTIVE_WRITER`, `RECOVERY_ALREADY_ATTEMPTED` —
distinguishing an external no-market truth from an automation gap, while the human decision line
stays first so existing `head -1` callers keep working. 21 assertions: all six states, retry
idempotency, duplicate suppression, closed-window refusal, malformed-input hardening, and a
**mutation proving the active-writer guard is load-bearing** (removing it produces a competing
DISPATCH; the real script still refuses), with the fixture removed on exit.

## Protected state — full hashes, before and after

| Artifact | sha256 (unchanged) | md5 |
|---|---|---|
| `mr-dub/portfolio.json` | `ea249d6616b5ee92656529a0b5dcf48645eb879ade3f38e7607e0deaf59e1c0d` | `affe6b21071f2b3be96bb2774eb347c3` |
| `mr-dub/bank-builder-locks.json` | `909ad63bfd5b12c006e66320e2a7779d14258fe5161ae4cf67e1286465a4745e` | `cb80473f88f3cb5f67208fa568925295` |

Semantic totals: **19–14**, bankroll **$19,065.40**, crown $20,465.40, voids 0, pending 0.
`vp/` untouched — modified only by its cowork owner, never staged or committed by this program.
