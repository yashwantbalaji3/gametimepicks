# NBA Research Adapter — Implementation

**Status:** IMPLEMENTED (code), UNPROVEN (live). Program 062–065, Lane D.
**Date:** 2026-07-30.
**Plan this executes:** docs/NBA_RESEARCH_ADAPTER_READINESS.md (§3 adapter contract, §4 scope, §5 W1–W4).
**Governing policy:** docs/PRODUCT_STRATEGY_RESEARCH_TERMINAL.md — research terminal + market intelligence. Nothing here claims predictive superiority, edge, ROI, or a market-beating result, and nothing here promotes NBA.

**The one-line summary:** W1–W4 of the preseason plan are built and tested against the real corpus. NBA's registry state is unchanged at **HISTORICAL_ONLY**. The three blocking gates are still blocking, because they grade LIVE evidence and there is no live NBA data until preseason (~mid-Oct 2026).

---

## 1. What was built

### 1.1 Prerequisite zero — the ISO tip-off instant is persisted (G3)

The provider received the instant and threw it away. `espn_provider._parse` read `ev["date"]`, passed it to `_format_tipoff_et`, kept `"8:30 PM ET"`, and dropped the instant. A display string has no date and no zone offset, so `capturedAt < eventStart` is unevaluable against it — which is why all 54 historical boards report zero research-eligible rows.

| Change | File |
|---|---|
| `Game` gained an optional `tipoff_iso` (defaulted, additive — every other provider is untouched) | `pipeline/providers/base.py` |
| The scoreboard parser carries the instant through alongside the display string | `pipeline/providers/espn_provider.py` |
| Board rows are built by one function that emits `tipoffIso`, `capturedAt`, `researchEligible`, `schemaVersion` | `pipeline/nba/board_schema.py` |
| The board serializer calls it, and refuses a backfill before returning | `pipeline/generate_daily_board.py::_serialize_games` |

`researchEligible` is **derived, never asserted**: `validate_new_board_row` recomputes it from the two timestamps and reports `ELIGIBILITY_NOT_DERIVED` if the row's flag disagrees. Eligibility fails closed on a missing, unparseable, or timezone-naive timestamp, and on `capturedAt == tipoffIso` — a line observed at the instant the ball goes up is not pregame evidence.

**Backfill is refused mechanically.** `TIPOFF_SCHEMA_EPOCH = "2026-07-30"`. `assert_no_historical_backfill` raises for any pre-epoch board carrying a `tipoffIso`, and the guard test walks every committed board to prove none does. The 54 historical boards are permanently research-ineligible; that is the correct outcome, not a gap to close.

### 1.2 Off-season scaffolds are labelled, not silenced

The board already distinguished a multi-source-confirmed off-day (`dataMode: NoGames`) from a provider failure (`ScheduleUnavailable`), but only through vocabulary a reader had to already know. Boards now carry `emptySlateClassification` — `NOT_EMPTY` / `OFF_SEASON_OR_OFF_DAY` / `PROVIDER_FAILURE`. Silencing the cron would have hidden the stats.nba.com timeouts; leaving it unlabelled made a timeout look like a night with no games.

### 1.3 Identity — the contract is wired and scale-tested (G2)

`app/src/lib/nba/identity-contract.ts` existed and was never called. `app/src/lib/nba/nba-adapter.ts` maps it onto the sport-independent seams (`identity/event-identity.ts`, `identity/sport-adapter.ts`), following `mlb-adapter.ts` as the pattern.

- **The odds→game join moved off team full names.** `matchOddsEvent` resolves both sides through the 30-tricode contract and narrows by ET slate date. The board writes `"NY"`/`"SA"`, manual overrides write `"NYK"`/`"SAS"`, and an odds feed writes `"New York Knicks"` — all three now resolve to one identity.
- **Slate date is carried separately from the identity.** A 20:30 ET tip-off is the next UTC day, so slicing an instant (or the event id's `when` segment) yields the wrong slate for most of an NBA evening. `NbaIdentityIndex.slateDates` holds it explicitly.
- **`scheduledStart` is null when no instant exists** — never the date wearing an instant's clothes. The event id degrades from minute to day granularity in that case, which is the honest ceiling for the historical corpus.
- **Game-id namespaces are crosswalked, not merged.** Provider keys are namespaced (`espn:401859967`, `nba-stats:0042500206`, `manual-override:manual-…`) so ids from different systems cannot collide by numeric accident. The index is `buildAliasIndex`, which blocks BOTH sides of a many-to-one mapping (Sprint 043).
- **Fail closed on non-injective mappings.** Zero candidates refuses. More than one candidate ALSO refuses: MLB disambiguates by nearest start because doubleheaders are real there, NBA plays none, so two identities for one matchup on one date is a schedule defect and picking a side would hand a market to an arbitrary half of a broken pair.
- **Nothing is dropped.** `identitiesFromSchedule` returns identities AND refusals, each with a code and a message.

**Scale test (READ-ONLY):** `app/src/lib/nba/historical-boards-scale.test.mjs` loads all 61 committed boards, hashes them before and after, and asserts the hashes match.

| Measured over the committed corpus | Result |
|---|---|
| Board files / boards carrying games | 61 / 28 (2026-05-04 → 06-13) |
| Game rows → identities | 37 → 37, **0 refusals** |
| Duplicate eventIds, provider-id collisions | 0 |
| Game-id index injective on every board | yes |
| Leans accounted for | 2,204 — every one resolves to exactly one game, and every lean's team is one of the two that game names |
| Boards modified by the test | 0 (sha256 before == after) |

### 1.4 Market Center — exactly three seams, parameterized (G6 plumbing)

`app/src/lib/markets/sport-config.ts` is new; the three previously-hardcoded points now read from it. **No MLB stack was copied.** There is still one loader, one pairing registry, one Market Center.

| Seam | Was | Now |
|---|---|---|
| 1 · family vocabulary | `types.ts` unions, MLB-only | `SportMarketConfig.gameFamilies` / `.playerFamilies` / `.playerFamilyByProviderKey`; `types.ts` gained `SPREAD` (basketball's variable line — kept distinct from MLB's fixed `RUN_LINE`, so "the line moved" stays inexpressible for MLB) |
| 2 · data root | `load.ts` module constant `public/data/mlb` | `dataDirFor(sport)`; an unregistered sport resolves to no directory and every read returns its fallback |
| 3 · calibration source | `pairing.ts` imported `../mlb/model-calibration-status` | `simulationModelFor(sport)`; MLB's config derives its modeled keys from `MLB_MARKET_CALIBRATION` rather than restating them |

**MLB behaviour is unchanged.** Every public signature gained an optional `sport` defaulting to MLB, and the MLB config is a restatement of what the code already did. The 158 pre-existing `lib/markets/*` and `lib/identity/*` assertions pass untouched, and `sport-config.test.mjs` asserts the restatement directly rather than assuming it.

**NBA scope, as configured:** game markets only (`MONEYLINE` / `SPREAD` / `TOTAL`); `deVigIsFirstClass: true`; `movement: "ONLY_WITH_MULTIPLE_CAPTURES"` — never inferred from a single capture; `playerFamilies` empty, which is scope rather than a section waiting to fill in.

**NBA reports NO model, structurally.** `model.kind === "NONE"` with the reason and its evidence files. `NoModelOutput` types `modelProbability`, `simulationProbability`, `projection`, `lean`, `pick`, `edgePct` and `confidence` as `never`, so a no-model row cannot carry one even by accident. Composed through the pairing registry, an NBA game market returns `SPORTSBOOK_ONLY` blocked by `SPORT_NOT_MODEL_ELIGIBLE` — market context and nothing else.

### 1.5 Settlement foundation (G4)

`pipeline/nba/settle_results.py` holds the NBA settlement contract; `pipeline/settle_results.py` calls into it.

- **Whitelist expanded**, and the 903 invalid historical rows are exactly `3PM` (245) + `STL` (219) + `BLK` (172) + `PRA` (267). Box-score field maps for ESPN and nba_api; PRA is synthesized as PTS+REB+AST and is **absent, not partial**, when any component is missing.
- The three-point column needed its own reader: ESPN posts `threePointFieldGoalsMade-threePointFieldGoalsAttempted` as `"4-9"`. Read as a scalar it yields nothing; read from the wrong side it yields the attempts. Both are silent errors a settled row would carry as a number.
- **The expansion is forward-only, by date.** `supported_markets_for_date` returns the legacy `("PTS","REB","AST")` for anything before `EXPANDED_MARKETS_EFFECTIVE_FROM = "2026-07-30"`, and fails closed to legacy on a missing date. A guard test walks every invalid row in the ledger and asserts its market is still outside the whitelist for its own date. **Nothing is restamped.**
- **Lineage gating**, mirroring MLB. `settle_for_date` calls `assert_nba_settlement_lineage` before anything reaches the ledger. It reuses `pipeline/mlb/settlement_lineage.py` — that module takes sport/league as arguments and its source allowlist already names the NBA sources, and a second implementation is what the SportAdapter contract calls a defect. NBA rows are projected into the canonical lineage shape: `gameId` stays as the provider ALIAS beside a derived canonical `eventId`, and the stat source maps to an official source name (`nba_api` → `nba-stats-boxscore`, `espn` → `espn-official-scores`, `manual_override` → `operator-official-input`) or passes through unmapped so the gate rejects it by name.
- **Quarantine.** A game the league did not play as scheduled settles to `quarantined` — never win/loss/push, never pending, and it produces no lineage row. Distinct from `invalid` (our whitelist refused it) and `stats_unavailable` (the game happened, the numbers did not arrive).

**Dry run over the 2026 playoff corpus (READ-ONLY, nothing written):**

| | |
|---|---|
| Settled rows / graded rows | 4,592 / 3,635 |
| Dates the gate would refuse | **15 of 16** |
| `MISSING_LINEAGE` | **856** graded rows carry `team`/`opponent` as empty strings, so no canonical `eventId` is derivable |
| `DUPLICATE_PREDICTION` | **677** predictions appear more than once, byte-identical including `settledAt` — the ledger double-counts them |

Neither is repaired. Restamping would destroy the evidence; the dry run's job is to make the state visible before the first forward run, and it is the concrete reason G4 still reads FAIL. Both findings are new — they were not in the readiness assessment, which measured the whitelist short-circuit but had no gate to run.

### 1.6 Standing guards

`app/src/lib/nba/nba-guards.test.mjs` asserts what must NOT change now that the plumbing works:

- NBA is `HISTORICAL_ONLY`; `canEnterPredictionProducts` and `canShowLiveProjections` are false; `resultsMode` is `archive` so the settled record stays published.
- `sports-coverage.ts` still carries NBA `level: "full"` for the legacy parlay gate, and NBA is **not** in `MODELED_SPORT_KEYS` — the registry narrows it. If someone changes the level, the test says to re-check the gate rather than delete the assertion.
- No NBA player-prop model; `NBA_MARKET_CONFIG.model.kind === "NONE"`.
- The adapter does not claim `FULL_MODEL`.
- `NBA_CONTRACT_FLAGS` stays `{public:false, approvedForProduction:false, productEligible:false}`.
- A source scan over `lib/nba/*.ts` for `modelProbability` / `simulationProbability` / `edgePct` / published-pick fields, so a NEW file cannot quietly add one.

---

## 2. Gates, re-scored

The gates grade **evidence**, not code. Writing an adapter cannot move a gate that asks whether something ran live.

| Gate | Before | Now | What changed, and what still blocks |
|---|---|---|---|
| G1 Official results source | PARTIAL | **PARTIAL** (unchanged) | No code can settle this. It needs a founder ruling on whether ESPN box scores satisfy "official" — 94.3% of decisive settlements came from ESPN. The source allowlist already names both. |
| G2 Identity reliability | FAIL | **FAIL — evidence pending, engineering complete** | The contract is wired, the full-name join is replaced, three id namespaces are crosswalked, collisions refuse both sides, and 37/37 game rows plus 2,204 leans resolve injectively across the whole corpus. What is missing is a LIVE slate: every measurement above is retrospective, on boards that were never joined this way in production. |
| G3 Leakage safety | FAIL | **FAIL — evidence pending, engineering complete** | The instant is persisted and eligibility is derived per row from the first new artifact onward. `researchEligible > 0` cannot be observed until a real preseason board exists. The 54 historical boards stay at zero, permanently and correctly. |
| G4 Settlement quality | FAIL | **FAIL — and now specifically** | The whitelist short-circuit is fixed forward-only, quarantine semantics exist, and the lineage gate is wired. Running it dry over the corpus surfaced two defects nobody had measured: 856 graded rows with no derivable event identity, 677 duplicated predictions. Those must be understood before a forward run is trusted, and the gate has still never run live. |
| G5 Evaluation capability | PASS (path) | **PASS (path)** (unchanged) | Nothing in this lane changes it. |
| G6 Product value | PASS (as market intelligence) | **PASS (as market intelligence)** | The Market Center plumbing now exists for NBA game markets, which converts the claim from "possible" to "wired". Still no live capture. |

**Score: 2 pass / 1 partial / 3 fail — identical to the readiness assessment.** That is the correct outcome. The lane's job was to build W1–W4 so the preseason can be the dress rehearsal; it was not to promote anything.

---

## 3. What preseason must prove

Full procedure in **docs/NBA_PRESEASON_DRESS_REHEARSAL.md**. In one line each:

1. **G3** — a real preseason board with `researchEligible > 0` on day one, per row, with `capturedAt` genuinely before `tipoffIso`. Not one backfilled row.
2. **G2** — a live slate where every odds event resolves to exactly one game through the tricode+date join, with refusals counted and explained rather than absent.
3. **G4** — lineage-gated settlement of real preseason finals, plus at least one postponed or altered event exercising quarantine fail-closed. And an answer for the 856/677 historical findings: understood and bounded, not silently inherited.
4. **Movement** — several real captures of the same event, or the movement claim stays unmade.
5. **G1** — the founder ruling on ESPN-vs-official, recorded.

Only then, and only with founder sign-off recorded in the promoting sprint's ledger, does NBA move to MARKET_INTELLIGENCE. Otherwise it stays HISTORICAL_ONLY and the season starts capture-only.

---

## 4. Non-goals, restated

Unchanged from the readiness doc §6, and enforced by `nba-guards.test.mjs` rather than by intention:

- No FULL_MODEL and no RESEARCH_MODEL promotion.
- No public probabilities, leans, or picks of any kind.
- No backfill of the 54 historical boards.
- No player-prop model at launch.
- No re-activation of the legacy `sports-coverage.ts` parlay gate.
- No claim of predictive superiority, ROI, or market-beating anywhere.

---

## 5. Files

**Python**
- `pipeline/nba/__init__.py`, `pipeline/nba/board_schema.py`, `pipeline/nba/settle_results.py` (new)
- `pipeline/nba/board_schema_test.py`, `pipeline/nba/settle_results_test.py` (new)
- `pipeline/providers/base.py` — additive optional `Game.tipoff_iso`
- `pipeline/providers/espn_provider.py`, `pipeline/providers/espn_provider_test.py`
- `pipeline/generate_daily_board.py` — `_serialize_games` + `emptySlateClassification`
- `pipeline/settle_results.py`, `pipeline/settle_test.py`

**TypeScript**
- `app/src/lib/nba/nba-adapter.ts`, `app/src/lib/nba/tipoff-schema.ts` (new)
- `app/src/lib/nba/nba-adapter.test.mjs`, `historical-boards-scale.test.mjs`, `nba-guards.test.mjs` (new)
- `app/src/lib/markets/sport-config.ts` + `sport-config.test.mjs` (new)
- `app/src/lib/markets/types.ts`, `load.ts`, `pairing.ts` — the three seams

**Verification:** `pytest pipeline/nba/ pipeline/providers/espn_provider_test.py` (62 passed), `python -m pipeline.settle_test` (85 assertions), `npx tsx --test src/lib/nba/*.test.mjs src/lib/markets/*.test.mjs src/lib/identity/*.test.mjs` (304 passed), `npx tsc --noEmit` clean.
