# Draft roadmap text: to be applied into `GAMETIMEPICKS_MASTER_ROADMAP_V2.md` with the next approved integration

This is **not** a roadmap. It holds the overnight 2026-10-10 updates that came **after** #1048's head (`793588ff3b`, which already carries the earlier batch). Apply it verbatim into the named sections, then delete this file.

## §2 priority table rows

- **`MLB-001`:** IN_PROGRESS. The baseline audit is done. pa-v3 rule corrections are READY_FOR_FOUNDER_REVIEW at `be19ba7002`, now including **Rule 9.06(f) walk-off hit bases**. Not promoted.
- **`MLB-003`:** IN_PROGRESS — RESEARCH.
  - v2 has 2025 retrospective count support (HR fails).
  - The coherent-worlds read-out is non-inferior in all 7 count markets (2024 dev).
  - On 2026 posted lines (exploratory), it beats the published model but stays **worse than the market**.
  - **Forward test B is open** from 2026-10-10 06:53Z. NOT QUALIFIED.
- **`MLB-004`:** IN_PROGRESS — RESEARCH.
  - v2's strikeout read-out from the coherent worlds is better than the analytic v2 (2024 dev).
  - `mlb-k-workload-v3` (situation-aware workload): 2024 dev −0.0138 [−0.0185, −0.0089], with no posted-line gain.
  - Forward test B is open. NOT QUALIFIED.
- **`MLB-005`:** IN_PROGRESS — RESEARCH COMPLETED for the prototype.
  - Coherent worlds on the existing engine (research hooks, invariant checker): 8 M worlds, 0 violations.
  - Read-outs non-inferior to the separate model in all 7 markets with substitution.
  - Home-field version (v3): see its result.
  - Forward test B includes the coherent read-out.

## §7 `MLB-003` / `MLB-004` / `MLB-005`: progress (2026-10-10, overnight)

**Data:**
- 2024–2025 box scores validated: pitching runs = official final in 4,859 / 4,859 games. 0 identity, K/BF, IP or PA/BF errors.
- One capture limitation: 0-PA pinch runners are dropped, so team runs always come from pitching runs.
- **Availability matrix:** confirmed lineups for 81% of games, a median 115 min pregame. The per-batter splits families cover 47%, because they follow the board.
- **Forward validation design:** `docs/research/mlb/mlb-003-004/FORWARD-VALIDATION-DESIGN.md`.

**MLB-005 coherent worlds** (branch `claude/mlb-005-coherent-worlds`):
- **Engine:** research-only hooks, absent = the published engine byte for byte: event log, explicit PA distributions, workload draws, substitution.
- **Invariants:** `world-invariants.mjs` (score, runs, RBI, scorers, outs, order, lines, ending, extras, workload, substitution, 9.06(f)).
- **Results, 2024 development** (counts; no historical market):
  - v1 read-outs non-inferior in 6/7 markets, K better (−0.0090);
  - v2 with substitution non-inferior in **7/7**;
  - game level beats league baselines (winner −0.0089 [−0.0160, −0.0018]; total log score −0.0238 [−0.0442, −0.0041]).
- **Gaps, before v3:** no home-field term (P(home) 0.500 vs 0.527); totals about 0.25 low (no double plays, errors or wild pitches).
- **2026 posted lines, exploratory:** engineSub minus published model K −0.047, hits −0.013, TB −0.033, H+R+RBI −0.026. **Engine minus market +0.019 / +0.0035 / +0.0048 / +0.0042: worse than the market everywhere.**

**Forward test B** (prospective; no Production change):
- Registration and code freeze `e273bf4e2c` (06:53Z); amendments 1–2; grader `df30f710a2`.
- **Window:** games after the registration; the first is 849831.
- **Rows:** materialised after each slate with `materialize.sh`, which refuses any code drift.
- **Gates:** hits n 2,000, TB 1,000, H+R+RBI 1,000, K 300; one look each.

## §7 `MLB-001`

**#1043 update:**
- Rule 9.06(f) walk-off hit bases. Test: official and legacy are identical except the walk-off play.
- Reconciled with `main`.
- Unit 9,223 / 9,227 (2 RLS).
- Default output identical to `main`, apart from the disclosed `frozenPregame.modelVersion`.

## §4 `TRUTH-001`

- #1045 retargeted to `main`. Restatements match `main`'s classification (22 = 21 + 824424 held; 4 NOT_SERVED). Draft; not applied.
- #1044's conclusion holds on the verified-served subset (+0.032 [+0.013, +0.051]).

## §25 Session Log entry

**2026-10-10 (overnight) — Claude Code (Lane A) — MLB-001 → MLB-005, MLB-002 integration**
- **Starting `main`:** `fbfa10a64b`.
- **Prepared:** #1048 (#1047 + #1048) READY_FOR_FOUNDER_REVIEW at `793588ff3b`, CI green; #1043 READY_FOR_FOUNDER_REVIEW at `be19ba7002`.
- **Research and forward test:** as above.
- **Builds:** Preview 0, Production 0.
- **Odds credits:** 0.
- **Approvals:** no merge, no activation.
- **Next:** founder decisions on #1048, then #1043. Materialise forward test B nightly.
