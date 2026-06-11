# Fixture-Level Experience Audit (latest)

## Routes
- `/games/[sport]/[gameId]` — statically generated fixture detail pages (`generateStaticParams`,
  `dynamicParams=false`) for every game on today's board. URL sport uses the dash form
  (`world-cup`). Today: 2 World Cup + 8 MLB + 1 NBA.

## Fixture → data mapping (real, no fakes)
- **World Cup:** team projections + player props already share the API-Football **`matchId`**.
  The fixture detail joins on it; the deterministic slug is `<home>-vs-<away>-<date>`. "Build from
  this game" deep-links to `/build?sport=world_cup&game=<matchId>` (BuildExperience filters WC legs
  by `gameId`). This resolves the previously-missing fixture↔leg mapping — no string hacks.
- **MLB:** board games keyed by `gamePk`; player-prop leans carry both `gamePk` + the optimizer
  `gameId` hash, so the build link bridges `gamePk → gameId`.
- **NBA:** board games + leans share `gameId`.
- **UFC:** no fixture detail page this pass — `/games` UFC card links to `/ufc?tab=fight-card`
  (fight-level detail is a documented follow-up).

## Game detail page (shared kit, mobile-first, tabbed)
Hero matchup + Build/View-sport/Learn CTAs; tabs: Overview (model read + market readiness),
Projections (team), Player Props (grouped by market, real books, pre-lineup labels, polished empty
state), Suggested Cards. Market readiness labels each market live / pending / unavailable —
never faked.

## Caveats surfaced
90-minute regulation (soccer), pre-lineup player props, model-only/no-payout (UFC), and
market-unavailable states — all from real artifacts.

## Honest limitations
- World Cup player props depend on the books posting them (often near lineup time) — empty state
  shown, not fabricated.
- MLB/NBA detail pages show player-prop projections + build link; team-level game projections are
  player-prop-based for these sports.
- UFC fight-level detail pages are a follow-up.
