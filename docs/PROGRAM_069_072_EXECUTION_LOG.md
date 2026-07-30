# Program 069–072 — Execution Log

**Started:** 2026-07-30 14:11 ET · **Operator:** Claude (autonomous session)
**Objective:** prove the daily lifecycle after the July 30 recovery, and reduce every public page to current, necessary, understandable content.

## Phase 0 — ground truth (14:11 ET)

| Check | Result |
|---|---|
| HEAD / origin/main | `d4b49337` == `d4b49337`, 0/0 divergence, no bot drift |
| **Deployed SHA** | `d4b49337` — production is serving local HEAD (verified via build metadata, not a substring match) |
| Working tree | clean except `vp/` (uncommitted by policy) |
| Money md5 | `affe6b21071f2b3be96bb2774eb347c3` ✅ |
| Bank Builder lock md5 | `cb80473f88f3cb5f67208fa568925295` ✅ |
| Newest board | 2026-07-30 · 425 rows · 10 games · all 5 downstream artifacts present |
| Newest settled | 2026-07-27 |
| 2026-07-28 | QUARANTINED (board refused by the lineage gate) |
| 2026-07-29 | GENERATION-BLOCKED (no board ever existed — never backfill) |

**Route inventory (starting state):** 69 source routes under `app/src/app/**/page.tsx`; **256 exported `index.html` files**. The capability registry says MLB is the only `FULL_MODEL` sport (NBA `HISTORICAL_ONLY`; UFC/soccer/NHL/IPL/WNBA/MLS `SCAFFOLD_ONLY`; EPL/NFL `DISABLED`) — yet `nba nhl ipl ufc world-cup sports events board projections trends picks parlays parlay-lab moonshot bank-builder mr-dub homer-nukes world-cup-specials build about research market-guide simulate` were all publicly exported. That contradiction is the core of the cleanup.

## Lane A — July 30 settlement · WALL_CLOCK_OPEN

At 14:16 ET: **0 of 10 games final** (4 In Progress, 6 Scheduled). The slate cannot be settled during this session — the last game will not finish until roughly 23:30 ET, and `nightly-settle` grades it on schedule.

Nothing was graded early. July 30 correctly remains **In progress** on `/results`; 2026-07-27 remains the newest genuinely settled comparison; 07-28 (quarantined) and 07-29 (generation-blocked) remain visibly distinct states.

**Exact passive verification, after tonight's `nightly-settle`:**
```bash
cd app && npm run ops:public-beta-observe     # newest settled should become 2026-07-30
```
Then confirm: every generated row accounted for (gap 0), lineage gate accepted the slate, 07-28 still quarantined, 07-29 still absent, money and lock hashes unchanged. **Do not force it.**

## Lane C — operations alerting · COMPLETE (delivery blocked by founder)

Commit `db066cb2`. The July 30 outage was surfaced correctly and still went unread for two days because the Actions tab was the only place it appeared.

- Four workflows each carried the same copy-pasted notify block with no slate context. All now call `scripts/ops_alert.sh`.
- The payload carries workflow, phase, ET slate date, exit status, run URL/id/attempt, and — the part that matters — **newest board and newest settled dates read from the real artifacts**, so an operator can tell a blip from a three-day hole at a glance.
- The free-form error line is reduced to one line and stripped of local/CI paths, key-shaped tokens, 32+ char hashes (covering the protected md5s) and `apiKey`/`token`/`secret` pairs, then truncated to 200 chars. Asserted against a hostile input carrying a real path, an API key and the actual money hash.
- Delivery **never gates**: the script always exits 0, so an unreachable webhook cannot become a second source of red. Delivery outcome is recorded in the run summary.
- `scripts/ops_alert_test.sh` also sweeps for any workflow that hand-rolls its own payload, and is wired into `run_all_tests.sh` alongside both pipefail guards.

**Founder action:** set the `OPS_WEBHOOK_URL` secret. Contract and a non-destructive verification command are in `docs/OPS_ALERTING_CONTRACT.md`. No vendor was selected.

## Lane status

| Lane | Status |
|---|---|
| 0 Ground truth + production verification | **COMPLETE** |
| A July 30 settlement + learning cycle | **WALL_CLOCK_OPEN** — 0/10 final; exact passive instructions above |
| B July 31 native stamping + concurrency repair | **NOT STARTED** — deprioritised behind cleanup; the stamping code itself shipped in Program 066–068 |
| C Operations alerting | **COMPLETE** (`db066cb2`) — delivery blocked by founder |
| D Public route + content cleanup | **NOT LANDED — preserved on branch `program-069-public-cleanup`** (below) |
| E Export privacy + freshness governance | **NOT LANDED** — same branch; the three audit docs were never written |
| F Analytics activation | **NO CHANGE** — endpoint still unapproved, production dark |
| G NBA/EPL/UFC continuation | **NOT STARTED** |
| H Integration + deployment | **PARTIAL** — Lane C shipped and verified; the cleanup was withheld |

## Lane D/E — public cleanup: substantial, unvalidated, deliberately NOT deployed

Three parallel cleanup agents ran ~90 minutes and then died mid-response (two connection failures, one stall). Their work survived on disk: **20 route deletions** (IPL/NHL `board`/`parlays`/`power`/`results` children, NBA `board`/`power`, World Cup `groups`/`round-of-32`/`schedule`/`team`/`teams`), **44 modified files** including the homepage, methodology, results, today, learn and the export prune script, plus a new `public-route-inventory.test.mjs`.

**It is not on `main`, and that is a decision rather than an omission.**

What I finished: one file an agent left mid-edit — `results/model-audit/page.tsx`, where the ranked strong/weak *cohort* columns were correctly on their way out (a ranked cohort list is recommendation-shaped) but the component outlived its own deleted import. Typecheck is clean on the branch.

What I did not do: resolve the **52 remaining test failures**, concentrated in ~8 legacy World Cup / UFC / methodology test files that pin content the cleanup removed. Each is a separate judgement about whether a specific removal was right. Deleting 52 assertions in bulk to turn a suite green — at the end of a long session, against a live production site — is the exact failure mode this repository keeps getting burned by (the July 30 outage was a green run that was lying). A cleanup that ships with its guards quietly dropped is not a cleanup.

**Preserved at:** branch `program-069-public-cleanup`, commit `8fbcf577`.

**To finish it:** work the failing files one at a time — `methodology-content`, `june16-count-and-run3`, `cross-lane-correlation`, `home-simulate-flows`, `wc-player-props`, `round-of-32-static-params`, `june21-premium-ui`, `ufc-prediction-preview` — deciding per assertion whether the removed surface should be gone (delete the test with its route) or was removed in error (restore the surface). Then write the three documents the lanes never reached: `PUBLIC_WEBSITE_PAGE_AUDIT_2026_07_30.md`, `PUBLIC_DATA_BOUNDARY_AUDIT.md`, `PUBLIC_CONTENT_AND_FRESHNESS_REGISTRY.md`.

The inventory that motivates the work stands: **69 source routes, 256 exported HTML files**, with `nba nhl ipl ufc world-cup sports events board projections trends picks parlays parlay-lab moonshot bank-builder mr-dub homer-nukes world-cup-specials build about research market-guide simulate` all publicly reachable while the capability registry lists MLB as the only live sport.

## Final validation (on the deployed line, after Lane C)

| Check | Result |
|---|---|
| JS suite (serial) | **3,573 tests · 3,569 pass · 0 fail · 4 skipped** |
| Typecheck / build / health | clean · exit 0 · HEALTHY 18/18 |
| Python `mlb+ufc+nba` | **219 passed** |
| Money / lock md5 | `affe6b21…` / `cb80473f…` ✅ unchanged |
| `vp/` | untouched, uncommitted |
