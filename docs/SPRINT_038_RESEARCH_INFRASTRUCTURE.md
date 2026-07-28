# Sprint 038 — Research Infrastructure Foundation

**Date:** 2026-07-28 · **Branch:** `june30-reset` · **HEAD at start:** `58c15458` · 0 behind / 0 ahead of `origin/main`

Goal: the architecture where **every** sport follows one spine — ingestion → market capture → feature
snapshots → predictions → settlement → calibration → research database → transparency. Not more sports
pages.

---

## Corrections to the stated starting state

Two things in the brief needed correcting before building on them.

**1. "Sprint 037C established the first fully observed MLB lifecycle" — half true.**

| Half | Status |
|---|---|
| Settlement | ✅ **Fully observed.** July 27: 509 generated = 505 ledger (213 W / 228 L / 64 Void) + 4 unavailable. Zero non-terminal outcomes, zero duplicate IDs, public summary reconciles with internal ledger. |
| Deployment | ✅ **Proven.** Production serves `58c15458`, build clock = today, in sync with local HEAD. |
| Generation | ❌ **Still unobserved.** `morning-projections` had not fired when 037C paused, and still had not at 15:05Z today — 95 minutes past its 13:30Z cron, inside its measured 74–146 minute window. Nothing failed; the GitHub scheduler is simply slow (today `mlb-research-integration` ran 143 minutes late). |

**2. I published a wrong storage number last sprint.** I said retaining market payloads costs "648 GB/month". That was a unit error. Corrected from the two surviving files:

| | Measured |
|---|---|
| Per capture | 1.3 MB |
| Per day (16 captures) | 21 MB |
| Per month | **0.61 GB** |
| Per year | **7.4 GB** |

This materially changes the retention decision I have flagged for four sprints: **the cost is trivial**, not prohibitive. 104 of 106 capture directories have already lost their payloads.

---

## Phase 1 — architecture review

### The headline finding, which corrects my own earlier claim

I previously described `lib/markets/` as the canonical sport-agnostic layer that other sports simply had not adopted. **That is wrong.** It is not sport-agnostic — it is `mlb/markets/` by content:

- `types.ts:19` — `GameMarketFamily = "MONEYLINE" | "RUN_LINE" | "TOTAL"`
- `types.ts:27-46` — nine baseball player families
- `load.ts:34` — `DATA_DIR = public/data/mlb` hardcoded
- `pairing.ts:38-40` — imports `mlb/model-calibration-status`
- `game-intelligence.ts` — `gamePk` in the public interface

**Only 3 of its 11 modules are genuinely reusable**: `freshness.ts`, `probability.ts`, `view-model.ts`.

So the true statement is not "others haven't adopted the shared layer." It is **there is no shared layer yet.**

### What IS genuinely reusable today, unchanged

`sport-capability-registry.ts` (zero imports, pure fail-closed lookup — the best-designed generic module in the repo), `markets/freshness.ts`, `markets/probability.ts`, `markets/view-model.ts`, `mlb/simulation/benchmark.ts` (Brier/log-loss — misfiled), `mlb/pregame-archive/market-normalizer.ts`, `mlb/confidence.ts`, `mlb/prediction/strength.ts`, `projection-framework.ts`, `parlays/odds-math.ts`, `calibration/reliability.ts`.

### The abstraction already exists — twice, in the wrong place

`lib/event-markets/` (~700 lines: `types.ts`, `snapshot-archive.ts`, `evidence-store.ts`,
`source-reliability.ts`, `modelability-contract.ts`) is a **complete, sport-free** Event /
MarketSnapshot / Provenance layer, built for prediction markets and **wired to nothing**. It already
has `EventMarket`, `MarketSnapshot`, `ArchivedSnapshot`, integrity hashing, and a source-reliability
tiering.

That is the spine. It does not need designing; it needs adopting.

### Two chokepoints do all the coupling

| Chokepoint | Pulled into | Consequence |
|---|---|---|
| `mlb/model-calibration-status.ts` | `markets/pairing`, `markets/player-intelligence`, **`ranking/decision-ranking`** | One import (`decision-ranking.ts:33`) is the *only* MLB thing in an otherwise fully generic ranking module |
| `mlb/product-settlement/mlb-markets.ts` | `product-workflow/leg-settlement` (settles **soccer**), `multi-sport/candidate-leg` (gates **all** sports) | Every sport settles *through* MLB |

**`ranking/decision-ranking.ts` is one injected predicate away from universal.** Its `RankableRow`
(`{id, modelProbability, marketReliability, sampleCount, isComplete, startsAtMs}`) contains no
baseball and deliberately omits a model-minus-market field.

### `gamePk` has leaked from join key into identity

It is in the public URL slug (`game-detail.ts:57-60`) and the settled-lean primary record
(`types-mlb-results.ts:9`). **The migration seam already exists**: the pregame archive writes
`eventId: String(gamePk)` beside it.

### Duplication inventory (measured)

| Concept | Independent implementations |
|---|---|
| American-odds → implied / de-vig | **5** |
| Moneyline grading | **4** |
| Player-name normalisation / join | **4** |
| Pregame leakage gate | **3** |
| Over/under grading | **3** |
| Snapshot provenance hashing | **3** |

NBA is the proof: `nba/pregame-snapshot-contract.ts:4` and `nba/feature-timing-contract.ts:3` both say
in their own comments that they *mirror* the MLB archive. **~950 lines of NBA contracts share zero
code with MLB.**

### Recommendation

**Do not build a universal framework. Adopt the one that exists, in four bounded steps.**

1. **Inject the two chokepoints** (calibration predicate, settlement primitive) as interfaces.
   Immediately universalises `decision-ranking.ts` and `settleOverUnder`. Smallest change, largest
   structural payoff.
2. **Promote `event-markets/` to the canonical Event + MarketSnapshot layer** and write the MLB
   adapter first — proving it against the one mature sport before any new one.
3. **Extract the capture skeleton.** The `getJson` + hash + `capturedAt/availableAt` +
   `researchEligible = capturedAt < eventStart` + immutable-filename pattern is copy-pasted across
   **15** scripts.
4. **Make `eventId` primary, `gamePk` an alias.** The seam is already written.

Deliberately *not* recommended: a big-bang refactor, or a new sport before step 2 proves the adapter.

---

## Phase 2 — universal entity design

Grounded in `event-markets/types.ts`, which already implements most of this.

```
EVENT            event_id · sport · league · season · participants[] · venue
                 scheduled_start · status · source · external_ids{}
MARKET_SNAPSHOT  event_id · book · market_type · selection · line · price
                 implied_prob · no_vig_prob · captured_at · available_at
                 source_last_update · provenance{} · integrity_hash
PREDICTION       event_id · model_version · prediction_type · probability
                 generated_at · features_ref · leakage_safe(bool)
SETTLEMENT       event_id · prediction_id · actual · outcome
                 (win|loss|push|void|unavailable) · reason · settled_at · source
CALIBRATION      model_version · market_type · bucket · predicted · actual
                 n · brier · log_loss · as_of
```

Three properties the current MLB implementation already proves are necessary:

- **`captured_at` AND `available_at` on every market row.** The distinction is what makes leakage
  provable; MLB's archive has it, and it is the single most valuable field in the repo.
- **`unavailable` as a first-class terminal state.** Sprint 037B showed that without it, denominators
  shrink silently.
- **Settlement defaults to `pending`, never `loss`.** Already true in
  `mlb-markets.ts:21-30` — preserve it.

---

## Phase 3 — data retention

| | Measured |
|---|---|
| Capture directories | **106** (2026-07-22 → 07-28) |
| Manifests retained | **106** ✅ |
| Payloads retained | **2** ❌ (`raw.json` / `normalized.json` gitignored) |
| Recoverable | Only via GitHub Actions artifacts, 90-day expiry |
| Cost to retain everything | **21 MB/day · 7.4 GB/year** |

The discarded `normalized.json` is the richest schema in the repo — per-row `capturedAt`,
`availableAt`, `sourceLastUpdate`, `bookmaker`, `noVigProbability`, `researchEligible`.

**Priority order stands: Retention → Series → Timeline → Visualization.** No movement feature before
durable history exists. At 7.4 GB/year the only real question is *where*, not *whether*.

---

## Phase 4 — sport readiness (re-measured today)

| Sport | State | Newest artifact | Ingestion | Settlement | Shares code with MLB |
|---|---|---|---|---|---|
| **MLB** | FULL_MODEL | 2026-07-27 (1d) | StatsAPI + Odds API | StatsAPI box scores | — |
| NBA | HISTORICAL_ONLY | — | stats.nba.com (failing since 06-13) | none live | **none** (~950 lines duplicated) |
| UFC | SCAFFOLD_ONLY | — | ESPN → 9-step pipeline | own grader | **none** |
| Soccer | SCAFFOLD_ONLY | — | API-Football + Odds API | **two parallel** impls (Py + TS) | partial |
| NHL | SCAFFOLD_ONLY | 2026-05-24 (65d) | **none exists** | none | `currentEtDate` only |
| IPL | SCAFFOLD_ONLY | 2026-05-24 (65d) | cricket fetchers | none | `currentEtDate` only |
| WNBA · MLS | SCAFFOLD_ONLY | — | none | none | none |
| EPL · NFL | DISABLED | — | none | none | none |

Every cited evidence path exists; no cited directory is empty. **No promotion is warranted.**

---

## Phase 5 — UFC and soccer research plans

The question is *"can we build a credible research database?"* — not *"can we pick winners?"*

**UFC.** Feasible as research, weak as prediction. Real assets: ESPN schedule ingestion, fighter
stats, a 9-step pipeline, an existing grader. Blockers on record: `status/ufc-graduation-decision.json`
says `DOWNGRADE_TO_SCAFFOLD_ONLY` with `fullyBacktestableBouts = 0` and **confirmed leakage** (a
date-agnostic name-key join paired rematch pregame lines with past-fight results). Its moneyline output
is ≈ de-vigged market ±4pp shrunk 50% — near-zero independent signal.
*Plan:* fix the identity join first (dated fighter keys), capture markets with `captured_at` +
`available_at`, settle from official results. **Do not model until the join is proven leakage-safe.**

**Soccer.** Richest data, worst proven signal. The internal FIFA-Poisson engine ties its own naive
baseline exactly (top-pick .563 vs FIFA-favourite .563), tuning made it *worse* out-of-fold, and V2
with form degrades monotonically. World Cup is closed out as an active destination.
*Plan:* xG / shots / possession / lineups / travel as a **research corpus** with strict pre-match
timestamps. Multi-book market capture. No model claim.

Both plans stop at "credible research database". Neither proposes a prediction surface.

---

## Phase 6 — product audit

Sprints 035–036 already did the remediation; this re-confirms disposition.

**KEEP** — Market Center, Game Reports, Results + model-audit, calibration tooling, `daily-brief`
(the one selector with no edge input).
**REWORK** — Top Picks and Model Board (re-ranked off gap in 035; sort defaults still worth a pass);
`/sports` and `/about` each have exactly one inbound link.
**RETIRE** — 10 zero-inbound routes; the 4 redirect stubs stay but nothing internal should link them
(guarded since 036); 53 orphaned components.
**PAUSE, do not delete** — Bank Builder and Moonshot. Ledger, settlement and audit trail intact;
language honest (Moonshot states its 0–7). Whether a 0–7 product keeps a nav slot is a product call.

Confidence/edge language: neutral **Category A/B/C** with measured settle rates, guarded against
drift by `confidence-rate-accuracy.test.mjs`.

---

## Phase 7 — automation review

| Stage | State | Evidence |
|---|---|---|
| Capture | ✅ working | 16 freezes = 16 scheduled games today |
| Generate | ⏳ **unobserved** | `morning-projections` 95 min past cron at 15:05Z — *not due-failed*, scheduler-delayed |
| Publish | ✅ proven | production `58c15458`, build clock today, in sync |
| Settle | ✅ strongest | 51/54 dates reconcile exactly |
| Evaluate | ✅ honest | publishes Brier .2564 vs market .2375 against interest |
| Archive | ⚠️ **lossy** | 104/106 payloads discarded |

**Silent failures fixed in 037B** — job-level `continue-on-error` removed; push failure retries then
fails; `roll_to_next_day.sh` now names failing tests (it had printed `tail -5` while
`daily-lifecycle` failed four days running).

**Alerting: wired but inactive.** Verified by listing repo secrets — only `API_FOOTBALL_KEY`,
`BALLDONTLIE_API_KEY`, `ODDS_API_KEY` exist. `OPS_WEBHOOK_URL` and `VERCEL_DEPLOY_HOOK_URL` are
absent. A failure reaches Actions and the logs; **it does not reach the founder.**

**Scheduler delay is a first-class operational fact**, not noise: measured +74 to +146 minutes on
`morning-projections`; today `mlb-research-integration` ran +143. The readiness dashboard's grace was
recalibrated to 210 minutes on this evidence.

---

## Sprint 039 recommendation — **market payload retention**

Highest leverage, and the only item that gets permanently worse with delay.

- **Cost is now known and trivial**: 7.4 GB/year. The four-sprint blocker was partly my own bad number.
- **Irreversible**: 104 captures already lost; ~16/day continue to be discarded.
- **Unblocks the thesis.** "What the market believed, and when" is the one claim needing no model.
- **Prerequisite for everything else.** Series → timeline → visualisation all depend on it.

Analytics activation is the close second (two env vars, and every product decision is a guess without
it) — but it loses no history by waiting a sprint. Retention does.

**Not recommended now:** user accounts (unmeasurable without analytics), model/calibration research
(gated at 4/30 dates), sports expansion (nothing warrants promotion).

---

## Founder decisions required

1. **Where market payloads live** — object storage vs compacted daily roll-up. 7.4 GB/year. *Blocking Sprint 039.*
2. **`OPS_WEBHOOK_URL`** — alerting is live in code and silent without it. `daily-lifecycle` failed four days unnoticed.
3. **`VERCEL_DEPLOY_HOOK_URL`** — the static clock still cannot advance on a no-commit day.
4. **Analytics endpoint** — zero user behaviour has ever been measured.
5. **Bank Builder / Moonshot nav placement** — product call, not engineering.

---

## Open, stated as unknown

**Do automated `[skip ci]` commits trigger a deploy?** Still unknown. Both deploys observed today
followed human pushes carrying no skip token, and no bot commit has landed since the marker went live.
It is now *testable*: if tomorrow's automated data commits advance the build clock with no human push,
Vercel ignores the token; if the clock stalls on a bot-only day, it honours it. The answer will come
from `npm run verify:deployment`, not from inference.
