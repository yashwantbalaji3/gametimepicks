# June 13 page-framework UI/UX review

The consumer-sportsbook framework was built across PRs #460–468 and is live. This run verified
it route-by-route and closed one real gap (/mlb logos). It is not a rebuild — rebuilding
shipped, working UI would risk regressions for no gain.

## Audit results (clean)
- Color: **0** cool-navy `rgba(7,11,26)` card surfaces in components; warm volcanic cards
  (rgba(26,16,11)); ember borders; gold crown-only. Canonical `--lava-*` token system.
- Type: Space Grotesk display via Tailwind `display`; Geist body; **0** sub-10px primary text
  (avatar corner-chip the one documented 9px exception); tabular odds/bankroll.
- Stale copy: **0** "Step 4 pending" / "Odds API key" / "3-0 as current". Current state
  $3,623.97 · 4-0 · Step 5/5 sitewide. Root `/` current (multi-sport command center, not
  NBA-only).

## Per-route state
- /today: BB spotlight → flashcards → games-by-sport → yesterday strip (June-12 WC + Step-4).
- /games: lobby; MLB logos (official), WC flags/logos, NBA monograms; NBA Game 5 live.
- /mlb: **MLB official team logos added to game tiles this run** (30 teams); June-13 schedule
  in the upcoming strip (15 games, schedule-only); active board June-12 with props.
- /world-cup: June-12 (latest real; June-13 blocked — no API_FOOTBALL).
- /nba: live Game 5 board (193 props), by-player accordions.
- Fixture pages: arena hero + Team&game/Player/Suggested/Markets tabs; by-player default;
  fixture-only cards.
- /picks: 7 flashcard lanes + collapsed matrix. /build: sport→game→legs rail + sticky slip.
- /bank-builder: Road-to-$10K; Step-4 proof; "Step 5 review pending" (no invented card).
- /results: trust page; June-12 WC finals + Step-4 WON.

## Honest gaps (data/asset-bound, documented, never faked)
- NBA official team logos: no official-safe static endpoint adopted → monograms.
- /world-cup + /mlb-board props show latest real slate (June 12) where June-13 odds are
  blocked.
- Suggested-card legs lack per-leg images in artifacts → sport orbs / avatars.
