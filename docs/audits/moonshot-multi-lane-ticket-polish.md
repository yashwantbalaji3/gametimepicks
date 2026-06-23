# Moonshot Multi-Lane Expansion + Ticket Polish

**Date:** Monday June 22 2026, ~7:55 PM ET. **Branch:** `moonshot-multi-lane-ticket-polish` (off `origin/main` `4f0f1285`, PR #558).
**Scope:** add odds-backed Moonshot lanes for the remaining June 22 games as a multi-lane (v2) model, kept fully separate from the core Bank Builder. **No core bankroll/exposure/record/crown changed.**

## Phase 1 — official game status (API-Football, `league=1` season 2026, ET)
| game | kickoff ET | official status | score | eligible for new pre-event card? |
|---|---|---|---|---|
| Argentina vs Austria | 1:00 PM | **FT** | 2-0 | no (finished) |
| France vs Iraq | 5:00 PM | **INT** (interrupted/started) | 1-0 | no (started) |
| Norway vs Senegal | 8:00 PM | **NS** (not started) | — | yes, but **at kickoff** (~5 min) |
| Jordan vs Algeria | 11:00 PM | **NS** (not started) | — | yes (comfortably pre-event) |

## Phase 2 — eligibility decision
Both target games (Norway/Senegal, Jordan/Algeria) were officially **NS** at generation. But it was 7:53 PM with Norway/Senegal kicking at 8:00 PM, and any deploy lands **after** kickoff — placing new active Moonshot exposure on it would violate "do not place new Moonshot exposure after game start." Jordan/Algeria alone is a single game (multi-leg = same-game correlation, which can't be priced without fabricating an SGP).

**Decision:** generate the two requested lanes as **CANDIDATES** (real odds, honest combined price, **$0 exposure, not activated**) rather than placing exposure on an at-kickoff game. This delivers the multi-lane Moonshot product + the requested games honestly while respecting every non-negotiable.

## New Moonshot candidates (real odds from the June 22 odds_api artifacts)
Each card is **two legs from two different games** → an ordinary independent-game parlay (no same-game SGP fabrication; combined = product of the real leg decimals).
- **Moonshot Lane A — grounded cross-game longshot** (+690, $25 → $197.44): Senegal ML **+225** (Norway/Senegal) × Jordan or Draw **+143** (Jordan/Algeria).
- **Moonshot Lane B — higher-volatility player props** (+1545, $25 → $411.35): Ismaila Sarr Anytime Goalscorer **+280** (Norway/Senegal) × Musa Al Tamari Anytime Goalscorer **+333** (Jordan/Algeria) — limited-data (lineups not posted), market-implied, disclosed.

Each leg carries matchup, market, odds, kickoff ET, bookmaker/provider (The Odds API), and settlement source (API-Football). Combined odds reconcile with the leg product (tested) — no fabricated price.

## Multi-lane v2 model (backward compatible)
The `moonshot-lane/active.json` artifact gained a `candidates[]` array + `candidatesNote` (additive only). The existing stopped lane, ladder, `priorRun` history, `currentStep`, and `status` are **unchanged**. `MoonshotLane` type extended with optional `candidates?` / `MoonshotCandidate` / `MoonshotCandidateLeg`.

## Accounting / separation (all preserved)
Candidates are **not placed** (`activated:false`) → **$0 exposure**. Moonshot record stays **0-1**, exposure **$0**, status **stopped**. Core record **8-2-0-2**, core exposure **$200**, active bankroll **$10,176.17**, total exposure **$200**, crown **$10,376.17 / 5-0** — all unchanged. Moonshot never blends into the core.

## UI
- **`/moonshot`**: the tracker now renders a "Moonshot Candidates" section (TicketCard + LegRow + OddsPill + StatusPill "Candidate"), each leg with HIT/MISS/PENDING (pending) + kickoff + settlement source, plus the "evaluated pre-event · not activated · $0 exposure" labeling — above the existing stopped history.
- **`/mr-dub`**: the compact inline tracker shows the candidates section (1 in compact) with the count.
- **`/today`**: keeps the 🌙 Moonshot CTA (Bank Builder rail) from #557.

## Verification
- **Tests:** 1216 / 1216 (+1 new: candidates use only pre-event games, distinct-game legs (no SGP), combined odds reconcile with legs, ≥ +600, not placed, exposure/record unchanged). **tsc:** clean. **`next build`:** clean.
- **Audits:** no banned copy; `.env` untracked / no secrets; **core/crown data (bank-builder, results, mr-dub) untouched**; only `moonshot-lane/active.json` changed (candidates added — verified additive, stopped lane/record intact); no extreme odds (no leg < −500); combined prices reconcile with real leg odds.
- **Browser QA (mobile 375 / 320 + desktop):** `/moonshot` candidates + stopped history render; `/mr-dub` compact tracker renders the candidate; zero horizontal overflow; console clean; bankroll/crown preserved.

## Deliberately NOT changed
- No active Moonshot exposure placed (Norway/Senegal at kickoff → candidates only).
- No settlement (nothing final that needs grading).
- Bank Builder lane cards / WC Specials box / Mr.Dub core slips / Results — kept on their existing tested rendering (full `tickets/` migration remains backlog, as in #557/#558).
- Core bankroll, exposure, record, crown — untouched.

## Remaining backlog
1. When a slate has ≥2 comfortably-pre-event independent games, **activate** Moonshot lanes (place $25 each → moonshot exposure $50, total $250) from candidates.
2. Migrate `dual-ladder-board` / WC Specials box / Mr.Dub core slips to the shared `tickets/TicketCard`+`LegRow` (behind updated tests).
3. Add a `/today` Moonshot status strip (candidate/active count + next kickoff).
4. Fold `PicksSurfaceHeader` + `SportOverviewHero` into one `SurfaceHeroShell`.
