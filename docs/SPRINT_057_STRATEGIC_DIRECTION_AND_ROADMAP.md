# Sprint 057 — Strategic Direction, Model Research, and Multi-Sport Roadmap

**Date:** 2026-07-29 · **Branch:** `june30-reset` · **Baseline HEAD:** `76fae758`
**Status:** strategic analysis complete; no production model changes made; money artifacts untouched (`portfolio.json` md5 `affe6b21071f2b3be96bb2774eb347c3` verified).

---

## 1. Executive summary

Sprint 056 found no measurable sportsbook-beating edge. Sprint 057 asked the harder follow-up: **is there recoverable signal underneath the overconfidence, and what should the product become?**

The answer is now measured, not assumed:

1. **The model contains no information the market has not already priced.** In a preregistered blending experiment, the optimal weight on the model — raw *or* variance-corrected — fitted on the past and scored on an unseen future window, is **w = 0**. A logistic model given both the de-vigged market and the model assigns the model a *negative* coefficient (−0.10) and improves held-out log loss by 0.0002 (below the preregistered 0.001 bar). The market alone is the best predictor we can currently produce.
2. **The overconfidence is a variance defect, and it is quantified.** The simulation's distributions are too narrow by a fitted global factor of **k = 2.8** in z-space (per-market: hits 1.7; strikeouts, total bases, and H+R+RBI all ≥ 4, the grid ceiling). Correcting it repairs honesty (Brier 0.2559 → 0.2474 held-out) but does not create edge — the corrected model still only converges toward the market, never past it.
3. **Therefore the product direction is decided by evidence: GameTimePicks should become a research terminal and market-intelligence platform, not a prediction engine.** A prediction engine requires measurable edge; every preregistered attempt to find one has failed on out-of-sample data. What the platform *does* have is rare and defensible: a fully lineage-gated, quarantine-honest, publicly accountable record of what a transparent model predicted and what actually happened — infrastructure most pick-selling sites cannot honestly build.
4. **Multi-sport expansion should wait for the MLB loop to prove itself live, then go NBA first.** NBA is the only candidate sport with an official free results source, a season start (late October) inside the 90-day window, and existing historical scaffolding. UFC and soccer both fail readiness gates today (details in §7–8).

---

## 2. Phase 0 — Baseline verification (all green)

| Check | Result |
|---|---|
| Repository | `~/Downloads/gametimepicks` → `github.com/yashwantbalaji3/gametimepicks`, branch `june30-reset`, HEAD `76fae758`, working tree clean (only uncommitted `vp/` operating-layer files) |
| Tests | 3,339 pass / 0 fail / 4 skipped |
| Typecheck | clean |
| Build | static export succeeds; internal routes and `public:false` data pruned |
| Health gate | HEALTHY 18/18 — bankroll $19,065.40 · crown $20,465.40 · record 19-14 |
| Research contract | builds; system status QUARANTINED (2026-07-28 refused by the lineage gate — correct fail-closed behavior) |
| Money artifacts | `portfolio.json` md5 matches canonical `affe6b21…`; no data-tree modifications |

**Sprint 056 findings reproduced independently** before any conclusion was drawn: baseline Brier model 0.2556 vs de-vigged market 0.2412 on 21,633 paired rows; 11/12 preregistered segments lose held-out; error 5.86pp near even money vs 26.84pp far from it.

---

## 3. Phase 1 — Current model reality (settled data only, market de-vigged)

Population: **21,633 settled decisive rows** with a two-way quoted market, 2026-05-16 → 2026-07-27. Every market probability is de-vigged (board implieds sum ≈ 1.069 raw).

### Headline

| | Brier ↓ | Log loss ↓ | Mean predicted | Observed |
|---|---|---|---|---|
| Model (raw) | 0.2556 | 0.7079 | **59.48%** | 50.16% |
| Market (de-vigged) | **0.2412** | **0.6754** | 50.16% | 50.16% |

The model claims 59.5% average confidence on outcomes that happen 50.2% of the time — **9.3pp aggregate overconfidence** — and loses to the market by +0.0144 Brier / +0.0325 log loss on identical rows.

### Calibration by predicted probability (the shape of the defect)

| Bucket | n | Predicted | Observed | Gap |
|---|---|---|---|---|
| 0.4–0.5 | 3,386 | 45.7% | 41.3% | −4.4pp |
| 0.5–0.6 | 6,453 | 55.3% | 47.2% | −8.1pp |
| 0.6–0.7 | 6,604 | 64.9% | 53.9% | −11.0pp |
| 0.7–0.8 | 3,665 | 73.9% | 59.9% | −14.0pp |
| 0.8–0.9 | 400 | 82.8% | 59.0% | −23.8pp |
| 0.9–1.0 | 35 | 94.2% | 51.4% | −42.8pp |

The gap **widens monotonically with confidence** — this is understated variance, not a constant bias. A model whose 90%+ claims land at a coin flip has no business stating 90%.

### By market

| Market | n | Hit rate (95% CI) | Model Brier | Market Brier | Overconfidence |
|---|---|---|---|---|---|
| batter_hits | 9,005 | 53.81% [52.78, 54.84] | 0.2434 | 0.2349 | 6.7pp |
| batter_hits_runs_rbis | 7,408 | 49.64% [48.50, 50.77] | 0.2638 | 0.2477 | 10.4pp |
| batter_total_bases | 4,120 | 43.76% [42.25, 45.28] | 0.2628 | 0.2426 | 11.6pp |
| pitcher_strikeouts | 1,100 | 47.82% [44.88, 50.77] | 0.2729 | 0.2435 | 15.1pp |

### The direct answer the prompt required

> **Would a sophisticated bettor trust this model over sportsbook pricing today? No.** On every market, every confidence bucket, and 11 of 12 preregistered segments, the de-vigged market is the better probability. The one surviving segment ("model within 2.5pp of market", +0.0002) is the model *agreeing* with the market, which is not edge.

---

## 4. Phase 2 — Model improvement experiments (preregistered, temporal split, no production changes)

New research framework: `app/scripts/model-experiments.mjs` (run: `npm run research:experiments`), guarded by `app/src/lib/model-experiments.test.mjs` (9 methodology tests). Every experiment declares its hypothesis and decision criterion up front, fits parameters on the train window only (14,938 rows, ≤ 2026-06-30), and is scored on a future window it never saw (6,695 rows, 2026-07-01 → 2026-07-27). The framework's self-test proves it recovers a synthetic variance defect (k≈2), refuses to certify a noise model, and detects genuinely incremental signal.

**Preregistered verdict bands:** OUTPERFORMS_MARKET (≥0.0010 Brier below market) · MATCHES_MARKET (±0.0010) · HONESTY_GAIN (≥0.0020 below raw model) · REJECT.

| Experiment | Test Brier | Test log loss | Fitted params | Verdict |
|---|---|---|---|---|
| *raw model (baseline)* | 0.2559 | 0.7095 | — | — |
| *de-vigged market (baseline)* | 0.2413 | 0.6757 | — | — |
| Global variance expansion Φ(z/k) | 0.2474 | 0.6880 | k = 2.8 | HONESTY_GAIN |
| Per-market variance expansion | 0.2460 | 0.6853 | hits 1.7 · Ks 4.0 · TB 4.0 · HRR 4.0 | HONESTY_GAIN |
| Linear shrink toward 50% | 0.2473 | 0.6877 | λ = 0.38 | HONESTY_GAIN |
| Platt scaling (adopted Sprint 048) | 0.2455 | 0.6847 | — | HONESTY_GAIN |
| Variance expansion → Platt | 0.2455 | **0.6843** | k = 2.8 | HONESTY_GAIN |
| Blend raw model + market | 0.2413 | 0.6757 | **w = 0** | MATCHES_MARKET |
| Blend corrected model + market | 0.2413 | 0.6757 | **w = 0** | MATCHES_MARKET |
| Logistic: market + model vs market alone | 0.2412 | 0.6756 | β(model) = **−0.10** | MATCHES_MARKET |

### What this settles

1. **Variance correction is real but bounded.** k = 2.8 confirms Sprint 056's tail-error signature quantitatively. It closes ~58% of the raw-model-to-market Brier gap. It cannot close the rest, because…
2. **…there is no incremental signal to recover.** The two decisive experiments — blend weight and the incremental-logistic test — both say the model contributes *nothing* beyond the market (w = 0 even after correction; log-loss delta 0.0002, below the 0.001 preregistered bar; the fitted model coefficient is negative).
3. **The strikeouts/TB/HRR simulations are broken beyond calibration.** Their fitted variance factors hit the 4.0 grid ceiling; batter_hits (k = 1.7) is the only market whose distribution is in the right neighborhood.
4. **No experiment achieved OUTPERFORMS_MARKET.** Deployment recommendation: keep Platt as the stated-probability layer (variance→Platt ties on Brier, marginally better log loss, but adds a parameter for no preregistered margin); use per-market k as a published honesty diagnostic, not a new layer.

---

## 5. Phase 3 — Product direction (founder recommendation)

### Options evaluated

| Direction | Requirement | Evidence |
|---|---|---|
| **Prediction engine** | measurable edge | **Fails.** w = 0, negative incremental coefficient, 11/12 segments lose, 0 experiments outperform market |
| **Research terminal** | transparency, accountability, explainability | **Holds.** Lineage-gated settlement proven live, quarantine honesty, closed accounting (gap 0), one truth contract across all 5 routes, 21.6k-row public evaluation corpus |
| **Market intelligence** | reliable market data + framing | **Holds.** De-vig machinery, pairing selector, Market Center, line-movement capture already built (currently discarded by design) |
| **Hybrid (terminal + honest probabilities)** | the above + calibrated stated probabilities | **Holds.** Platt layer adopted with preregistered out-of-sample proof |

### Recommendation

**Become the accountable sports research terminal: "the site that shows you what the market believes, what a transparent model computed, and what actually happened — with nothing hidden."**

Concretely:

1. **Kill the implicit promise of picks that win.** The paper record (19-14) stays as an honest historical artifact; no product surface should imply forward edge. This is already largely enforced by the public-beta safety guards — the direction change is strategic emphasis, not new copy scrubbing.
2. **Sell calibration transparency as the product.** No competitor publishes per-market overconfidence, variance factors, quarantined dates, and refused settlements. Trust is the moat; the integrity infrastructure (Sprints 043–055) is the asset the model failure does not devalue.
3. **Promote market intelligence to a first-class pillar** (de-vigged consensus, line movement, market-implied distributions). The market is the best predictor we can offer — so offer *it*, well-framed.
4. **Keep the model as an instrument, not an oracle:** honest calibrated probabilities, full distributions with p10–p90 bands, and a public research program (the experiment framework) that documents attempts to improve it. "We measured our own model and here is where it loses" is a credibility engine.

### Why not shut the model down entirely

The model is the terminal's *content*: distributions, calibration curves, and the running honesty ledger all derive from it. Its value is pedagogical and accountability-driven, not predictive. Retiring it would collapse the terminal into an odds screen.

---

## 6. Market strategy — KEEP / RESEARCH / DISABLE

| Market | Verdict | Evidence | Action |
|---|---|---|---|
| `batter_hits` | **KEEP** | 53.81% hit (CI floor 52.78%), best Brier, k = 1.7 (near-correct variance), 6.7pp overconfident | Featured market for calibrated display; Platt-stated probabilities |
| `batter_hits_runs_rbis` | **RESEARCH** | 49.64%, k at ceiling (≥4), 10.4pp overconfident | Keep ingesting + settling; display market-context only until per-market variance is rebuilt in the simulator |
| `pitcher_strikeouts` | **RESEARCH** | 47.82% (CI touches 50.77%), worst overconfidence 15.1pp, k at ceiling, n = 1,100 still small | Same as HRR; candidate for DISABLE if CI falls below 50% as n grows |
| `batter_total_bases` | **DISABLE** (already) | CI entirely below 50% on n = 4,120 — confirmed; Sprint 047 verdict stands | No change; stays visible in the honesty ledger, absent from featured surfaces |

---

## 7. Phase 4 — Multi-sport readiness

### Gates (all six must pass before a sport leaves scaffold status)

1. **Official results source** — free, machine-readable, per-event official data (the MLB StatsAPI standard). Settlement from web snippets is banned platform-wide.
2. **Identity reliability** — proven injective join between odds-provider events and the results source; alias-collision refusal wired in (the Sprint 043/045 lesson: UFC's join produced 2/2 decided rows on a collision).
3. **Leakage safety** — per-row `capturedAt < eventStart` enforcement from day one (retrofitted painfully for MLB; never again).
4. **Settlement quality** — the lineage gate running on every settle, with quarantine semantics (90'-vs-penalties taught us soccer settlement is rule-sensitive).
5. **Evaluation capability** — a realistic path to ≥5,000 decisive settled rows before any public probability claim. (Soccer's N=5 FIFA-Poisson engine was correctly kept private; MLB needed 21k rows to reach today's conclusions.)
6. **Product value** — the sport must serve the research-terminal thesis (calibration + market intelligence), not content volume. The prompt's words: *do not add sports simply for content volume.*

### Readiness matrix (current audited state, 2026-07-29)

| Sport | State | G1 results | G2 identity | G3 leakage | G4 settlement | G5 eval path | G6 value | Read |
|---|---|---|---|---|---|---|---|---|
| **MLB** | FULL_MODEL | ✅ StatsAPI | ✅ gamePk join + gate | ✅ enforced | ✅ lineage-gated, live-proven | ✅ 21.6k rows | ✅ | **Continue — the reference implementation** |
| **NBA** | HISTORICAL_ONLY | ✅ NBA Stats/official | ⚠️ untested at scale | ⚠️ not wired | ⚠️ core markets settleable; 3PM/PRA/STL/BLK proven unsettleable → excluded | ✅ dense season (Oct–Jun) | ✅ | **First expansion candidate** |
| **Soccer (EPL/UCL/MLS)** | SCAFFOLD/DISABLED | ⚠️ fragmented; paid APIs | ⚠️ alias-normalized team joins (WC-era) | ⚠️ partial (WC lineup infra dormant) | ⚠️ rule traps (90' vs AET/pens) solved once, per-competition rules vary | ⚠️ slower: ~10 matches/week/league | ✅ strong market interest | **Market-intelligence-only lane first** |
| **UFC** | SCAFFOLD_ONLY | ❌ no official free stats API | ❌ join proven unsound | ❌ | ❌ | ❌ sparse (~40 fights/month) | ⚠️ | **Hold at scaffold** |
| **NHL** | SCAFFOLD_ONLY | ✅ NHL StatsAPI exists | ⚠️ | ❌ | ❌ | ✅ in season (Oct+) | ⚠️ | Behind NBA (same season, weaker prop markets) |
| **IPL** | SCAFFOLD_ONLY | ❌ no reliable free official source | ❌ | ❌ | ❌ | ❌ season ended | ❌ | Hold |
| **NFL** | DISABLED | ⚠️ official data partner-gated | ❌ | ❌ | ❌ | ⚠️ only ~272 games/season → thin row counts | ✅ huge interest | Market-intelligence-only candidate for September |

---

## 8. Phase 5 — UFC and soccer timing (direct answers)

**UFC: do not begin heavy development. Earliest reconsideration: after two other sports pass all six gates.**
Every gate fails today: the identity join is proven unsound (Sprint 045), there is no official free results API (settlement would depend on scraping or paid feeds we have banned for grading), volume is too sparse to ever reach evaluation scale quickly, and fight cancellations/replacements make event identity the *hardest* of any sport, not an afterthought. UFC does not strengthen the moat — the moat is settlement integrity, which UFC's data ecosystem actively undermines.

**Soccer: begin — but as market intelligence only, in the 60–90 day window. No model, no probabilities.**
Soccer has genuine product value and the WC-era infrastructure (alias normalization, lineup automation, penalty-rule settlement lessons) is real prior art. But gate 5 is structural: at league cadence it takes months to accumulate an evaluable corpus, and our one soccer engine (FIFA-Poisson, N=5) was correctly judged unpublishable. The honest offering is de-vigged market consensus, line movement, and match context for one league (EPL, season starts mid-August) — explicitly labeled NOT_YET_MODELED, reusing the event-markets fail-closed pattern.
**Promotion criteria from scaffold → modeled:** an official per-match results source wired and lineage-gated; injective match identity across one full month of fixtures with zero collisions; 5,000-row evaluation corpus roadmap; and the MLB live-acceptance proofs closed first.

**NBA (the sport the question should have asked about):** begin readiness engineering in the 30–60 day window — identity join + settlement dry runs against official box scores during preseason (mid-October), with the season's first live research coverage only if all six gates pass. NBA is soccer's superior on every gate except our prior art.

---

## 9. Phase 6 — 30/60/90-day execution roadmap

Tracks are parallel; each has an owner-decision gate, not a date promise. **MLB live-acceptance proofs are the critical path for everything public.**

### Days 0–30 — "Prove the loop live, reposition the copy"

| Track | Work | Exit criteria |
|---|---|---|
| Operations (critical path) | Observe first clean stamping (2026-07-30 candidate) and pipefail-fixed automation run on live slates. Never force them. | Both live proofs closed; system status leaves QUARANTINED on a real slate |
| Product | Reposition copy/nav to research-terminal framing (§5); Market Center + line-movement surfacing (data already captured, currently discarded) | Terminal framing shipped; no forward-edge implication anywhere |
| Research | Adopt per-market variance factors as a *published honesty diagnostic*; keep Platt as stated layer; wire `research:experiments` into the nightly report as a frozen artifact | Diagnostic visible on /system-status; experiments reproducible from CI |
| Analytics | Turn measurement ON (provider decision is the founder's; wiring exists and is NOOP-gated) | Real adoption data flowing ≥14 days |

### Days 30–60 — "Deepen MLB intelligence, build NBA readiness"

| Track | Work | Exit criteria |
|---|---|---|
| Research | Rebuild strikeouts/TB/HRR simulation variance at the *simulator* level (root cause, not probability post-hoc); preregister and re-run the framework | Per-market k ≤ 1.5 on fresh out-of-sample window, or market stays RESEARCH |
| NBA | Identity join + StatsAPI settlement dry runs on preseason; leakage enforcement from row one; exclude unsettleable markets up front | All six gates green on preseason data |
| Product | Calibration transparency pages (per-market curves, honesty ledger); NFL market-intelligence assessment (September season start) | Founder review |
| Growth | First adoption read from analytics; decide free-vs-account gating | Evidence-based growth decision |

### Days 60–90 — "Second sport live, soccer intelligence lane"

| Track | Work | Exit criteria |
|---|---|---|
| NBA | Live research coverage at season tip-off (late October) if gates hold | Lineage-gated NBA settlements from day one |
| Soccer | EPL market-intelligence lane (NOT_YET_MODELED), fail-closed event markets pattern | Zero identity collisions across one month |
| Research | Quarterly preregistered edge re-audit (the standing honesty ritual) | Published, whatever it says |
| Platform | Retire/archive remaining legacy chrome flagged in the status-semantics audit backlog | /ops checklist green |

---

## 10. Founder decisions required

1. **Ratify the direction** (§5): research terminal + market intelligence; no forward-edge positioning. *(Recommended: yes — the evidence leaves no honest alternative.)*
2. **Analytics provider on/off** — wiring exists; measurement cannot stay off if adoption is to drive the 60-day decisions.
3. **Market verdicts** (§6) — specifically confirming strikeouts and HRR stay visible as market-context-only.
4. **NBA-first expansion** (§7–8) versus any attachment to UFC/soccer-first. UFC stays scaffold regardless, per gates.
5. **Paid-data budget** for NBA odds ingestion (Odds API credits are the only new cost in the 90-day plan).

---

## 11. Guardrails observed

- No production model, money artifact, or historical outcome was modified. The only repo changes are the new research script, its tests, an npm script alias, and this document.
- No experiment was added or dropped after seeing results; negative findings are reported in full.
- All market comparisons are de-vigged; all evaluation is temporal-split out-of-sample; ledger dates (not local lean dates) key every row.
- The 19-14 paper record and the research corpus remain separate populations and are never conflated.

## Appendix — Reproduction

```bash
cd app
npm run research:experiments          # preregistered experiment suite (this sprint)
npx tsx scripts/model-experiments.mjs --self-test
npm run audit:model-edge              # Sprint 056 segment audit
npm run audit:model-learning          # calibration backtest + market registry
npx tsx scripts/audit-settlement-and-outcomes.mjs --date-from 2026-05-16 --date-to 2026-07-28
npx tsx scripts/audit-sports.mjs      # sport capability states
```

Raw experiment output: `tmp/sprint057-experiments.json` (regenerate with `--json`).
