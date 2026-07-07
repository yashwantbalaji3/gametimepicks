# Visual Asset System

*The real logo / flag / player-portrait system in the app — components, sources, and the fallback discipline.
Accurate to the code as of 2026-07-07. Owned by the [Visual Systems Designer](../agents/visual-systems-designer/mission.md);
governed by the [UI/UX Operating System](UI_UX_OPERATING_SYSTEM.md). The honesty rule is non-negotiable:
official-source image or a clean monogram — never a broken image, never a fabricated mark.*

## Components

### `@/components/team-logo` — `TeamLogo`
- **Props:** `{ team, sport: "nba" | "mlb" | "nhl", size, highlight?, ariaLabel? }`.
- **Source:** ESPN logo CDN — `https://a.espncdn.com/i/teamlogos/{sport}/500/{abbr}.png` (team is lowercased
  and passed as the abbr).
- **Fallback:** client component; on image `onError` it swaps to the `TeamBadge` color **monogram**. `xl` size
  falls back to a `lg` badge.

### `@/components/flag-badge` — `FlagBadge`
- **Props:** `{ code (ISO-3166), fallback?, size: "sm" | "md" | "lg" | "xl", ariaLabel? }` (sm 18px · md 24px ·
  lg 32px · xl 44px hero).
- **Source:** Unicode emoji-flag sequence via `src/lib/flag-emoji.ts` (`flagEmoji(code)`).
- **Fallback:** unsupported code → a **monogram** (`fallback` text, else the first two letters of `code`). Used
  for **World Cup** teams.
- **Helper:** `wcTeamCodeFromName(name)` in `src/lib/data-world-cup.ts` maps a WC team name → ISO code.

### `@/components/player-avatar` — `PlayerAvatar` (NBA / MLB)
- **Props:** `{ playerId, playerName, team?, sport?, size, flat? }` (`sport` defaults to `"nba"`).
- **Source:** ESPN headshots for NBA — `https://a.espncdn.com/i/headshots/nba/players/full/{playerId}.png`;
  MLB-static for MLB — `https://midfield.mlbstatic.com/v1/people/{playerId}/spots/120`.
- **Fallback:** starts in photo state only when `playerId > 0`; on missing id or `onError`, a gold-vault disc
  with the player's **initials** (clearly a generated placeholder, never a fabricated photo).

### `@/components/ui/player-avatar` — `PlayerAvatar` (lightweight)
- **Props:** `{ name, photo?, size }`.
- **Behavior:** renders the real `photo` if given, else an **initials** monogram in the vault tone. Fixed
  dimensions avoid layout shift; alt text is the name.

## Helpers — `src/lib/player-headshots.ts`
- `mlbHeadshotUrl(playerId)` — canonical MLB headshot URL builder.
- `mlbTeamLogoUrl(teamId)` — canonical MLB team-logo URL builder.
- `nbaHeadshotUrl(playerId)` — **DEPRECATED**: components build the ESPN headshot URL directly (the NBA avatar
  path hard-codes the ESPN CDN pattern), so prefer the component over this helper.

## Coverage

| Sport | Team marks | Player portraits | Source |
|---|---|---|---|
| **NBA** | ✅ logos | ✅ headshots | ESPN CDN (logos + headshots) |
| **MLB** | ✅ logos | ✅ headshots | MLB-static (`mlbstatic.com`) |
| **World Cup** | ✅ flags | ❌ none | Unicode flag emoji; **data lacks player IDs → no portraits** |
| **NHL** | ⚠ ESPN pattern, untested | — | ESPN CDN pattern (`sport:"nhl"`), not verified in use |
| **IPL** | color badges only | — | monogram/color badge |
| **UFC** | none | none | — |

## The honesty rule

- **Official-source images only** — ESPN (NBA logos + headshots, MLB/NHL logos), MLB-static (MLB headshots),
  Unicode (flags).
- **Fallback is always a monogram / initials** — deterministic, obviously-generated, never a fabricated
  likeness.
- **Never a broken image** — every component has an `onError` → monogram path.
- **No local asset dirs** — there are no bundled logo/flag/portrait image directories; assets are CDN URLs +
  Unicode + CSS monograms only.

## Bank Builder usage

Bank Builder is **team/game-markets only** (no player props, both generation paths set `player == null`), so
BB legs never need a player portrait:
- **World Cup legs** → `FlagBadge`, with the code resolved from the selection/matchup via `wcTeamCodeFromName`.
- **MLB legs** → `TeamLogo`.
- The flagship **ClimbHero** (`src/components/bank-builder/climb-hero.tsx`) renders these through a local
  `LegAvatar` (tries the selection's WC code first, else the matchup's home/away codes → `FlagBadge`).
- **No player portraits in Bank Builder** — there are no props in the product.

## Related docs

- [UI_UX_OPERATING_SYSTEM.md](UI_UX_OPERATING_SYSTEM.md) — the ownership layer + non-negotiables.
- [PRODUCT_DESIGN_REVIEW_TEMPLATE.md](PRODUCT_DESIGN_REVIEW_TEMPLATE.md) — the asset checklist item.
- [BANK_BUILDER_7STEP_SETTLEMENT_SPEC.md](BANK_BUILDER_7STEP_SETTLEMENT_SPEC.md) — why BB has no props.
