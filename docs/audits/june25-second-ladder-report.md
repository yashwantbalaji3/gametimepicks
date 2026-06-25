# June 25, 2026 — Second $10K Ladder Banking + Operations Report

_Money-integrity-critical operation. Every bankroll mutation is traceable to an official settlement and
reproducible from `banked-ladders.json`. 1410/1410 tests pass, tsc clean, build clean._

## Banking summary (Phases 0–4) — PRE → POST

| Metric | PRE | POST | Δ |
|---|---|---|---|
| **Crown** | $10,376.17 | **$20,465.40** | +$10,089.23 (Ladder #2 final) |
| **Bankroll / net worth** | $10,076.17 | **$20,165.40** | +$10,089.23 |
| **Lifetime profit (settled)** | $9,976.17 | **$20,065.40** | +$10,089.23 |
| **ROI** | 99.76× | **200.65×** | — |
| **Drawdown** | $300 | **$300** | unchanged (the 3 lost dual-lane $100 seeds) |
| **BB record** | 13-3-0 | **13-3-0** | unchanged (banking is not a bet) |

**Model = cumulative crown** (operator's choice): Crown = Σ official completed-ladder finals
($10,376.17 + $10,089.23). `bankroll ≤ crown` holds; `bankroll = crown − drawdown` holds; the crown is now
the sum of two completed ladders. No phantom profit (the $300 dual-lane losses are preserved); no
double-counting; `pendingLaneCompletions` removed (now banked). Reproducible: `build-mr-dub-ledger` rebuilds
this exact state from `banked-ladders.json`, and the daily-summary reconciles to $20,165.40.

**Completed ladders (archived, replayable):**
- **Ladder #1** — Road to $10K, $100 → $10,376.17, 5-0 (Jun 9–13). `bank-builder/public-ledger-latest.json`.
- **Ladder #2** — Dual Bank Builder Lane A, $100 → $10,089.23, 5-0 (Jun 18–24). `mr-dub/banked-ladders.json` +
  `methodology/launch/dual-bank-builder-2026-06-24-completed.json`.

## Phase 5 — "Double-10K Success Framework" (from the two banked runs)

Both completed ladders went **5-0** (every leg graded from official results). What worked:
- **Few legs per step** — 2 legs on the survival rungs (Steps 1–4), 3 only on the final rung. Fewer legs = higher survival.
- **Short favorites as the anchor** — World Cup moneylines / draw-no-bet on strong favorites (USA, Egypt, Algeria, Croatia, Morocco, Bosnia, Brazil), plus one totals (Over/Under 2.5) or MLB player-hit prop to reach the rung multiplier.
- **Soccer-first, MLB fill** — WC team markets carried both ladders; MLB hits/HRR props filled early steps.
- **Step 1 is the easiest rung** (2.0×) — two short favorites clear it.
- **Failure mode:** the 3 losses (13-3) were all on STOPPED side-lanes (Lane B + priors) that reached for riskier legs (e.g. an Under 2.5 that went to 3 goals). The completed ladders avoided longshots.

**Applied to June 25 (fresh cycle, soccer-first):** both lanes are Step-1, 2-leg short-favorite cards from the live WC slate (~2.0× — Germany DNB / favorite moneylines / low totals), maximizing ladder-advancement probability over entertainment.

## Phase 5 product — fresh June-25 Bank Builder
- **Lane A** — Step 1, $100 → $200 (~+101, 2 legs, $100 seed). Fresh cycle-2.
- **Lane B** — Step 1, $100 → $200 (~+104, 2 legs, $100 seed). Fresh cycle-2.
- Lane B is NOT a revival of the dead lane — it is a brand-new $100 Step-1 (operator directive).

## Phase 6 — Moonshot rework
Moonshot is fully **separate from the ladder framework**: its own artifact + ledger, `$0` bankroll
interaction, tracked by record/ROI only. June-25 daily lanes A/B are **candidate** (3 legs each) but priced
**below the +700 longshot floor**, so they publish as "awaiting a qualifying longshot card" rather than being
forced — no fabrication. (Two genuinely-strong moonshots publish automatically when the slate qualifies.)

## Phase 7 — Homer Nukes (June 25)
2 lanes × 3 legs × $10, derived from 437 live HR props across 9 MLB games (Odds API). $20 tracked exposure,
independent ledger.

## Phase 8 — World Cup Specials (June 25)
5 cards (combined +968 … +2402) from the live 6-game WC slate (real de-vigged odds; team-model fallback —
the feed has no soccer player props). No forced action.

## Phase 9 — Marketing / social proof
Added a factual, tasteful **AchievementBanner** to the homepage (Today) + Mr. Dub: "2× $100 → $10K challenge
completed", the two ladder chips ($100→$10,376 · $100→$10,089), "$20,065 paper profit", "Bank Builder 13-3",
with a paper-only/educational disclaimer + a "Full ledger →" link. Every number is read from the canonical
ledger (no hardcoded marketing claims).

## Final operator answers (Phase 11)
1. **Crown after banking:** $20,465.40
2. **Bankroll after banking:** $20,165.40
3. **Net worth:** **$20,165.40**
4. **Total realized BB profits:** $20,065.40 (two completed ladders − $300 dual-lane losses)
5. **Total realized Mr. Dub profits (paper, all products):** Bank Builder +$8,347.41 · Moonshot −$50 · WC
   Specials −$50 · Homer Nukes $0 (unsettled) → aggregate **+$8,247.41** in the product master-ledger layer
   (separate, rolled-stake view). The seed-model net worth is $20,165.40.
6. **Fresh Lane A:** Step 1, $100 → $200, ~+101 (2 short-favorite legs).
7. **Moonshot A / B:** candidate, below the +700 floor → awaiting a qualifying longshot (no fabrication).
8. **Homer Nukes:** 2 lanes × 3 legs × $10 (live June-25 HR props).
9. **WC Specials:** 5 cards (+968 … +2402) from the live 6-game slate.
10. **Remaining risks:** WC projection model-prob still inverted (P1, mitigated — selectors use de-vigged
    market); Homer Score is a "Partial Model" (0/7 Statcast); daily *generation* fetch is still manual
    `workflow_dispatch` (settlement is cron-automated). Operator decision: whether to start banking the seed
    model toward a third ladder.
11. **Production status:** all June-25 content live; 1410/1410 tests, tsc + build clean.

### "What is the true value of the Mr. Dub portfolio after completing the second $10k ladder?"
**$20,165.40** — the realized net worth (crown $20,465.40 across two completed $100→$10K ladders, minus $300
in dual-lane side-lane losses). The crown high-water mark is **$20,465.40**.
