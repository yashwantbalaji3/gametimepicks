# /simulate Featured Freshness Fix — 2026-07-14

**Founder bug:** on July 14, `/simulate` (and the homepage) featured the **old July-11 MLB slate** (Athletics @
White Sox, Rockies @ Giants, …) as "today's games", while the live focus is the World Cup semifinals. Money
untouched (md5 `affe6b21`).

## Root cause
`featuredSimulations()` only featured games with `gameLabSimulation.status === "ready"` (MLB 10k sims) and sorted
by edge with **no recency**. World Cup games are market-IMPLIED (status `none`), so they were **excluded
entirely**, leaving only the 16 stale July-11 MLB "ready" sims — which then filled the featured row 3 days late.

## Fix (`lib/simulate-lobby-featured.ts`, pure + tested)
- **Recency:** the selector now takes `today`. Current/upcoming games (`date >= today`) are featured and stale
  games are **dropped** once any current game exists. Only when there is no current/upcoming game does it fall
  back to the most-recent slate, and `allCurrent` reports which case it is (the lobby eyebrow reads "Latest
  available slate" on the fallback).
- **World Cup inclusive:** a WC game with a real market-implied report (`wcGameCenter`/`gameLabWc`) is now
  featurable, labelled `mode: "market-implied"` with **no run-count claim** (never a fake 10k soccer sim).
- Call sites (`/`, `/today`, `/simulate` lobby) pass `currentEtDate()`. The featured card renders the correct
  logos (real WC provider URLs), a "Market-implied" badge (vs "Simulation Ready" for MLB), and the sport label.

## Verified (built export, July-14)
`/simulate` + `/` feature **France vs Spain + England vs Argentina** ("Market-implied"); the July-11 MLB cards are
**gone** from the featured row (they remain reachable in the full games list). Tests: `simulate-featured-freshness.test.mjs`
(recency drops stale; WC featurable + honest label; fallback flagged; a WC game with no report is not featured).

## Honesty
No fake independent soccer sim, no 10k soccer claim, no run-count on WC cards, no fabricated games. The WC cards
are labelled market-implied; MLB keeps its real run-simulation label only where the artifact allows it.
