# Model & Optimizer

> **Honesty note:** per the 2026-06-02 calibration audit, the model's
> `edgePct` and `confidence` signals are **not predictive** (edge is
> anti-predictive). They are **not** used as live quality gates and must
> **never** back a user-facing win-rate claim. This document records what
> the model does, what the audits found, and what must not be claimed.

## Projection model (NBA + MLB only)

- For each player/market/line, the model produces a point `projection`, a
  model probability (`model_over_probability(projection, line, sigma)` in
  `pipeline/mlb/mlb_model.py`), an `edgePct = (model_prob − implied_prob) ×
  100`, and a `confidence` tier **binned from `edgePct`**
  (High/Medium/Low). Inputs: player stats, `recent10`/`recentSeries` (DNP
  guards), The Odds API lines, per-market consensus, calibration factor.
- Markets: NBA `PTS/REB/AST`; MLB `batter_hits / batter_total_bases /
  batter_hits_runs_rbis / pitcher_strikeouts`.

## Parlay optimizer & risk sections

- `pipeline/parlay_optimizer.py` qualifies a leg pool (per-profile
  eligibility gates) and greedily assembles slips with correlation caps (no
  duplicate players; same-game ≤2; same-team per profile; volatile-MLB ≤3;
  anomaly ≤1; a market-diversity re-rank bonus).
- **Public risk sections** (`generate_public_risk_sections`) are defined
  **purely by combined American odds + leg count**: Low `<+300` (2–3 legs),
  Medium `+300…+599` (3–4), High `+600…+999` (4–5), Longshot `≥+1000`
  (5–6). **Every public-section leg passes only the loose *Aggressive*
  eligibility gate** — so "Low Risk" is a **payout-class label, not a
  per-leg quality tier**. (`app/src/lib/leg-quality-gates.ts` documents this:
  `PUBLIC_SECTION_LEG_GATE_TODAY = aggressive`.)
- Per-section odds + size ordering **is** honest (combined-odds math): Low >
  Medium > High > Longshot in slip hit rate.

## Confidence / edge lineage

`projection` + `sigma` → `model_prob` → `edgePct = model_prob − implied` →
`confidence` (binned edge) → `legScore` (weighted edge + confidence +
recent10 + pid + star + a static `MARKET_STABILITY_WEIGHT`). See the field
lineage table in `MODEL_CALIBRATION_2026-06-02.md`.

## What the audits found

- **#239 (shadow audit):** the proposed per-section leg-quality ladder cut
  volume ~51% but **did not improve hit rate** (slip 13%→10%, leg 50%→48%).
- **#240 (calibration audit, 217 settled public-era legs):**
  - **`edgePct` is anti-predictive** (top-half-edge legs 49% vs bottom 57%).
  - **`confidence` is non-predictive** (just binned edge; High 53% ≈
    overall; high-avg-confidence slips hit *lower*).
  - **Market implied probability is the only separating signal** (top-half
    60% vs bottom 46%); selected legs **underperform** their implied price
    (Brier ≈ 0.24, ~coin-flip).
  - **Root cause:** the model's probability is **overconfident** — its
    biggest "edges" are where the projection most diverges from an efficient
    market and is most wrong. **Not a code bug** (the edge formula is
    correct; the inputs are mis-calibrated).
- **#241 (volume discipline):** the only safe, evidence-supported product
  move — publish **fewer, less-repetitive** cards + honest empty states. See
  `VOLUME_DISCIPLINE_2026-06-02.md`.

## `audit/policy.json` status — proposed-only / unconsumed

The learning loop (`audit_daily.py` → `audit_signal_policy.py`) computes a
demotion-only, 3-confirming-day policy and writes `audit/policy.json`. **The
optimizer never reads it** (weights are hard-coded `MARKET_STABILITY_WEIGHT`);
`/results` renders signals as **"confirmed-not-consumed."** Consuming it
requires explicit operator approval + the documented promotion path. **Do
not wire it without instruction.**

## Inert, tested proposals (NOT wired)

- `leg-quality-gates.ts::PROPOSED_SECTION_LEG_GATES` (per-section leg ladder).
- `parlay-decorrelation.ts::PROPOSED_SECTION_DECORRELATION_CAPS` (slip
  decorrelation caps).
Both are pure + tested but **not** consumed by selection; the #239/#240
evidence does not support wiring them as quality improvers.

## Projection-recalibration study — done (SHADOW), NOT wired

The recalibration of the **projection→probability** step has now been run
**offline, shadow-only** (leave-one-day-out over the 217 settled public-era
legs). See
[`MODEL_RECALIBRATION_SHADOW_2026-06-02.md`](./MODEL_RECALIBRATION_SHADOW_2026-06-02.md);
reproduce with `cd app && npx tsx scripts/shadow-projection-recalibration.mjs`.

- **The projection→probability step is materially overconfident** — `sigma`
  is ~**2.3–3.8× too tight**. Widening it (σ-scale, plus a gentle
  projection-toward-line shrink) cuts the model's **out-of-sample Brier from
  0.275 → 0.244** (from worse-than-coin-flip to ≈ market).
- **But the recalibrated probability does NOT beat the market
  out-of-sample** (pooled OOS Brier 0.2444 vs market 0.2436 — and the market
  baseline still carries vig, so the true bar is harder; recal wins only 1/5
  day-folds; fitted σ-scale is unstable across folds).
- σ/λ recalibration is ~monotone in the model's own ranking, so it fixes
  **calibration**, not **discrimination** — the model still adds no reliable
  edge over the market. The apparent +17pp vs +13pp separation is
  **parasitic on the market line** (model_prob ≈ implied + an
  anti-predictive edge), not independent skill.

**Decision (per the rule "wire only if recalibrated beats the market
out-of-sample"): kept SHADOW / observational. Nothing wired.** Recalibrating
is a real calibration fix but is **not** a reason to wire and is **not** a
hit-rate claim. The selection signal remains **market-implied probability**.
Next steps (more settled history; de-vigged market baseline; a market-anchored
blend behind a `/results` shadow column for ≥2 weeks) are **approval-gated** —
pause for operator approval before any live wiring.

## What must NOT be claimed publicly

- No guaranteed/target hit rate (no "70%", no "lock", no "can't miss").
- Do not present `edgePct`/`confidence` as implying a higher win
  probability — the data says the opposite.
- "Lower-variance", never "safe". Fewer cards is a discipline choice, **not**
  a performance claim.

*See [`MODEL_AUDITS_INDEX.md`](./MODEL_AUDITS_INDEX.md) for the full audit
trail.*
