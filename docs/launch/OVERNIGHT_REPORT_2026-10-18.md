# GameTimePicks — October 18 Overnight Engineering & Product Progress Report

_Written by the integration session. Sections marked ⏳ are updated as scheduled runs complete. Last update: see the git log of this file._

## A. Executive summary
Production is **healthier than before**. Main CI is green.
- **The release ran on schedule.** #1124, #1101, #1120 (carrying #1117 and #1119) and #1088 merged at exact heads, 04:46–04:48Z.
- **It cost 2 Vercel builds for 4 merges.** The other two were superseded, as expected.
- **Every check passed:** main CI on all four merges, Production serving the final commit, protected ledgers byte-identical, 11 key routes clean.
- **Three audit fixes also shipped and are verified on Production:**
  - #1126: void rows on `/results/mlb/` were shown as "Push";
  - #1127: a settled NFL game was shown as "Follow live", and the Home MLB card mislabelled yesterday's slate as today's;
  - #1128: Ask's EPL record contradicted `/results`.
- **Seventeen superseded PRs are resolved:** 12 were auto-merged and 5 closed with evidence.
- **One urgent compliance flag:** Production `/mlb` shows **offshore, unlicensed sportsbook prices** (BetOnline.ag). This needs your decision (§J).

## B. Production release

| PR | Status | Merge commit | Main CI | Vercel / Production | Remaining verification |
|---|---|---|---|---|---|
| #1124 build-input coverage | MERGED | `d29a2078ca` | ✅ 39098266421 | built | 7-day build effect (§D) |
| #1101 settle historical-stamp guard | MERGED | `36958c5e68` | ✅ 39098309659 | superseded → included in `05c9deea4f` | ✅ **VERIFIED.** Settle `01ac320a62` (run 39114917123): 0 stamp-only past-dated files (388 the day before), 67 files changed (455 the day before), historical model-rows byte-identical; `verify_1101.py`: 0 failures |
| #1120 HTML/UX release (+#1117, #1119) | MERGED | `68135f7aa2` | ✅ 39098333216 | superseded → included in `05c9deea4f` | none; pages verified visually and by route sweep |
| #1088 MLB stamp-only gate | MERGED | `05c9deea4f` | ✅ 39098353538 (unit 9,489/9,491; post-build 707/710) | built; Production `05c9deea4f` at 04:51Z | ⏳ `verify_1088.py` after the MLB daily-production and lineup runs |
| #1126 MLB Void label | MERGED | `cd8465a2e1` | ✅ | built; verified (`/results/mlb/`: Void 82, Push 0) | — |
| #1127 event-state labels | MERGED | `58acd1cbac` | ✅ | built; verified | — |
| #1128 Ask EPL/UFC record parity (audit D-1) | MERGED | `bec2cd28aa` | ✅ 39112754816 (post-build parity green) | built; Production `1a65a1aa9e` (includes it) at 09:00Z | — |

**Pre-merge gates**, applied to every merge: exact head, required checks green, MERGEABLE/CLEAN, no data-writer workflow running, outside the :25–:45 lineup slot. For the release: MLB final and the UFC card finished. Main's code equals the locally validated candidate (full local gate green).

## C. Forecasting and data integrity
- **Production integrity audit** (`docs/launch/INTEGRITY_AUDIT_2026-10-18.md`): **7 of 8 PASS.**
  - The Forecast Record page equals the ledger: 16,319 published, 12,574 measured, 32 not final, 3,713 void or not measurable.
  - The ledger is append-only across 16 states since 10-10. The only mutations are PENDING→SETTLED and PROVISIONAL→CANONICAL.
  - 0 of 15,314 rows were published after event start. 1,005 rows lack `publishedAt`, and `frozenAt` is null ledger-wide, so those rows can't be checked from the ledger.
  - Pending is never a loss.
  - 10-16 is 41 VOID, 0–0.
  - Results pages agree with the records for MLB and NFL.
  - NFL and UFC event states are correct.
  - **The one FAIL (LOW), Ask's EPL lag, is now FIXED** by #1128: Ask derives the record from the same ledger population as `/results`.
- **Release data safety:** no merged PR touched a data path. All 7 protected ledger and settled files are hash-identical to the pre-release baseline.
- **MLB settlement, verified.** 10-17 (TB@CLE 849816, final 7–3) settled in run 39114917123 at 09:20Z:
  - 41 decisive, 24–17;
  - health gate HEALTHY;
  - `settled_leans` +41 rows, 0 existing rows changed;
  - forecast ledger pure appends (MLB +11, EPL +102).
  - ⚠ That run was a **manual `workflow_dispatch` under your account (`yashwantbalaji3`) at 09:20Z**, not one triggered by this session. Please confirm it was you or a tool you run.
- ⏳ **#1088:** that real lineup, injury and roster changes still publish is verified after today's MLB runs.
- **Data follow-up (not changed):** postponed 10-16 rows carry the void reason "DNP / 0-AB". The producer should use a postponement reason. Fixing stored settlement data requires your approval.

## D. Vercel cost optimization
**Measured** (`docs/cost/VERCEL_BUILDS_MEASURED_2026-10-18.md`, GitHub evidence; **billing data unavailable** because the Vercel token expired, FD-5):
- **Production builds:** 55.3 completed builds/day over the last 7 days (58.8 over 10 days). Of those, 42.6/day were real content, ≤7.3 stamp-only and 5.4 had no build input.
- **Other pushes:** 9.7 ignored/day, 13.9 superseded/day, 1.6 failed/day. There have been 0 failures since the worker cap (#1093).
- **Top build causes:**
  - MLB lineup refresh plus daily production: 14.4/day, 78 of 101 avoidable under #1088's own rule;
  - NFL event window plus receipts: 8.6/day, all real content;
  - daily products: 6.1/day.
- **Tonight:** the 4-merge release took 2 builds; #1125 took 0 (ignored); #1126 and #1127 took 1 each.

**Estimated, not yet measured:**
- #1088: 7–10 fewer builds/day while MLB plays (postseason only).
- #1124: +0.36–0.43/day, by design.
- #1101: smaller settle diffs, not fewer builds.
- The before/after measurement runs 10-19 ≥06:00Z (§9 of the cost doc).

**Remaining levers:**
- NFL deploy spacing: an estimated 1.1–4.9 builds/day; needs your approval because it is a protected trigger.
- Auto-refresh content gate: −0.25 builds/day; small.
- Settle-rerun publish gate: measure first.

## E. Master roadmap
The canonical `GAMETIMEPICKS_MASTER_ROADMAP_V2.md` lives on the **#1116 docs branch**. It goes to `main` when #1116 merges; the merge is docs-only and skipped by the ignore step.
- **Reconciled** with all merges through #1127 and with #1083's durable facts. #1083 can be closed once #1116 is on `main`.
- **Release statuses filled in.**
- **Simulation Theater V2 (ST-01…05) and Smart Betslip (`BETSLIP-001`, SB-01…06):** P1 planning, FEASIBILITY COMPLETE, milestones PLANNED. Implementation is not authorized.
- **Ready for execution on approval:** ST-02 (6 PRs, sequenced), and SB-01/SB-02 (the tasks that need no legal sign-off).

## F. Simulation Theater V2
- **ST-01 spec v1.1** (`docs/research/SIMULATION_THEATER_V2_ST01_SPEC_2026-10-18.md`) was independently reviewed (`…_ST01_REVIEW_AND_DECISIONS_2026-10-18.md`):
  - 840 sample runs reconcile on scores, clock, possession and field position;
  - all 18 corrections were applied (clock-derived quarters, quarter-rollover markers, end-of-period labels, accessibility and mobile fixes);
  - a 32-team NFL colour table (sources cited; no logos).
- **Rendering:** a hand-written SVG field inside a semantic HTML shell, with no library. It reaches broadcast-graphics-package 2D quality; true "broadcast" realism needs play-level data (ST-04).
- **ST-02:** 11 tasks across 6 PRs, an estimated 12.5–18 days local; PRs 1–5 stay unreachable in Production.
- **Recommended first step:** PR-1, the pure adapter, validation and timeline library, plus PR-2, the preview shell and transcript. Both can start the moment you approve the design.
- **Your decisions:** D1 (P242 scope), D2 (public route), D3 (team colours), D8 (ST-03 recording). Engineering defaults cover D4–D7.

## G. Smart Betslip
- **Feasibility** (`SMART_BETSLIP_FEASIBILITY_2026-10-18.md`) and **implementation prep** (`SMART_BETSLIP_PREP_AND_OPERATOR_POLICY_2026-10-18.md`):
  - **L0, compare-only:** feasible now.
  - **L1, event links:** legal-gated.
  - **L2, single-selection prefill:** UNVERIFIED for DraftKings, FanDuel and BetMGM. Only aggregator examples exist.
  - **L3, multi-leg prefill:** NOT SUPPORTED on public evidence.
  - **L4, same-game parlays:** not feasible now.
- **Eligible-operator allowlist policy drafted:** 8 licensed keys, 6 offshore, 5 unknown, fail-closed.
- **SB-01/SB-02:** 16 tasks; most can start without legal sign-off (data foundation, allowlist, local comparison prototype).
- **Recommended MVP:** a licensed-only, timestamped comparison over existing captures, with no outbound links, no paid feed, and the forecast record kept separate.

## H. Remaining launch blockers (`docs/launch/GO_NO_GO_2026-10-18.md`)
**Engineering:**
- ✅ #1101 verified; ⏳ #1088 post-run verification;
- ⏳ the NFL Sunday live window (capture pid 8301 healthy);
- the rollback rehearsal (UAT, Mon 07:00 ET).

**Founder, legal and account:**
- Privacy and Terms (GTP-01);
- the hosted Supabase RLS run;
- Ask spend cap (#1121 after the env check);
- **offshore sportsbook prices on `/mlb` (new)**;
- MLB previous-day URLs;
- the Vercel token (FD-5).

## I. Next engineering priorities
1. **Offshore mitigation (M-1/M-2)** once you approve. It's a small, forward-only display allowlist that shuts off the compliance exposure; a draft exists locally.
2. **Finish post-release verification:** #1101 at the next settle, #1088 after the MLB runs, NFL capture acceptance. This closes the launch engineering blockers.
3. **#1121 Ask cap**, after you confirm the Production env. That closes F3.
4. **Simulation Theater PR-1 and PR-2**, once you approve the design. Low risk, unreachable in Production, 0 data writes.
5. **SB-01 data foundation:** the allowlist module and guard test, the book-selection schema and exact-match join. No legal dependency, and it enables comparisons.

## J. Decisions needed from you
1. **Offshore prices:** approve M-1 plus M-2 (forward-only, licensed-only display), and decide M-3/M-4 (consensus inputs, which change benchmarks). Counsel review recommended.
2. **Launch gates:** Privacy and Terms inputs; hosted RLS authorization; Ask cap or Ask off; the Vercel token.
3. **Simulation Theater:** approve the ST-01 v1.1 design and decisions D1, D2, D3 and D8.
4. **Smart Betslip:** counsel engagement and scope (B1); comparison display rules (B2); commercial model (B3); budget (B4); freshness target (B5); age and jurisdiction (B6).
5. **Process:** persist the standing merge policy in `CLAUDE.md`. The session was blocked from editing it. Consider the branch-protection ruleset (`docs/engineering/BRANCH_PROTECTION_RECOMMENDATION_2026-10-17.md`).
