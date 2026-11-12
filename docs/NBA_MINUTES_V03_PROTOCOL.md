# NBA minutes: v0.3 vs official v0.1 — final protocol (FROZEN DRAFT, awaiting founder approval of this file's hash)

**Status: FROZEN, NOT APPROVED. Nothing is promoted, and the official pipeline is unchanged.** 2026-11-12,
forecast-guard (engine), founder-authorized finalization of `docs/NBA_MINUTES_V03_VS_V01_PREREGISTRATION_DRAFT.md`
(sha256 `90f7da12…3268`, which this file supersedes).

**How approval is recorded:**
- The file's sha256 goes in `APPROVED_PROTOCOL_SHA256`, and the approval instant in `PROTOCOL_APPROVED_AT`
  (`app/src/lib/sports/nba/minutes-v03-prereg.mjs`).
- The scorer (`app/scripts/nba/research/score-nba-minutes-v03-prereg.mjs`) refuses an unapproved or changed file.
- `minutes-v03-prereg.test.mjs` pins this file's bytes to `PROTOCOL_DRAFT_SHA256`. Any edit is a new registration.

The drafter has seen exploratory results, so **every number below is copied from an approved document and cited. No
constant is new.**

## 1. Candidate and reference (exact code)
Both families are already built nightly by `.github/workflows/nba-forecast-window.yml`. v0.3 is frozen with the same
`--now` as v0.1 (`alignsWith: "v0.1"`) and stays a CHALLENGER family. Code at origin/main `a03123fd00`:

| Role | Family / model | Files (sha256 of the file at a03123fd00) |
|---|---|---|
| **Candidate** | `v0.3`, `nba-experimental-v0.3-role-minutes`, minutes rule `nba-minutes-model-v0.3-role-prior`, pool `nba-roster-gated-pool-v0.3` | `minutes-model-v03.mjs` `4819ce41…bec7`; `game-sim-v03.mjs` `1b8aac60…b82e` |
| **Reference (official)** | `v0.1`, `nba-preseason-experimental-v0.1`, minutes rule `nba-minutes-model-v0`, game-sim rescale | `minutes-model.mjs` `aca9af24…ef54`; `game-sim.mjs` `e88db872…1267` |
| Shared | family registry and roster gate | `experimental-forecast.mjs` `f9b3b4df…c8030`; `roster-gated-pool.mjs` `b156ff17…59ac` |

**v0.3 features (frozen; no rule or constant may change, and any change is a new version with its own shadow):**
- the prior-season role (whole prior regular season, by athlete, across teams), blended toward the current regular
  season with the prior worth `PRIOR_GAMES = 10` appearances;
- play rate from coach's-decision DNPs only;
- team normalisation by play-rate water-fill on minutes^1.25 (`MINUTES_POWER`, v1's frozen constant);
- `MIN_GAMES_FOR_RATES = 3`;
- population: regular season and the cup final only.

The exploratory hint that the prior weight is too heavy late in a season is **not** acted on.

## 2. Development vs untouched evaluation data
- **Development (never confirmatory):**
  - the corpus seasons 2023-24 → 2025-26;
  - every 2026-27 game frozen at or before the approval instant.
  - That explicitly includes the **146 exploratory games of 2026-10-20 → 11-11** (1,210 primary rows). They shaped this
    protocol, so they are **excluded** from confirmatory evidence.
- **Confirmatory:** games whose v0.1 AND v0.3 forecasts were both frozen (`forecast.inputAsOf`) **strictly after**
  `PROTOCOL_APPROVED_AT`, at the same `--now`, strictly before tip-off, and that have a final box score
  (`confirmatoryGame`).

## 3. Unit
Regular-season player-games where the player **played** (minutes > 0 in the final box score), and the player is in at
least one model's available pool for that game.

## 4. Sample-size minimums (single look)
- Both must hold before the look:
  - **≥ 300 confirmatory games** (V18 §6 game minimum; prereg v2 §7);
  - **≥ 1,500 primary player-games** (V18 §6 points/rebounds/assists minimum).
- Below either, the verdict is INSUFFICIENT_N, and the scorer writes counts only (`progress.json`, no metric), so
  nobody can peek.
- The first run at or past both minimums writes `look.json`, write-once. There is no second look without a new
  protocol.
- Timing (an estimate, not a commitment): at about 7–8 games a night, roughly 6 weeks after approval.

## 5. Metrics
- **Primary:** the paired mean, over primary rows (expectedMinutes ≥ 20 in BOTH models, the v0.3 arming text), of
  |v0.3 − actual| − |v0.1 − actual|.
  - Game-clustered percentile bootstrap, B 2000, seed 20261020 (`bootstrap.mjs`). Lower favours v0.3.
- **Secondary (reported, never a verdict):**
  - the same difference over all played rows;
  - MAE of each model;
  - coverage (the share of played rows each model projected);
  - per-subgroup differences (§7);
  - the rotation-change slices (§8).

## 6. Acceptance and no-harm (verdict rules, in order)
| Verdict | Rule |
|---|---|
| INSUFFICIENT_N | a §4 minimum is not met |
| REJECT | the primary CI lower bound is > 0 (v0.3 worse), **or** any no-harm failure |
| PROMOTE_CANDIDATE | the primary CI upper bound is < 0 **and** v0.3 minutes MAE on the primary rows is ≤ **6.0** (V18 §7 points-family bar) **and** no no-harm failure |
| INCONCLUSIVE | otherwise |

**No-harm** (thresholds are 0 or copied; none is new):
- (a) In no role subgroup with ≥ **100** paired rows (V18 §6 slice minimum) is v0.3 significantly worse: subgroup CI
  lower bound > 0.
- (b) v0.3's coverage of played players is not below v0.1's.

**A PROMOTE_CANDIDATE verdict is an input to a founder decision, never a promotion** (prereg v2 §4). Promotion then
follows the normal route:
- a founder-approved promotion record (PR 1154 READY_FOR_FOUNDER_REVIEW);
- the release gate;
- the cross-product rule: site, social and grading switch together on one date, history stays graded under the
  version that was published, and no frozen forecast is edited.

## 7. Role subgroups
Pregame tags, overlapping, frozen in `app/src/lib/sports/nba/minutes-player-types.mjs`:
- star;
- starter;
- bench;
- rookie;
- traded;
- returning (missed ≥ 3 team games);
- promoted (started 2 of the last 3 after < 20% starts before).

Each is reported. Each one with ≥ 100 rows is gated only by no-harm (a). No subgroup can promote on its own; that would
be multiplicity.

## 8. Injury and rotation-change evaluation
- **Reported:**
  - the "returning" and "promoted" subgroups;
  - every player-game in a game that carries a post-freeze availability change
    (`app/public/data/nba/post-freeze-availability/<date>.json`, the #1323 record of Outs stated after the freeze).
- **Gated only through no-harm (a).** Both models see the same frozen availability, so a post-freeze Out is a shared
  information gap, not a model error. Those players DNP and leave the played unit on both sides alike.

## 9. Missing data
- **Missing family.** A game missing either family, or frozen at or after tip, or not aligned (different `--now`), is
  excluded and counted by reason. It is never imputed.
- **Projected by one model only.** A played player projected by only one model is a coverage miss (secondary and
  no-harm (b)). He is not in the paired primary.
- **DNP.** A player who did not play is outside the unit for both models; both estimate minutes conditional on playing.
- **No final.** A game without a final box score is PENDING until it has one. Nothing is graded from a partial record.

## 10. Reproducibility and leakage checks
- **Pinned inputs.** Inputs are the committed frozen forecasts (`experimental-v0.1/`, `experimental-v0.3/` forecasts),
  the committed box scores (`experimental/boxscores/`) and the committed post-freeze files. The look records the
  protocol sha256 and the approval instant.
- **Leakage.** Every forecast must be frozen strictly after approval and strictly before tip-off (checked per game). The
  scorer reads no box score dated after a game except that game's own final.
- **Determinism.** The look re-derives byte-for-byte from the same commit (a test pins it). There is no wall clock in
  any output.
- **Pinning tests.** `minutes-v03-prereg.test.mjs` pins:
  - this file's hash;
  - the refusals (unapproved, changed file, look already taken, pre-approval freeze, unaligned, pre-tip, pending final);
  - the verdict rules on synthetic rows.

## 11. Promote / reject criteria (summary)
- **Promote path:** PROMOTE_CANDIDATE, then the founder's decision, then the normal approval and release.
- **Reject:** v0.3 stays a challenger shadow. A revised rule is a new version string with its own protocol.
- **Inconclusive:** no promotion and no second look. A new protocol is required for any further test.
