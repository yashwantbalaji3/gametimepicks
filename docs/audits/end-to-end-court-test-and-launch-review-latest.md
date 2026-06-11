# End-to-End Court Test & Launch Review (latest)

Baseline SHA at audit: 041e182. All 14 primary routes return 200.

## Court-test journeys (production-verified)
- **A — Homepage `/`:** renders the Today board + Quick Actions (Games/Picks/Build/Bank). ✅
- **B — `/games`:** unified all-sports board incl. World Cup; 22 "View game" links + Build per card. ✅
- **C — Game detail `/games/[sport]/[gameId]`:** World Cup / MLB / NBA fixture pages 200, tabbed
  (Overview · Projections · Player Props · Suggested Cards), real data + market readiness. ✅
- **D — `/picks`:** sport×risk matrix incl. World Cup + Mixed rows, clickable cells. ✅
- **E — `/build`:** sport/game/market/search filters, game prefilter via `?sport`/`?game`, mobile
  betslip drawer, plain-English warnings. ✅
- **F — `/learn`:** anchors (#start…#glossary) + 9-term glossary. ✅

## Gap found + fixed this pass
- **Phase 3:** the sport-hub Games tabs did NOT link each game to its fixture detail page. Fixed:
  `/world-cup`, `/mlb`, `/nba` game tiles now link to `/games/[sport]/[slug]` via a date/order-
  independent `detailHrefForTeams` resolver (board fallback when no detail exists).

## Consistency
World Cup / MLB / NBA / UFC all use the tabbed SportShell + shared ProjectionCard / SuggestedCard /
PlayerPropCard / StatusChip. UFC is moneyline-only (model-only cards show no payout) — labeled, not
faked.

## Honest limitations (deferred, with reasons)
- UFC fight-level detail pages — not implemented; `/games` UFC card links to `/ufc?tab=fight-card`.
- World Cup player props depend on the books posting them (near lineup time) — polished empty state.
- MLB/NBA detail depth = player-prop projections + build link (those models are player-prop based).
