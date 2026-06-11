# GameTime Picks UI/UX System (latest)

## Principles
Consumer sportsbook feel, educational/paper-only. Less text, more chips/cards/tabs. Key info in
1–2 clicks. Readable body type; condensed/mono reserved for odds + badges.

## Layout
- **Sport hub = tabs**, not one scroll: Overview · Games · Projections · Player Props · Cards ·
  Results · Methodology. A sticky tab bar under the hero. Player Props is a first-class tab.
- **Cards are betslip-style**: market · pick · odds · model% · edge · confidence · 1–2 factor
  chips · expand for detail. Caveats become chips (pre-lineup / regulation-only / high-variance).

## Color
- Dark base. **Gold** = premium/action. **Green/teal** = positive edge. **Red/orange** = risk/
  high variance. Per-sport accent (World Cup gold/green, MLB blue/red, NBA orange/blue, UFC red).

## Status vocabulary (shared chips)
Live · Lean (parlay-eligible) · Model view · Pre-lineup · Waiting (odds/lineups) · Unavailable.

## Typography
Body in the readable sans already configured; mono only for odds/badges. Avoid tiny condensed
text for primary numbers (model%, odds). Larger tap targets on mobile.

## Sequencing
World Cup tabs first (this PR), then nav + `/today` + global visual polish in separate PRs.
