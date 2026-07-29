# MLB Variance/Shrinkage Program — FINAL PREREGISTRATION

**Program:** 058–061 Lane C · **Date registered:** 2026-07-29 · **Registered before any protocol scoring** (see git history: this document commits before the runner and before any results).
**Status at registration:** the corpus is frozen; no experiment defined here has been scored under this protocol.

## 1. Primary hypothesis

The MLB player-prop simulator understates outcome variance (distributions too narrow), inflating |z| and therefore overstating probabilities away from even money. Correcting the variance in z-space — globally or per market — recovers honest probabilities and *may* close the gap to the de-vigged sportsbook baseline.

**Mechanism claim:** understated simulation variance (Sprint 056 signature: |error| 5.86pp near even vs 26.84pp far; Sprint 057 fitted global k = 2.8).

## 2. Corpus freeze

- Loader: `loadRows()` from `app/scripts/model-learning-audit.mjs` (ledger-dated, de-vigged, decisive two-way rows only).
- Frozen population: **21,633 rows · 50 dates · 2026-05-16 → 2026-07-27** (per-date counts recorded by the runner in its JSON output; fingerprint = SHA-256 of the sorted row serialization, emitted at run time).
- **No settlement row dated after 2026-07-27 may enter this protocol.** Future rows belong to the (separately authorized) live shadow phase only.

## 3. Windows (ledger dates; no slate straddles a boundary)

| Window | Dates | Rows |
|---|---|---|
| TRAIN | ≤ 2026-06-24 | 14,938 |
| VALIDATION | 2026-07-01 → 2026-07-11 | 3,721 |
| UNTOUCHED TEST | 2026-07-21 → 2026-07-27 | 2,974 |

Rows are keyed by ledger settlement date, so a late-night game cannot straddle windows. The corpus has natural gaps (06-25→06-30, 07-12→07-20) which the boundaries respect.

**Contamination disclosure (mandatory honesty):** Sprints 056–057 scored 2026-07-01→07-27 as one aggregate held-out window. The TEST window above was therefore *seen inside prior aggregates* but never used to fit parameters. Mitigations: all thresholds below are declared before scoring; candidate selection uses VALIDATION only; and no deployment claim may rest on this protocol alone — only the live shadow phase (§9) can confirm.

## 4. Candidates (fit on TRAIN only; selection on VALIDATION only; scored ONCE on TEST)

| ID | Candidate | Constraint |
|---|---|---|
| C1 | Global variance widening p′ = Φ(Φ⁻¹(p)/k), k ∈ 1.00–4.00 step 0.05 | fit on train only |
| C2 | Per-market variance widening with shrinkage toward global: k_m = (n_m·k̂_m + λ·k̂_g)/(n_m + λ), λ = 1,000; markets with < 500 train rows use global k | min-sample + shrinkage declared here |
| C3 | Probability shrinkage toward 0.5: p′ = 0.5 + s(p − 0.5), s ∈ 0.00–1.00 step 0.02 | no market information |
| C4 | Shrinkage toward de-vigged market: p′ = w·p + (1−w)·q, w ∈ 0.00–1.00 step 0.02 | **hybrid — explicitly reduces model independence; informational only; cannot ratify parity or superiority** |
| C5 | Variance widening (train k) then Platt (fitted on transformed train) | no refit on validation/test |
| C6 | Market-only control p′ = q | canonical no-vig pairing benchmark |

**Controls:** the framework self-test must pass in the same run (synthetic variance defect recovered; noise model refused; genuine incremental signal detected). A run whose self-test fails is void.

## 5. Selection rule

The **selected-independent candidate** is the one among {C1, C2, C3, C5} with the lowest VALIDATION Brier. It alone carries the decision. All candidates are still reported on TEST for transparency; those numbers cannot be used to re-select.

## 6. Metrics

- **Primary:** Brier score on TEST vs C6 (de-vigged market) on identical rows.
- **Secondary:** log loss; mean predicted vs observed (calibration honesty); per-market Brier; per-sub-window Brier (three TEST sub-windows: 07-21→07-23, 07-24→07-25, 07-26→07-27).

## 7. Decision thresholds (exact, declared now)

Let B_sel = selected candidate TEST Brier, B_mkt = market TEST Brier, B_raw = raw model TEST Brier.

- **OUTPERFORMS_MARKET:** B_sel ≤ B_mkt − 0.0010, AND better than market in ≥ 2 of 3 TEST sub-windows, AND still ≤ B_mkt when any single market family is excluded (not driven by one segment).
- **REACHES_PARITY:** |B_sel − B_mkt| ≤ 0.0010 AND |mean predicted − observed| ≤ 1.5pp on TEST. (Only independent candidates C1/C2/C3/C5 may claim this; C4 reaching market parity is expected by construction and means nothing.)
- **IMPROVES_MODEL_ONLY:** B_sel ≤ B_raw − 0.0020 AND B_sel > B_mkt + 0.0010.
- **REJECT:** anything else, or instability (worse than raw in any sub-window).

A 0.0002-level improvement, or performance achieved only where the model copies the market, is **not** a predictive breakthrough (program rule §7.4).

## 8. Stopping rule (binding)

If the selected-independent candidate lands **IMPROVES_MODEL_ONLY** or **REJECT**: the independent sportsbook-beating model objective is **SUSPENDED**. The simulator remains research content (distributions, calibration honesty, disagreement analytics). Model R&D may only reopen via (a) a new preregistered protocol on data that does not exist yet, or (b) the live shadow phase (§9) producing evidence at these same thresholds.

## 9. Deployment prohibition & shadow phase

Nothing from this protocol replaces public or production probabilities in Program 058–061. If any candidate reaches REACHES_PARITY or better, it may be wired as a **shadow artifact only** (versioned candidate manifest, internal), accumulating forward-only live rows for a future decision. Founder review is required for any public change.

## 10. Per-market decisions (mapping declared now)

For each market family, using the selected-independent candidate on TEST:

- family TEST rows < 300 → **INSUFFICIENT_EVIDENCE**
- full-corpus hit-rate 95% CI entirely below 50% → **DISABLE_PREDICTION** (batter_total_bases already meets this)
- family Brier(selected) ≤ family Brier(market) − 0.0010 → **CONTINUE_R&D**
- otherwise → **RESEARCH_CONTENT_ONLY**
