# GameTime Data Platform — architecture, contracts and runbook (v1.2)

The single architecture and runbook for the Data Platform. It complements, and does not replace,
`docs/GAMETIME_LIVE.md` (Live state) and `docs/RETENTION_ARCHITECTURE.md` (identity for Follow / My GameTime /
Since Your Last Visit). Written 2026-09-17.

**Status: v1.2 FOUNDATION.** Internal only. **No public consumer reads the platform** (pinned by
`boundary.test.mjs` B1), no route was added, nothing is exported to the browser.

---

## 1. Purpose

A reproducible, validated, canonical layer of **identity and factual sports data** that later programs (v1.3 Team
and Player Research, v1.4 Matchup Explorer, v1.5 Research Lab, v1.6 Ask GameTime) read through stable ids instead
of bespoke provider-shaped files. It answers, from stable ids: which sport/league/season, which canonical team,
player and game, which provider ids name them, who played, when it was scheduled, the factual final where one is
committed, team-game and player-game facts, where every row came from, and what is missing versus truly zero.

It is **not** a second truth system. It never owns a forecast, a live state, a grade, or a reader's preference.

## 2. Owner boundaries

```
PRE-GAME FORECAST     LIVE EVENT STATE     SETTLEMENT (grading)    USER PREFERENCES      DATA PLATFORM
model-owned           provider-owned       settlement-owned        device-owned          fact/identity-owned
immutable             ephemeral            canonical grade         local only            rebuilt from committed sources
```

- A platform `GameRecord` may say `statusClass: "FINAL"` and carry factual final-score rows. **That is not a
  grade.** Settlement joins the platform by canonical id if it ever wants to; the platform never grades.
- Records structurally refuse other owners' fields (`FORBIDDEN_OWNER_FIELDS` in `contract.mjs`: forecast,
  probability, liveState, clock, settled, gradedAt, followed, saved, observedAt, …). Probe 5 proves it.
- Live state is never persisted: no inning, clock or in-progress score exists in any record.
- Forecasts point at platform ids (`Forecast → canonical refs`); platform records hold no "latest forecast".

## 3. Canonical entities

`Sport → League → Season → Game (Team, Team | two fighters) ; Game + Team → TeamGameStat ; Game + Player → PlayerGameStat`

| record | key fields (schemaVersion 1) |
|---|---|
| SportRecord | `id` ∈ MLB·NFL·EPL·UFC (the product's existing sport codes), `name` |
| LeagueRecord | `id` (= sport code; one league per sport in v1.2 — EPL is its own league, not "soccer"), `sportId`, `name`, `providerAliases` |
| SeasonRecord | `id`, `sportId`, `leagueId`, `label`, `semantics`, `startDate`/`endDate` (null: no provider season window is committed) |
| TeamRecord | `id`, `sportId`, `leagueId`, `name`, `shortName`, `abbreviation`, `providerAliases` (≥1) |
| PlayerRecord | `id`, `sportId`, `name`, `currentTeamId` (convenience only — never history), `providerAliases` (≥1) |
| GameRecord | `id`, `sportId`, `leagueId`, `seasonId`, `seasonPhase`, `startUtc`, `officialDate`, `homeTeamId`, `awayTeamId`, `competitors` (UFC), `card` (UFC), `neutralSite`, `venue {providerId,name}`, `statusClass` FINAL·NOT_FINAL, `providerAliases` |
| TeamGameStatRecord | `family`, `sportId`, `gameId`, `teamId`, `opponentTeamId`, `homeAway`, `isFinal`, `stats`, `src` |
| PlayerGameStatRecord | `family`, `sportId`, `gameId`, `playerId`, `teamId` (team of THAT game), `opponentTeamId`, `opponentPlayerId` (UFC), `stats`, `src` |

- **UFC hierarchy.** The product routes bouts (`/ufc/bout/[boutId]`), so a Game is a **bout**; the card is
  `GameRecord.card {id,name}`; fighters are Players in `competitors` (RED/BLUE). No team fields are used.
- **statusClass** is a factual class *as of the source cutoff*: FINAL = an approved committed source records the
  event as completed. NOT_FINAL never means "in progress" and never means "0–0".
- **Participation is per game.** A player who changed teams keeps one id; each game row carries that game's team
  (Keenan Allen CHI 2024 → LAC 2025, pinned in NFL-4). `currentTeamId` comes only from a current roster capture.

## 4. ID contracts

**Rule 1 — shipped ids are reused exactly.** **Rule 2 — a new id is a namespaced stable provider id**, never a
name, a sequence or ingestion order. All ids are formed in `lib/data-platform/ids.mjs`; MLB/NFL team and NFL player
ids are produced by the Follow owner's own builders (`lib/follow/follow-schema.mjs`), so they cannot drift.

| entity | canonical id | provider aliases | new in v1.2? | shipped consumers preserved |
|---|---|---|---|---|
| MLB game | StatsAPI `gamePk` (`"745844"`) | `mlb_statsapi:game` | no | routes, Live, Saved, graded rows (parity P-MLB-2/4) |
| MLB team | `mlb-team-<StatsAPI id>` | `mlb_statsapi:team` | no | Follow (P-MLB-1) |
| MLB player | `mlb-player-<StatsAPI person id>` | `mlb_statsapi:player` | **yes** | none existed |
| NFL game | ESPN event id | `espn:game`, `nflverse:game` (game_id) | no | `/nfl/game/[eventId]`, forecasts, graded picks (P-NFL-2/6/7) |
| NFL team | `nfl-team-<ESPN team id>` | `espn:team`, `nflverse:team` (franchise code) | no | Follow (P-NFL-1) |
| NFL player | `nfl-athlete-<ESPN athlete id>` | `espn:player`, `nflverse:player` (gsis), `pfr:player` | no | player boards, Follow (P-NFL-5) |
| EPL game 2026-27 | shipped `soccer:epl:<sorted slugs>:<yyyymmddthhmm>` | `openfootball:game`, `gametime_epl_event:game` (superseded ids) | no | forecasts, graded rows, odds (P-EPL-1/2/3) |
| EPL game 2022-23…2025-26 | ESPN event id | `espn:game` | **yes** (no shipped id existed) | — |
| EPL team | `epl-team-<ESPN team id>` | `espn:team`, `gametime_epl_club:team` (shipped slug) | **yes** | club slug inside shipped ids (P-EPL-5) |
| EPL player | `epl-athlete-<ESPN athlete id>` | `espn:player` | **yes** | graded player projections carry the bare ESPN id (P-EPL-4) |
| UFC bout | ESPN competition id | `espn:game` | no | `/ufc/bout/[boutId]` (P-UFC-1) |
| UFC fighter | `ufc-athlete-<ESPN athlete id>` | `espn:player` | **yes** | card-latest athleteId (P-UFC-2) |
| season | `MLB-2025`, `NFL-2025` (start year), `EPL-2025-26`, `UFC-2026` (UTC year of the card) | — | **yes** (convention) | — |

Game ids are unique **within a sport**; cross-sport references use the existing `SPORT:type:id` shape (`refKey`).

⚠ **EPL shipped ids embed kickoff.** A TV reschedule mints a new shipped id (252 superseded ids measured across 71
captures; Aston Villa v Fulham moved twice). The platform does not remint the convention: the current id is
canonical and every superseded id is a `gametime_epl_event` alias linked by the stable openfootball fixture key.
Changing the shipped convention is a founder decision (gate 3), not a v1.2 change.

## 5. Provider aliases

`{ provider, entityType, id }` — ids are strings at the boundary. Engine: `lib/data-platform/aliases.mjs`.

- Two indexes: canonical → aliases (on each record) and alias → canonical (`aliases/<SPORT>.jsonl.gz`).
- Keys are **sport-scoped** (ESPN team ids are league-scoped numbers).
- An alias claimed by two entities resolves to **nobody** (`AMBIGUOUS`) and fails validation — never last-write-wins.
- One entity may hold **one** id per provider namespace (two gsis ids on one athlete = two people merged), except
  the declared lineage namespace `gametime_epl_event`.
- Every alias must round-trip (41,460 checked on the committed store). No name path exists in the module.
- Same semantics as `buildAliasIndex` in `lib/identity/event-identity.ts` (Sprint 043); cross-agreement pinned (A5).

## 6. Storage layout

```
data/internal/platform/v1/                 (repo root; internal; never under app/public; never served)
  manifest.json                            content manifest — sha256 + size of every content file; NO wall clock
  sports.json leagues.json seasons.json    small registries
  stat-dictionary.json                     families, keys, types, units, domains, coverage notes
  sources.json                             every source artifact read: path, bytes, sha256, registry id, data class, time meaning, cutoffs
  teams/<SPORT>.jsonl.gz  players/<SPORT>.jsonl.gz  aliases/<SPORT>.jsonl.gz
  games/<SPORT>/<season>.jsonl.gz
  team-game-stats/<SPORT>/<season>.jsonl.gz
  player-game-stats/<SPORT>/<season>.jsonl.gz
  coverage/<SPORT>.json
  receipts/validation.json  receipts/<SPORT>/diagnostics.json  receipts/<SPORT>/conflicts.json
  receipts/parity.json       (point-in-time; not in the manifest)
  receipts/build-latest.json (wall-clock timings; not in the manifest; churns on every build)
```

JSONL partitions are gzip-stored (104 MB of content → 3.7 MB on disk). Manifest hashes describe the **uncompressed**
content; the builder writes a file only when its content changed, so a byte-identical rebuild leaves git clean.

**Git policy.** The store is committed (repo convention: derived internal artifacts live tracked under
`data/internal/`). No bot workflow stages `data/internal` wholesale (pinned, B5). No Git LFS, no external storage.

### Storage is replaceable; identity and contracts are not.

The v1 schemas and the read API in §16 are the stable interface. The gzip-JSONL files are an implementation. A
future SQLite/Postgres/warehouse backend can replace them without changing a canonical id or a provider alias.

## 7. Raw vs normalized vs public

| layer | where | rules |
|---|---|---|
| raw / source | existing committed captures and research tables (never edited by the platform) | source-shaped, preserved |
| canonical normalized | `data/internal/platform/v1` | stable schema, canonical ids, deterministic order, provenance, explicit missingness, no UI copy, no model judgment |
| public projection | **none in v1.2** | a future projection must be compact, id-only for provenance, and pass the export leak guard (`export-leak.test.mjs`) |

## 8. Source matrix

Policy stays in `lib/sports/source-registry.mjs` (nflverse was in use since P257-F but unrecorded; v1.2 recorded it
as PRIVATE_RESEARCH). The platform reads committed artifacts only — no network, no refresh, no new provider.

| sport | category | source key | artifact(s) | registry | class | ids |
|---|---|---|---|---|---|---|
| MLB | 2023–25 finals | `mlb.finals-history` | `data/internal/mlb/linescores-history/<season>/<date>.json` | mlb_statsapi | PRIVATE_RESEARCH | gamePk, team id, venue id |
| MLB | 2026 finals | `mlb.linescores` | `data/internal/mlb/linescores/<date>.json` | mlb_statsapi | INTERNAL | gamePk (teams by NAME — checked, never joined) |
| MLB | schedule | `mlb.statsapi-schedule` | `app/public/data/mlb/statsapi-schedule/*.json` | mlb_statsapi | PUBLIC_PRODUCT | gamePk, team id |
| MLB | schedule/abbr | `mlb.boards` | `app/public/data/mlb/boards/*.json` (`games[]` only) | mlb_statsapi | PUBLIC_PRODUCT | gamePk, team id+abbr |
| MLB | player actuals | `mlb.settled-leans` | `app/public/data/mlb/results/settled_leans.jsonl` (`actual` only) | mlb_statsapi | PUBLIC_PRODUCT | gamePk, person id |
| NFL | 1999–2025 finals | `nfl.nflverse-games-history` | `data/internal/research/nfl/replay/games-history-v2.json` | nflverse | PRIVATE_RESEARCH | game_id, ESPN event id |
| NFL | 2013–25 skill lines | `nfl.nflverse-player-games` | `…/replay/player-games-v2.json.gz` | nflverse | PRIVATE_RESEARCH | gsis / pfr |
| NFL | id crosswalk | `nfl.nflverse-id-bridge` | `…/snap-counts/id-bridge-v1.json` | nflverse | PRIVATE_RESEARCH | pfr, gsis, ESPN |
| NFL | 2026 finals (secondary) | `nfl.nflverse-current-season` | `…/replay/current-season.json` | nflverse | PRIVATE_RESEARCH | ESPN event id |
| NFL | 2023–25 ESPN lines + finals | `nfl.espn-player-events` | `data/internal/research/nfl/player-events-v1/<year>.json` | espn_site_api_nfl | PRIVATE_RESEARCH | ESPN event, athlete |
| NFL | 2026 schedule | `nfl.espn-schedule` | `app/public/data/nfl/schedule/*.json` | espn_scoreboard | PUBLIC_PRODUCT | ESPN event, team |
| NFL | 2026 finals | `nfl.espn-results` | `app/public/data/nfl/results/latest.json` | espn_scoreboard | PUBLIC_PRODUCT | ESPN event, team |
| NFL | athletes | `nfl.espn-rosters` | `app/public/data/nfl/rosters/*.json` | espn_site_api_nfl | PUBLIC_PRODUCT | ESPN team, athlete |
| EPL | 2026-27 fixtures | `epl.fixtures` | `app/public/data/soccer/epl/fixtures/capture-*.json` | openfootball | PUBLIC_PRODUCT | shipped event id, openfootball key |
| EPL | 2022–26 matches + player lines | `epl.espn-player-match` | `data/internal/research/epl/players/espn-players-v1.jsonl` | espn_scoreboard | PRIVATE_RESEARCH | ESPN event, team, athlete |
| EPL | 2026-27 squads | `epl.espn-squads` | `…/players/squads-2026-27.json` | espn_scoreboard | PRIVATE_RESEARCH | ESPN team, athlete |
| UFC | 2023-08…2026-08 bouts | `ufc.espn-history` | `data/internal/research/ufc/corpus-v1.json` | espn_scoreboard | PRIVATE_RESEARCH | ESPN competition, card, athlete |
| UFC | upcoming bouts | `ufc.espn-schedule` | `app/public/data/ufc/schedule/capture-*.json` | espn_scoreboard | PUBLIC_PRODUCT | same |
| UFC | recent finals | `ufc.espn-results` | `app/public/data/ufc/results/latest.json` | espn_scoreboard | PUBLIC_PRODUCT | same |

**Deliberately NOT normalized:** NFL `data/internal/nfl/official-stats` (zero-fills categories an athlete never
appeared in — missing and zero are indistinguishable); UFC `results-latest.json`/graded picks (name-keyed bout
ids); ufcstats GPL CSVs (names only); EPL openfootball/api-football/corpus scores (name-keyed); football-data.co.uk
(local-only, licence); forecast, projection, lean, odds and settlement values of every sport (other owners).

## 9. Sport coverage (committed store, 2026-09-17)

| Sport | Teams | Players | Games | Team-game rows | Player-game rows | Historical depth | Status |
|---|---:|---:|---:|---:|---:|---|---|
| MLB | 30 | 732 | 8,868 | 16,242 | 19,483 | finals 2023–2025 (7,289) + 2026 | team AVAILABLE · player PARTIAL (market-scoped) |
| NFL | 32 | 4,023 | 7,334 | 14,538 | 107,939 | finals 1999–2026 · ESPN lines 2023–25 · nflverse lines 2013–25 | AVAILABLE with gaps |
| EPL | 27 | 1,565 | 1,900 | — (unsupported) | 60,742 | matches + player lines 2022-23…2025-26 · 2026-27 fixtures | player AVAILABLE · team-game UNSUPPORTED |
| UFC | — | 1,085 | 1,812 | — | 3,478 | bouts 2023-08…2026-11 | winner flags AVAILABLE · method/round UNSUPPORTED |

Per-season denominators, diagnostics and declared slices: `coverage/<SPORT>.json`;
`node scripts/data-platform/inspect.mjs --coverage` prints them.

## 10. Stat dictionaries

One envelope, sport-specific **families** (`lib/data-platform/stat-dictionary.mjs`). A family = one source's factual
line at one grain; two sources describing the same player-game keep separate family rows, and disagreements on
shared fields are receipted (47 ESPN-vs-nflverse field disagreements, all small).

| family | level | keys |
|---|---|---|
| `mlb.final-score` | team | runs |
| `mlb.prop-actuals` | player | hits, totalBases, hitsRunsRbis, pitcherStrikeouts — **only categories a sportsbook priced** |
| `nfl.final-score` | team | points |
| `nfl.espn-player-lines` | player | pass cmp/att/yds/td/int, sacksTaken, rush att/yds/td, targets, receptions, rec yds/td, fumbles, fumblesLost |
| `nfl.nflverse-skill-lines` | player | participation, offenseSnaps, targets, receptions, rec/rush/pass yds, carries, pass att/cmp, rush/rec/other TDs |
| `epl.espn-player-match` | player | position, formationPlace, started/subbedIn/subbedOut/appeared, goals, assists, shots, shotsOnGoal, cards, fouls, offsides, saves, goalsAgainst |
| `ufc.bout-result` | player | won, boutHadWinner |

Domains are family-specific: counts are non-negative integers, yards may be negative. No derived or advanced metric.

## 11. Provenance

Every stat row carries `src` (a source key). `sources.json` maps each key to its artifacts (repo-relative path,
bytes, sha256), registry id, data class and time meaning, plus per-source **cutoffs** (latest evidence in the
source — never the build time). The builder id is `gametime-data-platform-build@1`; the manifest hashes every
content file. Provenance paths are internal; the export leak guard proves none reaches `app/out`.

**Time semantics.** `startUtc` = scheduled instant from the provider (normalized spelling, never guessed from a
date); `officialDate` = the provider's calendar date where no instant exists; capture/generation times stay in
`sources.json`; no record carries a build, grading or device time.

## 12. Missingness

- A row carries every key its family declares. **`0` = recorded zero. `null` = the source did not record that
  category for this player-game** (an NFL kicker's ESPN line is all null). **No row = the source has no line** —
  not "did not play", not zero.
- A game with no committed final has no final-score rows (never 0–0; validation refuses a final-score row on a
  NOT_FINAL game).
- An unsupported category has **no rows and a declared slice** in coverage (EPL team-game: 0 rows + UNSUPPORTED).

## 13. Build commands (from `app/`)

```bash
node scripts/data-platform/build.mjs --all            # rebuild every sport (≈5 s, ≈0.9 GB peak RSS)
node scripts/data-platform/build.mjs --sport NFL      # rebuild one sport; others re-read from disk
node scripts/data-platform/build.mjs --all --check    # rebuild in memory; exit 1 if the committed store differs
node scripts/data-platform/validate.mjs               # manifest integrity + whole-store validation (≈1 s)
node scripts/data-platform/parity.mjs                 # shadow parity vs current owners → receipts/parity.json
node scripts/data-platform/inspect.mjs --coverage | --golden | --bench | --resolve <SPORT> <provider> <type> <id>
```

Exit codes: 0 ok · 1 stale/invalid/unexplained parity · 2 validation failure (nothing written) · 3 no store · 64 usage.

## 14. Validation

`validate.mjs` (pure), run by the builder before any write and by `committed-store.test.mjs` on every unit run:
schema per record (future schemaVersion refused) · canonical id formats (no name-shaped ids) · uniqueness ·
alias collisions / same-provider duplicates / round trip · referential integrity (league, season, teams, players,
games) · participants (two distinct teams; UFC two distinct fighters RED/BLUE + card) · season plausibility ·
final-fact rule · stat family/level/sport · stat domains · stat side (team played; opponent is the other side;
HOME row is the home team) · row uniqueness `(sport, family, game, team|player)`.

Adapters are fail-closed and report structured diagnostics (`diagnostics.mjs`): MISSING_EVENT_ID, MALFORMED_ROW,
UNRESOLVED_TEAM/PLAYER/GAME, AMBIGUOUS_ALIAS, EXCLUDED_BY_SCOPE, DUPLICATE_SOURCE_OCCURRENCE, STAT_CONFLICT,
SIDE_MISMATCH, INVALID_STAT, NAME_VARIANT. Field precedence tables live at the top of each adapter; conflicts are
receipted (`receipts/<SPORT>/conflicts.json`), never averaged.

## 15. Coverage receipts

`coverage/<SPORT>.json`: entities, rows, source rows read, aliases by provider, diagnostics by code, conflicts,
per-season games / finals / missing start / missing any date / missing team ids / finals without team rows / rows by
family / first and last event date, family status, and **declared slices** (UNSUPPORTED · SOURCE_MISSING ·
UNRESOLVED_IDENTITY · PARTIAL) with reasons. Status words describe data availability, never model quality.

## 16. Query API (`lib/data-platform/readers.mjs`, server/build time only)

`openPlatform(root)` → `manifest()` · `getSport(id)` · `getLeague(id)` · `getSeason(id)` · `listSeasonsForLeague(id)`
· `getTeam(id)` · `getPlayer(id)` · `getGame(sportId, id)` · `resolveAlias(sportId, provider, entityType, providerId)`
→ RESOLVED/UNKNOWN · `listGamesForTeam(teamId, {seasonId, finalOnly, order, limit, offset})` ·
`listGamesForPlayer(playerId, …)` · `listGamesForSeason(seasonId, …)` · `listHeadToHead(teamA, teamB, …)` ·
`listTeamGameStats(teamId, {family, seasonId, order, limit})` · `listPlayerGameStats(playerId, …)` ·
`getTeamGameStat(sportId, gameId, teamId, family?)` · `getPlayerGameStat(sportId, gameId, playerId, family?)` ·
`getCoverage(sportId)`. Also `readStore(root)`, `verifyManifest(root)`, `readSportFromDisk(root, sport)`.

Ordering is explicit (event instant, then id). Golden examples (`inspect.mjs --golden`, pinned in CS7): ESPN NFL
event 401872929 → WSH @ PHI; gamePk 745844 → 2024 doubleheader game 1; Mets 2025 → 162 games (83–79 from factual
finals); Keenan Allen last 5 ESPN lines with the team of each game; Chiefs–Chargers last meeting; Arsenal 2025-26 →
38 matches; Pantoja's bouts with winner flags.

## 17. Migration / parity policy

Shadow first. No consumer is migrated in v1.2. `parity.mjs` compares the committed store with current owners
(21 checks on 2026-09-17: **18 MATCH, 3 EXPLAINED, 0 UNEXPLAINED**). Dispositions are a closed vocabulary; a
mismatch caused by an owner artifact newer than the build is STALE_PLATFORM only when `sources.json` fingerprints
prove it. A disagreement is never "fixed" by editing a source or an owner.

| Existing owner | Platform equivalent | Rows compared | Mismatches | Disposition |
|---|---|---:|---:|---|
| Follow MLB team ids (statsapi-schedule) | teams/MLB | 30 | 0 | MATCH |
| statsapi-schedule gamePk | games/MLB | 289 | 0 | MATCH |
| statsapi-schedule start (newest capture) | GameRecord.startUtc | 289 | 0 | MATCH |
| settlement: MLB graded actual runs | mlb.final-score | 630 | 0 | MATCH |
| finals-history acquisition receipt | MLB 2023–25 FINAL counts | 4 | 0 | MATCH |
| Follow NFL team ids (rosters) | teams/NFL | 32 | 0 | MATCH |
| NFL schedule event ids | games/NFL | 81 | 0 | MATCH |
| NFL results FINAL scores | nfl.final-score | 16 | 0 | MATCH |
| settlement: NFL experimental grade.actual | nfl.final-score | 61 | 45 | DECLARED_GAP (finals older than the rolling results window) |
| NFL player-board athlete ids | players/NFL | 361 | 0 | MATCH |
| NFL graded-picks event ids | games/NFL | 59 | 0 | MATCH |
| NFL forecasts event ids | games/NFL | 16 | 0 | MATCH |
| EPL newest fixture ids | games/EPL-2026-27 | 380 | 0 | MATCH |
| EPL forecast event ids (dated/latest/recovered) | games/EPL (+ lineage) | 58 | 0 | MATCH |
| settlement: EPL graded-forecast ids | games/EPL | 36 | 0 | MATCH |
| EPL graded player projections ids | players/EPL | 611 | 19 | DECLARED_GAP (late signings absent from committed identity captures) |
| EPL fixture home/away clubs | TeamRecord names | 380 | 0 | MATCH |
| UFC card-latest bout ids | games/UFC | 12 | 0 | MATCH |
| UFC card-latest athlete ids | competitors | 12 | 0 | MATCH |
| UFC results winner flags | ufc.bout-result | 23 | 0 | MATCH |
| UFC model-vs-market bout ids | games/UFC | 31 | 24 | DECLARED_GAP (bouts between the history capture and the results window) |

## 18. Performance (2026-09-17, local, Node 20.4.0)

| Measurement | Value |
|---|---:|
| Platform build time (`--all`) | 5.2 s (load 1.4 s · normalize 1.2 s · assemble+validate 1.4 s · write 1.1 s) |
| Peak RSS (build) | 884–911 MB |
| Validation (`validate.mjs`) | ≈1.1 s (integrity 0.13 s · load 0.46 s · validate 0.53 s) |
| Canonical content bytes | 108.9 MB uncompressed · 3.7 MB stored |
| Alias index bytes | 247 KB stored (41,460 aliases) |
| Query init | open 1 ms · first read per sport 17–284 ms (lazy load + indexes) |
| Query latency | 0.001–0.15 ms per call |

The builder parses each source once; joins use maps (no O(N²) cross-provider search). Memory is dominated by the
MLB boards (188 MB of JSON, `games[]` kept) and NFL player tables; partitioning keeps each file small.

## 19. Privacy / public leak policy

The platform is sports data only — no follows, saves, observations, accounts or device state (B4). The store is
outside `app/` and never exported; no app code outside the platform package imports it or reads it (B1; also the
condition under which the 2023–2025 MLB finals archive may be read at all — see `finals-history-isolation.test.mjs`).
`export-leak.test.mjs` (post-build) scans `app/out` for store paths, source keys and platform names. Committed
artifacts carry no model-judgment copy ("validated", "high confidence", "edge") and no credential names (B4).

## 20. Operations / runbook

- **Refresh:** after source captures change, run `build.mjs --all`, then `validate.mjs`, then `parity.mjs`. Review
  `git diff --stat data/internal/platform` (only changed partitions rewrite), commit with explicit paths.
- **Is it stale?** `build.mjs --all --check`. Staleness is expected between refreshes (bots commit captures daily)
  and is never a CI failure: `committed-store.test.mjs` checks preservation only against source artifacts whose
  sha256 still matches `sources.json`.
- **No scheduled job** refreshes the store in v1.2 (adding one is an ops decision). **CI:** the unit phase runs the
  platform suites (core, adapters, validate, committed-store, boundary ≈ 6 s); post-build runs the export leak guard.
  The quality gate is path-filtered to `app/**`, so a data-only commit of `data/internal/platform` does not trigger
  it — run `validate.mjs` before pushing such a commit.
- **Failure:** a validation failure writes nothing (exit 2); read `receipts/validation.json` from the last good
  build or rerun and read stderr.

## 21. Known unsupported slices (v1.2)

| Gap | Sport | Why | Impact on v1.3 |
|---|---|---|---|
| Full box scores; team stats beyond runs | MLB | not committed (settlement reads box scores live, keeps priced actuals) | player pages show market-scoped actuals only |
| Player identity beyond prop-carrying players | MLB | lineups/boards are forecast-owned, not participation facts | PARTIAL player coverage (732) |
| 122 2026 finals without team attribution | MLB | name-only linescores, no id-bearing capture for those gamePks | small gaps in 2026 team logs |
| Finals older than the rolling results window (2026) | NFL, UFC | `results/latest.json` is overwritten each run | 2026 preseason/older finals absent; retaining dated results captures closes it |
| 34,427 nflverse rows without an ESPN id | NFL | committed bridge covers players active 2022+ | 2013–2021 skill lines partial |
| 23 nflverse games with a shared ESPN id | NFL | source defect (11 ids claimed by 2–3 games, 2003–2010) | those games absent |
| 2026 player lines | NFL | only capture zero-fills missing categories | no 2026 player logs yet |
| Preseason 2023–25 | NFL | team sides name-only in the ESPN corpus | none for research pages |
| Final scores / team-game stats | EPL | every score source is name-keyed | EPL team pages lack results |
| ESPN alias for 2026-27 fixtures; 2026-27 player lines | EPL | no id-keyed link; corpus ends 2025-26 | current-season EPL player logs absent |
| Method / round / time / strikes | UFC | name-keyed GPL scrape only | fighter pages: win/loss only |

## 22. v1.3 consumer guidance

- Read through `openPlatform`; never parse a source artifact in a page. Build a **compact projection** at build
  time for the pages that need it; never ship the store to the browser; keep `export-leak.test.mjs` green.
- Before rendering an absent row, read `getCoverage(sport)` — absence can be UNSUPPORTED, SOURCE_MISSING or
  "no line", and each needs different copy. Never render a missing category as 0.
- Join forecasts, Live and settlement by canonical id at the page, keeping owners separate (`docs/GAMETIME_LIVE.md`
  §2, `docs/RETENTION_ARCHITECTURE.md` §1).
- Readiness (2026-09-17):

| Sport | Team pages | Player pages | Blocker |
|---|---|---|---|
| MLB | READY (identity, 2023–26 games, results; runs only) | PARTIAL | no box scores; player identity limited to prop-carrying players |
| NFL | READY (1999–2026 games + results; 2026 finals window gap) | READY for 2023–25 · PARTIAL 2013–22 · BLOCKED 2026 | zero-safe 2026 box-score capture; retained results captures |
| EPL | PARTIAL (identity, seasons, fixtures; no results) | READY 2022-23…2025-26 · BLOCKED 2026-27 | id-keyed final scores; current-season player lines |
| UFC | n/a (no teams) | PARTIAL (fighter identity, bouts, win/loss) | method/round source; results retention |
