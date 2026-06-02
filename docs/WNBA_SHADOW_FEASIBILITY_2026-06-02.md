# WNBA Shadow-First Projection Feasibility (2026-06-02)

> **Feasibility / shadow-readiness assessment — docs-only.** This change adds
> **no code, no script, no data, and no registry change.** WNBA stays
> **schedule-only**. There are **no public WNBA projections or parlays**, and
> WNBA is **not** flipped to modeled. No fabricated data; no performance
> claims; #245 stays shadow-only; `audit/policy.json` not consumed.

---

## 1. Executive summary

WNBA is the closest analog to our modeled NBA pipeline, but it is **not ready
to model**. Today WNBA has a **real, attributed schedule snapshot only**
(ESPN). The blocking gaps are **odds/player-prop ingestion, a WNBA player-stat
source, and grading** — none exist in the repo. The NBA projection *math*
(`score_model.py`) and the optimizer are largely reusable, but the **data
ingestion + settlement layers are NBA-specific** and the **single biggest
blocker is whether a WNBA player-prop odds source is even available** to us.

**Verdict: KEEP WNBA SCHEDULE-ONLY.** This PR documents the readiness gap and a
shadow-first plan. No shadow tooling is added because there is **no real WNBA
odds/stats/grading data in the repo for a script to inspect** — building one now
would either read nothing or require a new external integration (out of scope,
approval-gated).

---

## 2. Current WNBA status

- **Public status:** `schedule` level in
  [`app/src/lib/sports-coverage.ts`](../app/src/lib/sports-coverage.ts)
  (lines ~96–102) — "Upcoming games — schedule only, no odds or projections."
  Rendered on `/events` only; no projections/parlays/results links.
- **Schedule data:** a real, attributed ESPN snapshot in
  [`app/src/lib/event-schedules.ts`](../app/src/lib/event-schedules.ts)
  (~8 games, 2026-06-02→06-05; source + retrievedAt stamped).
- **No WNBA pipeline code, no `app/public/data/wnba/` directory, no WNBA
  optimizer/grading/results.** (`nba_api` in `.venv` exposes WNBA static
  helpers, but the pipeline never calls them.)

---

## 3. Readiness checklist (a sport may go "Projections + Parlays" only if ALL true)

1. Real schedule source — **YES** (ESPN snapshot).
2. Real odds / prop-market source — **NO**.
3. Real player-stat source (game logs) — **NO** (not wired).
4. Projection model — **PARTIAL** (NBA `score_model.py` reusable; WNBA
   calibration missing).
5. Pregame-safe outputs — **N/A until inputs exist**.
6. Optimizer can build WNBA slips — **PARTIAL** (optimizer is sport-aware; no
   WNBA profiles/weights/DNP rules).
7. Settlement/grading for all markets — **NO**.
8. Results display — **NO**.
9. `publicRiskSections` generation — **NO**.
10. Volume discipline (#241) applies — would inherit once wired.
11. UI can filter by sport — capability gates exist (`sport-capabilities.ts`);
    WNBA would flip from `schedule_only` only after promotion.
12. No fabricated/fake cards — **enforced** (gates + this policy).
13. Docs updated — this doc.

**Result: requirements 2, 3, 7, 8, 9 are missing → WNBA cannot be promoted.**

---

## 4. Data-source audit

| Requirement | Current evidence | Ready? | Blocker | Next step |
|-------------|------------------|:-----:|---------|-----------|
| Schedule | ESPN snapshot in `event-schedules.ts` (attributed) | **yes** | snapshot only, not live | keep as schedule-only |
| Odds / props | Odds API key hardcoded `basketball_nba` (`fetch_game_markets.py` `SPORT_KEYS`, `odds_api_provider.py`); no `basketball_wnba` | **no** | **WNBA player-prop odds availability is unverified** | verify whether The Odds API (or another source) offers WNBA player props — **approval-gated** |
| Player stats | NBA-only resolver/fetcher (`player_resolver.py`, `fetch_nba_data.py`); `nba_api` has WNBA static helpers, unused | **no** | no WNBA player index / game-log path wired | build a WNBA player resolver + game-log fetch (shadow) |
| Projection model | `score_model.py` is sport-agnostic (`P(over)=1−Φ((line−proj)/σ)`) | **partial** | dispersion floors NBA-calibrated (`build_features.py`); WNBA stat variance differs | recalibrate σ floors on real WNBA logs |
| Optimizer support | `parlay_optimizer.py` takes a `sport` param; per-(sport,market) weights | **partial** | no WNBA profiles/weights/DNP rules | add WNBA config once real legs exist |
| Grading | `settle_results.SUPPORTED_MARKETS = PTS/REB/AST`; `grade_optimizer._SPORTS = nba/mlb/multi/all` | **no** | no WNBA box-score settlement source/markets | add `settle_wnba_results` + box-score source (shadow) |
| Results | Results assumes NBA/MLB buckets | **no** | no WNBA results path | extend after grading exists |
| UI capability | `sport-capabilities.ts` gates by `level`; WNBA = `schedule_only` | **gated** | none — fail-closed | flip `level` only after the pipeline ships |

---

## 5. NBA → WNBA reuse analysis

**Reusable as-is (sport-agnostic):**
- `pipeline/score_model.py` — projection→probability math, edge, de-vig.
- `pipeline/parlay_optimizer.py` — sport-aware core (takes `sport`); leg
  scoring, correlation caps, slip assembly.
- `pipeline/build_features.py` core feature functions (mean/std/slope).
- Frontend capability gates (`sport-capabilities.ts`) + `/events` rendering.

**NBA-specific (needs sport-aware routing or WNBA variants):**
- `pipeline/player_resolver.py` — loads the **NBA** static player index.
- `pipeline/fetch_nba_data.py` / `providers/nba_api_provider.py` — NBA game-log
  provider chain (no WNBA dispatcher).
- `pipeline/providers/odds_api_provider.py` + `fetch_game_markets.py` —
  hardcoded `basketball_nba` sport key.
- `pipeline/settle_results.py` — NBA box-score source + `SUPPORTED_MARKETS`.
- `pipeline/star_players.py` — NBA star registry.

**WNBA-specific config that a shadow model would need (real values only):**
- Dispersion (σ) floors per market, calibrated on real WNBA game logs (NBA
  floors PTS 6 / REB 3 / AST 2.5 are likely too high for WNBA).
- Game-log window + confidence thresholds suited to the shorter WNBA season.
- The actual WNBA prop markets a book offers (PTS/REB/AST may not match).
- Optimizer profile rules / market weights for WNBA.

**Risk of copying NBA blindly:** different roster sizes, minutes distributions,
stat variance, season length, and prop-market scope. Copying NBA constants
without real WNBA data would produce **mis-calibrated, effectively fabricated**
projections — explicitly disallowed.

---

## 6. Blockers (ranked)

1. **Odds / player-prop source (highest).** No WNBA prop ingestion exists, and
   WNBA player-prop availability from our odds provider is **unverified**.
   Without real lines, the whole projection→edge pipeline cannot run.
2. **WNBA player-stat / game-log source.** Needs a WNBA player resolver +
   game-log fetch path (NBA ones are hardcoded).
3. **Grading / settlement.** No WNBA box-score source or graded markets.
4. **Calibration.** σ floors + thresholds must be derived from real WNBA data,
   not inherited from NBA.

---

## 7. Shadow-only implementation plan (NOT in this PR; approval-gated, one step at a time)

1. **Verify the odds source** offers WNBA player props (PTS/REB/AST or the real
   WNBA market set). If not → STOP; WNBA stays schedule-only. *(Decision gate.)*
2. **WNBA schedule ingestion** (already have a snapshot; add a real fetcher if
   promoting).
3. **WNBA odds/props ingestion** — add `basketball_wnba` sport key behind a
   shadow flag; write to a `wnba/` shadow data path (not public).
4. **WNBA stat inputs** — WNBA player resolver + game-log fetch.
5. **WNBA projection model** — reuse `score_model.py` with **WNBA-calibrated**
   σ floors/thresholds; output a **shadow** board (never public).
6. **WNBA shadow optimizer output** — run the sport-aware optimizer on WNBA
   legs into a shadow snapshot.
7. **WNBA shadow grading** — `settle_wnba_results` against a real box-score
   source; grade the shadow slips.
8. **WNBA audit reports** — calibration/accuracy on settled shadow slates
   (like the #240/#245/#249 offline audits).
9. **Graduate to public only when ALL hold:**
   - real pregame inputs (schedule + odds + stats), no fabricated missing
     values;
   - real projections + real grading working end-to-end;
   - **≥ a documented minimum of settled shadow slates** with a calibration
     report;
   - no unsupported-market gaps; volume discipline + single-sport Suggested +
     BYO gating apply;
   - docs + `sports-coverage.ts` level flip (with its test) updated.
10. **Rollback:** everything stays shadow/offline behind a flag and a `wnba/`
    data path; reverting the PR removes the tooling with zero public surface
    impact (the `level` flip is the only thing that would ever expose it, and
    it is the last, separate step).

---

## 8. Decision for this PR

**Docs-only.** WNBA has a real schedule but **no odds/stats/grading data in the
repo**, so there is nothing for a shadow inspection script to read, and
standing up ingestion requires a new external integration (approval-gated).
Per the rule "default to docs-only unless all required data sources are present
and verifiable," this PR ships the feasibility assessment only.

---

## 9. Risk register

| Risk | Likelihood | Impact | Mitigation |
|------|:--:|:--:|------------|
| Odds provider has no WNBA props | Med-High | High | Verify first (step 1); if absent, stay schedule-only — no fabrication |
| Copying NBA σ/thresholds mis-calibrates WNBA | High | Med | Calibrate on real WNBA logs; shadow-audit before any promotion |
| Premature public enablement | Low | High | `level` flip is the last, separate, approval-gated step; gates fail-closed |
| Sparse WNBA data (shorter season) | Med | Med | Honest insufficient-data states (as NBA/MLB already do); never invent |

---

## 10. What must NOT be done

No public WNBA projections/parlays; do not flip WNBA to modeled/full; no fake
WNBA schedules/odds/projections/parlays/results; no copying NBA constants
without real WNBA data (that is fabrication); no optimizer/workflow live
change; no manual workflow dispatch; no #245 wiring; no `audit/policy.json`
consumption; no performance/hit-rate claims; no banned betting copy.

---

## 11. Recommended next PR

**Decision gate, not code:** confirm whether a real WNBA player-prop **odds
source** is available to us. 
- If **yes** → an approval-gated **shadow ingestion** PR (steps 3–5 above,
  shadow `wnba/` path, no public surface). 
- If **no** → WNBA remains schedule-only and this feasibility doc is the
  stopping point until a source exists.

*Feasibility 2026-06-02. main `95185c3`. Docs-only. WNBA stays schedule-only —
no public projections/parlays, no registry change, no fabricated data.*
