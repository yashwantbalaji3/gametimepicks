# Company Completion Scorecard (Program 128-133 §130/§131)

**Computed, not asserted.** Every number below is the output of
`app/scripts/build-company-scorecard.mjs` reading `company-checklist.mjs` / `sport-checklist.mjs`
through the tested calculator (`scorecard.mjs`, 10 proofs). Weights were fixed from importance
before any score was computed. Regenerate with:

```bash
node app/scripts/build-company-scorecard.mjs --md
```

---

## ⚠️ Read this before the number

**Overall completion is 88% — of a platform-weighted definition of "done."**

The department weights (which the program supplied as a starting point, and I did not change)
put ~89% of the total on engineering surfaces — data, simulation, settlement, lineage,
automation, observability, deployment, security — and ~11% on Analytics & Growth, Multi-Sport,
and Commercial combined.

That weighting is defensible for an operating platform, but it means the headline **cannot be
read as "the company is 88% built."** Two checks make that concrete:

- Adding the obviously-missing business items I had first omitted (*any measured user*,
  acquisition, retention, ToS/privacy, jurisdiction posture) dropped **Analytics 48% → 27%** and
  **Commercial 71% → 51%** — and moved the headline by **one point**, 89% → 88%, purely because
  those departments carry 5 and 3 weight.
- The single lowest-scoring item set is *"has anyone ever used this."* Measurement has never been
  live, so the product has **no observed audience of any size**.

**Honest summary: the platform is ~9/10. The business is ~2/10. The headline averages them with
the platform weighted 8:1.**

---

| Department | Weight | Completion | Confidence | Applicable items |
|---|---:|---:|---|---:|
| Product & UX | 10 | **96%** | HIGH (100% fresh) | 6 |
| MLB Data Acquisition & Coverage | 10 | **96%** | HIGH (100% fresh) | 7 |
| Simulation Engine | 7 | **96%** | HIGH (100% fresh) | 5 |
| Prediction & Research Platform | 8 | **91%** | HIGH (100% fresh) | 6 |
| Signature Products | 7 | **96%** | HIGH (100% fresh) | 4 |
| Results & Settlement | 8 | **91%** | HIGH (100% fresh) | 6 |
| Lineage & Provenance | 7 | **89%** | HIGH (100% fresh) | 6 |
| Automation & Reliability | 9 | **97%** | HIGH (100% fresh) | 6 |
| Operations & Observability | 7 | **95%** | HIGH (100% fresh) | 6 |
| Deployment / Vercel | 4 | **98%** | HIGH (100% fresh) | 4 |
| Security & Public Boundary | 6 | **97%** | HIGH (100% fresh) | 5 |
| Analytics & Growth Measurement | 5 | **27%** | HIGH (100% fresh) | 7 |
| Cost & Infrastructure Efficiency | 3 | **80%** | HIGH (100% fresh) | 5 |
| Documentation & Governance | 3 | **90%** | HIGH (100% fresh) | 4 |
| Multi-Sport Platform | 3 | **40%** | MEDIUM (58% fresh) | 4 |
| Commercial / Legal / Support Readiness | 3 | **51%** | HIGH (100% fresh) | 7 |

**Overall Company Completion: 88%** (weighted across 16 departments; weights sum to 100)

### Highest-weight open items (the backlog, ordered by weight then department weight)

| Dept | Item | W | Status | Evidence |
|---|---|---:|---|---|
| Analytics & Growth Measurement | Production collection live | 5 | BLOCKED_EXTERNAL | requires founder Blob store + 3 env vars; observer reports analytics OFF |
| Analytics & Growth Measurement | Any measured user (a single real visitor observed) | 5 | NOT_STARTED | measurement has never been live; the product has no observed audience of any size |
| Results & Settlement | Aug 3 settles exactly the 211 frozen rows | 4 | IN_PROGRESS | wall-clock: nightly-settle runs 01:30/03:30 ET Aug 4; acceptance assertions written |
| Lineage & Provenance | Settled-row lineage acceptance (PROVEN_STAMPED) | 4 | IN_PROGRESS | observer: NOT_YET_STAMPED 0/299 on 2026-07-31 — pre-existing open item |
| Analytics & Growth Measurement | Acquisition channel / distribution | 4 | NOT_STARTED | no acquisition work; source-attribution schema exists but unmeasured |
| Analytics & Growth Measurement | Retention signal (does anyone return) | 4 | NOT_STARTED | return_visit event defined; never collected |
| Multi-Sport Platform | Shared contracts usable beyond MLB | 4 | IN_PROGRESS | availability/product-status/capability registry are sport-generic; only MLB exercised daily |
| Commercial / Legal / Support Readiness | Terms of service / privacy policy published | 4 | NOT_STARTED | no ToS or privacy policy route found in the public export |
| Prediction & Research Platform | Second independent contract-persistence proof | 3 | IN_PROGRESS | awaiting tonight's Aug 3 settlement; assertions written |
| Analytics & Growth Measurement | Adoption read with honest metric states | 3 | DESIGNED_ONLY | FIRST_ADOPTION_READ.md contract written; zero measured events |
| Cost & Infrastructure Efficiency | Public-data growth retention policy | 3 | NOT_STARTED | 339MB tracked, ~16MB/day, no retention design (open in waste register) |
| Documentation & Governance | No contradictory parallel truth documents | 3 | IN_PROGRESS | docs updated in place, but the docs/ set is large and some historical reports overlap |
| Multi-Sport Platform | NBA adapter ready for season | 3 | DESIGNED_ONLY | adapter code exists, HISTORICAL_ONLY promotion state, offseason |
| Multi-Sport Platform | EPL settlement provider decision | 3 | BLOCKED_EXTERNAL | EPL_RESULTS_PROVIDER_DECISION_PACKAGE.md awaiting founder |
| Commercial / Legal / Support Readiness | Support / contact / incident channel for users | 3 | NOT_STARTED | newsletter form conditional; no user-facing support path |
| Commercial / Legal / Support Readiness | Jurisdiction / age-gating posture for a sports-data product | 3 | NOT_STARTED | paper-only framing exists, but no jurisdiction or age posture is documented |
| Product & UX | Mobile 375px layout verified for current-day surfaces | 2 | IN_PROGRESS | e2e specs exist (app/e2e/) but are local-only; not run in CI |
| Commercial / Legal / Support Readiness | Billing/commercial model | 2 | NOT_STARTED | no commercial model; paper product only |

### Sport completion

| Sport | Launch state | Completion | Applicable | Note |
|---|---|---:|---:|---|
| MLB | LIVE_PARTIAL | **93%** | 8 | Daily operating sport. PARTIAL only because one Aug 3 game's books never posted. |
| NBA | DESIGN_ONLY | **22%** | 8 | Offseason. Adapter code exists; promotion state HISTORICAL_ONLY. |
| EPL / Soccer | BLOCKED | **31%** | 8 | Odds side wired; settlement blocked on an unmade provider decision. |
| UFC | ARCHIVED | **100%** | 4 | Settled archive is the intended finished state; forward cards are NOT a goal. |
| World Cup | ARCHIVED | **100%** | 4 | Closed as a destination; archive/proof only. |

---

## Confidence

Every department except Multi-Sport reports **HIGH** confidence (100% of weighted evidence from
the last 14 days). That is unusually high and has a specific cause: nearly every load-bearing
claim was re-verified in production during 2026-07-31 → 08-03. Multi-Sport is **MEDIUM** (58%
fresh) because NBA/EPL/UFC evidence is genuinely older — those verticals have not been touched
in weeks, which is the correct signal.

**Confidence is not completion.** Analytics scores 27% with HIGH confidence: we are *very sure*
it is not built.

## What the scorecard says to do next

The backlog table above is ordered by item weight then department weight. The top of it is
dominated by two clusters:

1. **Measurement (weight 5, 4, 4 · BLOCKED_EXTERNAL / NOT_STARTED).** Production analytics needs
   one founder action (Blob store + 3 env vars). Until then *every* growth question is
   unanswerable, and no amount of platform work changes that.
2. **Lineage acceptance (weight 4 · IN_PROGRESS).** Settled-row PROVEN_STAMPED is still 0/299 on
   2026-07-31. Native stamping is complete (211/211 on Aug 3), so this is the last gap between
   "rows carry provenance" and "settled rows are provably the rows we published."

Everything else in the backlog is either genuinely blocked on an external decision (EPL provider),
correctly dormant (NBA offseason, UFC archive), or a deliberate design choice not yet spent
(public-data retention policy).

## Sport launch states

MLB is the only sport with a daily operating cycle; it is **LIVE_PARTIAL** today only because one
game's sportsbooks never posted. UFC and World Cup score 100% because **archive is their intended
finished state** — categories that would only matter for a live sport are NOT_APPLICABLE and
excluded from the denominator rather than scored zero. NBA (22%) and EPL (31%) are honestly low:
code exists, forward proof does not.
