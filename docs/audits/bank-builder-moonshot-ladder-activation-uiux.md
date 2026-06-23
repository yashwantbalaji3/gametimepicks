# Bank Builder + Moonshot Ladder Activation + Unified Daily Portfolio UX

**Date:** Tuesday June 23 2026, ~9:35 AM ET. **Branch:** `bank-builder-moonshot-ladder-activation-uiux` (off `origin/main` `dde61bb2`).
**Scope:** generate the four daily lanes (Bank Builder A/B + Moonshot A/B) from the model pool, **ACTIVATE** them (place $250 paper exposure) with explicit accounting, and make Bank Builder + Moonshot consistent ladder products (Lane A/B + step rails). Active bankroll + crown preserved.

## Baseline (preserved)
| area | baseline | after |
|---|---|---|
| active bankroll | $10,176.17 | **$10,176.17** (unchanged at activation) |
| crown | $10,376.17 / 5-0 | **$10,376.17 / 5-0 (untouched)** |
| core record | 10-2-0-0 | **10-2-0-0** (only settlement changes it) |
| open exposure | $0 | **$250** (daily portfolio activated) |
| available bankroll | $10,176.17 | **$9,926.17** (= active − exposure) |

## Phase 1 — game status (API-Football, verified at 9:35 AM ET)
All 4 NS + eligible (>30m to kickoff): Portugal/Uzbekistan 1 PM (204m), England/Ghana 4 PM (384m), Panama/Croatia 7 PM (564m), Colombia/DR Congo 10 PM (744m). Activation permitted.

## Accounting model (display)
`activeBankroll = portfolio.currentBankroll` (settled bankroll, UNCHANGED at activation) · `openExposure = Σ active stakes` · `availableBankroll = active − exposure` · `potentialReturn = Σ active returns` · `crown` separate, never touched. Activating raises exposure + lowers available; it does NOT move active bankroll or crown (those move only on official settlement). Implemented in `app/src/lib/daily-portfolio/accounting.ts` — a separate layer that NEVER mutates `portfolio.json` or the crown.

## Phases 2-7 — generation + activation
Reuses the tested unified model-pick pool + lane generator from PR #565 (`lib/world-cup/model-qualified-picks.ts`: team ML/DC/DNB/totals/BTTS + model-qualified player props, pre-event + odds-window + model-floor gated). `accounting.ts` adds activation eligibility (all legs pre-event, outside the 30m cutoff, full lane) + exposure math + the Moonshot $50 cap.

**Generated lanes (June 23):**
- **Bank Builder Lane A** ($100, −178): Shomurodov O0.5 Shots −425 (Portugal/Uzb) + Semenyo O0.5 Shots −380 (Eng/Ghana). → $156.04.
- **Bank Builder Lane B** ($100, −169): England ML −500 (Eng/Ghana) + Budimir O0.5 SOT −305 (Pan/Cro). → $159.34.
- **Moonshot Lane A** ($25, +4979): Perisic O0.5 Assists +210, Rashford O0.5 Assists +150, Bruno Fernandes O0.5 Assists +120, Colombia/DRC Under 2.5 −150, Panama/Croatia Over 2.5 −127 (Pan/Cro 2 legs — correlation disclosed). → $1,269.80.
- **Moonshot Lane B** ($25, +1156): Panama/Croatia BTTS No −132, Kane Anytime GS −150, Cordoba O0.5 SOT −152, Ronaldo Anytime GS −165, Eng/Ghana BTTS No −164 (Eng/Ghana 2 legs — correlation disclosed). → $313.89.

Max 1 leg/game in Bank Builder; Moonshot uses a 2nd leg per game only when unavoidable (4 games, 5 legs) with an explicit correlation note. Combined odds reconcile from the real leg odds (tested).

**Activation:** `npx tsx app/scripts/activate-daily-portfolio.mjs --date 2026-06-23 --apply` → persisted `app/public/data/mr-dub/daily-portfolio.json` (v1): 4 active lanes, open exposure **$250** (BB $200 + Moonshot $50), available **$9,926.17**, potential **$1,899.07**, active bankroll **$10,176.17**, crown **$10,376.17**, settlement pending. `portfolio.json` + crown UNTOUCHED.

## Phases 8-12 — unified ladder UI
`components/ladders/product-lanes-ladder.tsx` — shared ladder: product header, Lane A/B cards, a **3-step rail** (Step 1 current/active glows, Step 2 "awaits Step 1 settlement", Step 3 "awaits Step 2 settlement"), combined odds, legs, correlation/activation notes. `/moonshot` now leads with this ladder (violet) — **Moonshot is a ladder product with steps, mirroring Bank Builder** — with the stopped June-19 lane kept under "History". `/bank-builder` shows the daily ladder (gold) above the historical dual-ladder-board. `/mr-dub` daily-portfolio-section shows all 4 active lanes + the exposure summary ($250 / $9,926.17 / $1,899.07, crown separate). `/today` "paper portfolio" card now reflects active exposure.

## Phase 15-16 — MLB + settlement readiness
MLB June 23 odds still **0 events** (`fetch_game_markets --dry-run`, 0 credits) — kept honest "No board", not faked. `app/scripts/settle-daily-portfolio.mjs` (dry-run): reports each active lane's legs "awaiting official final"; **`--apply` refused** while any game is not final (no fake settlement). Settlement-ready: leg statuses tracked; settlement will update active bankroll / exposure / available / product records / daily P/L and never touch the crown.

## Verification
- **Tests:** 1264 / 1264 (10 new in `bank-builder-moonshot-activation.test.mjs` + 1 #565 test reconciled to the activated state). **tsc** clean. **`next build`** clean.
- **Audits:** no banned public copy; no secrets; money/crown diff = ONLY the new `daily-portfolio.json` (portfolio.json, crown `bank-builder/*`, results, dual artifact, moonshot-lane all UNCHANGED); no extreme odds (all legs −500..+2000); started-game guard verified (0 exposure once games start).
- **Browser QA (1440 + 375):** `/moonshot` ladder + step rail ("1 CURRENT CARD → 2 → 3") + Lane A/B + ACTIVE + $50 exposure; `/bank-builder` daily ladder + $200 + historical ladder kept; `/mr-dub` 4 active lanes + $250 / $9,926.17 / $1,899.07; no overflow; console clean.

## Deliberately NOT changed
- Active bankroll + crown (unchanged at activation — only settlement moves them).
- `portfolio.json` legacy ledger + historical dual ladder (the daily portfolio is a separate layer).
- No June-23 MLB board (odds unposted). No settlement performed (games NS).

## Remaining backlog
1. Settle the active daily portfolio after the June-23 games are final (`settle-daily-portfolio.mjs --apply` once gated logic grades from official sources) → realize P/L into active bankroll, release exposure, update product records + daily P/L.
2. Deeper game-detail page revamp + full /picks product-filter + /build candidate-leg review.
3. MLB board once the Odds API posts June-23 markets.
4. Multi-step ladder progression (generate Step 2 cards after Step 1 settles WON) for both products.
