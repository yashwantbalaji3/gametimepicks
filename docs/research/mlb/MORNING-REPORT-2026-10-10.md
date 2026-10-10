# Morning report: Lane A (Core Intelligence), overnight 2026-10-10

**Window worked:** 06:08Z → 07:43Z (02:08 → 03:43 EDT), continuously; nothing interrupted it. I stopped at 03:43 EDT, not 08:00, because the remaining work either needs a founder decision (section F) or would be another look at the already thrice-used 2024 season. The next evidence comes from tonight's forward games, not from more replays. No busywork was added to fill the window.

The detailed log is `OVERNIGHT-JOURNAL-2026-10-10.md`. This report is not a roadmap: the roadmap update for the next integration is drafted in section B and in #1048's head.

## A. Executive summary

1. **#1047 + #1048 MLB-002 forward shadow: one integration, `READY_FOR_FOUNDER_REVIEW` at `793588ff3b`.**
   - Reconciled with `main`; CI green (`quality` ✓, `python` ✓, CLEAN).
   - Public output sha256-identical on 4 slates. 6 fault injections all safe.
   - Overhead about 0.27 s per game. No workflow, odds or build-input change.
   - The batched roadmap update is in this head. **Not merged.**
2. **#1043 MLB-001 pa-v3: `READY_FOR_FOUNDER_REVIEW` at `be19ba7002`** (CI ✓ ✓, CLEAN).
   - Rule review found and fixed one more rule defect: **official Rule 9.06(f) walk-off hit bases**.
   - Reconciled with `main`; unit 9,223 / 9,227 (2 known RLS failures).
   - The default path is identical to `main`, apart from the already-disclosed `frozenPregame.modelVersion`.
3. **MLB-005 coherent-worlds prototype, built and tested** (research branch `claude/mlb-005-coherent-worlds`).
   - Built on the existing engine with opt-in hooks: an event log, explicit PA distributions, workload draws and substitution.
   - The invariant checker covers score, runs, RBI, scorers, outs, order, lines, ending, extras, workload, substitution and 9.06(f).
   - **8 million simulated 2024 games, 0 invariant violations.**
   - With substitution, player read-outs from the same simulated games are **non-inferior to the separate per-player model in all 7 count markets**, and strikeouts improve over v2. Development tier only.
4. **Two genuine forward tests are registered and frozen** (option B, no Production change).
   - **B:** v2 and the coherent read-out; registered `e273bf4e2c` at 06:53Z.
   - **B2:** `mlb-k-workload-v3` and the coherent engine with the v3 workload; registered `2d83693e14` at 07:16Z.
   - **B-GAMES:** the coherent engine as a **game model**, graded from B's frozen game rows against the published game prediction of record; registered `b716996414` at 07:28Z; n ≥ 300 regular-season games.
   - The first included game for all three is 849831 tonight.
   - Pregame captures only; write-once rows.
   - The grader hides performance until each family's n.
   - A materialisation guard refuses any code drift.
5. **MLB-003/004 groundwork:**
   - **Availability matrix:** confirmed lineups for 81% of games, a median 115 min pregame; per-batter splits families only 47%, because they follow the board.
   - **Forward validation design.**
   - **Box-score validation:** pitching runs = official finals 4,859 / 4,859. One capture limitation: pinch runners.
   - **Exploratory 2026 posted-line comparison:** section C.
6. **New mechanisms tonight:**
   - **`mlb-k-workload-v3`:** 2024 dev **−0.0138 [−0.0185, −0.0089]** against v2. The fix targets relief-to-start starts and openers. **No posted-line gain** on 2026: those starts rarely have lines.
   - **Coherent-worlds v3 (home field):** P(home) 0.500 → 0.518 (actual 0.527), but the winner gain was not established (−0.0015 [−0.0036, +0.0004]). **DO_NOT_PROCEED**; not carried forward.
7. **TRUTH-001:**
   - #1045 retargeted to `main` and verified against #1046's shipped classification (22 = 21 + 824424 held; 4 NOT_SERVED). Still a draft, **not applied**.
   - **#1049 hardened** (draft): contradictory deployment evidence, meaning a deployment marked READY at or after the actual start, can no longer unlock the actual-start rule; it is reported instead. 6 edge-case tests were added (early start, ms precision, cancelled, removal, whole committed history unchanged), and a mutation probe is caught. Still gated; 824424 still HELD.
   - #1044 consistency check posted.

**Not done:**
- No Production merge or deployment.
- No promotion, eligibility change, Stage B application or paid API.
- No 2025 re-read.
- No change to the NFL, ledger or other owners' code.

## B. Roadmap reconciliation (task by task)

| Task | Research | Implementation | Integration | Qualification | Production |
|---|---|---|---|---|---|
| `MLB-001` | Baseline audit done (on #1043) | pa-v3 rules + 9.06(f) at `be19ba7002`, opt-in | READY_FOR_FOUNDER_REVIEW | n/a (rules) | Not deployed; default pa-v2 unchanged |
| `MLB-002` | matchup-v1 NOT QUALIFIED (kept); run-line market eval (#1044) kept, rechecked | Forward shadow code (#1048) | **READY_FOR_FOUNDER_REVIEW** `793588ff3b` | Forward n ≥ 300 (2027) | Not deployed |
| `MLB-003` | Baseline, diagnosis, v1, v2 (2025 retrospective support in 6/7; HR fails); availability matrix; forward design | Research code only | Forward test B frozen | **NOT QUALIFIED**; forward window opened tonight | None |
| `MLB-004` | k-workload v1/v2; error decomposition (section C) | Research code only | Forward test B frozen | **NOT QUALIFIED** | None |
| `MLB-005` | Architecture; contract draft; **coherence v1/v2 results** | Engine research hooks + invariants (research branch) | Not proposed | Forward test B (`engineSub`) | None |
| `TRUTH-001` | — | #1045/#1049 drafts | #1045 retargeted to `main` | — | #1046 DEPLOYED (yesterday); Stage B not applied |
| `CONTRACT-001` | World contract draft: additive fields only | — | — | — | — |
| `LEDGER-001` | Timing amendment (#1049) hardened: contradictory evidence; edge tests | Draft `6dc4a51182` | Gated | — | — |
| `RESULTS-001` | — | — | — | — | Unchanged |
| `EVAL-001` | Forward protocol with single-look grader, written before any look | — | — | — | — |
| `COST-001` | 0 Preview, 0 Production deployments tonight; no workflow change | — | — | — | — |

On `main`, the roadmap still lists MLB-001 and MLB-003/004/005 as NOT_STARTED. #1048's head corrects that to the state as of 06:10Z. Tonight's later results (MLB-005 v2, forward test B, the #1043 rule fix, data validation) go into the next integration after #1048. The draft text is `ROADMAP-UPDATE-DRAFT-2026-10-10-overnight.md`.

## C. Statistical evidence

**Scores:** all log losses, lower is better. 95% intervals come from bootstraps that resample whole dates.

**No historical posted-line or market comparison is possible** for 2024 and 2025; those seasons are scored on counts. **Nothing below qualifies any model.**

| Experiment | Version / registration | Data and exposure | Result |
|---|---|---|---|
| MLB-003/004 replay | protocol `2f9c067b68`; freeze `d170c425d1` | 2024 dev; 2025 `RETROSPECTIVE_HOLDOUT` read once (yesterday, not re-run) | v2 better than the published model in 6 of 7 count markets; HR fails; handedness not supported |
| MLB-005 coherent worlds v1 | `431072c9ae` | 2024 dev | Read-outs non-inferior to v2 analytic in 6/7; **K better, −0.0090 [−0.0161, −0.0007]**; TB fails (+0.0053 [+0.0037, +0.0069]) because of PA overstatement (4.33 vs 4.01) |
| MLB-005 coherent worlds v2 (substitution) | `cb9a52e95e` (a disclosed second look at 2024) | 2024 dev | **Non-inferior in all 7**: TB +0.0036 [+0.0023, +0.0049]; hits +0.0003; H+R+RBI +0.0012; K −0.0068. Against v1: hits −0.0027, H+R+RBI −0.0020 |
| Same worlds, game level (corrected finals) | as above | 2024 dev | Against league baselines: winner −0.0089 [−0.0160, −0.0018]; total log score −0.0238 [−0.0442, −0.0041]. No home-field term (0.500 vs 0.527); totals 0.25 low |
| Invariants | `world-invariants.mjs` | 8,028,000 worlds + tests | **0 violations**; 7 mutation probes caught |
| #1044 run line vs market | `mlb-runline-market-eval@1` | 2026 graded | Model worse than market: +0.029 [+0.012, +0.045]; verified-served subset +0.032 [+0.013, +0.051] |
| 2026 posted lines (exploratory) | harness `19584755bd` | 2026, examined many times | All challengers beat the published model on posted lines: engineSub − current K −0.047 [−0.062, −0.032], hits −0.013, TB −0.033, H+R+RBI −0.026. **All remain worse than the market**: engineSub − market K +0.019 [+0.010, +0.029], hits +0.0035 [+0.0015, +0.0056], TB +0.0048, H+R+RBI +0.0042. Decomposition: known BF would cut K count log loss by 0.116; known PA would cut hits by 0.045 |
| Coherent engine as game model (exploratory) | `2881be0569` | 2026 (exposed; MLB-002 holdout overlap) | Winner log loss: engine 0.6816, **published 0.6995** (worse than coin), market 0.6684. Engine − published −0.018 [−0.033, −0.003] (verified-served subset −0.015 [−0.035, +0.003]); engine − market **+0.013 [+0.003, +0.023]** → forward test B-GAMES |
| Forward-B2 engine combination (exploratory, after its freeze) | harness `--b2-check` | 2024 dev | K −0.0153 [−0.0217, −0.0087] against engineSub; batters unchanged (HR −0.0008); 0 violations |
| MLB-005 coherent worlds v3 (home field) | `3b5f5cd7b9` (a third, disclosed 2024 look) | 2024 dev | **DO_NOT_PROCEED**: winner −0.0015 [−0.0036, +0.0004]; P(home) 0.518 (actual 0.527); TB at the margin |
| MLB-004 BF residual signals (exploratory) | `46bf23596b` | 2024 dev | Relief-to-start −6.5 BF; < 4 days rest −10.6; opener −7.1; first start −5.7 → `mlb-k-workload-v3` registered (`dd406d91d8`). **v3 2024 dev: −0.0138 [−0.0185, −0.0089]** against v2 (relief-to-start −0.234, openers −0.238); **no posted-line gain** on 2026 (0.7079 vs 0.7074), because those starts rarely have lines |

**What remains NOT QUALIFIED:** every MLB player family (hits, TB, H+R+RBI, runs, RBI, HR, K), `mlb-pa-matchup-v1`, pa-v3 (a rules change, not a model), and the coherent-worlds read-outs. The only qualifying path is forward test B (window open from tonight), or a later live capture, against posted lines.

## D. Code and testing

| Branch | Head | What | Tests |
|---|---|---|---|
| `claude/mlb-002-matchup-forward-shadow` (#1048) | `793588ff3b` | Integration: #1047 + #1048 + budget/provenance hardening + roadmap | Unit 9,218 / 9,222 (2 RLS); tsc clean; byte identity ×4; fault injection ×6; CI ✓ |
| `claude/mlb-001-rule-corrections` (#1043) | `be19ba7002` | pa-v3 + Rule 9.06(f) + main merge | Unit 9,223 / 9,227 (2 RLS); tsc; rules/engine/simulate 30/30; default byte identity |
| `claude/mlb-005-coherent-worlds` (research, no PR) | `6b2737da42` | Engine research hooks; invariants; coherence harness and results; forward test B (frozen code, grader, materialise guard); world contract draft; k-workload-v3 registration | world-invariants 11/11 + engine/rules/simulate (41 total) |
| `claude/truth-001-ledger-timing-amendment` (#1049, draft) | `6dc4a51182` | Contradictory-evidence rule + 6 edge-case tests | forecast-ledger 37/37; unit (Node 20.4) 2 RLS failures + 1 path issue fixed and re-run |
| `claude/mlb-003-004-baseline-audit` (research, no PR) | (this commit) | Availability matrix; forward design; box-score validation; BF residual exploration; journal; this report | Read-only scripts |

**Known local failures:** only the 2 `live RLS` tests (they need Postgres). No new regressions.

## E. PR integration queue

| PR | Head | Base | CI | Mergeable | Behaviour impact | Readiness | Suggested order |
|---|---|---|---|---|---|---|---|
| #1048 (+#1047) | `793588ff3b` | main | ✓ ✓ | CLEAN | Private shadow file; public output byte-identical | **READY_FOR_FOUNDER_REVIEW** | 1 |
| #1043 | `be19ba7002` | main | ✓ ✓ | CLEAN | None by default (pa-v2); opt-in pa-v3 | **READY_FOR_FOUNDER_REVIEW** | 2 (could carry #1044's docs) |
| #1044 | `53f53c6814` | main | — | CLEAN | Docs only | Ride an approved integration | with 2 |
| #1045 | `a4cd3b030a` | **main** (retargeted) | ✓ ✓ | — | Stage B restatements, **not applied** | DRAFT; founder gate | later |
| #1049 | `6dc4a51182` | #1045 | (new run) | CLEAN at last check | Timing amendment, hardened tonight (contradictory evidence); 824424 HELD | DRAFT; founder gate | after #1045 |

**No automatic multi-merge.** Each needs its own exact-head approval, one at a time.

## F. Founder decisions (gated)

1. **#1048** (MLB-002 private forward shadow, #1047 + #1048 combined): approve merge at `793588ff3b`?
2. **#1043** (MLB-001 pa-v3 opt-in plus Rule 9.06(f)): approve merge at `be19ba7002` (CI ✓ ✓, CLEAN; default output unchanged)? Bundle #1044's docs into it?
3. **Forward tests B, B2 and B-GAMES:** confirm option B, the frozen-code forward replay, as the forward path for MLB-003/004/005 player families until a live workflow capture (option A) is proposed. Its rows are materialised after each slate with `materialize.sh`.
4. **Option A** (live pregame capture in `mlb-lineup-refresh`; design `docs/research/mlb/mlb-003-004/OPTION-A-LIVE-CAPTURE-PROPOSAL.md`): approve preparing it as its own PR after #1048?
5. **Capture of extra box-score fields** (GIDP, errors, wild pitches) for 2024–2026: a free StatsAPI re-fetch of about 7,400 games (about 1 h at the same pacing). Needed for the next coherent-world mechanisms (double plays and advancement).
6. **Stage B (#1045/#1049):** no action requested tonight; still gated.

## G. Next three engineering priorities

1. **Materialise forward tests B and B2** (B-GAMES reads B's rows) after each slate (`materialize.sh` / `materialize-b2.sh`): 849831 tonight, then the remaining postseason and 2027. Low cost, no approval needed; it's research data collection.
2. **The remaining coherent-world gaps, each a registered version:**
   - home field: needs a stronger design, since the per-PA multipliers were not enough;
   - double plays, errors and wild pitches: totals 0.25 low;
   - this needs those fields captured (GIDP, errors) for 2024–2026, a free StatsAPI re-capture to propose.
3. **Integrate #1048 after approval,** then propose option A (live capture) for player families as its own PR.

## H. Cost and safety

- **API:** free StatsAPI only. Box scores for 10-07 → 10-09 (0 new games), plus the handedness reference yesterday. **0 odds credits.**
- **Vercel:** **0 Preview, 0 Production deployments** tonight. Branch pushes to `claude/*` do not deploy, and no workflow, Vercel or ignore-build file was changed.
- **CI:** GitHub Actions on #1048, #1043, #1045 and #1049 (retargets and pushes): about 5 quality-gate runs.
- **Local compute:** about 40 min of engine simulation (≈ 60 M simulated games in total), plus 4 unit-suite runs.
- **Repository data:** research outputs of about 2–5 MB under `docs/research/mlb/`, all internal, none a build input. A public repository makes them readable, and they contain only derived statistics, no raw provider payloads.

## I. Integrity declaration

**Not modified:**
- any published forecast, grade, ledger row or Results figure (13,741 / 10,933 at #1046's release check);
- product eligibility, bankrolls, shared contracts, workflows, Vercel settings or secrets;
- NFL or other owners' code;
- the frozen 2025 read (not re-run).

**Disclosures:**
- The coherence-v1 game-level table was first computed from batting-line finals, which undercount pinch runners. It is corrected, and the correction is stated.
- Forward test B's grader and amendments were committed shortly after the registration, all before any included game.
- No accidental Production change.
