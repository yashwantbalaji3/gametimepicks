# Matchup Explorer + Compare — contract, architecture and runbook (v1.4)

Written 2026-09-17. The second public consumer of the GameTime Data Platform, through the v1.3 research projection.
Complements `docs/TEAM_PLAYER_RESEARCH.md` (research pages), `docs/GAMETIME_DATA_PLATFORM.md`,
`docs/GAMETIME_LIVE.md` and `docs/RETENTION_ARCHITECTURE.md`.

> **A comparison is trustworthy only when both sides are compared on the same factual definition, with the same
> missingness rules, and with visible coverage.**

---

## 1. Purpose

Let a reader put two teams or two players side by side, and research one scheduled game, **on recorded facts only**:

- How have these two teams done this season, and in their latest finals?
- What happened in their recorded meetings?
- How do two players compare on the SAME stat, with how many games behind each number?
- What forecast already exists for this game — as a link to its own report, never blended in?

Comparison is descriptive. Nothing here predicts, ranks, grades or names a side as better.

## 2. Boundaries

| Owner | Owns | Never owns |
|---|---|---|
| Compare projection (`data/compare-projection/v1`) | pair-independent team/player compare entities, selector indexes, the bounded matchup registry, coverage receipts | forecasts, Live, settlement, Follow/Saved/observation state, odds, any pair-keyed artifact |
| Research projection (v1.3) | the factual rows compare reads | — (unchanged) |
| Data Platform (v1.2) | canonical identity + facts | — (compare never reads it; **B1 `PLATFORM_CONSUMERS` unchanged**) |
| Forecast owners | NFL `/nfl/game` reports + PUBLISHED player-board families; MLB game detail predictions (pause gate applied) | anything inside a compare artifact |
| Live | `/api/live`, `/live`, game pages | nothing on a compare or matchup page (zero Live requests) |

Not built (non-goals held): Research Lab, query builder, Ask GameTime, LLM summaries, recommendations, power rankings,
composite scores, win probability, new providers, EPL results source, UFC method/round, saved comparisons, new
localStorage key, new nav primary, a pair page of any kind.

## 3. Architecture

```
data/internal/platform/v1
        │  B1: the v1.3 research builder (unchanged, the ONLY platform consumer)
        ▼
data/research-projection/v1
        │  read ONCE: app/scripts/compare/build-compare-projections.mjs  (lib/compare/research-input.mjs)
        │  pure assembly: lib/compare/projection-build.mjs
        ▼
data/compare-projection/v1   (committed, deterministic, --check)
   ├── build time  → /matchups/<sport>/<gameId>/ pages (lib/compare/compare-store.ts, server only)
   │                 + discovery CTAs + sitemap
   └── build step  → app/public/data/compare/v1/**  (scripts/compare/emit-compare-assets.mjs, gitignored)
                       └── browser: /compare/{teams,players}/<sport>/ shells fetch ONE index + TWO entity files
                           and compose the pair with the SAME pure selectors the unit tests pin
```

Files (`data/compare-projection/v1/`):

| File | Content |
|---|---|
| `teams/{MLB,NFL}.jsonl.gz` | one team compare entity per line: identity, research path, coverage codes, v1.3 TEAM_ROW tuples |
| `players/{NFL,EPL,MLB}.jsonl.gz` | one player compare entity per line: identity, `stats` (canonical family keys), rows `[gameId, date, seasonId, teamId, oppId, ha, ...values]` (null = not recorded) |
| `indexes/teams-<sport>.json` | selector: `[slug, id, label, abbr, newest season, oldest season]` + existing matchup pages + team labels |
| `indexes/players-<sport>.json` | selector: `[slug, id, label, hint, family indexes]` + families + team labels |
| `matchups/{MLB,NFL}.jsonl.gz` | registry: `{gameId, seasonId, startUtc, homeTeamId, awayTeamId, neutralSite, final, priorMeetings, indexable, path}` |
| `stat-families.json` | the comparable family registry (§8) |
| `readiness.json` | **compare + matchup coverage receipt** (§14) |
| `receipt.json` | builder id, research content sha256, matchup pages, entity counts, per-file bytes + sha256, content hash — no wall clock |

`COMPARE_PROJECTION_SCHEMA_VERSION = 1` (`lib/compare/contract.mjs`), separate from research and platform versions;
every reader calls `assertCompareVersion` (server store and the browser loader alike).

**Why client composition.** 30 MLB teams → 435 pairs, 32 NFL teams → 496, 750 NFL players → 280,875. A page per pair is
refused by construction; the shells are 6 static pages and a comparison costs 3 static fetches (index + 2 entities,
4–57 KB index, ≤ 41 KB entity), cached by the browser/CDN like any static asset. **H2H has no index**: it is derived
from the two team entities (both already fetched), which avoids storing every meeting twice.

## 4. Pair identity

`pairKey(sport, idA, idB) = "<SPORT>:<lower id>|<higher id>"` — symmetric by construction (CP1). Display order is the
URL's `a`/`b` order and changes nothing but which column is left. Same-name people stay two ids (the two ESPN
"Chris Manhertz" athletes compare as two players; CX6). Names are never identity.

## 5. Route / query contract

| Route | Resolves | Unknown |
|---|---|---|
| `/compare/` | directory | — |
| `/compare/teams/{mlb,nfl}/?a=<slug>&b=<slug>&season=<season id>` | exact selector index slug → canonical id | invalid-link notice (no fallback) |
| `/compare/teams/epl/` | blocked state only (noindex) + club research links | — |
| `/compare/players/{nfl,epl,mlb}/?a=&b=&stat=<family slug>&season=<season id>` | exact slug → id; `stat` → `familyBySlug(sport, slug)` exact | invalid-link / stat-not-shared notice |
| `/compare/{teams,players}/ufc/` | **no route (404)** | — |
| `/matchups/{mlb,nfl}/<gameId>/` | exact registry game id | 404 (`dynamicParams=false`) |

`lib/compare/query.mjs` parses and writes state; no case folding, trimming, prefix match or name lookup
(`Keenan Allen`, `Keenan-Allen`, `keenan` are all invalid; CX6, probe 15). The loaded entity file must carry the id the
index named (slug/id mismatch → load failure). Search in the selector (`SearchableSelect`) filters labels to FIND a
candidate; selection writes the canonical slug of that exact index row.

## 6. Team Compare eligibility

`getTeamCompareEligibility(a, b, {season})` → `{eligible, pair, sharedSeasons, selectedSeason, defaultSeason, blockers}`.

- Same sport; sport ∈ {MLB, NFL}; both `supportsResults`; different ids.
- Shared seasons = seasons in which BOTH teams have ≥ 1 proven final (both scores). Default = newest shared.
- A requested season outside the intersection → `SEASON_NOT_SHARED` (never silently replaced).
- **EPL → `TEAM_RESULTS_UNSUPPORTED`** even if score-shaped rows appeared (CP7, probe 7). UFC has no teams.

## 7. Player Compare eligibility

`getPlayerCompareEligibility(a, b, {stat, season})` → `{eligible, pair, sharedStatFamilies, selectedStat, sharedSeasons, selectedSeason, defaultSeason, blockers}`.

- Same sport; sport ∈ {NFL, EPL, MLB}; different ids.
- Shared families = exact intersection of canonical keys, in product order; none → `NO_SHARED_STAT` and **no stat is
  chosen** (probe 4). A requested family outside it → `STAT_NOT_SHARED`.
- Candidate filter in the UI: once A is chosen, B's list holds only players sharing ≥ 1 family with A.
- **UFC → `SPORT_NOT_SUPPORTED`**: fighters carry outcome flags only, so no comparable family exists; the shell is not
  generated and fighter pages show no Compare CTA.

Blocker codes (`BLOCKER`): `DIFFERENT_SPORT · SAME_ENTITY · SPORT_NOT_SUPPORTED · TEAM_RESULTS_UNSUPPORTED ·
ENTITY_NOT_PUBLISHED · NO_SHARED_SEASON · NO_SHARED_STAT · STAT_NOT_SHARED · SEASON_NOT_SHARED`. Copy lives only in
`lib/compare/copy.mjs`; an unknown code throws.

## 8. Shared stat contract (`lib/compare/stat-families.mjs`)

A family = `{key: "<SPORT>.<research column>", sport, column, label, unit, valueType: integer, aggregation: per-game,
total, comparable: true, coverage, order}`. Each names exactly one v1.3 research column (pinned at build time by
`stat-families-check.mjs`), which maps to declared platform family keys — so a label is never the join.

| Sport | Families, in product order (default = first shared) |
|---|---|
| NFL | receiving yards · receptions · rushing yards · passing yards · targets · receiving TDs · rushing attempts · rushing TDs · completions · pass attempts · passing TDs* · interceptions thrown* |
| EPL | goals · assists · shots · shots on target · saves · goals against · fouls · yellow cards · red cards |
| MLB | hits · total bases · H+R+RBI · pitching strikeouts (all captured-categories-only; no totals) |
| UFC | none |

\* recorded in 2023+ ESPN lines only; earlier rows are not recorded (never 0).

A player **carries** a family when its column belongs to one of the player's v1.3 research stat groups (the group's
primary stat is non-zero in ≥ 1 recorded game — the research page's own rule) and ≥ 1 value is recorded. Measured
consequence, deliberately kept: a receiver with a few trick-play passes carries "Passing yards" (Keenan Allen: 5 of 134
games non-zero); every aggregate shows n, so the comparison stays factual. A stricter relevance threshold would be a
new product rule — not added.

⚠ `stat-families.mjs` ships to the browser and must not import `research-pages/stat-groups.mjs`: that registry names
platform family keys, and the first build put `epl.espn-player-match` into a public chunk (export-leak EX1 caught it;
CX3 now pins the import away).

## 9. Season selection

- Player: shared seasons for the SELECTED family = seasons where both recorded ≥ 1 value; default = newest shared.
  NFL 2026 player logs are blocked upstream, so 2026 is never in an intersection and never a default (CP4, CX6, probe 6).
  The page says "Season 2025 is the latest season in which both players have recorded receiving yards".
- Team: newest season where both have proven finals (2026 for MLB/NFL today, with the 2026 coverage notes).
- Recent windows are INDEPENDENT last-N across seasons ("Last 5 recorded games" / "The 3 recorded games available
  (fewer than 5)"), never a shared calendar; the chart is relative order with each game's own date.

Aggregates (player): n, mean, median, min, max, season total (where the family allows). Team: record W–L(–T), finals n,
scored/allowed, per-final means. **Never:** variance, percentile, z-score, trend, streak, grade, edge, probability.

## 10. H2H semantics (`lib/compare/head-to-head.mjs`)

- Meeting = canonical game id present in BOTH teams' rows; listed in the record only when both rows are provider-final
  with both scores AND agree (A.own = B.opp); disagreeing sides are excluded and counted (`inconsistent`, 0 today).
- Pending / postponed / unrecorded → `notFinal`, never a W/L/T (probe 8). Rows keyed by game id: a doubleheader stays two
  meetings, a repeated id counts once (CP6, CX6 on a real 2026 Angels doubleheader, probe 9). Ties counted (NFL).
- Depth is the shared recorded span (`recordedFrom`–`recordedTo`), printed as "Recorded meetings … seasons 1999–2026 in
  GameTimePicks data. Not an all-time series." MLB meetings start 2023 (finals archive); NFL 1999.
- No settlement input anywhere.

Receipt (2026-09-17): MLB 435/435 pairs with meetings · 8,136 meetings · worst pair 49; NFL 496/496 · 7,269 · worst 59.

## 11. Matchup Explorer (`lib/compare/matchup.mjs`, `/matchups/[sport]/[gameId]`)

- Registry candidates: games in BOTH teams' rows, agreeing on sides/date/status, with a start instant, inside a fixed
  window: **MLB `MLB-2026` from 2026-09-17T00:00Z · NFL `NFL-2026` from 2026-09-09T00:00Z** (Week 1).
  Neutral site: rows carry no host → teams shown in canonical id order with "vs" and "neutral site".
- **Durability:** the builder reads the committed registry and **refuses to drop** a published game id (exit 2), so a
  Matchup URL keeps working after game day (probe 18). Budget `MATCHUP_PAGE_BUDGET = 600` (refuses beyond).
- Page sections: header (scheduled instant, absolute ET) → **Result** (official final, when recorded) or **Schedule**
  (reader clock) → Data coverage → "The teams entering this game" (season-to-date before the game's start, the prior
  season labelled explicitly, last 5 finals before the game) → "Recorded meetings before this game" (last 10 + record)
  → **Current GameTime forecast** (separate, only on exact join) → More research (Compare these teams, team research).
- Everything team-level is "entering this game" (strictly before its start), so the page means the same before and after.
- EPL / UFC matchup pages: not built (EPL has no results; UFC fighter pages + bout pages already carry fight history).

## 12. Forecast separation (`lib/compare/matchup-forecast.ts`)

- NFL: link to `/nfl/game/<id>/` iff `nflPageIds()` has the exact id (the route's own rule). Player names listed only
  for rows of `buildMyPlayerRows()` (PUBLISHED families) with a range in that exact report — names link to research,
  **no value is shown** (MF1, probe 14.1).
- MLB: link iff `detailByMatchId("mlb", gamePk).prediction.status !== "unavailable"` — the live-record pause gate has
  already run; MLB totals stay PAUSED and no market value is shown anywhere on the page (MF1, probe 14).
- The section reads "Current GameTime forecast · Model output, not historical fact". No compare artifact carries a
  forecast field (`FORBIDDEN_COMPARE_FIELDS`, CX2, probe 13); only `matchup-forecast.ts` reads a forecast owner (CX7).
- Model eligibility, methodology and statuses: unchanged.

## 13. Reader-clock behaviour

- A recorded final is a projection fact and is server-rendered (`data-matchup-status="final"`).
- Otherwise the static HTML says "Scheduled start: <absolute time>" (`pending`); after mount `MatchupStatus` decides
  `scheduled` (start in the future) or `started` ("The scheduled start … has passed. No final is recorded in GameTimePicks
  research data yet." + link to `/live/` for MLB or the game page for NFL). No "upcoming/today/tomorrow/starts in" is
  ever built into HTML (CB4). No Live request is made (CB7).
- Team Compare's "Scheduled meetings with matchup research" also marks a passed start on the reader clock.

## 14. Coverage (`data/compare-projection/v1/readiness.json`, 2026-09-17)

| Sport | Team Compare | Player Compare | Matchup pages |
|---|---|---|---|
| MLB | 30/30 SHIPPED | 255/255 SHIPPED · 3 comparable families (pitching K: 1 player) · captured categories only | 93 (noindex) · window from Sep 17 |
| NFL | 32/32 SHIPPED | 720/750 SHIPPED (30 without a comparable family) · 12 families | 33 (33 indexable) · Week 1+ |
| EPL | BLOCKED `TEAM_RESULTS_UNSUPPORTED` | 414/414 SHIPPED · 9 families (2025-26 and earlier) | none |
| UFC | n/a | BLOCKED (no comparable family; 352 fighters) | none |

## 15. SEO

- Indexable: `/compare/`, `/compare/teams/{mlb,nfl}/`, `/compare/players/{nfl,epl,mlb}/` — canonical = the shell path,
  so every query state shares one canonical; no pair URL is ever in the sitemap (MF3, CB2, probe 16).
- Noindex: `/compare/teams/epl/` (blocked state), every MLB matchup (daily volume, runs-only team data — no sitemap
  churn), NFL matchups with no recorded meeting (none today) (probe 21).
- Matchup titles are factual: "<Away> at <Home> matchup history and team stats | GameTimePicks" (never "prediction").

## 16. Performance (2026-09-17, local, Node 20.4.0)

| Metric | v1.3 | v1.4 |
|---|---:|---:|
| Route families (inventory) | 79 | 83 |
| Generated static pages | 2,308 | 2,441 (+7 shells, +126 matchups) |
| `npm run build` wall | 95.8 s | 110.8 s (same data; +15 s: 133 pages + asset emit 0.3 s) |
| `/compare/players/[sport]` first load | — | 109 kB (4.56 kB page) |
| `/compare/teams/[sport]` first load | — | 110 kB |
| `/matchups/[sport]/[gameId]` first load | — | 112 kB (2.49 kB page) |
| Compare projection | — | 10.4 MB content · 1.5 MB stored · builds in ≈2.3 s |
| Public compare assets | — | 1,456 files · 10.4 MB (≈13 MB on disk) |
| Requests per comparison | — | 3 static fetches; 0 Live; 0 provider |
| Post-build suite wall | 105 s | 106 s |

## 17. Build commands (from `app/`)

```bash
node scripts/data-platform/build.mjs --all --check          # 1. platform fresh? (refresh + validate + parity if STALE)
node scripts/research/build-research-projections.mjs         # 2. research projection (then --check)
node scripts/compare/build-compare-projections.mjs           # 3. compare projection (refuses a stale research projection)
node scripts/compare/build-compare-projections.mjs --check   #    exit 1 when the committed compare projection is stale
node scripts/compare/emit-compare-assets.mjs                 #    runs inside `npm run build` and `predev`
```

Order is mandatory: platform → research → compare. Commit `data/research-projection/v1` and
`data/compare-projection/v1` with explicit paths. Exit codes: 0 ok · 1 stale · 2 upstream stale / refused (drop, budget,
forbidden field) · 3 no research projection.

## 18. Validation

| Suite | Phase | Pins |
|---|---|---|
| `compare/compare-contract.test.mjs` CP1–CP11 | unit | pair symmetry, refusals, exact stat + season intersection, missing≠0, H2H finals/doubleheaders/ties/inconsistency, EPL block, UFC none, matchup registry + durability, family order, no evaluative field |
| `compare/compare-projection.test.mjs` CX1–CX7 | unit | committed = rebuild (order-free) of the CURRENT research projection; leaks; boundaries (no platform, no server module in a client, no platform family name in a browser module); registry integrity/window/budget/indexing; no pair explosion; real data (KC–LAC symmetry, Manhertz, NFL 2026, a real doubleheader, exact slugs); forecast readers |
| `compare/matchup-composition.test.mjs` MF1–MF3 | unit | forecast link ⇔ exact published forecast (NFL rule, MLB pause-gated prediction), PUBLISHED-range players only; CTA helper; sitemap policy |
| `compare/compare-built.test.mjs` CB1–CB7 | post-build | exported shells/matchups = registry; SEO; public assets = committed projection; neutral factual matchup content, reader-clock status, forecast ⇔ join; links resolve; CTAs only to existing pages; no Live/provider/localStorage in page chunks |
| `data-platform/export-leak.test.mjs` EX1 | post-build | caught the stat-groups family key in a client chunk (fixed) |
| `e2e/accessibility.spec.ts` | browser ×3 | `/compare/players/nfl/?a=keenan-allen&b=travis-kelce` (composed) + first NFL matchup: contrast at 3 viewports, 320 px reflow, **document width ≤ screen** for research/compare/matchup routes |

## 19. Mutation guards

Every probe mutates one line, runs the named suites, restores from a hash-checked backup
(`probe-results` in the handoff). Probe list and outcomes: see the v1.4 handoff §N.

## 20. Browser QA

Built export (`node app/scripts/serve-export.mjs 4173 out`) at 320/375/390/768/1024/1440: Player Compare (NFL pair,
EPL pair, MLB pair, no-shared-stat, invalid slug, stat-not-shared link), Team Compare (NFL, MLB, one side, swap, invalid,
EPL blocked), Matchup (final NFL, pending MLB, reader clock advanced past start). Results: v1.4 handoff §O.

⚠ **Found in QA:** an `sr-only` header cell inside a NON-positioned `overflow-x: auto` scroller is positioned against the
page, not the scroller, so the document grows (Team Compare 510 px at a 390 px phone → the browser zooms the whole page
out) while the offender scan reports nothing. Every compare and research scroller now sets `position: relative`, and the
a11y spec asserts document width ≤ screen for `/compare`, `/matchups`, `/teams`, `/players`.

## 21. Known gaps

| Gap | Sport | User impact | Owner / next |
|---|---|---|---|
| No id-keyed final scores | EPL | no Team Compare, no EPL matchup pages | data program (founder: source) |
| No comparable fight statistic | UFC | no fighter compare | founder gate (licence) |
| NFL 2026 player logs blocked | NFL | player compare is 2025 and earlier | data program |
| MLB captured categories only | MLB | player compare n reflects priced games, not games played | data program (box scores) |
| Team rows do not mark preseason | NFL | a future preseason final would count in "season to date" (0 today) | projection (carry `seasonPhase`) |
| Neutral-site host not carried | NFL | neutral games list teams in id order | projection (carry home/away for N) |
| Matchup registry refresh is manual | MLB, NFL | new schedule dates get pages only after platform → research → compare refresh | ops decision (same as v1.3) |
| Budget 600 won't hold an MLB 2027 season | MLB | builder will refuse | v1.5: rolling archive policy before Opening Day 2027 |
| Team Compare browser a11y is local QA only | MLB, NFL | CI audits Player Compare + Matchup (budget) | add when CI headroom allows |

## 22. v1.5 handoff

Ready without new data: richer filters over the compare entities (season, stat, home/away), a season explorer over
team rows, a game finder over the matchup registry pattern. Not ready: EPL results, UFC statistics, NFL 2026 player
lines, MLB box scores, saved research state (needs a new owner decision). **Next bounded program: v1.5 Research Lab.
Not started.**
