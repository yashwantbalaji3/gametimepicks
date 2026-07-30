# Program 066–068 — Execution Log

**Started:** 2026-07-30 11:26 ET · **Operator:** Claude (autonomous session)
**Objective:** July 30 daily intelligence readiness — settle what can be settled, generate and account for the July 30 research population, run the everyday-learning loop, make native row stamping load-bearing, rebuild the public contract, deploy.

## Phase 0 — ground truth at 11:26 ET

| Check | Result |
|---|---|
| Branch / HEAD | `june30-reset` @ `f75760de` == `origin/main` (expected handoff SHA confirmed) |
| Divergence | 0 / 0 — **no bot commits landed overnight** |
| Working tree | clean except `vp/` (uncommitted by policy) |
| Money md5 | `affe6b21071f2b3be96bb2774eb347c3` ✅ |
| Bank Builder lock md5 | `cb80473f88f3cb5f67208fa568925295` ✅ |
| Newest MLB board | **2026-07-28** (no 07-29, no 07-30) |
| Newest settled ledger date | **2026-07-27** |
| 2026-07-28 | still permanently quarantined |
| July 30 schedule (StatsAPI, free) | **10 games**, 4 Pre-Game + 6 Scheduled, earliest first pitch **12:10 PM ET** |

## Phase 1 — root cause of the overnight gap (PROVEN)

The missing settlement was a **symptom**. The actual failure is three days old and sits in board generation.

**Failure chain, evidenced from workflow logs:**

1. `b8c68dee` (2026-07-28 **14:14 ET**) changed `_team_lookup_from_schedule` to index team → **LIST** of games, so a doubleheader keeps a distinct `gamePk`. The last good board was generated 2026-07-28 **11:46 ET**, ~2.5h *before* that commit — which is why 07-28 was unaffected.
2. The roster-fetch loop in `pipeline/mlb/generate_mlb_board.py` was never updated and kept calling `.get()` on that value. Every run since raised `AttributeError: 'list' object has no attribute 'get'` (run 30465784209, `generate_mlb_board.py:550`).
3. **The orchestrator printed `✓ MLB board generation completed` anyway** — the run went green. Schedule and odds were unaffected: 16 games written to `mlb/schedule/2026-07-29.json`, 64 credits spent. Only the board was lost.
4. No board → `nightly-settle` failed with `MlbSettleError: board file not found: app/public/data/mlb/boards/2026-07-29.json` (runs 30523914064, 30532832145) — **correctly, fail-closed**.

**Fix:** `7efa491c` — club lookup extracted to a named `_club_identity()` that consumes the list contract and fails closed when no entry carries an id; stale `dict[str, dict]` annotation on `_build_lean` corrected. Regression test added to the identity suite (15 pass, was 14); `pipeline/mlb/` 54 passed.

### WALL_CLOCK proof closed: pipefail is PROVEN LIVE

Program 049 corrected `automation_settle.sh` to `set -o pipefail` after it reported every failure as success. That fix has now been **exercised by a real scheduled failure, not a manufactured one**: run 30532832145 propagated `exit code 2` through the pipeline, aborted publish at the health gate, and raised `##[error]GameTimePicks nightly-settle: workflow FAILED on main`. This closes the long-standing `pipefail-live` wall-clock item. (`OPS_WEBHOOK_URL` is unset, so the alert was logged rather than delivered — a named limitation, not a defect.)

### July 29 — SETTLEMENT_BLOCKED (unrecoverable, by design)

```
STATUS: SETTLEMENT_BLOCKED
date: 2026-07-29
stage: generation (upstream of settlement)
exact_error: AttributeError: 'list' object has no attribute 'get' — generate_mlb_board.py:550
rows_generated: 0  (no board file was ever written or committed)
rows_safe_to_grade: 0  (settlement grades board leans; there are none)
rows_refused: n/a
public_consequence: /results remains on 2026-07-27, the newest genuinely settled date
next_safe_action: none. Do NOT regenerate a 2026-07-29 board now — its games are final,
  so any odds captured today are post-hoc and would violate capturedAt < eventStart.
```

**Why it cannot be recovered:** settlement grades rows from a board, and the July 29 board does not exist and never did. Generating one now would capture post-final prices and present them as pregame — the exact backfill every guard in this repo exists to prevent. July 29 therefore joins July 28 as a permanent hole in the research corpus, for a different reason (28 = board refused by the lineage gate; 29 = board never generated).

**What does survive:** `mlb-pregame-capture` succeeded repeatedly through July 29 evening, so genuinely-pregame market snapshots for July 29 exist under `data/internal/mlb/pregame-archive/`, and the 07-29 research join ran (16 games joined, 2,025 settled-eligible). A future forensic reconstruction from those archived captures is possible in principle and is recorded as FUTURE_WORK — it is **not** a settlement path and must never be published as one.

## Lane status

| Phase | Status |
|---|---|
| 0 Ground truth | **COMPLETE** |
| 1 July 29 recovery / diagnosis | **COMPLETE — root cause fixed (`7efa491c`), July 29 itself unrecoverable** |
| 2 July 30 pregame universe | **COMPLETE** — 10 scheduled, 10 with odds, zero unexplained gaps |
| 3 July 30 generation | **COMPLETE** — 425 leans, board at 11:45 ET (25 min before first pitch); all 5 downstream artifacts published (`fd090114`) |
| 4 Everyday learning | **COMPLETE (no new evidence)** — the loop stopped at stage 1 because no new finals existed; nothing retrained. Contract written: `DAILY_LEARNING_LOOP_CONTRACT.md` |
| 5 Forward-only row stamping | **IMPLEMENTED, forward-only** — landed after today's board, so 07-30 stays unstamped and PROVEN_STAMPED remains 0 |
| 6 Public contract + routes | **COMPLETE** — contract rebuilt; all 6 routes verified on production at `718c8dab` |
| 7 Paper products | **NO CHANGE** — no card approved, no exposure mutation, no Moonshot activation |
| 8 Automation repair | **COMPLETE** — pipefail added to projections + refresh, sweep guard added, guards wired into the runner |
| 9 Analytics continuation | **NO CHANGE** — provider still dark; every metric NOT_YET_MEASURED |
| 10 NBA/EPL/UFC continuation | **NOT STARTED** — deliberately deprioritised behind the July 30 critical path (§13 of the prompt) |
| 11 Release QA + deploy | **COMPLETE** — found and fixed the `/results` "Complete vs Pending" defect; production verified |

## Final state

| Check | Result |
|---|---|
| Ending SHA | `718c8dab`, deployed and verified serving on production |
| JS suite (serial) | **3,573 tests · 3,569 pass · 0 fail · 4 skipped** |
| Typecheck / build / health | clean · exit 0 · HEALTHY 18/18 |
| Python `mlb+ufc+nba` | **219 passed** |
| Money / lock md5 | `affe6b21…` / `cb80473f…` ✅ unchanged |
| `vp/` | untouched, uncommitted |
| Newest board | **2026-07-30** (425 leans, 10/10 games) |
| Newest settled | 2026-07-27 — truthful; 07-28 quarantined, 07-29 never generated |
| `pipefail-live` | **PROVEN** by a real failure |
| `PROVEN_STAMPED` | 0 — reachable on the next scheduled generation |

Commits: `7efa491c` board fix · `f68e33a2` pipefail hardening · `91e33f01` pipefail proof + observer · `c95ad115` native stamping · `7dfd221c` docs · `718c8dab` /results in-progress fix.
