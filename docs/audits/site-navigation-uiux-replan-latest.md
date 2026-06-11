# Site Navigation + UI/UX Replan (latest)

## Current state (audit)
- **Routes:** `/` (home), `/projections`, `/parlay-lab`, `/bank-builder`, `/results`,
  `/world-cup` (+ `/world-cup/schedule|groups|teams|team/[code]`), `/nba`, `/mlb`, `/ufc`,
  `/events`, `/methodology`. Top nav exists; sport pages are inconsistent in tab structure.
- **What works:** projections + parlay-lab + bank-builder + results are coherent for NBA/MLB.
  World Cup now has model probability views (ML, double chance, goals, corners), suggested
  cards, a market-status matrix, and a market outlook.
- **Pain points:** (1) no single "today" daily board — users can't see at a glance what's live
  across sports; (2) sport pages don't share a consistent tab set; (3) World Cup content is
  rich but several sections stack vertically (scannability); (4) mobile nav is a hamburger with
  no quick bottom access to the daily essentials.

## Proposed model (incremental, low-regression)
1. **Daily Board on Home** — a top strip summarizing today by sport (games, projections,
   cards, Bank Builder status) sourced from a `daily/latest.json` index, each linking into the
   sport. *(Index + tile — additive, no rewrite.)*
2. **Consistent sport tabs** — Overview · Games · Projections · Player Props · Parlays ·
   Results · Methodology, applied per sport page over time.
3. **Shared status vocabulary** — Live / Eligible / Model view / Waiting / Unavailable chips
   (already standardized in the World Cup market matrix; promote to a shared `StatusBadge`).
4. **Mobile** — add a bottom nav (Daily · Projections · Parlays · Bank Builder · Sports).
5. **Visual** — keep the dark premium theme; add per-sport accent (soccer gold/green, MLB
   red/blue, NBA orange/blue, UFC red) on cards + tabs.

## Sequencing (so the working site never regresses)
- **Done this sprint:** hybrid soccer parlay thresholds (cards now publish), double-chance
  market, public projection views, World Cup market-status matrix, MLB June 11 daily board.
- **Next (separate PRs, each verified):** daily index + Home daily board → shared StatusBadge
  + ProjectionCard/ParlayCard normalization → consistent sport tabs → mobile bottom nav →
  per-sport accent pass. A full app-shell/design rewrite is intentionally NOT done in one PR;
  it would risk the working NBA/MLB/UFC/Bank-Builder surfaces. Each step ships behind tests +
  production verification.
