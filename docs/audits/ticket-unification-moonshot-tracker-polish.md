# Ticket Surface Unification + Moonshot Daily Tracker

**Date:** Monday June 22 2026, ~6pm ET. **Branch:** `ticket-unification-moonshot-tracker-polish` (off `origin/main` `284f8106`, PR #556).
**Scope:** shared sportsbook ticket primitives + a dedicated **Moonshot Lane daily tracker** (`/moonshot`) + Today polish. **UI only — no data, bankroll, exposure, settlement, or crown logic touched; zero data files changed.**

## Phase 1 — verified state (preserved, no P0)
active bankroll **$10,176.17** · core exposure **$200** · total **$200** · core record **8-2-0-2** · crown **$10,376.17** (untouched) · Moonshot **stopped, 0-1, $0** · Lane A Step 3 pending · Lane B Step 1 pending. June 22 legs not all final → no settlement performed (pure UI sprint).

| area | current state | issue | fix | done |
|---|---|---|---|---|
| ticket primitives | each surface rolled its own pills/odds | inconsistent, duplicated | shared `components/tickets/` set | ✅ |
| Moonshot journey | only a compact card on /bank-builder + Mr.Dub | no day-by-day tracker like Bank Builder | dedicated `/moonshot` route + `MoonshotLaneTracker` | ✅ |
| Moonshot discoverability | buried | hard to find | rail + top nav + CTAs from today/bank-builder/mr-dub | ✅ |
| /today internal jargon | "survival score (volatility, DNP/lineup, odds-band)" | reads internal | softened to "strict survival gate" (V2 label kept) | ✅ |
| WC Specials hit/miss rows | already green/red/gray (PR #553) | none | left as-is (already matches the pattern) | n/a |

## Shared ticket primitives (`app/src/components/tickets/`)
`OddsPill` (prominent American odds, gold/lava/violet/mute tones, sm/md/lg) · `StatusPill` (active/pending/settled/hit/miss/void/archived/data_pending/stopped/won/lost) · `RiskPill` (low/medium/high/longshot via `--risk-*`) · `SettlementBadge` (+ `normalizeLegResult` for won/lost↔hit/miss) · `TeamIdentity` (FlagBadge + matchup + kickoff, initials fallback, no fabricated logos) · `LegRow` (matchup, selection, market/line, kickoff ET, odds, HIT/MISS/PENDING + official) · `TicketCard` (lava/violet/gold stripe, risk+sport+status pills, prominent odds, stake → projected return, legs, footer).

## Moonshot Lane Tracker — `/moonshot`
A day-by-day journey like Bank Builder, **its own separate lane** (never blended into the core record):
- Summary strip: status pill (**Stopped**), record **0–1**, exposure **$0.00**, step **1 of 3**, target **$3,000**; "not part of the core Dual Bank Builder" disclosure; paper-only.
- Daily cards (TicketCard, violet) — **known runs only, never fabricated**:
  - **Step 1 · Cross-slate · Jun 21+22** — +1152, $25 → $312.99, **LOST**: NZ/Egypt BTTS No **MISS** (official "New Zealand 1-3 Egypt FT") + Norway/Argentina/Jordan legs **PENDING** (dead-parlay); footer explains the stop.
  - **Prior run · Jun 19** — +808, $25 → $227.01, **LOST**: Morocco **HIT**, Vinícius **HIT**, Saibari **HIT**, Turkey-or-Draw **MISS**.
- Restart state: "Awaiting a qualified higher-volatility card. Nothing active; exposure $0.00."
- Honesty note: "known Moonshot runs only — earlier history before June 19 is not backfilled (no fabricated cards)."
- Entry points: command rail (Bankroll group, 🌙 Moonshot) + mobile top nav + CTAs on `/today` (BB status rail), `/bank-builder` (moonshot card), `/mr-dub` (moonshot section). Mobile bottom nav highlights **Bank** for `/moonshot`.

## Record / exposure integrity (confirmed)
The Moonshot record (**0-1**) and exposure (**$0**) are read from `portfolio.moonshot.*` and rendered separately; the core record (**8-2-0-2**) and core exposure (**$200**) are unchanged. Crown **$10,376.17 / 5-0** untouched. No artifact mutated.

## Verification
- **Tests:** 1215 / 1215 pass (+7 new: primitives exist, /moonshot renders, tracker stopped/LOST with hit/miss/pending + separate record, lane artifact 0-1, nav reachability + Bank bucket, CTAs, crown untouched). **tsc:** clean. **`next build`:** clean (exit 0; `/moonshot` route built).
- **Audits:** no banned public copy in the diff; `.env` untracked / no secrets; **zero data files changed** (crown/results/mr-dub/bank-builder/moonshot artifacts all untouched).
- **Desktop QA (1440):** /moonshot renders the tracker + rail shows "🌙 Moonshot" active; zero overflow, console clean.
- **Mobile QA (375 + 320):** /moonshot — premium violet tickets, HIT/MISS/PENDING leg rows, odds price pills, no overflow; bottom nav highlights Bank.

## Deliberately NOT changed
- No bankroll/exposure/settlement/crown logic; no settlement performed.
- WC Specials box kept its existing green/red/gray rows (already matches the pattern; refactor = churn + test risk for no visible gain).
- Bank Builder lane cards + Parlay Lab cards kept their existing (already-upgraded, tested) rendering rather than swapping to the new primitives in this pass.

## Remaining backlog
1. Refactor Bank Builder lane cards, World Cup Specials, Parlay Lab `ParlayCard`, and Mr. Dub slips to consume the shared `tickets/` primitives (one rendering path everywhere).
2. Render the `MoonshotLaneTracker` inline on `/mr-dub` (not just a CTA) once the slip refactor lands.
3. Fold `PicksSurfaceHeader` status/counts into `SportOverviewHero` for full header unity.
