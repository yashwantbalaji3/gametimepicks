# Bank Builder Step 4 settlement + Road to $10K — 2026-06-12 slate

Settled: 2026-06-13 ~04:45 UTC · Base `00773dd`. Official-results settlement (the one
condition under which the ledger may change). Paper-only educational tracking.

## 1. Pre-settlement state (unchanged until verified)
$1,423.64 · Step 4/5 · 3–0. Step-4 card pending (+155): US-or-Paraguay double chance −290
FanDuel + Luinder Avila K Under 3.5 −112 DraftKings. Projected return $3,623.97, profit
+$2,200.33.

## 2. Official result verification (Phase 1)
Settlement used official/authoritative sources only — NOT the user's message or screenshots.

**Leg 1 — United States or Paraguay (double chance, 90' regulation):**
- Final: **United States 4–1 Paraguay** (FIFA World Cup group stage, SoFi Stadium).
- Sources: ESPN, FOX Sports, CBS Sports, NBC News, NPR, Yahoo Sports (six concordant).
- Group-stage matches have **no extra time**; USA led 3–1 within regulation (Balogun ×2 +
  own goal) before Reyna's 90+8' stoppage-time goal (stoppage time is part of regulation).
- Grade: USA won in regulation → double chance **WIN**. (A draw would have lost.)

**Leg 2 — Luinder Avila strikeouts Under 3.5:**
- Official MLB box score (MLB Stats API, gamePk 824102) + CBS Sports box score, game FINAL
  (HOU 10, KC 8): **Avila — 0.2 IP, 0 strikeouts, 5 H, 8 R, 3 BB, starting pitcher: yes**,
  took the loss (1–3).
- The "Avila eight strikeouts / career high" web results were a DIFFERENT, earlier game that
  search conflated; here the "8" is **8 runs**, not strikeouts. Two independent official
  sources agree on **0 K**.
- He started (no scratch/void), game final. Grade: 0 ≤ 3 → Under 3.5 **WIN**.

**Both legs WON → Step 4 settles WON.**

## 3. Settlement math (from the stored card — no re-derivation drift)
- Stake $1,423.64 · combined decimal (−290 × −112) = 2.5455 (+155 American).
- Return = $1,423.64 × 2.5455 = **$3,623.97**; profit **+$2,200.33**. Matches the stored card.

## 4. State changes (public artifacts only; internal audit ledger untouched)
- `public-summary-latest.json`: bankroll 1423.64→**3623.97**, step 4→**5**, stepStart
  1400→**3500**, stepGoal 3500→**10000**, record wins 3→**4**, streak 3→**4**,
  lastSettledDate→**2026-06-12**, lastSettledLabel→**"Step 4 HIT — World Cup + MLB"**,
  nextTargetUnits 3500→**10000**.
- `public-ledger-latest.json`: appended the **Step 4 WON** entry (1423.64→3623.97, +2200.33,
  +155, both legs win with finalScore "United States 4-1 Paraguay" + finalStat 0,
  officialResultConfirmed, settlementSource "espn_scoreboard + mlb_stats_api"); nextPick →
  Step 5 pending (nextStake 3623.97, nextTarget 10000, nextEligibleDate null).
- `official-step4-candidate.json`: status pending→**won** + result/settledReturn/settledProfit/
  settlementEvidence (legs preserved as historical evidence; the gated pending-card view
  switches off once status leaves "pending").
- Idempotency: exactly one Step-4 ledger entry; re-running would not duplicate it.
- **Not touched:** internal `summary-latest.json` / `ledger-latest.json` (the preserved
  experimental audit, $444.19), `featured-latest.json`. No Step 5 card generated.

## 5. UI (Phase 3) — Road to $10K
`/bank-builder`: on the final rung the hero shows **"4–0. One step from $10K."** + "$100
paper ladder now at $3,623.97. Final step: $3,500 → $10,000"; a **latest-hit (Step 4)**
card surfaces both legs with official evidence (USA 4-1 Paraguay; Avila 0 K box score) and
$1,423.64→$3,623.97 (+$2,200.33) WON; the lava $100→$10,000 meter now reads ~36%; the
"today's card" slot becomes a **"Step 5 review pending · Review final step"** panel — the
WC generator is suppressed on the final step so **no Step 5 parlay is invented**. Previous
hits now lists all four wins. Header chip / `/today` / `/results` read the same public
summary/ledger → all show $3,623.97 · Step 5 · 4–0.

## 6. Verification
843 tests (incl. new `bank-builder-step4-settlement` grading + idempotency) · tsc + build
clean · banned-copy 0. Production verified post-deploy.

## 7. Honest limitations / next
- Step 5 final card NOT generated — publishes only after model+market gates clear a real
  slate (separate review). Future outcome uncertain. Paper-only; no real money.
- A loss on Step 5 resets the run to the $100 base (standard ladder rule).
