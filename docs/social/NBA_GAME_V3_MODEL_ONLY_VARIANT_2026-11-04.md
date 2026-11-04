# nba-game@3 model-only variant (design-variation receipt, 2026-11-04)

## Founder approval (verbatim, relayed by the Program Director, about 15:20Z on 2026-11-04)

> I approve the November 4 model-only two-image matchup presentation: winner graphic first, player-projection graphic second, both inside one X post. Please document this as a distinct approved design variation.

## What the variant is

- Console design: `gtp-lr-nba-game@3`. The packages keep `designVersion "3"`, so the console's existing @3 design approval applies. There is no relabel and no 3.1.
- The approved @3 artwork (commit 16fb435b08, the October 29 format) is a priced winner card, then real-line stat card(s).
- This variant uses the same post layout: one X post, image 1 the winner card, image 2 the stat card, each 1080x1350, with the game-post caption form. Both images are the design-2 cards:
  - the model-only winner card, with no sportsbook price;
  - the model-projection stat card (`projonly`), with no real lines.
- Package markers: `contentType NBA_GAME_POST`, `variant <eventId>-model`, `containsMarketData false`, `content.model true`, `content.linesShown 0`, `content.sourceDesignVersions ["2","2"]`.
- `content.designVariant` is not written into the packages. The content is part of `contentSha256`, so adding it would change the tested fingerprints. This document carries the name instead.
- Clean export: `isModelGamePost` in `app/src/lib/social/clean-export.mjs` allows design 3 only for this variant. Every other design-3 game post is still refused.

## Scope

November 4, 2026 NBA slate. Tool commits: 587d120b17 (packages), 990f4656ff (2-image clean export).
