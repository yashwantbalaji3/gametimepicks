# Model learning roadmap (2026-05-28)

Last updated: 2026-05-28 (PR `feature/model-learning-roadmap`).

This doc states honestly what the optimizer does today, what it has
already changed in response to previous mistakes, and the realistic
sequence of improvements ahead. The goal is to walk a path from
deterministic rules → statistical calibration → genuine machine
learning **without overclaiming** at any step.

> **Hard claim discipline.** We do not say "AI", "deep learning",
> "machine learning", "the model learned", or "neural network" is
> active until code, training data, and out-of-time evaluation back
> it up. Until then, every roadmap item below is exactly that —
> roadmap, not feature.

---

## 1. What the optimizer uses today

For every leg the pipeline already evaluates:

- **Projection edge** (clipped at 15pp post-PR #110 — the empirical
  reliability collapses past that cap).
- **Confidence tier** (High / Medium / Low) sourced from the
  per-prop projector.
- **`recent10Count`** (the actual count of stored recent values,
  not a fabricated assumption of availability).
- **`recentSeries`** numeric values used for volatility-aware
  weighting.
- **`starTier`** (none / regular / core / superstar) sourced from a
  curated registry, used as a transparent tiebreaker.
- **Market** (NBA: PTS / REB / AST; MLB: hits / total bases /
  hits+runs+RBIs / home runs).
- **Per-(sport, market) stability weight** sourced from the live
  audit (`audit/policy.json`).

At slip-build time the optimizer additionally enforces:

- **Risk-profile leg counts** (Conservative 2, Balanced 3,
  Aggressive 4, Star Power 3).
- **Public risk sections** (Low / Medium / High / Longshot — strict
  both-odds-AND-leg-count gate, PR #152).
- **NBA single-game support with diversity** (PR #150).
- **Mixed sport eligibility** with explicit "single-sport when
  honest" gates.
- **Same-game caps** to suppress correlation.
- **`require_recent10` guard** for the Conservative path so a leg
  without box-score presence can't enter that lane.

The numbers are saved before games (`/data/parlays/optimizer/<date>.json`)
and graded after games (`/data/parlays/optimizer/graded/<date>.json`).
Settlement never reaches back into the saved pregame file — that
file is the auditable record of what we recommended.

---

## 2. Mistakes the model has already learned from

Each row below names a previously observed failure and the
deterministic, code-level fix already in production. None of these
are "the model trained on past results" — they're disciplined
guardrails added after a postmortem.

| Observation | Where | Code-level fix |
|---|---|---|
| Stacked NBA single-game public slips going 1W-23L on 5/25 | `audit/lifetime_summary.json` | Public single-game cap (`_PUBLIC_SECTION_MAX_LEGS_PER_GAME = 2`); explicit "Single-game · higher variance" chip. |
| Longshot lanes dominated by 5+ leg combos with no edge | UI repetition reports | Public Longshot now strictly requires combined odds ≥ +1000 AND 5–6 legs (PR #152); never relabels mismatched slips. |
| Aggressive Conservative gate would let unverified legs through | `audit_signal_policy.py` | `require_recent10` for Conservative; DNP guard for NBA `<7` recent10 in Conservative. |
| MLB volatile markets over-represented in Aggressive | Daily audit | `_MLB_VOLATILE_MARKETS` set + `marketStabilityWeight` discount. |
| Keldon Johnson appearing in every NBA single-game slip | SGP repetition complaint | `_select_diverse_sgp` PR #150 — exposure penalty + cross-slip pair penalty + fresh-market bonus. |
| MLB pre-era public hit rates leaking into headline | `/results` post-launch audit | Public era reset; `Fresh tracking era` label. |
| NBA `recent10` outage causing No Play storms | `attach_recent10.py` runs | Cache-first fallback with TTL + bounded timeout + provenance note. |
| Public legPool dropped leg game-time on round-trip | PR #153 pre-merge audit | `commenceTime` + `gameTime` round-tripped through `_lean_from_payload`; `formatLegGameTime` chains ISO → ET → date-only fallback. |

---

## 3. Already implemented, not just planned

These items are live in code AND tested:

- Public risk-section selector with strict odds + leg-count gate.
- Sport-pure NBA / MLB / Mixed buckets with sport-aware empty-state
  copy.
- NBA single-game parlay methodology with diversity selector.
- Public era reset on `/results` so pre-era hit rates never leak
  into the headline.
- Bankroll Plan as a planning aid, with explicit "not financial
  advice" framing.
- Leg game-time threading (PR #153) — every leg renders date + time
  when the source board carries one; honest date-only fallback when
  it doesn't.
- Calibration table consumed by the ticket card (PR #115).

---

## 4. Near-term deterministic improvements (no ML required)

These are next on the list. Each is a small change with a clear
behavior test, and none require new data:

- Per-market rolling hit-rate gate. If the rolling 14-day hit rate
  for a specific (sport, market) is below a published threshold,
  hide it from public Suggested mode until the rolling number
  recovers. The threshold must be published in the methodology
  copy and visible on `/results` — no hidden gating.
- Player-level exposure caps in the public legPool. A single player
  can never appear in more than N legs across the visible Suggested
  spread on one day. N is published.
- Closing-line tracking when our captured opening price differs
  enough from a known closing reference. Read-only — we record CLV
  but don't change the optimizer until the audit signal clears the
  same confirming-days threshold the rest of the policy uses.
- Confidence decay when `recent10Count` is stale (e.g. > 21 days
  since the last logged game). The leg drops from High → Medium
  rather than passing the gate at stale High.
- Bankroll allocator using implied probability (from odds) and
  model probability (from projection vs line) to size stakes, not
  just rank-order. Allocator behavior remains opt-in.
- Section-aware exposure caps so the Longshot section can't be more
  than X% of the visible spread.

Each item above ships with: (a) a deterministic test, (b) a
methodology line in this doc, and (c) an audit-trail line on
`/results` if the user-visible behavior changes.

---

## 5. Shadow-tested statistical improvements

These require parallel evaluation before public rollout. The
evaluation runs over the live audit data and produces a comparison
JSON the operator reviews before promotion.

- Per-(sport, market) Bayesian calibration with shrinkage toward a
  global prior. Counters small-sample over-confidence on rare
  markets.
- Isotonic / Platt calibration of the projection probability vs
  outcome, evaluated by Brier score and log loss.
- Reliability scoring per player using observed-vs-projected
  variance. Reliability score gates the leg from Star Power, not
  from Aggressive — that lane is built to admit volatility.
- Same-game correlation penalty estimated from observed joint
  outcomes when both legs from a game settle on the same date.
  Today's correlation penalty is a constant; this would make it
  data-driven.
- Volatility score per (player, market) derived from `recentSeries`
  variance. Discounts the per-leg score on the most volatile rows.
- Injury / availability reliability score using the time gap
  between consecutive box scores. Stale gap → confidence decay.
- Feature drift monitoring — alert when the distribution of a
  feature (e.g. NBA AST volatility) moves past a control band.

Each shadow item must clear the audit-policy confirming-days
threshold before any change reaches the optimizer.

---

## 6. ML / deep-learning roadmap

This section is **roadmap only**. None of these are running today.

### Prerequisites

1. Clean historical feature store covering at least three months
   of trusted slates (post-era-reset).
2. Labeled outcomes joined per leg with verified leg → settlement
   mapping.
3. Train / validation / test split by time. No same-slate leakage
   between split partitions.
4. Player / team embeddings that are stable across the test window.
5. Odds-movement features if (and only if) we capture multiple
   snapshots per slate.
6. Sportsbook-consensus features if (and only if) we capture
   multiple books per slate.

### Candidate models (in order of complexity)

1. **Logistic regression baseline.** First. The ceiling for the
   non-baseline models is measured relative to this.
2. **Isotonic / Platt recalibration.** Cheap, well-understood,
   directly improves Brier / log loss.
3. **Gradient boosted decision trees (XGBoost / LightGBM).**
   Honest tabular baseline. Beats logistic regression typically
   only when feature interactions matter.
4. **Temporal model** over recent-game sequences (last 10 games).
   GRU / Transformer-style — only after GBDT proves the headroom
   exists.
5. **Player / team embeddings** as an input layer. Cold-start risk
   needs an explicit fallback to deterministic priors.
6. **Neural network calibration head** layered on the GBDT output.
   Only after out-of-time validation lift is reproducible.
7. **Ensemble.** Last resort — ensembles hide blame for failure
   modes and complicate the audit.

### Evaluation protocol

Any model proposed for promotion must report:

- Out-of-time hit rate stratified by odds bucket (favorites vs
  underdogs).
- Brier score and log loss vs the deterministic baseline.
- Calibration curve (predicted probability vs realized rate).
- Profit simulation at flat-unit stake, with drawdown.
- Profit simulation under a public-section spread (matches what
  users see).
- Closing-line lift, if available.
- Strict no-same-day leakage check.
- Methodology line ready for `/results` if promotion proceeds.

### What we will not claim

- "AI is choosing your parlays."
- "Deep learning is active in the optimizer."
- "The model learned overnight."
- Any synthetic hit rate from a model that hasn't been publicly
  tracked on out-of-sample slates.
- Any backtest result based on the same-day final outcome.

---

## 7. Data requirements before model work

To make any of section 6 honestly possible we need to be confident
about the following:

- Stable post-era feature snapshots in `/data/audit/daily/`.
- A consistent leg → settled outcome join (no manual edits).
- Verified box-score availability per player and per market.
- A retained snapshot of pregame odds (so the model sees what a
  user saw at recommendation time, not the closing price).
- A registry of player / team identifiers stable across vendors.

The audit pipeline already writes some of this; the gaps are
listed in `docs/RECENT_FORM_METADATA_TODO.md` and
`docs/PROP_EXPANSION_NEXT_STEPS.md`.

---

## 8. Operator commitments

- We do not consume an audit signal in the optimizer until the
  signal has cleared the confirming-days threshold encoded in
  `audit/policy.json`.
- We do not use that slate's final outcomes to alter that slate's
  pregame suggestions.
- We do not loosen quality guardrails just to fill empty UI
  sections.
- Any future model becomes public only after its evaluation
  artifacts (Brier, log loss, calibration curve, profit
  simulation) are in the repo and linkable from `/results`.

---

## 9. Implementation sequence

The order below is intentionally conservative:

1. **Now → Q1 follow-up.** Land each near-term deterministic
   improvement (section 4) one at a time, each with tests and a
   methodology line.
2. **Q1.** Stand up the historical feature store + verified leg →
   outcome join.
3. **Q1 → Q2.** Run shadow evaluations for the statistical
   improvements (section 5). Promote only what clears the audit
   policy.
4. **Q2.** Logistic regression baseline + isotonic calibration
   evaluated out-of-time. If it doesn't beat the deterministic
   spread on Brier, log loss, and profit-simulation, we don't
   ship it.
5. **Q2 → Q3.** GBDT evaluation. Same gates.
6. **Q3+.** Temporal models / embeddings considered only if (a)
   GBDT shows lift and (b) the data backing the recent-game
   sequence is verified.
7. **Anytime in the loop above.** If a model regresses, we revert
   to the previous version and write up the postmortem.

No ML feature ships behind a marketing badge before it ships
behind an audit-trail file.

---

## 10. Pointers

- `docs/MODEL_LEARNING_LOOP.md` — daily settle → audit → promotion
  / demotion plumbing.
- `docs/PARLAY_METHODOLOGY.md` — rules and rationale per sport.
- `app/public/data/audit/policy.json` — the running policy.
- `app/public/data/audit/daily/*.json` — daily audit signals.
- `docs/MODEL_AUDIT_2026-05-25.md` — most recent audit summary.
- `docs/PROP_EXPANSION_NEXT_STEPS.md` — props roadmap.
- `docs/MONTE_CARLO_MODELING_ROADMAP.md` — earlier modeling notes
  (kept for context).

If a roadmap item ships, this doc gets an entry move from
"roadmap" to "implemented" with a PR link. The doc lies if it
ever drifts from the live code.
