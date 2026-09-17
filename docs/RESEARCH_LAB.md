# Research Lab — contract, architecture and runbook (v1.5)

Written 2026-09-17. The third public consumer of the GameTime Data Platform, through the v1.3 research projection and
the v1.4 compare projection. Complements `docs/MATCHUP_COMPARE.md`, `docs/TEAM_PLAYER_RESEARCH.md`,
`docs/GAMETIME_DATA_PLATFORM.md`, `docs/GAMETIME_LIVE.md` and `docs/RETENTION_ARCHITECTURE.md`.

> **The Lab may filter, sort and count recorded facts. It may not invent one, infer one, or turn a filter into a
> conclusion.**

---

## 1. Purpose

Everything before v1.5 answered a question the product had already chosen: this team's page, this player's page, this
scheduled game, these two entities side by side. The Lab is the first surface where the reader composes the question:

```
Show me the Chiefs' recorded 2025 games          → Game Finder
Mets finals in 2024 where they scored 5 or more  → Game Finder + a score bound
Keenan Allen's 100-yard receiving games in 2025  → Player Stat Explorer + a value bound
Premier League players with recorded goals       → Player Stat Explorer
Every NFL team's recorded 2025 season            → Season Explorer
```

Three searches, one page, one shareable link each. No AI, no database, no new provider, no new canonical id.

## 2. Owner boundaries

| Owner | Owns | Never owns |
|---|---|---|
| Lab projection (`data/lab-projection/v1`) | deduplicated recorded-final game rows, player-game rows by season, team-season summaries, selector indexes, coverage receipts | forecasts, Live, settlement, Follow/Saved/observation state, odds, any query-keyed artifact |
| Compare projection (v1.4) | the entities and comparable stat families the Lab reads | — (unchanged) |
| Research projection (v1.3) | the factual rows and the page registry every slug and path comes from | — (unchanged) |
| Data Platform (v1.2) | canonical identity + facts | — the Lab never reads it; **B1 `PLATFORM_CONSUMERS` unchanged** |
| Live / forecast / settlement | `/api/live`, model output, grading | nothing on the Lab page (zero Live requests, zero provider calls) |
| Device (Follow / Saved / Observation) | the reader's own preferences | nothing the Lab reads or writes — **the Lab owns no storage key** |

Not built (non-goals held): Ask GameTime, an LLM, RAG, embeddings, natural-language-to-query, SQL, arbitrary
expressions, a database or service, accounts, cloud-saved or device-saved queries, notifications, recommendations,
"best" anything, power rankings, composite ratings, hit rates, new model probabilities, public NFL Live, an EPL result
source, UFC method/round, MLB box-score backfill, NFL 2026 player capture, a route per query.

## 3. Architecture

```
data/internal/platform/v1
        │  B1: the v1.3 research builder (unchanged, the ONLY platform consumer)
        ▼
data/research-projection/v1 ──────────────┐  (the page registry: every slug and page path)
        │  read ONCE                      │
        ▼                                 │
data/compare-projection/v1                │
        │  read ONCE: app/scripts/lab/build-lab-projections.mjs (lib/lab/compare-input.mjs)
        │  pure assembly: lib/lab/projection-build.mjs
        ▼                                 │
data/lab-projection/v1  ◀─────────────────┘   (committed, deterministic, --check)
        │  build step: scripts/lab/emit-lab-assets.mjs
        ▼
app/public/data/lab/v1/**   (gitignored, rebuilt every build)
        └── browser: /research/lab/ fetches ONE index + ONE row partition and runs
            lib/lab/engine.mjs — the SAME pure function the unit tests pin
```

**Why compare is the source.** The compare projection has already decided, once, which stat families a player
carries and which team results are proven facts. Re-deriving either in the Lab would create a second definition of
the same thing; reading the decided artifact means a family means exactly what it means in Compare and on a research
page. The research registry is read only for slugs and page paths, so the Lab mints no identity and no second
spelling of any entity.

**Why no database.** Every query is answered by one index (≤ 133 KB) plus one row partition (≤ 914 KB), parsed in
≤ 12 ms and executed in ≤ 10 ms — measured, §16. A service would add an owner, a deployment and a failure mode to a
problem that static files already solve. The stable interfaces are the canonical ids, the query grammar and the
result contract; the storage behind them is replaceable.

## 4. The Lab projection

`data/lab-projection/v1/` (repo root; outside `app/public`):

| File | Content |
|---|---|
| `games/{MLB,NFL}.json.gz` | every recorded final, one row per canonical game id |
| `players/{NFL,EPL,MLB}/<season>.json.gz` | one row per player-game that records at least one comparable value |
| `seasons/{MLB,NFL}.json.gz` | one row per team-season with at least one recorded final |
| `indexes/{games,players,seasons}-<sport>.json` | the selector index the browser reads first: seasons and their labels, entities, team labels, stat families and their per-season availability, coverage, row counts |
| `readiness.json` | per mode and sport: shipped or blocked (with a coded reason), seasons, rows, entities, families, exclusions, coverage |
| `receipt.json` | builder id, upstream compare **and** research content hashes, row counts, per-file bytes + sha256, content hash. **No wall clock.** |

`LAB_PROJECTION_SCHEMA_VERSION = 1` (`lib/lab/contract.mjs`), separate from research (1) and compare (1); every
reader calls `assertLabVersion` and refuses any other version.

Rows are packed tuples, documented once in `lib/lab/fields.mjs` and read by index nowhere else than
`lib/lab/dataset.mjs`:

```
GAME    [gameId, date, seasonIdx, teamAIdx, teamBIdx, scoreA, scoreB, flags, matchupPath|null]
PLAYER  [playerIdx, gameId, date, seasonIdx, teamIdx, oppIdx, ha, ...values]
SEASON  [teamIdx, seasonIdx, games, finals, w, l, t, scored, allowed]
```

`flags` bit 0 is `HOST_KNOWN` (§9). Entity ids are indexes into the partition's own arrays; `null` is "not recorded"
and is never 0.

## 5. Query schema

`LAB_QUERY_SCHEMA_VERSION = 1`, versioned **separately** from the projection so a query can outlive an artifact
rebuild — and so a future Ask GameTime can pin the argument shape it was written against.

```ts
{
  schemaVersion: 1,
  mode: "games" | "players" | "seasons",
  sport: "MLB" | "NFL" | "EPL" | "UFC",
  seasonId: string | "all" | null,
  stat: string | null,                 // canonical v1.4 family key, players mode only
  filters: [{ field, op, value }],     // AND only — there is no user-authored OR
  sort:    [{ field, dir }],
  pageSize: number,
  page: number
}
```

An unknown `schemaVersion` is refused by the validator **and** independently by the engine, so no caller can widen
the grammar by hand-rolling a query.

## 6. Field and operator registry

`lib/lab/fields.mjs` is the allowlist. A field that is not here fails closed; an operator a field does not declare
fails closed. There is no arbitrary field name and no expression.

| Mode | Field | Type | Operators | Sortable | Notes |
|---|---|---|---|---|---|
| games | `teamId` | team | eq | — | the perspective team |
| games | `opponentId` | team | eq | — | needs a team (the exact pair, §14) |
| games | `homeAway` | H / A / **N** | eq | — | needs a team; N is the proven-neutral state |
| games | `result` | W / L / T | eq | — | needs a team |
| games | `scored`, `allowed` | int | gte, lte, between | yes | need a team |
| games | `totalScore` | int | gte, lte, between | yes | not team-relative |
| games | `date` | ISO date | gte, lte, between | yes | absolute dates only |
| players | `playerId` | player | eq, in | — | |
| players | `teamId`, `opponentId` | team | eq | — | the team of THAT game (§12) |
| players | `homeAway` | H / A / **N** | eq | — | 865 NFL player rows are neutral-site |
| players | `statValue` | number | gte, lte, between | yes | reads the SELECTED family |
| players | `date` | ISO date | gte, lte, between | yes | |
| seasons | `teamId` | team | eq, in | — | |
| seasons | `finals`, `wins`, `losses`, `scored`, `allowed` | int | gte, lte, between | yes | |
| seasons | `seasonId`, `team` | — | — | yes | sort keys only |

**Team-relative fields refuse without a team.** A result, a home-or-away side and a score are always somebody's;
asking for `result=W` with no team selected is `FIELD_REQUIRES_TEAM`, not an empty table.

Refusal codes (`LAB_ERROR`), each with exactly one sentence in `lib/lab/copy.mjs`: `UNKNOWN_SCHEMA_VERSION ·
UNKNOWN_MODE · UNSUPPORTED_SPORT_MODE · UNKNOWN_FIELD · OPERATOR_NOT_ALLOWED · INVALID_VALUE · ENTITY_NOT_FOUND ·
SEASON_NOT_SUPPORTED · STAT_NOT_SUPPORTED · STAT_REQUIRED · FIELD_REQUIRES_TEAM · ALL_SEASONS_NOT_SUPPORTED ·
TOO_MANY_FILTERS · TOO_MANY_SORTS · TOO_MANY_ENTITIES · LIMIT_EXCEEDED · INVALID_DATE_RANGE · QUERY_TOO_LARGE`. An
unknown code throws rather than rendering nothing.

## 7. Query budget

| Bound | Value | Why this number |
|---|---:|---|
| filter clauses | 8 | more than any mode's registry offers (games 8, players 6, seasons 6) |
| sort clauses | 2 | |
| entities per query | 4 | |
| **row partitions fetched** | **1** (plus the index = 2 assets) | measured: every query in §16 loads exactly two files |
| rows returned | 500 hard cap | 10 pages of 50; the biggest partition holds 14,718 rows, so a scan is bounded by the partition and the result by this |
| page size | 25 / 50 / 100 (default 50) | |
| URL length | 1,024 characters | a share link must survive a mail client |

`season=all` is accepted in **games** and **seasons** mode, where one partition already holds every season, and
refused in **players** mode, where rows are partitioned by season. Reading a player's whole recorded history across
seasons is what the player research page (Last 3/5/10 + per-season log) and Player Compare already do; the Lab links
to both. That is the one deliberate narrowing in v1.5 and it is listed as a gap in §22.

## 8. URL and share contract

```
/research/lab/?mode=games&sport=nfl&season=NFL-2025&team=kansas-city-chiefs&result=W&scored_min=20&scored_max=40
```

- **Fixed parameter order**, canonical slugs and ids only, defaults omitted, no base64 blob. One logical query has
  exactly one canonical string; a scrambled input serializes back to it, and `parse → validate → serialize → parse`
  is a fixed point (pinned, LQ10).
- **Identity is the exact index slug.** `Kansas City Chiefs`, `Kansas-City-Chiefs`, `kansas-city`, `chiefs`,
  `KANSAS-CITY-CHIEFS` and the raw canonical id are all invalid. Search in a selector filters labels to FIND a
  candidate; selection writes that row's canonical slug.
- **Unknown query keys are ignored** (a link that picked up a tracking parameter still opens). A **known** key with
  an unreadable value is an error with a code — never a guess, and never a silently dropped clause.
- Two bounds on one field collapse into one `between` clause, so the filter count means what a reader sees.
- **Reset** returns the mode's clean default (newest recorded season, no filters, page 1).
- **Changing sport** is the only operation that removes state: `switchSport` drops the entity, stat and season
  (an NFL athlete id means nothing in the Premier League) and keeps a sort key the new mode still offers.
- Page is query state, so a page of results is as shareable as the search.

## 9. Game Finder

MLB and NFL. **Every row is a recorded final** — scheduled games belong to the Matchup Explorer, which the Lab links
to rather than duplicating.

A game enters the index only when **both** teams' rows are provider-final with both scores **and** the two rows
agree (A's own = B's opp, same opponent, same season). This is the v1.4 head-to-head rule, reused; a disagreeing
pair is excluded and counted, never averaged. On 2026-09-17: MLB 8,136 finals (625 not-final excluded, 0
inconsistent), NFL 7,269 (65 not-final, 0 inconsistent) — the same totals the compare H2H receipt reports.

**Host.** "H" on one side and "A" on the other proves a host. Two "N" rows prove the source carries **no** host (an
NFL neutral-site game): the tuple then holds the two teams in canonical id order, which is not a location claim,
`HOST_KNOWN` stays clear, and the row can never match a Home or an Away filter from either side — only Neutral.
94 of 7,269 NFL finals are in this state (the 2025 Chiefs–Chargers opener among them). **Preseason / regular /
postseason is not offered as a filter**: team rows do not carry `seasonPhase`, and inferring it from a date would be
inventing a fact.

A row links to its Matchup Explorer page when the durable compare registry publishes one (21 today); otherwise the
cell is empty and the team names still link to their research pages. No route is ever synthesised.

## 10. Player Stat Explorer

NFL (12 families, 2013–2025, 38,740 rows), EPL (9 families, 2022-23…2025-26, 30,420 rows) and MLB (4 captured
categories, 2026 only, 14,718 rows — **explicitly partial**, stated in the coverage strip on every search).

- One stat family per search, from the v1.4 comparable registry — the Lab defines no stat of its own.
- A row that does not record the selected family is **not an answer and not a zero**: it is excluded. A recorded 0
  is a value and matches `>= 0`.
- The team and opponent filters use the team recorded for **that game**, never the current roster (the v1.3
  invariant, pinned again here).
- Same-name players stay two ids and two slugs; selecting one never selects the other.
- NFL 2026 and EPL 2026-27 are blocked upstream, so those seasons are absent from the index and cannot be asked for.
- A family with no recorded rows in a season is not offered for that season (`seasonFamilies`, driven by the
  builder's own count).
- **No hit rate.** A threshold search returns the rows that match it. 7 rows matched is 7 rows matched, not 70%.

UFC has no numeric family (fighters carry outcome flags only), so the mode is blocked with a coded reason.

## 11. Season Explorer

MLB (4 seasons × 30 teams = 120 rows) and NFL (28 seasons × 32 teams = 893 rows). Per team-season: recorded games,
recorded finals, W / L / T, scored, allowed. Only finals with both scores feed the record, so a pending or
postponed game is never a loss and never a 0–0.

Columns are sortable. **A sorted factual table is not a ranking**: there is no rank column, no composite, no
"best team", and the sort wording describes the column ("Scored · high to low", "Team · A to Z", "Season · newest
first"), never a judgement. EPL is blocked — no id-keyed final scores exist, and standings are never inferred from
player-match data.

## 12. Missingness and identity

| Rule | Where it is pinned |
|---|---|
| `null` never matches a numeric comparison, not even `>= 0` | LQ12 (with the `null → 0` mutation) |
| a recorded `0` is a value | LQ12, LQ13 (a 0–0 game is a TIE) |
| a game id appears once; a doubleheader is two ids | LX4, LX6 (a real MLB doubleheader) |
| a player-game appears once per player | validator, LX4 |
| a player row's team is that game's team | LQ15, LX6 |
| same-name people are two ids | LQ4 |
| a cross-sport id is refused | LQ5 |
| a display name is never identity | LQ4, LQ10 |
| a host that is not proven is never claimed | LQ14, LX6 |

## 13. Coverage

Every search prints its own coverage strip above the results: what the period is, in GameTimePicks data, plus the
coded notes for that mode and sport and, in players mode, for the selected family. The wording is always "Recorded
finals / recorded player games / recorded season results in GameTimePicks … data" — never "all games" and never
"official standings". Coverage codes live in `lib/lab/copy.mjs`; an unknown code throws.

⚠ Upstream family-coverage codes name their source (`NFL_ESPN_LINES_2023_ON`). A public artifact must not, so the
Lab maps each to its own code (`NFL_GAME_LINES_FROM_2023`) at build time, and an unmapped upstream code throws
rather than shipping unexplained. The projection validator scans every byte for provider names.

## 14. Sorting, paging and truncation

Sort clauses run in order, then a **canonical secondary key** breaks every tie: game id descending (games), game id
then player id (players), season then team label then team id (seasons). The same dataset and query return the same
rows in the same order on every device and after every rebuild (LQ16, proven against an order-reversed input).

Nulls sort **last in both directions** — a missing value is not a small one.

`totalMatched` counts every matching row. Above the 500-row cap the result says so ("1,284 recorded games match. The
first 500 are available; showing 50."). Nothing is ever truncated silently.

## 15. Public assets

| Asset group | Files | Content bytes | Largest file (raw / gzip) |
|---|---:|---:|---|
| games (2 indexes + 2 partitions) | 4 | 710 KB | `games/nfl/rows.json` 351.6 KB / 66.1 KB |
| players (3 indexes + 18 partitions) | 21 | 8.5 MB | `players/mlb/MLB-2026.json` 914.1 KB / 93.1 KB |
| seasons (2 indexes + 2 partitions) | 4 | 43 KB | `seasons/nfl/rows.json` 27.6 KB / 7.9 KB |
| **total** | **29** | **8.5 MB** | |

`app/public/data/lab/v1/` is gitignored and re-emitted every build from the committed projection; the directory is
wiped first, so a partition dropped upstream can never linger publicly. `lab/v1/` is a narrowly documented prune
exemption beside `compare/v1/` — the pruner still sweeps everything else (pinned, LB3).

## 16. Performance

Measured 2026-09-17, local, Node 20.4.0 (`node scripts/lab/inspect.mjs --bench`, 5 runs each):

| Query | Partition raw / gz | Parse | `JSON.parse` | Execute | Scanned | Matched |
|---|---|---:|---:|---:|---:|---:|
| NFL games, one team, one season | 351.6 / 66.1 KB | 0.06 ms | 4.9 ms | 0.5 ms | 7,269 | 17 |
| NFL games, every season, exact pair | 351.6 / 66.1 KB | 0.30 ms | 2.3 ms | 0.8 ms | 7,269 | 54 |
| MLB games, season + minimum runs | 348.7 / 63.1 KB | 0.05 ms | 3.9 ms | 1.2 ms | 8,136 | 79 |
| MLB games, every season (worst scan) | 348.7 / 63.1 KB | 0.09 ms | 3.0 ms | 2.6 ms | 8,136 | 8,136 |
| NFL players, receiving yards ≥ 80 | 750.3 / 83.2 KB | 0.02 ms | 2.2 ms | 9.8 ms | 7,031 | 329 |
| EPL players, goals ≥ 1 | 832.5 / 76.8 KB | 0.03 ms | 12.0 ms | 1.9 ms | 11,007 | 903 |
| MLB players, hits ≥ 2 (largest asset) | 914.1 / 93.1 KB | 0.02 ms | 6.5 ms | 1.6 ms | 14,718 | 3,377 |
| NFL seasons, every season | 27.6 / 7.9 KB | 0.01 ms | 0.1 ms | 1.4 ms | 893 | 893 |

Worst measured total ≈ 14 ms of main-thread work after the fetch. **No Web Worker** (§48 measured, not assumed):
there is no multi-second block to move off the main thread, and a worker would add a message boundary to a 14 ms
problem. Route: `/research/lab/` 16.2 kB page, **116 kB first load** (Compare shells 109–110 kB).

## 17. SEO

- `/research/lab/` is indexable; **canonical is the shell**, so every query state shares one canonical URL.
- The shell is in the sitemap exactly once. **No query URL is ever listed** (pinned, LB2), and no page exists per
  query, season, filter, mode or sport (pinned, LB1).
- Metadata describes a factual search — game finder, player stats, season results — and never a prediction.

## 18. Accessibility

- Mode and sport are real links with `aria-current`, so keyboard and "open in new tab" both work.
- Every control has a visible label associated with it. The shared `SearchableSelect` now names its button from the
  label **and** the value ("Team, Kansas City Chiefs"); before v1.5 its accessible name was the value alone.
- Filter groups are `fieldset`/`legend`; the advanced panel is a native `<details>`.
- The result count is an `aria-live="polite"` sentence; the result table itself is not a live region.
- Every table lives in a focusable `role="region"` scroller with `position: relative` — an `sr-only` cell inside a
  non-positioned scroller made the document wider than a phone screen in v1.4.
- Buttons and the pager are 44 px. Reflow verified at 320 / 375 / 390: document width equals screen width, and only
  the table scrolls inside its own region.
- Structural audit: `research/lab` (`scripts/audit-accessibility.mjs`). Browser audit on three engines: one composed
  Game Finder state in `e2e/accessibility.spec.ts` (contrast at 3 viewports, 320 px reflow, document width, named
  controls).

## 19. Build and refresh commands (from `app/`)

```bash
node scripts/data-platform/build.mjs --all --check          # 1. platform fresh? (refresh + validate + parity if STALE)
node scripts/research/build-research-projections.mjs         # 2. research projection (then --check)
node scripts/compare/build-compare-projections.mjs           # 3. compare projection (then --check)
node scripts/lab/build-lab-projections.mjs                   # 4. lab projection
node scripts/lab/build-lab-projections.mjs --check           #    exit 1 when the committed lab projection is stale
node scripts/lab/validate-lab-projections.mjs                #    structural integrity, independent of the builder
node scripts/lab/emit-lab-assets.mjs                         #    runs inside `npm run build` and `predev`
node scripts/lab/inspect.mjs --coverage | --bench | --query '?mode=games&sport=nfl&season=NFL-2025&team=…'
```

Order is mandatory: **platform → research → compare → lab**. The builder refuses to run against a stale compare
projection (which transitively refuses a stale research projection and a stale platform), and the receipt pins both
upstream content hashes, so a refresh anywhere upstream makes `--check` fail until the Lab is rebuilt. Commit
`data/lab-projection/v1` with explicit paths. Exit codes: 0 ok · 1 stale · 2 upstream stale / assembly refused ·
3 no compare projection.

## 20. Validation

| Suite | Phase | Pins |
|---|---|---|
| `lab/lab-contract.test.mjs` LQ1–LQ20 | unit | query schema refusal, mode/sport matrix, field + operator allowlist, exact-slug identity, cross-sport refusal, season and stat availability, every budget, team-relative refusal, canonical URL round-trip, sport switch, missing ≠ zero, game dedupe and 0–0, unproven host, historical team, determinism and tie-breaks, visible truncation, null-last sorting, one sentence per code, the cost receipt |
| `lab/lab-projection.test.mjs` LX1–LX8 | unit | committed = rebuild (order-free) of the CURRENT compare projection; leaks; boundaries (no platform, no node built-in or server module in a browser-reachable module); projection integrity and upstream slugs; no route or asset explosion; real data (the neutral-site opener, Game Finder ⇔ Season Explorer agreement, a real doubleheader, no NFL 2026); coverage drives the options; owner-field registry |
| `scripts/lab/validate-lab-projections.mjs` | gate | receipt ⇔ disk bytes and hashes, per-row semantics, index ⇔ partition agreement, provider-name and internal-path scan |
| `lab/lab-built.test.mjs` LB1–LB8 | post-build | one page; canonical/sitemap policy; public assets = committed projection and nothing else; no Live, provider or storage in any chunk the page loads; no internal path in the export; factual page copy; every link resolves; the shipped budget is the pinned budget |
| `e2e/route-assurance.spec.ts` | browser ×3 | a filter change and then a mode change keep the results, the filter means what it says, no console error |
| `e2e/accessibility.spec.ts` | browser ×3 | contrast, reflow, document width, named controls on a composed Lab state |

## 21. Mutation guards

Each probe mutates one line, runs the named suites and is restored. Probe list and outcomes: v1.5 handoff §N. Two
defects were found by the guards themselves while they were being written: the players `homeAway` registry was
missing the **N** value that 865 NFL rows actually carry (the validator read the enum from the registry and caught
it), and the Lab index was about to publish an upstream coverage code that names a provider.

## 22. Known gaps

| Gap | Sport / mode | User impact | Owner / next |
|---|---|---|---|
| no id-keyed final scores | EPL games + seasons | both modes blocked | data program (founder: source) |
| no comparable numeric statistic | UFC players | mode blocked | founder gate (licence) |
| 2026 player logs blocked upstream | NFL players | latest season is 2025 | data program |
| captured categories only, 2026 only | MLB players | a game count reflects captured games, not games played | data program (box scores) |
| team rows carry no `seasonPhase` | NFL games + seasons | preseason cannot be excluded; postseason cannot be isolated | projection (carry the phase) |
| neutral-site host not recorded | NFL games | 94 finals are Neutral rather than Home/Away | projection (carry the host) |
| one season per player search | NFL, EPL, MLB players | a cross-season player history is the research page's job, not the Lab's | v1.6 (a per-player asset, or a worker-backed multi-partition scan) |
| game rows link only to Matchup Explorer pages | MLB, NFL games | 21 of 15,405 rows carry a link; game reports are a deploy-time fact the committed projection cannot hold | v1.6 (resolve durable links in the asset emit) |
| manual refresh | all | new finals reach the Lab only after platform → research → compare → lab | ops decision (same as v1.3, v1.4) |

## 23. The future Ask GameTime tool boundary

v1.5 builds the deterministic tools; it does **not** build the assistant. The boundary a later program should call
is the query object, not a file reader:

```ts
runGameFinder(query)          // validateLabQuery → labDataset → executeLabQuery, games mode
runPlayerResearchQuery(query) //                                  players mode
getSeasonExplorer(query)      //                                  seasons mode
```

Each takes a `ResearchQueryV1`, returns `{ totalMatched, rows, coverage, warnings, cost }`, and refuses anything
outside the allowlist with a stable code. An assistant that can only pass one of these objects cannot read an
arbitrary file, cannot widen the grammar, cannot exceed the budget and cannot fabricate a row — which is the point
of building the tools first. Readiness per question: v1.5 handoff §S.
