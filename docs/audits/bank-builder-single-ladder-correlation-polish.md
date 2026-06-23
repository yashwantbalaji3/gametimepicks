# Bank Builder Single-Ladder UX + Cross-Lane Correlation Review + Portraits/Logos

**Date:** Tuesday June 23 2026, ~12:01 PM ET. **Branch:** `bank-builder-single-ladder-correlation-polish` (off `origin/main` `f6911b1c`).
**Scope:** collapse the two duplicate Bank Builder sections into one "Today's Dual Bank Builder" ladder (current step open with its legs, prior steps collapsed dropdowns), and re-pick Lane A/B JOINTLY so they share no game. Crown/bankroll preserved.

## Phase 1 — money gate (API-Football, 12:01 PM ET)
All 4 NS + replace-eligible (>30m): Portugal/Uzbekistan 58m, England/Ghana 238m, Panama/Croatia 418m, Colombia/DR Congo 598m. → pre-event quality upgrade allowed.

## Phase 2 — correlation finding
Current cards both touched **Colombia/DR Congo** (Lane A Colombia ML, Lane B Colombia Under 2.5) → the two lanes were not independent. With 4 games and 2 legs/lane a zero-overlap split is possible.

## Phases 3-5 — cross-lane joint selector
New `lib/daily-portfolio/bank-builder-correlation-review.ts` `selectCrossLaneBankBuilder` picks Lane A + Lane B TOGETHER: enumerates every 2+2 game partition (no shared game), scores by (both lanes fit target) then total model confidence, team/game markets preferred, max 1 leg/game, no leg < −500, honest combined odds. Wired into `accounting.ts` (replaces the two independent BB calls). `app/scripts/review-bank-builder-lanes.mjs` shows current-vs-proposed + cross-lane overlap + applies (pre-event only; never touches active bankroll/crown).

**Result (applied):**
| lane | was (shared Colombia) | now (independent) | combined | rides → return | target |
|---|---|---|---|---|---|
| A · Step 4 | Colombia ML + England/Ghana BTTS-No | **Panama/Croatia · Croatia ML −230 (66%) + Colombia/DRC · Under 2.5 −150 (56%)** | +139 | $1,464.71 → $3,502.57 | $3,500 ✓ |
| B · Step 2 | Portugal BTTS-No + Colombia Under 2.5 | **Portugal/Uzb · BTTS-No −174 (60%) + England/Ghana · BTTS-No −164 (59%)** | +153 | $277.11 → $702.45 | $700 ✓ |

**Cross-lane game overlap: NONE** (Lane A = PAN/CRO + COL/DRC; Lane B = POR/UZB + ENG/GHA — all 4 games used once). Both lanes team/game markets only, both reach target, all legs ≥ 56% model confidence. Exposure **$250 / $9,926.17 / $10,176.17 / crown $10,376.17 — unchanged**; `portfolio.json` + record untouched (only `daily-portfolio.json` changed).

## Phases 6-9 — single Bank Builder ladder
Removed the duplicate top `ProductLanesLadder` section. `/bank-builder` now has ONE ladder — **"Today's Dual Bank Builder"** (`DualLadderBoard`), led by the exposure summary. The current step's daily legs are injected into the DualLadderBoard (new read of `daily-portfolio.json`) and shown in an **open-by-default** drawer ("TODAY'S CARD · combined +139 · $1,464.71 → $3,500 · potential $3,502.57" with each leg's flag, market, selection, odds, model%, provider, kickoff, PENDING). Prior cleared steps (1-3 Lane A, 1 Lane B) are collapsed `<details>` showing their actual WON amounts; future steps collapsed/disabled. The completed crown proof stays in a collapsed "Completed crown proof · CROWN REACHED · historical" section (from #567). Portraits/logos: `FlagBadge` on team legs + `PlayerAvatar` for player legs (fallback-safe).

## Phases 10-13 — parity + sync
Moonshot keeps the shared `ProductLanesLadder` step rail (Lane A/B, Step 1 current, history below — from #566/#567). `/today` Bank Builder chip reads the active portfolio ("2 active lanes · Step 4 · Step 2 · $200 open exposure"); `/mr-dub` daily portfolio shows the updated cross-lane legs. WC table (multi-pick, no truncation) + game-detail (no −5000) carried from #568.

## Phase 15 — MLB
Odds API still 0 events for June 23 → honest "No board" (not faked).

## Phase 16 — bug hunt
| # | issue | severity | fixed? |
|---|---|---|---|
| 1 | two duplicate Bank Builder sections | high | ✅ single DualLadderBoard |
| 2 | Lane A/B both touched Colombia (correlated) | high | ✅ joint zero-overlap selector |
| 3 | current step showed "awaiting" not the active legs | high | ✅ daily legs injected, open drawer |
| 4 | prior-step legs not in dropdowns | med | ✅ cleared steps show legs |
| 5 | "collapsed" word in board source tripped copy-guard test | low | ✅ reworded comment |
| 6 | player props lacked portraits in ladder | low | ✅ PlayerAvatar added (fallback-safe) |
| 7 | per-step legs under historical crown proof | low | ❌ backlog (leg-level archive source) |
| 8 | MLB board absent (odds unposted) | low | ❌ honest unavailable |
| 9 | DC/DNB favourites < −500 excluded from pool | low | partial (totals/BTTS/ML used) |
| 10 | CDN per-route cache lag on deploy verify | low | n/a (cache-bust documented) |

## Verification
- **Tests:** 1285 / 1285 (6 new in `bank-builder-cross-lane.test.mjs` + 3 reconciled to the single-ladder structure). **tsc** clean. **`next build`** clean.
- **Audits:** no banned public copy (reworded "collapsed" in the board source); no secrets; only `daily-portfolio.json` in money data (crown/results/portfolio/dual untouched); no −5000 promoted.
- **Browser QA (mobile 375):** `/bank-builder` single ladder — Lane A Steps 1-3 collapsed CLEARED (WON amounts), Step 4 open with Croatia ML + Colombia Under 2.5 (flags, provider, PENDING); exposure summary leads; crown proof collapsed below; no overflow; console clean. `/today` Bank Builder chip "2 active lanes · Step 4 · Step 2 · $200".

## Deliberately NOT changed
- Active bankroll + crown (settlement-only); exposure ($250); legacy portfolio.json + historical dual artifact; Moonshot kept higher-upside.
- No settlement (games NS); no MLB board (odds unposted).

## Remaining backlog
1. Settle the active portfolio after June-23 finals.
2. Per-step legs under the historical crown proof (leg-level archive source).
3. Full /picks + /build product-section work; MLB board once odds post.
