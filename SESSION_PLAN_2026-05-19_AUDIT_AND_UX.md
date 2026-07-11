# SESSION PLAN · 2026-05-19 · MODEL AUDIT + UI REVAMP

> **Status:** plan only. Not yet executed.
> **Author:** new session, picking up from PR #61.
> **Inputs:** real settled data from `pipeline/validation/settled_leans.jsonl` (NBA, 520 rows) and `pipeline/validation/mlb_settled_leans.jsonl` (MLB, 582 rows), after May 19 NBA settlement landed.
> **Hard rule:** every finding in this file is grounded in real numbers. Nothing fabricated.

---

## 0. What this session has already done

1. Read the full handoff.
2. Verified branch (`feature/results-model-audit-notes` @ `9331922`), PR #61 OPEN · CLEAN · MERGEABLE.
3. Pulled May 19 NBA box score from ESPN (`401873341` · `Final/OT · NY 115 · CLE 104`).
4. Ran `pipeline.settle_results --date 2026-05-19` → **50–98 on 148 decisive · 33.8%** (only 1 game).
5. Ran `pipeline.export_results` → public JSONL now 520 rows · 4 dates · lifetime 279–241 · **53.7%**.
6. Cross-sport lifetime now **572–530 on 1102 decisive · 51.9%** (was 54.7% on 954).
7. Verified the static build picks up May 19 and audit notes auto-update.
8. Ran 10 pipeline tests + typecheck + Next build — all green.
9. Confirmed dynamic audit notes (`/results`, `/results/nba`) reflect the new honest numbers.

> **The model just took a 33.8% beating on a single playoff/elimination game.** That is the most informative day in the dataset so far. It is the centerpiece of this audit.

---

## 1. Updated honest scoreboard

| Sport | Wins | Losses | Pushes | Decisive | Hit rate | Dates |
|---|---|---|---|---|---|---|
| NBA | 279 | 241 | 0 | 520 | **53.65%** | 4 (May 15, 17, 18, 19) |
| MLB | 293 | 289 | 0 | 582 | **50.34%** | 2 (May 16, 18) |
| **Combined** | **572** | **530** | **0** | **1102** | **51.90%** | 6 unique slate-dates |

The previous "61.6% NBA" claim is gone. The reality after May 19 is **53.65% NBA**, and **51.9% cross-sport**. Both numbers round to "barely above coin flip on an early sample."

---

## 2. Deep model audit — findings grounded in settled data

### 2.1 Per-date NBA is wildly volatile

| Date | Record | Hit rate | Notes |
|---|---|---|---|
| 2026-05-15 | 80–65 / 145 | 55.2% | Mixed slate, no single outlier player |
| 2026-05-17 | 41–20 / 61 | 67.2% | Small slate, single competitive game |
| 2026-05-18 | 108–58 / 166 | 65.1% | SA @ OKC; star scoring landed near projections |
| **2026-05-19** | **50–98 / 148** | **33.8%** | **NY 115 OT win over CLE; Brunson 38 PTS** |

Per-game hit-rate stdev across 5 settled games = **12.5pp**. Range 33.8%–67.2%. That dispersion is the model's #1 structural problem.

### 2.2 Confidence tier no longer differentiates (NBA)

| Tier | Record | Hit rate |
|---|---|---|
| High | 197–166 / 363 | 54.3% |
| Medium | 36–27 / 63 | 57.1% |
| Low | 45–48 / 93 | 48.4% |

Before May 19 the High tier was 61.1% on 247. Adding May 19's 39.7% High-tier performance crashed that to 54.3%. **High tier is now barely above coin flip**, and Medium edges it out on a smaller sample. This is real evidence that the High-confidence calibration is broken.

### 2.3 Edge magnitude is non-monotonic with success (NBA quartiles)

| Quartile (|edge|) | Range | Hit rate (n) |
|---|---|---|
| Q1 lowest | 0.1–6.0pp | 50.0% on 130 |
| Q2 | 6.0–11.4pp | 58.5% on 130 |
| Q3 | 11.5–18.8pp | 45.4% on 130 |
| Q4 highest | 19.1–43.6pp | 60.8% on 130 |

Q3 is the worst quartile. This means **mid-edge picks (11–19pp) are anti-signal**, while extreme edges (Q4) outperform. The R5 anomaly cap that suppresses |edge|>25pp picks to Low is therefore **over-aggressive** — it's killing the model's strongest cohort.

### 2.4 Markets — strongest and weakest

| Market | Record | Hit | avg |err| | stdev err | bias (proj err) |
|---|---|---|---|---|---|
| REB | 104–74 / 178 | **58.4%** | 2.42 | 2.37 | −0.29 (slight over-proj) |
| PTS | 104–91 / 195 | 53.3% | **5.66** | **4.90** | +0.72 |
| AST | 71–76 / 147 | **48.3%** | 1.67 | 1.34 | +0.60 |

- **REB is the only NBA market with persistent edge.** Lowest dispersion across dates.
- **PTS has the largest projection error (5.66 avg).** Volatile because star usage spikes (May 19 Brunson model 24.4 → actual 38.0, |err|=13.6).
- **AST is structurally weak (48.3%, below coin flip).** Average error is small but the model has no real edge.

### 2.5 Side bias and side × market

| Side | Record | Hit |
|---|---|---|
| Over | 192–174 / 366 | 52.5% |
| Under | 87–67 / 154 | 56.5% |

Under leans still outperform, but the margin shrunk after May 19.

| Side × Market | Record | Hit |
|---|---|---|
| REB Over | 71–43 / 114 | **62.3%** ← strongest |
| AST Under | 25–12 / 37 | 67.6% (small) |
| **AST Over** | **46–64 / 110** | **41.8%** ← weakest |
| PTS Under | 29–24 / 53 | 54.7% |
| PTS Over | 75–67 / 142 | 52.8% |
| REB Under | 33–31 / 64 | 51.6% |

**AST Over is structurally broken.** 41.8% on 110 picks. That cohort drags the entire AST market down.

### 2.6 What broke on May 19 (root-cause forensics)

| Player | Record | What happened |
|---|---|---|
| Jalen Brunson | 0–12 | line 27.5, projected 24.4, actual 38 — model under-projected star by 13.6 |
| Mikal Bridges | 0–12 | line 13.5, projected 11.05, actual 18 — under-projected secondary scorer |
| Max Strus | 0–12 | leans across all 3 markets all hit Over targets that never came |
| Jarrett Allen | 0–12 | model projected 17.89 PTS, actual 10 — over-projected center on Cleveland's losing side |
| Karl-Anthony Towns | 4–8 | 18.5 PTS line, model 20.32, actual 13 — over-projected secondary scorer |
| Miles McBride | 4–6 | 0 PTS final — model still projected 9.38 (rotation collapse signal absent) |

Side × market on May 19:
- PTS **Over**: 10–30 / 40 (25%)
- PTS **Under**: 0–16 / 16 (**0%**)
- AST **Over**: 4–22 / 26 (15.4%)
- AST **Under**: 8–8 / 16 (50%)
- REB Over: 20–14 / 34 (58.8%)
- REB Under: 8–8 / 16 (50%)

REB market held up reasonably well; PTS and AST collapsed in both directions. PTS Under going 0–16 is the smoking gun: **the model assumed neither team's stars would erupt in an elimination/closeout game with OT pace, and they did**.

The model has no concept of:
- **Game leverage** (elimination, closeout, Game 7, etc.)
- **Star usage spikes** under playoff pace
- **Rotation compression** (bench players like McBride going from 8 PTS projection to a DNP/0)
- **Pace expansion via OT** (every counting stat inflated)

### 2.7 MLB has no edge at all (and high-edge picks are anti-signal)

| Tier | Record | Hit |
|---|---|---|
| High | 128–123 / 251 | 51.0% |
| Medium | 37–39 / 76 | 48.7% |
| Low | 128–127 / 255 | 50.2% |

**MLB confidence tiers don't separate — every tier is within 2pp of coin flip.** That alone says the MLB model is not adding information.

Edge quartile is worse:

| Quartile | Range | Hit rate |
|---|---|---|
| Q1 lo | 0.0–2.1pp | 47.6% |
| Q2 | 2.1–5.0pp | 50.3% |
| Q3 | 5.0–11.2pp | **58.6%** |
| Q4 hi | 11.3–37.0pp | **44.1%** |

**MLB high-edge picks LOSE more than 56% of the time.** Q4 is the worst cohort. The model's "I'm 30pp from the line" signal is actively wrong on MLB.

Market-level on MLB:

| Market | Record | Hit | avg |err| |
|---|---|---|---|
| batter_hits | 191–186 / 377 | 50.7% | 0.70 |
| batter_total_bases | 82–80 / 162 | 50.6% | 1.45 |
| **pitcher_strikeouts** | **20–23 / 43** | **46.5%** | 1.77 |

Pitcher strikeouts is the weakest MLB market. **Hits Over outperforms Hits Under (54.9% vs 44.4%)** while **Total Bases Under outperforms Over (59.2% vs 46.9%)**. Inconsistent directional signal across markets within the same sport.

---

## 3. Highest-impact model weaknesses (ranked)

| # | Weakness | Evidence | Suggested architectural fix |
|---|---|---|---|
| 1 | No game-leverage / playoff-pace context | May 19 PTS Under 0–16 in elimination OT game | Add a `gameContext` feature: series_state, elimination flag, pace_projection from team-level proj totals, OT flag (post-hoc). Feed into player projection adjustment per market. |
| 2 | Edge magnitude is non-monotonic — Q3 worst | Q3 (11–19pp) hits 45.4% | Replace edge → confidence rule with **isotonic regression** trained on settled (edge, win) pairs per sport. Edge bands become weighted instead of fixed-cutoff. |
| 3 | High confidence ≠ high hit rate | NBA High 54.3%; MLB High 51.0% | Add **Platt scaling / Bayesian calibration** on confidence buckets. Re-emit calibrated probability rather than nominal tier. |
| 4 | AST Over is broken on NBA | 41.8% on 110 | Per-market sub-model. AST depends on teammate scoring distribution and pace; need teammate-context features. |
| 5 | MLB model has zero edge | 50.3% lifetime, no tier signal, Q4 anti-signal | Either: (a) suspend MLB publishing pending model rewrite; or (b) explicit "model under review" banner site-wide. Architecture: rebuild MLB model with park factors, BVP, ump zone, weather. |
| 6 | PTS projection variance enormous | stdev 4.90 on PTS errors | Add **ensemble** of (recent10 model, season-average model, matchup-pace model) with weighted blending. Currently single-model. |
| 7 | Star usage spikes invisible | Brunson 38 vs 24.4 proj | Add **usage_rate** + **leverage_multiplier** features. Star players in close/elimination games get a usage spike. |
| 8 | Rotation collapse blind | McBride 0 vs 9.38 proj | Add **minutes_projection** with availability/news layer. If projected minutes < 18 AND last-game minutes < projected, downgrade. |
| 9 | R5 anomaly cap kills strong cohort | Q4 hits 60.8% but mostly stamped Low | Loosen R5: anomaly cap only when |edge|>25pp AND recent10 stdev > 2x season stdev. |
| 10 | No line-movement signal | No close vs open line tracking | Add **line history** persistence (snapshot at projection time + 1hr/2hr/closing). Train on whether model agreed with line drift. |
| 11 | No bookmaker consensus | Two-book sample only | Add 3rd+ book (BetMGM, Caesars) for consensus median line. Project against consensus, not single book. |
| 12 | No grading of past errors fed back | Settlement is downstream only | Build **continuous-learning loop**: settled errors per (player, market) write a recency-weighted bias term that next projection consumes. |

---

## 4. Proposed audit / continuous-learning framework

Two distinct subsystems. Neither requires ML magic — both are honest engineering.

### 4.1 `pipeline/model_audit.py` — nightly audit report

**Purpose:** turn settled JSONLs into a structured JSON artifact per night, so audit notes + UX surfaces stop being hand-derived.

**Output:** `app/public/data/audit/model_audit.json` with:
```
{
  "generatedAt": "...",
  "sport": "nba" | "mlb" | "cross",
  "sampleSize": { "decisive": N, "dates": M },
  "byMarket": { "PTS": { "wins":..., "losses":..., "avgAbsErr":..., "bias":..., "stdev":... }, ... },
  "bySide": { "Over": {...}, "Under": {...} },
  "byConfidence": { "High": {...}, "Medium": {...}, "Low": {...} },
  "byEdgeBand": { "00-05pp": {...}, ... },
  "byEdgeQuartile": [{"q":1,"range":[...],"hit":...}, ...],
  "perGameDispersion": { "stdev": ..., "minHit": ..., "maxHit": ..., "n_games": ... },
  "calibrationCurve": [{"projWinProb": 0.5, "actualWinProb": ...}, ...],
  "weakCohorts": [{"name": "AST Over (NBA)", "hit": 0.418, "n": 110, "weight": "Signal"}],
  "strongCohorts": [{"name": "REB Over (NBA)", "hit": 0.623, "n": 114, "weight": "Signal"}]
}
```

Wired up by the existing nightly settle workflow (PR #60) — adds one step at the end that runs `python -m pipeline.model_audit && python -m pipeline.export_audit`.

The `app/src/lib/results-audit-notes.ts` helper switches from inline JSONL parsing to reading the new audit JSON directly. **One source of truth.** Removes the drift risk.

### 4.2 `pipeline/feedback_loop.py` — recency-weighted error bias

**Purpose:** the model currently ignores its own historical errors. Every settled row tells us per-(player, market) the model was off by X. Persist that as a bias term that **next projection** consumes.

**Output:** `pipeline/state/player_bias.json` with `{ playerId_market: { ewmaError, ewmaErrorStdev, lastUpdated, n_settled } }`.

**Integration:** `pipeline.score_prop` reads this file and adjusts projection by a fraction of the EWMA bias (e.g. `projection_adjusted = projection - 0.4 * ewmaError`). The fraction is itself tunable and validated against settled data via leave-one-day-out.

**Why this is safe and honest:**
- Pure post-hoc bias correction — no fabricated "learning" claim.
- Easy to disable per-player or per-market.
- Surfaces on `/results` as a "model bias-adjusted projection" badge so users see exactly what changed.

### 4.3 `pipeline/calibration.py` — isotonic regression + Platt scaling

**Purpose:** convert raw edge into a calibrated win probability that reflects the actual settled hit-rate curve, instead of fixed-cutoff confidence tiers.

Trained on all (|edge|, side, market) → win pairs. One model per (sport, market). Output: `app/public/data/audit/calibration.json` with the per-sport piecewise calibration curve.

The confidence tier (High/Medium/Low) becomes derived: `High = calibrated probability ≥ 0.60`, `Medium = 0.52–0.59`, `Low = below`. Currently it's the inverse — tier is set first, then edge stamped on top.

### 4.4 Input gaps to close

Not all of these are immediately shippable. Ranked by ROI:

| Input | What it unlocks | Effort | Honest framing |
|---|---|---|---|
| **Series state + elimination flag** | Captures playoff leverage | Low (free public data) | Already implicit in NBA scheduling — add a `gameContext.seriesState` field |
| **Projected minutes per player** | Rotation collapse detection | Medium (BettingPros / Rotowire scrapes or internal heuristic from recent_minutes) | Persist with each lean, surface in projection card |
| **Pace projection per game** | OT/blowout sensitivity | Low (team pace + opponent pace combined) | Already half-computed in lib/data-nba |
| **Line movement** | Sharp money signal | Medium (snapshot odds at +1hr/+2hr/close) | Wire into existing odds_props snapshot |
| **Consensus line (3rd book)** | Reduces single-book noise | Medium (one extra Odds API book) | ~25% more credits per fetch |
| **Injury report (active/probable/out)** | Removes hidden DNPs | Medium (ESPN or rotowire feed) | Manual `news_signals.json` already exists; promote to auto-feed |
| **Player usage rate + on-court rate** | Star-game adjustment | Medium (already in nba_api game logs) | Compute USG% per recent10 |
| **Park factors + weather (MLB)** | MLB pitcher/batter context | High (BaseballSavant / FanGraphs API) | Major rewrite of MLB model |
| **Umpire zone (MLB)** | Pitcher strikeouts | High (UmpScorecards / EVAnalytics) | Niche, defer |
| **Embedding / vector memory** | Cross-game similarity retrieval | High | Premature given sample size; defer to roadmap |
| **Bayesian ensemble** | Combines model variants | High | Defer until base inputs above are in |

### 4.5 What to *not* build (for now)

- **No "AI" / LLM in the projection path.** Buzzword without data signal. Defer.
- **No autotuning of confidence cutoffs on the fly.** Calibration must be reproducible and audited.
- **No retroactive rewriting of past settled rows** to "improve" hit rate. Settled is settled.
- **No fake parlay hit rate.** Persistence of candidate slips first; numbers later.

---

## 5. Highest-impact UI/UX problems (ranked)

Walk-through pulled from §13 of the handoff and a fresh review of the current production routes. Highest impact first.

| # | Problem | Surface | Suggested PR scope |
|---|---|---|---|
| 1 | Homepage hero is dense, repeated tiles, no "today's projections at a glance" | `/` | Tighten hero, collapse 10 sections to 6, add a "Today's Floor" command row |
| 2 | No date-picker rail on `/nba/board` and `/mlb/board/[date]` | Board pages | New `BoardDatePicker` strip above existing tabs, status-aware pills, settled dates link to `/results/date/<date>` |
| 3 | Sport overview pages (`/nba`, `/mlb`, `/nhl`, `/ipl`) use different hero patterns | Sport overview | Unified `SportOverviewHero` component used by all four sports |
| 4 | Settled board pages link to `/results/date/<date>` but the audit landing is text-heavy | `/results/date/<date>` | Add visual hit/miss/push chips per market, denser per-game breakdown |
| 5 | No model-audit deep-dive surface | (none) | New `/results/model-audit` page that renders the JSON from `model_audit.py` |
| 6 | Mobile route switcher is the same horizontal tab strip everywhere | All routes (mobile) | Compact sticky bottom-bar on mobile (Home / Boards / Parlay / Results) |
| 7 | Methodology / Responsible Use pages look pre-redesign | `/methodology`, `/responsible-use` | Apply unified hero + bullet structure |
| 8 | Live vs Settled vs Upcoming distinction is only the new banner | Board pages | Extend banner with live score in LIVE state, settled hit rate in SETTLED state |
| 9 | Anatomy / explainer block on homepage is paragraph-dense | `/` | Move to `/methodology`; replace homepage block with 1-row visual |
| 10 | No global breadcrumb | All sub-pages | Lightweight breadcrumb above hero on `/results/*`, `/mlb/board/<date>`, `/nba/parlays` |

---

## 6. Recommended PR scope (next two PRs)

### PR #62 — feat(audit): model audit framework + honest calibration surface

**Why this first:** unblocks every other UI claim. Right now the audit notes are derived inline in TypeScript and need to be re-derived every time a new metric matters. A real `model_audit.json` artifact + `/results/model-audit` page gives the user one place to see what the model is actually doing, and the framework underneath lets future calibration work plug in.

**Scope:**
1. New `pipeline/model_audit.py` — produces `app/public/data/audit/model_audit.json` per sport.
2. New `pipeline/model_audit_test.py` — coverage on per-market / per-edge / per-confidence / per-quartile aggregation, dispersion stats, calibration curve construction.
3. Hook `pipeline/automation_settle.sh` to run the audit module after settlement so the JSON refreshes nightly with no extra cron job.
4. Refactor `app/src/lib/results-audit-notes.ts` to consume the JSON instead of parsing JSONL inline (preserves all existing audit-note behavior).
5. New `app/src/app/results/model-audit/page.tsx` — visual deep-dive: per-market table, per-quartile calibration curve, per-game dispersion bar, weak/strong cohorts.
6. Update PR #61 audit-note copy: surface the **May 19 collapse** as a Signal, surface the **edge-quartile non-monotonicity** as a Signal, surface the **MLB Q4 anti-signal** as a Signal.
7. Update the path-forward note: list the architectural fixes from §3 as "what the audit is watching next" without claiming any of them ship yet.

**Out of scope for #62:**
- No model code changes (no scoring adjustments, no calibration, no feedback loop yet).
- No UI revamp of homepage / sport pages — handled in #63.

**Verification:**
- Run all 11 pipeline tests + new `model_audit_test`.
- Run typecheck + build.
- Open the new `/results/model-audit` page on desktop + 390 mobile.
- Confirm `/results`, `/results/nba`, `/results/mlb` audit notes still render correctly (same content, new data path).
- Confirm no forbidden copy.

### PR #63 — feat(ui): unified sport command center + board date picker

**Scope:**
1. New shared `SportOverviewHero` component used by `/nba`, `/mlb`, `/nhl`, `/ipl`.
2. New `BoardDatePicker` strip on `/nba/board`, `/mlb/board/[date]`, `/board`. Status-aware pills (LIVE / SETTLED / UPCOMING / PENDING). Settled dates deep-link to `/results/date/<date>`.
3. Homepage tightening: collapse trending-tabs + explainer + MLB-rail into a single "Today's floor" command row.
4. Mobile sticky bottom-bar (Home / Boards / Parlay / Results).
5. Methodology + Responsible Use hero polish.

**Out of scope for #63:**
- Parlay Lab redesign (blocked until candidate-slip persistence exists).
- New content surfaces. Visual + IA only.
- Model architecture work — separate PRs once `model_audit.json` is in.

**Verification:** all 16 routes at desktop + 390 mobile + full pipeline test suite + typecheck + build.

### Future PRs (roadmap, not now)

- **PR #64** — `pipeline/feedback_loop.py` + EWMA bias persistence + `score_prop` integration. Honest, additive, opt-in.
- **PR #65** — `pipeline/calibration.py` + isotonic regression. New `confidence` derivation from calibrated win-prob.
- **PR #66** — Line-movement snapshot persistence + sharp-money signal.
- **PR #67** — Candidate-slip pre-game snapshots → unlocks `/results/parlays` real hit rate.
- **PR #68** — Game-context features (series state, elimination, pace, minutes).
- **PR #69** — MLB model rewrite (park factors, weather, umpire — only after audit shows MLB still flat).

---

## 7. What is honestly true after May 19

- **NBA hit rate: 53.65%** on 520 settled · 4 dates. Marginal edge, very high single-game dispersion.
- **MLB hit rate: 50.34%** on 582 settled · 2 dates. **No edge** by any cut.
- **Combined: 51.90%** on 1102. Above coin flip, below any meaningful claim.
- **High confidence is not differentiating.** NBA High 54.3%. MLB High 51.0%.
- **Edge magnitude is non-monotonic.** Q3 NBA bad; Q4 MLB bad.
- **REB Over is the only genuinely strong NBA cohort.** 62.3% on 114.
- **AST Over is the weakest cohort.** 41.8% on 110.
- **The model has no game-leverage awareness.** May 19's elimination/OT context was invisible to it.

---

## 8. Honest rules carried forward

- No "the model is learning" claim until the feedback loop ships AND is validated against held-out settled data.
- No "improved calibration" claim until isotonic regression is fit AND tested.
- No "80% accuracy goal" claim anywhere on the site.
- No parlay hit rate until candidate slips are persisted before games.
- Pushes excluded. Pending excluded. Forbidden copy still forbidden.
- May 19's 33.8% stays in the record. It is not corrected, not retroactively adjusted, not "fixed."

---

## 9. Awaiting user decision before coding

Please confirm:
1. **PR #61 — merge or hold?** All 3 Vercel checks pass, audit notes auto-updated to new May 19 numbers. Recommend **merge** so PR #62 can branch fresh from `main`.
2. **PR #62 scope OK?** (audit framework + `/results/model-audit` page + audit-note refactor + path-forward update).
3. **PR #63 scope OK?** (sport overview hero + board date picker + homepage tightening + mobile sticky + methodology polish).
4. **Anything from §3 / §4 you want fast-tracked into PR #62?** (e.g., loosening R5 anomaly cap is a 10-line change with measurable effect; series-state flag is a low-effort feature add.)

I won't write any new code on `main` or on a new branch until you confirm scope.
