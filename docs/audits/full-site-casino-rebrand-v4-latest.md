# Casino rebrand v4 — graphite palette, real team logos, Picks/Build simplification

Run: 2026-06-12 evening · Base `74943a2` · State verified before + after: $1,423.64 /
Step 4 / 3–0 · Step-4 card pending (+155) · ledger untouched.

## Palette decision (three directions evaluated)

1. **Stadium neon** (navy/black + electric cyan + emerald + gold) — rejected: the cyan/
   gold/emerald triad on every surface reads noisy and fights the sport accents.
2. **Premium sportsbook graphite** — CHOSEN. The muddy read came from the flat NAVY base
   (#070B1A) under gold-tinted text; moving the base to graphite near-black
   (`--vault-bg #0A0B10`, panels #13151D/#1B1E29/#222633, gtp shell/card/sunken to
   neutral graphite) lets the cream text (#F8F4E9) and per-sport accents carry the
   energy while gold stays the premium/Bank-Builder highlight. Emerald = success/active,
   red = risk — unchanged semantics, far cleaner ground.
3. **World Cup energy** (turquoise-led) — rejected: too tournament-specific for a
   four-sport product; would date the brand after the World Cup.

Token-level only (no scattered inline colors); existing rgba overlays now sit on graphite
and read neutral. All prior reduced-motion gates and contrast fixes carried forward.

## Real team logos (new imagery layer)

The WC projections artifacts carry REAL api-sports team-logo URLs (`homeLogo`/`awayLogo`,
same provider family as the player portraits) that were never rendered. New `TeamMark`
component (real logo → ISO flag → monogram, never fabricated) now renders them on:
- /games World Cup game cards (logo pair facing off),
- fixture-page heroes (logo pair, flag fallback preserved).
PublicGameDetail carries the URLs (indexed from the raw artifact by matchId).

## Picks + Build simplification

- /picks: one-sentence explainer ("Pick a sport and a risk level…"); the sport×risk
  matrix is demoted BELOW the filter chips and collapsed by default (`<details>`) — the
  chips are the primary control, the matrix the power-user overview.
- /build: search demoted below the sport/game/market pill rows (pills are primary).

## Already-live phases (verified, not redone)

Nav/3-click IA, product header chips, games-first hubs, fixture explorer with Top-Picks
default + last-5 drawers + fixture-only cards, MLB headshots, WC portraits + 215 live
props, BB flagship (meter/sparkle/wins strip), competition badges, calm lineup labels —
all from PRs #452–#460 this session.

## Verification

818 tests pass · tsc + build clean · copy + stale audits clean · raw PRE-LINEUP absent ·
production verified post-deploy.
