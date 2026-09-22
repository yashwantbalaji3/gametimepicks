# v1.7 — NBA readiness receipt (parallel track N0–N3)

**As of:** 2026-09-22 · **Capability registry:** `nba` = `HISTORICAL_ONLY`, `canEnterPredictionProducts`
false — **unchanged and guarded** (`capability-product-gating.test.mjs`, `ask-contract.test.mjs`,
`contract.test.mjs` sport gate). Nothing in this track reaches a public route or a product.

## Calendar (verified 2026-09-22 against NBA.com key dates)

| Milestone | Date | Days from this receipt |
|---|---|---|
| Camps open (overseas teams Sep 22) | 2026-09-29 | 7 |
| Preseason begins (MIA @ TOR, Quebec City) | 2026-10-03 | 11 |
| Preseason ends | 2026-10-16 | 24 |
| Opening-day rosters set | 2026-10-19 | 27 |
| Regular season begins | 2026-10-20 | 28 |

## N0 — current-state audit (done)

| Class | What | Disposition |
|---|---|---|
| reusable, live | ESPN schedule capture (`sport-schedules.yml`, 100 rows Oct 3–25), ESPN results capture, ESPN injuries feed (`data/internal/research/injuries/nba/latest.json`), second-generation settlement contract (`lib/sports/nba/{settlement-contract,current-results,shadow-contract}.mjs`, armed, unrun), identity contract (`lib/nba/identity-contract.ts`), Ask refusal at two boundaries | keep |
| historical-only | 54 daily boards (21 with leans, May 5–Jun 13), `results/settled_leans.jsonl` (4,592 rows), `/results/nba` archive page, legacy `pipeline/settle_results.py`, June Finals card product | keep as archive |
| stale / running for nothing | `auto-refresh.yml` every 2 h on an NBA-season cron against stats.nba.com (timing out from CI since 2026-06-13); `morning-projections.yml` writing empty `ScheduleUnavailable` boards daily; root `board.json`/`schedule.json`/`players.json`/`odds_props.json` singletons | backlog N-1: de-schedule the NBA halves until a working provider exists |
| unsafe / unverified | `nba_api` provider (dead from CI), `rebounds-prototype-contract.ts` (never validated) | do not reactivate |
| delete candidates | `pipeline/cache/nba_api_*` (49 files), `pipeline/.venv` (checked-in venv), `__pycache__`, `public/data/hit_rates.json` (`isDemo: true`), `nba-finals-stake-row.tsx` (no importer), `.vercel/output/static/data/game-outlook/nba` (no source) | backlog N-2 |
| live footgun | `sports-coverage.ts` still says `level: "full"` for NBA to feed the legacy `MODELED_SPORT_KEYS` gate; the registry overrides it today | backlog N-3: remove the legacy level before the registry state ever moves |

## N1 — canonical data foundation (done for games, teams, box scores; players partial)

| Domain | Owner | State |
|---|---|---|
| Games | `data/internal/research/nba/corpus-v1.json` — 4,179 finals, 2023-24 → 2025-26, phase, OT, neutral site, quarantine list | canonical |
| Box scores | `data/internal/research/nba/boxscores/<eventId>.json` — **4,179 / 4,179 games, 113,080 player rows**, MIN/PTS/REB/AST/3PM/3PA/FGM/FGA/FTM/FTA/STL/BLK/TOV/OREB/DREB/PF/+/-, DNP explicit, null never zero, ESPN label order asserted (0 violations) — `build-nba-boxscore-corpus.mjs`, parser unit-tested. ⚠ ESPN **zero-fills 316 non-observation rows** (294 inactive roster players, 22 nameless placeholders); parser v1.2.0 makes them all-null and carries `active` raw (the P247 absent-as-zero class, caught here before any model read it). Only the 202 re-captured files carry the `active` key; a full `--force` re-capture (~22 min) makes the corpus uniform — backlog N-6 | canonical (free ESPN summary endpoint) |
| Teams | 30 canonical tricodes + aliases in `identity-contract.ts`; box scores keyed by ESPN `providerTeamId`, corpus by display name; schedule rows carry both | canonical for the 30 franchises; exhibition clubs get no history by design |
| Players | ESPN athlete ids from box scores; **no roster owner** — the only roster signal is "appeared in a box score for this team" | **gap N-4 (blocking for regular-season quality):** offseason trades, signings and rookies are invisible (2026-10-03 artifact: Giannis Antetokounmpo appears on MIA in the injuries feed but has no MIA box-score row; rookies Bittle, Conwell unknown). A free roster source (ESPN team roster endpoint, keyless) is the obvious candidate; a paid one is a founder gate |
| Context | rest days / back-to-back derivable from the schedule; injuries feed live (OUT only excludes; Day-To-Day simulated at full minutes) | partial |

## N2 — preseason is a different population (built)

Separate populations end to end: the Elo has a `preseasonRatings` stream that regular games never touch and
vice versa; the minutes model takes `population: "preseason" | "regular"`; the grader keeps preseason and
regular buckets apart; the artifact label is `NBA PRESEASON — EXPERIMENTAL` (season type 1) or
`NBA REGULAR SEASON — SHADOW` (2), refused for anything else. `productEligible: false`, `dataClass:
PRIVATE_RESEARCH`, never read by public code (`neverReadBy` note in the artifact; `public-beta-safety`
forbids the read).

## N3 — model / simulation architecture (v0, built, internal)

```
corpus finals ──► team-rating.mjs (Elo, K=20, HA=+70, 25% season regression; two streams)
box scores  ──► minutes-model.mjs (trailing-10 → season → insufficient; DNP/null excluded; OUT from injuries)
             └► per-minute pts/reb/ast/3pm rates (+ sd), null under 3 games
schedule    ──► game-sim.mjs (mulberry32 seeded by event id, 10,000 runs, 240-minute pool rescale recorded)
             └► experimental-forecast.mjs → forecasts/<date>.json (Elo p AND sim p, side by side, gap recorded)
finals      ──► grade-nba-experimental-forecasts.mjs → ledger.json (Brier/LL for Elo and sim; score/total/margin
                error; per-player MINUTES MAE and PRODUCTION-GIVEN-MINUTES MAE, reported separately)
```

Reproducibility: model version, input as-of, run count, seed and seed policy, availability and minutes
assumptions are all in the artifact; the 2026-10-03 build is byte-identical on re-run.

First artifact (2026-10-03, MIA @ TOR, preseason): 40 players with expected minutes, 13 with insufficient
history, 5 all-DNP in window, Elo (preseason stream) pHome 0.690 vs sim 0.589 — the gap is the diagnostic,
nothing is blended. **Known and recorded:** sim margin sd ≈ 24 (real ≈ 13) because per-player rate noise is
drawn independently from 4–6-game windows — dispersion is uncalibrated by construction at v0.

## N4 — market-by-market eligibility (not started; the plan)

Every family earns support separately. Data completeness is now sufficient for winner, margin, total,
points, rebounds, assists, 3PM; PRA only as a mathematical combination of jointly simulated components.
For each: model form (v0 above), calibration metric (Brier/log loss for probabilities, MAE + interval
coverage for distributions), sample bars **preregistered before the first regular-season game**,
preseason behaviour reported but never used as regular-season evidence, public status and product
eligibility as separate decisions.

## N5 — lifecycle and where it stands

```
HISTORICAL_ONLY ──► DATA_READY ──► PRESEASON_EXPERIMENTAL ──► REGULAR_SEASON_SHADOW ──► validation receipt ──► PUBLIC FORECAST ──► PRODUCT ELIGIBLE (per market)
   (registry)         ✅ games/teams/box scores        ✅ pipeline built, first artifact         Oct 20 →              needs preregistration
                      ⚠ rosters (N-4)                   ⏳ automation (N-5)                                          before Oct 20
```

The registry moves only with a receipt; no term here changes the registry.

## N6 — regular-season evaluation plan (preregistration owed before 2026-10-20)

Track from game one: game-level Brier/log loss vs the preseason-frozen Elo and vs the market when a price
exists; score MAE and interval coverage; per-player minutes MAE; production MAE conditional on minutes;
rest/back-to-back and role-change slices; simulation interval coverage. Bars and the assessment window are
to be written before Oct 20 and not tuned on it.

## N7 / N8 — public product readiness and Bank Builder / Moonshot entry

Not before a validation receipt. The ProductEligibleLeg contract already carries an `nba` slot that the
registry refuses at both boundaries; the day a market earns eligibility, legs flow through the same
selector with no quota.

## Open items, in order

1. **N-5 automation (before Oct 3):** wire `build-nba-experimental-forecasts.mjs` (daily, ET date) and
   `grade-nba-experimental-forecasts.mjs --fetch` (nightly) into `sport-schedules.yml`, commit
   `data/internal/research/nba/experimental/`.
2. **N-4 rosters (before Oct 20):** a free roster owner; without it regular-season forecasts are for last
   year's teams.
3. **N6 preregistration (before Oct 20).**
4. **N-1 / N-2 / N-3 cleanups** (de-schedule dead NBA crons, delete caches/venv/demo file, remove the
   legacy `level: "full"`).
5. Calibrate sim dispersion (v1) only after preseason diagnostics, and only on the preseason population.

---

## 2026-09-22 overnight — Lane B measurements, roster owner, dispersion, cleanup

**NBA is still NOT product-eligible.** Registry `nba` = `HISTORICAL_ONLY` (untouched tonight); nothing
below reaches a public route, `app/public/data`, or a product. Everything new lives under
`app/src/lib/sports/nba/**`, `app/scripts/nba/**`, `data/internal/research/nba/**`, `docs/`, and the
two workflow edits named in the cleanup receipt.

### N1 claims re-measured (not trusted)

| Quantity | Receipt said | Measured 2026-09-22 | Method |
|---|---|---|---|
| finals in `corpus-v1.json` | 4,179 | **4,179** (2024: 73/1230/1/6/82 · 2025: 73/1230/1/6/84 · 2026: 71/1230/1/6/85 by phase 1/2/cup/5/3) | python over `rows` |
| OT / neutral-site finals | 201 / 47 | **201 / 47** | `overtime`, `neutralSite` |
| box-score files | 4,179 / 4,179 | **4,179** files, 0 not in corpus, 0 corpus games missing, `boxscoreAvailable` true on all, status `STATUS_FINAL` ×4,179, schema 1 ×4,179 | `boxscores/*.json` |
| player rows | 113,080 | **113,080** (2024: 37,734 · 2025: 37,961 · 2026: 37,385) | sum of `players[]` |
| DNP rows | — | **21,381** | `didNotPlay` |
| non-DNP rows with **null** minutes | 316 | **316** (inactive 294 · nameless placeholder 22 · other 0 — MANIFEST agrees) | `minutes === null && !didNotPlay` |
| rows with an observed **0** minutes | — | **358** (a real sub-minute stint; kept as 0, distinct from null) | `minutes === 0` |
| rows without an athlete id | — | **38** | `providerAthleteId === null` |
| files carrying the `active` key | 202 | **202** files / 5,853 rows (`active:true` 2,021 · `false` 3,832); per season 80 / 68 / 54 | key presence |
| capturedAt | — | all 4,179 on 2026-09-22 (builder 1.2.0 last run: `--force --only` 22 ids, 05:36 UTC) | MANIFEST `lastRun` |

**N-6 full `--force` re-capture: NOT run.** `build-nba-boxscore-corpus.mjs` stores the *parsed* document
only — the raw ESPN summary is never retained (`fs.writeFileSync(fileFor(id), JSON.stringify(parsed.doc))`,
line 183) — so a forced pass would overwrite 4,179 docs with no raw kept, failing the "preserves raw
capture" condition. Idempotence holds only up to `capturedAt` (every file would change). Proposal: add
a raw-preserving mode (`boxscores/raw/<id>.json`, gzip) before any uniformising re-capture; the 316
null-minute rows are already handled by the minutes rule, so the missing `active` key costs only the
`noMinutesBreakdown` diagnostic today.

### N-4 free roster owner — BUILT, CAPTURED, SCHEDULED

**Endpoint verdict: usable, current, keyless — with three documented limits.**
`https://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams/{id}/roster` returned 30/30 teams,
**561 athletes**, `status: success`, `season {year 2027, type 1, "Preseason"}`, provider timestamp within
the minute. Verified against the 2026 offseason:

| Case | Evidence (raw under `data/internal/research/nba/rosters/raw/2026-09-22/`) |
|---|---|
| **Traded player** — Giannis Antetokounmpo (`3032977`) | on **MIA** (`14.json`, jersey 7, exp 13, injury Day-To-Day 2026-09-02); **absent from MIL** (`15.json`, 20 rows). The injuries feed agreed; the box-score corpus has no MIA row for him. |
| **Rookie** — Ryan Conwell (`5107157`) | on MIA, `experience.years 0`, `contracts []`, `jersey` absent → null, `debutYear` absent → null; core record says draft 2026 R2 #37. Nate Ament (`5164559`, MIL) and Nate Bittle (TOR) likewise present with zero history. |
| **Two-way** | **NOT EXPOSED.** `status` is `{Active, active}` on **561/561** rows; the core athlete record has the same `status`; no two-way / Exhibit-10 field exists on either endpoint. `contracts: []` is shared by rookies and camp invitees, so it must not be read as two-way (recorded in `roster-contract.mjs`). UNVERIFIED which of the 561 are two-way. |
| **Season parameter** | `?season=2026` relabels `season` to "2025-26 Regular Season" but returns the **same 20 MIA rows** — there is no historical roster at this source; `asOf` = capture instant only. The core API `seasons/{y}/teams/{id}/athletes` lists the same 20 `$ref`s for 2026 and 2027. |
| **Shape** | position `G` 262 · `F` 215 · `C` 83 · `PF` 1; `jersey` missing on 137; injuries embedded (Day-To-Day 51 · Out 7); 0 duplicate display names; 0 ids on more than one team; team sizes 16–22 — **LAC 22, MEM 22 flagged** (> 21). |

Built (all under Lane B ownership, tests green):
- `app/src/lib/sports/nba/roster-contract.mjs` — canonical row (`ROSTER_ROW_KEYS`), 30-team ESPN id ↔
  canonical tricode registry, size bounds 13–21, deterministic ordering, `rosterIndex` / `rosterForTeam`.
- `app/src/lib/sports/nba/roster-parse.mjs` — `parseRosterPayload`, `buildRosterArtifact`,
  `rosterContentKey`; rows without an id REFUSED, failed/empty team = MISSING (`players: null`), double
  listings flagged not deduplicated, byte-identical on equal input.
- `app/src/lib/sports/nba/roster-parse.test.mjs` — 8 tests / 8 pass (traded, rookie, duplicate names,
  missing id, MISSING team, size flags, determinism, registry).
- `app/scripts/nba/capture-nba-rosters.mjs` — sequential, ≈0.4 s gap, 3 retries, raw preserved
  verbatim under `rosters/raw/<date>/<teamId>.json`, normalised `rosters/<date>.json` + `latest.json`,
  `--from-raw` rebuild, exit 2 on zero teams (latest untouched).
- **Real capture 2026-09-22T06:08:44Z:** 30/30 · 561 players · 0 missing · 0 refused · per team ATL 19,
  BOS 16, BKN 19, CHA 18, CHI 17, CLE 18, DAL 19, DEN 19, DET 20, GSW 19, HOU 17, IND 17, LAC 22, LAL 20,
  MEM 22, MIA 20, MIL 20, MIN 20, NOP 18, NYK 16, OKC 17, ORL 19, PHI 20, PHX 20, POR 18, SAC 16, SAS 19,
  TOR 19, UTA 19, WAS 18.
- **Scheduled:** new step `Capture NBA rosters` in `.github/workflows/sport-schedules.yml` (daily 09:07
  UTC job), commits the normalised files, uploads raw as a 14-day workflow artifact (2.7 MB/day is not
  for git), refusal recorded like every capture.
- **Additive forecast integration (v0 pool UNCHANGED):** `buildForecastArtifact` now accepts `rosters`
  and stamps `roster.asOf` plus per-side `rosterReconciliation` (on-roster-without-history,
  simulated-but-not-on-roster); the builder reads `rosters/latest.json`; test added (7/7). The rebuilt
  2026-10-03 artifact (same `--now`) shows the N-4 gap in numbers: **TOR simulates 11 rostered players and
  11 departed ones (Brandon Ingram 27.8 min, Gradey Dick, Agbaji …) while 8 rostered players have no
  history (Kawhi Leonard, Kyle Anderson, Bittle …); MIA simulates 12 rostered + 11 departed (Ware, Jaquez,
  Powell, Herro …) and lacks 8 (Giannis, Klay Thompson, Hardaway, Portis, Richards, Conwell …).** The Oct 3
  forecast is, measurably, for last year's teams. Roster-gating the pool is the first v0.1 candidate
  (versioned, own shadow) — not applied tonight by charter.
- Builder no-op made explicit: a date with no NBA game prints `state=NO_GAMES` and exits 0 without
  writing, so the workflow's BUILT/FAILED split is meaningful (verified on 2026-09-30).

### Sim dispersion — see `docs/V17_NBA_SIM_DISPERSION_DIAGNOSTIC.md`

Correction: the "real ≈ 13" in N3 was mean |margin| (12.87); the realized regular-season **margin SD is
15.98 (16.32 non-OT), total SD 20.03, corr(H,A) 0.17–0.22**. On 60 as-of 2024-25 games the v0 sim reports
margin SD **22.09** (total 22.05) against realized 16.63 / 17.90 and 80 % coverage of 0.917 / 0.850.
Decomposition: rate noise 19.5 pts (dominant; cause = independence across 18.6 pooled players — the corpus
ratio Var(team)/Σ Var(player) is **0.383**), minutes noise 10.3 (almost entirely an artifact: per-run team
minutes vary ±17 min vs a real 0.96), cross 6.8; no shared pace (sim total SD ≈ margin SD); OT unmodelled;
rescale factor 0.70 mean, 0.50 bound hit. Preregistered v1 plan (C1–C5, dev 2023-24 + 2024-25 /
assessment 2025-26) is in the doc; **no constant changed**. Report:
`data/internal/research/nba/reports/sim-dispersion-diagnostic-2025.json`.

### N6 preregistration — written

`docs/V18_NBA_REGULAR_SEASON_PREREGISTRATION.md` (look 1): frozen version strings, window, dev/assessment
split, preseason isolation, team and player metrics, minimum n per market, promotion bars per market
with the house Brier / log-loss / ECE / coverage style, forward-shadow requirement, injuries/rosters/B2B
handling, HOLD / REJECT / PAUSE triggers. No pooled adoption.

### N-5 automation check

- `sport-schedules.yml` (cron `7 9 * * *`) runs `grade-nba-experimental-forecasts.mjs --fetch --write`
  then `build-nba-experimental-forecasts.mjs --date $TODAY --now $NOW --write` (step `nbaexp`, lines
  ≈367–380), commits `data/internal/research/nba/experimental/` on BUILT, records a refusal on FAILED.
- No-op vs failure: builder exit 0 + `state=NO_GAMES` (nothing written) vs exit 1 → `state=FAILED` +
  refusal → red run. Grader with no forecasts dir: "nothing to grade", exit 0.
- Label / class enforcement: `experimental-forecast.test.mjs` pins `labelForSeasonType` (refuses 3/5/"1"),
  `productEligible:false`, `dataClass PRIVATE_RESEARCH`, `neverReadBy`; a new test additionally checks
  every **on-disk** artifact (label ↔ seasonType, population ↔ minutes population, reproducibility fields,
  expected minutes **and** uncertainty on every simulated player). `grep -rl research/nba app/public` →
  0 files. `public-beta-safety.test.mjs` 6/6.

### Cleanup receipt (N-1 / N-2 / N-3)

| Item | Proof | Action |
|---|---|---|
| `auto-refresh.yml` NBA half (stats.nba.com / nba_api) | run **35685601992** (2026-09-22 04:06 UTC, "success"): "fetching game logs via nba_api for 33 players" → "recent10 attachment timed out after 8m", `meta.dataMode: ScheduleUnavailable`, "no changes to commit"; same shape on 35665813999, 35635818698 … (20/20 recent runs). ≈13 min × 9 runs/day for nothing. | **De-scheduled, not deleted:** the six Python steps are gated on `vars.NBA_LEGACY_REFRESH == 'true'` (a variable that does not exist), with a comment naming this receipt and the replacement path (`sport-schedules.yml`). Checkout, Node, the publication-SLO watchdog and the commit path keep running every 2 h. |
| `morning-projections.yml` NBA half (`ScheduleUnavailable` boards) | run **35590433598** (2026-09-21 10:45 UTC, cron/chain, "success"): `3/4 NBA projections`, `mode: ScheduleUnavailable` ×4, "4 days, 0 games, 0 leans"; `board.json` `failureReason` = stats.nba.com read timeouts; **79** boards on disk carry `ScheduleUnavailable`. | **NOT de-scheduled — documented blocker.** The same NBA run is the only writer of `app/public/data/meta.json` (`generate_daily_board.py:1553`), whose `lastPipelineRun` the site footer renders on every page (`footer.tsx:245` `FooterFreshness`). Skipping NBA would freeze that timestamp — a public behaviour change outside Lane B. Path: move the footer freshness off legacy `meta.json` (Lane C / founder), then set the `skip_nba` default to true. |
| `pipeline/cache/nba_api_*` (49 files) | gitignored (`.gitignore:43`), 0 tracked, provider dead | **Deleted on disk** (49 files; `espn_scoreboard_*`, `odds_api_*`, `wc_*`, `mlb_*` untouched). |
| `pipeline/.venv` (208 MB) | **NOT checked in** — ignored by `.gitignore:15`, 0 tracked files; referenced by `scripts/automation_refresh.sh:53`, `automation_projections.sh:68`, `operator_settle.sh:37`, `check_odds_key.sh:17` as the preferred local interpreter | **Left in place.** The receipt's "checked-in venv" was wrong; deleting a local, ignored venv is a workstation choice, not a repo cleanup. |
| `pipeline/**/__pycache__` (14 dirs outside the venv) | gitignored (`.gitignore:6`), 0 tracked | **Deleted on disk.** |
| `app/public/data/hit_rates.json` (`isDemo: true`, 2026-04-30) | tracked; 0 `src/` readers (`audit-data-lineage.mjs` reports INFO when absent); **re-seeded from `pipeline/demo_data/hit_rates.json` on every board run** (`generate_daily_board.py:1555–1560`), which is why it never went away | **Deleted** both files and removed the seed block (comment left in place). Python syntax verified. |
| `app/.vercel/output/static/data/game-outlook/nba` | untracked build output (`app/.gitignore:8`), source removed (guarded by `homer-nukes-board.test.mjs`) | **Deleted on disk.** |
| `sports-coverage.ts` NBA `level: "full"` | consumers change behaviour on `level`: `sports-coverage-board.tsx:54` counts "picks" sports by `level === "full"`, `:128` picks the badge tone from `COVERAGE_BADGE[sport.level]`, `home-sports-coverage.tsx:20` likewise; `MODELED_SPORT_KEYS` itself derives from `sport-capabilities.ts:196`, not from this field | **Not changed** — a level change alters two components' output, so the "no consumer behaviour changes" condition fails. Needs the mixed-sport parlay decision + component owner. |

### Tests run tonight (exact)

roster-parse 8/8 · experimental-forecast 7/7 (2 new) · game-sim 5/5 · minutes-model 5/5 · team-rating
6/6 · boxscore-corpus 11/11 · settlement-contract 8/8 · current-results 6/6 · shadow-contract 5/5 ·
research/nba-research 5/5 · ops/workflow-shell-syntax 6/6 · workflow-failure-visibility 9/9 ·
audits/capture-independence 8/8 · launch/schedule-cadence 4/4 · ops/receipt-verifier 5/5 ·
ops/publication-slo 24/24 · ops/push-failures-are-visible 3/3 · public-beta-safety 6/6 ·
mlb/homer-nukes-board 7/7 · nfl/injuries-reach-boards 2/2 · search-index-generated 2/2. **0 failures.**
Both edited workflows parse as YAML. `generate_daily_board.py` parses.

### Remaining blockers, in order

1. **Roster-gated pool (v0.1)** — the Oct 3 artifact simulates 22 departed players and omits 16 rostered
   ones; the reconciliation now measures it, the pool still ignores it. Versioned change + own shadow.
2. **Dispersion v1 (C1–C5)** on the preregistered split; margin/total coverage bars in
   `V18_NBA_REGULAR_SEASON_PREREGISTRATION.md` §7 cannot pass at v0 (0.917 / 0.850 on 2024-25).
3. **morning-projections NBA half** stays scheduled until the footer freshness leaves legacy `meta.json`.
4. **Two-way status** is not observable from any free ESPN endpoint (UNVERIFIED for all 561 rows).
5. **No authorized NBA price receipt** — the PRODUCT column of every market bar is unreachable until one
   exists; a public forecast can be earned without it, product eligibility cannot.
6. **N-6 raw-preserving box-score re-capture** before any uniformising `--force`.

### Cleanup receipt addendum — 2026-09-22 (daytime session)

- **N-1 (second half) DONE:** `morning-projections.yml` now sets `SKIP_NBA` unless the repository variable `NBA_LEGACY_REFRESH=true` (the orchestrator already honoured the flag; step 3/4 was the dead stats.nba.com generator writing an empty `ScheduleUnavailable` board + `meta.json` every run). The public coupling that blocked this overnight — the footer's "last refresh" read `meta.lastPipelineRun` on every page — is gone: the footer shows the **build marker** (`buildInfoFromEnv().builtAt`) and the methodology page dropped its "legacy pipeline run" badge. MLB half untouched.
- **NBA schedule capture REPAIRED:** `sport-schedules.yml` had refused "NBA schedule" (and "NFL schedule") on every run since 2026-09-20 — ESPN's scoreboard answers `400 Failed to get events endpoint.` to the `dates=A-B` range form while `dates=YYYYMM` still answers. `capture-nba-schedule.mjs` / `capture-nfl-schedule.mjs` now fetch by month through `src/lib/sports/espn-scoreboard-window.mjs` (unit-tested) and filter to the window; live dry-run 2026-09-22: **370 NBA events over 70 days** (the committed artifact still holds the 100-row Oct 3–25 window until the next run), 16 NFL events over 9 days.
- Registry still `HISTORICAL_ONLY`; nothing NBA is product-eligible.
