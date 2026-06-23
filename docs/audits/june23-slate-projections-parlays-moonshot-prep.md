# June 23 Slate Preparation — Projections, Parlays, Specials, Moonshot Candidates

**Date:** Monday June 22 2026, ~9:55 PM ET (preparing the **June 23** slate ahead of time). **Branch:** `june23-slate-projections-parlays-moonshot-prep` (off `origin/main` `14648ee8`, PR #560).
**Principle honored:** prepare cards early from real odds; **do not place/activate exposure** late, after kickoff, or with fake pricing. No core bankroll/exposure/record/crown changed.

## Phase 1 — official June 23 slate (API-Football, verified)
| game | fixture id | kickoff ET | status | eligible? |
|---|---|---|---|---|
| Portugal vs Uzbekistan | 1489404 | 1:00 PM | **NS** | ✅ pre-event |
| England vs Ghana | 1489402 | 4:00 PM | **NS** | ✅ pre-event |
| Panama vs Croatia | 1489403 | 7:00 PM | **NS** | ✅ pre-event |
| Colombia vs DR Congo | 1539008 | 10:00 PM | **NS** | ✅ pre-event |

All four NS, ~15–24h out → eligible for projection + candidate generation.

## Phase 2-3 — real odds + projections
Ran `build_odds_only_projections.py --date 2026-06-23` (The Odds API, h2h+totals; **18,167 credits remaining**) → **4 fixtures, 19 market projections** (ML×4, totals×3, double-chance×4, BTTS×4, DNB×4). Then `build_player_props.py --date 2026-06-23` → **168 player props** (anytime scorer / SOT / assists / shots ×42 each; 152 matched / 16 unmatched). All from real sportsbook odds — no fabrication, no placeholder/`-1000` legs.

## Phase 4-5 — Parlay Lab + World Cup Specials
`build_suggested_parlays.py` → WC suggested-parlay cards; `refresh-lineup-aware-slate.mjs --date 2026-06-23 --mode auto_public_board` (candidate-only — never auto-places Bank Builder/Moonshot) → **5 World Cup Specials** (combined +1023 / +1442 / +1490 / +1908 / +2407) + **coverage matrix grandTotal 71**. The public board (projections/props/parlays/specials/coverage `latest.json`) rolled to **2026-06-23**. The `/world-cup-specials` tracker shows the 5 cards as **pre-event candidates** (all games NS tomorrow). Lineups not posted yet (XI=0) — player legs are limited-data/market-implied, disclosed.

## Phase 6 — Moonshot lanes (candidates, ready)
Replaced the now-expired June-22 candidates with two June-23 candidates from **real odds**, each **two legs from two different games** (independent parlay — no SGP):
- **Moonshot Lane A — grounded cross-game longshot** (+1044, $25 → $286.00): Ghana or Draw **+340** (England/Ghana) × DR Congo or Draw **+160** (Colombia/DR Congo).
- **Moonshot Lane B — higher-volatility player props** (+1715, $25 → $453.75): James Rodríguez anytime **+230** (Colombia/DR Congo) × Tomás Rodríguez Mena anytime **+450** (Panama/Croatia).

**Activation decision:** both pass the activation rules (≥2 independent games, all legs >30 min pre-event, odds-backed, in the +600..+2000 band) → `candidateReadiness = "ready"`. They are **NOT activated** — exposure stays **$0** (no automated place-exposure flow that updates the portfolio exists; manual approval). `/moonshot` + `/mr-dub` render them as **"Ready to activate."** The stopped June-22 lane (record 0-1, +1152 card) is retained as history.

## Phase 7 — Bank Builder candidate
**No new active core lane.** Lane A (Step 3) and Lane B (Step 1) are still un-settled; the model is single-active-lane-per-track and the brief forbids overlapping a new core lane while existing ones are pending. No Bank Builder data changed.

## Phase 8 — June 22 settlement checkpoint
Re-verified official (API-Football): Argentina **2-0** Austria (FT), France **3-0** Iraq (FT), Norway **3-2** Senegal (FT); Jordan/Algeria still **NS** (11 PM).
- **Lane B Step 1 is now fully final and WON**: Argentina ML ✓ + France/Iraq **Under 3.5** ✓ (3 goals < 3.5).
- **Lane A** stays **pending** (Algeria leg's game NS).

**Deferred (not settled this PR):** the existing `settle_active_dual_bank_builder.py` only grades WC *double-chance* + MLB *strikeout* legs on the legacy top-level `lane.legs` shape — it does **not** handle Lane B's plain WC moneyline + total on the current *stepped* artifact, so running it (or hand-editing the bankroll) would risk **incorrect accounting**. Per the "trustworthy records" bottom line, Lane B's WON settlement is documented + deferred to a dedicated correct settlement run. **No bankroll/record/data mutation.** active $10,176.17 · record 8-2-0-2 · crown $10,376.17 all unchanged.

## Verification
- **Tests:** 1221 / 1221 (19 date-coupled tests reconciled June-22→June-23 by a subagent — test-only edits, money/PROTECTION invariants kept intact: dual-bank Gonzales/Hoskins, moonshot +1152, openExposure 200, totalOpenExposure 200, crown 10376.17). **tsc:** clean. **`next build`:** clean.
- **Audits:** no banned copy; `.env` untracked / no secrets; **money data (bank-builder, results, mr-dub, methodology) untouched**; no extreme odds (no candidate leg < −500); all moonshot candidate legs pre-event at generation; no started game in any active card (none placed).
- **Browser QA (mobile 375):** `/moonshot` June-23 candidates "ready to activate" + stopped history; `/world-cup-specials` 5 June-23 pre-event candidates; header "Latest slate · Jun 23 · Pregame slate"; zero overflow; console clean.

## Deliberately NOT changed
- No exposure placed/activated (candidates only; manual approval flow absent).
- Lane B WON settlement deferred (incompatible settlement script — protect accounting).
- No MLB June-23 board (WC-only target slate; latest MLB stays 2026-06-22).
- Bank Builder / Mr.Dub core slips / Results rendering — existing tested components.
- Core bankroll, exposure, records, crown — untouched.

## Remaining backlog
1. **Correct dual-bank settlement path** for the stepped artifact (grade plain WC ML + WC totals), then settle Lane B WON (Argentina + France/Iraq Under 3.5) → record 9-2, advance Lane B.
2. Activate Moonshot lanes from "ready" candidates if/when a place-exposure flow + accounting tests exist (→ moonshot exposure $25–$50).
3. Generate the MLB June-23 board if an MLB slate is wanted.
4. Persist settled WC Specials history across days.
