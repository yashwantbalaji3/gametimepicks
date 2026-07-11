# GameTimePicks — Playoff Context + Player Images Session (2026-05-15)

**Started:** 2026-05-15
**Branch start:** `main` @ `8946a00`
**Working tree:** clean except 6 untracked SESSION_*.md docs

## Phase 0 ✓
- main @ `8946a00` (PR #34 merged)
- Recent UI PRs #29–#34 all in log

## Phase 1 — Game data audit
- Board JSON has `gameId` per game; NO existing series/round/playoff/gameNumber field
- May 15 game IDs use **NBA stats playoff format `0042500NNN`** (10-digit, `00` + `4` playoffs + `25` season + `00` + RSG where R=round, S=series-in-round, G=game)
  - `0042500206` = Round 2, series 0, Game 6 → Conf Semis Game 6
  - `0042500236` = Round 2, series 3, Game 6 → Conf Semis Game 6
- May 13 game ID `401871337` uses ESPN format (no playoff context encoded)
- Pipeline does NOT currently parse playoff context from game IDs
- ESPN scoreboard cache confirms season `2025-26 Postseason`

## Phase 2 — Player image feasibility audit
- `playerId` field is populated on **every lean** with NBA stats IDs (verified: Donovan Mitchell 1628378, Harden 201935, Cade 1630595, Tobias Harris 202699 all match real NBA stats IDs)
- `nbaPlayerId` and `espnPlayerId` are null (legacy/unused)
- Official NBA CDN headshot URL: `https://cdn.nba.com/headshots/nba/latest/{size}/{playerId}.png`
- Sizes available: `260x190`, `1040x760`
- `next.config.mjs` has `images.unoptimized: true` → plain `<img>` tags work without domain whitelist
- No local image assets in repo

## Phase 3 — Design proposal

### Playoff game context (UI-only, no data changes)

**New utility:** `app/src/components/playoff-context.ts`
- `getPlayoffGameLabel(gameId, awayTeamAbbr, homeTeamAbbr)` → `{ isPlayoffs, roundLabel, conferenceLabel, gameLabel, matchup, fullLabel, compactLabel }`
- Decodes NBA stats `0042500NNN` format
- Team-to-conference map (15 East / 15 West) for conference disambiguation
- Falls back gracefully for unknown ID formats (e.g. ESPN's `401871337`)

**Where it appears:**
- Status board game rows (homepage hero + board compact) — round/conference eyebrow
- Featured headliner tiles — append "Game 6" to tipoff line
- Player card header — small playoff chip near matchup
- Parlay candidate leg matchup — append game number
- Anatomy callout — playoff label in matchup line
- Results awaiting-settlement panel — playoff label prepended

**What needs future pipeline support (not in this PR):**
- Series record ("CLE leads 3-2")
- Authoritative conference assignment from NBA stats API (current approach infers from team abbreviations — robust for current 30 teams but not future-proof)

### Player avatars (UI-only)

**New component:** `app/src/components/player-avatar.tsx` (client component)
- Renders `<img>` from official NBA CDN with `loading="lazy"`, `decoding="async"`, `alt`
- `onError` swaps to gold-neon CSS disc with player initials + faint team abbreviation
- Sizes: `sm` (28px), `md` (44px), `lg` (64px)
- Casino styling: `.gtp-player-spotlight` ring (additive)

**Where it appears:**
- Headliner tiles (sm, top-right)
- Player card header (md, replaces text-only avatar slot)
- Anatomy callout example card (md)
- Parlay candidate leg rows (xs/sm, optional based on space)

### Casino/sportsbook UI

- `.gtp-game-chip` — sportsbook-LED chip styling for playoff round/game number badges
- `.gtp-player-spotlight` — gold/cyan gradient ring + hover glow on avatars
- `.gtp-scoreboard-flash` — periodic highlight pass across status-board game rows (very subtle)
- All keyframes paired with `prefers-reduced-motion`

### Files expected to change

- `app/src/app/globals.css` — new primitives
- `app/src/components/playoff-context.ts` — **NEW** pure utility
- `app/src/components/player-avatar.tsx` — **NEW** client component
- `app/src/components/featured-headliners.tsx` — avatar + game number
- `app/src/components/vault-player-card.tsx` — avatar + playoff chip
- `app/src/components/sportsbook-status-board.tsx` — game-row playoff eyebrow
- `app/src/components/parlay-builder-client.tsx` — game number in candidate leg matchup
- `app/src/components/anatomy-callout.tsx` — avatar + game number
- `app/src/app/page.tsx` — pass playoff context into status board game rows
- `app/src/app/results/page.tsx` — playoff context in slate-awaiting panel

---

## Iteration 2 — Parlay Lab player recent-form dossier (2026-05-15)

PR #35 still open. Continuing on the same branch.

### Phase 1 — Competitor / reference UX review

**Pickswise (`pickswise.com`)** — promo-heavy homepage with state-localized content (NJ first), editorial picks with star-rating confidence, matchup cards centered on logos + score predictions, **no in-house sparklines / no player photos in core flow**, article-driven analysis. *Patterns to avoid: promo dominance over content. Patterns worth considering: confident editorial picks (we already have data-driven High/Medium/Low which is more honest).*

**OddsShark (`oddsshark.com/nba`)** — tiered nav with **Computer Picks / Parlay Picks / Prop Bets / Championship Odds**, prediction cards with predicted scores ("DET 111.5 vs CLE 112") + spread/total + narrative summary, dedicated **Consensus Picks** nav item, news feed with timestamps + thumbnails, footer comparison tools (calculators, odds comparison). *Worth borrowing conceptually: (a) a small narrative summary at the game level, (b) consensus indicator as an idea (bookmaker count or model-vs-implied gap).*

**OddsTrader (`oddstrader.com/nba`)** — tiered nav with **dedicated Injuries tab** (primary nav!), real-time odds grid (30s update on standard lines / 10s on live), **series scores ("CLE Leads 3-2") visible directly on game cards**, geo-blocking on books, "120+ markets · 225+ stats" coverage emphasis. *Worth borrowing conceptually: series record on game cards (needs pipeline data — future PR), an "Injuries" surface (needs pipeline data — future PR), "X markets · Y stats" coverage chip.*

**DRatings (`dratings.com`)** — **HTTP 403** on every page tested. Cannot review directly. (Public reputation: strong on transparency, daily picks with model ratings, prediction accuracy tracking.) *Limitation documented.*

**Action Network NBA (`actionnetwork.com/nba`)** — hierarchical sports menu, dedicated Props / Futures / Picks / Injuries (in main nav), article-driven (no in-house sparklines), podcast integration, PRO membership tier. *Reinforces the pattern: Injuries deserves prominent placement. Differentiator: they're editorial, we're data — leans into our positioning.*

### Competitor inspiration summary

| Pattern | Adopt now (UI-only) | Future pipeline PR | Don't copy |
|---|---|---|---|
| Player recent-form sparkline + averages | **YES (this PR)** | — | — |
| Playoff series record ("CLE leads 3-2") | — | **Yes** (nba_api `commonplayoffseries`) | — |
| Injury/news side panel | Honest placeholder w/ "future" framing | **Yes** (ESPN scoreboard injuries free) | — |
| Predicted score / matchup narrative | Lightweight summary from existing leans (deferred — not this PR) | — | — |
| Real-time odds grid w/ 30s refresh | — | — | We're educational, not live odds wall |
| Promo carousel / state gating | — | — | We're not a sportsbook |
| Editorial confidence stars | — | — | Our data-driven tiers are honest |
| "Computer Picks" framing | — | — | We're explicitly not a picks service |
| PRO tier | — | — | Free / educational |
| Consensus picks page | — | — | We'd need many models |
| Sticky nav / state-aware filters | Already shipped | — | — |
| Mobile-first prop browse | Already shipped | — | — |

### Phase 2 — Parlay Lab data audit

All 5 verified stars on May 15 carry **`recent10` arrays of length 10** (oldest→newest) for **every loaded market**. Sample:

- Anthony Edwards AST: `recent10=[2,3,...]`, line 4.5, lean Under, +7.1% edge, High
- Anthony Edwards PTS: `recent10=[41,22,...]`, line 26.5, No Play (proj on line), Low
- Anthony Edwards REB: `recent10=[6,4,...]`, line 5.5, +26.2% edge, Low (R5 anomaly)
- Wembanyama AST/PTS/REB all High with full recent10
- Cade Cunningham PTS: `recent10=[26,26,...]`, line 26.5 Under, +36.3% edge, Low (R5)

**Reusable components found:**
- `VaultSparkline` (compact SVG, ~150 LOC, accepts `values: number[]`, `refLine`, dimensions, ariaLabel) — already handles missing data honestly with "no trend"
- `PlayerCardTrends` — already wraps VaultSparkline in market-row layout with trend direction; uses `PlayerCard` shape

### Phase 3 — Proposal for the Parlay Lab dossier

**New component:** `app/src/components/player-recent-form-panel.tsx` (presentational, server component OK — no state)
- Props: `{ playerName, playerId, team, opponent, homeAway, tipoff, gameId, leans: PropLean[] }`
- Renders:
  - Top: `.gtp-player-spotlight` avatar + name + matchup + playoff game chip
  - Market chip row (PTS/REB/AST) for markets the player has
  - Active market section: best lean summary + `VaultSparkline` + last-5/last-10 averages + anomaly chip if applicable
  - Honest empty state if `recent10` missing

**Wired into Parlay Lab:**
- Track `activeViewPlayer` in `parlay-builder-client.tsx` state
- When user toggles a player into selectedPlayerNames → also set as active view
- When mode === `"selected_players"` AND `activeViewPlayer` is set → render the panel between the picker grid and the candidates column
- Mini player tabs at the top of the panel if more than 1 player is selected

**Active-market state:** the panel owns its own internal `useState<Market | null>` and defaults to the player's market with the highest |edge| that's clean (or first available).

### Phase 4 — Polish additions (lightweight)

- **"Context desk" row** on the Parlay Lab page above the build console — shows what context is currently available (playoff context ✓, recent10 sparkline ✓, model anomaly guardrails ✓, NBA headshots ✓) and what's flagged as future (injury notes, series record, live tipoff countdown). Honest about gaps; no fabrication.

- **Graph glow** CSS — subtle gold drop-shadow on the sparkline svg.

### Files expected to change (iteration 2)

- `app/src/components/parlay-builder-client.tsx` — wire active-view state + render the panel
- `app/src/components/player-recent-form-panel.tsx` — **NEW** presentational component
- `app/src/app/globals.css` — `.gtp-player-dossier`, `.gtp-context-desk`, graph-glow
- `app/src/app/parlay-lab/page.tsx` — context desk row above the page body


