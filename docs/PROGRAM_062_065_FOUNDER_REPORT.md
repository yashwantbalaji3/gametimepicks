# Program 062–065 — Founder Report

**Date:** 2026-07-30 · **Operator:** Claude (autonomous session)
**Companion:** `PROGRAM_062_065_EXECUTION_LOG.md` (baselines, lane ledger, exact validation totals).
**Nature of this program:** implementation follow-through, not strategy. Every lane below shipped code or a decision artifact, not a design memo.

---

## 1. Reconciliation

`origin/main` was at the expected `9d0b853c`, and **production was serving exactly that commit** (`npm run verify:deployment`, built 0.4h before check). All six public routes returned 200, and the deployed HTML carried the Program 058 surfaces — benchmark strip present, "Largest simulated probabilities" live, no stale prediction-first or "profit-locking" copy. No bot drift appeared during the session.

**SHAs:** start `9d0b853c` → lanes `c7069c7e` (B), `043f63c8` (A), `46fb6325` (G), `5934b40d` (D), `28e6c91d` (E), `6462591f` (C) → docs/integration end SHA in the log.

## 2. Validation

**JS 3,572 tests / 0 fail** (+200 this program) · typecheck clean · build exit 0 · health 18/18 · **Python 214 passed** across MLB/UFC/NBA + 85 settlement assertions. Money and lock hashes exact before and after; `vp/` untouched.

Two defects surfaced: one **ours and fixed** (an NBA lineage test that passed alone and failed beside the MLB suite, because that suite's `importlib.reload()` rebinds the exception class in the shared module namespace — resolved by looking the class up at assert time); one **pre-existing and not ours** (`balldontlie_provider_test.py`, 2 deterministic failures reproduced at pristine HEAD with every program change stashed). The second is reported, not absorbed.

## 3. Per-row lineage — the Program 058 limitation is closed (Lane B)

The official settled ledger is **untouched**. A deterministic exporter joins board rows → ledger rows → pregame archive → quarantine artifacts → the public research contract, emitting versioned lineage envelopes: eventId derived through the existing identity contract, provider refs *with the resolution method recorded*, capturedAt/eventStart **only where an artifact actually has them**, pregame eligibility verdict, settlement source, lineage verdict + gate version, calibration version, market registry status.

**Coverage states (six).** The specified five plus **`CONFLICTED`** — sources disagree about which event a row is — kept deliberately distinct from `QUARANTINED`, because "we refused this slate" and "two sources disagree" need different fixes, and merging them is precisely how a quarantined slate re-enters a rate.

**Honest coverage today:** `PROVEN_STAMPED` is **0** and currently unreachable, because no MLB board stamps its rows. The exporter explicitly refuses to substitute the board's file-level `generatedAt` — that substitution *is* the unsafe backfill the guard exists to stop. The state is defined and tested so nothing changes the day boards start stamping. On 2026-07-27, **177 of 557 rows** have a pregame capture record and are individually listed; the rest are aggregate-only and say so on the page.

**Artifact split:** the public per-date file carries only row-level-claimable rows, but its `coverage` block counts the whole slate — so exclusions stay provable rather than vanishing. The complete set lives internal (`public:false`).

## 4. What changed for users (Lanes B + F)

`/markets` now carries the **full Market Disagreement Explorer**: per row the sportsbook no-vig price, raw simulation, calibrated simulation, the difference and direction, what actually happened, and how similarly-disagreeing rows have performed historically — with denominator, window and 95% interval on every figure. Default order is **event time**; the largest-difference sort carries the finding that large positive differences performed *worse*. Quarantined, unavailable and zero-denominator groups show **no rate at all**. Total-bases rows remain visible and are labeled: *"Predictions are switched off for this market… History stays visible; the row is never placed in a difference-ordered list."*

Release QA at 375×812: no horizontal overflow, exactly one H1 per route, sort and row controls are real accessible buttons, built-HTML free of banned language.

## 5. Analytics — implemented, still dark (Lane C)

A deterministic aggregator over validated v2 events produces reach, activation, research depth, trust loop, coarse retention cohorts, sport demand and data quality, rendered on the internal `/ops` panel with minimum-window warnings. **`NOT_YET_MEASURED` is a distinct state from a measured zero** — proven by a child-process mutation that breaks the zero-denominator rule and watches a fabricated 0% appear.

Instrumentation was audited rather than inflated: the trust-loop reading routes were wired because their page view *is* the control; the home-CTA and results→today builders ship but their call sites sit in components another lane owned; the remainder stay schema-only **with a recorded reason each**. No control was invented to raise an event count.

> **Nothing is measured yet.** Every adoption number is `NOT_YET_MEASURED` until an endpoint exists. `ANALYTICS_ACTIVATION_DECISION.md` §7 is still unsigned; `docs/ANALYTICS_ENDPOINT_OPTIONS.md` lays out three no-cookie first-party options with a recommended default. **This is the single highest-value founder action in the program.**

## 6. NBA — the adapter is built, the sport is not promoted (Lane D)

- **Prerequisite zero closed:** the ESPN provider now carries the ISO tip-off instant into the artifact instead of discarding it. New rows carry `tipoffIso` + `capturedAt` and a *derived* `researchEligible`; a hand-asserted flag is rejected. Backfill is refused mechanically by a schema epoch plus a guard that walks every committed board.
- **Identity:** the odds→game join moved off team full names to tricode pair + ET slate date (carried separately, because a late tip-off falls on the next UTC day). Zero *and* multiple candidates both refuse — NBA has no doubleheaders, so MLB's nearest-start tie-break would be wrong. Read-only scale test over all 61 committed boards: injective everywhere, 2,204 leans resolve, board hashes unchanged.
- **Market Center** parameterized at exactly three seams, each defaulting to MLB so existing behavior is unchanged; the NBA config reports **no model at all**.
- **Settlement:** the box-score maps the legacy whitelist short-circuited (3PM/STL/BLK) plus PRA synthesis, reusing the MLB lineage gate *by import* rather than mirroring it. The 903 historical invalid rows stay unstamped.

**Gates remain 2 pass / 1 partial / 3 fail.** They grade live evidence and there is none until preseason — the engineering is done, the proof is calendar-bound. `docs/NBA_PRESEASON_DRESS_REHEARSAL.md` documents a real one-command runner (it correctly returns NO_GO today against the historical corpus).

## 7. EPL — odds side shipped, settlement honestly gated (Lane E)

New `soccer/epl/` root with a two-directional guard that nothing writes under `world-cup/`. Leakage is enforced from artifact one: the validator **rejects** rows whose capture is not strictly pregame (equality is not pregame), proven load-bearing by a child-process mutation. Identity is competition-scoped and kickoff-to-minute — the same club pair at two kickoffs, a postponed fixture and its replacement, and league vs cup all resolve distinctly. `MATCH_RESULT_1X2` is its own family with DRAW first-class, and a missing draw fails closed. The three-way de-vig port agrees with the Python reference at 1e-9 across 510 generated cases.

**Sample artifacts carry no final score** — committing one without an approved source would be fabricated data. Settlement is built and gated at `RESULTS_SOURCE_PENDING`; EPL stays SCAFFOLD and the preview route is pruned from the public export. `docs/EPL_RESULTS_SOURCE_DECISION.md` states the founder decision without making it.

## 8. UFC (Lane G)

Continuity verified with evidence: both graders still join on the date-qualified `boutId`, the opposite-winner mutation test still fails the old join, missing/ambiguous ids still fail closed, no historical grade was rewritten. Capture-cadence artifact reads real snapshot history. **UFC stays SCAFFOLD_ONLY** — the data investment memo is attached, unmade.

## 9. Operational proof (Lane A)

`npm run ops:public-beta-observe` is idempotent, read-only with respect to money, and non-zero only on hash mismatch or contradiction. Its first real run is honest: deployment CURRENT, lineage **`NOT_YET_STAMPED` (0/505 rows on 2026-07-27)**, analytics OFF, both hashes MATCH, both wall-clock proofs open.

## 10. Open items (each with an exact next action)

| Item | Owner | Next action | Earliest |
|---|---|---|---|
| First clean post-gate settlement | passive | after the next slate settles, run `npm run ops:public-beta-observe` and work the checklist in `PUBLIC_BETA_OPERATIONAL_PROOF.md`; **never force it** | next nightly-settle |
| Pipefail live proof | passive | observe a natural scheduled failure; the local known-negative test stands as proof meanwhile | unscheduled |
| Analytics endpoint | **founder** | pick an option in `ANALYTICS_ENDPOINT_OPTIONS.md`, sign §7, provision, set the two env vars | now |
| EPL results source | **founder** | approve a source per `EPL_RESULTS_SOURCE_DECISION.md`; unblocks G1 + settlement | before mid-Aug |
| NBA preseason rehearsal | calendar | run the dress rehearsal against live preseason data | ~mid-Oct |
| Paid odds credits (NBA/EPL) | **founder** | confirm budget before ingestion | before either launch |
| `balldontlie_provider_test` failures | engineering | pre-existing, unrelated to this program; fix separately | any time |

## 11. Roadmap, updated from implementation evidence

**0–30 days:** sign analytics (everything adoption-driven is blocked behind it) · close the settlement proof when it naturally occurs · approve the EPL results source so the built settlement path can be switched on · begin EPL fixture/odds capture once the vendor is chosen.
**31–60:** first real adoption read; interpret nothing about sport demand before 4 weeks of data · NBA preseason preparation against the now-existing adapter · EPL preview against live fixtures.
**61–90:** NBA go/no-go at tip-off using the rehearsal artifact · EPL public-preview decision on a month of clean captures · UFC data-investment decision only if funded · monetization experiments only against measured adoption.
**Effort split unchanged:** product+adoption 35% · data/ops 25% · NBA 20% · EPL 10% · docs/distribution 10% · **MLB model R&D 0%** (suspended by the Program 058 stopping rule; nothing this program found reopens it).

## 12. Founder decisions

1. **Sign the analytics endpoint** (option + §7 + env). *Recommended: yes, now* — it is the only thing standing between a built measurement stack and any adoption evidence.
2. **Approve an EPL results source.** *Recommended: yes* — settlement is built and waiting; without it EPL cannot leave odds-only.
3. **Confirm paid odds budget** for NBA/EPL ingestion. *Recommended: yes, before either launch.*
4. **Keep NBA unpromoted until preseason evidence** and UFC at SCAFFOLD_ONLY. *Recommended: yes — the gates grade live data, and there is none yet.*
5. **Accept the named limitations** (no measurement yet; `PROVEN_STAMPED` = 0 until boards stamp rows; both live proofs open). *Recommended: yes.*

## 13. Rejected during this program

- Substituting board `generatedAt` for a missing per-row capture time — the exact unsafe backfill the guard exists to prevent.
- Inventing UI controls to raise analytics event counts.
- Committing an EPL fixture with a final score before a results source is approved.
- Promoting NBA or EPL because the code now compiles and tests pass — gates grade live evidence, not engineering readiness.
- Choosing an analytics vendor or EPL data provider on the founder's behalf.
