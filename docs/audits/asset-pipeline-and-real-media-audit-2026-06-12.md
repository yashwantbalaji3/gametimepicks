# Asset pipeline + real media audit — 2026-06-12

| Sport | League logo | Team identity | Player portraits | Implemented |
|---|---|---|---|---|
| World Cup | None licensed in repo → identity orb ⚽ | Real ISO flags (teams.json → FlagBadge); real `teamLogo` URLs (api-sports) in artifacts | **REAL** — all 215 props carry api-sports photo URLs | prop cards, fixture tabs, hub |
| MLB | None → orb ⚾ | Abbreviations + accents (no logo files) | **REAL — official MLB Static CDN** headshots constructed from artifact `playerId`s (MLB's own generic-silhouette default baked into the URL) | /mlb prop cards (ProjectionCard), Build legs |
| NBA | None → orb 🏀 | Abbreviations | Helper ready (`nbaHeadshotUrl`, official NBA media CDN by playerId); no active slate to render | build legs path |
| UFC | None → orb 🥊 | n/a | None in artifacts → orbs | hub |

Rules enforced: URLs only from real artifact ids/fields; `alt` text from the real player
name; `loading="lazy"`; monogram/orb fallback remains the no-id branch; no licensed marks
faked; no scraped/hotlinked search images.
