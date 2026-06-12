# Asset coverage — logos & portraits (final lava sprint)

Run: 2026-06-12. Scope: which identity assets are REAL (official-source URLs) vs honest
generated fallbacks, per sport. Rule: only artifact/official URLs render as images; no
scraped or fabricated league marks.

## Player portraits / headshots
| Sport | Source | Status |
|---|---|---|
| World Cup | api-sports player `photo` in WC projections | REAL photo when present → `PlayerAvatar` |
| MLB | MLB Static headshot from real `playerId` (`mlbHeadshotUrl`) | REAL |
| NBA | NBA CDN headshot from real id (`nbaHeadshotUrl`) | REAL |
| any | no id/url | initials monogram (clearly generated, never a fake photo) |

## Team marks
| Sport | Source | Status |
|---|---|---|
| World Cup | api-sports `homeLogo`/`awayLogo` in projections; else ISO flag | REAL logo / REAL flag |
| **MLB** | **`mlbstatic.com/team-logos/{teamId}.svg` from real `homeTeamId`/`awayTeamId`** | **REAL (NEW this sprint)** |
| NBA | — (no official static endpoint adopted) | monogram fallback |
| any | no logo/flag | initials monogram |

### MLB team-logo enablement (new)
- Board JSON `games[]` carry real MLB Stats API ids: `homeTeamId` / `awayTeamId`
  (e.g. PIT 134, MIA 146), plus probable-pitcher ids.
- Helper: `mlbTeamLogoUrl(teamId)` → `https://www.mlbstatic.com/team-logos/{id}.svg`.
  Documented URL pattern; returns `null` without an id (caller → monogram).
- Liveness verified: ids 134 / 146 / 147 → HTTP 200, `image/svg+xml`.
- Adopted via existing `TeamMark` (logo→flag→monogram) on: /games MLB cards, MLB fixture
  hero. MLB-only (NBA passes `null`).

## League / competition badges
- No licensed league logos anywhere. `CompetitionBadge` renders a GENERATED, clearly
  non-official badge. Unchanged this sprint.

## Suggested-card legs
- Artifacts carry no per-leg image → sport orb / player avatar where a player photo exists.
  An honest limit; a generator-enrichment item, not a UI fix.

## Honesty summary
Every rendered `<img>` traces to a real artifact URL or an official CDN pattern keyed on a
real provider id. Every gap degrades to a generated monogram/flag/orb — never a fabricated
or scraped league/team mark.
