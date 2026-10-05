# The Universal Forecast Ledger (Session 13 · Phases A + B)

**One row per forecast observation GameTimePicks actually published or froze — exactly once, append-only, read from
its owner.** It is the substrate for Results V2, Ask V2 and Research V2: they read this ledger instead of each
re-walking the settlement owners.

- Code: `app/src/lib/forecast-ledger/` (contract, identity, measure, row, compose, append-only, `adapters/*`)
- Builder: `node app/scripts/results/build-forecast-ledger.mjs --now <ISO> [--dry-run] [--check] [--verify-against <ref>]`
- Artifact: `data/internal/forecast-ledger/v1/{nfl,mlb,epl,ligue-1,ufc}.jsonl` + `manifest.json`
- Schedule: `nightly-settle` step "Forecast Ledger", after the settlement commit, its own commit (see §5)
- Tests: `app/src/lib/forecast-ledger/forecast-ledger.test.mjs` (contract, parity with owners, mutation probes)

## 1. What a row is — and is not

| Is | Is not |
|---|---|
| the LAST pre-start publication of one family for one subject in one event (the forecast of record) | a pre-kickoff revision (kept in the owner's lineage, never a second observation) |
| one observation however many pages render it (game page, Top-5, Ask, Research) | a product receipt — a 4-leg card is 1 product receipt; its legs' forecasts are rows here, once |
| PUBLISHED or WITHDRAWN | SHADOW / RESEARCH_ONLY / WITHHELD / UNAVAILABLE — never in the public ledger |

## 2. Identity

`forecastId = "fl1-" + FNV-1a-64(sport | eventId | subjectType | subjectId | family | forecastKind)` — owner ids only,
never display text. The model version is **not** identity: a subject/family/event has one forecast of record, and the
version is an IMMUTABLE field, so re-labelling it is an append-only violation rather than a silent second row.

Existing schemes this maps onto: NFL prop `predictionId = <event>:<player>:<family>` (= the Top-5 `forecastId`),
NFL game `canonicalEventId`, MLB `gamePk` + market, EPL derived match id (`soccer:epl:<a>-v-<b>:<minute>`, the pair
ordered **alphabetically**), Ligue 1 ESPN-scheme id, UFC provider (ESPN) bout id — never the name-based bout key.
**Subject ids are the platform's canonical entity ids** (the `data/research-projection/v1/index.json` ids Ask and Research
resolve): `nfl-athlete-<ESPN id>`, `mlb-player-<MLBAM id>`, `epl-athlete-<id>`, `nfl-team-<ESPN team id>` (found by the
team's abbreviation; an unresolvable team withholds its team rows rather than guessing). The first build used
`mlbam-` / `epl-player-` / `nfl-team-<ABBR>`; they were re-keyed on 2026-10-05 by the one audited identity path
(`--rekey`): a vanished row is forgiven only when `pairRekeys` finds exactly one successor identical in every immutable
field except the ids, and the 4,963 old → new pairs are committed in `v1/migrations/2026-10-05-canonical-subject-ids.json`.

Note: in `lib/products/eligible-leg/*` `forecastId` means a MODEL id, not a row id; the ledger's field is
`forecastId` = row id, and products should reference it by that meaning going forward.

## 3. Schema (camelCase per repo convention; every field present, unknown = `null`)

`forecastId, schemaVersion, sport, competition, season, eventId, eventStart, matchup, subjectType, subjectId,
subjectDisplay, teamId, family, forecastKind, modelId, modelVersion, modelStatusAtPublish, publicationStatus,
publicationSurface, receiptId, publishedAt, frozenAt, projection, rangeLow, rangeHigh, rangeCoverage, probability,
probabilityType, classProbabilities, market{line, price, impliedProbability, provider, capturedAt}, direction,
categoryPrediction, withdrawal, settlement{state, finalValue, finalCategory, settledAt, finality, corrections, source,
reason}, measurement{type, absoluteError, squaredError, signedError, insideRange, brier, logLoss, topClassHit,
directionalResult, directionalBasis}, recoverability, provenance{owner, alsoPublishedOn, notes}`.

**Forecast kinds and how each is measured** (`measure.mjs`, one pure function per kind):

| Kind | Measured by | Never |
|---|---|---|
| `CONTINUOUS_PROJECTION` (yards, points, totals) | abs / squared / signed error (projection − actual), inside printed range | a W/L — unless the OWNER graded a published directional claim (`directionalBasis` names it) |
| `BINARY_PROBABILITY` (ATD, win, over 2.5, HR) | Brier, log loss | — |
| `MULTICLASS_PROBABILITY` (1X2) | multiclass Brier (sum form, = the owners'), log loss, top-class hit (ties: none) | — |

Directional bases carried today: `HIGHER_WIN_PROBABILITY_SIDE` (NFL winner), `IMPLIED_SIDE_OF_FROZEN_LINE` (NFL props,
the prop ledger's own `forecastResult`), `PUBLISHED_PICK` (MLB game picks, UFC). PENDING / WITHDRAWN / VOID are never
a loss (contract-enforced).

## 4. Append-only (`append-only.mjs`)

Violations: `MISSING_ROW`, `IMMUTABLE_CHANGED` (projection, range, probability, model, publication time, market,
receipt, …), `SETTLEMENT_REWRITTEN` (outcome changed without the owner's `corrections` count growing),
`SETTLEMENT_REVERTED` (decided → PENDING), `PUBLICATION_CHANGED` (anything but PUBLISHED → WITHDRAWN). Allowed: new
rows, PENDING → anything, NO_MEASUREMENT → SETTLED, owner-recorded corrections.

A forecast enters only once its **event has started** (before kickoff the owner may still revise it). A Top-5-only
forecast enters only 72 h after kickoff (once the prop ledger has had its chance to hold it), as VOID if withdrawn or
NO_MEASUREMENT otherwise — never "pending forever".

## 5. Schedule and failure mode

`nightly-settle` runs the builder after the night's settlement commit with `--verify-against HEAD` and commits through
`scripts/ci/commit-generated.sh` (`GENERATED_PATHS=data/internal/forecast-ledger/`). A refusal exits 3 → the run is
red and the failure alert fires, but the settlement publish has already happened (a gate inside the generator froze the
site for 62 h on Aug 1–3). No `continue-on-error`, no `|| true` (pinned by a test with mutation probes). Freshness:
the ledger lags the owners by up to one nightly cycle; readers show the manifest's `latestSettledAt`.

## 6. Phase A inventory (2026-10-05, main `f4f002ee3d`)

| Sport · family | Producer → artifact | Public? | Frozen? | Settlement owner | In ledger |
|---|---|---|---|---|---|
| NFL winner / total / margin / team score ×2 | `build-nfl-public-forecasts` → receipts `data/internal/nfl/forecast-receipts/<d>/<id>[-rev-HHMMZ].json` | PUBLIC_EXPERIMENTAL | yes (add-only receipts) | `settle-nfl-experimental` → `experimental-settlement/<d>.json` | ✅ EXACT_FROZEN |
| NFL rush / rec yds / receptions / ATD / pass yds (est.) | `build-nfl-player-board` → `player-board/<id>.json` (overwritten) | PUBLISHED / ESTIMATE | frozen at pregame by live-props → prop-settlement | `prop-settlement/<ET day>.json` (append-only, corrections) | ✅ from 2026-09-20 |
| NFL props Weeks 1–2 (before 2026-09-20) | same board, graded by week reconciliation | PUBLISHED / ESTIMATE | no frozen copy; reconciliation rows carry NAME + team, values as printed | `reconciliation/<s>-<w>.json` | ✅ OWNER_GRADED_LOG via exact roster crosswalk (Week 1 + Week 2 TNF: ~720 rows, 7 unresolved names left out); parity: inside-range = the owner's HIT on every settled row |
| NFL Top-5 | `freeze-daily-top-boards` → `results/top-boards/<d>.json` (write-once) + withdrawal sidecar | PUBLISHED | yes | none (reconciliation overlay) | ✅ only when the prop ledger lacks the forecast |
| NFL score shape | `build-nfl-score-shape` → `score-shape/<d>.json` | PUBLIC derived | no | none | ⛔ declared gap |
| MLB moneyline / run line / total | `generate-mlb-predictions` → `predictions/<d>.json` (+ snapshots from 08-23) | PUBLIC (total PAUSED) | snapshots / git history | `grade-game-predictions` → `game-predictions-graded.jsonl` | ✅ OWNER_GRADED_LOG |
| MLB projected score | same | PUBLIC | snapshots | none | ⛔ UNMEASURED |
| MLB player-prop leans | `pipeline/mlb/generate_mlb_board.py` → `boards/<d>.json` | **RESEARCH** (every market demoted) | no | `settle_mlb_results.py` | ⛔ not public history |
| MLB Homer Nukes | `build-homer-nukes` → `homer-nukes/<d>.json` (overwritten) | PUBLIC_EXPERIMENTAL | no | `settle-homer-nukes` → `settled-<d>.json` | ✅ OWNER_SETTLED_UNFROZEN |
| EPL 1X2 + over 2.5 | `build-epl-forecasts` → `forecasts/<d>.json` + internal snapshots | PUBLIC | snapshots | `grade-epl-forecasts` → `graded-forecasts.jsonl` | ✅ |
| EPL BTTS / clean sheet / double chance / scorelines | same | PUBLIC derived | snapshots | none | ⛔ UNMEASURED |
| EPL anytime scorer / SOG ≥1 | `build-epl-player-projections` → snapshots | PUBLIC | snapshots | `grade-epl-player-projections` → `graded-player-projections.jsonl` | ✅ (event id by exact join) |
| Ligue 1 1X2 | `build-league-forecasts` → `ligue-1/forecasts/<d>.json` | PUBLIC model-only | — | `grade-league-forecasts` → `ligue-1/results/graded.json` | ✅ |
| UFC winner | `build-ufc-card` → `card-latest.json` (overwritten) + model-vs-market snapshots | PUBLIC_EXPERIMENTAL | snapshots | `grade-ufc-model-vs-market` → `graded.jsonl` | ✅ |
| UFC method / round | same | PUBLIC_EXPERIMENTAL | snapshots | none | ⛔ UNMEASURED |
| NBA v0 / v0.1 | `build-nba-experimental-forecasts` → `research/nba/experimental*/` (write-once receipts) | **SHADOW** | yes | `grade-nba-experimental-forecasts` | ⛔ never public history |
| Products (Suggested Parlays, Bank Builder, Moonshot, Mr Dub) | product receipts / ledgers | OFFICIAL PRODUCT RECEIPT | various | product settlers | ⛔ by design — product performance, not model observations |

## 7. First build (2026-10-05T00:32Z): 10,081 rows

| Sport | Rows | Families |
|---|---|---|
| NFL | 2,778 | winner/total/margin 111 each · team score 222 · ATD 634 · receptions 560 · rec yds 560 · rush yds 357 · pass yds 112 |
| MLB | 2,617 | moneyline 799 · run line 799 · total 794 · Homer Nukes 225 |
| EPL | 4,608 | 1X2 46 · over 2.5 46 · anytime scorer 2,258 · SOG 2,258 |
| Ligue 1 | 18 | 1X2 |
| UFC | 60 | winner |

Settlement: SETTLED 7,292 · VOID 2,129 (EPL did-not-play 2,092, MLB pushes, ties) · NO_MEASUREMENT 483 · PENDING 177.
Duplicates: 0 (enforced). Shadow leakage: 0 (enforced). Parity: ledger Brier / log loss equal the NFL, EPL and UFC
owners' own scores on every row they publish.

## 8. Owner defects the ledger surfaced (not fixed here — measurement only)

1. **NFL experimental settlement grades evening games once per UTC folder.** A game kicking off just after 00:00Z has
   receipts in two UTC date folders; the settler runs per folder, so 401874392, 401873300 and 401872962 each carry a
   second, per-date grade against a superseded receipt. *Correction (same session):* the owner's LIFETIME summary
   already de-duplicates by event ("later date wins" — the same forecast of record the ledger keeps), so the public
   lifetime record does not double-count; only the per-date files carry the extra grade. The ledger keeps only the
   forecast of record and names the superseded grade in `provenance.notes`.
2. **NFL experimental settlement never graded Week 2 (16 games, 2026-09-18 → 09-22) or five preseason games
   (08-21/22).** The settle step only revisits yesterday/today, and the results feed it reads is a rolling window; once
   the finals left the window, the `AWAITING_OFFICIAL_RESULT` rows were never revisited. The week reconciliation did
   grade Week 2, so `/results/nfl` shows it while the experimental lifetime record silently lacks it. Ledger rows for
   those games are honestly PENDING until the owner settles them (an allowed transition).
   *Status (Session 14 · Chunk 1, 2026-10-05):* fixed forward by #959 (official box-score fallback + pending sweep in
   `nfl-event-window`); runtime proof PENDING — no event-window run on a #959 SHA yet (Session 13 handoff §16).
