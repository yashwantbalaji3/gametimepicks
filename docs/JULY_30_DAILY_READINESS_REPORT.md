# July 30, 2026 — Daily Readiness Report

**Program:** 066–068 · **Compiled:** 2026-07-30 12:12 ET · **Deployed commit:** `718c8dab`
**Verdict:** the site is **truthfully July 30-ready**. The slate is complete and published; the results surface is honestly three days behind, for a reason that is stated rather than papered over.

---

## 1. What was broken

At 11:26 ET the newest board was **2026-07-28** and the newest settled date **2026-07-27**. Two days of the product were missing.

The cause was a single line, three days old:

- **2026-07-28 11:46 ET** — last good board generated.
- **2026-07-28 14:14 ET** — `b8c68dee` changed `_team_lookup_from_schedule` to index team → **list** of games, so a doubleheader keeps a distinct `gamePk`. The roster-fetch loop was not updated and kept calling `.get()` on that value.
- **2026-07-29 onward** — every generation raised `AttributeError: 'list' object has no attribute 'get'` at `generate_mlb_board.py:550`. Schedule and odds were unaffected (16 games written, 64 credits spent each day). Only the board was lost.
- **`automation_projections.sh` had `set -e` but no `pipefail`**, so `python … | tee log` returned *tee's* status and the script printed `✓ MLB board generation completed` over the traceback. **The run went green.**
- No board → `nightly-settle` failed with `board file not found` — correctly, fail-closed.

The first *visible* symptom was a missing day on the public site, two days after the actual break.

## 2. What was fixed

| Fix | Commit |
|---|---|
| Board generation consumes the list contract; club lookup extracted to a testable `_club_identity` that fails closed | `7efa491c` |
| `pipefail` added to the projections **and** refresh orchestrators; new guard sweeps every `automation_*.sh`; both pipefail guards wired into `run_all_tests.sh` | `f68e33a2` |
| Pipefail live proof recorded; observer reads the evidence artifact instead of reporting a closed proof as open | `91e33f01` |
| Native per-row provenance stamping at generation time | `c95ad115` |
| `/results` no longer calls an unfinished slate "Complete" | `718c8dab` |

The guard found a third uncovered orchestrator (`automation_refresh.sh`) on its first run.

## 3. July 30 slate — generated and accounted

| | |
|---|---|
| Scheduled games (StatsAPI) | **10** |
| Events with odds | **10** |
| Leans generated | **425** |
| Coverage gap | **0** — `scheduledGames == eventsWithOdds` |
| By market | `batter_hits` 163 · `batter_hits_runs_rbis` 163 · `batter_total_bases` 81 · `pitcher_strikeouts` 18 |
| Confidence spread | high 172 · medium 59 · low 156 · insufficient data 38 · anomalies 9 |
| Board generated | 11:45 ET — **25 minutes before the 12:10 ET first pitch**, so the capture is genuinely pregame |
| Downstream artifacts | team-markets, player-props, game-simulations, full-game-simulations, predictions — **all five present** (`fd090114`) |

`batter_total_bases` rows are generated because the pipeline needs them, and remain **prediction-disabled**: excluded from every ranked or recommendation-shaped list, visible only with their disabled status attached.

## 4. July 29 — SETTLEMENT_BLOCKED, and not recoverable

```
stage: generation (upstream of settlement)
rows_generated: 0        — no board was ever written or committed
rows_safe_to_grade: 0    — settlement grades board leans; there are none
public_consequence: /results stays on 2026-07-27, the newest genuinely settled date
```

**It cannot be recovered, and it was not faked.** Settlement grades rows from a board that does not exist. Generating one now would capture post-final prices and present them as pregame — the exact backfill every guard in this repository exists to prevent. July 29 joins July 28 as a permanent hole, for a different reason: 28's board was *refused* by the lineage gate; 29's was *never generated*.

Genuinely-pregame July 29 market snapshots do survive in `data/internal/mlb/pregame-archive/` (the capture workflow kept running). A forensic reconstruction from those is conceivable and is recorded as FUTURE_WORK — it is **not** a settlement path and must never be published as one.

## 5. A wall-clock proof closed itself

`nightly-settle` run 30532832145 is the Sprint 049 pipefail fix meeting a **real** production failure: exit code 2 propagated, publish aborted at the health gate, and the workflow raised an error. Nothing was manufactured. **`pipefail-live` is now PROVEN** and recorded in `data/internal/mlb/integrity/pipefail-live-proof.json`.

Named limitation attached: `OPS_WEBHOOK_URL` is unset, so the alert was written to the run log rather than delivered. That is precisely why a hard failure sat unnoticed for two days.

## 6. Everyday learning — what actually ran

The loop is ordered `finals → lineage-gated settlement → reconciliation → history append → diagnostics → autopsy → registry → public contract → next slate`. Each stage consumes the one above it, and **a stage that cannot run stops the chain**.

Today it stopped at the first stage: there were no new finals to settle, because the slate that would have produced them was never generated. So:

- **No new settled rows.** The corpus stands at 22,660 rows through 2026-07-27.
- **No diagnostics refresh, no daily autopsy** — there is no new evidence to compute them from. Publishing a "learning artifact" for a day with zero new outcomes would be theatre.
- **Nothing was retrained**, which is the normal state, not a consequence of the outage: the contract in `DAILY_LEARNING_LOOP_CONTRACT.md` prohibits same-day weight updates and calibrator refits outright.

The honest summary of what the platform learned today is **operational, not predictive**: a green run had been lying for two days, and the alerting that should have said so was never configured.

## 7. Row stamping

Native stamps (`eventId`, `capturedAt`, `scheduledStart`, provider refs, derived `researchEligible`) are implemented and guarded, but landed **after** today's board was rebuilt. The 2026-07-30 board is therefore **not** stamped, and no attempt was made to add stamps afterwards — that would invent the timestamps the contract exists to protect.

**`PROVEN_STAMPED` remains 0.** It becomes reachable on the first scheduled generation after this deploy. See `FORWARD_ONLY_ROW_STAMPING.md`.

## 8. Public routes — date truth verified on production

| Route | Status | Verified |
|---|---|---|
| `/` | 200 | research-terminal positioning |
| `/today` | 200 | **July 30**, matchups rendering, event-time order |
| `/markets` | 200 | disagreement explorer with denominators and intervals |
| `/results` | 200 | newest settled **2026-07-27**; 07-28 **Withheld**; 07-30 **"In progress"** |
| `/methodology` | 200 | no auto-improvement claim |
| `/system-status` | 200 | worst-of = QUARANTINED |

**A defect was found and fixed during this QA.** `/results` labelled the July 30 slate **"Complete — Every generated row reached a final state"** while showing **Pending 387**. Accounting integrity and slate progress are different questions, and one state was answering both. Today was the first time an unplayed slate reached that surface. It now reads *"In progress — Games are still being played. Rows resolve as they finish; nothing is counted early."*

## 9. Protected state

| | |
|---|---|
| Money md5 | `affe6b21071f2b3be96bb2774eb347c3` ✅ unchanged |
| Bank Builder lock md5 | `cb80473f88f3cb5f67208fa568925295` ✅ unchanged |
| `vp/` | untouched, uncommitted |
| Paper products | no card approved, no exposure mutation, no Moonshot activation |
| Pre-program stashes | left alone |

## 10. Validation

JS **3,573 tests / 0 fail / 4 skipped** · typecheck clean · production build exit 0 · health **18/18** · Python `mlb+ufc+nba` **219 passed** · pipefail guards pass. Pre-existing `balldontlie_provider_test` failures remain out of scope (reproduced at pristine HEAD in the prior program).

## 11. Open, with exact next actions

| Item | Owner | Next action |
|---|---|---|
| First clean post-gate settlement | passive | tonight's `nightly-settle` should now find the 07-30 board; run `npm run ops:public-beta-observe` and work the checklist. **Do not force it** |
| First natively-stamped board | passive | next scheduled `morning-projections`; `PROVEN_STAMPED` should become non-zero |
| `OPS_WEBHOOK_URL` | **founder** | set the secret so a failing run reaches a person, not just the Actions tab |
| Analytics endpoint | **founder** | still unsigned; every adoption metric stays `NOT_YET_MEASURED` |
| Workflow concurrency | engineering | `morning-projections` and `daily-refresh` write the same generated JSON and raced today, costing one full run |
