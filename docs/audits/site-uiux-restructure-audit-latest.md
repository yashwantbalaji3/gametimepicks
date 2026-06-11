# Site UI/UX Restructure Audit (latest)

## Problems (from user screenshots + page review)
1. **Player props buried.** /world-cup renders Player Props ~6 sections deep (after hero,
   today's matches, projections, suggested cards). Users can't find them.
2. **One giant scroll.** /world-cup stacks 10+ sections vertically → high text density, hard to
   scan. No sportsbook-style tabbing.
3. **Navigation is fragmented.** "Straight Bets" (/projections), "Suggested Parlays" (/parlay-lab),
   "Build a Parlay", "Sports & Events", and per-sport pages feel disconnected; no daily hub.
4. **Cards feel weak/disconnected.** Soccer suggested cards are mostly double-chance + totals;
   player props aren't wired into cards even when shown elsewhere.
5. **Too much text on cards.** Methodology/caveats repeated inline instead of behind tabs/tooltips.
6. **Dashboard feel, not consumer/sportsbook feel.**

## New site map (target)
- `/today` — daily command center (all live sports, counts, top cards, Bank Builder).
- `/picks` — all suggested cards across sports (All / Low / Medium / High / Longshot / Bank-eligible).
- `/build` — custom parlay builder (eligible legs across sports).
- `/bank-builder` — the $100→$10,000 ladder (unchanged).
- `/results` — settled history.
- `/sports` — directory → `/world-cup`, `/mlb`, `/nba`, `/ufc`, each with the SAME tabs:
  Overview · Games · Projections · Player Props · Cards · Results · Methodology.
- `/methodology` — model + responsible-use copy (moved off every card).

## Sequenced delivery (low-regression — do NOT one-shot)
1. **This PR:** World Cup tabbed sportsbook layout (Overview/Games/Projections/Player Props/
   Cards/Info) → player props become one click; text density drops.
2. Player-prop parlay eligibility recalibration + card rebuild (player legs in cards when legit).
3. Global nav first pass (Today/Picks/Build/Bank/Results/Sports/Methodology) + old-route aliases.
4. `/today` daily hub.
5. Visual/typography polish + mobile bottom nav.
Each ships behind tests + production verification so NBA/MLB/UFC/Bank-Builder never regress.
