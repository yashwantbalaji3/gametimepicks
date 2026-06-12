# Asset audit v4 — logos, portraits, marks (real vs generated)

| Asset | Source | Status |
|---|---|---|
| WC team logos | api-sports URLs in projections artifacts (`homeLogo`/`awayLogo`) | **REAL — now rendered** (TeamMark: /games cards + fixture heroes) |
| WC player portraits | api-sports URLs in player-projections | REAL — live on prop cards (215/215) |
| Country flags | Unicode from real ISO codes (teams.json) | REAL — fallback layer in TeamMark/FlagBadge |
| MLB headshots | Official MLB Static CDN from artifact playerIds (built-in league generic fallback) | REAL — live on prop cards/build legs/Step-4 card |
| NBA headshots | cdn.nba.com helper exists; no active slate artifacts | Ready; unused until a slate exists |
| MLB/NBA team logos | No licensed assets in repo or artifacts | NOT shown — monogram + sport accent (documented) |
| League marks (FIFA/MLB/NBA/UFC) | No licensed assets | **Generated** CompetitionBadge, documented non-official |
| UFC fighter portraits | None in artifacts | Initials/orb fallback |

Fallback chain everywhere: real URL → flag/monogram/orb — no broken images, no
fabricated marks. Fallback behavior covered by existing prop-card/identity tests.
