# Model Audits Index

Every model / settlement / calibration / quality audit, newest first. The
through-line: **the model's `edgePct`/`confidence` are not predictive; the
honest response is discipline + tracking, not edge claims.**

## Current sprint (2026-06-02)

| Doc / PR | What it found |
|----------|---------------|
| [`MODEL_RECALIBRATION_SHADOW_2026-06-02.md`](./MODEL_RECALIBRATION_SHADOW_2026-06-02.md) (shadow study) | Recalibrated the projection→probability step (σ-scale + projection shrink), evaluated leave-one-day-out. **Fixes calibration** (OOS Brier 0.275→0.244, the model is ~2.3–3.8× overconfident) but **does NOT beat the market OOS** (0.2444 vs 0.2436; 1/5 folds). **Kept SHADOW — not wired.** Not a hit-rate claim. |
| [`VOLUME_DISCIPLINE_2026-06-02.md`](./VOLUME_DISCIPLINE_2026-06-02.md) (#241) | Anti-overpublishing: cap public cards 16→≤9/slate + honest empty states. **Not a hit-rate claim.** |
| [`MODEL_CALIBRATION_2026-06-02.md`](./MODEL_CALIBRATION_2026-06-02.md) (#240) | 217 settled legs: `edgePct` **anti-predictive** (top-edge 49% vs bottom 57%); `confidence` non-predictive; **market implied is the only separating signal**; model overconfident (Brier ≈ coin-flip). Not a code bug. |
| [`MODEL_AUDIT_2026-06-02_PARLAY_QUALITY.md`](./MODEL_AUDIT_2026-06-02_PARLAY_QUALITY.md) (#238/#239) | Pipeline audit + June-1 failure analysis; shadow audit showed proposed gates **cut volume but didn't improve hit rate**. |

## June-1 failure (the trigger)

- June-1 public slips **1W / 47L (2.08%)**; single-leg 152W/154L (49.67%);
  0 pending. Recorded in
  [`LEARNING_NOTES_2026-06-01_SETTLEMENT.md`](./LEARNING_NOTES_2026-06-01_SETTLEMENT.md)
  — one cold low-offense slate **amplified** by overpublishing + heavy "Over"
  / same-market correlation. Observational only; nothing wired.

## Prior audits / learning (in place)

| Doc | Topic |
|-----|-------|
| [`LEARNING_NOTES_2026-05-30_SETTLEMENT.md`](./LEARNING_NOTES_2026-05-30_SETTLEMENT.md) | May-30 settlement learning |
| [`LEARNING_NOTES_2026-05-29_SETTLEMENT.md`](./LEARNING_NOTES_2026-05-29_SETTLEMENT.md) | May-29 settlement learning |
| [`QUALITY_NOTES_2026-05-30_SLATE.md`](./QUALITY_NOTES_2026-05-30_SLATE.md) | May-30 slate quality notes |
| [`MODEL_AUDIT_2026-05-25.md`](./MODEL_AUDIT_2026-05-25.md) | Early model audit (pre-public-era) |
| [`AUDIT_INFORMED_OPTIMIZER_NOTES_2026-05-28.md`](./AUDIT_INFORMED_OPTIMIZER_NOTES_2026-05-28.md) | Audit-informed optimizer notes |
| [`MODEL_LEARNING_LOOP.md`](./MODEL_LEARNING_LOOP.md) | The demotion-only confirmed-signal learning loop design |
| [`MODEL_LEARNING_ROADMAP_2026-05-28.md`](./MODEL_LEARNING_ROADMAP_2026-05-28.md) | Learning-loop roadmap |
| [`PARLAY_LEG_QUALITY_GATES.md`](./PARLAY_LEG_QUALITY_GATES.md) | Per-leg quality-gate design (mirror of Python `is_eligible`) |
| [`PARLAY_METHODOLOGY.md`](./PARLAY_METHODOLOGY.md) | Parlay construction methodology |
| [`PARLAY_LAB_PRODUCT_AUDIT_2026-05-28.md`](./PARLAY_LAB_PRODUCT_AUDIT_2026-05-28.md) | Parlay Lab product audit |
| [`PUBLIC_QA_AUDIT.md`](./PUBLIC_QA_AUDIT.md) · [`UI_UX_AUDIT.md`](./UI_UX_AUDIT.md) · [`UI_UX_AUDIT_2026-05-27.md`](./UI_UX_AUDIT_2026-05-27.md) | QA / UX audits |

Reproducible offline analyses: `cd app && npx tsx
scripts/model-calibration-analysis.mjs` (and `shadow-audit-quality-gates.mjs`,
`shadow-volume-discipline.mjs`, `shadow-projection-recalibration.mjs`).

## Projection→probability recalibration — studied (shadow), NOT wired

The recalibration proposed by #240 has now been **run offline, shadow-only**
([`MODEL_RECALIBRATION_SHADOW_2026-06-02.md`](./MODEL_RECALIBRATION_SHADOW_2026-06-02.md)).
Outcome: σ-widening recalibrates the overconfident projection→probability
step (OOS Brier 0.275 → 0.244) but the recalibrated probability **does not
beat market-implied probability out-of-sample** (leave-one-day-out: pooled
0.2444 vs 0.2436; 1/5 folds). Per the decision rule, it is **kept
shadow/observational and not wired.** Next: more settled history, a
de-vigged market baseline, and (only if it then beats the market OOS) a
market-anchored blend behind a `/results` shadow column for ≥2 weeks before
any live decision. **The selection signal remains market-implied
probability, not model edge.** Approval-gated; see `MODEL_AND_OPTIMIZER.md`.

## Honest bottom line for diligence

The public-era hit rate is **poor and tracked transparently**; the model
does **not** currently demonstrate predictive edge over the market. No
public performance claim is made or should be made.
