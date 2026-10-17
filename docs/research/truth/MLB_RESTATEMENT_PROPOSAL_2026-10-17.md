# TRUTH-001 · MLB forecast-of-record restatement proposal (2026-10-17)

**Status:** PROPOSAL. Nothing has been applied, merged or deployed, and no data file was changed. The founder approves each point in §9 separately.
**Author:** analysis session, read-only on data. **As of:** 2026-10-17 ~07:30Z.
- Graded logs are byte-identical on `origin/main` `2c617c780c` and on `8433d82bd9`, the base of the prior analysis.
- Builds on [`TRUTH_MLB29_ANALYSIS_2026-10-17.md`](TRUTH_MLB29_ANALYSIS_2026-10-17.md), draft PRs #1045 and #1049, and the branch `claude/mlb-served-revision-proposal`.

**Policy (Option B, founder 2026-10-09):** the official forecast is the revision **demonstrably served by a READY Production deployment before the real start**. Generation time is not publication, and a commit is not publication.

**Scoring wording:**
- Log loss and Brier are **lower-is-better**. The coin flip scores 0.6931.
- A difference is "established" only when the paired-bootstrap 95% interval excludes 0.
- Nothing here is a model improvement. Every change is a restatement of **which forecast was public**.

## 1. Summary

1. **The counts reconcile** over 818 graded games (§2):
   - **22** graded from a different revision than the one on the site at first pitch: class (a) 2 + (b) 14 + (c) 6. The **6** outcome-changing games are a *subset* of the 22.
   - **4** with no forecast on the site at first pitch.
   - **9** ambiguous members of the original 29.
   - **2** former "never public" games that now resolve as served = graded.
   - 22 + 4 + 9 + 2 = **37** games ever implicated.
2. **High-confidence corrections (21 games): the "demonstrably justified" set.** These are the 22 minus 824424, which is held for policy reasons and not for lack of evidence. All 21 rest on the exact Vercel record. In each, the served bytes were public **18 min to 12.5 h** before first pitch.
   - 6 change at least one W/L outcome: 10 graded rows.
   - 13 change probabilities only.
   - 2 change provenance only.
3. **New finding: the 4 "never public" games were public.**
   - In every one, READY Production builds served the **graded bytes** for hours before the delayed start.
   - The site then switched the game to "unavailable": the pipeline flagged it as "started before generation" once the *scheduled* start passed.
   - At the actual first pitch the site showed no forecast for these games.
   - Whether to void them (R1) or keep them as graded (R2) depends on how Option B is read, not on the evidence. **Founder decision F2.**
   - Either way, the label "never public" is wrong and should not be published.
4. **New finding: 823246, one of the original "never public" pair, resolves only on an 8-second margin.**
   - The resolving build was READY 8 s before first pitch, and every earlier build that day showed the game as unavailable.
   - Production promotion lag after READY was never measured, so this is **not** demonstrably served.
   - Treat it as ambiguous. **F5.**
5. **New finding: the 2 "unreadable build" games (823742, 824062, 2026-09-07) are likely never public.** No Production build READY before their first pitch contained any `predictions/2026-09-07.json`. **F5.**
6. **Metrics (§6).** No model-health state changes under any reading.
   - Moneyline log loss stays **worse than a coin flip** under every reading: 0.7000 → 0.6986 (R1) or 0.6998 (R2). The interval includes 0, so neither the gap to the coin nor any change is established.
   - Totals stay **established worse than a coin flip**: 0.7279 → 0.7282 or 0.7286.
7. **Grader switch: tests added.** The selector on the proposal branch now has 21 tests (11 new: unreadable build, never-served, ambiguous window both sides at ±60 s and −600 s, content invariance not applied, refusal tally). It also gets a per-status refusal tally in the grader output.
   - Commit **`82a2dbffa3`** on `claude/mlb-served-revision-proposal`, pushed, no PR.
   - Targeted run: 124/124.

## 2. Reconciliation of the counts

**Population (denominator).** The graded log on `main` holds:
- **818 games** (gamePk), MLB slate dates **2026-07-24 → 2026-10-15** (ET slate date), regular season and postseason.
- **2,449 graded game-market rows:**

  | Market | Rows | W–L–P |
  |---|---|---|
  | moneyline | 818 | 418–400 |
  | run line v1 ±1.5 | 810 | 510–300 |
  | run line posted (v2, postseason) | 8 | 5–3 |
  | total | 813 | 380–395–38 |

- **818 projected-score rows** in a separate log, graded by absolute error.

**Counting unit.** Every count in this document is **games**, unless it says rows. A game counts once however many of its rows change.

**Classification of all 818 games** (resolver from #1046; fresh captures 2026-10-17 01:18Z deployments and 01:19Z first pitch):

| Status | Games | Evidence |
|---|---|---|
| Verified: served = graded | 576 | 332 exact Vercel record, 244 GitHub (conservative clock −600/+60 s) |
| **Verified: graded ≠ served** | **22** | all exact Vercel record (2026-09-01 → 10-08) |
| **Verified: no forecast served at the start** | **4** | all exact record |
| Unverified | 216 | 134 ambiguous near the cutoff (13 exact, 121 GitHub) · 1 ambiguous deployment state (GitHub FAILURE record) · 79 evidence gap (before GitHub's record begins 2026-07-31 22:07Z) · 2 build unreadable |
| **Total** | **818** | 576 + 22 + 4 + 216 |

**How 37 / 22 / 6 / 4 / 9 / 2 relate:**

| Set | Games | Relation |
|---|---|---|
| Original "29 graded from unserved revisions" (#1046 first shadow `69c8e1e616`, 2026-10-10, scheduled-start basis) | 29 | historical. 14 were the Stage-A proposals in `app/public/data/mlb/corrections/forecast-of-record-corrections.jsonl` (PROPOSED_NOT_APPLIED), 15 were new |
| Original "2 never public" (same run) | 2 | historical: 824387, 823246 |
| Verified graded ≠ served today | **22** | = 20 of the 29 + 824424 + 824471 (both had late starts, so a later served revision qualified on the actual-start basis) |
| of which class (a) provenance only | 2 | subset of the 22 |
| of which class (b) probabilities only | 14 | subset of the 22 (includes 824424, held) |
| of which class (c) an outcome changes | **6** | subset of the 22. 10 graded rows flip |
| No forecast at the start, class (d) | **4** | disjoint from the 22, and none of them was in the 29 or the 2 |
| Ambiguous original-29 members, class (e) | **9** | disjoint from the 22 and the 4; subset of the 216 unverified |
| Former "never public" now served = graded | 2 | disjoint from all of the above. 823246 is fragile (§1.4) |
| **Ever implicated** | **37** | = 22 + 4 + 9 + 2 = 29 + 2 + 6 new (824424, 824471, 824226, 824381, 824546, 823653) |

- **The 29 today:** 20 still verified different (a 2, b 12, c 6) and 9 ambiguous.
- **The 14 Stage-A proposals:** 11 corroborated, and 3 (823084, 823650, 824542) superseded as unverifiable. That supersession is recorded in `data/internal/mlb/corrections/forecast-of-record-proposals-supersession-2026-10-10.json`.
- **The #1045 log** (`2026-10-10-truth-001`) restates **21** games, the 22 minus 824424:
  - 63 game rows and 21 projected rows restated;
  - 4 NOT_SERVED games, whose 12 game rows and 4 projected rows are excluded;
  - 100 before-states in total, all still byte-equal to the graded logs today.

**Rows, not games:**

| Group | Graded game-market rows |
|---|---|
| Class (c) rows whose W/L outcome flips | 10 (ML 4, RL 3, total 3) |
| All rows of the 21 restated games | 63 (probabilities and source change on most) |
| Rows of the 4 class-(d) games | 12 |
| Rows of the 9 class-(e) games, *if the other build served* (unknown) | 4 could flip (822771: 3; 824542: 1) |

## 3. Method and evidence (read-only)

| Input | Source |
|---|---|
| Exact deployment record, 2026-09-01 00:24Z → 10-08 23:50Z, ±5 s | `data/internal/ops/vercel-production-deployments/2026-09-01_2026-10-09.json` (#1042, Vercel API, 2,891 deployments) |
| GitHub deployment record, 2026-07-20 → 10-17 01:18Z (4,463 Production deployments) | prior-analysis scratchpad `mlb29/evidence/github-…-2026-10-17T01-18-32Z.json`. Not committed: §8 step 1 |
| Actual first pitch, 818/818 | StatsAPI play-by-play, first pitch event, as a 10 s interval: scratchpad `mlb29/evidence/2026-10-17T01-19-37Z.json`. "PITCH_EVENT" in the table |
| Graded revision | the graded log row's `forecastSource` and `forecastGeneratedAt`. Snapshot files are `data/internal/mlb/prediction-snapshots/<date>/…`; the commit that added each is shown (`git log --diff-filter=A`) |
| What a deployment served | `git show <deployment sha>:app/public/data/mlb/predictions/<date>.json`, the game's row `artifactHash` and `status` |
| Per-game comparison | prior scratchpad `mlb29/compare.mjs` (Production `gradeGameFamilies` against the stored final) |
| Deployment-by-deployment timeline (new) | `restate/timeline.py`: for each exact-record game, what every READY build from 30 h before to 6 h after the start carried for the game |
| Scenario metrics | `restate/metrics2.mjs` (Production `comparePairedLoss`/`logLossOf`, same seed as model-health) |

Scratchpad root: `/private/tmp/claude-501/-Users-yashwantbalaji-Downloads-gametimepicks/21770f07-86ae-4703-b627-6bfcc86e03c9/scratchpad/`. It is ephemeral. Step 1 of §8 commits the evidence that matters.

**Confidence legend (used in the table):**
- **H1, HIGH: served revision established.**
  - Exact Vercel record (±5 s). No READY deployment within the clock band of the start.
  - The serving build's content was read from git at its sha.
  - The served bytes had been public, in an unbroken run of READY builds, for the stated number of minutes before first pitch, all ≥ 18 min. A promotion lag of seconds therefore cannot change which bytes were on the site.
  - The graded bytes reached no READY build before the start, or were replaced before it.
  - Residual: rollbacks and alias changes are not in the record, because there were no live probes then.
- **H2, HIGH on the facts (class d).** Both facts come from the exact record and git builds:
  - the graded bytes were served before the start;
  - the build serving at the start showed the game as `unavailable`.
- **L1, LOW: ambiguous, outcomes unaffected.** A deployment's READY time is inside the clock band of the start. Every possible serving build gives the same W/L/P, so only the probabilities are uncertain.
- **L2, LOW: ambiguous, an outcome is at stake.**
- **L3, LOW under the resolver as written.** Every possible build carried the graded bytes, so the grade cannot change. The case is still unverified, because content invariance is not a rule.
- **U1, MEDIUM: likely never public.** The serving build contained no dated predictions file for the slate. What the site rendered without it is not established.

**What the evidence cannot show:**
- **Live state.** Nothing records what a browser actually displayed: no probes existed before 10-17. Rollbacks, alias changes and CDN staleness are invisible.
- **GitHub timing.** GitHub records are blind to CLI deploys and redeploys, and their READY times run up to 7 min late.
- **The August games.** The 79 evidence-gap games (07-24 → ~08-01) can never be verified from deployment records.

## 4. Per-game evidence table: every implicated game

The columns:
- **First pitch:** scheduled vs actual, with its source.
- **Graded revision:** file, generation time, adding commit, content hash.
- **Graded quantities and original outcomes:** pick, probability and outcome per market.
- **Served at the start:** the revision, the serving deployment and its READY time, and how long the same bytes had been public.
- **Proposed under Option B.** "⟵ changes" marks an outcome that differs from the original.
- **Provenance evidence**, class and confidence.

For class (e), "none established" is followed by every build that could have been serving, and what grading from it would give.

#### A. Graded from a different revision than the one served at the start (22 = class a 2 + class b 14 + class c 6), all on the exact Vercel record

| Game · date | First pitch (source) | Graded revision | Graded quantities · original outcomes | Served at the start | Proposed under Option B | Provenance evidence | Class | Confidence (reason) |
|---|---|---|---|---|---|---|---|---|
| 822763 DET @ TOR<br>2026-09-16 | sched 09-16 19:07Z<br>actual 09-16 19:07:04Z (+10 s)<br>PITCH_EVENT | `snap:2026-09-16/snapshot-202609161859.json`<br>gen 09-16 18:59:50Z<br>commit `af6c13943e` 09-16 19:00:03Z<br>hash `83723fa899` | ML TOR (home) 0.501 **WIN**<br>RL DET +1.5 0.675 **LOSS**<br>Tot UNDER 8.5 0.517 **WIN** | `git:4c2d3c9e0a17` gen 09-16 10:07:14Z<br>serving `dpl_AvqXU8aVM1cW5cmLWnAwuHsVwybg` · `4f2dda0042` READY 09-16 19:06:48Z<br>same bytes public since 09-16 10:27:32Z<br>hash `f6fe543772` | ML TOR (home) 0.542 **WIN**<br>RL DET +1.5 0.638 **LOSS**<br>Tot OVER 8.5 0.514 **LOSS** ⟵ changes | EXACT_RECORD · SERVED<br>graded bytes first in a READY build: 09-16 19:10:11Z (after the start)<br>next READY after start 09-16 19:10:11Z | c | **HIGH** (H1): served bytes public 520 min before first pitch |
| 823578 SF @ NYM<br>2026-09-06 | sched 09-06 17:40Z<br>actual 09-06 17:40:32Z (+10 s)<br>PITCH_EVENT | `snap:2026-09-06/snapshot-202609061738.json`<br>gen 09-06 17:38:33Z<br>commit `b50171989a` 09-06 17:38:41Z<br>hash `3336f0cb6b` | ML NYM (home) 0.507 **WIN**<br>RL SF +1.5 0.686 **LOSS**<br>Tot UNDER 8 0.593 **WIN** | `git:03afc0de8c1b` gen 09-06 17:05:49Z<br>serving `dpl_9mhsKi6aqEPJg4RYiuhz9JfxLSrm` · `f56a4ae62d` READY 09-06 17:34:08Z<br>same bytes public since 09-06 17:18:26Z<br>hash `f2313ef5ae` | ML SF (away) 0.507 **LOSS** ⟵ changes<br>RL NYM +1.5 0.644 **WIN** ⟵ changes<br>Tot UNDER 8 0.629 **WIN** | EXACT_RECORD · SERVED<br>graded bytes first in a READY build: 09-06 17:45:15Z (after the start)<br>next READY after start 09-06 17:43:12Z | c | **HIGH** (H1): served bytes public 22 min before first pitch |
| 823579 SF @ NYM<br>2026-09-04 | sched 09-04 23:10Z<br>actual 09-04 23:10:20Z (+10 s)<br>PITCH_EVENT | `snap:2026-09-04/snapshot-202609042309.json`<br>gen 09-04 23:09:50Z<br>commit `717470fc5e` 09-04 23:09:58Z<br>hash `65590cf6a7` | ML NYM (home) 0.527 **WIN**<br>RL SF +1.5 0.67 **LOSS**<br>Tot UNDER 7.5 0.642 **LOSS** | `git:7942eb5dba66` gen 09-04 20:57:41Z<br>serving `dpl_7Jh9KMeNq8MbaKBpA4jaaiBHqrTh` · `86674a30e3` READY 09-04 22:56:06Z<br>same bytes public since 09-04 21:04:12Z<br>hash `42f2f2ac30` | ML SF (away) 0.508 **LOSS** ⟵ changes<br>RL NYM +1.5 0.638 **WIN** ⟵ changes<br>Tot UNDER 7.5 0.609 **LOSS** | EXACT_RECORD · SERVED<br>graded bytes first in a READY build: 09-04 17:48:51Z (earlier in the day, then replaced before the start)<br>next READY after start 09-04 23:17:53Z | c | **HIGH** (H1): served bytes public 126 min before first pitch; graded bytes public earlier that day, replaced before the start |
| 823824 CHC @ MIA<br>2026-09-04 | sched 09-04 23:10Z<br>actual 09-04 23:10:26Z (+10 s)<br>PITCH_EVENT | `snap:2026-09-04/snapshot-202609042309.json`<br>gen 09-04 23:09:50Z<br>commit `717470fc5e` 09-04 23:09:58Z<br>hash `b579704f8c` | ML CHC (away) 0.7 **WIN**<br>RL CHC -1.5 0.569 **WIN**<br>Tot OVER 8 0.47 **LOSS** | `git:7942eb5dba66` gen 09-04 20:57:41Z<br>serving `dpl_7Jh9KMeNq8MbaKBpA4jaaiBHqrTh` · `86674a30e3` READY 09-04 22:56:06Z<br>same bytes public since 09-04 21:04:12Z<br>hash `dcf484f79c` | ML CHC (away) 0.733 **WIN**<br>RL CHC -1.5 0.601 **WIN**<br>Tot UNDER 8 0.493 **WIN** ⟵ changes | EXACT_RECORD · SERVED<br>graded bytes first in a READY build: 09-04 17:48:51Z (earlier in the day, then replaced before the start)<br>next READY after start 09-04 23:17:53Z | c | **HIGH** (H1): served bytes public 126 min before first pitch; graded bytes public earlier that day, replaced before the start |
| 824217 PIT @ DET<br>2026-09-27 | sched 09-27 19:10Z<br>actual 09-27 19:10:52Z (+10 s)<br>PITCH_EVENT | `snap:2026-09-27/snapshot-202609271908.json`<br>gen 09-27 19:08:06Z<br>commit `b5a1e4010b` 09-27 19:08:15Z<br>hash `f07daa548f` | ML DET (home) 0.555 **LOSS**<br>RL PIT +1.5 0.628 **WIN**<br>Tot UNDER 8 0.488 **WIN** | `git:4df53e062086` gen 09-27 15:41:46Z<br>serving `dpl_JDjp8UKiq8wjSr51yhfawNNvWsgz` · `538c71c67b` READY 09-27 19:02:27Z<br>same bytes public since 09-27 15:50:16Z<br>hash `3fe625635f` | ML PIT (away) 0.567 **WIN** ⟵ changes<br>RL DET +1.5 0.55 **LOSS** ⟵ changes<br>Tot OVER 8 0.556 **LOSS** ⟵ changes | EXACT_RECORD · SERVED<br>graded bytes first in a READY build: 09-27 19:11:39Z (after the start)<br>next READY after start 09-27 19:11:39Z | c | **HIGH** (H1): served bytes public 201 min before first pitch |
| 824628 PIT @ CHC<br>2026-09-13 | sched 09-13 18:20Z<br>actual 09-13 18:20:31Z (+10 s)<br>PITCH_EVENT | `snap:2026-09-13/snapshot-202609131817.json`<br>gen 09-13 18:17:22Z<br>commit `7af13c89b0` 09-13 18:17:29Z<br>hash `21edfac494` | ML CHC (home) 0.528 **LOSS**<br>RL PIT +1.5 0.661 **WIN**<br>Tot OVER 6.5 0.589 **WIN** | `git:cc345e01de87` gen 09-13 10:25:53Z<br>serving `dpl_86er2w2WLvdxCio82LTP1wuxtF5k` · `451d73828a` READY 09-13 18:13:20Z<br>same bytes public since 09-13 10:41:45Z<br>hash `bc299f030f` | ML PIT (away) 0.512 **WIN** ⟵ changes<br>RL CHC +1.5 0.619 **WIN**<br>Tot OVER 6.5 0.635 **WIN** | EXACT_RECORD · SERVED<br>graded bytes first in a READY build: 09-13 18:25:37Z (after the start)<br>next READY after start 09-13 18:25:37Z | c | **HIGH** (H1): served bytes public 459 min before first pitch |
| 823413 HOU @ PHI<br>2026-09-10 | sched 09-10 17:05Z<br>actual 09-10 17:06:02Z (+10 s)<br>PITCH_EVENT | `snap:2026-09-10/snapshot-202609101704.json`<br>gen 09-10 17:04:46Z<br>commit `3550c3095f` 09-10 17:11:37Z<br>hash `8d3ea6932b` | ML PHI (home) 0.583 **LOSS**<br>RL HOU +1.5 0.613 **WIN**<br>Tot UNDER 8.5 0.606 **WIN** | `git:b5395109038c` gen 09-10 15:10:18Z<br>serving `dpl_GBfTKWozewyfp9yF5NYerE93hn5n` · `66d33bfd40` READY 09-10 16:54:17Z<br>same bytes public since 09-10 15:25:13Z<br>hash `2e87c65e18` | ML PHI (home) 0.583 **LOSS**<br>RL HOU +1.5 0.613 **WIN**<br>Tot UNDER 8.5 0.606 **WIN** | EXACT_RECORD · SERVED<br>graded bytes first in a READY build: 09-10 17:20:39Z (after the start)<br>next READY after start 09-10 17:20:39Z | a | **HIGH** (H1): served bytes public 101 min before first pitch |
| 823417 ATL @ PHI<br>2026-09-06 | sched 09-06 17:10Z<br>actual 09-06 17:11:54Z (+10 s)<br>PITCH_EVENT | `snap:2026-09-06/snapshot-202609061705.json`<br>gen 09-06 17:05:49Z<br>commit `03afc0de8c` 09-06 17:11:52Z<br>hash `7febfb2771` | ML ATL (away) 0.511 **WIN**<br>RL PHI +1.5 0.623 **WIN**<br>Tot UNDER 8 0.542 **LOSS** | `git:95927e60c6de` gen 09-06 16:27:44Z<br>serving `dpl_DWBv4NV6aBWs5oWbXYXMajiuB7gJ` · `95927e60c6` READY 09-06 16:40:21Z<br>same bytes public since 09-06 16:40:21Z<br>hash `39e5a6481e` | ML ATL (away) 0.511 **WIN**<br>RL PHI +1.5 0.623 **WIN**<br>Tot UNDER 8 0.542 **LOSS** | EXACT_RECORD · SERVED<br>graded bytes first in a READY build: 09-06 17:18:26Z (after the start)<br>next READY after start 09-06 17:18:26Z | a | **HIGH** (H1): served bytes public 32 min before first pitch |
| 823168 MIN @ SF<br>2026-09-23 | sched 09-23 19:45Z<br>actual 09-23 19:45:50Z (+10 s)<br>PITCH_EVENT | `snap:2026-09-23/snapshot-202609231944.json`<br>gen 09-23 19:44:53Z<br>commit `438f3697e0` 09-23 19:45:05Z<br>hash `a701353dba` | ML MIN (away) 0.611 **WIN**<br>RL SF +1.5 0.558 **LOSS**<br>Tot UNDER 7.5 0.684 **WIN** | `git:2610c105e12c` gen 09-23 10:05:45Z<br>serving `dpl_7oLTMKR7DZFnf42kCPSbEAXbpuME` · `266b7ce792` READY 09-23 19:27:33Z<br>same bytes public since 09-23 19:27:33Z<br>hash `8b5be28293` | ML MIN (away) 0.632 **WIN**<br>RL SF +1.5 0.537 **LOSS**<br>Tot UNDER 7.5 0.724 **WIN** | EXACT_RECORD · SERVED<br>graded bytes first in a READY build: 09-23 19:24:25Z (earlier in the day, then replaced before the start)<br>next READY after start 09-23 20:43:16Z | b | **HIGH** (H1): served bytes public 18 min before first pitch; graded bytes public earlier that day, replaced before the start |
| 823491 BAL @ NYY<br>2026-09-25 | sched 09-25 20:05Z<br>actual 09-25 20:08:32Z (+10 s)<br>PITCH_EVENT | `snap:2026-09-25/snapshot-202609252004.json`<br>gen 09-25 20:04:50Z<br>commit `2bedba6304` 09-25 20:05:01Z<br>hash `29df389fec` | ML NYY (home) 0.56 **LOSS**<br>RL BAL +1.5 0.637 **WIN**<br>Tot OVER 6.5 0.546 **WIN** | `git:09ac551fce6d` gen 09-25 18:31:22Z<br>serving `dpl_8WyG2jc6RcP363CGRuCBEqHiNoeQ` · `f51be27b62` READY 09-25 19:27:49Z<br>same bytes public since 09-25 18:35:51Z<br>hash `29f8d5c1c4` | ML NYY (home) 0.544 **LOSS**<br>RL BAL +1.5 0.654 **WIN**<br>Tot OVER 6.5 0.526 **WIN** | EXACT_RECORD · SERVED<br>graded bytes first in a READY build: 09-25 10:27:16Z (earlier in the day, then replaced before the start)<br>next READY after start 09-25 20:09:25Z | b | **HIGH** (H1): served bytes public 93 min before first pitch; graded bytes public earlier that day, replaced before the start |
| 823731 STL @ MIL<br>2026-09-27 | sched 09-27 19:10Z<br>actual 09-27 19:10:37Z (+10 s)<br>PITCH_EVENT | `snap:2026-09-27/snapshot-202609271908.json`<br>gen 09-27 19:08:06Z<br>commit `b5a1e4010b` 09-27 19:08:15Z<br>hash `8e469c71c8` | ML MIL (home) 0.629 **WIN**<br>RL STL +1.5 0.587 **LOSS**<br>Tot UNDER 7 0.529 **LOSS** | `git:d1c86fc9f340` gen 09-27 10:38:25Z<br>serving `dpl_JDjp8UKiq8wjSr51yhfawNNvWsgz` · `538c71c67b` READY 09-27 19:02:27Z<br>same bytes public since 09-27 10:46:56Z<br>hash `3b8626234d` | ML MIL (home) 0.673 **WIN**<br>RL STL +1.5 0.529 **LOSS**<br>Tot UNDER 7 0.476 **LOSS** | EXACT_RECORD · SERVED<br>graded bytes first in a READY build: 09-27 19:11:39Z (after the start)<br>next READY after start 09-27 19:11:39Z | b | **HIGH** (H1): served bytes public 504 min before first pitch |
| 823814 ATL @ MIA<br>2026-09-27 | sched 09-27 19:10Z<br>actual 09-27 19:10:10Z (+10 s)<br>PITCH_EVENT | `snap:2026-09-27/snapshot-202609271908.json`<br>gen 09-27 19:08:06Z<br>commit `b5a1e4010b` 09-27 19:08:15Z<br>hash `5c02d415a9` | ML MIA (home) 0.558 **WIN**<br>RL ATL +1.5 0.653 **LOSS**<br>Tot UNDER 8.5 0.736 **WIN** | `git:d1c86fc9f340` gen 09-27 10:38:25Z<br>serving `dpl_JDjp8UKiq8wjSr51yhfawNNvWsgz` · `538c71c67b` READY 09-27 19:02:27Z<br>same bytes public since 09-27 10:46:56Z<br>hash `7c83e36651` | ML MIA (home) 0.521 **WIN**<br>RL ATL +1.5 0.653 **LOSS**<br>Tot UNDER 8.5 0.546 **WIN** | EXACT_RECORD · SERVED<br>graded bytes first in a READY build: 09-27 19:11:39Z (after the start)<br>next READY after start 09-27 19:11:39Z | b | **HIGH** (H1): served bytes public 503 min before first pitch |
| 823822 CHC @ MIA<br>2026-09-06 | sched 09-06 17:40Z<br>actual 09-06 17:41:28Z (+10 s)<br>PITCH_EVENT | `snap:2026-09-06/snapshot-202609061738.json`<br>gen 09-06 17:38:33Z<br>commit `b50171989a` 09-06 17:38:41Z<br>hash `f63235af15` | ML CHC (away) 0.698 **LOSS**<br>RL CHC -1.5 0.572 **LOSS**<br>Tot OVER 8 0.516 **WIN** | `git:03afc0de8c1b` gen 09-06 17:05:49Z<br>serving `dpl_9mhsKi6aqEPJg4RYiuhz9JfxLSrm` · `f56a4ae62d` READY 09-06 17:34:08Z<br>same bytes public since 09-06 17:18:26Z<br>hash `c4e172433e` | ML CHC (away) 0.707 **LOSS**<br>RL CHC -1.5 0.59 **LOSS**<br>Tot OVER 8 0.552 **WIN** | EXACT_RECORD · SERVED<br>graded bytes first in a READY build: 09-06 17:45:15Z (after the start)<br>next READY after start 09-06 17:43:12Z | b | **HIGH** (H1): served bytes public 23 min before first pitch |
| 824055 CLE @ KC<br>2026-09-27 | sched 09-27 19:10Z<br>actual 09-27 19:10:01Z (+10 s)<br>PITCH_EVENT | `snap:2026-09-27/snapshot-202609271908.json`<br>gen 09-27 19:08:06Z<br>commit `b5a1e4010b` 09-27 19:08:15Z<br>hash `3dd3f6bc88` | ML KC (home) 0.646 **WIN**<br>RL CLE +1.5 0.561 **WIN**<br>Tot UNDER 8.5 0.69 **WIN** | `git:d1c86fc9f340` gen 09-27 10:38:25Z<br>serving `dpl_JDjp8UKiq8wjSr51yhfawNNvWsgz` · `538c71c67b` READY 09-27 19:02:27Z<br>same bytes public since 09-27 10:46:56Z<br>hash `5966373ce7` | ML KC (home) 0.601 **WIN**<br>RL CLE +1.5 0.585 **WIN**<br>Tot UNDER 8.5 0.531 **WIN** | EXACT_RECORD · SERVED<br>graded bytes first in a READY build: 09-27 19:11:39Z (after the start)<br>next READY after start 09-27 19:11:39Z | b | **HIGH** (H1): served bytes public 503 min before first pitch |
| 824304 SEA @ COL<br>2026-09-19 | sched 09-20 00:10Z<br>actual 09-20 00:11:46Z (+10 s)<br>PITCH_EVENT | `snap:2026-09-19/snapshot-202609192318.json`<br>gen 09-19 23:18:41Z<br>commit `af180ac766` 09-19 23:19:00Z<br>hash `d606b5dcf2` | ML COL (home) 0.758 **WIN**<br>RL COL -1.5 0.574 **WIN**<br>Tot UNDER 10.5 0.751 **WIN** | `git:705e7fd87934` gen 09-19 20:56:00Z<br>serving `dpl_8FftGWJWoxtCbHGqRNZhYnkpzAj5` · `1998d82ce6` READY 09-19 22:49:08Z<br>same bytes public since 09-19 21:01:37Z<br>hash `cf9f815201` | ML COL (home) 0.762 **WIN**<br>RL COL -1.5 0.572 **WIN**<br>Tot UNDER 10.5 0.747 **WIN** | EXACT_RECORD · SERVED<br>graded bytes first in a READY build: 09-20 00:18:39Z (after the start)<br>next READY after start 09-20 00:18:39Z | b | **HIGH** (H1): served bytes public 190 min before first pitch |
| 824305 SD @ COL<br>2026-09-17 | sched 09-17 19:10Z<br>actual 09-17 19:10:39Z (+10 s)<br>PITCH_EVENT | `snap:2026-09-17/snapshot-202609171909.json`<br>gen 09-17 19:09:06Z<br>commit `0c05bf747c` 09-17 19:09:14Z<br>hash `b1bfd12ee9` | ML SD (away) 0.564 **WIN**<br>RL COL +1.5 0.553 **LOSS**<br>Tot UNDER 11 0.537 **PUSH** | `git:bae941f87d5c` gen 09-17 10:09:14Z<br>serving `dpl_3mtkWUsKo8FAwUUCtsZ9UGGqFFX4` · `73419d0d9e` READY 09-17 19:03:02Z<br>same bytes public since 09-17 10:29:47Z<br>hash `ee5e95a7e3` | ML SD (away) 0.531 **WIN**<br>RL COL +1.5 0.579 **LOSS**<br>Tot UNDER 11 0.523 **PUSH** | EXACT_RECORD · SERVED<br>graded bytes first in a READY build: 09-17 19:16:04Z (after the start)<br>next READY after start 09-17 19:16:04Z | b | **HIGH** (H1): served bytes public 521 min before first pitch |
| 824385 DET @ CLE<br>2026-09-06 | sched 09-06 17:40Z<br>actual 09-06 17:40:49Z (+10 s)<br>PITCH_EVENT | `snap:2026-09-06/snapshot-202609061738.json`<br>gen 09-06 17:38:33Z<br>commit `b50171989a` 09-06 17:38:41Z<br>hash `ebbc8c63f7` | ML CLE (home) 0.523 **WIN**<br>RL DET +1.5 0.683 **WIN**<br>Tot UNDER 7 0.55 **WIN** | `git:03afc0de8c1b` gen 09-06 17:05:49Z<br>serving `dpl_9mhsKi6aqEPJg4RYiuhz9JfxLSrm` · `f56a4ae62d` READY 09-06 17:34:08Z<br>same bytes public since 09-06 17:18:26Z<br>hash `07def51282` | ML CLE (home) 0.549 **WIN**<br>RL DET +1.5 0.654 **WIN**<br>Tot UNDER 7 0.483 **WIN** | EXACT_RECORD · SERVED<br>graded bytes first in a READY build: 09-06 17:45:15Z (after the start)<br>next READY after start 09-06 17:43:12Z | b | **HIGH** (H1): served bytes public 22 min before first pitch |
| 824424 DET @ CLE<br>2026-09-04 | sched 09-04 18:10Z<br>actual 09-04 19:15:01Z (+10 s)<br>PITCH_EVENT | `snap:2026-09-04/snapshot-202609041738.json`<br>gen 09-04 17:38:06Z<br>commit `b57e6505cf` 09-04 17:42:00Z<br>hash `5382323ab4` | ML CLE (home) 0.613 **WIN**<br>RL DET +1.5 0.592 **WIN**<br>Tot UNDER 8 0.594 **LOSS** | `git:5b6909de853c` gen 09-04 18:31:58Z<br>serving `dpl_4GHLhmRnhk5mhA8QBpbvfF5pUZsN` · `84322714e1` READY 09-04 19:09:21Z<br>same bytes public since 09-04 18:40:02Z<br>hash `db1b46354e` | ML CLE (home) 0.609 **WIN**<br>RL DET +1.5 0.592 **WIN**<br>Tot UNDER 8 0.589 **LOSS** | EXACT_RECORD · SERVED<br>graded bytes first in a READY build: 09-04 17:48:51Z (earlier in the day, then replaced before the start)<br>next READY after start 09-04 19:53:47Z | b (held) | **HIGH** (H1): served bytes public 35 min before first pitch; graded bytes public earlier that day, replaced before the start. **HELD** (H1 + policy): the served revision was generated after the *scheduled* start; needs #1049 |
| 824471 MIL @ CIN<br>2026-09-04 | sched 09-04 22:10Z<br>actual 09-04 23:00:33Z (+10 s)<br>PITCH_EVENT | `snap:2026-09-04/snapshot-202609042136.json`<br>gen 09-04 21:36:31Z<br>commit `57c3a2ed1e` 09-04 21:36:41Z<br>hash `7e11d3964f` | ML MIL (away) 0.59 **WIN**<br>RL CIN +1.5 0.533 **LOSS**<br>Tot UNDER 9.5 0.591 **LOSS** | `git:5b6909de853c` gen 09-04 18:31:58Z<br>serving `dpl_7Jh9KMeNq8MbaKBpA4jaaiBHqrTh` · `86674a30e3` READY 09-04 22:56:06Z<br>same bytes public since 09-04 22:34:27Z<br>hash `7863a23f1a` | ML MIL (away) 0.598 **WIN**<br>RL CIN +1.5 0.526 **LOSS**<br>Tot UNDER 9.5 0.586 **LOSS** | EXACT_RECORD · SERVED<br>graded bytes first in a READY build: 09-04 21:04:12Z (earlier in the day, then replaced before the start)<br>next READY after start 09-04 23:17:53Z | b | **HIGH** (H1): served bytes public 26 min before first pitch; graded bytes public earlier that day, replaced before the start |
| 824545 DET @ CWS<br>2026-09-19 | sched 09-19 18:10Z<br>actual 09-19 18:11:37Z (+10 s)<br>PITCH_EVENT | `snap:2026-09-19/snapshot-202609191808.json`<br>gen 09-19 18:08:54Z<br>commit `b7d21be686` 09-19 18:09:05Z<br>hash `46b93a16f0` | ML DET (away) 0.643 **LOSS**<br>RL DET -1.5 0.502 **LOSS**<br>Tot UNDER 8 0.58 **WIN** | `git:f0bc888fdfcb` gen 09-19 09:39:31Z<br>serving `dpl_Kh5ydE5XPLb9rHVcEMFdMm7jEYAd` · `485b0ea635` READY 09-19 18:01:48Z<br>same bytes public since 09-19 09:52:12Z<br>hash `9157f4a9c3` | ML DET (away) 0.68 **LOSS**<br>RL DET -1.5 0.534 **LOSS**<br>Tot UNDER 8 0.572 **WIN** | EXACT_RECORD · SERVED<br>graded bytes first in a READY build: 09-19 18:15:47Z (after the start)<br>next READY after start 09-19 18:15:47Z | b | **HIGH** (H1): served bytes public 499 min before first pitch |
| 825030 MIA @ AZ<br>2026-09-15 | sched 09-16 01:40Z<br>actual 09-16 01:41:10Z (+10 s)<br>PITCH_EVENT | `snap:2026-09-15/snapshot-202609160135.json`<br>gen 09-16 01:35:10Z<br>commit `a9eefc4b85` 09-16 01:35:18Z<br>hash `83db6b850e` | ML MIA (away) 0.555 **WIN**<br>RL AZ +1.5 0.574 **LOSS**<br>Tot UNDER 8.5 0.524 **WIN** | `git:6a2e71805a40` gen 09-15 22:22:45Z<br>serving `dpl_GDsQuxLKRdfaQd8uYL9wwDTU1RY5` · `e27185b851` READY 09-16 01:05:33Z<br>same bytes public since 09-15 22:34:38Z<br>hash `4688f48f11` | ML MIA (away) 0.548 **WIN**<br>RL AZ +1.5 0.579 **LOSS**<br>Tot UNDER 8.5 0.522 **WIN** | EXACT_RECORD · SERVED<br>graded bytes first in a READY build: 09-16 01:46:55Z (after the start)<br>next READY after start 09-16 01:46:55Z | b | **HIGH** (H1): served bytes public 187 min before first pitch |
| 849822 LAD @ ATL<br>2026-10-07 | sched 10-07 22:00Z<br>actual 10-07 22:09:04Z (+10 s)<br>PITCH_EVENT | `snap:2026-10-07/snapshot-202610072126.json`<br>gen 10-07 21:26:30Z<br>commit `4567a00735` 10-07 21:26:40Z<br>hash `6930867c54` | ML LAD (away) 0.632 **WIN**<br>RL LAD -1.5 0.507 **WIN**<br>Tot OVER 7.5 0.576 **LOSS** | `git:02c0b62301e3` gen 10-07 09:27:56Z<br>serving `dpl_EK2yXanfgJzwpYxjhkyugCTivDeQ` · `c0fca0588a` READY 10-07 20:27:04Z<br>same bytes public since 10-07 09:37:01Z<br>hash `eb9014689c` | ML LAD (away) 0.639 **WIN**<br>RL LAD -1.5 0.514 **WIN**<br>Tot OVER 7.5 0.583 **LOSS** | EXACT_RECORD · SERVED<br>graded bytes first in a READY build: 10-07 22:12:59Z (after the start)<br>next READY after start 10-07 22:12:59Z | b | **HIGH** (H1): served bytes public 752 min before first pitch |

#### B. No forecast on the site at the actual first pitch: class (d). The graded forecast **was** public earlier, then withdrawn before the delayed start

| Game · date | First pitch (source) | Graded revision | Graded quantities · original outcomes | Served at the start | Proposed under Option B | Provenance evidence | Class | Confidence (reason) |
|---|---|---|---|---|---|---|---|---|
| 824226 MIN @ DET<br>2026-09-09 | sched 09-09 17:10Z<br>actual 09-09 18:50:09Z (+10 s)<br>PITCH_EVENT | `snap:2026-09-09/snapshot-202609091524.json`<br>gen 09-09 15:24:42Z<br>commit `78ca7d605a` 09-09 15:31:31Z<br>hash `ea7c6a6266` | ML MIN (away) 0.568 **LOSS**<br>RL DET +1.5 0.572 **WIN**<br>Tot UNDER 8.5 0.653 **LOSS** | at the start: `dpl_7b6cHD52ysj5Z9wsw1GgCC7gxcbm` · `95dd6d9aa4` READY 09-09 18:36:59Z showed the game **unavailable**<br>graded bytes first in a READY build 09-09 15:40:35Z (`dpl_AJkPbN9e…`); the last build before the start that had a forecast (`dpl_A1cMoYRd…`, READY 09-09 17:36:27Z) carried the **graded** bytes; unavailable from 09-09 18:05:22Z (`dpl_Ckk4x7jj…`) | **R1:** NOT_SERVED, rows excluded and disclosed. **R2:** unchanged. Founder decision F2 | EXACT_RECORD · NOT_SERVED | d | **HIGH on the facts** (H2). The treatment is a policy reading (R1/R2) |
| 824381 ATH @ CLE<br>2026-09-20 | sched 09-20 17:40Z<br>actual 09-20 19:45:52Z (+10 s)<br>PITCH_EVENT | `snap:2026-09-20/snapshot-202609201443.json`<br>gen 09-20 14:43:56Z<br>commit `dcc2044962` 09-20 14:47:45Z<br>hash `aaafcf5b08` | ML CLE (home) 0.522 **WIN**<br>RL ATH +1.5 0.66 **WIN**<br>Tot UNDER 7.5 0.564 **WIN** | at the start: `dpl_DVJbMFF3ZfrLhz7nJoYy3Kw9i2XB` · `ebe5197649` READY 09-20 19:45:13Z showed the game **unavailable**<br>graded bytes first in a READY build 09-20 14:53:19Z (`dpl_6uhv5Q5T…`); the last build before the start that had a forecast (`dpl_59Lseh6T…`, READY 09-20 18:54:44Z) carried the **graded** bytes; unavailable from 09-20 19:02:08Z (`dpl_G1ExodJL…`) | **R1:** NOT_SERVED, rows excluded and disclosed. **R2:** unchanged. Founder decision F2 | EXACT_RECORD · NOT_SERVED | d | **HIGH on the facts** (H2). The treatment is a policy reading (R1/R2) |
| 824546 DET @ CWS<br>2026-09-20 | sched 09-20 18:10Z<br>actual 09-20 22:00:50Z (+10 s)<br>PITCH_EVENT | `snap:2026-09-20/snapshot-202609201443.json`<br>gen 09-20 14:43:56Z<br>commit `dcc2044962` 09-20 14:47:45Z<br>hash `1ef975fb92` | ML DET (away) 0.684 **LOSS**<br>RL DET -1.5 0.54 **LOSS**<br>Tot UNDER 8 0.563 **LOSS** | at the start: `dpl_9RpP42BhfUikTXAK7BHzUvSXV2KD` · `4544bb4945` READY 09-20 21:48:01Z showed the game **unavailable**<br>graded bytes first in a READY build 09-20 10:09:03Z (`dpl_4yvftFgU…`); the last build before the start that had a forecast (`dpl_59Lseh6T…`, READY 09-20 18:54:44Z) carried the **graded** bytes; unavailable from 09-20 19:02:08Z (`dpl_G1ExodJL…`) | **R1:** NOT_SERVED, rows excluded and disclosed. **R2:** unchanged. Founder decision F2 | EXACT_RECORD · NOT_SERVED | d | **HIGH on the facts** (H2). The treatment is a policy reading (R1/R2) |
| 823653 TEX @ MIN<br>2026-09-26 | sched 09-26 20:10Z<br>actual 09-26 22:11:21Z (+10 s)<br>PITCH_EVENT | `snap:2026-09-26/snapshot-202609262001.json`<br>gen 09-26 20:01:47Z<br>commit `4759d95768` 09-26 20:01:59Z<br>hash `10564cbbc5` | ML MIN (home) 0.681 **LOSS**<br>RL TEX +1.5 0.524 **WIN**<br>Tot UNDER 8 0.612 **PUSH** | at the start: `dpl_8MzAV5km8rKTDrmeQpKS8mXokLzC` · `ac06607173` READY 09-26 22:06:10Z showed the game **unavailable**<br>graded bytes first in a READY build 09-26 18:45:24Z (`dpl_D1XqYydf…`); the last build before the start that had a forecast (`dpl_2Y3kMkd3…`, READY 09-26 21:28:15Z) carried the **graded** bytes; unavailable from 09-26 22:06:10Z (`dpl_8MzAV5km…`) | **R1:** NOT_SERVED, rows excluded and disclosed. **R2:** unchanged. Founder decision F2 | EXACT_RECORD · NOT_SERVED | d | **HIGH on the facts** (H2). The treatment is a policy reading (R1/R2) |

#### C. Ambiguous: class (e). The 9 original-29 members whose serving build cannot be decided

| Game · date | First pitch (source) | Graded revision | Graded quantities · original outcomes | Served at the start | Proposed under Option B | Provenance evidence | Class | Confidence (reason) |
|---|---|---|---|---|---|---|---|---|
| 822771 KC @ TOR<br>2026-08-27 | sched 08-27 23:07Z<br>actual 08-27 23:07:15Z (+10 s)<br>PITCH_EVENT | `snap:2026-08-27/snapshot-202608272305.json`<br>gen 08-27 23:05:45Z<br>commit `e0e368fe6e` 08-27 23:09:40Z<br>hash `218ebe8c7c` | ML KC (away) 0.543 **WIN**<br>RL TOR +1.5 0.588 **LOSS**<br>Tot UNDER 8.5 0.567 **LOSS** | none established<br>gh-6132468321 READY 08-27 22:58:09Z (before): `git:87cd457aae34` → ML TOR (home) 0.535 **LOSS** ⟵ changes; RL KC +1.5 0.645 **WIN** ⟵ changes; Tot OVER 8 0.514 **WIN** ⟵ changes<br>gh-6132615197 READY 08-27 23:11:40Z (in band): `git:87cd457aae34` → ML TOR (home) 0.535 **LOSS** ⟵ changes; RL KC +1.5 0.645 **WIN** ⟵ changes; Tot OVER 8 0.514 **WIN** ⟵ changes<br>gh-6132665382 READY 08-27 23:16:26Z (in band): = graded | No correction (not demonstrable). Treatment: founder decision F3 | GITHUB_CONSERVATIVE · AMBIGUOUS_NEAR_CUTOFF<br>gh-6132615197 was recorded READY at 2026-08-27T23:11:40Z; within the record's clock uncertainty (−600s/+60s) and the start's precision it may have served before the start or not | e | **LOW** (L2): outcome at stake |
| 823581 MIL @ NYM<br>2026-08-27 | sched 08-27 23:10Z<br>actual 08-27 23:10:13Z (+10 s)<br>PITCH_EVENT | `snap:2026-08-27/snapshot-202608272305.json`<br>gen 08-27 23:05:45Z<br>commit `e0e368fe6e` 08-27 23:09:40Z<br>hash `f8d4b26fd4` | ML MIL (away) 0.529 **WIN**<br>RL NYM +1.5 0.606 **LOSS**<br>Tot OVER 7 0.507 **WIN** | none established<br>gh-6132468321 READY 08-27 22:58:09Z (before): `git:87cd457aae34` → ML MIL (away) 0.554 **WIN**; RL NYM +1.5 0.565 **LOSS**; Tot OVER 7 0.599 **WIN**<br>gh-6132615197 READY 08-27 23:11:40Z (in band): `git:87cd457aae34` → ML MIL (away) 0.554 **WIN**; RL NYM +1.5 0.565 **LOSS**; Tot OVER 7 0.599 **WIN**<br>gh-6132665382 READY 08-27 23:16:26Z (in band): = graded | No correction (not demonstrable). Treatment: founder decision F3 | GITHUB_CONSERVATIVE · AMBIGUOUS_NEAR_CUTOFF<br>gh-6132615197 was recorded READY at 2026-08-27T23:11:40Z; within the record's clock uncertainty (−600s/+60s) and the start's precision it may have served before the start or not | e | **LOW** (L1): outcomes the same under every possible build |
| 824879 LAD @ ATL<br>2026-08-27 | sched 08-27 23:15Z<br>actual 08-27 23:16:50Z (+10 s)<br>PITCH_EVENT | `snap:2026-08-27/snapshot-202608272305.json`<br>gen 08-27 23:05:45Z<br>commit `e0e368fe6e` 08-27 23:09:40Z<br>hash `c6885d3688` | ML ATL (home) 0.527 **WIN**<br>RL LAD +1.5 0.655 **WIN**<br>Tot OVER 6.5 0.592 **LOSS** | none established<br>gh-6132615197 READY 08-27 23:11:40Z (before): `git:87cd457aae34` → ML ATL (home) 0.509 **WIN**; RL LAD +1.5 0.677 **WIN**; Tot OVER 6.5 0.577 **LOSS**<br>gh-6132665382 READY 08-27 23:16:26Z (in band): = graded | No correction (not demonstrable). Treatment: founder decision F3 | GITHUB_CONSERVATIVE · AMBIGUOUS_NEAR_CUTOFF<br>gh-6132665382 was recorded READY at 2026-08-27T23:16:26Z; within the record's clock uncertainty (−600s/+60s) and the start's precision it may have served before the start or not | e | **LOW** (L1): outcomes the same under every possible build |
| 823744 TEX @ MIL<br>2026-08-28 | sched 08-28 23:40Z<br>actual 08-28 23:40:15Z (+10 s)<br>PITCH_EVENT | `snap:2026-08-28/snapshot-202608282334.json`<br>gen 08-28 23:34:30Z<br>commit `99a1a8d90a` 08-28 23:39:31Z<br>hash `8d4fdb769b` | ML MIL (home) 0.653 **WIN**<br>RL TEX +1.5 0.533 **LOSS**<br>Tot OVER 7.5 0.578 **LOSS** | none established<br>gh-6150199133 READY 08-28 23:31:36Z (before): `git:28c6f6ac0ad7` → ML MIL (home) 0.653 **WIN**; RL TEX +1.5 0.533 **LOSS**; Tot OVER 7.5 0.578 **LOSS**<br>gh-6150322254 READY 08-28 23:46:09Z (in band): = graded<br>gh-6150324513 READY 08-28 23:46:28Z (in band): = graded<br>gh-6150334872 READY 08-28 23:47:41Z (in band): = graded | No correction (not demonstrable). Treatment: founder decision F3 | GITHUB_CONSERVATIVE · AMBIGUOUS_NEAR_CUTOFF<br>gh-6150322254 was recorded READY at 2026-08-28T23:46:09Z; within the record's clock uncertainty (−600s/+60s) and the start's precision it may have served before the start or not | e | **LOW** (L1): outcomes the same under every possible build |
| 823662 CWS @ MIN<br>2026-08-30 | sched 08-30 18:10Z<br>actual 08-30 18:10:58Z (+10 s)<br>PITCH_EVENT | `snap:2026-08-30/snapshot-202608301805.json`<br>gen 08-30 18:05:23Z<br>commit `55ba857692` 08-30 18:10:32Z<br>hash `69d719f9a2` | ML MIN (home) 0.62 **WIN**<br>RL CWS +1.5 0.568 **LOSS**<br>Tot UNDER 9 0.571 **WIN** | none established<br>gh-6169548189 READY 08-30 17:57:09Z (before): `git:faf25a99526e` → ML MIN (home) 0.62 **WIN**; RL CWS +1.5 0.568 **LOSS**; Tot UNDER 9 0.571 **WIN**<br>gh-6169696490 READY 08-30 18:13:26Z (in band): `git:faf25a99526e` → ML MIN (home) 0.62 **WIN**; RL CWS +1.5 0.568 **LOSS**; Tot UNDER 9 0.571 **WIN**<br>gh-6169719361 READY 08-30 18:15:58Z (in band): = graded<br>gh-6169726686 READY 08-30 18:16:44Z (in band): = graded<br>gh-6169727995 READY 08-30 18:16:53Z (in band): = graded | No correction (not demonstrable). Treatment: founder decision F3 | GITHUB_CONSERVATIVE · AMBIGUOUS_NEAR_CUTOFF<br>gh-6169696490 was recorded READY at 2026-08-30T18:13:26Z; within the record's clock uncertainty (−600s/+60s) and the start's precision it may have served before the start or not | e | **LOW** (L1): outcomes the same under every possible build |
| 823740 TEX @ MIL<br>2026-08-30 | sched 08-30 18:10Z<br>actual 08-30 18:12:16Z (+10 s)<br>PITCH_EVENT | `snap:2026-08-30/snapshot-202608301805.json`<br>gen 08-30 18:05:23Z<br>commit `55ba857692` 08-30 18:10:32Z<br>hash `c0e9e890d1` | ML MIL (home) 0.622 **LOSS**<br>RL TEX +1.5 0.571 **WIN**<br>Tot UNDER 8.5 0.581 **LOSS** | none established<br>gh-6169548189 READY 08-30 17:57:09Z (before): `git:faf25a99526e` → ML MIL (home) 0.622 **LOSS**; RL TEX +1.5 0.571 **WIN**; Tot UNDER 8.5 0.581 **LOSS**<br>gh-6169696490 READY 08-30 18:13:26Z (in band): `git:faf25a99526e` → ML MIL (home) 0.622 **LOSS**; RL TEX +1.5 0.571 **WIN**; Tot UNDER 8.5 0.581 **LOSS**<br>gh-6169719361 READY 08-30 18:15:58Z (in band): = graded<br>gh-6169726686 READY 08-30 18:16:44Z (in band): = graded<br>gh-6169727995 READY 08-30 18:16:53Z (in band): = graded | No correction (not demonstrable). Treatment: founder decision F3 | GITHUB_CONSERVATIVE · AMBIGUOUS_NEAR_CUTOFF<br>gh-6169696490 was recorded READY at 2026-08-30T18:13:26Z; within the record's clock uncertainty (−600s/+60s) and the start's precision it may have served before the start or not | e | **LOW** (L1): outcomes the same under every possible build |
| 823084 LAA @ SEA<br>2026-09-27 | sched 09-27 19:10Z<br>actual 09-27 19:11:34Z (+10 s)<br>PITCH_EVENT | `snap:2026-09-27/snapshot-202609271908.json`<br>gen 09-27 19:08:06Z<br>commit `b5a1e4010b` 09-27 19:08:15Z<br>hash `c0571f8d87` | ML SEA (home) 0.526 **WIN**<br>RL LAA +1.5 0.671 **LOSS**<br>Tot UNDER 7 0.489 **LOSS** | none established<br>dpl_JDjp8UKiq8wj READY 09-27 19:02:27Z (before): `git:d1c86fc9f340` → ML SEA (home) 0.527 **WIN**; RL LAA +1.5 0.666 **LOSS**; Tot UNDER 7 0.462 **LOSS**<br>dpl_A47W246ZCLGp READY 09-27 19:11:39Z (in band): = graded | No correction (not demonstrable). Treatment: founder decision F3 | EXACT_RECORD · AMBIGUOUS_NEAR_CUTOFF<br>dpl_A47W246ZCLGpw5YiWoDfybXvBcyM was recorded READY at 2026-09-27T19:11:39.280Z; within the record's clock uncertainty (−5s/+5s) and the start's precision it may have served before the start or not | e | **LOW** (L1): outcomes the same under every possible build |
| 823650 TEX @ MIN<br>2026-09-27 | sched 09-27 19:10Z<br>actual 09-27 19:11:30Z (+10 s)<br>PITCH_EVENT | `snap:2026-09-27/snapshot-202609271908.json`<br>gen 09-27 19:08:06Z<br>commit `b5a1e4010b` 09-27 19:08:15Z<br>hash `a38e20f30d` | ML MIN (home) 0.64 **WIN**<br>RL TEX +1.5 0.566 **LOSS**<br>Tot UNDER 8 0.615 **LOSS** | none established<br>dpl_JDjp8UKiq8wj READY 09-27 19:02:27Z (before): `git:d1c86fc9f340` → ML MIN (home) 0.661 **WIN**; RL TEX +1.5 0.554 **LOSS**; Tot UNDER 8 0.67 **LOSS**<br>dpl_A47W246ZCLGp READY 09-27 19:11:39Z (in band): = graded | No correction (not demonstrable). Treatment: founder decision F3 | EXACT_RECORD · AMBIGUOUS_NEAR_CUTOFF<br>dpl_A47W246ZCLGpw5YiWoDfybXvBcyM was recorded READY at 2026-09-27T19:11:39.280Z; within the record's clock uncertainty (−5s/+5s) and the start's precision it may have served before the start or not | e | **LOW** (L1): outcomes the same under every possible build |
| 824542 COL @ CWS<br>2026-09-27 | sched 09-27 19:10Z<br>actual 09-27 19:11:36Z (+10 s)<br>PITCH_EVENT | `snap:2026-09-27/snapshot-202609271908.json`<br>gen 09-27 19:08:06Z<br>commit `b5a1e4010b` 09-27 19:08:15Z<br>hash `596ec49aeb` | ML COL (away) 0.637 **LOSS**<br>RL CWS +1.5 0.507 **WIN**<br>Tot UNDER 8.5 0.635 **WIN** | none established<br>dpl_JDjp8UKiq8wj READY 09-27 19:02:27Z (before): `git:4df53e062086` → ML COL (away) 0.681 **LOSS**; RL COL -1.5 0.543 **LOSS** ⟵ changes; Tot UNDER 8.5 0.584 **WIN**<br>dpl_A47W246ZCLGp READY 09-27 19:11:39Z (in band): = graded | No correction (not demonstrable). Treatment: founder decision F3 | EXACT_RECORD · AMBIGUOUS_NEAR_CUTOFF<br>dpl_A47W246ZCLGpw5YiWoDfybXvBcyM was recorded READY at 2026-09-27T19:11:39.280Z; within the record's clock uncertainty (−5s/+5s) and the start's precision it may have served before the start or not | e | **LOW** (L2): outcome at stake |

#### D. Original "never public" (the 10-10 "2"): now resolve as served = graded

| Game · date | First pitch (source) | Graded revision | Graded quantities · original outcomes | Served at the start | Proposed under Option B | Provenance evidence | Class | Confidence (reason) |
|---|---|---|---|---|---|---|---|---|
| 824387 DET @ CLE<br>2026-09-04 | sched 09-04 23:15Z<br>actual 09-04 23:45:25Z (+10 s)<br>PITCH_EVENT | `snap:2026-09-04/snapshot-202609042309.json`<br>gen 09-04 23:09:50Z<br>commit `717470fc5e` 09-04 23:09:58Z<br>hash `0709cc0fd2` | ML CLE (home) 0.502 **WIN**<br>RL DET +1.5 0.704 **WIN**<br>Tot UNDER 8 0.757 **WIN** | `git:717470fc5ee6` gen 09-04 23:09:50Z<br>serving `dpl_8bFjDTrCKJSGXyj7au8WRxnQjuZX` · `717470fc5e` READY 09-04 23:17:53Z<br>same bytes public since 09-04 23:17:53Z<br>hash `0709cc0fd2` | unchanged (served = graded) | EXACT_RECORD · SERVED | resolved | **HIGH**: the serving build was READY 27.5 min before the delayed first pitch and carried the graded bytes. |
| 823246 AZ @ SD<br>2026-09-27 | sched 09-27 19:10Z<br>actual 09-27 19:11:47Z (+10 s)<br>PITCH_EVENT | `snap:2026-09-27/snapshot-202609271908.json`<br>gen 09-27 19:08:06Z<br>commit `b5a1e4010b` 09-27 19:08:15Z<br>hash `4f72ed379d` | ML SD (home) 0.504 **WIN**<br>RL AZ +1.5 0.71 **LOSS**<br>Tot UNDER 8 0.748 **LOSS** | `git:b5a1e4010b58` gen 09-27 19:08:06Z<br>serving `dpl_A47W246ZCLGpw5YiWoDfybXvBcyM` · `b5a1e4010b` READY 09-27 19:11:39Z<br>same bytes public since 09-27 19:11:39Z<br>hash `4f72ed379d` | unchanged (served = graded) | EXACT_RECORD · SERVED | resolved (fragile) | **LOW–MEDIUM**: the serving build was READY only **8 s** before first pitch (record clock ±5 s). Every earlier build that day showed the game as **unavailable**. If Production promotion lagged READY by more than 8 s (not measured), the site showed no forecast at the start, which is R1 NOT_SERVED. Treat as ambiguous. |

#### E. Supplement, not among the 37: graded since 2026-10-08 and unverified (6), plus the two unreadable-build games (2)

| Game · date | First pitch (source) | Graded revision | Graded quantities · original outcomes | Served at the start | Proposed under Option B | Provenance evidence | Class | Confidence (reason) |
|---|---|---|---|---|---|---|---|---|
| 849832 CLE @ CWS<br>2026-10-08 | sched 10-09 00:00Z<br>actual 10-09 00:08:41Z (+10 s)<br>PITCH_EVENT | `snap:2026-10-08/snapshot-202610082349.json`<br>gen 10-08 23:49:49Z<br>commit `720ab413a2` 10-08 23:49:56Z<br>hash `0b0209c15e` | ML CLE (away) 0.531 **WIN**<br>RL CWS +1.5 0.608 **LOSS**<br>Tot UNDER 7.5 0.554 **LOSS** | none established<br>gh-6949478981 READY 10-08 23:54:45Z (before): = graded<br>gh-6949655826 READY 10-09 00:08:30Z (in band): = graded | unchanged. Verifiable only by content invariance (F4) | GITHUB_CONSERVATIVE · AMBIGUOUS_NEAR_CUTOFF<br>gh-6949655826 was recorded READY at 2026-10-09T00:08:30Z; within the record's clock uncertainty (−600s/+60s) and the start's precision it may have served before the start or not | e (post-10-08) | **LOW** under the resolver (L3): every possible build carried the graded bytes |
| 849831 CWS @ CLE<br>2026-10-10 | sched 10-11 00:00Z<br>actual 10-11 00:08:49Z (+10 s)<br>PITCH_EVENT | `snap:2026-10-10/snapshot-202610102341.json`<br>gen 10-10 23:41:51Z<br>commit `67d86952b1` 10-10 23:41:57Z<br>hash `cb8f5e50a5` | ML CLE (home) 0.585 **WIN**<br>RL(posted) CWS +1.5 0.605 **LOSS**<br>Tot OVER 7 0.452 **LOSS** | none established<br>gh-6988649431 READY 10-11 00:05:01Z (before): = graded<br>gh-6988685784 READY 10-11 00:08:54Z (in band): = graded<br>gh-6988720231 READY 10-11 00:12:46Z (in band): = graded<br>gh-6988753653 READY 10-11 00:16:29Z (in band): = graded | unchanged. Verifiable only by content invariance (F4) | GITHUB_CONSERVATIVE · AMBIGUOUS_NEAR_CUTOFF<br>gh-6988685784 was recorded READY at 2026-10-11T00:08:54Z; within the record's clock uncertainty (−600s/+60s) and the start's precision it may have served before the start or not | e (post-10-08) | **LOW** under the resolver (L3): every possible build carried the graded bytes |
| 849809 LAD @ MIL<br>2026-10-11 | sched 10-12 00:00Z<br>actual 10-12 00:16:34Z (+10 s)<br>PITCH_EVENT | `snap:2026-10-11/snapshot-202610112347.json`<br>gen 10-11 23:47:16Z<br>commit `39afe02c94` 10-11 23:47:23Z<br>hash `089cf0af7c` | ML LAD (away) 0.577 **LOSS**<br>RL(posted) MIL +1.5 0.541 **WIN**<br>Tot OVER 6 0.766 **LOSS** | none established<br>gh-7003786537 READY 10-12 00:12:53Z (before): = graded<br>gh-7003833388 READY 10-12 00:17:34Z (in band): = graded<br>gh-7003869853 READY 10-12 00:21:15Z (in band): = graded | unchanged. Verifiable only by content invariance (F4) | GITHUB_CONSERVATIVE · AMBIGUOUS_NEAR_CUTOFF<br>gh-7003833388 was recorded READY at 2026-10-12T00:17:34Z; within the record's clock uncertainty (−600s/+60s) and the start's precision it may have served before the start or not | e (post-10-08) | **LOW** under the resolver (L3): every possible build carried the graded bytes |
| 849813 CLE @ TB<br>2026-10-13 | sched 10-14 00:00Z<br>actual 10-14 00:08:16Z (+10 s)<br>PITCH_EVENT | `snap:2026-10-13/snapshot-202610132347.json`<br>gen 10-13 23:47:13Z<br>commit `09ed77fdec` 10-13 23:47:21Z<br>hash `1e1b937dce` | ML CLE (away) 0.578 **LOSS**<br>RL(posted) CLE +1.5 0.739 **LOSS**<br>Tot OVER 7 0.503 **LOSS** | none established<br>gh-7053017904 READY 10-13 23:55:22Z (before): = graded<br>gh-7053203839 READY 10-14 00:08:01Z (in band): = graded<br>gh-7053270552 READY 10-14 00:12:45Z (in band): = graded<br>gh-7053337420 READY 10-14 00:17:09Z (in band): = graded | unchanged. Verifiable only by content invariance (F4) | GITHUB_CONSERVATIVE · AMBIGUOUS_NEAR_CUTOFF<br>gh-7053203839 was recorded READY at 2026-10-14T00:08:01Z; within the record's clock uncertainty (−600s/+60s) and the start's precision it may have served before the start or not | e (post-10-08) | **LOW** under the resolver (L3): every possible build carried the graded bytes |
| 849811 MIL @ LAD<br>2026-10-14 | sched 10-15 00:00Z<br>actual 10-15 00:09:04Z (+10 s)<br>PITCH_EVENT | `snap:2026-10-14/snapshot-202610142320.json`<br>gen 10-14 23:20:26Z<br>commit `b713c2c98c` 10-14 23:20:33Z<br>hash `9030146fde` | ML LAD (home) 0.558 **LOSS**<br>RL(posted) MIL +1.5 0.617 **WIN**<br>Tot OVER 7.5 0.645 **WIN** | none established<br>gh-7080285531 READY 10-15 00:04:55Z (before): = graded | unchanged. Verifiable only by content invariance (F4) | GITHUB_CONSERVATIVE · AMBIGUOUS_DEPLOYMENT_STATE<br>gh-7081113595 (FAILURE, recorded 2026-10-15T01:03:57Z) may have been a deployment that served before the start | e (post-10-08) | **LOW** under the resolver (L3): every possible build carried the graded bytes |
| 849810 MIL @ LAD<br>2026-10-15 | sched 10-16 00:00Z<br>actual 10-16 00:08:22Z (+10 s)<br>PITCH_EVENT | `snap:2026-10-15/snapshot-202610152345.json`<br>gen 10-15 23:45:27Z<br>commit `d556d551b6` 10-15 23:45:35Z<br>hash `51311a936b` | ML LAD (home) 0.596 **LOSS**<br>RL(posted) MIL +1.5 0.582 **WIN**<br>Tot OVER 7.5 0.609 **WIN** | none established<br>gh-7107209754 READY 10-15 23:50:28Z (before): = graded<br>gh-7107513359 READY 10-16 00:12:04Z (in band): = graded<br>gh-7107559284 READY 10-16 00:15:28Z (in band): = graded | unchanged. Verifiable only by content invariance (F4) | GITHUB_CONSERVATIVE · AMBIGUOUS_NEAR_CUTOFF<br>gh-7107513359 was recorded READY at 2026-10-16T00:12:04Z; within the record's clock uncertainty (−600s/+60s) and the start's precision it may have served before the start or not | e (post-10-08) | **LOW** under the resolver (L3): every possible build carried the graded bytes |
| 823742 CHC @ MIL<br>2026-09-07 | sched 09-07 18:10Z<br>actual 09-07 18:10:16Z (+10 s)<br>PITCH_EVENT | `snap:2026-09-07/snapshot-202609071800.json`<br>gen 09-07 18:00:25Z<br>commit `38d63e5d3f` 09-07 18:06:29Z<br>hash `4b6289e1bc` | ML CHC (away) 0.557 **LOSS**<br>RL MIL +1.5 0.551 **WIN**<br>Tot OVER 8.5 0.666 **LOSS** | none established<br>dpl_34puyjy3rMQB READY 09-07 18:06:01Z (before): unreadable | No correction. Founder decision F5 | EXACT_RECORD · BUILD_UNREADABLE<br>could not read what dpl_34puyjy3rMQBTox9CHFt1NBQ9Hpz served | unreadable | **MEDIUM**, likely never public (U1) |
| 824062 AZ @ KC<br>2026-09-07 | sched 09-07 18:10Z<br>actual 09-07 18:10:15Z (+10 s)<br>PITCH_EVENT | `snap:2026-09-07/snapshot-202609071800.json`<br>gen 09-07 18:00:25Z<br>commit `38d63e5d3f` 09-07 18:06:29Z<br>hash `c20829de40` | ML KC (home) 0.629 **LOSS**<br>RL AZ +1.5 0.561 **WIN**<br>Tot UNDER 9 0.589 **PUSH** | none established<br>dpl_34puyjy3rMQB READY 09-07 18:06:01Z (before): unreadable | No correction. Founder decision F5 | EXACT_RECORD · BUILD_UNREADABLE<br>could not read what dpl_34puyjy3rMQBTox9CHFt1NBQ9Hpz served | unreadable | **MEDIUM**, likely never public (U1) |

## 5. Restatement proposal

### 5.1 Affected records

| Record | Where | What changes |
|---|---|---|
| Graded game-market rows | `app/public/data/mlb/results/game-predictions-graded.jsonl` | **Never rewritten.** Readers apply the restatement log (`grades-of-record-io.mjs` in #1045) |
| Graded projected-score rows | `app/public/data/mlb/results/game-projected-scores-graded.jsonl` | same |
| Picks record (`/results/picks`, `/results/picks/mlb`) | `public/data/mlb/results/game-predictions-record.json` (written by the grader) | regenerated from the restated reader |
| `/results` "MLB game calls" pooled card and `/results/date/[date]` per-game rows | graded log through `results/v2` | via the restated reader (#1045 consolidates the readers) |
| Forecast Record (`/results/forecasts…`, CSVs) | `data/internal/forecast-ledger/v1/mlb.jsonl` | `build-forecast-ledger.mjs --restate <id>` plus a write-once migration receipt |
| model-health (`/models`, `/mlb` panel, pause gate) | `public/data/admin/model-health.json` | recomputed; **no state changes** (§6) |
| `/saved`, My GameTime, Ask | graded log or ledger | per game: HIT/MISS/VOID follows the restated reader |
| Stage-A corrections file | `app/public/data/mlb/corrections/forecast-of-record-corrections.jsonl` (14, PROPOSED_NOT_APPLIED) | unchanged (append-only). The new log supersedes it by reference |

### 5.2 Corrections demonstrably justified (HIGH confidence only)

Restate these **21 games** to the revision served at first pitch. Every one is H1, on the exact record.

| Group | Games | Rows affected |
|---|---|---|
| Outcome changes, class (c) | 822763, 823578, 823579, 823824, 824217, 824628 | 10 rows flip: ML 4, RL 3, total 3 |
| Probabilities and projections only, class (b) without 824424 | 823168, 823491, 823731, 823814, 823822, 824055, 824304, 824305, 824385, 824471, 824545, 825030, 849822 | no W/L/P change |
| Provenance only, class (a) | 823413, 823417 | `forecastSource`/`forecastGeneratedAt` only |

This is exactly #1045's `SERVED_DIFFERENT_REVISION` set. No game graded after 10-07 has verified as different.

### 5.3 Not justified on the evidence: treatment options (founder decides)

| Case | Games | Options | Recommendation |
|---|---|---|---|
| **824424**: served revision generated after the *scheduled* start (18:10Z) but before the rain-delayed actual start (19:15Z) | 1 | (i) keep HELD (#1045); (ii) approve #1049's timing amendment, then restate. Probabilities only, so no count changes either way | (ii) once #1049 is reviewed. The evidence is H1; only the ledger's `eventStart` semantics block it |
| **Class (d)**: forecast public before the start, then withdrawn by the pipeline before the delayed first pitch | 824226, 824381, 824546, 823653 | **R1** (the resolver: the state *at* the start): NOT_SERVED, rows excluded and disclosed (#1045). **R2** (the last forecast served before the real start): rows unchanged | **R1**, disclosed as **"withdrawn before the delayed start"**, never as "never public". Reasoning: at first pitch the site said "no forecast", so a reader at kickoff saw none, and a forecast withdrawn before the event is conventionally void. R2 is equally consistent with the literal policy text; this is a reading choice |
| **823246**: served = graded only by an 8 s margin; all earlier builds showed it unavailable | 1 | (i) accept SERVED; (ii) treat as ambiguous (keep flagged); (iii) treat as NOT_SERVED | (ii). It also needs a promotion-lag allowance in the exact clock (§8) |
| **823742, 824062**: serving build had no `2026-09-07` predictions file | 2 | (i) keep unverified (flagged); (ii) NOT_SERVED with evidence code `NO_DATED_FILE_IN_SERVING_BUILD` after one check of what the site rendered for a date with no file | (i) until that check is done |
| **Class (e)**, original-29 ambiguous | 9 | keep graded and flagged (#1045) / exclude | keep and flag. 7 cannot change an outcome; 822771 and 824542 can, and stay flagged with the disclosure |
| **All 216 unverified** (incl. the 9, the 6 post-10-08 games, 79 August evidence-gap games, 2 unreadable) | 216 | **K:** keep graded and flagged (818 or 814 games) · **S:** strict, demonstrably served only (598) · **S+CI:** strict plus content invariance (719) | **K** now, with the count disclosed. **S** removes 27% of the season (220 of 818 games), mostly for missing *records* rather than evidence of a discrepancy. Content invariance needs its own review before use (F4) |

### 5.4 What is never done

- No graded row is edited or deleted.
- No game is graded from a revision chosen without evidence.
- No ambiguous game is silently assigned a revision.
- No "improvement" is claimed from a restatement.

## 6. Public metric changes (before → after, with denominators)

Two readings of class (d) are shown. 824424 changes no count under either.

| Family (surface) | CURRENT (published) | **R1** = #1045 scope (21 restated, 4 voided) | **R2** (21 restated, 4 kept) |
|---|---|---|---|
| Moneyline W–L (picks page) | 418–400, n 818, 51.10% | 417–397, n 814, 51.23% | 418–400, n 818, 51.10% |
| Moneyline log loss (lower is better; coin 0.6931) | 0.7000 | 0.6986 | 0.6998 |
| Moneyline vs coin, paired 95% (model-health) | +0.0069 [−0.0055, +0.0201] WATCH | +0.0054 [−0.0067, +0.0181] WATCH | +0.0066 [−0.0057, +0.0199] WATCH |
| Moneyline Brier (lower is better) | 0.2533 | 0.2526 | 0.2532 |
| Run line v1 W–L | 510–300, n 810, 62.96% | 508–298, n 806, 63.03% | 511–299, n 810, 63.09% |
| Run line log loss | 0.6612 | 0.6601 | 0.6598 |
| Run line posted (v2) | 5–3, n 8 | 5–3 | 5–3 (INSUFFICIENT_SAMPLE) |
| Total W–L–P | 380–395–38, n 813, 49.03% | 378–394–37, n 809, 48.96% | 379–396–38, n 813, 48.90% |
| Total log loss | 0.7279 | 0.7282 | 0.7286 |
| Total vs coin, paired 95% | +0.0348 [+0.0160, +0.0536] BREACHED | +0.0351 [+0.0175, +0.0534] BREACHED | +0.0354 [+0.0169, +0.0539] BREACHED |
| `/results` pooled "MLB game calls" | 1313–1098–38 (2,449 rows) | 1308–1092–37 (2,437 rows) | 1313–1098–38 (2,449 rows) |
| Projected team-runs MAE (lower is better) | 2.4352 (n 1,636) | 2.4312 (n 1,628) | 2.4352 (n 1,636) |
| Projected median-total MAE (lower is better) | 3.5990 (n 818) | 3.6044 (n 814), worse | 3.6002 (n 818), worse |
| Forecast Record MLB public rows | 5,183 | 5,159 (+24 NOT_SERVED, disclosed) | 5,183 |
| model-health states | ML WATCH · RL HOLDING · total BREACHED · RL-posted INSUFFICIENT | identical | identical |

**How to word these publicly:**
- **Moneyline.** Under every reading, log loss is **higher (worse) than a coin flip**. The interval includes 0, so neither the gap to the coin nor any change is established. Never say the moneyline model "beats a coin flip", and never say it "improved".
- **Total.** It is **established worse than a coin flip** (the interval excludes 0) before and after. Each restatement makes it slightly *worse*.
- **Run line.** Its log loss is lower than the coin's, but the coin is the wrong benchmark. About 92% of picks are +1.5, which covers about 65% by structure, so no edge may be claimed from this number. Present the hit rate "for context" next to the structural base rate.
- **Hit rate.** Changes in hit rate come from which games are excluded, not from better forecasts.

**Strict alternatives (F3), informational:**

| Scenario | Games | Moneyline | Total | Pooled |
|---|---|---|---|---|
| S | 598 | 308–290, log loss 0.6982 (worse than coin; [−0.0089, +0.0195]) | 274–289–30, log loss 0.7302 (BREACHED) | 962–797–30 |
| S+CI | 719 | 370–349, log loss 0.6983 | 332–347–35, log loss 0.7304 | 1154–963–35 |

**Not recomputed:** the Forecast Record calibration tables and ECE. #1045's reconciliation regenerator must produce them on the 818-game population before anything is applied (§8 step 4).

## 7. Preservation of originals, and consumer disclosure

### 7.1 Append-only, write-once, content-hash referenced

1. **Graded logs are never rewritten.** `game-predictions-graded.jsonl` and `game-projected-scores-graded.jsonl` keep the original rows forever. Corrections exist only as a layer that readers apply.
2. **A new write-once restatement log** `data/internal/mlb/forecast-of-record-restatements/2026-10-1x-truth-001b.json`:
   - It **supersedes** `2026-10-10-truth-001`, which stays in place as history, through a `supersedes: {id, sha256}` field.
   - Each entry carries:
     - `before`: the exact original row, verified byte-equal at build time;
     - `after`;
     - `reasonCode`: SERVED_DIFFERENT_REVISION, NOT_SERVED_AT_START or WITHDRAWN_BEFORE_START, depending on F2;
     - the evidence: deployment id, sha, READY time, served `artifactHash`, graded `artifactHash`, cutoff and cutoff basis.
   - **Provenance is pinned by content hash** (sha256 of `classification.json`, of the deployment record, and of the first-pitch capture) instead of `git log -1`. This also fixes #1045's red `--check`, where the same content differs only in unicode escaping between commits.
3. **Approval is not an edit.** The log is written once. Approval and application are separate write-once receipts that reference the log's sha256:
   - the ledger's `data/internal/forecast-ledger/v1/migrations/<id>.json`;
   - an approval receipt naming the approver and the date.
   - #1045 currently gates on a `status: APPROVED` field. The engineering owner should reconcile that with write-once, for example by writing the approved log as a new id.
4. **Readers fail closed.** If a log's `before` rows no longer match the graded log, nothing is applied and the build fails. #1045's 8 tests cover this.
5. **Downloads.** The public per-family CSVs keep both the original and the restated value for every corrected row (`original_*` columns), so anyone can audit the change.

### 7.2 Per-game correction note (design)

The note is generated from the restatement log, never hand-written. It appears on `/results/date/[date]` (per-game row), on the game page, in `/saved` and in the Forecast Record "latest rows".

- **Badge:** "Corrected", or "Not counted" for void. It is keyboard-focusable, with an expandable note.
- **Note, SERVED_DIFFERENT_REVISION** (example 823579):
  > *Corrected 2026-10-xx.* This game was first graded from a forecast created 30 seconds before first pitch (10 s before the scheduled time) that was never on GameTimePicks before the game. The record now uses the forecast the site showed at first pitch (created 20:57 UTC): **SF to win, 50.8% → LOSS** (previously recorded: NYM, WIN). Run line **NYM +1.5 → WIN** (previously SF +1.5, LOSS). Original entry preserved · [restatement 2026-10-1x-truth-001b, entry 823579] · sha256 `…`
- **Note, WITHDRAWN_BEFORE_START / NOT_SERVED** (R1):
  > *Not counted.* Our forecast for this game was on the site until 18:05 UTC and was then withdrawn when the game was delayed. At first pitch no forecast was shown, so the game is excluded from all records (previously recorded: MIN, LOSS).
- **Note, provenance-only (class a):**
  > *Source corrected.* The forecast of record is the one shown at first pitch. Picks and results are unchanged.
- **Unverified games** (K): no per-game badge. Instead, a page-level disclosure on `/results/picks/mlb` and the Forecast Record:
  > For N of 818 games we cannot prove which forecast version the site showed at first pitch (records begin 31 Jul; some deployments finished within seconds of first pitch). They are included and marked "unverified" in downloads.
- **Day-level note** on `/results/date/[date]` for every date with a corrected game: "1 game on this date was corrected on 2026-10-xx. Why?" It links to the methodology section.
- **Methodology change note** (one paragraph): what the forecast of record is (Option B), the date the grader switched, and links to the logs.
- **Copy rules:**
  - never "improved", "better", "edge" or "beat";
  - state "worse than a coin flip" where true;
  - give times in UTC with the local time beside them.

## 8. How future grading selects the forecast of record

| # | Step | Detail | Gate |
|---|---|---|---|
| 1 | Commit the evidence used | deployment record (Vercel exact + GitHub), first-pitch capture, as of the restatement, in an existing workflow commit (OPS-002) | Results/OPS owner |
| 2 | Regenerate and commit the classification | `classify-forecast-of-record.mjs` on main | — |
| 3 | Write the superseding log | §7.1, content-hash provenance | **Founder F1, F1b, F2, F5** |
| 4 | Update #1045/#1049 | merge main, fix the two red checks, regenerate reconciliation-v2 incl. calibration and ECE on 818 games | CI green |
| 5 | Apply | approval receipt → `build-forecast-ledger.mjs --restate <id>` → migration receipt; readers apply the log | **Founder F6** |
| 6 | **Grader switch** | `grade-game-predictions.mjs --forecast-of-record served --deployments <record> --first-pitch <capture>`, opt-in on `claude/mlb-served-revision-proposal` (`bcac58a407` + `82a2dbffa3`). Refusals are listed per game with their status and never become losses. Served revisions generated after the scheduled start are HELD until #1049 | **Founder F7** + Results/OPS owner + protected-workflow review |
| 7 | **Evidence capture before each start** (the switch is useless without it) | (a) deployment record captured every ≤15 min during game windows and once more right before the nightly settle, committed with the settle; (b) **live probes** of the Production build id at T−10, T−2 and T+1 min of every first pitch, appended and never backfilled, which resolves rollbacks, aliasing and promotion lag; (c) StatsAPI play-by-play first-pitch capture nightly. Full git history in the settle job (it refuses on a shallow clone, exit 3) | Results/OPS owner |
| 8 | **Promotion-lag allowance** | measure READY → serving lag from the probes and add it to the exact clock (`recordClock.earlyMs`). Until then, treat any READY within 60 s *before* a start as ambiguous; that makes 823246 ambiguous | engineering |
| 9 | **Refusal counting and monitoring** | `summariseRefusals()` (added in `82a2dbffa3`) prints every status nightly, zeros included. Write it to the ops status JSON and alert on: any EVIDENCE_GAP (a capture stopped); any NOT_SERVED (the pipeline withdrew a forecast); AMBIGUOUS share above 10% of a slate; any SERVED_UNMATCHED / BUILD_UNREADABLE / SERVED_REVISION_NOT_LOADED | Results/OPS owner |
| 10 | **Fix the two root causes** | (a) snapshots regenerated in the last ~10 min before first pitch that cannot deploy in time. Freeze the slate forecast at T−15 min, or have the grader never consider a revision that was not served (the switch does this). (b) "started before generation" uses the *scheduled* time, so delayed games lose their forecast. Use StatsAPI game state instead | engineering, pipeline owner |
| 11 | Disclosure UI | §7.2 | UX/Results owner, **Founder F8** |
| 12 | Verify in Production after deploy | picks W–L, pooled card, Forecast Record KPIs and `notServed`, per-game notes, model-health states unchanged | — |

## 9. Founder approval points (exact)

| ID | Decision | Default if not decided |
|---|---|---|
| **F1** | Approve restating the **21 high-confidence games** (§5.2) to the revision served at first pitch | nothing applied; the current grades stay published |
| **F1b** | 824424: approve #1049's timing amendment (a served revision generated after the scheduled but before the actual start is of record), then restate. Probabilities only | HELD |
| **F2** | Class (d), 4 games: **R1** void as "withdrawn before the delayed start", or **R2** keep the graded forecast as last served before the start. In both cases, retire the label "never public" | nothing applied |
| **F3** | The 216 unverified games: **K** keep and flag (recommended), **S** strict 598, or **S+CI** 719 | K, flagged |
| **F4** | Whether "content invariance" (every possible serving build carried the same bytes) may verify a game. It needs a separate code review; it would verify 121 of the 135 ambiguous games, including the 6 since 10-08 | not a rule |
| **F5** | Fragile cases: 823246 (8 s margin; recommend ambiguous) and 823742/824062 (no dated file; recommend unverified pending one check) | resolver output stands (823246 SERVED; the 09-07 pair unverified) |
| **F6** | Apply the approved log to Production (separate from approving its content): ledger `--restate` plus receipts, after CI is green and the calibration/ECE reconciliation is regenerated | not applied |
| **F7** | Switch the nightly MLB grader to `--forecast-of-record served`, with evidence capture and probes (§8 steps 6–9). Together with the Results/OPS owner | old rule ("newest generated before first pitch") continues, and the defect can recur nightly |
| **F8** | Disclosure wording and placement (§7.2), including the page-level unverified count | no per-game notes |
| **F9** | Whether the raw graded log stays a public URL (`/saved` fetches it at runtime). If it does, its originals stay visible and every reader must apply the log | stays public |

## 10. Tests added (proposal branch, code and tests only)

`claude/mlb-served-revision-proposal` @ **`82a2dbffa3`** (parent `bcac58a407`), pushed, no PR. The `claude/*` branches do not deploy.

| Test (in `app/src/lib/mlb/prediction/served-forecast-selector.test.mjs`) | Edge it pins |
|---|---|
| unreadable serving build → BUILD_UNREADABLE, not NOT_SERVED | unreadable build |
| unreadable *earlier* build stops only the `publishedAt` walk-back | unreadable build |
| serving build has no row for the game → NOT_SERVED | never served |
| never-public is not inferred across an ambiguous window (both directions) | never served × ambiguous |
| ±60 s margin, early side (−45 s ambiguous / −61 s verified) | ambiguous window |
| ±60 s margin, late side (+55 s ambiguous / +61 s leaves the earlier build) | ambiguous window |
| GitHub conservative band (+9 min ambiguous / +10 min 1 s not) | ambiguous window |
| content invariance NOT applied (same bytes, still refused) | policy pin (F4) |
| served bytes match no revision → SERVED_UNMATCHED | unmatched |
| start before the record begins → EVIDENCE_GAP | evidence gap (August) |
| mixed slate: the served game is graded, the other is refused, and `summariseRefusals` counts by status | refusal counting |

**Code changes:**
- `summariseRefusals()` in `served-forecast-selector.mjs`;
- a per-status refusal line in `grade-game-predictions.mjs` (served mode only).

The default grader rule and its output are unchanged.

**Run:** `npx tsx --test src/lib/mlb/prediction/*.test.mjs src/lib/publication-evidence/*.test.mjs` gives **124/124**. `node_modules` is symlinked from the main checkout and not committed. No build was run.
