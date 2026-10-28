# Requests to Launch Readiness (from the Command Center, Social Graphics V2.3)

**Context:** 2026-10-28. The Command Center only reads published data and never changes the website's forecast logic. These are the inputs it can't produce honestly by itself. Until each one exists, the graphics use the fallback named below.

## R1. Licensed team logos (NBA first, then NFL, MLB, EPL)

**Today:** the repository's own asset audits record **no licensed league or team logos**:
- `docs/audits/final-asset-identity-coverage-latest.md`
- `docs/audits/team-logo-player-portrait-asset-audit-latest.md`

The website hotlinks ESPN's CDN at runtime (`espnNbaCrestUrl`, `nflTeamLogoUrl`), with no licence on record. The Command Center won't post those images.

**Fallback:** a monogram in team colours inside each matchup box.

**Request:** a logo pack the founder has authorized for social posting. For each team:
- `file` (committed path)
- `sha256`
- `rights` (licence or authorization text)
- `licensor`
- `grantedAt`

The Command Center reads them from `command-center/render/templates/social-v2/asset-manifest.json → teamLogos.<league>.<abbr>`. A listed logo is used only if its file exists and its hash matches; the monogram stays as the fallback. Adding logos is a new asset-manifest version, so it needs a new design approval.

## R2. Official NBA Top Boards (points, rebounds, assists)

**Today:** the boards are private research (`data/internal/research/nba/top-boards/<family>/<date>.json`, written by `app/scripts/nba/freeze-nba-top-boards.mjs`). Nothing is published.

**Fallback:** the three daily Top 5 posts are **held**, with the reason shown in the queue. A ranking is never derived from the stat-line lane.

**Request:** a published, frozen board file, e.g. `app/public/data/nba/top-boards/<date>.json`, containing:
- the freeze instant;
- the family;
- eligibility state per stat;
- rows with `providerAthleteId`, name, team and the published value.

Plus a rule stating when a board is eligible for public use. The Command Center adds the reader and its re-check when this exists. The release target is 1 hour before the day's first tip.

## R3. A social-data contract for NBA (optional; today's reads already match the site)

**Today:**
- the game winner and the Elo-derived estimate come from the public lane file, read **through the website's own accessor** (`eloWinProbabilityOf`) at the same commit, so wording and rounding are identical;
- stat lines come from the same lane (`players.away/home[].medians`);
- the featured-player policy uses `expectedMinutes` and `injuryStatus` from the lane.

**Request:** if the lane's shape changes, keep these fields, or publish a small `social-export/<date>.json` with them and a version id.

**Note on wording:** the site's founder-approved label for the NBA number is **"Elo-derived game-winner estimate"**, never "probability" (Release G, 2026-10-23). The social meter uses that label. Showing "GAME WIN PROBABILITY" for NBA would need that wording decision reopened on the site first.

## R4. EPL / MLB pregame freeze-time source

**EPL** publishes home/draw/away probabilities (`app/public/data/soccer/epl/forecasts/<date>.json`), and V2.3 renders them with a three-way meter, for **design review only**. There is no freeze-time version to re-check before posting, so EPL pregame posts aren't queued.

**MLB:** no published game-winner probability feeds social graphics. **UFC:** no independent model.

**Request:** a frozen, versioned pregame record per fixture, like the NFL receipts, before these sports are queued.
