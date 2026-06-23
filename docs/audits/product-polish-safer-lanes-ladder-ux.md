# Product Polish — Safer Bank Builder Legs + WC Model Picks Redesign + Ladder UX

**Date:** Tuesday June 23 2026, ~10:55 AM ET. **Branch:** `product-polish-safer-lanes-ladder-ux` (off `origin/main` `b6cd0a99`).
**Scope:** review/upgrade the active Bank Builder + Moonshot cards to the lowest-volatility model legs (team/game markets preferred over fragile props), redesign the cramped World Cup Model Picks table (multiple picks/market, no truncation), and polish game detail. Active bankroll + crown preserved.

## Phase 1 — game-status gate (API-Football, 10:55 AM ET)
All 4 NS + replace-eligible (>30m): Portugal/Uzbekistan 1 PM, England/Ghana 4 PM, Panama/Croatia 7 PM, Colombia/DR Congo 10 PM. → pre-event quality upgrades permitted.

## Phases 3-7 — safer Bank Builder legs (team/game markets preferred)
`bank-builder-generation.ts` `selectSafestTargetFitCard` now uses a **market-priority tier**: Tier 1 tries a TEAM-ONLY card (moneyline / double-chance / DNB / totals / BTTS) reaching the rung target; player props (Tier 2) are used only when no team/game-market card reaches the target. New `review-and-upgrade-daily-portfolio.mjs` shows current-vs-proposed per lane + the reason; `--apply` re-persists `daily-portfolio.json` (pre-event quality upgrade — exposure + active bankroll + crown unchanged).

| lane | current (was) | upgraded (now, team/game only) | combined | rides → return | target |
|---|---|---|---|---|---|
| A · Step 4 | Gordon SOT −215 + Cordoba SOT −152 | **Colombia ML −205 (64%) + England/Ghana BTTS-No −164 (59%)** | +140 | $1,464.71 → $3,507.98 | $3,500 ✓ |
| B · Step 2 | Bruno Fernandes Assist +120 + Semenyo Shots −380 | **Portugal/Uzb BTTS-No −174 (60%) + Colombia Under 2.5 −150 (56%)** | +162 | $277.11 → $727.28 | $700 ✓ |

Both lanes now use **team/game markets only** (lower fragility — no lineup/single-player risk), reach the rung target, max 1 leg/game. Exposure stays the $100 seed/lane → **$250 total, $9,926.17 available, $10,176.17 active, $10,376.17 crown — all unchanged**.

## Phase 6 — Moonshot review
Moonshot lanes refreshed from the pool minus the Bank Builder legs (distinct lanes): Lane A (+4952, assists×3 + Cordoba SOT + Over 2.5; Pan/Cro 2nd leg flagged), Lane B (+1079, BTTS-No×2 + Kane/Ronaldo anytime + Under 3.5; Por/Uzb 2nd leg flagged). 5 legs, $25/lane, higher-upside mix, correlation notes present. Kept higher-upside (not made "safe") per spec.

## Phase 10 — World Cup Model Picks table redesign
`buildModelPicksTable` now returns `cellsMulti` (up to **3** model-qualified picks per game×market; `MAX_PICKS_PER_MARKET=3`) alongside the top pick. `model-picks-table.tsx` rewritten: desktop grid scrolls **inside its own `overflow-x-auto` container** (page never overflows) with a wider Game column + `minmax(150px,1fr)` market columns; player names **wrap (break-words), no aggressive truncation**; each cell shows the top pick + a "+N more" block listing the 2nd/3rd picks; mobile = per-game cards with all picks stacked. Team Pick + Total/BTTS columns (moneyline / double-chance / DNB / totals / BTTS) stay prominent. Verified: 6 distinct players visible, 7 "+N more" blocks, full names, no page overflow.

## Phase 11 — game detail
Spotlight "top player model pick" stays model-qualified (−500..+400 + provider) — no raw −5000. Player-props tab now shows **"Model picks by market"** (up to 3 model-qualified picks per market, full names, "No model-qualified pick" where empty); raw inventory stays behind the `PlayerPropsExplorer` disclosure; hero chip clutter reduced.

## Phases 8-9 — ladder UX
Bank Builder leads with the active Lane A/B ladder + exposure summary (from #567); the completed crown proof is collapsed into "Completed crown proof · CROWN REACHED · historical". Moonshot mirrors Bank Builder via the shared dynamic step rail (from #566/#567). (Per-step legs under the historical crown proof = backlog — the current proof shows per-step bankroll + record; legs-per-step needs the crown's historical leg source.)

## Phase 15 — bug hunt / product suggestions
| # | issue | route/file | severity | fixed this sprint? | next step |
|---|---|---|---|---|---|
| 1 | Bank Builder used fragile player props when safer team markets fit the rung | bank-builder-generation.ts | high | ✅ team-market priority | — |
| 2 | WC model-picks table truncated player names / cramped columns | model-picks-table.tsx | high | ✅ wrap + internal scroll | — |
| 3 | Only 1 pick/market shown despite multiple qualifying | model-qualified-picks.ts | med | ✅ cellsMulti (top 3) | — |
| 4 | game-detail could promote a raw −5000 prop | game-detail-page.tsx | high | ✅ (carried from #567) | — |
| 5 | completed crown proof read as ACTIVE / dominated the page | bank-builder/page.tsx | high | ✅ (collapsed in #567) | — |
| 6 | /today BB chip said "awaiting next card" while lanes active | today/page.tsx | med | ✅ (fixed #567) | — |
| 7 | Deploy CDN per-route cache lag misreads as "not deployed" | infra | low | n/a (documented) | cache-bust verify |
| 8 | innerText QA greps miss CSS-uppercased labels (false negatives) | QA tooling | low | n/a | use `-i` greps |
| 9 | historical crown proof lacks per-step legs | bank-builder/page.tsx | low | ❌ | add legs-per-step from crown source |
| 10 | MLB June-23 board absent (Odds API 0 events) | pipeline | low | ❌ (honest "No board") | generate once odds post |
| 11 | DC/DNB favourites often < −500 → excluded from the pick pool | model-qualified-picks.ts | low | partial (totals/BTTS/ML used) | consider a separate "anchor" band for display-only |
| 12 | Bruno Fernandes "Joao Felix" etc. unmatched players (id null) excluded by role gate | player-role-quality | low | n/a (correct) | improve identity matching |

## Verification
- **Tests:** 1279 / 1279 (7 new in `safer-lanes-multipick.test.mjs` + 1 game-page test reconciled to the per-market heading). **tsc** clean. **`next build`** clean.
- **Audits:** no banned public copy (caught + reworded "safest"); no secrets; protected data (bank-builder, results, methodology/dual, moonshot-lane, portfolio.json) UNTOUCHED — only `daily-portfolio.json` changed; no −5000 promoted.
- **Browser QA:** `/world-cup` table multi-pick + full names + internal scroll, no page overflow; `/bank-builder` team-market Step 4/Step 2 legs, $200/$9,926.17, no overflow; console clean.

## Deliberately NOT changed
- Active bankroll + crown (only settlement moves them); protected ladder/results data; exposure ($250) stays the seed amounts.
- Moonshot kept higher-upside (reviewed, refreshed — not made low-volatility).
- No settlement (games NS); no MLB board (odds unposted).

## Remaining backlog
1. Settle the active portfolio after June-23 finals; advance rungs.
2. Per-step legs under the historical crown proof.
3. Full /picks + /build product-section work; deeper game-detail layout.
4. MLB board once the Odds API posts June-23 markets.
