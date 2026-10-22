# NCAAF V1 — Stage 1 data capability matrix

Branch `dp/ncaaf-v1` · base main `2ba7dc13f9` · probed 2026-10-09 (UTC) · Node 20.4.0 · PRIVATE_RESEARCH.

**Evidence states** (directive §6; mapped onto `source-registry.mjs` authorizations, no new public states):
`VERIFIED` — exercised here with real counts · `PARTIAL` — exercised, coverage limited · `ADVERTISED` — the
provider documents it, not exercised · `ACCESS_BLOCKED` — needs DP's own key · `PAID_DECISION` — needs a
founder spend decision · `UNAVAILABLE` — no legitimate point-in-time source found. Every source below would
enter the registry as `PRIVATE_RESEARCH` until a separate publication decision.

## 1. Sources

| Id | Provider / version | Access · cost | Terms (what matters here) | Docs |
|---|---|---|---|---|
| `espn_cfb` | ESPN site + core API, `football/college-football` (unofficial, undocumented) | keyless, free | Same usage class as the existing `espn_scoreboard` / `espn_site_api_nfl` rows: point-in-time factual snapshots with attribution. Undocumented ⇒ may change without notice; raw bodies are not committed. | `site.api.espn.com/apis/site/v2/sports/football/college-football/{scoreboard,summary}`, `sports.core.api.espn.com/v2/…/college-football/seasons/<y>/types/2/groups/<80\|81>/teams` |
| `cfbd` | CollegeFootballData.com REST API, OpenAPI **5.32.1** | free key (1,000 calls/mo); Tier 1 $1/mo (5k, adds weather, opponent-adjusted metrics, live scoreboard); Tier 2 $5/mo (30k, live PBP) | Commercial use and derived models/predictions allowed; private caching and retention allowed; **raw data may not be republished, mirrored or offered as a dataset**; may not be represented as official NCAA data; attribution appreciated, not required. | [terms](https://collegefootballdata.com/terms) · [tiers](https://collegefootballdata.com/api-tiers) · `https://api.collegefootballdata.com/api-docs.json` |
| `odds_api` (existing) | The Odds API, `americanfootball_ncaaf` | existing founder plan; historical = 10 credits per region per market per call | already `PUBLIC_DISPLAY` for MLB/EPL; NCAAF not in its `sports` list | [historical](https://the-odds-api.com/historical-odds-data/) |
| `nws` | National Weather Service API (api.weather.gov) | keyless, free | US-government public domain, no attribution required | [docs](https://www.weather.gov/documentation/services-web-API) |
| `open_meteo` | Open-Meteo Historical Forecast / Single Runs API | free tier **non-commercial only**, CC BY 4.0; commercial needs a paid plan | archived model runs from ~2021–22 by model | [docs](https://open-meteo.com/en/docs/historical-forecast-api) |
| conference availability reports | SEC (since 2024), ACC, Mountain West, CFP (2025), Big Ten (expanded 2026) | public web pages, no API | per-conference formats; no uniform archive | news sources in §4 |

## 2. Matrix

| Required row | Best source | State | Point-in-time | Real coverage / notes | Blocker / next |
|---|---|---|---|---|---|
| **Schedules, finals, OT, neutral site, cancellations** | `espn_cfb` scoreboard by week × group | **VERIFIED** | Finals are facts, timing-safe for **results**. Kickoff **revisions are not recoverable** historically (only the final start time is returned). | 2021–25: 8,138 events, 8,113 played finals, 6 forfeits (1-0, excluded), 16 canceled, 3 postponed; 345 OT games (1 OT 238 · 2 OT 83 · up to 9 OT); 391 neutral sites; 0 missing final scores; 0 line-score inconsistencies; 0 merge conflicts; 4 refused malformed events (3 in 2021, 1 in 2025). | Forward kickoff-revision history needs our own write-once captures (NBA/NFL pattern). |
| **Teams, conferences, FBS/FCS by season** | `espn_cfb` core group membership + scoreboard | **VERIFIED** (with reconciliation) | Season-scoped: teams that joined FBS later (Liberty 2018 … Delaware/Missouri St 2025) are correctly absent from earlier seasons. | Provider FBS group lists 8–13 ids that never play (`3144–3147, 3193, 3194, 3197, 3198, 16471, 16472, 125290, 125291` …); FBS teams that played = **128 / 130 / 130 / 130 / 127 / 130 / 131 / 133 / 134 / 136** for 2016–25, matching official FBS sizes (2020: 127, three programs opted out). FBS–FBS 763–808 events/season (2020: 650, many postponed). | **Conference by season VERIFIED (2026-10-09):** competitor `conferenceId` is one value per team per season and changes in the realignment year for all 7 checked moves (Texas/Oklahoma Big 12→SEC 2024, SMU AAC→ACC 2024, UCLA/Washington Pac-12→Big Ten 2024, UCF AAC→Big 12 2023, Liberty Ind→CUSA 2023). Conference *names* still need a mapping. |
| **Box scores, drives, plays, efficiency, pace, explosiveness** | `espn_cfb` summary (per game) · `cfbd /drives /plays /ppa /stats/game/advanced` | **PARTIAL** (ESPN, 20-game stratified sample) · **ADVERTISED** (CFBD) | Post-game facts; usable for features only when aggregated strictly from games before the cutoff. | Deterministic sample (`espn-drive-sample-v1.json`; per season 2016–25 the FBS–FBS and FCS–FCS corpus game with the smallest `fnv1a64(eventId)`): drives present in **10/10 FBS–FBS** and **7/10 FCS–FCS** games (18–29 drives, 147–199 plays); play wall-clock missing in the 2017 FBS sample; box score team stats present in 20/20. CFBD exposes drives/plays/PPA/advanced stats with `excludeGarbageTime`. | A full drive corpus is 1 ESPN call per game (~800 FBS games/season). **Not needed for the scores-only V1 baseline**; revisit as an NCAAF-004 challenger input. |
| **Opponent-adjusted ratings** | `cfbd /ratings/{sp,srs,elo,fpi}`, `/wepa/*` | ADVERTISED / ACCESS_BLOCKED (WEPA and opponent-adjusted metrics are Tier 1) | **Season-final ratings leak.** Only `/ratings/elo?week=` and `Game.homePregameElo` are week-stamped. | — | Use only as **benchmarks**, never features, unless week-stamped. Our own ratings must be built as of each week. |
| **Rosters, player ids, QB starters** | `espn_cfb` team roster (current) · `cfbd /roster` | **UNAVAILABLE** historically (point-in-time) | Neither source carries an as-of date; a roster pulled today is today's roster. QB starter *history* is recoverable after the fact from box scores (who played), never what was known pregame. | — | Forward-only: begin write-once roster captures before a forecast window. |
| **Injuries / depth charts** | conference availability reports; ESPN summary `injuries` | **UNAVAILABLE** historically | ESPN summary returned 0 injury entries for a 2025 final. Reports are conference-specific (SEC since 2024; ACC, MW, CFP from 2025; Big Ten expanded 2026), web pages, no archive. | — | Excluded from V1 features. Forward capture would need per-conference scraping → separate scope/terms decision. |
| **Transfers** | `cfbd /player/portal` | ADVERTISED / ACCESS_BLOCKED | `transferDate` per row → knowable date exists. | — | Needs DP's CFBD key. Join to teams by name only (`origin`/`destination` strings) → needs an exact crosswalk or is withheld. |
| **Recruiting / talent** | `cfbd /recruiting/teams`, `/talent` | ADVERTISED / ACCESS_BLOCKED | Recruiting class ratings are fixed by signing day → plausible preseason prior. `/talent` is a season composite with **no as-of date** → treat as possibly post-hoc. | — | Needs key; talent restricted to benchmark until its timing is shown. |
| **Returning production** | `cfbd /player/returning` | ADVERTISED / ACCESS_BLOCKED | Season-level; computed from the prior season's usage, but roster attrition used is not dated. | — | Needs key; preseason prior candidate with a documented timing caveat. |
| **Coaching changes** | `cfbd /coaches` (`hireDate`) | ADVERTISED / ACCESS_BLOCKED | `hireDate` gives a knowable date. | — | Needs key. |
| **Weather forecasts (pre-cutoff)** | `nws` (forward) · `open_meteo` archived runs (historical) | `nws`: forward-only **VERIFIED by docs**, not probed · `open_meteo`: **PAID_DECISION** (commercial licence) | NWS gives forecasts only as issued *now*; no archive. `cfbd /games/weather` is **observed** weather (temperature/wind at game time) — *not a forecast*, and Tier 1. | — | Historical weather features: excluded from V1 unless the founder licenses Open-Meteo commercially. Forward: NWS gridpoint capture at T-x is free (outdoor venues, US only; venue coordinates needed). |
| **Market lines / prices / movement** | `espn_cfb` scoreboard (upcoming games) · `espn_cfb` summary `pickcenter` (historical) · `odds_api` historical · `cfbd /lines` | ESPN scoreboard: **PARTIAL** (forward-only) · ESPN summary: **PARTIAL** (benchmark only) · `odds_api`: **PAID_DECISION** · `cfbd`: ADVERTISED | ESPN scoreboard shows DraftKings spread/total/moneyline **only before kickoff** (51 of 51 scheduled games in the 2026 week-6 probe; 0 of 51 finals). ESPN **summary** `pickcenter` still carries lines for older finals (sample: FBS 2016–21 three providers — consensus/numberfire/teamrankings; 2022–23 one or two; 2024–25 none) with **no timestamp of any kind**. ⚠ Sign trap: `spread: 6.5` alongside `details: "TEM -6.5"` for the same line, so the numeric field's side is unverified. `cfbd /lines` likewise has no capture time. All of these are closing-line *benchmarks* only, never inputs. | — | Historical point-in-time lines need `odds_api` historical: ≈ 1 region × 3 markets × 10 = **30 credits per weekly snapshot**; ~20 snapshots/season → **~600 credits/season, ~3,000 for 2021–25**. Founder decision; nothing spent. |
| **Player participation / usage / outcomes** | ESPN box scores · `cfbd /player/usage`, `/games/players` | PARTIAL / ADVERTISED | Post-game facts only; no point-in-time role/participation evidence. | — | **No player families in V1** (directive §7). |

## 3. Identity and point-in-time rules adopted

- **Event:** ESPN provider event id (digits). Cross-division games arrive from both FBS and FCS requests and are
  merged by id; disagreeing copies are withheld (`mergeEventRows`, tested).
- **Team:** `ncaaf-team-<ESPN team id>`. ESPN college and NFL team ids overlap numerically, and the prefix is what
  keeps them apart (tested). CFBD team ids still have to be confirmed equal to ESPN's once a key exists. Until
  then CFBD rows join to nothing.
- **Division:** classification comes from season-scoped provider membership, reconciled to FBS teams that played.
  It is never taken from the request filter.
- **Results:** only `STATUS_FINAL` is a played game. Forfeits and other completed statuses are kept with an
  unknown score (tested). A scheduled game's `"0"` is never a score (tested, mutation-probed).
- **Features:** any season aggregate (ratings, talent, returning production) without an as-of date is a
  benchmark, not an input. Rosters, injuries and depth charts have no historical point-in-time source, so they
  are excluded from V1 backtests.
- **Overtime rules** (for Stage 3 simulation): from 2021, a 2-point try is required after a touchdown from the
  2nd overtime, and from the 3rd overtime play is alternating 2-point attempts
  ([NCAA, 2021](https://www.ncaa.org/news/2021/10/27/general-new-football-overtime-rules-displayed-this-season.aspx)).
  The probe saw games of up to 9 OT periods, so this needs re-verifying per season before it is coded.

## 4. What V1 can honestly target (input to Stage 2)

Supported by verified data: **team strength, joint team scores, winner, margin and total distributions**, built
only from prior games' final scores (and drive data, if the corpus cost is accepted), over 2021–25 with roughly
800 FBS–FBS games per season. A **de-vigged market baseline** is possible only after the `odds_api` decision.
`cfbd` closing lines can serve as a labelled closing-line benchmark once DP's key exists. Unsupported in V1:
player families; injury, depth, QB-change and weather features; kickoff-revision history.

## 5. Artifacts and reproduction

- `app/src/lib/sports/ncaaf/espn-events.mjs` (+ `.test.mjs`, 14 tests): pure normalisation, merge, coverage.
- `app/scripts/ncaaf/probe-espn-coverage.mjs`: bounded (cap 250, 300 ms throttle), cached, keyless.
  `node scripts/ncaaf/probe-espn-coverage.mjs --now <ISO> --seasons 2021-2025` (from `app/`). First run:
  178 requests; a re-run from cache makes 0.
- `data/internal/research/ncaaf/capability/espn-coverage-v1.json`: counts only.
- Raw bodies: `data/internal/research/ncaaf/.cache/` (gitignored by `.cache/`; verified with `git check-ignore`).

Sources: [CFBD terms](https://collegefootballdata.com/terms) · [CFBD tiers](https://collegefootballdata.com/api-tiers) ·
[The Odds API historical](https://the-odds-api.com/historical-odds-data/) ·
[NWS API](https://www.weather.gov/documentation/services-web-API) ·
[Open-Meteo historical forecast](https://open-meteo.com/en/docs/historical-forecast-api) ·
[NCAA OT rules 2021](https://www.ncaa.org/news/2021/10/27/general-new-football-overtime-rules-displayed-this-season.aspx) ·
[CFP availability reports](https://picks-s6.cbssports.com/college-football/news/college-football-playoff-will-require-teams-to-provide-player-availability-reports-beginning-with-2025-season/) ·
[SEC availability policy](https://www.saturdaydownsouth.com/news/college-football/sec-outlines-new-availability-reporting-policy-beginning-in-2024/) ·
[ACC reports 2025](https://theosceola.com/p/notes-acc-to-require-availability-reports-for-league-games-in-2025) ·
[Mountain West reports](https://nevadasportsnet.com/news/reporters/mountain-west-will-mandate-schools-file-injury-reports-before-conference-football-games)
