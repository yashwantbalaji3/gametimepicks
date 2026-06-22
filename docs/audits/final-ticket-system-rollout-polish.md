# Final Ticket-System Rollout + Unified Sportsbook Polish

**Date:** Monday June 22 2026, ~7pm ET. **Branch:** `final-ticket-system-rollout-polish` (off `origin/main` `7cbbe787`, PR #557).
**Scope:** roll the shared ticket system + header family across more surfaces. **UI only — no data, bankroll, exposure, settlement, or crown logic touched; zero data files changed.**

## Phase 1 — verified state (preserved, no P0)
active **$10,176.17** · core exp **$200** · total **$200** · core record **8-2-0-2** · crown **$10,376.17** · Moonshot **stopped, 0-1, $0** · Lane A Step 3 pending · Lane B Step 1 pending. No settlement performed.

| surface | current card system | target | data touched? | implemented | verified |
|---|---|---|---|---|---|
| Mr. Dub Moonshot section | bespoke status block | inline `MoonshotLaneTracker` (compact) | no | ✅ | ✅ |
| `MoonshotLaneTracker` | full-only | + `mode`/`maxCards`/`showHistory` | no | ✅ | ✅ |
| `/picks`, `/build`, `/moonshot` headers | lava-stripe card | sport-hub cinematic family | no | ✅ | ✅ |
| Parlay Lab `ParlayCard` odds | bespoke inline pill | shared `OddsPill` | no | ✅ | ✅ |
| Bank Builder lanes / WC Specials / Mr.Dub core slips | already premium + tested | shared primitives | no | ⏸ backlog | — |

## What shipped
1. **Inline Moonshot tracker on `/mr-dub`** — `MoonshotLaneTracker` gained a `mode="compact"` (also `maxCards`, `showHistory`); the bespoke Mr. Dub Moonshot block was replaced with the compact tracker (summary strip → current LOST card with HIT/MISS/PENDING leg rows → "Next" → "Open the full Moonshot daily tracker →"). The Mr. Dub-specific exposure line ("🌙 exposure $0 · separate from the $200 core lanes (total $200) · does not affect the core Lane A/B record") is retained above it. The stale "awaiting a qualified card" copy is gone. `/moonshot` remains the canonical full tracker (shows the prior June-19 run too).
2. **Header family unity** — `PicksSurfaceHeader` now renders on the same cinematic backdrop as the sport hubs' `SportOverviewHero` (`gtp-cinematic-bg-accent` + `gtp-hero-halo` + `gtp-neon-rule` + pulsing-dot eyebrow), so `/picks`, `/build`, and `/moonshot` read as the same product family as `/world-cup`, `/mlb`, `/nba`, `/ufc`. Props/API unchanged.
3. **Parlay Lab safe primitive swap** — `ParlayCard`'s bespoke combined-odds pill is now the shared `<OddsPill size="lg" tone="gold" />`. Coverage matrix, filters, leg detail, and the 40-card render are untouched.
4. **Today** — already de-jargoned (#556) with a 🌙 Moonshot CTA on the Bank Builder rail (#557); confirmed clean this pass.

## Verification
- **Tests:** 1215 / 1215 pass (the Mr. Dub Moonshot test assertion updated from a raw `/moonshot` link to rendering `MoonshotLaneTracker`). **tsc:** clean. **`next build`:** clean (exit 0).
- **Audits:** no banned public copy in the diff; `.env` untracked / no secrets; **zero data files changed** (crown/results/mr-dub/bank-builder/moonshot artifacts all untouched).
- **Mobile QA (375 + 320):** `/mr-dub` inline compact tracker (current card only, prior run hidden, full-tracker CTA), `/picks` + `/moonshot` cinematic headers — zero overflow, console clean, bankroll preserved ($10,176.17 + $10,376.17).
- **Desktop QA:** `/picks` cinematic header matches the sport-hub family; shared OddsPill renders on cards.

## Bankroll / exposure / crown confirmation
active **$10,176.17** · core exp **$200** · moonshot exp **$0** (separate) · core record **8-2-0-2** · moonshot **0-1** (separate) · crown **$10,376.17 / 5-0** untouched. No artifact mutated; no settlement run.

## Deliberately NOT changed (per the brief's "extract gradually / document backlog" guidance)
- **Bank Builder lane cards** (`dual-ladder-board.tsx`) — already render premium enriched leg detail + HIT/MISS/Pending badges (#553/#554) under test; a full swap to `tickets/` primitives risks those assertions for no user-visible gain.
- **World Cup Specials box** — already renders green/red/gray HIT/MISS/PENDING rows (#553); unchanged.
- **Mr. Dub core Lane A/B slips** — rendered by the tested `DualLadderBoard`; left as-is.
- **Results page** — historical; not refactored.
- No settlement (June 22 legs not all final).

## Remaining backlog
1. Migrate `dual-ladder-board` lane cards, the WC Specials box, and the Mr. Dub core slips to the shared `tickets/TicketCard` + `LegRow` (one render path) — do it behind updated tests, incrementally.
2. Swap Parlay Lab `RiskPill`/leg chips to the shared primitives (kept the existing `Chip`/`RISK_LABELS` this pass to avoid the risk-matrix test coupling).
3. Fold `PicksSurfaceHeader` + `SportOverviewHero` into a single `SurfaceHeroShell` base now that they share the cinematic backdrop.
