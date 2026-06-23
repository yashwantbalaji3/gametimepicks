# Bank Builder Next-Step Cards + Moonshot Ladder Parity + Crown Cleanup

**Date:** Tuesday June 23 2026, ~10:12 AM ET. **Branch:** `bank-builder-next-steps-moonshot-ladder-cleanup` (off `origin/main` `b9064bb7`).
**Scope:** generate the safest 2-leg Bank Builder NEXT-STEP cards (Lane A Step 4, Lane B Step 2) that fit the rung target, de-emphasize the completed crown proof on `/bank-builder`, finish Moonshot ladder parity, and fix the game-detail `-5000` raw-prop spotlight. Active bankroll + crown preserved.

## Phase 1 — rung math (from the active dual-ladder artifact + BANK_BUILDER_LADDER)
Ladder: S1 $100→$200 · S2 $200→$700 · S3 $700→$1400 · **S4 $1400→$3500** · S5 $3500→$10000.
| lane | cleared | next step | rolled stake (last payout) | rung target | needs combined |
|---|---|---|---|---|---|
| A | 3 | **4** | $1,464.71 | $3,500 | ≈ +139 |
| B | 1 | **2** | $277.11 | $700 | ≈ +153 |
The dual ladder is a **$100-seed** paper experiment per lane → the card RIDES the rolled balance toward the rung goal, but the AT-RISK amount (open exposure) is the **$100 seed** (ledger convention). So exposure stays $200 BB / $250 total / $9,926.17 available (unchanged from #566); only the card contents + step labels change.

## Phase 2 — game status (API-Football, 10:12 AM ET)
All 4 NS + eligible (>30m): Portugal/Uzbekistan 1 PM, England/Ghana 4 PM, Panama/Croatia 7 PM, Colombia/DR Congo 10 PM. Activation permitted.

## Phases 3-5 — next-step generation + activation
`lib/daily-portfolio/bank-builder-generation.ts`: `readLaneRungs` (rung math) + `selectSafestTargetFitCard` — the highest-combined-confidence 2-leg, max-1-per-game, model-qualified (−500..+400) card whose combined price reaches the rung target; else closest-from-below flagged candidate. Wired into `accounting.ts` (BB target-fit + Moonshot from the remaining pool, distinct legs).

- **Lane A Step 4** ($1,464.71 → target $3,500): Anthony Gordon O0.5 SOT −215 (68%) + Jhon Cordoba O0.5 SOT −152 (60%) → **+143 → $3,557.79** (fits). Max 1/game.
- **Lane B Step 2** ($277.11 → target $700): Bruno Fernandes O0.5 Assists +120 (45%) + Antoine Semenyo O0.5 Shots −380 (79%) → **+178 → $770.07** (fits). Max 1/game.

`npx tsx app/scripts/activate-daily-portfolio.mjs --apply` re-persisted `daily-portfolio.json`: Lane A active Step 4, Lane B active Step 2, BB exposure **$200** (seed), Moonshot $50, open **$250**, available **$9,926.17**, active bankroll **$10,176.17**, crown **$10,376.17** — `portfolio.json` + crown + record UNTOUCHED.

## Phases 6-7 — Bank Builder page cleanup
`/bank-builder` now LEADS with the exposure summary (active $10,176.17 · BB open exposure $200 · available $9,926.17 · crown separate) + the active `ProductLanesLadder` (Lane A Step 4, Lane B Step 2). The completed crown proof ("Road to $10K completed") is moved BELOW and wrapped in a collapsed `<details>` titled **"Completed crown proof · CROWN REACHED · historical"** (closed by default) — it no longer reads ACTIVE / dominates.

## Phase 8 — dynamic step rail (Moonshot ↔ Bank Builder parity)
`components/ladders/product-lanes-ladder.tsx` StepRail is now **dynamic** on `currentStep`/`clearedSteps`: rungs `< currentStep` render CLEARED (✓ green), `=== currentStep` CURRENT (accent glow), `> currentStep` FUTURE ("awaits Step N settlement"). Bank Builder = 5 rungs (Lane A shows 1-3 cleared + 4 current + 5 future; Lane B 1 cleared + 2 current); Moonshot = 3 rungs (Step 1 current + 2-3 future). Same shared component → consistent ladder family.

## Phases 10-11 — Mr. Dub + Today sync
`/today` Bank Builder + Moonshot chips now read the ACTIVE daily portfolio first (Bank Builder "2 active lanes · Step 4 · Step 2 · $200 open exposure"; Moonshot "2 active lanes · $50 open exposure") — no stale "awaiting next card / $0" while active. `/mr-dub` daily portfolio (from #566) reflects the same active state.

## Phase 13 — game detail spotlight fix
`components/game/game-detail-page.tsx`: the "Top player model pick" spotlight now filters to model-qualified props (odds-backed, −500..+400, provider) BEFORE ranking — a raw `-5000` favourite can no longer be promoted as the top pick; empty state reads "No model-qualified pick."

## Phase 14 — MLB recheck
Odds API still **0 events** for June 23 → kept honest "No board", not faked.

## Verification
- **Tests:** 1272 / 1272 (8 new in `bank-builder-next-steps.test.mjs`; #565/#566 suites still green). **tsc** clean. **`next build`** clean.
- **Audits:** no banned public copy (caught + reworded "safest" → "lowest-volatility / highest-confidence" in `whyThisCard` + comments); no secrets; money/crown diff = **only `daily-portfolio.json`** (portfolio.json, crown `bank-builder/*`, results, dual artifact, moonshot-lane UNCHANGED); no `-5000` promoted as a pick.
- **Browser QA:** `/bank-builder` leads with active ladder — Lane A ACTIVE step rail ✓✓✓④⑤ "STEP 4 OF 5 · CURRENT CARD" $1,464.71→$3,557.79 +143 "→ STEP 4 GOAL $3,500" "$1,464.71 AT RISK"; crown proof collapsed; Lane B "Step 2 of 5"; `/today` chips reflect active; game detail no `-5000`; no overflow; console clean.

## Deliberately NOT changed
- Active bankroll + crown (only settlement moves them); `portfolio.json` legacy ledger + historical dual ladder (daily portfolio is the separate active layer).
- BB open exposure stays the $100 seed/lane (ledger convention) — the rolled balance is displayed but not counted as a fresh bankroll draw.
- No settlement (games NS); no MLB board (odds unposted).

## Remaining backlog
1. Settle the active daily portfolio after the June-23 games are final (realize P/L into active bankroll, release exposure, advance the next rung).
2. Generate Step 5 (Lane A) / Step 3 (Lane B) cards after the current step settles WON.
3. Deeper game-detail layout polish + full /picks + /build product-section work; MLB board once odds post.
