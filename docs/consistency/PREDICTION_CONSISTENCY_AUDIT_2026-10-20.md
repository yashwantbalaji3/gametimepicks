# Cross-Product Prediction Consistency — foundation and audit (2026-10-20)

Founder requirement approved 2026-10-20. This document covers the foundation that is built: the contract, the shared
evaluator, the representative-run rule, the gate checks and an audit over committed artifacts. It lists every
discrepancy the audit finds today, with its source, a correction and an owner. **No product is rewired in this
change.** The fixes are listed at the end as focused follow-ups.

Code: `app/src/lib/consistency/` — `official-snapshot.mjs`, `market-evaluator.mjs`, `representative.mjs`,
`checks.mjs`, `static-scan.mjs`, `audit.mjs`, `known-discrepancies.json` (the pinned baseline) and the tests.
Script (read-only): `npx tsx scripts/consistency/audit-prediction-consistency.mjs [--json] [--gate NFL:<id>]`.
It writes nothing under `data/` or `app/public/`. Only an explicit `--write-baseline` re-pins the baseline file.

Founder decisions folded in (2026-10-20, via coordinator):
1. The **NFL player board is the OFFICIAL source** for player projections (share-level and anytime-TD families).
   World Model V2 is a SUPPORTING_SIMULATION only and is never the headline projection.
2. The **NFL Theater stays NON-PUBLIC** until the drive engine is re-anchored to the official game forecast.
   `theaterActivationGate('nfl', id)` fails whenever the sim-v2 receipt of record misses the anchoring tolerance.

---

## 1 · The contract — `gtp.contract.official-forecast-snapshot@1`

Each NFL/NBA game has one sealed snapshot:

| field | meaning |
|---|---|
| `sport`, `eventId` | canonical provider event id |
| `snapshotId` | sha256 of the canonical JSON (sorted keys) of everything else. It is deterministic and changes when any number or source changes. |
| `modelVersions` | `game` (e.g. `nfl-regular-season-public-v1@v2`, `nba-sim-v1-coherent@nba-sim-v1-profile-1`) and `players{family → id@version}` |
| `inputAsOf`, `generatedAt`, `frozenAt`, `lockAt` | ISO instants; `lockAt` = kickoff / tip |
| `publication` | `PUBLIC` \| `PRIVATE`. NBA stays PRIVATE until the capability registry lets NBA show live projections **and** the artifact stops being `PRIVATE_RESEARCH`. |
| `capability` | registry state + `canShowLiveProjections` + `canEnterPredictionProducts` (read from `sport-capability-registry.ts`) |
| `game` | `pHome` (owner's unrounded value), `pAway`, `pTie`, `pHomePublished`, `winner{side, rule, head, pHome}`, `projectedScore`, and distributions for `home`, `away`, `margin`, `total` |
| `players[]` | `playerId` (owner id only: `nfl-athlete-<espn>` / NBA `providerAthleteId`), `team`, `displayName` (presentation only), `participation`, `families{family → {state, distribution, expected, median, support, modelVersion}}` |
| `sources[]` | `{role OFFICIAL\|SUPPORTING_SIMULATION\|SHADOW, path, sha256, modelVersion, generatedAt, inputRef, expectedInputRef, alignedWithOfficial}` |
| `excluded[]` | rows that could not enter (no id, duplicate id, no families), each with its reason |

Distribution kinds are `quantiles` (exact stored points), `normal` (mean, sd), `empirical` (exact histogram) and
`bernoulli`.

**Sources of record.**
- NFL game: the latest receipt generated strictly before kickoff (`forecastOfRecord`, forecast-ledger NFL adapter).
- NFL players: the player board for the event, which must also be generated before lock.
- World Model V2 is attached as SUPPORTING_SIMULATION and sim-v2 as SHADOW. Each keeps its own version and its input
  reference. Neither is ever merged into an official number; a test pins this.
- NBA: the v1 receipt, refused unless `receiptIntegrity(game).state === "OK"`.

Every refusal is typed (`SNAPSHOT_REFUSAL`): `NO_PRE_LOCK_RECORD`, `NO_PLAYER_BOARD`, `BOARD_EVENT_MISMATCH`,
`BOARD_AFTER_LOCK`, `RECEIPT_INTEGRITY`, `GAME_NOT_IN_ARTIFACT`, `NO_GAME_DISTRIBUTION`, `NO_ARTIFACT`, `NO_EVENT_ID`.
`playerOf(snapshot, id)` matches ids only, so a name never finds a player.

## 2 · The evaluator — `evaluateMarket` (`gtp.consistency.market-evaluator@1`)

There is one evaluation per (snapshot, subject, family, book, line, capture). It returns `identity` (with a `key`),
`projection {expected, median}`, `pOver`, `pUnder`, `pPush`, `decisive`, `implied {rawOver, rawUnder, noVigOver,
noVigUnder}`, `edge`, `edgePoints`, `ev`, `lean`, `withheldReasons[]` and `eligibility {qualified, publication,
blocking, qualification}`, plus `modelVersion`, `snapshotGeneratedAt` and `evaluatedAt`.

Supported markets: player families, `game_total`, `team_total`, and `spread` (a team covers line L when its margin
+ L > 0).

**Formulas.** Exact internally; nothing is rounded.
- Bernoulli and empirical: exact mass sums for >, < and =. A histogram is normalised by its total.
- Normal: F(x) = Φ((x − μ)/σ), with Φ from `v2-candidate-gates.ts`.
- Quantiles: piecewise-linear CDF through the stored points. Outside them is an exponential tail whose density
  matches the adjacent segment, truncated at `lowerBound` (0 for counts and yards).
- **Continuity rule.** It applies to every integer-valued stat: yards, receptions, points, team scores, margins and
  totals. P(X = k) = F(k + ½) − F(k − ½). P(over ℓ) = 1 − F(⌊ℓ⌋ + ½). P(under ℓ) = F(⌈ℓ⌉ − ½). On a half line the
  push is 0. On a whole line the push is F(ℓ + ½) − F(ℓ − ½).
- Price: the raw implied value comes from `americanToImpliedRaw` (projection-framework.ts). No-vig is proportional
  two-way. A pair whose raw sum falls outside (1, 1.25] is refused (odds snapshot-contract sanity band).
- Edge = model decisive probability − no-vig, where the decisive probability is P(over) / (P(over) + P(under)).
  Pushes are refunded, so they are excluded.
- EV per unit at the offered price = P(side)·(decimal − 1) − P(other side).

**Lean (`price-aware-ev@1`).** A side leans when its EV ≥ 0.03 **and** its edge ≥ 0.02. If both sides pass, the
larger EV wins; an exact tie is NONE. The lean is never derived from projection vs line.

A blocking reason forces the lean to NONE: `NO_PRICE`, `ONE_SIDED_PRICE`, `PRICE_IMPLAUSIBLE`, `NO_CAPTURE_TIME`,
`PRICE_STALE` (older than the product contract's 12 h `LEG_BOUNDS.maxPriceAgeMs`), `PRICE_FROM_FUTURE`,
`PRICE_AFTER_LOCK`, `EVALUATED_AFTER_LOCK`, `NO_LINE`, `NO_DISTRIBUTION`, a missing subject or family, or
`NO_EVALUATION_TIME`.

A qualification reason leaves the lean visible but makes the evaluation unqualified: `FAMILY_NOT_PUBLISHED`,
`PARTICIPATION_NOT_CLEARED`, `PUBLICATION_PRIVATE`, `SPORT_NOT_PRODUCT_ELIGIBLE` and `BELOW_LEAN_THRESHOLD`.

Products may add stricter qualification. They may never re-derive or reverse a lean.

## 3 · Official Representative Simulation — `selectOfficialRepresentative`

- The default Theater run is a real stored run that minimises the distance below. Ties go to the lowest runIndex.

  distance = √(Σ wₖ zₖ² / Σ wₖ), where zₖ = (run − official expectation) / official scale.

- **Team terms** (weight 1 each): home, away, margin and total. Scales: NFL uses the joint-normal σ_M and σ_T, with
  team σ = √(σ_T² + σ_M²)/2. NBA uses each simulated sd.
- **Player terms** are used only when runs carry player lines (NBA v1). They join by id only, and together share a
  total weight of 1.
- `withinTolerance` holds when distance ≤ 0.5.
- Every other run is a What-If: labelled "Hypothetical", `hypothetical: true`, `feedsProducts: false`.
- **Reconciliation:** each term carries its fractional official expectation, the whole-number run value and the
  signed difference. Neither is rounded into the other, and box-score totals are never adjusted.

Selection today uses the 5 stored runs per game. NFL sim-v2 stores team-only runs; NBA v1 stores team and player
samples.

## 4 · Gate checks (`checks.mjs`) and the Theater gate

| code | what is compared |
|---|---|
| `PROJECTION_MISMATCH` | surface number vs snapshot number on the same identity. Tolerance = half a unit of the surface's stored precision (±1e-9 unrounded, ±0.5e-4 for 4 dp, ±0.005 for 2 dp, ±0.5 for whole numbers) |
| `LEAN_CONTRADICTION` | product side vs shared evaluator lean. Opposite side = ERROR; a side the price does not support = WARN. Also catches cross-product disagreement on one identity key. |
| `SCENARIO_LEAK` | a product leg whose source is not OFFICIAL, or is hypothetical |
| `BOX_SCORE_INCONSISTENT` | NFL: Σ quarters = final = last drive score. NBA: the engine's own `checkDraw` (seven invariants). WMv2 worlds: points = scoring composition. Accepts an injected validator for the Theater's own invariants (PR #1140 branch). |
| `MODEL_VERSION_MIX` | a supporting/shadow source built from inputs other than the record and still displayed; a surface mixing per-family models |
| `POST_LOCK_REWRITE` | an artifact presented as pregame that was written at or after lock, or a frozen hash that moved |
| `UNQUALIFIED_AS_QUALIFIED` | a row ranked or presented as qualified while its family or evaluation is not |
| `NAME_JOIN` | rows with a name but no owner id (runtime); name-keyed joins in code (static) |

Each record has the shape `{code, severity, sport, eventId, snapshotId, surface, identity, sources, expected, actual,
count, examples, correction, owner, detail, fingerprint}`. The fingerprint holds no numbers and no line numbers.

**`theaterActivationGate(sport, eventId)`** returns the blockers that must all be empty before a public Theater flag
may turn on:
- `SCENARIO_LEAK`, `BOX_SCORE_INCONSISTENT` or `MODEL_VERSION_MIX` for the event;
- `PROJECTION_MISMATCH` on `simulation-theater.*` or `nfl-simulation-v2.*`, which proves the default run is chosen
  from the official snapshot and shown with official numbers;
- static Theater selection-rule findings for the sport;
- a missing snapshot;
- **NFL only:** a missing sim-v2 receipt of record, or one that is not anchored. Anchoring means
  |ΔpHome| ≤ 0.02, |Δ margin p50| ≤ 0.5 and |Δ total p50| ≤ 0.5 (`SIM_ANCHOR_TOLERANCE`, official median vs batch
  p50).

## 5 · What the audit loads

- **NFL:** the 29 events with every source committed (401872980–401873008). For each, it loads the forecast receipts,
  the player board, World Model V2 and the sim-v2 receipt of record.
- **NFL surfaces checked:**
  - the game page (`gameView`/`playerRows`, the page's own logic on the same documents);
  - the public forecast copy (`loadForecastViews`);
  - the `/nfl` Top boards (`topBoards`);
  - weekly boards;
  - frozen live props: the Live Hub copy, plus the graded "implied side" that feeds Results — 418 priced rows run
    through the evaluator;
  - sim-v2 batch distributions (`/nfl/simulation`) and the Theater default;
  - WMv2's restated forecast of record and its sampled worlds.
- **NBA 2026-10-20 (401909088 BOS @ DET, private):** the v1 receipt, both private top boards (v1 and v0.1), the
  receipt's two win-probability heads, and the representative samples.
- **Static scan:** 34 known code-level divergences, plus a guard so product modules never read scenario or shadow
  outputs (0 hits today).

## 6 · Discrepancies found (1068 records; pinned in `known-discrepancies.json`)

| sport | code | records | items | ERROR | WARN |
|---|---|---:|---:|---:|---:|
| NFL | PROJECTION_MISMATCH | 736 | 3796 | 726 | 10 |
| NFL | SCENARIO_LEAK | 116 | 852 | 116 | 0 |
| NFL | MODEL_VERSION_MIX | 85 | 172 | 85 | 0 |
| NFL | UNQUALIFIED_AS_QUALIFIED | 63 | 277 | 0 | 63 |
| NFL | LEAN_CONTRADICTION | 34 | 128 | 3 | 31 |
| NBA | PROJECTION_MISMATCH | 14 | 85 | 8 | 6 |
| NBA | MODEL_VERSION_MIX | 2 | 2 | 2 | 0 |
| NBA | LEAN_CONTRADICTION (static) | 2 | 2 | 0 | 2 |
| NBA | NAME_JOIN (static) | 1 | 1 | 0 | 1 |
| MLB | static (lean 2, projection 6, price-time 1) | 9 | 9 | 0 | 9 |
| ALL | static (name join 4, price-time 2) | 6 | 6 | 0 | 6 |

### 6.1 NFL runtime, by surface (29 events)

| surface | code | records | items | correction | owner |
|---|---|---:|---:|---|---|
| `nfl-game-page.players` | PROJECTION_MISMATCH | 198 | 1216 | Show the board's official projection; WMv2 stays clearly labelled as a supporting simulation (founder decision 1) | forecast-view (release-owner) |
| `nfl-game-page.players` | MODEL_VERSION_MIX | 29 | 116 | `PLAYER_FAMILIES` source `worldModel` → official board for all four yard/reception families | forecast-view |
| `nfl-top-boards` | PROJECTION_MISMATCH + SCENARIO_LEAK | 116 + 116 | 814 + 852 | Rank by the board's official projection; a supporting simulation never feeds a ranked product | forecast-view |
| `nfl-top-boards` | UNQUALIFIED_AS_QUALIFIED (WARN) | 63 | 277 | ESTIMATE families (pass/rush yds) are ranked without the board's ESTIMATE label | forecast-view |
| `nfl-game-page.simulation` | PROJECTION_MISMATCH | 96 | 96 | One win chance and one score distribution per game page | WMv2 producer |
| `nfl-game-page+nfl-top-boards` | MODEL_VERSION_MIX | 28 | 28 | WMv2 built from a superseded record input hash in 28 of 29 events | WMv2 producer |
| `world-model-v2.forecastOfRecord` | PROJECTION_MISMATCH | 9 | 9 | WMv2 restates a non-record receipt in 5 events | WMv2 producer |
| `nfl-simulation-v2.game` / `.players` | PROJECTION_MISMATCH | 134 / 145 | 134 / 1451 | The Simulation page and Theater must show official numbers | sim-v2 producer |
| `nfl-simulation-v2+simulation-theater` | MODEL_VERSION_MIX | 28 | 28 | The sim-v2 receipt of record is built from a receipt other than the forecast of record in 28 of 29 events | sim-v2 producer |
| `simulation-theater.anchor` | PROJECTION_MISMATCH | 27 | 47 | Only 401872981 and 401872991 are anchored. Failing terms: pHome 21, total p50 17, margin p50 9. | sim-v2 producer |
| `simulation-theater.default` | PROJECTION_MISMATCH | 1 | 1 | 401872999: the official representative is run 154 (23–24); the Theater's MEDIAN_LIKE is run 49 | Theater |
| `nfl-live-props.graded-side` | LEAN_CONTRADICTION | 3 ERROR + 28 WARN | 3 + 122 | Grade the frozen shared-evaluator lean. REVERSED: receptions in 401872986, 401872988 and 401872992 (see below). | live-prop-state |
| `nfl-weekly-boards` | PROJECTION_MISMATCH (WARN) | 2 | 20 | Receptions headline is the median on weekly boards but the expected count on the game page and Top boards | weekly boards |

No mismatches were found on: the public forecast copy vs the receipt of record, frozen live-prop projections vs the
pre-lock board, weekly-board values vs the board, any box-score invariant (NFL runs, NBA samples, WMv2 worlds),
post-lock rewrites, or runtime name-keyed rows.

**401873008 (WSH @ SF), exact numbers:**
- Record: rev-0007Z, pHome 0.8052929407 (published 0.8053), margin median 9 (mean 9.36), total median 50 (mean
  50.0253), score 30–20.
- Game page simulation block (WMv2 2.2.0, built from input hash c8527c… vs the record's 39f4d27…): pHome 0.7684.
  WMv2's own "forecast of record" shows 0.806, margin 10.
- sim-v2 (aligned to the record file, but not anchored): pHome 0.7441, margin p50 9, total p50 49, home p50 29.
- Daniels pass yards:

  | source | value |
  |---|---|
  | board (official) | 165.2971 |
  | game page / Top boards (WMv2) | 208.9 |
  | sim-v2 p50 | 204 |

- Daniels rush yards:

  | source | value |
  |---|---|
  | board (official) | 19.43 |
  | WMv2 | 39.2 |
  | sim-v2 | 56 |

- Aiyuk receiving yards: board 8, WMv2 37.8.
- Evans receptions: board expected 4.427, WMv2 4.83.
- Theater default: run 36 (29–20) is also the official representative (distance 0.058).

**Reversed leans (live props, graded on Results):**

| player | line | model view | price | graded as |
|---|---|---|---|---|
| Kyle Williams receptions | 1.5 | expected 1.16, P(over) 0.375 | EV(over) +0.031 | UNDER |
| Malachi Fields receptions | 2.5 | median 1.98, P(over) 0.435 | EV(over) +0.039 | UNDER |
| Rashid Shaheed receptions | 2.5 | P(over) 0.4375 | EV(over) +0.089 | UNDER |

Of the 418 priced rows, 61 carry a price that was more than 12 h old at the freeze.

### 6.2 NBA runtime (private)

| surface | code | detail |
|---|---|---|
| `nba-top-board.default-family` | MODEL_VERSION_MIX | `DEFAULT_BOARD_FAMILY = "v0.1"` (top-boards.mjs:29), but the official v1 receipt is `nba-sim-v1-coherent` |
| `nba-top-board.v0.1` | MODEL_VERSION_MIX + 8 PROJECTION_MISMATCH (79 items) | The v0.1 board ranks a different model for the same game. Cade Cunningham pts p50: v0.1 21.38 vs official 15. Jalen Duren pts mean: 8.12 vs 14.12. |
| `nba-forecast-receipt.winner-head` | PROJECTION_MISMATCH (WARN) | The published side comes from the Elo head (pHome 0.5955), while the simulation gives 0.5489. Both favour HOME, so this is not a lean contradiction today. |

The v1 board matches the official snapshot exactly. Receipt integrity is OK, and the snapshot is PRIVATE.

### 6.3 Static code findings (file:line at HEAD 45e7be0ed0)

All are owned by the release-owner session (producers) unless noted.

| code | rule | location | correction |
|---|---|---|---|
| LEAN | argmax edge (score_prop) | pipeline/score_model.py:143 | shared `price-aware-ev@1` |
| LEAN | argmax edge (MLB grade) | pipeline/mlb/mlb_model.py:368 | same |
| LEAN | projection vs line (R1 rescue) | pipeline/attach_recent10.py:354 | shared lean |
| LEAN | projection vs line (graded side) | app/src/lib/sports/nfl/live-prop-state.mjs:278 | grade the frozen evaluator lean |
| LEAN | hard-coded "over" | app/src/lib/products/engine-v2/sources.mjs:71 (`receiptFromNflBoardCandidate`) | side from the evaluation |
| LEAN | market favourite | app/src/lib/daily-portfolio/mlb-model-picks.ts:70 | evaluator lean |
| LEAN | pOver ≥ 0.5 | app/scripts/nfl/build-nfl-game-simulations.mjs:255 | probabilities only; side from the evaluator |
| PROJ | NBA de-vigs … | pipeline/score_model.py:137, pipeline/generate_daily_board.py:977 | one no-vig rule |
| PROJ | … MLB uses raw implied | pipeline/mlb/mlb_odds.py:319, pipeline/mlb/mlb_model.py:366 | same |
| PROJ | σ: NBA last-10 floor / 5.0 default | pipeline/build_features.py:137, pipeline/score_model.py:109 | σ from the snapshot; missing ⇒ NO_DISTRIBUTION |
| PROJ | σ: MLB season floors | pipeline/mlb/mlb_model.py:250, :312 | one definition per family |
| PROJ | σ: NFL strict empirical / p10–p90 back-out | app/src/lib/sports/nfl/player-props-v1.mjs:107, app/scripts/nfl/build-nfl-game-simulations.mjs:284 | `lineProbabilities`; read marginSigma/totalSigma |
| PROJ | push dropped | pipeline/score_model.py:131, pipeline/mlb/mlb_model.py:333, build-nfl-game-simulations.mjs:75, joint-game-sim.mjs:226, joint-game-sim-v2.mjs:173, joint-game-sim-v3.mjs:165, app/scripts/nfl/evaluate-nfl-player-props.mjs:707 | continuity rule / exact push |
| PROJ | Ask labels P(over) as model probability for UNDER picks | app/scripts/ask/build-ask-projections.mjs:253 | P(side) |
| PROJ | Theater default = shadow's own p50 | app/src/lib/sports/nfl/sim-v2/receipt.mjs:152 | `selectOfficialRepresentative` (Theater session) |
| UNQUAL | board/artifact time used as price time | app/src/lib/game-simulations/mlb-generator.ts:657, app/src/lib/markets/player-intelligence.ts:345, app/src/lib/markets/load.ts:311 | the capture's own time; missing ⇒ NO_CAPTURE_TIME |
| NAME | name-keyed joins | pipeline/daily/enrich_dual_legs.py:31, pipeline/daily/settle_suggested_cards.py:75, app/src/lib/slip/leg-identity.ts:43, app/src/lib/markets/player-intelligence.ts:366, pipeline/settle_results.py:515 | key by (sport, eventId, playerId, market, line) |

`app/src/lib/parlays/v2/candidates.mjs` (the ladder→board join) is not on main. It exists only on commit 8e684a7ba5,
so it is not scanned. The Theater's offline NBA fixture (PR #1140) is not on main either.

## 7 · Baseline discipline

`audit.test.mjs` runs the full audit against committed files and compares the result with `known-discrepancies.json`:

- A **new fingerprint, or a higher count, whose data sources are unchanged** fails the test. Code changes therefore
  cannot add an inconsistency silently.
- A discrepancy whose data files changed since the pin (sha256 manifest) is reported as **data drift** and does not
  turn main red on an auto data commit. Re-pin it after review.
- Code paths are never treated as drift.
- Resolved entries are reported. Re-pin to drop them.

## 8 · Producer-side proposal: re-anchor sim-v2 (owner: release-owner session)

The founder's NFL Theater decision requires three producer changes. None of them is made here.

1. **Re-anchor the drive engine to the official distribution, not only to its medians.** Today `calibration.anchors`
   only targets the median home and away score (29.5 and 20.5). The batch then drifts on win probability: 401873008
   gives 0.7441 vs the official 0.8053, and only 2 of 29 events pass. Fit the per-team thetas so that:
   - the batch pHome, margin p50 and total p50 match the official receipt within `SIM_ANCHOR_TOLERANCE`;
   - preferably the margin and total means and sds also match the receipt's `distribution` (marginMean / marginSigma,
     totalMean / totalSigma).

   The receipt should record the achieved deltas.
2. **Select representative runs against official targets from all runs.** Run `selectOfficialRepresentative` (this
   module) over the full replayable batch — every runIndex, by seed — instead of `representativeIndices`' own
   p50/p90/p10 targets. Store the official representative first; the other runs stay labelled What-Ifs.
3. **Store the selection.** Write the distance, the per-term components, the official targets (with the snapshotId),
   and the rule id `official-representative@1` into the receipt. That lets the gate verify the choice without
   replaying.
4. **Build from the forecast of record only.** In 28 of 29 events, the sim-v2 receipt of record was built from a
   receipt other than `forecastOfRecord`. Regenerate whenever a new pre-lock revision lands, and never keep a stale
   receipt as "of record".

Until all four are done, `theaterActivationGate('nfl', id)` stays closed and the NFL Theater stays non-public.

## 9 · Prioritized fix list (focused follow-ups)

| # | fix | removes | owner |
|---|---|---|---|
| 1 | forecast-view `PLAYER_FAMILIES` → official board for pass/rush/rec yds and receptions. WMv2 numbers move to a labelled supporting section. (founder decision 1) | 314 PROJECTION_MISMATCH records (2,030 items), 116 SCENARIO_LEAK, 29 MODEL_VERSION_MIX | release-owner |
| 2 | Live props / Results: freeze the shared evaluation and grade its lean (NONE ⇒ not graded) | 3 reversed + 122 unsupported graded sides | release-owner |
| 3 | sim-v2 re-anchor + official representative + stored distance + build from the record (§8) | 27 anchor failures, 28 version mixes, 279 sim mismatch records | release-owner |
| 4 | WMv2 rebuild trigger on every new pre-lock record revision; hide when unaligned | 28 version mixes, 96 page-simulation and 9 restated-record mismatches | release-owner |
| 5 | engine-v2 `receiptFromNflBoardCandidate` side from the evaluator (sources.mjs:71) | static LEAN finding | release-owner |
| 6 | NBA `DEFAULT_BOARD_FAMILY` → v1; retire or relabel the v0.1 board for v1-forecast dates (private) | 2 MODEL_VERSION_MIX, 8 PROJECTION_MISMATCH | NBA department |
| 7 | One headline definition for receptions (expected vs median) across weekly boards, game page and Top boards | 2 WARN | release-owner |
| 8 | Push-aware probabilities and one no-vig/σ definition in pipeline/** and NFL sims | 13 static PROJ findings | release-owner |
| 9 | Ids instead of names in slip legKey, propJoinKey, enrich_dual_legs, settle_suggested_cards and NBA settlement | 5 static NAME_JOIN findings | release-owner |
| 10 | Price capture time from the capture, never from the board/artifact | 3 static findings | release-owner |
| 11 | NBA: one win-probability head of record (Elo vs simulation) | 1 WARN | NBA department |

## 10 · Founder decisions and fixes applied (2026-10-20, local, not merged)

**Founder decisions (in chat, 2026-10-20):**
1. The NFL player board is the official player projection. World Model V2 is a labelled supporting simulation only.
2. The NFL Theater stays non-public ("Hold until aligned") until sim-v2 is re-anchored to the official game forecast (§8). `theaterActivationGate('nfl', …)` enforces this.

**Applied on this branch:**
- **Fix 1** (`88729914fd`):
  - forecast-view / game page / `/nfl` hub now headline the official board (ids only).
  - World Model V2 appears under "Supporting simulation (World Model V2 · not the official projection · not graded)", with an older-revision notice.
  - Audit: 1068 → 546 records. Game-page player mismatches and version mixes, plus top-board mismatches, leaks and unqualified records, all go to 0.
  - Verified in a default build: post-build 713/713, browser-checked at `/nfl/game/401873008` (Daniels 165 pass yds = board 165.3).
- **Selector fixes** (`5c01df5db0`):
  - Runs are de-duplicated by runIndex.
  - NBA `CONDITIONAL_ON_PLAYING` families are compared on unconditional terms (r·μ, √(r(σ²+μ²)−(rμ)²)), and a 0-minute run counts as 0.

**Applied on PR #1140** (`claude/gtp-theater-integrate-20261019`, local head `146a952004`):
- The Theater default is the Official Representative Simulation (this selector, byte-identical). NFL 401873008 picks run #48 (30–20, distance 0.035); NBA 401909088 picks run #35 (107–105, distance 0.482).
- Every other run is "What-if · hypothetical", with its own hypothetical box-score watermark.
- The NFL headline is the forecast of record. The engine's batch win shares are labelled "engine batch, not the forecast".
- The NBA Theater reads the committed v1 receipt, checked with `receiptIntegrity`. It fails closed for games without a receipt and never falls back to the fixture.
- e2e (serial, flag-ON + dev build of `7e3ec23bac`):
  - NFL dev: 49 passed, 6 skipped (public-only).
  - NFL public: 54 passed, 1 skipped (dev-only).
  - The NBA dev route needs main merged into #1140 first, because the committed receipt is newer than the branch base.

**Still open:** fixes 2–11 above. All of them are producer, grading or methodology changes owned by the release-owner session or the NBA department.
