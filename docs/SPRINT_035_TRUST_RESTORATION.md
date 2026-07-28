# Sprint 035 — Trust Restoration

**Date:** 2026-07-28 · **Branch:** `june30-reset` · **Baseline:** `3976245c` (rebased onto `origin/main`)

A credibility and product-integrity sprint. No prediction work, no new sports, no new surfaces.

---

## The one-sentence summary

`glossary.ts` had told users, in writing, that confidence *"does not up-weight a pick until
re-validated."* At least ten scoring functions up-weighted it, and the product labels told readers to
trust the worst-performing category. This sprint made the code do what the glossary already promised.

---

## The evidence

Re-derived independently this sprint from the committed settled ledger
(`app/public/data/mlb/results/settled_leans.jsonl`), 22,155 rows / 21,192 decisive:

| Claimed edge | n | Hit rate |
|---|---|---|
| < 2.5 pp | 6,757 | **.5203** |
| 2.5 – 5 pp | 4,171 | .5040 |
| 5 – 10 pp | 5,065 | .5100 |
| 10 – 20 pp | 4,430 | .4754 |
| 20+ pp | 769 | **.4317** |

| Confidence (as displayed) | n | Hit rate |
|---|---|---|
| High → "Stronger signal" | 9,493 | **.4934** |
| Medium → "Watch" | 3,010 | .5063 |
| Low → "High-variance" | 7,929 | **.5172** |

Two findings that shaped every decision below:

1. **These are one signal, not two.** 90.8% of rows match the documented rule
   (High ≥5pp, Medium ≥2.5pp, Low <2.5pp); the remaining 9.2% are ≥20pp anomalies auto-capped to Low.
   Confidence is a relabelled edge bucket. Removing `edgePct` from ranking without fixing the label
   would have left the same claim on screen in words.
2. **The relabelling inverted the instruction.** "Stronger signal" endorsed the worst category harder
   than the raw tier name had; "High-variance … treat as noisier" discouraged the best one harder.
   The rename made the problem worse, not better.

---

## What changed

### Ranking and eligibility (`06394bcf`)

New `lib/ranking/decision-ranking.ts` is the canonical contract. Its `RankableRow` type has **no field
for a model-market gap**, making the harmful signal unrepresentable rather than merely discouraged.
`mayRankByModelMarketGap()` reads `model-calibration-status`, so re-enabling gap ranking requires a
market to genuinely re-validate.

| Site | Before | After |
|---|---|---|
| `top10-picks.ts` ×3 scorers | `+ edge * 0.5` / `+ edgePct/100 * 0.5` | model probability × market reliability |
| `top10-picks.ts` "Value" tab | `filter(edge > 0.02)` | **retired** — it selected *for* the worst bucket |
| `leg-scoring.ts` | confidence ≤30 pts, edge ≤20 pts (50 of 100) | both removed; remaining terms renormalised 55→100 |
| `leg-quality-gates.ts` | `conservative` required `confidence:["High"]`, `minEdgePct: 3.0` | all tiers admitted, no edge floor |
| `simulate-lobby-featured.ts` | sorted by `topEdgePct` | sorted by simulation coverage |
| `mlb-top-leans-strip.tsx` | `High ? 100 : 50` + `|edge|` | model probability + sample depth |
| `featured-headliners.tsx` | `|edgePct|`, tiered by confidence | model probability |
| `player-props-explorer.tsx` | sorted by `edgePct` | sorted by model probability |
| `vault-board.tsx` | `FEATURED_CONFIDENCE_WEIGHT {High:3…}` | neutral (all 1) |

**On the renormalisation.** A first attempt hand-picked new weights (dq 20→45) and inflated scores
66→86, which changed card composition. That was an untested opinion smuggled in under the guise of a
fix. The shipped version keeps every surviving term's **original** weight and renormalises the total
from 55 back to 100, so relative ordering among the evidence terms is untouched.

### Confidence semantics (`a8aa5f49`)

`confidenceLabel()` now returns neutral letters — **Category A / B / C** — that carry no built-in
ordering, and every caption quotes that category's measured settle rate. A's caption says plainly it is
the lowest of the three; C's says it is the highest.

`vault-player-card.tsx` also carried the inversion in **colour** — gold for the worst category, muted
for the best. All three are now styled identically.

### Surfaces (`48d472e2`)

- **189.65× rendered with no sample size anywhere on `/mr-dub`.** Every return, ROI and streak figure
  now renders beside its denominator.
- `/mr-dub` claimed to be *"the public proof that the methodology works."* It is a complete auditable
  record of a paper ladder standing on 33 settled bets, where two 5-leg ladders produced essentially
  all the profit and the all-product record is 19–39.
- **Moonshot** now states its lifetime **0–7** outright, framed as a transparent record of a
  high-variance approach that has not worked.
- **Homepage** gained a *"What we have not proven"* band leading with the grading ledger — 22,155
  graded predictions over 49 days in which the model did not out-predict the sportsbook.

### Operations (`6d29f378`)

- Job-level `continue-on-error: true` removed from `mlb-daily-production` and `mlb-pregame-capture`.
  These runs previously reported success regardless of outcome.
- Forbidden-path abort now `exit 1` instead of `exit 0`.
- Push failure retries 5× then **fails** instead of `|| echo "push skipped"`.
- Failure alerting wired into the four workflows that do the daily work. Unset secret → honest skip,
  exit 0; alerting is additive and must never become a new source of red.

---

## What was deliberately NOT changed

- **Edge and confidence remain fully visible** on rows, in tooltips, and in historical reporting.
  Sprint 035 removed them from *ordering* and *eligibility*, not from sight. Hiding the evidence that
  the model is anti-calibrated would defeat the purpose.
- **`excludeAnomalies` is kept** and is now the strictest evidence-backed filter available: anomaly
  rows hit .4342 over n=760. Excluding them is supported by settled data; *ranking* by the same
  quantity is not.
- **Every data-quality gate is untouched** — recent-10, valid player id, DNP thresholds, allowed
  markets. This is not a loosening of standards.
- **Ledgers, settlement and audit trails untouched.** Money hash `affe6b21…` and Bank Builder lock
  `cb80473f…` unchanged throughout.
- **`about/page.tsx` keeps a past calibration experiment's own tier names.** Renaming them would
  falsify a historical record.
- **`mlb/page.tsx` keeps "high-variance"** for the home-run Power Board — that describes a market's
  spread, not a confidence tier.
- **`vp/`** untouched.

---

## The honesty ceiling on this work

**This is not a better ranking.** Nothing shipped here has been shown to out-predict anything. The
replacement ordering — probability, market reliability, sample depth, completeness — is *unproven*,
not *proven better*. The only defensible claim is:

> a historically harmful weighting factor was removed.

No copy anywhere claims improvement, and `RANKING_BASIS_NOTE` is asserted by test to contain no
comparative language.

### Test suite (`Phase 8`)

E2E went from **32 passed / 14 failed** to **39 passed / 0 failed**. No assertion was weakened; each
failure was traced to a cause before being touched.

| Spec | Cause | Action |
|---|---|---|
| `navigation` — homepage heading | Regex `/GametimePicks/i` (one word). Visible brand is "GameTime Picks"; the one-word form appears **0 times** in rendered text. | Regex corrected |
| `navigation` — `/parlay-lab` heading | Route is now a client redirect to `/picks` | Converted to a redirect assertion |
| `navigation` — primary routes | Listed `/board`, `/parlay-lab`, `/methodology`, `/responsible-use` — predates sim-led nav | Asserted against real `NAV_ITEMS` |
| `newsletter` ×4 | Targeted the homepage; the component ships on `/board` only. Button reads "Notify me" unconfigured, not "Subscribe". | Retargeted; matcher accepts both provider states |
| `newsletter` — invalid email | Asserted a React message that is **unreachable**: `type="email"` with no `noValidate` means native validation blocks submit before `onSubmit` runs | Now asserts `checkValidity() === false` **and** zero POSTs — the security-relevant assertion preserved |
| `admin-copy` — `/results` | Copy said "the raw audit JSON is in the repo" — operator vocabulary on a public page | Reworded for a general reader |
| `parlay-lab` ×6 | The paste-and-analyze feature is **retired**: `parlay-lab-client.tsx` is rendered by no page and `/parlay-lab` is a 15-line redirect | Spec deleted; the redirect is covered in `navigation` |

**Follow-up:** `src/components/parlay-lab-client.tsx` is now orphaned source with no render site. It was
left in place rather than deleted blind — removing it is a separate, verifiable cleanup.

An unrelated defect surfaced while reading e2e output: **`/board` was still rendering the old inverted
confidence legend** in two places ("High — strong edge, strong recent log"). Phase 3 had missed it
because the legend is inlined in `board/page.tsx` rather than using `confidence-labels.ts`. Both blocks
now show the neutral categories with their measured rates.

---

## Remaining founder decisions

1. **`VERCEL_DEPLOY_HOOK_URL`** — still unset; `verify:deployment` correctly reports UNKNOWN. No build
   carrying the Sprint 032 marker has reached production.
2. **`OPS_WEBHOOK_URL`** — alerting is wired but dormant until this secret exists. Until then a failure
   surfaces in the run log only.
3. **Analytics activation** — `NEXT_PUBLIC_ANALYTICS_ENABLED` + `NEXT_PUBLIC_ANALYTICS_ENDPOINT`.
   Still dark; `/ops` reports `NOT YET MEASURED` honestly. **No user behaviour has ever been measured.**
4. **The 189× headline** — now rendered with its sample size, but still present. Retiring it entirely
   remains a founder call.
5. **Bank Builder / Moonshot future** — reworded, not restructured. Whether a 0–7 product should keep a
   nav slot is a product decision.
6. **Merging to `main`** — cron only runs the default branch, so none of this is in the automation path
   until merged.

---

## Product thesis

**A sports research terminal whose distinguishing asset is its own published error record.**

Not a prediction platform (foreclosed by the evidence), not a "sports intelligence platform"
("intelligence" is heard as proprietary advantage — the disputed claim reintroduced by vocabulary), and
explicitly **not a decision companion** — that framing attaches an implicit performance promise to the
user's moment of choice, which is exactly where an anti-calibrated signal does maximum harm.

The position is defensible because it is commercially uncomfortable: no sportsbook-owned research arm
can publish that the market beats its model.

---

## Recommended next sprint

1. **Merge to `main` and confirm one clean automated cycle.** Nothing here is real until cron runs it.
2. **Set the three secrets** (deploy hook, ops webhook, analytics endpoint) — minutes of work, and
   every subsequent decision is a guess without the third.
3. **Extend the guard to the long tail.** ~56 files feed a sort or score; the highest-traffic ones are
   done. `\bedge\b` is banned in 12 named files but appears in 103.
4. **Prose migration last** — 724 "lean" occurrences across 210 files. Largest surface, smallest harm.
5. **Do not build a replacement signal** until the research gate opens (4/30 dates, ETA ~23 days).
