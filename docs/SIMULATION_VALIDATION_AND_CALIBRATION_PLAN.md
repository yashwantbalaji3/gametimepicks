# Simulation Validation & Calibration Plan

**Status:** PLAN ONLY (Phase 6 of the July-8 overnight roadmap). No settlement integration is implemented here. This document defines how, in a later phase, the deterministic game-simulation outputs (see [`GAME_SIMULATION_ARTIFACT_SPEC.md`](./GAME_SIMULATION_ARTIFACT_SPEC.md)) will be compared against official results to measure and calibrate the model — without ever touching canonical money or fabricating data.

Everything here is **paper-only / educational**. The simulation is a model read, not a wager; validating it changes no bankroll, no crown, no record.

---

## 1. What we are validating

Each persisted artifact `public/data/{sport}/game-simulations/YYYY-MM-DD.json` carries, per game, a set of `generatedPicks` (market + side + line + `modelProbability` + `edgePct` + `confidence` + `riskTier`), plus optional sampled `distributions` and an honest `unavailableModules` list. Validation asks one question per pick: **did the model's stated read agree with the official result?** — and aggregates that into calibration signals.

This is a *forecast-evaluation* problem, not a bankroll problem. We measure the model's discrimination and calibration; we do **not** stake money on these picks.

## 2. Storing the prediction (the immutable prediction of record)

- The artifact is already immutable-by-construction: `artifactHash` is a stable hash of the games payload (excluding `generatedAt`), so a prediction can never be silently rewritten after the fact.
- The validator stores, per date/sport/`modelVersion`/`simulationVersion`, the **pre-game** artifact as the prediction of record. Grading must read the artifact that existed **before** kickoff — never a regenerated post-hoc one. Enforce by asserting the graded artifact's `sourceBoardHash` matches the board that was live pre-game.
- A future `public/data/{sport}/game-simulations/validation/YYYY-MM-DD.json` (display-only) would hold the graded outcome per pick. It is **separate** from the artifact and from all money ledgers.

## 3. Comparing to official results (reuse the existing official-settlement path)

- **Source of truth:** the SAME official feed the product already settles from — `pipeline/fetch_official_soccer.py` (soccer) and the MLB Stats API / box-score inputs (MLB). Never web snippets, never in-play data. Official finals only.
- **Grading engine:** reuse `app/src/lib/settlement/soccer-markets.ts` (soccer) and the MLB grading path — the same `gradeLeg` / player-line matching (accent-insensitive `norm`, matchId scoping) that the WC-Specials join repair hardened (Phase 2). Do **not** write a second grader.
- **90-minute / regulation policy** applies identically: soccer team markets settle on the 90' score (FT/AET/PEN), player props pend on AET/PEN unless a 0-count makes the outcome certain — mirroring the product's knockout policy.
- A pick grades to `hit` / `miss` / `pending` / `void`. **`pending` is never a loss** and never a hit; an `unavailable` module never grades at all.

## 4. Per-pick hit/miss tracking

For every graded pick record: `date`, `sport`, `gameId`, `market`, `player?`, `line`, `side`, `modelProbability`, `edgePct`, `confidence`, `riskTier`, `result` (hit/miss/pending/void), and the official value it was graded against (e.g. actual strikeouts vs the line). Keep the `sourceFields` provenance so every graded pick is traceable to the real board fields it came from.

## 5. Calibration metrics (what "good" means)

- **Calibration (reliability):** bucket picks by `modelProbability` (e.g. 50-55%, 55-60%, …). Within each bucket, the realized hit rate should track the bucket's stated probability. Plot/measure the reliability curve + Brier score. A model that says "70%" and hits ~70% is calibrated.
- **Discrimination:** does higher `edgePct` predict a higher realized hit rate? Rank picks by edge decile and check monotonicity + lift over market-implied.
- **Confidence buckets:** evaluate `confidence` (High/Solid/Lean) and `riskTier` (anchor/value/etc.) independently — high-confidence picks should out-hit low-confidence ones.
- **Market families:** segment by `marketKey` (e.g. `pitcher_strikeouts`, `batter_hits`, soccer `moneyline_90`, `double_chance`, `match_total_goals`). Track hit rate + calibration per family; some families are inherently noisier (see §7).
- **Sampled-distribution check (Option-A honesty):** for sampled props, compare the artifact's sampled over-rate to the realized outcome frequency over many games. The seeded sampler is only as good as `projection`/`sigma`; this loop reveals whether those inputs are well-calibrated.

## 6. Drift detection

- Track rolling-window calibration (e.g. last 14/30 days) per market family. A sustained gap between stated and realized probability = **drift**.
- Watch for `simulationVersion` / `modelVersion` boundaries: never blend calibration across versions without labelling — a version bump can legitimately reset the curve.
- Flag families where the reliability curve degrades or the Brier score rises beyond a threshold, for human review.

## 7. What NOT to do (small-sample discipline)

- **Do not tune model weights on a handful of games.** A single slate (n≈40 picks) is far too small; one loud result is noise. Require a meaningful sample per bucket/family (rule of thumb: ≥50-100 graded picks in a bucket before drawing a conclusion) and prefer several weeks of data.
- **Do not overfit to the tail.** Longshot/high-variance families (WC player props ~8% hit; NBA 3PM/PRA/STL/BLK historically unsettleable/noisy) will always look streaky — down-weight, don't chase.
- **Do not retro-fit the prediction.** Grade the pre-game artifact only; never regenerate-then-grade.
- **Do not fabricate** a graded value when official data is missing — mark it `pending`/`unavailable`, exactly as the product does.

## 8. Feeding the model review (Cowork / Sports Ops)

- The validation output is an **input to a human/agent model review**, never an automatic weight change. Surface: reliability curves, Brier scores, per-family hit rates, drift flags, and the specific mis-calibrated buckets.
- Any weight change is a deliberate, reviewed, version-bumped action (new `modelVersion`), documented — consistent with the existing "don't overfit n=1, reliability from the settled ledger" discipline already used for the Bank Builder proposal weights.

## 9. How this differs from Bank Builder accounting

| | Bank Builder ladder | Simulation validation |
|---|---|---|
| Touches canonical money | YES (bankroll/crown/record) | **NO — display-only** |
| Unit | one placed paper card / rung | one model pick (no stake) |
| Outcome | won/lost step moves the ladder | hit/miss updates a calibration curve |
| Source of truth | the operator-approved card + ladder | the immutable pre-game artifact |
| Purpose | track the $100→$10K paper run | measure model calibration/discrimination |

The two share the **official grading engine** and the **pending-is-not-a-loss** rule, but the simulation-validation ledger is entirely separate from `portfolio.json` / the crown ladder / the record. Money md5 must stay unchanged by any validation run.

## 10. Pending / unavailable handling

- `pending` picks (data not yet final, or AET/PEN under the regulation policy) are excluded from calibration until they resolve — never counted as hit or miss.
- `unavailable` modules (scoreline distribution, xG, corners, cards, first-scorer for MLB; any prop lacking `sigma`) are never graded and never inflate or deflate a metric. The reliability curve is computed only over genuinely graded picks.

## 11. Paper-only framing (non-negotiable)

Every surface built on this stays labelled **paper-only / educational**, uses the honest language from the artifact spec ("model simulation", "N-run" only when `runCount` is a positive int, no "Monte Carlo", no guaranteed/lock/safe), and never implies a wager. Validation is about model quality, not returns.

---

### Implementation phases (future, not done here)
1. Persist the pre-game artifact as the prediction of record (already immutable via `artifactHash`).
2. A display-only grader that maps `generatedPicks` → official results through the existing settlement engine, writing `game-simulations/validation/*.json` (never money).
3. Calibration aggregation (reliability curves, Brier, per-family) + drift flags.
4. A read-only review surface (like `/ops`) summarizing calibration — no auto weight changes.
