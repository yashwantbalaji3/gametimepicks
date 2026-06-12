# Full-site rebrand + WC props + Step 4 sprint — 2026-06-12

Baseline (verified pre-work, unchanged): $1,423.64 / Step 4 / 3–0; June-11 settlement
intact; June-12 slate: WC 2 matches / 8 team projections / 4 cards, MLB 15 games / 708
leans, mixed 5, NBA none.

## Shipped this sprint
1. **World Cup player props: 0 → 215** (the headline fix — see
   world-cup-player-props-refresh-2026-06-12.md). FanDuel/DraftKings labels + real
   api-sports portraits + pre-lineup chips now render on /world-cup, both fixture pages,
   and counts across /today, /games.
2. **Real MLB headshots** via the official MLB Static CDN from artifact playerIds
   (player-headshots.ts) — /mlb prop cards + Build legs. NBA helper ready for when a
   slate exists.
3. **PlayerPropCard** now shows the real bookmaker badge (artifact field only) and
   readable metadata (9.5 → 10.5); **ProjectionCard** renders real player photos with alt
   text.
4. Suggested cards render their one-line "why this card".
5. Step 4 reviewed across WC-only / MLB-only / mixed — **declined, pending** (see
   bank-builder-step-4-review-2026-06-12.md; lowered-target option documented for owner).

## Carried from the v2 rebrand earlier today (PR #456)
Brightened text tokens (≥4.6:1), type-scale bumps, stadium-light shell, Bank Builder
flagship strip + $100→$10,000 meter + sparkle, fixture-only suggested cards, mixed-leg
sport orbs, Build 3-step flow, picks explainer, WC props empty-state (now superseded by
real props).

## Verification
812+ tests pass (incl. identity-matcher + fixture-filter suites) · tsc + build clean ·
copy + stale sweeps clean · production verified post-deploy.
