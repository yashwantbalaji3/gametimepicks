# Public Copy Cleanup (latest)

## Reviewed
Action pages (today/games/picks/build/sports), sport hubs, learn, game detail, about.

## State
- No promotional banned copy in public UI (lock/safe/safest/guaranteed/sure thing/free money/
  risk-free/can't miss). A prior "no guarantees" negation on /learn was reworded.
- Internal status codes (gated_low_edge, pre_lineup_unknown, etc.) are mapped to friendly labels
  via public-visibility (`friendlyStatusLabel`) — never shown raw.
- Long methodology lives in /learn + the sport-hub Methodology tabs link out; action pages use
  concise 1–2 sentence subs + chips.

## Changes this pass
- Added "View game · projections + props" links on the World Cup games tab + repointed MLB/NBA
  slate tiles to fixture detail pages (clarifies the click-through, removes the dead-end feel).
