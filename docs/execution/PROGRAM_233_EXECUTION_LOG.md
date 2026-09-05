# Program 233 — execution log

Session 2026-09-05, 11:05 → 12:0x ET (15:05 → 16:0x UTC). Entry `32b3ced4a`, resynced to
`19678326f`, close **`de298affe`**. Money `md5 affe6b21071f2b3be96bb2774eb347c3` unchanged; both
pre-existing stashes and founder-owned `vp/` untouched; **no paid call, no gated action, nothing
deployed**.

## Phase 0 — resync

`343a75e36` ⊂ `32b3ced4a` ⊂ `origin/main`; the P232 gate tip and its log tip are the same lineage.
135 automated commits across four unattended days, 100% bot, 21 workflow runs today all green.

**The End Zone Vault incident CLOSES on real evidence.** `nfl-event-window` ran 09-02, 09-03 and
09-04 on commits carrying `f19027941` and wrote a dated ledger entry each time — 9 entries → 12. No
backfill; the acceptance P232 recorded was met by the scheduled runs.

## Release A — the offered window reported owed work on days it published

`published: Boolean(set.public) && r.state === "READY"`. The EPL producer has **never** emitted a
bare `"READY"`; across all 87 committed rows its vocabulary is `CURRENT_PRE_EVENT` (58, all carrying
probabilities) and `READY_EXCEPT_ODDS` (29, none). The condition was **unsatisfiable** — no EPL
fixture could be classified PUBLISHED, so the sport reported `WORK_OWED` with seven fixtures owed
against a public artifact carrying seven sets of win/draw/win probabilities.

The comment above it records the earlier defect it was fixing: the set-level flag alone made a
withheld match report as published. That correction was right about the problem and reached for a
**state name**, which is exactly what drifts when a producer renames its vocabulary. Publication is
not a label, so the rule now derives from the presence of the probabilities themselves — which
separates the two states on every committed row. **WORK_OWED / 7 owed → COMPLETE / 0 owed.**

Also repaired:

| finding | resolution |
| --- | --- |
| my P232 `RECEIPT_DAY_MISSING` fired at 15:05Z for a producer due 15:30Z that lands ~18:40Z | absent ≠ overdue: PENDING with a due time before the deadline, P1 after |
| EPL learning artifact said 18 graded / 13 paired; ledger recounted 19 / 14 | regenerated — the control plane was correctly refusing to build |
| `ARTIFACT_READY` carried no `stateReason` while every other non-ready state explains itself | given its sentence |
| **seven guards failed because the product was right** | one owner: `lib/testing/day-in-flight.mjs`, drawing the line at the producer's **measured** deadline (cron 14:15Z, observed landings 17:00–17:54Z) rather than its cron hour |
| an index asserted equality with a schedule captured after it was built | an index may lag its capture, never exceed it |

## Releases B + C — the record can now be asked a question

`/results` shipped with **zero** filter controls — verified in the built HTML, not assumed.

**B, the read model** projects the five existing ledgers and computes nothing. Its refusals are the
design: pooling across record types throws; pooling adds wins and losses rather than averaging rates
(and the guard fails if the two methods coincide on the fixture, because then it proves nothing); a
calibration record may carry no stake; a filter matching nothing returns nothing. **Zero decisive is
`unavailable`, never 0%.** Verified by hand against the live ledger: MLB's four tiers pool to 6-31,
that stream's own record.

**C, the journey** — record type × sport × risk tier, state in shareable URLs. UFC medium at n=1
reads `0.0% · 0-1 · 0.0%–79.3%`: honest about knowing almost nothing. Switching to model picks
removes the tier control, because that population has no tiers.

A real accessibility defect surfaced: wrapping each select in a `<label>` made its accessible name
the whole label text **including the option list**, so "Risk tier … per-sport totals" also answered
to "Sport". Two controls with one name is a screen-reader problem long before it is a test problem.

## Register

| Release | Commit | Rollback parent | State |
| --- | --- | --- | --- |
| A · live incidents | `2634d9d35` | `68f2f0333` | shipped |
| Review + plan | `57b2c9cd9` | `2634d9d35` | shipped |
| B+C · read model + results journey | `40b152a15` | `a9520050e` | shipped |
| Index/schedule reconciliation | `de298affe` | `40b152a15` | shipped |

## Suites at close

| gate | result |
| --- | --- |
| phase 1 · unit + contract | 651 files → pass |
| phase 2 · rendered guards | 71 files → pass |
| browser matrix · three engines | 472 passed · 0 failed |
| accessibility | 321 passed |
| results journey spec | 5/5 |

## Remaining partition

| class | rows | acceptance |
| --- | --- | --- |
| ENGINEERING | fixed-frame simulation player (D) · recording mode (E) · evaluation loop (F) · nav polish (G) | see PROGRAM_233_ACTION_PLAN.md |
| REALITY | `nfl-event-window` had not run today at 15:58Z (slots 14:30/15:00Z; ~3h drift is normal for it) | its next run |
| FOUNDER | NFL odds renewal · Moonshot disposition | exact tokens in the console packets |
| EXTERNAL | protected console redeploy — now **24 days** stale, boundary intact | `CONSOLE_REDEPLOY:RUN` |

**Classification: MATERIAL_PROGRESS.** Executable engineering rows remain (D–G).
