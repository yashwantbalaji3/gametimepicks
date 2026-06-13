# June 13 product-framework UI/UX review

The consumer-sportsbook framework requested here was built incrementally across PRs #460–467
and is live. This run verifies it (not a rebuild) and records the per-route state.

- **Theme**: canonical `--lava-*` token system; warm volcanic base (`--lava-bg #0C0806`),
  ember borders sitewide, cool-navy card backgrounds eliminated (warmed to rgba(26,16,11));
  gold reserved for crown/Bank-Builder. Space Grotesk headlines via the Tailwind `display`
  key; Geist body; 10px primary-text floor (avatar corner-chip the one documented 9px
  exception).
- **/today**: Bank Builder spotlight → flashcard rails → games-by-sport → yesterday strip
  (now shows June-12 WC finals + Step-4 WON).
- **/games**: sportsbook lobby; real MLB logos (official mlbstatic from team ids), WC
  flags/logos, NBA monograms; sport filters; View game / Build CTAs. NBA Game 5 (NY @ SA) live.
- **Sport hubs** (/mlb, /world-cup, /nba): shared games-first structure. /nba surfaces the
  real June-13 Game 5 board; /world-cup + /mlb show their latest real slates (June 12 — no
  June-13 data generated).
- **Fixture pages**: arena hero (TeamMark/flags + competition badge + lava CTA); tabs
  "Team & game props / Player props / Suggested cards / Markets"; player props default to
  Top picks + By-player accordion with last-5 drawers; fixture-only suggested cards.
- **/picks**: 7 flashcard lanes + collapsed advanced matrix.
- **/build**: sport → game → legs progress rail + sticky slip; search demoted.
- **/bank-builder**: Road-to-$10K flagship (4–0, Step 5/5, lava meter, Step-4 proof card with
  official evidence, "Step 5 review pending" panel — no invented card).
- **/results**: trust page; June-12 WC finals + Step-4 WON now visible.

## Honest gaps (data-bound, not UI)
- /world-cup + /mlb show June-12 (latest real) because no June-13 WC/MLB artifacts exist.
- NBA official team logos not wired (no official-safe static endpoint adopted) — monograms.
- Suggested-card legs lack per-leg images in artifacts — sport orbs / avatars.
These are pipeline/asset limitations, documented, never fabricated.
