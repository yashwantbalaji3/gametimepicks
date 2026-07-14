# World Cup Player-Props Pilot (Phase C) — 2026-07-13

Scope: the first real market-expansion feed for World Cup soccer — anytime goalscorer + player shots /
shots-on-target (+ assists). **The feed exists and works**, so this is the *ingest + expose* path, not a
provider-decision doc. No official-money change (md5 `affe6b21`); nothing fabricated.

## Audit (what I found)
| dimension | finding |
|---|---|
| **Odds API coverage** | ✅ `soccer_fifa_world_cup` events → `/events/{id}/odds` returns `player_goal_scorer_anytime`, `player_shots`, `player_shots_on_target` (verified live: France v Spain, **6 bookmakers**, real players e.g. "Aymeric Laporte", "Kylian Mbappe"). |
| **Existing artifacts** | ✅ Already ingested: `world-cup/player-projections/latest.json` = **48 props** (24/fixture) across goalscorer/SOT/shots/assists, with player name + team + de-vigged implied prob + book + `lineupStatus`. |
| **Event-ID mapping** | ✅ props carry the Odds API `matchId` (event id) + `fixture` string ("France vs Spain"). |
| **Player identity mapping** | ⚠️ names come from The Odds API; `identitySource: api_football` for photos/squad. `matchedPlayers: 0` because **lineups are not posted yet** (`lineupsPosted: false`, 2 days pre-match) — the props still carry a real name + team; only photo/position enrichment is pending. |
| **Settlement source** | ❌ **No goalscorer/shots/assists settlement source.** Grading "did player X score / take N shots" needs official per-player match events, which the current pipeline does not ingest. |

## Decision
The Odds API player-prop feed is sufficient to **show** these markets honestly today. The remaining blocker is
**settlement**, not the feed. So the pilot **exposes the props as provider-priced, market-implied, educational
reads** — never product-eligible — and marks lineups + settlement as pending.

## What shipped
- `lib/world-cup/wc-player-props.ts` — pure loader/normalizer of the committed artifact (player, team, market,
  real odds, implied %, lineup status). Fabricates nothing; `settlementSupport: "unsupported"`.
- `components/world-cup/wc-player-props-board.tsx` — renders per-fixture goalscorer/shots/SOT/assists with
  **provider-backed** labels ("real de-vigged prices from The Odds API · market-implied · lineups pending ·
  settlement pending · never in Bank Builder/Moonshot"). Wired onto `/world-cup`.
- `market-coverage.ts`: soccer **anytime goalscorer** + **shots/SOT/assists** moved `provider_needed` →
  **`experimental`** (feed live, market-implied) with `settlementSupport: "unsupported"` → still
  `isProductEligible === false`. Corners/cards/correct-score stay `provider_needed` (no feed).

## Remaining work (to make these settleable / product-eligible)
1. **Settlement source** (the real blocker): a per-player match-events feed (goals, shots, assists) — API-Football
   fixture player statistics could supply this post-match. Required fields: fixture id → player id → {goals,
   shots, shots_on_target, assists}. Est: a settlement ingest + grading module + tests (~medium).
2. **Lineup confirmation** near kickoff to promote `not_posted` → `confirmed` (already wired; just time-gated).
3. Only after 1+2: consider parlay/Bank-Builder eligibility — gated by `isProductEligible` (settlement supported).

## Guardrails held
Real odds only (no fabricated props); market-implied (no independent per-player model claimed); settlement
pending + product-ineligible, clearly labelled; official money untouched (`affe6b21`).
