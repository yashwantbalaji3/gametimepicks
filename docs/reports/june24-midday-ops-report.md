# June 24 Midday Operations Report

_Money verified unchanged: bankroll $10,176.17 · crown $10,376.17 · record 10-2 · exposure 0 · pending 0._

## Phase 1 — Product status (consolidated)
| Product | Status | Detail |
|---|---|---|
| Homer Nukes | 🟢 LIVE | June 24, 5 legs, real headshots/opponents/odds |
| Player/Pitcher Props | 🟢 LIVE | June 24, 243 rows |
| Featured Plays | 🟢 LIVE | June 24 |
| Game Explorer | 🟢 LIVE | June 24 |
| Bank Builder | 🟡 ENGINE READY | June 24 board shipped (#588) → engine qualifies (628 legs). **Promotion blocked — see Phase 4.** |
| Moonshot | 🔴 STALE | stopped June 19; needs board + generator run |
| WC Specials | 🟡 June 23 settled | June 24 needs WC projection+odds pipeline |
| WC Parlays | 🟡 | June 23 had a 1-leg `double_chance` card with a malformed leg (no fixture/odds); stale (not on current slate). Generator-side fix is in the WC pipeline. |
| Daily Portfolio | 🟡 June 23 | depends on BB/Moonshot/WC June 24 |
| Results/Tracking | 🟢 OPERATIONAL | registry + performance + ledgers |

## Phase 4 — Can June 24 Bank Builder launch today? **Definitive answer: NOT as a new run.**
The active run `dual-bank-builder-2026-06-17` is a **persistent multi-day ladder, currently awaiting its
next cards** (Lane A → Step 4 from $1,464.71→$3,500; Lane B → Step 2 from $277.11→$700). Prior steps are
settled. To advance June 24 BB the system must **place the next card on this active ladder** (continuing it),
NOT start a new run. Last run's `--write-bank-builder` started a new run that overwrote the active pointer →
**broke 32 money-invariant tests** ("active cards untouched"). Per the rules ("never override active
ladders/runs", "never bypass tests"), that path is rejected.
**Blocker:** there is no safe, tested "place next card on the active ladder" pipeline path — only the
new-run path exists. Building + testing that continuation (correct rung math, money invariants preserved,
its own tests updated) is the remaining work. The engine inputs (board + qualifying legs) are ready.

## Phase 11 — Data quality (settlement name-matching) — HARDENED
Added explicit tests for the exact real-world collisions: API-Football abbreviations + accents
(Ronaldo/Kane/Fernandes/Perišić exact + "B."/"H."/"M." abbreviated), and the **ambiguity guard** — two
same-surname+initial players in one match return `null` (never grade the wrong one). `findPlayerLine`
already handled these; now they're locked by tests.

## Phase 15 — Release readiness (A–F)
| System | Grade | Note |
|---|:--:|---|
| Homer Nukes | A | live, real data |
| Player/Pitcher Props | A− | live, filterable |
| Bank Builder | B | engine fixed; live promotion gated on ladder-continuation path |
| Settlement | A | unified soccer engine + official fetch + name-matching hardened |
| Tracking | B+ | registry/performance/ledgers operational; on-page ROI not wired |
| WC Specials/Parlays | C | June 23 settled; June 24 pipeline-gated; parlay empty-leg bug |
| Moonshot | D | stale |
| Daily Portfolio | C | depends on above |
| Mobile | A− | 375–1440 overflow-clean |
| Data quality | A− | name-matching tested |

## Phase 16 — Ship
- **Fixed/added this run:** Phase 4 definitive blocker analysis; settlement name-matching tests (8/8).
- **Remaining blockers (evidence-based):** BB ladder-continuation path; WC/Moonshot projection pipeline;
  WC parlay generator empty-leg validation.
- **Money:** unchanged · tsc clean · tests green · build clean.

## Recommended next sprint
1. Build the tested "place next card on the active dual-BB ladder" path (unblocks live June 24 BB).
2. Run WC June 24 projection+odds pipeline (unblocks WC Specials/Parlays/Moonshot/daily portfolio).
3. Add WC-parlay leg validation (drop sub-2-leg / fixture-less cards) at the generator.
4. Wire the shared Results page for on-page per-product ROI.
