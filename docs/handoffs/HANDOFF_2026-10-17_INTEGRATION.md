# Engineering handoff, 2026-10-17 (integration session) → next session

**Read first:**
- `docs/launch/OVERNIGHT_REPORT_2026-10-17.md` (full context);
- `docs/launch/RUN_SHEET_OCT18_19.md` (what to do next);
- `docs/launch/LAUNCH_READINESS_MATRIX_2026-10-20.md`.

Everything below is grounded in repository and GitHub state at the time written. **Re-verify before acting.**

## State at hand-off
- **`main`:** `13689a863e` at about 19:30Z on 10-17; the newest code merge is #1118, `07ecc9684c`. Production build-info shows `07ecc968`, built 18:17:57Z. Later bot data commits deploy as usual.
- **`main` CI is RED** on one slate-dependent test introduced by the 10-17 settle data. The fix is **#1125**, which awaits approval (see §#1118).
- **Merged and verified this session:**

  | PR | Merge commit | Merged at | Verification |
  |---|---|---|---|
  | #1114 | `2cb1ba3920` | 10-16 23:44Z | `main` CI green; 0 builds (ignored) |
  | #1122 | `06895f5576` | 10-17 14:41:36Z | `main` quality-gate run 39041834117 green (unit 9,409/9,411; post-build 697/700); Production deployed |

- **Settlement recovery: VERIFIED.** Run 39055981862 settled 10-16 as 41 VOID with 0 losses. The gate is HEALTHY, history is unchanged and Production is deployed. See §Settlement recovery.
- **#1118: MERGED** as `07ecc9684c` (18:16Z) and live on Production. See §#1118.


## Standing engineering policy (founder, 2026-10-17, about 20:00Z)
The founder confirmed it twice in chat: the integration session may **merge routine, verified engineering PRs without per-PR approval**. Before each merge it must independently verify:
- exact-head CI;
- mergeability with current `main`;
- dependencies;
- integration, regression and build tests;
- data integrity;
- workflow timing and Production safeguards;
- the Vercel cost impact.

Exact-head merges only; no unprotected auto-merge, because `main` has no protection. See `docs/engineering/BRANCH_PROTECTION_RECOMMENDATION_2026-10-17.md`.

**Founder approval is still required for:**
- historical settlement restatements and material changes to published forecasts;
- legal publication;
- credentials;
- new paid services or significant spending;
- destructive or irreversible operations.

Redundant PRs are closed only after their work is verified as preserved.

**Not yet persisted in `CLAUDE.md`.** The session's attempt to read or edit the instruction file was blocked by the permission classifier, so the founder must add the policy text, or allow that edit.

## Progress after the policy
- **#1125 merged** as `d22d085cc6` at 20:08:49Z.
  - Before merging: independently re-verified on `main` plus the two newer lineup-refresh commits (explorer test 25/25; unit 9,410/9,413, 0 fail).
  - **`main` is GREEN:** quality-gate on `d22d085cc6` passed (unit 9,411/9,413; post-build 697/700).
  - Vercel: "Canceled by Ignored Build Step", so **0 builds**.
- **Combined candidate** (`main` `d22d085cc6` + #1124 + #1101 + #1117 + #1119 + #1120, merged in that order with no conflicts):
  - lint, ask:check, build and accessibility audit ✓;
  - unit 9,464/9,467, 0 fail;
  - post-build 705/708, 0 fail;
  - python 92/92.
- **Merge refs:** GitHub did not recompute them after #1125. `gh pr update-branch` was used on #1124, #1101 and #1120.
  - New heads: `4617bcc4d7`, `45fcaa3426`, `a207c627f8`.
  - Each new head's parents are exactly the old head plus `d22d085cc6`, and each diff against `main` is identical to before.
- **Trio:** #1117 ⊂ #1119 ⊂ #1120 (stacked). All 15 superseded PRs' heads (#1092, #1096–#1100, #1102–#1107, #1109, #1112, #1115) are ancestors of #1120. Merging #1120 alone brings everything in with one merge commit, and GitHub marks all 17 PRs merged.
- **#1088 is deferred** until after tonight's MLB game: TB@CLE, first pitch 00:08Z on 10-18, with lineups posting at about 21–22Z. It edits `mlb-lineup-refresh.yml` and `mlb-daily-production.yml`. Target window: 10-18, about 04:00–12:00Z, outside :25–:45, before the NFL capture window.

## Release queue (exact heads; nothing merged without explicit approval of the exact head)
| Order | PR | Head | CI | Notes |
|---|---|---|---|---|
| done | #1118 | `d36a342593` | merged `07ecc9684c` | Production verified |
| **next** | **#1125** | `51664fbffd` | ✅ on merge ref `ed802f0ac` with `13689a863e`: unit 9,411/9,413 and post-build 697/700, 0 fail | test-only; turns `main` green. **Needs approval** |
| then | #1124 | `533e699c21` | ✅ before #1118; trial below | 3 files: ignore script, guard test, behavior test. +0.36 builds/day |
| then | #1101 | `22b0ac73bd` | ✅ before #1118; trial below | protected nightly-settle; merge in a settle gap. Baseline: today's settle `0331be422a` restamped **388** past-dated files, stamps only (`verify_1101.py aba90fdbf8` → FAIL 4), which #1101 stops |
| then | #1088 | `e2dd976085` | ✅ | protected MLB workflows; outside lineup slots; `verify_1088.py` |
| UX/HTML | #1117 → #1119 → #1120 | `4b4610366e` → `4465b08d40` → `55153b7970` | ✅ | merge commits, in order; full gates green on `main` + #1122 + trio (10-17 15:30Z) |
| when env confirmed | #1121 | `abb72dff26` | ✅ | Ask fail-closed; confirm `ASK_MODEL_PROVIDER=gemini` first |
| with founder metric decisions | #1123 | `f1b4613fad` | red only on pre-#1122 tests at the time; re-run | results integrity + EPL G1 (`2664bec024`, droppable) |
| any time | #1116 | branch head | docs | all packets and reports |

**Combined trials:**
- **10-17, about 15:10Z** (`main` + #1122 + #1118 + #1124 + #1101 + #1088): unit 9,445/9,447; post-build 699/702, 0 fail; settle gate HEALTHY.
- **10-17, about 19:30Z** (`main` `13689a863e`, which includes #1118, + #1125 + #1124 + #1101 + #1088, merged in that order with no conflicts): unit **9,445/9,448, 0 fail**; python **92/92**.
  - Not re-run in this trial: post-build (needs a full build) and the verify scripts, which only apply after a merge.
- Package: `docs/launch/approvals/SEQUENCE_1122_1118_1124_1101_1088.md`. #1125 now goes first.
- **Re-run each PR's CI after #1125 merges.** Their current green runs predate #1118 and the 10-17 settle; see memory `pr-ci-stale-merge-ref`.

## Open-PR backlog (46 open at hand-off)
- **Contained in consolidated releases (15).** These auto-close as merged when the trio merges via merge commits. Close only with founder approval.
  - in #1117: #1096–#1100;
  - in #1119: #1092, #1102–#1107, #1109, #1112, #1115.
- **Live Hub V2 (preview only):** #1082 (`f53d7417a6`; capture kit), plus #1108 and #1111 stacked on it.
- **Founder decisions or older research:** #716, #1041, #1043, #1044, #1045/#1049 (TRUTH-001, needing a new write-once log), #1048/#1050, #1056 (superseded), #1061, #1066, #1077 (legal drafts; must not publish), #1083, #1086, #1090, #1094 (hold), #1095, #1110.
- **Branches without a PR:**
  - `claude/mlb-served-revision-proposal` (`82a2dbffa3`);
  - `claude/writer-batching-prototype` (`c4f9304eb9`);
  - `claude/nfl-receipts-stamp-gate` (parked; saves 0 deployments);
  - `claude/results-plain-verdict-terms` (superseded by #1120).

## Vercel cost findings (measured; no billed savings claimed)
- **Baseline per push, 10-09 → 10-17:**
  - 58.7 completed builds/day: 44.7 real content, ≤ 7.7 stamp-only, 6.3 with no build input;
  - 9.6 Ignored-Build-Step pushes/day.
- **Biggest safe lever: #1088,** about 7–10 fewer builds/day while MLB runs. Writer batching is worth only about −0.25 builds/day plus −2.12 skips/day (the auto-refresh content gate prototype).
- **NFL window spacing:** no change before launch. After launch, only "120 min, never within T−3h, never deferring live-props", log-only first.
- **#1124 adds about +0.36 builds/day** to fix measured stale public data (8–50 min windows).
- **HTML −27% bytes** (#1117): no measured build-time change.
- **Settle restamp churn (new 10-17 evidence):** today's settle rewrote stamps in 388 past-dated files with unchanged values. The settle commit always deploys anyway, because it adds dated public files. So #1101 shrinks the diff, upload size and history noise; it does **not** remove a build. No billed saving is claimed.
- **Today's recovery used 1 build:** the settle build was superseded by the ledger commit's build, and no build was forced.
- **Billing evidence needs a Vercel token** (FD-5).

## Sunday NFL capture
- pid **8301**, launched from a Terminal-panel tab via `~/gtp-evidence/live-v2-sun-1018/launch.sh` (nohup + caffeinate).
- Games: HOU vs JAX 401872996 at 13:30Z; NO @ NYG 401873000 at 17:00Z; BUF @ LV 401873005 at 20:25Z.
- Runs to 2026-10-20T04:00Z.
- Checks: `node docs/live/capture/check-live.mjs ~/gtp-evidence/live-v2-sun-1018/captures` (read-only) at about 13:45Z, 17:15Z and 20:40Z, then `report.mjs` and `git-watch.mjs`.
- Do **not** restart it or modify its kit or evidence. Keep the Mac on AC power with the lid open.

## Launch: NO-GO until these close or are accepted in writing
- F-1 Privacy/Terms (founder inputs + counsel);
- F-2 Supabase tiers A–C;
- F-3 Ask cap (+#1121) or Ask off;
- F-4 rollback dry run (Mon 07:00 ET);
- #1118 deployed;
- no P0 in the UFC (10-17) or NFL (10-18) windows.

## Known open items
- **MLB lineup-refresh:** GitHub delayed the cron triggers. The 17:53Z run succeeded, and data is not stale. **Check again at about 23:00–23:15Z on 10-17**; see §Lineup-refresh. No dispatch without approval.
- **10-17 explorer lineage:** 41 CONFLICTED rows, so 0 rows can be claimed. The page falls back to 10-16. This is a research-lane look, not launch-blocking.
- **settled_leans key-order churn:** each settle re-serializes JSON key order, so the whole file appears in the diff with identical values. This is diff noise.
- **Transient:** a build in the gap between the MLB board commit and the simulations commit has no MLB search entries (one build window).
- **TRUTH-001:** F1–F9 decisions (`docs/research/truth/MLB_RESTATEMENT_PROPOSAL_2026-10-17.md`).
- **Results integrity founder decisions:** NBA dedup, Homer Nukes, "Edge" copy, About claim.

## Section stubs filled at hand-off
### Settlement recovery
**Status: VERIFIED.** All checks below were made independently against origin/main and Production on 10-17 at about 18:00–18:08Z.

**The run (39055981862):** a single founder-approved `workflow_dispatch` on `aba90fdbf8` with default inputs, so the settle date was 2026-10-16 ET. It concluded **success**; every step succeeded, and the failure-upload and notify steps were skipped.
- **Orchestrator:** `settled=41 decisive=0 wins=0 losses=0 pushes=0 voids=41 pending_games=0 unavailable=1 published=42 reconciles=YES`.
  - All 41 are props on TB@CLE 849817, which was postponed. The 10-16 linescore shows 1 game, 0 final.
- **Health gate (the corrected #1122 gate):** `✓ HEALTHY — 20 passed, 1 warning`. The warning is `freshness:portfolio` at 102 days, which predates this run and doesn't block. The `research-contract:stale` failure seen on main before #1122 no longer appears.
- **Commits:**
  - `0331be422a` "auto: nightly settle 2026-10-17 14:01 ET" (455 files, mostly regenerated projections);
  - `4a6f8b2713` "auto: forecast ledger 2026-10-17 14:02 ET".
  - The ledger step printed `commit-generated: pushed (attempt 1)`, and its `--verify-against HEAD` step refused nothing.

**Independent checks (scratchpad diff scripts):**
- **`settled_leans.jsonl`** (app/public and pipeline/validation copies):
  - old 52,819 rows → new 52,860;
  - **0 missing, 0 changed, old order preserved, 0 duplicate ids**;
  - +41 rows, all `('2026-10-16','Void')`.
  - The raw diff touches every line only because the JSON key order was re-serialized; the values are identical. That churn is noise in diffs, not an integrity issue.
- **`results/settled_leans.jsonl`:** 4,592 rows in both versions, 0 changed.
- **Forecast ledger v1:** 15,957 → 16,319 rows.
  - EPL +356, MLB +5, Ligue 1 +1: pure appends with 0 deletions.
  - NFL: 4,692 rows, 0 missing. 56 rows changed **only** `settlement.finality` PROVISIONAL → CANONICAL; state, value and settledAt are the same. All 56 are SEA@DEN 401872995 (46 SETTLED, 10 NO_MEASUREMENT). This is the expected canonical settlement for the Thursday game.
- **Other record files:** homer-nukes `record.json`, `game-predictions-record.json` and bank-builder `ledger-latest.json` changed `generatedAt` only. The parlay lab-ledger changed only timestamps and price age.

**Production:**
- The Vercel deployment for `0331be422a` was cancelled when `4a6f8b2713` landed seconds later. The deployment for `4a6f8b2713` **succeeded**.
- Build-info shows commit `4a6f8b27`, built 18:04:16Z. That was **one** build and none was forced.
- `/data/mlb/results/model-rows/2026-10-16.json` is served: **41 rows, all `void`**, 0 losses.
- The Results page carries "Pushes and voids are never losses".
- `settled_leans.jsonl`, `audit/daily/*` and `results/projection/*` return 404 for every date by design; they are not exported.

**Side notes:**
- A `nightly-settle` run from **10-07** (37655501437, schedule) is still listed as *queued*. It is stale and harmless; leave it unless the founder asks.
- The three scheduled settle runs on 10-17 before the fix (11:11, 12:08 and 13:09Z) are red. That was the pre-#1122 gate.
### #1118
**MERGED** as `07ecc9684c` at 2026-10-17 18:16:05Z, at exact head `d36a34259344288b8cc9d33d6f101cb2d89e06d4` with `--match-head-commit`.
- **Pre-merge recheck at 18:16:03Z:** head unchanged; MERGEABLE/CLEAN; 2 files (`product-day.ts` and its test); quality and python green; 0 workflows in progress.
  - I waited out `mlb-daily-production` 39056444695 (workflow_run, 18:03 → 18:10Z) and `daily-products` 39056964683 (18:10 → 18:15Z).
  - The merge happened at minute :16, before the :25–:45 lineup window.
- **Merge diff:** first parent `b09c939700`, 2 files, +119 / −0.
- **Historical regression scenarios on the merge commit (local, `npx tsx --test`): 9/9 pass.**
  - P250-W1: a played week never resurrects the preseason note.
  - 2026-10-16: a stale next kickoff after Thursday never hides the week.
  - P224: a NULL anchor is never "upcoming".
  - Plus the four sport-equivalence tests.
- **Production:** Vercel `success`; build-info `07ecc968`, built 18:17:57Z.
  - Home: "NFL · Event this week · No NFL games today · Week 6: 13 game forecasts published · next kickoff Sun, Oct 18 (HOU @ JAX)".
  - /today: "Live today: MLB · UFC". NFL is correctly *not* claimed as live on Saturday. No preseason or offseason wording anywhere.
- **Main CI on the merge (quality-gate 39057345451): RED, 1 failure, not caused by #1118.**
  - The failing test is `disagreement-explorer.test.mjs` › "the loader lists only rows whose provenance is proven and pregame" (unit 9,409/9,412).
  - Bisect: passes at `aba90fdbf8`, fails from settle commit `0331be422a` onward, including `b09c939700`, the commit before #1118.
  - Cause: the newest explorer slate became 10-16, which is fully proven (42 of 42), and the test asserted `total > listed` against live data.
  - **Fix: PR #1125** (test-only, 1 file; head `51664fbffd`), with the evidence and mutation checks in its body. **Awaiting founder approval.**
  - Until #1125 merges, every PR's CI is red on this test once its merge ref includes the 10-17 settle.
  - Post-build never ran on main because phase 1 failed. #1118's post-build evidence is the combined trial (699/702, 0 failures, about 15:10Z).
### Lineup-refresh
Investigated read-only at about 17:57Z on 10-17. Nothing was dispatched or modified.

**Cause:** GitHub dropped or delayed the scheduled triggers. Nothing in the workflow blocked them.
- The workflow is `active`. Concurrency is `gtp-generated-artifacts` with cancel false, and there were no cancelled or skipped runs.
- The 15:30Z and 16:30Z triggers never fired. The 17:30Z trigger fired 23 minutes late, at 17:53Z.
- `mlb-pregame-capture` also missed its 15:00Z slot.
- This happens every day. The first lineup-refresh run landed at 20:15Z on 10-14, 19:16Z on 10-15 and 18:52Z on 10-16.

**Runs on 10-17 (UTC):**
- 00:36 and 01:27 succeeded.
- 04:45 was a late evening cron: it found no board and committed nothing.
- 17:53 succeeded and committed `79da122e0`. Confirmed batting orders: 0 (not posted yet). TB@CLE 849816 was rebuilt with prop-derived lineups.

**Artifacts (generatedAt):** boards 13:58Z, game-simulations 14:16Z, full-game-simulations and predictions 17:54Z. First pitch is **00:08Z on 10-18**.

**Verdict:** **NOT STALE.** Lineups are not posted yet. Production `928f413c` includes the morning slate. The 17:54Z refresh is not deployed yet, but its inputs were the same as the morning slate's.

**Watch point:** at about 23:00–23:15Z, check for a lineup-refresh run since about 21:00Z with `confirmed batting orders` > 0, or with full-game-simulations no longer `prop-derived`.
- If neither holds, a single manual `workflow_dispatch` (no date input) is the remedy. It is free and deterministic, and it **needs founder approval**.
- Recovery is confirmed by:
  - a new `auto: mlb lineup refresh` commit;
  - a confirmed lineup source, with `confirmed_batting_order` absent from `missingFamilies`;
  - predictions generated after the lineups posted and before 00:08Z;
  - Production build-info at or after that commit before first pitch.
