# v1.7 — Historical replay receipt (Phase F)

**Run:** 2026-09-22 · `app/scripts/products/replay-selectors.mjs --write` · results in
`data/internal/products/selector-replay/{summary,days}.json` · policies and hashes in
`app/src/lib/products/selector/policies.mjs` · preregistration `docs/V17_SELECTOR_PREREGISTRATION.md`.

## 1. Exact windows and coverage

| | |
|---|---|
| Dates replayed | 37 (2026-08-15 → 2026-09-20; every date with a committed `mlb/team-markets/<date>.json`) |
| Time-lock | **10 dates at the real publication instant**; **8 at the capture instant because the file was rewritten after publication** (audit defect S7); **19 at the capture instant because no publication happened that day** (the Aug 18–Sep 5 missing-pool gap). Prices later than the as-of instant were never visible. |
| Grading | committed official linescore cache (`data/internal/mlb/linescores/<date>.json`), 37/37 dates |
| Eligible legs per day | mean 72 (market-priced MLB only; no other sport had an eligible leg on any date — H3 is untestable historically) |
| Development / assessment split | as preregistered: dev = Aug 15 → Sep 5, assessment = Sep 6 → Sep 20. **The split is too small to carry an adoption decision** (30 decided lane-days per product in the assessment window); it is used to *reject*, not to *adopt*. |

## 2. Prior looks

1. Preregistration (2026-09-21) — no replay run.
2. First replay (2026-09-22, this receipt) — one run over the whole window; every number below is from that run.
   Two harness defects were fixed *before* the numbers were read as evidence and are recorded here: the
   time-lock initially refused every day whose file postdated publication (now labelled and run at capture),
   and the rung-advance skipped one step on a win (off-by-one). No policy constant was changed.

## 3. Results — Bank Builder (74 lane-days per policy)

| Policy | Placed | W-L | Survival / step | Completions | Furthest | No-play (reason) | Mean joint p (market) | Expected wins under it |
|---|---|---|---|---|---|---|---|---|
| **BB-LEGACY** (control) | 71 | 32-39 | 0.451 | 1 | 5 | 3 (concentration) | 0.347 | 24.6 |
| **BB-C1** safest Lane B | 71 | **37-34** | **0.521** | 2 | 5 | 3 (concentration) | 0.378 | 26.9 |
| BB-C2 + floor 0.42/0.30 | 2 | 2-0 | — | 0 | 1 | 72 (70 below floor) | 0.434 | 0.9 |
| BB-C3 cross-sport + floor | 2 | 2-0 | — | 0 | 1 | 72 | identical to C2 (no other sport eligible) | |
| BB-C4 3-step + floor | 0 | — | — | 0 | 0 | 74 | — | |
| BB-C5 4-step + floor | 0 | — | — | 0 | 0 | 74 | — | |

**Paired comparison, legacy vs C1 on the same 71 lane-days:** the two policies differ on **11 lane-days, all
Lane B** (the value band); C1 won 8 of the 11, legacy 3. Under no-difference the chance of ≥8 of 11 is ≈0.11.
Not significant; **not rejected**; the direction matches the hypothesis (H7) and the mechanism is transparent:
Lane B's +200..+700 band forced longer cards than the rung required.

**Rejected on the preregistered publication rule (<50% of eligible days):** BB-C2, C3, C4, C5. The floor
(0.42 at step 1) was set from ladder arithmetic and is **unreachable for market-priced two-leg cards** (the
best qualifying card's market joint p is 0.36–0.40 on an ordinary slate). C4/C5 are **confounded** by that
floor (their rung-1 price is +200, joint p ≤0.33 by construction): the ladder-length hypothesis (H6) was not
tested and needs a re-preregistration with a floor expressed relative to the rung price.

## 4. Results — Moonshot (74 lane-days per policy)

| Policy | Placed | W-L | Survival | Completions | Furthest | No-play (reason) | Mean joint p |
|---|---|---|---|---|---|---|---|
| **MS-LEGACY** (@2 control) | 12 | 5-7 | 0.417 | 0 | 3 | 62 (59 no pair reaches +300) | 0.243 |
| MS-C1 + floor 0.20/0.32 | 12 | 5-7 | 0.417 | 0 | 3 | 62 | 0.243 — the floor never bound |
| MS-C2 2-or-3 legs | 71 | 16-55 | **0.225** | 0 | 2 | 3 | 0.227 |
| MS-C3 cross-sport | 12 | 5-7 | 0.417 | 0 | 3 | 62 | identical (no other sport) |
| MS-C4 3-day cadence | 7 | 4-3 | 0.571 | 1 | 3 | 67 (14 cadence) | 0.250 |

**Coverage caveat that dominates Moonshot:** 59 of 62 no-plays are "no two-leg pair reaches the rung price"
*at the capture instant*. The live product placed on ~20 lane-days in the @2 era because it read the
morning capture; 27 of the 37 replay days could only be run later in the day, after the short-priced pregame
pool had thinned. The Moonshot replay is therefore **under-powered**, and its per-card survival (0.417, n=12)
is inside the market's own expectation (2.9 expected wins, 5 actual).

**MS-C2 (allow three legs)** publishes six times more often at the same joint p and survives 0.225 per card:
more cards, not better cards. On the 12 days both placed: 5 vs 6. **Not adopted**; H4 (fewer legs → fewer
weak-link failures) is directionally supported and not proven.

**MS-C4 (cadence)** 4-3 with one completion on n=7 is a hot streak, not evidence.

## 5. What the replay established

1. **The products' outcomes are inside the market's own expectation of the construction.** Every policy's
   actual wins sit at or above the sum of market-implied joint probabilities (BB legacy 32 vs 24.6 expected;
   C1 37 vs 26.9). Nothing here beats the market; nothing here is broken either. The ladder loses because
   the ladder is a low-probability construction, exactly as Phase A concluded.
2. **Lane B's value band is the one design choice with a measured cost** and the only redesign that survives
   the replay: safest-fit at the rung's own price (BB-C1).
3. **No-play floors on market-implied joint p cannot be set from ladder arithmetic**; they must be
   preregistered relative to what the rung price can carry. Recorded as look 2 for a forward-only variant.
4. **Cross-sport is untestable historically** and remains a forward question gated on model status.
5. **The intra-day rewrite of the price file (S7) is the largest evidence defect**; fixed at the source in
   this program (each capture is now archived under its own instant).

## 6. Decision (research, not adoption)

- **BB-C1 → forward shadow** (Phase H). MS-C1 (= legacy + a floor that has not yet bound) → forward shadow
  as the Moonshot control-with-floor. MS-C4 → forward shadow as a secondary, because cadence is the only
  Moonshot variant that changes the product's *structure* rather than its threshold.
- **Rejected:** BB-C2, C3, C4, C5, MS-C2 (on the rules written before the run).
- **Re-preregistered for forward only (look 2):** BB-C2b with a floor of 0.90 × the rung's best achievable
  market joint p on the day (a relative floor, so a thin slate declines without a fixed number that a
  market-priced card can never reach). It has **no historical score by design**.
- **No public change is made on this receipt.** Adoption requires the Phase H forward receipt.
