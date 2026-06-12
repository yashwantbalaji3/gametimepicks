# Asset & identity coverage — final (2026-06-12)

Single source of truth for the real-vs-fallback decision: shared `PlayerAvatar`
(headshot→monogram), `TeamMark` (logo→flag→monogram), `CompetitionBadge` (generated),
`FlagBadge`, sport orbs.

| Surface | Real asset (source) | Fallback when absent |
|---|---|---|
| WC game cards / fixture heroes | **Team logos** — api-sports `homeLogo`/`awayLogo` (artifact) | ISO flag → monogram (TeamMark) |
| WC player props | **Portraits** — api-sports `player.photo` (164/164 today) | initials monogram (PlayerAvatar) |
| MLB player props / Build legs / Step-4 card | **Headshots** — MLB Static CDN from real `playerId` (built-in league generic) | initials monogram (PlayerAvatar) |
| NBA | helper ready (`nbaHeadshotUrl`); no active slate | monogram |
| MLB/NBA team logos | **None licensed in repo/artifacts** | team monogram + sport accent (documented) |
| League/competition marks | **None licensed** | generated `CompetitionBadge` (World Cup 2026 / MLB · 2026 season / NBA / UFC), documented non-official |
| Suggested-card legs (mixed/WC parlay) | leg data carries NO per-leg image (team-market labels) | per-leg sport orb; player photo when the artifact provides one |
| Book labels | FanDuel/DraftKings — only from artifact `bookmaker` fields | omitted if absent (never invented) |

**Known gaps (honest):** no licensed MLB/NBA/FIFA logos exist, so those are monograms +
generated badges; suggested-card legs lack per-leg images at generation time (a
data-pipeline enrichment, not a UI item). No fabricated photos or official marks anywhere
— `PlayerAvatar` renders an `<img>` only with a real URL (unit-tested).
