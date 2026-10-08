# NFL World Model V2 — audit, NFL-002 ladder, Week 5 truth package (2026-10-08)

Session: Claude Code, founder priority override (NFL-001 → NFL-005). Base `origin/main` `629cfbf494bb2ca2809af5e379abaa56901e49f9`.
Branch `claude/nfl-world-model-v2-priority-79e413`. Roadmap: §2 queue, §8 NFL, Week 5 milestone, §25 Session Log.

## 1. NFL-001 — what runs today (audit, read-only, evidence-backed)

| Output | Engine actually published | Evidence | State |
|---|---|---|---|
| Win probability | `nfl-win-elo-mov-v1` (MOV Elo, K20, HFA 36 dev-fit, 0 at neutral) | P297 held-out 2006–21, n=4,281: log loss **0.62907**, ECE 0.0176; market 0.61012 | Public, EXPERIMENTAL |
| Margin | `nfl-margin-elo-hfa-v1` (a *different* Elo trajectory) ~ N(0.06055·d, 13.03) | P297: MAE 10.785, 80% cov 0.774 | Public |
| Total | `matchup-totals-v3-play-efficiency` | P295 held-out 2000–21, n=5,878: MAE 10.871, NLL 4.036 (market close 10.673) | Public |
| Fallback | old cutoff Elo (K20/HFA48) single-rating pair | model-v1, held-out 2025: 0.6478 | used when heads disagree / evidence incomplete (4 of 15 Week 5 games) |
| Scores/ranges | `game-sim.mjs`: 10,000 independent-normal draws snapped to integers | — | published medians / p10–p90 |
| "Exact score" | score-shape event engine (20,000 runs) solved onto the same medians | — | public section |
| Sim V2 (drive) | `nfl-drive-sim-v2`, separate EXPERIMENTAL page | validation-A (2019–21): winner LL 0.6468 vs champion 0.6358; CRPS margin 7.678 vs 7.667, total 7.706 vs 7.709. Anchored to the champion's means → not an independent model | NOT promoted (correct) |
| Player boards | props-v1 (rush/rec yds) + share-level (receptions, pass yds, ATD) — marginal, **not** shared worlds | family receipts (`player-family-scorecard.json`, share-level second look/forward) | receptions/rec yds/ATD PUBLISHED; rush/pass yds ESTIMATE; 0 families product-eligible |
| QB / injuries in team model | none | `forecast-input-state.json` | team heads blind to availability |

**Analytic-winner vs sampled-score disagreement — reproduced.** The published win % is the win head × (1 − tie mass); the scores come from the *margin* head's draws. Week 5 (audit repro of `forecasts/latest.json`): PHI@JAX published P(JAX) 0.6586 vs 0.5242 of draws; DEN@LAC 0.331 vs 0.414; MIN@NO 0.264 vs 0.330. On held-out 2006–21 the *margin-implied* win probability scores 0.63759 log loss vs the win head's 0.62907 — so "count the draws" is not a fix; one coherent distribution that is at least as good is (NFL-002 L6, below).

**Historical V2 evaluation — reproduced** (see §5 for the rerun numbers). Sim V2 is coherent and has better 80% margin coverage, but is worse on winner scoring and tied on CRPS. It stays shadow.

## 2. NFL-002 — benchmark ladder (preregistered, one look)

Registration `data/internal/research/nfl/reports/nfl-002-team-ladder-preregistration.json` (committed before any candidate was scored). Same windows as P297 (dev 2022–25, warm-up 1999–2005, held-out 2006–21) plus a forward-chronological guard (refit on 2006–15, score 2016–21). Implementation checks reproduce the incumbent receipts exactly (0.62907 / 10.78546 / 10.87108).

| Rung | Candidate | Held-out win LL | Margin MAE / CRPS | Totals MAE / NLL |
|---|---|---|---|---|
| 1 | Incumbent pair (MOV-Elo win, HFA-Elo margin) / v3 totals | **0.62907** | 10.785 / 7.757 | 10.801 / 4.03317 |
| 2 | L2 opponent-adjusted EPA (`nfl-epa-adj-v1`) | 0.63227 | 10.712 / 7.695 | — |
| 3 | L3 dynamic O/D points (`nfl-dyn-od-points-v1`) | 0.62815 | 10.650 / 7.645 | — |
| 6 | **L6 coherent stack** (`nfl-team-stack-v1`, primary) | 0.62632 | **10.624 / 7.629** | 10.794 / 4.03297 |
| ref | No-vig closing market (priced subset) | 0.61012 | — | — |

Verdicts (`nfl-002-team-ladder-evaluation.json`): **win REJECTED** (Δ −0.00276 misses the 0.003 bar; season-bootstrap hi95 +0.00073; forward guard tie 0.63293 vs 0.63287) · **margin ELIGIBLE** (hi95 < 0, coverage in band every era, forward guard 10.29 vs 10.47) · **totals REJECTED** (tie) · coherent pair REJECTED. **Incumbent retained.** Rung 4 (drive process) = Sim V2, reviewed above. Rung 5 (distributional ML) not started. Forward shadow: L6 receipts for all 15 Week 5 games captured pre-kickoff (`data/internal/research/nfl/team-ladder-forward/`).

## 3. Week 5 truth package (what changes in Production)

All changes are producers/copy; no model, bar, grant or historical record changes. Verified in a scratch copy at one clock against `origin/main`'s producers: forecast summaries change for **1 of 15** games (PHI vs JAX), player rows for **3** (Daniels, Keenum, Bagent), board audit 0 violations, roster audit 0.

| Defect (current Production) | Fix | Games |
|---|---|---|
| TB@DAL published DAL 61.8% vs market 78.4% as an "experimental lean" toward TB — the team model cannot see Baker Mayfield (QB1) is Out | `team-input-coherence.mjs`: QB1 unavailable ⇒ disclosure beside the number; model-vs-market comparison `WITHHELD_TEAM_INPUTS`; no `EXPERIMENTAL_LEAN`. Win chance unchanged. Materiality = excluded passer who is the depth-chart QB1 | TB@DAL, CHI@GB (Caleb Williams Out) |
| PHI vs JAX at Tottenham Hotspur Stadium given JAX home field (nflverse neutral list omitted it) | `neutralSiteOf`: ESPN "VS" form or nflverse list; fallback pair honours `event.neutral` | PHI vs JAX: JAX 65.9% → 48.4% (PHI 48.8%), score PHI 22–21 |
| Jalon Daniels "116 passing yards" from a relief share (0.58); CHI two passers (0.46/0.52) | `applyPasserShareFloor` (0.75; every Week 5 starter ≥ 0.806): withheld with the reason, accounted in coverage | TB, CHI |
| "how often each side won in 10,000 simulations" on an analytic win chance | copy states it is the model's rating-based chance, not a draw count; tie figure = level after 60 minutes (OT not simulated) | all |
| "Frozen pre-kickoff" on revisable forecasts | "may be revised until kickoff; the last pre-kickoff version is frozen" | all |
| Margin 0 on an odd total always leaned home | odd point goes to the win-chance favourite | (PHI vs JAX) |

Release mechanics: forecasts/boards are regenerated by the existing NFL event window, not by this PR. After merge the change reaches `/nfl` on the next event-window run before kickoff (Thursday: `nfl-pregame-free-refresh` T-105/T-55 and `nfl-kickoff-refresh` dispatch). If no run lands, a manual `nfl-event-window` dispatch with `skip_odds=true` (free) publishes it. Page copy changes ship with the merge build.

## 4. Not done / open (reported, not claimed)

- NFL-002: L6 margin head is ELIGIBLE but not proposed for promotion tonight (it would sit beside the MOV-Elo win head — still two ratings). Decision for the founder after forward evidence. Rung 5 not started. No QB-adjusted team strength (no pregame-knowable history; see `pregame-availability-margin-refusal.json`).
- NFL-003 (not started): two marginal engines on one row; receiving vs passing do not reconcile across engines (MIN Σ visible receiving / passer 1.17); share-level shares never fade; Out players' volume is not redistributed; zero-OTHER pools after normalisation.
- NFL-004 (not started): three different public ATD numbers per player (board opportunity-v1, Vault calibration, Sim V2); ATD forward 782/1000 with level 1.104 (bar [0.90, 1.10]); top bins over-predict; passing-TD joint calibration loses to baseline.
- NFL-005 (not started): no shared-world player outputs in Production; Sim V2 has zero player-level validation.
- Official inactives (~T-90) and Sunday T-55 remain a residual risk for healthy scratches (Sunday handoff §9).
- The Week 1 joint-v2 forward cohort has never been graded (no grader exists).

## 5. Reproduction

```
node scripts/research/nfl/replay-team-ladder.mjs --validate         # dev only
node scripts/research/nfl/replay-team-ladder.mjs --score --now <ISO>  # refuses: look already taken
node scripts/research/nfl/capture-team-ladder-forward.mjs --now <ISO> --week 6
node scripts/research/nfl/validate-drive-sim-v2.mjs --protocol A --runs 2000   # Sim V2 rerun
```
`games.csv` (sha256 `cf8632c8…`) is gitignored under `data/internal/research/nfl/raw/nflverse/`.
