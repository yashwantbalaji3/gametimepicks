# Full Product UI/UX Consolidation + Sportsbook-Style Polish

**Date:** Monday June 22 2026, ~5pm ET. **Branch:** `full-product-uiux-consolidation-polish` (off `origin/main` `5c0082a4`, PR #555).
**Scope:** Consolidate the parlay routes, de-jargon `/today`, add a shared pick-surface header, fix alias active states, and upgrade the ticket card — all UI-only. **No data, bankroll, settlement, or exposure logic touched.**

## Phase 1 — verified state (data integrity preserved)
Mr. Dub bankroll **$10,176.17** · core exposure **$200** · total **$200** · record **8-2-0-2** · crown **$10,376.17** (untouched) · Moonshot **stopped, 0-1, $0** · Lane A Step 3 pending · Lane B Step 1 pending. Games at 5/8/11 PM ET are not all final, so **no settlement is in scope** — this is a pure UI pass. No data file is modified by this PR.

| area | current state | user confusion | fix | done |
|---|---|---|---|---|
| `/picks` vs `/parlays` vs `/parlay-lab` | 3 surfaces (picks=Parlay Lab lobby, parlays=parallel page, parlay-lab=redirect) | "which is the real parlay page?" | one canonical `/picks` (Parlay Lab); `/parlays` + `/parlay-lab` redirect | ✅ |
| `/today` density | "Methodology engine · STEP 2 LIVE · 1/2 lanes cleared" | internal/backend language | user-facing "Today's model picks" → Open Parlay Lab; rail sub softened | ✅ |
| pick-surface headers | `/picks` + `/build` used a plain SectionHeader; sport hubs use SportOverviewHero | inconsistent "is this the same product?" | shared `PicksSurfaceHeader` (status pill + count chips + paper-only + CTA) on `/picks` + `/build` | ✅ |
| mobile/desktop alias active states | `/parlays`+`/parlay-lab` highlighted Build, not Parlay Lab | wrong tab highlighted | all three highlight **Parlay Lab** in rail + top nav + bottom nav | ✅ |
| ticket cards | small odds, 4 chips/leg | cluttered, weak hierarchy | ticket top-accent + prominent odds **price pill** + leg chips trimmed 4→2 | ✅ |

## What shipped
1. **Route consolidation** — `/parlays/page.tsx` is now a `redirect("/picks")` (was a parallel page); `/parlay-lab` already redirected. `/picks` ("Parlay Lab") is the single source of truth. Cross-links on `/today`, `/methodology`, and game-detail repointed to `/picks`.
2. **/today de-jargon** — the "Methodology engine" card became **"Today's model picks"** ("N model-ranked parlays across 2 sports — tap to open the Parlay Lab"); removed "STEP n LIVE" and "1/2 lanes cleared Step 1" from the dashboard. Bank Builder status keeps its own labeled rail (sub softened to "1 of 2 lanes advanced").
3. **Shared `PicksSurfaceHeader`** — new `components/picks-surface-header.tsx`: lava top accent, eyebrow + slate date, status pill (pregame/live/settled/review/data_pending), count chips, primary/secondary CTA, paper-only note. Applied to `/picks` and `/build`. (Sport hubs already share `SportOverviewHero`.)
4. **Alias active states** — `nav-active-route.ts`, `command-rail.tsx`, `nav.tsx`: `/picks` + `/parlays` + `/parlay-lab` all resolve to the **Parlay Lab** bucket; `/build` is its own (custom builder). Verified bottom nav highlights "Parlay Lab" on `/picks`.
5. **Ticket upgrade** (`ParlayCard` in `parlays-explorer.tsx`) — ticket-style lava top stripe, larger padding, and a prominent sportsbook **odds price pill** as the headline; leg summary chips trimmed from 4 (confidence/quality/edge/model%) to the 2 most meaningful (confidence + edge) — the rest stay in the expandable leg detail. Removed the now-unused `qualityTone` helper.

## Page-by-page pick visibility (browser-verified)
Today ✅ (model picks + BB rail + Mr.Dub) · Parlay Lab `/picks` ✅ (new header, 40 suggested cards, coverage matrix, 29 odds pills) · `/parlays`+`/parlay-lab` ✅ redirect to Parlay Lab · Build ✅ (eligible-leg pool, new header) · World Cup ✅ · MLB ✅ · NBA ✅ (honest offseason, no stale outlook — from #555) · UFC ✅ (honest "event settled") · Bank Builder ✅ (Lane A/B + Moonshot + crown) · Mr. Dub ✅ (bankroll $10,176.17 + crown $10,376.17) · Results ✅.

## Verification
- **Tests:** 1208 / 1208 pass (updated nav-active-route + coverage-matrix tests for the consolidation). **tsc:** clean. **`next build`:** clean (exit 0; `/parlays` + `/parlay-lab` build as redirect stubs, `/picks` full). 
- **Audits:** no banned public copy in the diff; `.env` untracked / no secrets; **no data files changed** — bank-builder, results, mr-dub artifacts all untouched.
- **Desktop QA (1440):** /today, /picks, /world-cup, /bank-builder, /mr-dub, /results — zero horizontal overflow, console clean; odds price pills render (lava, 700 weight).
- **Mobile QA (375 + 320):** /picks + /today — zero overflow, header + chips wrap cleanly, bottom nav highlights "Parlay Lab", Active/Crown chips distinct, console clean.

## Deliberately NOT changed
- No bankroll/exposure/settlement logic; no settlement performed (June 22 legs not all final).
- Protected crown history + completed ledger untouched.
- Sport hubs kept their existing `SportOverviewHero` (already consistent) rather than a risky swap to `PicksSurfaceHeader`.
- The full ground-up rewrite of every card surface (Bank Builder / Moonshot / Specials / Mr. Dub slips) — the ticket upgrade landed on the primary Parlay Lab card; rolling the same price-pill/badge-trim pattern to the other surfaces is the main backlog item (see below).

## Remaining UX backlog
1. Roll the ParlayCard ticket pattern (price pill, fewer chips, bigger slip) to Bank Builder active cards, Moonshot, World Cup Specials, and Mr. Dub slips.
2. Extract shared `OddsPill` / `StatusPill` / `RiskPill` / `TeamIdentity` primitives so every surface uses one set.
3. Apply `PicksSurfaceHeader` (or fold its status/counts into `SportOverviewHero`) for full cross-surface header unity.
4. `/today` second pass: the Bank Builder rail's V2 "survival score" paragraph is still semi-internal when no run is launched.
