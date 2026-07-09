# Calibration Data Persistence + Shadow Calibration (2026-07-09)

**Status: data gap RESOLVED. Full per-prop calibration rows persisted; shadow artifacts built; NO public
recommendation or money changed.**

Follow-up to `docs/METHODOLOGY_UPGRADE_AUDIT_2026-07-09.md`, which flagged that true by-edge-bucket
calibration was blocked because the committed grading reports kept only aggregates + per-date extremes.
This pass closes that gap using data already in the repo.

Guardrails held: money md5 `affe6b21071f2b3be96bb2774eb347c3`, record 19-14, bankroll $19,065.40,
exposure $0 — all unchanged. Raw model-performance data stays separate from the official 19-14 record.

---

## Phase 1 — Data audit (the gap is resolvable from committed artifacts)

**What is persisted today**
- `public/data/mlb/results/settled_leans.jsonl` — **18,227 rows** (== `lifetime_summary.totalSettled`),
  one per settled prop: `date, gamePk, marketKey, playerName/Id, playerTeamAbbr, opponentAbbr, lean
  (side), line, edgePct, confidence, projection, actual, outcome`. This is the FULL per-prop ledger.
- `public/data/mlb/boards/<date>.json` — committed for the **full 2026-05-16 → 2026-07-09 range** (47
  boards, covering all 40 graded dates). Each lean carries `modelProbOver/Under`, `edgePctOver/Under`,
  `oddsOver/Under`, `impliedOver/Under`, `line`, `confidence`.
- `comparison_report_<date>.json` — per-date aggregates (`byMarket`, `byConfidence`) + top-8/bottom-8
  extremes. Useful, but NOT full per-prop.

**Per-prop field availability** (settled_leans joined to the board by the stable prop `id`):

| Field | Source | Coverage |
|---|---|---|
| date, gameId, market, player, team, side, line | settled_leans | 100% |
| edgePct, confidence, outcome, settledStat (actual) | settled_leans | 100% |
| modelProbability | board `modelProb{Over,Under}` for the leaned side | 100% |
| marketProbability | recovered: `modelProbability − edgePct/100` (de-vig-consistent) | 100% |

Verified: the settled_leans⟷board join is **100%** (18,227/18,227) with **100% prob recovery** across
all 40 dates. **Edge buckets are now computable on the whole population**, not just extremes.

**Only genuinely-missing field:** a per-prop `settledAt` timestamp (the ledger carries no per-row
time) — emitted as `null` honestly, never invented.

## Phase 2 — Full calibration rows (forward + full backfill)

`app/scripts/export-mlb-calibration-rows.mjs` (READ-ONLY re: money; deterministic; idempotent) joins
settled_leans ⟷ board and writes:

```
public/data/mlb/results/calibration/<date>.jsonl   # one MlbCalibrationRow per line
public/data/mlb/results/calibration/index.json      # dates + per-field coverage (deterministic)
```

Each row: `sport, date, gameId, eventName, market, playerName, team, opponent, selection, side, line,
marketProbability, modelProbability, projection, edgePct, confidence, outcome (win/loss/push),
settledStat, settledAt(null), sourceArtifact, id`. A field is emitted only when its source is present
(never fabricated). Determinism: no wall-clock — the index's `asOf` is the latest graded date, so
re-running on the same inputs reproduces byte-identical files (verified: identical md5 across re-runs).

**Result:** 40 dates · 18,227 rows · 17,599 decisive · 628 pushes · **100% coverage** on edgePct,
modelProbability, marketProbability, confidence. Full historical backfill — not forward-only.

## Phase 3 — Upgraded audit over the full rows

`app/scripts/audit-mlb-calibration.mjs` now reads the full rows and reports overall / by market / by
confidence / **by edge bucket (full population)** / market×confidence / market×edge (n-guarded) + push
rate + field coverage + sample guards (n<30 no-conclusion, 30–100 weak, ≥100 reportable).

**Findings (17,599 decisive):**
- **Edge is anti-calibrated** — claimed edge `<0` hits 51.8% but `20+pp` hits only **43.9%** (n=660).
  Bigger claimed edge → worse outcome, in **every** market. Raw edge must be discounted, not trusted.
- **Markets vary ~9pp** — batter_hits 53.8% (reliable) vs batter_total_bases 44.4% and
  pitcher_strikeouts 47.5% (net-negative).
- **Confidence tiers look inverted in aggregate** (High 49.6% ≤ Low 51.2%) — but market×confidence
  shows this is a **Simpson's-paradox** effect: within batter_hits, High (54.6%) *does* beat Low
  (53.3%); the aggregate inverts only because the High tier is overweight in the bad total_bases
  market. Lesson: calibrate per market, not on the global tier label.

## Phase 4 — Shadow calibration summary artifact

`app/scripts/build-shadow-calibration.mjs` → `public/data/mlb/results/shadow-calibration/latest.json`
(marked `public:false`). Per-market / per-confidence / per-edge-bucket hit rates + learned
`reliabilityWeight` + explicit `recommendations` (promote batter_hits; deemphasize total_bases,
strikeouts, and edge≥20pp; monitor tiers). Deterministic (`asOf` = latest graded date). Reuses the pure
`src/lib/calibration/mlb-reliability.ts` compute.

## Phase 5 — Unwired shadow-calibrated column for the current board

`app/scripts/build-shadow-calibrated-leans.mjs` → `data/internal/mlb/shadow-calibrated-leans/<date>.json`
(repo-root `data/internal/` — **NOT** under `app/public`, so the static export never serves it). For
each current lean it blends model→market by the learned reliability (pure `lib/calibration.calibrate`)
and derives a conservative `shadowTier`:
- raw edge ≥ 20pp (proven anti-calibrated zone) → **no-play**.
- reliability ≤ 0.3 or thin data → **no-play**.
- `lean`/`strong` require reliability ≥ 0.5 / 0.55 — so **strong** comes only from batter_hits and
  **lean** only from reliability-≥0.5 markets; net-negative markets cap at **watch**.

2026-07-09 board (360 leans): no-play 188 · watch 59 · lean 52 · strong 61. Most leans are no-play/watch
— the correct conservative outcome where the model hasn't earned trust. This is **not** live confidence,
**not** public, and **not** used in product-card generation (enforced by a test).

---

## What did NOT change

No projection/edge/confidence/selection/product-card formula. No public page. No money file. The
calibration rows + shadow artifacts are internal/dev inputs for the founder-gated, backtested rollout
described in `docs/SHADOW_CALIBRATION_BACKTEST_PLAN_2026-07-09.md`.
