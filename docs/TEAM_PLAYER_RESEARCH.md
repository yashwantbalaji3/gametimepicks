# Team + Player Research — contract, architecture and runbook (v1.3)

Written 2026-09-17. The first public consumer of the GameTime Data Platform (`docs/GAMETIME_DATA_PLATFORM.md`).
Complements `docs/GAMETIME_LIVE.md` (Live) and `docs/RETENTION_ARCHITECTURE.md` (Follow / Saved / My GameTime).

> **Research must be useful because it is factual, not because every box is filled.**

---

## 1. Purpose

Turn canonical factual rows into Team and Player/Fighter research pages that sit in the product loop:

```
Forecast → Game → Team / Player → recorded games, season context, Last 3/5/10 → back to the game / forecast
```

Every number on a research page is either (a) a value in the committed research projection, derived by a pure
read model from canonical platform records, or (b) a value from a separate, already-published forecast owner,
rendered in its own labelled section. No number exists only in React code except axis ticks of a chart.

## 2. Platform boundary

```
data/internal/platform/v1                      (internal store — never served, never imported by a page)
        │  read ONCE, manifest verified
        ▼
app/scripts/research/build-research-projections.mjs     ← the ONE allowlisted platform consumer (B1)
        │  pure assembly: app/src/lib/research-pages/projection-build.mjs
        ▼
data/research-projection/v1                    (committed, compact, deterministic, public-safe)
        │  build-time reads: app/src/lib/research-pages/projection-store.ts
        ▼
/teams/[sport]/[slug]  /players/[sport]/[slug] (static export; each page receives ONE record + the labels/hrefs it uses)
```

| Owner | Owns | Never owns |
|---|---|---|
| Research projection | page-shaped factual summaries, coverage descriptors, Last-N windows, slugs, index | raw sources, canonical identity, forecasts, Live, settlement, Follow/Saved state, odds |
| Data Platform | canonical ids + factual rows | anything a page shows directly |
| Forecast owners | NFL player-board PUBLISHED families; UFC card winner read | anything inside a projection file |
| Live / settlement / Follow / Saved / Observation | unchanged | — |

Pinned by:

- `data-platform/boundary.test.mjs` **B1** — `PLATFORM_CONSUMERS` = the builder script + `research-pages/boundary.test.mjs`
  (test-only). A second consumer fails; a stale allowlist entry fails.
- `research-pages/boundary.test.mjs` **RB1** — pages, research components and page-side modules never import the
  platform or name its store; **RB2** — no client module imports `projection-store`, `game-links`, `forecast-join`,
  `my/read-model` or `node:fs|path|zlib`.
- `mlb/finals-history-isolation.test.mjs` — a 2023–2025 gamePk may appear in the export ONLY under `/teams/mlb/`
  (historical final scores are research facts, never a model input); positive control proves the allowance is real.

## 3. Projection architecture

`data/research-projection/v1/` (repo root; outside `app/public`, so it is not served wholesale):

| File | Content |
|---|---|
| `index.json` | registry: `{kind, sport, id, slug, label, hint, indexable, status, path}` per page (compact) |
| `teams/<SPORT>.jsonl.gz` | one team projection per line (MLB, NFL, EPL) |
| `players/<SPORT>.jsonl.gz` | one player/fighter projection per line |
| `labels/<SPORT>.json` | every platform team's name + abbreviation (opponents render by name with or without a page) |
| `readiness.json` | **research-page readiness receipt**: rules, thresholds, per-sport totals/published/indexable/partial/excluded-by-reason |
| `receipt.json` | builder id, platform manifest sha256, page count, data cutoffs, per-file uncompressed bytes + sha256, content hash. **No wall clock.** |

Schema: `RESEARCH_PROJECTION_SCHEMA_VERSION = 1` (`lib/research-pages/contract.mjs`) — separate from the platform's
storage schemaVersion. Readers call `assertProjectionVersion` and refuse any other version.

Game-log rows are packed tuples (documented in `team-read-model.mjs` `TEAM_ROW` and `player-read-model.mjs`
`PLAYER_ROW`) so a 216-game NFL career is ~36 KB. Keys are sorted recursively (`canonicalJson`); every list has an
explicit order; nothing iterates the filesystem or a Map without sorting.

## 4. Route contract

| Route | Resolves | Unknown slug |
|---|---|---|
| `/teams/<mlb\|nfl\|epl>/<slug>/` | exact registry entry → one canonical team id | 404 (`dynamicParams=false`) |
| `/players/<mlb\|nfl\|epl\|ufc>/<slug>/` | exact registry entry → one canonical player/fighter id | 404 |

No incoming slug is ever resolved by name; there is no fallback lookup. No redirects or aliases exist in v1.3 (a
renamed entity gets a new slug on the next projection build; its canonical id is unchanged).

## 5. Slug policy (`lib/research-pages/slugs.mjs`)

- NFKD + combining marks removed, `ß→ss ø→o ł→l đ→d`, apostrophes and periods dropped, lower case, runs of
  non-alphanumerics → `-`. `Ja'Marr Chase → jamarr-chase`, `Jay Rodríguez → jay-rodriguez`.
- Decided per (kind, sport) over the whole eligible set. A shared base slug suffixes **every** claimant with its
  canonical id's numeric tail (`chris-manhertz-2531358`, `chris-manhertz-4071345` — live example). Order can never
  decide who keeps the plain slug. A label with no ASCII becomes `id-<tail>`.

## 6. Eligibility (`lib/research-pages/eligibility.mjs`, platform facts only)

| Entity | Published when | Indexable |
|---|---|---|
| MLB team | ≥ 1 final with both clubs' runs | yes |
| NFL team | ≥ 1 final with both teams' points | yes |
| EPL team | in the 2026-27 fixture list | **no** (no results source) |
| NFL player | on a current roster with ≥ 1 recorded game 2023–2025, **or** ≥ 8 recorded games across 2024–2025 | ≥ 8 recorded games |
| MLB player | ≥ 30 games with a captured category | **no** (partial by construction) |
| EPL player | ≥ 10 appearances in 2025-26 | yes |
| UFC fighter | ≥ 5 recorded bouts, or an upcoming bout + ≥ 1 recorded bout | ≥ 5 recorded bouts |

A "recorded game" is a participation row: NFL/MLB at least one recorded number; EPL `appeared === true`; UFC a
winner flag. `RESEARCH_PAGE_BUDGET = 2000` — the builder refuses to emit more pages.

Counts on 2026-09-17 (platform manifest of the v1.3 build): **1,853 pages** — teams MLB 30 · NFL 32 · EPL 20;
players NFL 750 · MLB 255 · EPL 414 · UFC 352; **1,388 indexable · 465 noindex**. The NFL rule covers 339 of the 340
athletes on the current published player boards. Everything not published is counted by reason in `readiness.json`.

## 7. Coverage model (`lib/research-pages/coverage.mjs`)

Each record carries `coverage = { status: FULL|PARTIAL|LIMITED|UNSUPPORTED, available[], unavailable[], notes[], from, to }`.
The projection stores **codes**; `COVERAGE_COPY` is the only user-facing wording (never a provider, file or internal
status word; never "career", "all-time" or "complete"). The page's Data coverage strip always renders: period,
"From GameTime's canonical sports data", available / not yet available, and the notes.

## 8. Team page semantics

- Header (logo for MLB/NFL, abbreviation, sport, current season) · Follow **only** MLB/NFL teams (existing Follow scope).
- Season snapshot: record, scored, allowed — **only** from FINAL games with both teams' final-score rows
  (`teamGameResult`). Pending/postponed/score-less games never count and never show 0–0.
- Recent games: last 5 finals with both scores + "The team won N of its last M recorded finals."
- Upcoming: NOT_FINAL games with a known instant, filtered on the **reader's clock** after mount (static artifacts age).
- Season results / fixture history: native `<select>` season switch; a non-final row reads "Scheduled" or
  "No final recorded" only after mount (reader clock); EPL rows say "Played — result not available".
- Player research list: NFL = current roster; MLB/EPL = players whose latest recorded game was for this club.
- **EPL:** `TEAM_RESULT_FAMILY` has no EPL entry, so no result, record, points or goals can be derived even if
  score-shaped rows appeared (TR2 + mutation probe 8).

## 9. Player page semantics

Order: header → Data coverage → current published forecast (only if one exists) → recorded snapshot → stat-group
selector → Last 3/5/10 → bar chart → season game log.

- One row per game; NFL takes the ESPN line when ESPN recorded any value, else nflverse's — never a field mix — and
  the row keeps its family code (`E`/`V`/`M`/`P`/`U`). nflverse `carries` fills rushing attempts; nflverse has no
  interceptions field, so that cell is "not recorded" on nflverse rows.
- Team, opponent and home/away are **that game's** (the platform stat row); the current roster appears only in the header.
- `null` renders as a dash with screen-reader text "not recorded"; `0` renders as 0.
- Stat groups listed only when the group's primary stat is non-zero in at least one row.
- UFC: outcome W / L / **N (no winner: draw or no contest, shown as D)**; record `w–l · n no winner`; no method or round anywhere.

## 10. Forecast separation (`lib/research-pages/forecast-join.ts`)

- NFL: `buildMyPlayerRows()` — the same PUBLISHED-families rows My GameTime uses — filtered by exact athlete id and
  non-empty markets. ESTIMATE / WITHHELD / research families can never appear (FJ1, RX7).
- UFC: the current card bout whose red/blue ESPN athlete id equals the fighter's id tail, only when
  `model.verdicts.winner === "PASS"` and the bout carries a winner read (FJ2).
- MLB / EPL players: no per-player published forecast owner → no section.
- Section is labelled "Current GameTime forecast · model output, not history", visually distinct, links "Why and
  risk" to the existing report. Forecast values never enter a projection file (RB5 forbidden fields; RX7).
- Model eligibility, methodology and statuses are unchanged.

## 11. Last-N semantics

For each available column: rows where that stat is a number, newest first (canonical instant, then game id), sliced
to 3/5/10. Zeros included; nulls excluded; `n` always shown; average = `round1(sum / n)` computed in the projection.
A window with fewer rows than its size says so ("in the 3 available games"). No hit rate, threshold, trend word or grade.
Windows span seasons (the latest recorded games), not the selected season.

## 12. Sport-specific support

| Sport | Team page | Player page | Current-season gap (user copy) |
|---|---|---|---|
| MLB | results + runs 2023–2026 (2026 results from Jul 4) | hits, total bases, H+R+RBI, pitching strikeouts — captured categories only (2026) | "not a complete MLB box-score history" |
| NFL | results + points 1999–2026 (rolling 2026 window gap noted) | receiving/rushing/passing lines 2013–2025 | "Current-season (2026) factual game logs are not available yet" |
| EPL | fixtures only (2022-23…2026-27), no results | appearances, goals, assists, shots, cards, fouls, saves 2022-23…2025-26 | "2026-27 match lines are not available yet" |
| UFC | n/a | bouts, opponents, outcomes 2023-08…2026 | "Method and round are not yet available" |

## 13. SEO

- Indexable pages: `robots index, follow`; noindex pages: `robots noindex, follow` (links still crawlable).
- Canonical = the page's own trailing-slash path (`withRouteMetadata`).
- `sitemap.xml` = public static routes + **indexable research pages only** (1,388). v1.3 also removed ten literal
  template paths (`/nfl/game/[eventId]/` …) that the sitemap had listed since P208 (all 404s).
- Titles: "<Team> results, recent games and schedule", "<Club> fixtures and squad", "<Player> game log and stats",
  "<Fighter> fight history". Descriptions state the covered period and, for MLB, "Not a complete box-score history".
- No new primary navigation. Discovery is contextual (§ below) plus site search.

### Discovery (contextual links, all by exact canonical id)

| Surface | Link |
|---|---|
| MLB game page, NFL game page | club labels in the Follow row → team research (link and Follow button are siblings) |
| NFL per-game player board | player name → player research (Follow star stays a sibling) |
| `/following` | followed MLB/NFL team and NFL player labels → research (compact `{prefix: {idTail: slug}}` map, `lib/research-pages/follow-links.mjs`) |
| `/my` Your NFL players | a sibling "<name> game log →" link (`researchHref` in `/data/my/nfl-players.json`); never nested in the row link |
| UFC bout page | "Fight history: <red> · <blue>" |
| EPL match page | "Club research: <home> · <away>" joined by the fixture's exact event id |
| Site search | team pages + indexable NFL player pages |
| Research pages | opponents, current roster team, squad lists, game/bout/match reports when exported |

Follow is NOT extended (MLB players, EPL, UFC stay unfollowable); Saved and My GameTime gain no module or key.

## 14. Performance (2026-09-17, local, Node 20.4.0, 8 cores)

| Metric | Before (v1.2) | After (v1.3) |
|---|---:|---:|
| Route families (inventory) | 77 | 79 |
| Generated static pages | 455 | 2,308 |
| Exported HTML files | 439 | 2,292 |
| `npm run build` wall | 161.7 s | 96.5 s |
| Post-build suite wall | 77 s | see handoff |
| Export size | 986 MB | 1,347 MB |
| `/teams/[sport]/[slug]` first load JS | — | 103 kB (3.46 kB page) |
| `/players/[sport]/[slug]` first load JS | — | 103 kB (3.4 kB page) |
| Research projection | — | 18.7 MB content · 2.5 MB stored · builds in ≈2.3 s |
| Largest player / team record | — | 36 KB (Travis Kelce) / 41 KB (MLB) |
| Typical page HTML | — | 170–186 KB HTML + 70–90 KB RSC |
| Site search index | 121 KB | 209 KB (budget 260 KB) |
| `/following` HTML | 80 KB | 105 KB (compact research map) |
| Client requests per research page | — | 0 data fetches, 0 Live, 0 provider |

⚠ **Why the build got faster while pages quintupled.** The shared `SlateStatusBar` called
`getOptimizerSettledDates()` on every exported page; it parses every graded optimizer payload (≈740 ms per call,
measured). A production build now computes it once per worker (`lib/parlay-results.ts`); `next dev` still recomputes.
The first research build before that fix ran at ≈1.4 CPU-s per page and would not have fit the 25-minute CI job.

## 15. Build commands (from `app/`)

```bash
node scripts/data-platform/build.mjs --all --check     # platform fresh? (STALE is normal between refreshes)
node scripts/data-platform/build.mjs --all              # refresh platform, then:
node scripts/data-platform/validate.mjs
node scripts/data-platform/parity.mjs
node scripts/research/build-research-projections.mjs            # write data/research-projection/v1
node scripts/research/build-research-projections.mjs --check    # exit 1 if the committed projection is stale
```

Refresh order is always platform → projection. `research-pages/boundary.test.mjs` RB3/RB4 fail when the committed
projection is not the rebuild of the committed platform (a platform refresh without a projection refresh fails the
unit phase — by design). Commit `data/internal/platform/v1` and `data/research-projection/v1` with explicit paths.

## 16. Validation

| Suite | Phase | What it pins |
|---|---|---|
| `research-pages/read-models.test.mjs` | unit | slugs, team results/records, EPL refusal, player family precedence, missing≠0, historical team, Last-N, EPL appearances, UFC no-winner, gradedAt-proof ordering, eligibility, coverage copy, dates, schema refusal |
| `research-pages/boundary.test.mjs` | unit | RB1 platform boundary · RB2 client boundary · RB3 determinism (order-reversed slice) + committed = rebuild · RB4 built from current platform · RB5 leaks/forbidden fields · RB6 registry integrity |
| `research-pages/composition.test.mjs` | unit | FJ1/FJ2 forecast join · SM1 sitemap · GL1 durable links · NJ1 no name joins |
| `research-pages/research-built.test.mjs` | post-build | RX1 pages = registry · RX2 robots/canonical/sitemap · RX3 per-sport content · RX4 every link + anchor resolves · RX5 discovery · RX6 no leak / Live / provider · RX7 forecast separation |
| `data-platform/boundary.test.mjs` B1 | unit | one allowlisted consumer |
| `mlb/finals-history-isolation.test.mjs` | post-build | history gamePks only under /teams/mlb/ |

## 17. QA

Browser QA on the built export (`node scripts/serve-export.mjs 4173 out`): NFL player (Keenan Allen, Travis Kelce),
EPL team (Hull City — current season only), UFC fighter with a no-winner bout (Elizeu Zaleski dos Santos), MLB
player (Shohei Ohtani), at 375 px and desktop: no horizontal page overflow (tables scroll inside their own region),
coverage strip first, forecast section distinct, D never counted as L.

## 18. Known gaps

| Gap | Sport | User impact |
|---|---|---|
| No 2026 player logs (zero-filled source) | NFL | current-season logs absent; copy says so |
| 2026 finals outside the rolling results window | NFL, UFC | some 2026 games read "No final recorded" |
| nflverse bridge covers 2022+ players | NFL | pre-2023 logs partial; copy says so |
| No box scores; player ids only for priced props | MLB | captured categories only; pages noindex |
| 2026 finals before Jul 4; 122 finals without team ids | MLB | early-2026 games show schedule only |
| No id-keyed final scores | EPL | no records, results or tables; team pages noindex |
| No 2026-27 player lines; no current club for players | EPL | history only |
| Method / round / strikes | UFC | outcome only |
| MLB board anchors exist only on lean-bearing boards | MLB | most historical MLB games have no game link |
| No scheduled platform/projection refresh | all | research data ages until a human refreshes |
| Search indexes teams + indexable NFL players only | MLB/EPL/UFC players | reached from team, match and bout pages |

## 19. Future v1.4 handoff

Ready to build on without new data: head-to-head over `listHeadToHead` (team finals MLB/NFL), team-vs-team
season comparison (records, scored/allowed), NFL/EPL player comparison over identical stat columns, season
selectors (already canonical). Not ready: EPL results anywhere, MLB player comparison beyond captured categories,
UFC method/round, NFL 2026 player lines. Matchup Explorer needs the same projection pattern with a per-matchup
registry and budget. **v1.4 = Matchup Explorer + Compare. Not started.**
