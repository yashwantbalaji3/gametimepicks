# June 23 Full Readiness — Lane A Settlement, Lane Progression, Moonshot Decision, Specials History, MLB, UI Polish

**Date:** Tuesday June 23 2026, ~2:05 AM ET. **Branch:** `june23-full-readiness-settlement-activation-polish` (off `origin/main` `68a474bf`, PR #563).
**Scope:** officially settle Lane A (Algeria), progress both Bank Builder lanes, keep June 23 picks ready, Moonshot activation decision, persist Specials history, attempt MLB June-23, UI/UX polish. **No crown / results mutation.**

| area | current state | action | data touched? | verified? |
|---|---|---|---|---|
| Lane A settlement | pending Algeria | settled WON (official) | dual + mr-dub | ✅ engine + ledger |
| Both lanes progression | advanced, currentStep stale | "awaiting next qualified card" view | code only | ✅ test + build |
| Moonshot activation | 2 ready candidates | KEEP READY (no safe multi-lane accounting) + dry-run tool | none | ✅ apply refused, $0 |
| Started-game guard | kickoff gates exist | audited; all surfaces gated | none | ✅ |
| Specials history | overwritten each slate | durable history (June 22 + 23) + UI | new history file | ✅ test + build |
| MLB June 23 | no board | NOT generated (odds not posted) — documented | none | ✅ dry-run 0 events |
| /today readiness | Lane B WON / Lane A awaiting | both lanes WON + $0 + MLB module | code only | ✅ |

## Phase 2 — official Jordan/Algeria verification (API-Football)
`Jordan 1-2 Algeria · FT (Match Finished, 90′) · winner=away=Algeria` (fixture 1489400). User's "Algeria won" report **confirmed officially**. (Earlier 00:22 ET it was 2H 1-0 Jordan; Algeria came back to win 1-2.)

## Phases 3-4 — Lane A stepped settlement (dry-run → apply)
Dry-run: Lane A Step 3 ($601.56 → $1464.71, +143) **CARD WON** — Egypt ML WON (NZ 1-3 Egypt FT) + Algeria ML WON (Jordan 1-2 Algeria FT). Unambiguous, official source present, correct shape → applied `--apply --lane lane-a`, then `node app/scripts/build-mr-dub-ledger.mjs` (the single accounting convention).

| field | before | after | expected | pass |
|---|---|---|---|---|
| active bankroll | $10,176.17 | **$10,176.17** | unchanged (won rolls) | ✅ |
| core open exposure | $100 | **$0** | $0 (both lanes settled) | ✅ |
| total exposure | $100 | **$0** | $0 | ✅ |
| core record | 9-2-0-1 | **10-2-0-0** | 10-2-0-0 | ✅ |
| Lane A | Step 3 pending | **3 steps settled WON · advanced** | won | ✅ |
| Lane B | settled WON | **settled WON** | unchanged | ✅ |
| crown | $10,376.17 / 5-0 | **$10,376.17 / 5-0** | untouched | ✅ |
| moonshot | 0-1 / $0 | **0-1 / $0** | separate, untouched | ✅ |

## Phase 5 — lane progression
`buildPublicDualLadder` now surfaces a fully-cleared lane (currentStep stuck on a cleared rung) as **`awaiting_next_card`** — headline "N steps cleared · Step X awaiting next qualified card", board chip "Awaiting next card". No active card, **no open exposure**, no stale pending copy. No core exposure is auto-placed (no next card forced).

## Phase 6 — Moonshot activation decision: KEEP READY
The ledger's Moonshot accounting (`build-mr-dub-ledger.mjs`) models a **single** active card, not multiple concurrent active lanes with summed exposure + per-lane settlement. Activating 2 lanes ($50) would be mis-accounted. Per the hard rule ("do not activate without a tested safe flow; do not partially implement unsafe activation"), candidates stay **READY ($0 exposure)**. Added `app/scripts/activate-moonshot-candidates.mjs` — a **dry-run-only** decision tool that evaluates candidates against the rules (pre-event, +600..+2000, ≥2 games, ≤2 lanes, ≤$50) and **refuses `--apply`** with an explicit reason (no mutation). Tracker copy already states "evaluated pre-event · not activated · $0 exposure".

## Phase 7 — started-game guard (audited)
All public surfaces already gate on kickoff and were verified: props matrix + /build pool (pre-event filter on team kickoff), `loadWorldCupPlayerPropLegs` (pre-event), Moonshot `candidateReadiness` (ready / kickoff_too_close <30m / expired after kickoff), Specials `specialsAllPreEvent` + `deriveSpecialsTracker` (candidate→pending→settled). The new Specials history is archive-only (no playable CTAs). No public card looks pre-event once a leg starts.

## Phase 8 — Specials history persistence
New `app/scripts/archive-world-cup-specials.mjs` (idempotent, compact, no fabricated outcomes) writes `public/data/world-cup/world-cup-specials-history.json` (v1). Seeded with **June 22 (git-recovered) + June 23 (current)** — 5 cards each. Loader `loadWorldCupSpecialsHistory` + `specialsPastSlates`; `/world-cup-specials` shows a "Past slates" history section. Exposure stays $0; record separate. Honest: June-22 cards archived as recorded (pre-settlement statuses; not re-graded), labelled "Archived".

## Phase 9 — MLB June 23: NOT generated (documented, not faked)
MLB statsapi has 15 games / 14 with probables for June 23, BUT the Odds API returns **0 MLB events** for the date (`fetch_game_markets --dry-run` → 0 games, 0 credits) — books haven't posted markets yet. Per the hard rule (no odds → no board; don't fake it), **no June-23 MLB board was written**. `/mlb` continues to show the latest real board (June 22); `/today` MLB module reads "No board · odds not posted yet". (The general NBA/board generator was run once, returned NoGames, and its stray output was reverted — no MLB data faked.)

## Phase 11 — /today readiness dashboard
8-module strip (lg 2×4): Bank Builder (**Both lanes WON · awaiting next card · $0**), Mr. Dub (**10-2** · official settlement), World Cup (4 games), Model Player Props (12 picks / 168 evaluated), Parlay Lab (cards), **MLB (No board · odds not posted)**, Moonshot (2 ready · $0), World Cup Specials (5 candidates · $0).

## Verification
- **Tests:** 1244 / 1244 — 9 new (`june23-readiness-settlement.test.mjs`) + 28 reconciled across 19 files to the post-settlement state (10-2-0-0, $0, both lanes awaiting next card; bankroll $10,176.17 + crown $10,376.17 kept). **tsc:** clean. **`next build`:** clean.
- **Audits:** no banned public copy; no secrets; **crown (`bank-builder/*`) + `results/` untouched**; money-data change is the authorized official Lane A settlement; no fabricated MLB board; Specials history is archive-only.

## Deliberately NOT changed
- Crown / results — untouched. Moonshot exposure — $0 (kept ready; multi-lane accounting deferred).
- No June-23 MLB board faked (odds not posted).
- June-22 Specials history archived as-recorded (not re-graded from box scores).

## Remaining backlog
1. Moonshot multi-lane active accounting (sum exposure across lanes, per-lane settlement, separate record aggregation) + tests → then enable `activate-moonshot-candidates.mjs --apply`.
2. Re-grade archived June-22 Specials from official box scores (settled hit/miss) when the WC specials settlement pass runs.
3. MLB June-23 board once the Odds API posts markets (`fetch_game_markets --sport mlb` + snapshot_curated/parlays); wire `/mlb` + `/today` live.
4. Generate Lane A/B next-step qualified cards once a pre-event, odds-backed slate clears the risk gates.
