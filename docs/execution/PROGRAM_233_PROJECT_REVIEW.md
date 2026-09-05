# Program 233 — project review

Reviewed 2026-09-05, 11:05 → 12:0x ET. Entry `32b3ced4a`, resynced to `19678326f` (135 automated
commits across four unattended days, all bot). Findings are separated into **observed**, **verified
absent**, and **hypothesis**.

## Resync — what actually ran, 09-02 → 09-05

| item | evidence | verdict |
| --- | --- | --- |
| automation | 135 commits, 4 days, 100% `auto`/`auto-refresh`; 21 workflow runs today, all success | healthy |
| End Zone Vault incident | ledger 9 → 12 entries; runs 09-02/03/04 on commits carrying `f19027941` | **CLOSED on real receipts** |
| MLB | board 09-05 built 12:59Z, 15 games, 673 leans, `propsAvailable: true` | healthy |
| protected console | boundary verified (302→SSO, no-store, public 404); delivery **STALE 20d→24d** | external action pending |
| money | `affe6b21071f2b3be96bb2774eb347c3` unchanged | intact |

## Observed defects — repaired in Release A

1. **The offered window reported EPL owed work on days it published successfully.** The rule was
   `published: set.public && r.state === "READY"`, and the EPL producer has never emitted a bare
   `"READY"` — across all 87 committed rows its vocabulary is `CURRENT_PRE_EVENT` (58, all carrying
   probabilities) and `READY_EXCEPT_ODDS` (29, none). **Unsatisfiable.** Window went WORK_OWED / 7
   owed → COMPLETE / 0 owed.
2. **My own P232 detector cried wolf.** `RECEIPT_DAY_MISSING` fired on "date < today" with no
   deadline, reporting P1 at 15:05Z for a producer scheduled 15:30Z that lands near 18:40Z.
3. **EPL learning artifact stale** — 18 graded / 13 paired vs a ledger recount of 19 / 14.
4. **`ARTIFACT_READY` was silent** — every other non-ready simulate state explains itself.
5. **Seven guards failed because the product was right** (overnight 0-leg slate; MLB artifacts before
   their producer runs; an NFL Vault with no events in its 48h horizon). Fifth occurrence of the
   class; now owned by `lib/testing/day-in-flight.mjs`, which draws the line at the producer's
   **measured** deadline rather than its cron hour.

## Verified absent — the charter's new requirements

| requirement | evidence it is absent |
| --- | --- |
| **Filterable results journey** | `/results` built HTML contains **0 `<select>`, 0 `<input>`, 0 tabs**; no "record type", "filter", "date range", "market family" or "model version" anywhere in the rendered text. It is a static trust-centre page. |
| **Sport × risk results grid** | no such grid on any public route; the data exists (`parlays/lab-ledger.json` carries 5 streams × 4 tiers with W/L/P, staked, returned) and is not surfaced as a filterable view |
| **Fixed-frame simulation player** | Generate → auto-scroll → a long scrolling report. Verified in P232 by walking it: the scene terminates correctly at the report, but the report is a page, not a bounded stage |
| **Recording mode** | no ratio presets, no countdown, no chapter player, no safe margins — nothing in source |
| **Event/slip detail drawer** | no path from a headline percentage to its supporting rows |

## Capability matrix — observed, 2026-09-05

| sport | offered | forecast | published | products | settlement | results surface |
| --- | --- | --- | --- | --- | --- | --- |
| MLB | 15 priced | board 673 leans | mid-day: sims pending producer | Bank Builder, Homer Nukes, tier grid | official box score | record 19-14 |
| NFL | 15 not-yet-captured (season opens 09-09) | preseason model rejected out of sample | — | End Zone Vault (`NO_VAULT`, honest) | official TD result | separate |
| EPL | 8 in window | 7 published + 1 withheld | **now correctly classified** | EPL cards, tier grid | official FT | 19 graded / 14 paired |
| UFC | 14 bouts | 8 published, 6 refused | winner only | UFC cards | post-card capture | 16 graded |
| NBA | off-season | — | — | — | — | typed absence |

## What is good and should not be rebuilt

The homepage orientation (date chips, honest publishing banner, three primary actions, live status
strip), the per-sport honest refusals, the offered-window conservation model, the governed product
lifecycle, the calibration contradiction engine, the incident register, and the simulation scenes are
all working and evidence-backed. **The gap is not truthfulness — it is that the performance record
cannot be interrogated and the simulation cannot be watched.**
