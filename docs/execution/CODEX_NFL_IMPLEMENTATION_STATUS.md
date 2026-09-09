# Codex implementation — NFL joint engine, September 8–9, 2026

## Outcome and boundary

Actual implementation, not another prompt. A new private joint engine fixes per-draw accounting defects; timestamped depth-chart evidence improves historical passing-yard MAE from 80.669 to 67.359 on identical observations. All 16 upcoming 2026 Week-1 games have private coherent captures, replayed exactly and registered before kickoff. **This is not NFL public completion. The public champion and public family eligibility are unchanged.** Nothing was deployed or pushed by this work.

Repository starting point: `5715c03ab` (P250), with founder-owned `vp/` and `HANDOFF-2026-08-20.md` untracked. Those files were not edited. No money policy, protected balance, provider authorization, existing settlement record or public forecast was changed. Free nflverse downloads and npm's existing test-runner acquisition were the only new network acquisitions in this implementation slice.

## What was actually fixed

### 1. Joint accounting defects reproduced before repair

The previous private generator could divide passing touchdowns fractionally between multiple quarterbacks, assign a receiving TD without a catch, and assign a rushing TD without a carry. Two new tests failed against v1 before implementation. V1 source and its receipts remain intact.

`joint-game-sim-v2.mjs` now pairs completed-pass opportunities with actual discrete passer attempts. A receiving touchdown consumes a realized catch token and credits the corresponding passer. A rushing touchdown requires a carry. Named and OTHER players retain separate counts. Every draw checks integer counts, capacities, passing/receiving yard and TD equality, and the team scoring budget. Target-share deflation uses the already accepted fit parameter; released mass remains OTHER.

This is an opportunity-based partial offensive model, not a play-by-play or drive simulator. Sacks, interceptions, negative yardage, scoring sequence and individual kicking/defensive scores are not modeled. Unspecified scoring points remain explicitly unspecified. A scorecard must not imply those components are validated.

### 2. Historical role estimates no longer silently overfill a team

The first strict diagnostic matched only 735/9583 expected points: independently fitted historical shares exceeded team mass in 518 team simulations. The engine refused those inputs. An explicit research adapter now projects only overfull families onto unit mass and records each adjustment. Underfull families keep their OTHER remainder. This is a modeling assumption, not confirmation of a lineup.

### 3. New pregame depth-chart evidence

The free nflverse archive has timestamped depth charts with ESPN identities. The as-of reader selects only the latest team snapshot strictly before the cutoff, rejects snapshots older than 168 hours, and requires one rank-1 quarterback. The ESPN numeric ID maps explicitly to the corpus's `nfl-athlete-<id>` namespace; no fuzzy name matching is used.

The first depth run applied zero decisions because of that namespace mismatch. It is retained as a plumbing diagnostic, not presented as a failed predictive hypothesis. The corrected run applied conditioning to 553/570 team simulations; 17 retained the baseline because the listed starter lacked prior QB evidence. It did not select a more favorable evaluation population.

The conditioner allocates the previously training-derived starter share, 0.9577, to the listed QB and retains bounded backup/OTHER mass. It is a projected depth starter, not an official active or guaranteed playing time. The 2025 archive contains later snapshots too; tests prove those cannot enter earlier games.

Source documentation: [depth-chart fields](https://nflreadr.nflverse.com/articles/dictionary_depth_charts.html), [update and availability schedule](https://nflreadr.nflverse.com/articles/nflverse_data_schedule.html). Raw compressed sources and SHA-256 receipts are preserved privately under `data/internal/research/nfl/depth-charts/`.

### 4. One two-team scorecard, not rounded marginal statistics

`joint-matchup-v2.mjs` pairs both teams on the same score stream. Its illustrative scorecard uses ONE realized draw selected near the median total/margin; every displayed player line comes from that same index. It is explicitly an illustrative simulated outcome, not a separate point forecast. Probabilities and uncertainty summaries use all draws. Default output does not expose the full draw arrays.

### 5. Passing-TD calibration is now recorded

The previous joint evaluator omitted calibration bins. The v2 collector emits all ten bins, visible denominators, empty-bin nulls and ECE. It preserves the historical v1 receipt behavior rather than rewriting that record. Candidate evaluation requires a separate diagnostic output and never writes the public champion receipt.

## Identical-population development comparison

1000 draws per team simulation, 2025 chronological evaluation; all 9583 champion player-market points matched, zero missing and zero refused after reconciliation. These are **reused development data**, not a newly untouched test set. Stored under `data/internal/research/nfl/reports/codex-joint-v2/`.

| Family | n | Marginal champion MAE | Joint v2 MAE | Joint + depth MAE | Joint + depth calibration ECE | Existing family classification |
|---|---:|---:|---:|---:|---:|---|
| Passing yards | 580 | 80.669 | 78.472 | 67.359 | 0.0889 | Shadow eligible, not public |
| Rushing yards | 1853 | 18.904 | 18.985 | 18.993 | 0.1197 | Shadow eligible, not public |
| Receiving yards | 3575 | 20.292 | 20.174 | 20.193 | 0.0226 | Family bars eligible; whole joint engine not promoted |
| Receptions | 3575 | 1.513 | 1.508 | 1.510 | 0.0562 | Shadow eligible, not public |

Passing improvement is approximately 16.5% versus the marginal champion. It also beats the same-point rolling-four MAE 71.912 and share-volume MAE 70.352. Its 80% interval coverage improves from 0.6741 to 0.7672. This is substantive improvement, but does not satisfy every public criterion.

Passing TDs: n=589, log loss 0.7125 versus training-rate baseline 0.5932; ECE 0.1695. This remains weak. The near-zero probability bin contains 32 positives among 82 cases, highlighting unresolved starter/backup participation risk. Joint anytime TD log loss is 0.5938 on its own 3109-row diagnostic population. The evaluator's historical 0.5214 champion receipt is NOT an identical-population paired comparison; do not claim a paired improvement or degradation from those two numbers alone.

## Forward evidence now exists

The initial captures were generated at `2026-09-09T02:35:48.913Z`, before the first Week-1 kickoff `2026-09-10T00:20Z`. They use the fresh 2026 depth-chart archive, whose latest snapshot is `2026-09-08T11:56:57Z`; the independent historical role snapshot still dates to August 13 and is labeled as such.

`data/internal/research/nfl/joint-v2-forward/2026-week1-registration.json` freezes all 16 exact file hashes and input hashes, with 16/16 exact replays. No adverse game may be removed, no later forecast may replace these study captures, and official missing outcomes stay explicit. One week is diagnostic evidence, not sufficient proof of public readiness. These captures are not public recommendations and have no market-price comparison.

The development evaluator's `--now` values are configured reference timestamps, not proof of when the historical evaluation finished. The forward capture tool instead uses the real wall clock and refuses if kickoff passes during generation. Registration also refuses after any cohort kickoff.

## Verification so far

- New deterministic correctness, reconciliation, scorecard, calibration and timestamp tests pass.
- Final full unit/contract run after the capture tools and depth ID fix: 5550 pass, 0 fail, 1 skip.
- Typecheck passed.
- Production build succeeded: 383 static pages.
- Built-page guards: 464 pass, 0 fail, 3 skips.
- No full browser matrix, physical-device check or every-button certification was performed in this slice. Do not relabel built-page guards as that certification.
- Forward capture rerun: all 16 returned EXISTING, with no replacement. The registration replayed all 16 exactly and froze their hashes before kickoff. Capture and registration scripts pass syntax checks; typecheck is green after their addition.

## Remaining work, in the right order

1. Finish verification of the private capture tooling; preserve source/version attribution and test replay, malformed input and cutoff boundaries. Evaluate the frozen forward cohort when official results become available. No automatic promotion.
2. Improve participation uncertainty using genuinely pregame evidence. A depth chart alone is insufficient when the listed starter does not play. Train any new workload/calibration model on a separate training window; do not tune to the Week-1 outcomes or lower existing bars.
3. Repair passing-TD/anytime-TD joint calibration and reception/rushing non-inferiority. Passing yards is improved, but an all-family public joint scorecard is still not accepted.
4. Refresh the current role/roster evidence chain and incorporate injuries/availability with source timestamps and explicit coverage. The August historical snapshot must not masquerade as current active status.
5. EPL sparse-data prediction weakness remains unmodified here. Rejected shrinkage is not a fix; needs a new properly evaluated candidate.
6. Bank Builder/Moonshot accounting was awaiting a founder decision in the initial slice. The user has since explicitly approved independent proceeds rollover after wins and reset to each lane's existing seed after losses. See the continuation below. Historical balance/history writes remain prohibited.
7. Builder period/identity validation, hub ordering, full keyboard/assets/device checks and a clean complete browser matrix remain separate unfinished work. No frontend completeness claim follows from this NFL backend work.

## Reproduction

From `app/`, the evaluator accepts `--challenger participation-true-conditioning-v1` for the integrated marginal comparison, `--challenger nfl-joint-sim-v2` for the accounting candidate, and `--challenger nfl-joint-depth-v1 --depth-charts <2025 receipt>` for the depth conditioner. Joint runs require `--champion-dump <points.jsonl>` and a separate `--diagnose <directory>`; use the same `--runs 1000` and chronological population. The depth acquisition command is `node scripts/nfl/acquire-depth-chart-research.mjs --season 2025` (or 2026).

Forward capture: `node scripts/nfl/capture-joint-v2-forward.mjs --depth-charts <2026 receipt> --runs 1000`. This only writes private files. Do not overwrite the registered cohort. Registration already exists and its tool intentionally refuses to replace it.

## Continuation: TD calibration and current participation, September 8 ET / September 9 UTC

### Completed implementation

- A separately declared **v3** candidate repairs double-conditioning of the offensive-TD mean. The bridge estimates expected TDs from points; v2 used that value as a Poisson rate and truncated the distribution again. Example: intended mean 2 with ceiling 3 became 1.5789. V3 inverts the finite Poisson family to preserve the feasible expected count, with stable log weights and numerical tests. It does not change fitted coefficients, relax bars, or introduce cosmetic seed variation. V2 code, source hashes and the registered Week 1 cohort are unchanged.
- Same 9,583-point development evaluation, 1,000 draws, no missing observations: passing TD log loss **0.7125 → 0.6757**, ECE **0.1695 → 0.1037** (589 observations). The simple training-rate baseline remains better at **0.5932**. This is an improvement, not acceptance.
- V3 marginal MAE / ECE: passing **67.512 / 0.0886**, rushing **18.979 / 0.1190**, receiving yards **20.206 / 0.0244**, receptions **1.509 / 0.0553**. Only receiving yards clears the existing family-level bars in this comparison; that does not promote the whole engine. The joint anytime-TD diagnostic improves 0.5938 → 0.5870 on the same 3,109 diagnostic rows; the legacy 0.5214 is still not a paired-population comparator.
- The evaluator now retains per-observation passing-TD traces. All 32 positives in the near-zero bin can be inspected. Several are clear starter-substitution failures: the chart lists Fields while Taylor played, Purdy while Jones played, or McCarthy while Wentz played. Some are genuine low-frequency backup/trick-play outcomes. Do not remove these cases to improve the headline. The current collector conditions on actual passing attempts, so it must not be described as an all-rostered-player unconditional calibration study.
- A private participation adapter now checks current team membership and injury classification before using QB depth rank. An out/off-roster starter cannot displace an eligible backup; an uncertain starter yields `PARTICIPATION_UNCERTAIN`, not a fabricated probability or automatic backup promotion. Out/off-roster role mass is removed from the named players and stays in OTHER. Other questionable player rows remain explicit conditional research inputs.
- All 16 Week 1 events were captured under v3 at **2026-09-09T03:01:12.834Z**, before every kickoff, separately from the frozen v2 study. The current roster/injury filter classifies 428 historical role entries: **300 ACTIVE_PROJECTED, 50 QUESTIONABLE, 28 INACTIVE, 50 UNSUPPORTED**. It removes 78 entries; 31 teams have an eligible projected depth leader, while KC's depth leader is questionable in this captured source. This is source classification, not a claim about eventual game-day availability. None are official confirmed actives.
- Current inputs were roster capture **2026-09-08T23:12:58Z**, injuries capture **2026-09-08T16:54:09Z**, and depth snapshot **2026-09-08T11:56:57Z**. The historical rate/role snapshot is still August 13. The capture tool rejects future/malformed or older-than-24h roster/injury source stamps. Later evidence-only changes now receive distinct capture identities even if numerical inputs happen to coincide. Original captures remain immutable.
- The approved prospective lane accounting rule has a complete pure transition implementation and tests: independent seeds, exact integer-cent gross-return rollover, loss reset, void returning the actual rolled stake, final-rung rollover into the next cycle, replay no-ops, conflicting-settlement refusal, and no card opening before the settlement funding it. **It is not connected to live generators/settlers yet.** Existing conflicting opening positions need an evidence-backed migration; no historical protected bankroll is modified by this module.

### Evidence and boundaries

V3 contract: `docs/execution/CODEX_NFL_JOINT_V3_CONTRACT.md`. Full evaluation and passing-TD trace: `data/internal/research/nfl/reports/codex-joint-v2/joint-depth-v3-*`. Private current captures: `data/internal/research/nfl/joint-v3-forward/`. V3 captures are exploratory research, not replacements for the registered v2 forward cohort, and no fresh-holdout or public-promotion claim is made.

The 2025 development evaluation tests the TD correction with the original timestamped depth conditioner. It does **not** retrospectively apply September 2026 injury data to 2025 games. The current participation adapter therefore still needs proper forward evaluation or genuinely archived pregame injury evidence. No 2025 outcomes were used to invent earlier injury reports.

### Exact public-readiness blockers still remaining

1. Passing-TD calibration still loses to the simple baseline; model starter/backup uncertainty with genuinely pregame evidence and training-only probability estimates. The current rank-based depth source alone cannot resolve injury substitutions.
2. Passing/rushing/receptions joint calibration and other family criteria have not all cleared. Receiving-yard eligibility alone does not justify an all-prop public joint scorecard.
3. Fifty questionable historical-role entries remain conditional research inputs; August role rates also need a current, timestamped workload-evidence chain. Removing out players fixes an input contradiction, not predictive uncertainty.
4. The partial offensive engine is coherent for supported counts/yards but still lacks sacks, interceptions, negative yards and individual kicking/defense scoring. Do not label it a complete official-style statistical scorecard.
5. V2 forward results have not happened yet. A replay-safe official-outcome grader and complete longitudinal comparisons are still required. No outcome may replace a frozen forecast.
6. Independent-lane accounting is approved and implemented as a tested transition owner; live pipeline migration and public state adoption remain incomplete. This is no longer awaiting the user's basic rollover decision.

No public prediction, eligibility gate, money record, EPL model, UI surface or deployment was changed in this continuation. This is saved backend progress, not public completion.
