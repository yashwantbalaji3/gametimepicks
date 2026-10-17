# TRUTH-001 · MLB graded from unserved revisions: the "29" re-examined (2026-10-17)

**Author:** analysis session, read-only on data. **As of:** 2026-10-17 ~01:40Z, `origin/main` 8433d82bd9. Graded log: 818 games, 2026-07-24 → 2026-10-15.
**Rule (Option B, founder 2026-10-09):** the official public forecast is the revision demonstrably **served by a READY Production deployment before the real start**. Generation time is not publication, and a commit is not publication.
**Scoring wording:** log loss and Brier are **lower-is-better**. The coin-flip log loss is 0.6931. A difference counts as established only when the paired-bootstrap 95% interval excludes 0. Nothing below is a model improvement. Every change is a **restatement of which forecast was public**.

## 1. Bottom line

1. **"29 graded from unserved revisions + 2 never public" is superseded.** Those counts came from the first #1046 shadow (`69c8e1e616`, 2026-10-10 00:26Z), which used *scheduled* starts. #1046 re-ran on 2026-10-10 with the *actual* first pitch (StatsAPI play-by-play, 10 s interval). I re-ran it today with a fresh GitHub deployment capture (4,463 Production deployments, 2026-07-20 → 2026-10-17 01:18Z) and a fresh first-pitch capture (818/818 games). The verified picture for all 818 graded games:
   - **22 verified graded-from-a-different-revision games:** 20 of the original 29 plus 824424 and 824471.
   - **4 verified never-public:** 824226, 824381, 824546, 823653. None of these were in the original "2".
   - **The original "2 never public" (824387, 823246) now verify as served = graded.**
   - **9 of the original 29 are now unverifiable** (ambiguous near the start): six from late August, GitHub record only, and three from 09-27 on the exact record.
2. **Classes (task taxonomy), over the 37 games ever implicated:**

   | Class | Meaning | Games |
   |---|---|---|
   | (a) | served revision identical in graded content (provenance only) | **2**: 823413, 823417 |
   | (b) | differs in probabilities or projections, same W/L/P | **14**, including 824424, which is *held* (see §5) |
   | (c) | at least one W/L outcome differs | **6**: 822763, 823578, 823579, 823824, 824217, 824628. 10 graded rows flip; details in §3.1 |
   | (d) | no served forecast before the start (never public) → void/exclude | **4**: 824226, 824381, 824546, 823653 |
   | (e) | ambiguous (record clock / ±margin) | **9** of the original 29. In 7, every build that could have been serving gives the same W/L/P; in **2** (822771, 824542) an outcome would differ if the other build served |
   | resolved | served = graded | 2 (824387, 823246, the original "never public") |

   **Original 29 alone:** a 2 · b 12 · c 6 · e 9.
3. **Since 10-10, nothing new has verified as wrong, but nothing has verified as right either.** Nine games were graded on or after 2026-10-08:
   - 3 are VERIFIED_AGREES: 849812, 849820, 849818.
   - 6 are class (e), unverified: 849832, 849831, 849809, 849813, 849810 near the cutoff, and 849811 with an untrusted FAILURE record.
   - In all 6, **every build that could have been serving carried the graded bytes**, so the ambiguity cannot change a grade. It is still unverified under the resolver as written.

   The postseason pattern is structural: the forecast is generated about 15 min before the start, and the next deployment lands within minutes of first pitch. **The grader's rule is unchanged ("newest generated before first pitch"),** so the defect can recur on any game.
4. **Public metrics move a little, and no model-health state changes.** Under the #1045 scope extended to today:
   - Moneyline: 418–400 → 417–397. Log loss 0.7000 → 0.6986, both **worse (higher) than the coin's 0.6931**; the interval includes 0, so WATCH.
   - Run line: 510–300 → 508–298 (HOLDING).
   - Total: 380–395–38 → 378–394–37 (BREACHED).
   - The /results pooled "MLB game calls": 1313–1098–38 → 1308–1092–37.
   - Forecast Record MLB public rows: 5,183 → 5,159 (24 NOT_SERVED disclosed).

   A strict reading, counting only demonstrably served forecasts, would also drop the 216 unverified games (598 games remain). That is a separate founder decision; see §4.3.
5. **#1045 / #1049 are still the right vehicle, but they are not current or complete:**
   - Both merge into main textually clean (`git merge-tree`, 597 commits behind).
   - CI on both is red. One failure is a since-fixed main-side test. The other is #1045's own `--check`: a provenance-only drift, because the log pins `classificationCommit` de9755ca00 while main's last commit on that file is 9cdc9ed92f, with identical content apart from unicode escaping.
   - All 100 before-states in the restatement log still match the current graded logs exactly.
   - **#1045/#1049 do not switch the grader.** I prepared that switch as an opt-in proposal: branch **`claude/mlb-served-revision-proposal`**, commit **`bcac58a407`**, local only, not pushed, no PR. See §6.

## 2. Evidence and method (all reproducible; nothing written to the repository's data)

| Input | Source |
|---|---|
| Exact deployment record (Sep 1 00:24Z – Oct 8 23:50Z, ±5 s) | `data/internal/ops/vercel-production-deployments/2026-09-01_2026-10-09.json` (#1042) |
| GitHub deployment record, **fresh** | `capture-github-production-deployments.mjs --since 2026-07-20` → scratchpad `mlb29/evidence/github-2026-07-20_2026-10-17T01-18-32Z.json`. It matches the 10-10 capture on all 3,947 overlapping deployments (0 changed) and adds 516 (401 READY, 104 INACTIVE, **11 FAILURE**) |
| Actual first pitch, **fresh** | `capture-mlb-actual-first-pitch.mjs` → scratchpad `mlb29/evidence/2026-10-17T01-19-37Z.json`. 818/818 have it; 491 started later than scheduled, 8 earlier |
| Shadows | `shadow-served-forecast-of-record.mjs` run three ways, as #1046 did: exact ±5 s; GitHub conservative −600 s/+60 s with FAILURE/ABANDONED distrusted for 1 h; GitHub typical ±60 s, used as a hint only. Then `classify-forecast-of-record.mjs` → scratchpad `mlb29/shadow/classification-2026-10-17.json` |
| Per-game comparison | scratchpad `mlb29/compare.mjs`. It re-grades the served revision, and **every build that could have been serving** for ambiguous games, with production `gradeGameFamilies` against the stored final. Output: `per-game-compare.json` (46 games of interest) and `per-game-compare-all.json` (all 247 non-agreeing or unverified games) |
| Metrics | scratchpad `mlb29/metrics.mjs`, using production `comparePairedLoss`/`logLossOf` (same seed as model-health). Output: `metrics-2026-10-17.json` |

**Reproduction check:**
- The exact-record run reproduces #1046's 10-10 result for all 373 games: the same 22 different, the same 4 never public, 13 ambiguous, 2 unreadable.
- No game's class changed between the 10-10 classification and today's. The 8 new games are additions.
- The current published `game-predictions-record.json` and `model-health.json` match my CURRENT numbers exactly. For example, moneyline 418–400 and meanDiff +0.0069 [−0.0055, +0.0201].

**On the ±60 s margin:** memory says ±60 s. #1046 measured GitHub READY times **up to 7 min late**, so ±60 s alone would wrongly verify some cases. The classification therefore uses the conservative −600/+60 s window for GitHub-only evidence, and ±60 s ("typical") appears only as a hint. Class (e) below is under the conservative clock.

## 3. Per-game reconstruction

How the "29 + 2" maps to today:
- **Still verified different (20 of 29):** 822763, 823168, 823413, 823417, 823491, 823578, 823579, 823731, 823814, 823822, 823824, 824055, 824217, 824304, 824305, 824385, 824545, 824628, 825030, 849822.
- **Now ambiguous (9 of 29):**
  - 822771, 823581, 824879 (08-27), 823744 (08-28), 823662, 823740 (08-30): GitHub record only.
  - 823084, 823650, 824542 (09-27): a Vercel deployment became READY at 19:11:39Z, inside their first-pitch intervals.
- **Added by the actual-start basis:**
  - Different revision: 824424, 824471. Both had rain or late starts, so a later served revision qualified.
  - Never public: 824226 (09-09), 824381 and 824546 (09-20), 823653 (09-26). Each started 1.5–4 h late. The build serving at the real start showed the game unavailable, while the grader used a morning snapshot.
- **Original "never public" now verified served = graded:** 824387, 823246.

**The recurring shape (class a–c):** the graded revision is a snapshot generated **10 s to 9 min before the scheduled start**, for example 23:09:50Z for a 23:10Z game. No Production deployment carrying it became READY before the actual first pitch. The public saw an earlier commit's forecast, usually the morning or afternoon run.

### Verified different revision and verified never public (exact Vercel record)

| # | Game | Date | Sched. start | Actual first pitch (interval start) | Graded revision (generatedAt) | Served revision (generatedAt) | Serving deployment · sha · READY | In 29? | Class | Graded quantities that differ (graded → served) |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 823579 SF @ NYM | 2026-09-04 | 09-04 23:10:00Z | 09-04 23:10:20Z | snap:2026-09-04/snapshot-202609042309.json (09-04 23:09:50Z) | git:7942eb5dba66 (09-04 20:57:41Z) | dpl_7Jh9KMeNq8MbaKBpA4jaaiBHqrTh · 86674a30e3 · 09-04 22:56:06Z | yes | c | moneyline NYM (home) 0.527 **WIN** → SF (away) 0.508 **LOSS**; total UNDER 7.5 0.642 **LOSS** → UNDER 7.5 0.609 **LOSS**; run_line SF +1.5 0.67 **LOSS** → NYM +1.5 0.638 **WIN**; proj 3–3/med 6 → 3–3/med 7 |
| 2 | 823824 CHC @ MIA | 2026-09-04 | 09-04 23:10:00Z | 09-04 23:10:26Z | snap:2026-09-04/snapshot-202609042309.json (09-04 23:09:50Z) | git:7942eb5dba66 (09-04 20:57:41Z) | dpl_7Jh9KMeNq8MbaKBpA4jaaiBHqrTh · 86674a30e3 · 09-04 22:56:06Z | yes | c | moneyline CHC (away) 0.7 **WIN** → CHC (away) 0.733 **WIN**; total OVER 8 0.47 **LOSS** → UNDER 8 0.493 **WIN**; run_line CHC -1.5 0.569 **WIN** → CHC -1.5 0.601 **WIN**; proj 5–3/med 8 → 5–2/med 8 |
| 3 | 824424 DET @ CLE | 2026-09-04 | 09-04 18:10:00Z | 09-04 19:15:01Z | snap:2026-09-04/snapshot-202609041738.json (09-04 17:38:06Z) | git:5b6909de853c (09-04 18:31:58Z) | dpl_4GHLhmRnhk5mhA8QBpbvfF5pUZsN · 84322714e1 · 09-04 19:09:21Z | no (new after actual-start) | b (held) | moneyline CLE (home) 0.613 **WIN** → CLE (home) 0.609 **WIN**; total UNDER 8 0.594 **LOSS** → UNDER 8 0.589 **LOSS** |
| 4 | 824471 MIL @ CIN | 2026-09-04 | 09-04 22:10:00Z | 09-04 23:00:33Z | snap:2026-09-04/snapshot-202609042136.json (09-04 21:36:31Z) | git:5b6909de853c (09-04 18:31:58Z) | dpl_7Jh9KMeNq8MbaKBpA4jaaiBHqrTh · 86674a30e3 · 09-04 22:56:06Z | no (new after actual-start) | b | moneyline MIL (away) 0.59 **WIN** → MIL (away) 0.598 **WIN**; total UNDER 9.5 0.591 **LOSS** → UNDER 9.5 0.586 **LOSS**; run_line CIN +1.5 0.533 **LOSS** → CIN +1.5 0.526 **LOSS** |
| 5 | 823417 ATL @ PHI | 2026-09-06 | 09-06 17:10:00Z | 09-06 17:11:54Z | snap:2026-09-06/snapshot-202609061705.json (09-06 17:05:49Z) | git:95927e60c6de (09-06 16:27:44Z) | dpl_DWBv4NV6aBWs5oWbXYXMajiuB7gJ · 95927e60c6 · 09-06 16:40:21Z | yes | a | none (provenance only) |
| 6 | 823578 SF @ NYM | 2026-09-06 | 09-06 17:40:00Z | 09-06 17:40:32Z | snap:2026-09-06/snapshot-202609061738.json (09-06 17:38:33Z) | git:03afc0de8c1b (09-06 17:05:49Z) | dpl_9mhsKi6aqEPJg4RYiuhz9JfxLSrm · f56a4ae62d · 09-06 17:34:08Z | yes | c | moneyline NYM (home) 0.507 **WIN** → SF (away) 0.507 **LOSS**; total UNDER 8 0.593 **WIN** → UNDER 8 0.629 **WIN**; run_line SF +1.5 0.686 **LOSS** → NYM +1.5 0.644 **WIN**; proj 3–3/med 7 → 3–3/med 6 |
| 7 | 823822 CHC @ MIA | 2026-09-06 | 09-06 17:40:00Z | 09-06 17:41:28Z | snap:2026-09-06/snapshot-202609061738.json (09-06 17:38:33Z) | git:03afc0de8c1b (09-06 17:05:49Z) | dpl_9mhsKi6aqEPJg4RYiuhz9JfxLSrm · f56a4ae62d · 09-06 17:34:08Z | yes | b | moneyline CHC (away) 0.698 **LOSS** → CHC (away) 0.707 **LOSS**; total OVER 8 0.516 **WIN** → OVER 8 0.552 **WIN**; run_line CHC -1.5 0.572 **LOSS** → CHC -1.5 0.59 **LOSS**; proj 5–3/med 9 → 6–3/med 9 |
| 8 | 824385 DET @ CLE | 2026-09-06 | 09-06 17:40:00Z | 09-06 17:40:49Z | snap:2026-09-06/snapshot-202609061738.json (09-06 17:38:33Z) | git:03afc0de8c1b (09-06 17:05:49Z) | dpl_9mhsKi6aqEPJg4RYiuhz9JfxLSrm · f56a4ae62d · 09-06 17:34:08Z | yes | b | moneyline CLE (home) 0.523 **WIN** → CLE (home) 0.549 **WIN**; total UNDER 7 0.55 **WIN** → UNDER 7 0.483 **WIN**; run_line DET +1.5 0.683 **WIN** → DET +1.5 0.654 **WIN**; proj 3–3/med 6 → 3–3/med 7 |
| 9 | 824226 MIN @ DET | 2026-09-09 | 09-09 17:10:00Z | 09-09 18:50:09Z | snap:2026-09-09/snapshot-202609091524.json (09-09 15:24:42Z) | NOT SERVED (build showed game unavailable) | dpl_7b6cHD52ysj5Z9wsw1GgCC7gxcbm · 95dd6d9aa4 · 09-09 18:36:59Z | no (new) | d | all graded rows: forecast never public |
| 10 | 823413 HOU @ PHI | 2026-09-10 | 09-10 17:05:00Z | 09-10 17:06:02Z | snap:2026-09-10/snapshot-202609101704.json (09-10 17:04:46Z) | git:b5395109038c (09-10 15:10:18Z) | dpl_GBfTKWozewyfp9yF5NYerE93hn5n · 66d33bfd40 · 09-10 16:54:17Z | Stage A (14) | a | none (provenance only) |
| 11 | 824628 PIT @ CHC | 2026-09-13 | 09-13 18:20:00Z | 09-13 18:20:31Z | snap:2026-09-13/snapshot-202609131817.json (09-13 18:17:22Z) | git:cc345e01de87 (09-13 10:25:53Z) | dpl_86er2w2WLvdxCio82LTP1wuxtF5k · 451d73828a · 09-13 18:13:20Z | Stage A (14) | c | moneyline CHC (home) 0.528 **LOSS** → PIT (away) 0.512 **WIN**; total OVER 6.5 0.589 **WIN** → OVER 6.5 0.635 **WIN**; run_line PIT +1.5 0.661 **WIN** → CHC +1.5 0.619 **WIN**; proj 3–4/med 7 → 4–4/med 8 |
| 12 | 825030 MIA @ AZ | 2026-09-15 | 09-16 01:40:00Z | 09-16 01:41:10Z | snap:2026-09-15/snapshot-202609160135.json (09-16 01:35:10Z) | git:6a2e71805a40 (09-15 22:22:45Z) | dpl_GDsQuxLKRdfaQd8uYL9wwDTU1RY5 · e27185b851 · 09-16 01:05:33Z | yes | b | moneyline MIA (away) 0.555 **WIN** → MIA (away) 0.548 **WIN**; total UNDER 8.5 0.524 **WIN** → UNDER 8.5 0.522 **WIN**; run_line AZ +1.5 0.574 **LOSS** → AZ +1.5 0.579 **LOSS** |
| 13 | 822763 DET @ TOR | 2026-09-16 | 09-16 19:07:00Z | 09-16 19:07:04Z | snap:2026-09-16/snapshot-202609161859.json (09-16 18:59:50Z) | git:4c2d3c9e0a17 (09-16 10:07:14Z) | dpl_AvqXU8aVM1cW5cmLWnAwuHsVwybg · 4f2dda0042 · 09-16 19:06:48Z | Stage A (14) | c | moneyline TOR (home) 0.501 **WIN** → TOR (home) 0.542 **WIN**; total UNDER 8.5 0.517 **WIN** → OVER 8.5 0.514 **LOSS**; run_line DET +1.5 0.675 **LOSS** → DET +1.5 0.638 **LOSS**; proj 4–4/med 8 → 4–4/med 9 |
| 14 | 824305 SD @ COL | 2026-09-17 | 09-17 19:10:00Z | 09-17 19:10:39Z | snap:2026-09-17/snapshot-202609171909.json (09-17 19:09:06Z) | git:bae941f87d5c (09-17 10:09:14Z) | dpl_3mtkWUsKo8FAwUUCtsZ9UGGqFFX4 · 73419d0d9e · 09-17 19:03:02Z | Stage A (14) | b | moneyline SD (away) 0.564 **WIN** → SD (away) 0.531 **WIN**; total UNDER 11 0.537 **PUSH** → UNDER 11 0.523 **PUSH**; run_line COL +1.5 0.553 **LOSS** → COL +1.5 0.579 **LOSS**; proj 5–4/med 10 → 5–5/med 10 |
| 15 | 824304 SEA @ COL | 2026-09-19 | 09-20 00:10:00Z | 09-20 00:11:46Z | snap:2026-09-19/snapshot-202609192318.json (09-19 23:18:41Z) | git:705e7fd87934 (09-19 20:56:00Z) | dpl_8FftGWJWoxtCbHGqRNZhYnkpzAj5 · 1998d82ce6 · 09-19 22:49:08Z | Stage A (14) | b | moneyline COL (home) 0.758 **WIN** → COL (home) 0.762 **WIN**; total UNDER 10.5 0.751 **WIN** → UNDER 10.5 0.747 **WIN**; run_line COL -1.5 0.574 **WIN** → COL -1.5 0.572 **WIN** |
| 16 | 824545 DET @ CWS | 2026-09-19 | 09-19 18:10:00Z | 09-19 18:11:37Z | snap:2026-09-19/snapshot-202609191808.json (09-19 18:08:54Z) | git:f0bc888fdfcb (09-19 09:39:31Z) | dpl_Kh5ydE5XPLb9rHVcEMFdMm7jEYAd · 485b0ea635 · 09-19 18:01:48Z | Stage A (14) | b | moneyline DET (away) 0.643 **LOSS** → DET (away) 0.68 **LOSS**; total UNDER 8 0.58 **WIN** → UNDER 8 0.572 **WIN**; run_line DET -1.5 0.502 **LOSS** → DET -1.5 0.534 **LOSS** |
| 17 | 824381 ATH @ CLE | 2026-09-20 | 09-20 17:40:00Z | 09-20 19:45:52Z | snap:2026-09-20/snapshot-202609201443.json (09-20 14:43:56Z) | NOT SERVED (build showed game unavailable) | dpl_DVJbMFF3ZfrLhz7nJoYy3Kw9i2XB · ebe5197649 · 09-20 19:45:13Z | no (new) | d | all graded rows: forecast never public |
| 18 | 824546 DET @ CWS | 2026-09-20 | 09-20 18:10:00Z | 09-20 22:00:50Z | snap:2026-09-20/snapshot-202609201443.json (09-20 14:43:56Z) | NOT SERVED (build showed game unavailable) | dpl_9RpP42BhfUikTXAK7BHzUvSXV2KD · 4544bb4945 · 09-20 21:48:01Z | no (new) | d | all graded rows: forecast never public |
| 19 | 823168 MIN @ SF | 2026-09-23 | 09-23 19:45:00Z | 09-23 19:45:50Z | snap:2026-09-23/snapshot-202609231944.json (09-23 19:44:53Z) | git:2610c105e12c (09-23 10:05:45Z) | dpl_7oLTMKR7DZFnf42kCPSbEAXbpuME · 266b7ce792 · 09-23 19:27:33Z | yes | b | moneyline MIN (away) 0.611 **WIN** → MIN (away) 0.632 **WIN**; total UNDER 7.5 0.684 **WIN** → UNDER 7.5 0.724 **WIN**; run_line SF +1.5 0.558 **LOSS** → SF +1.5 0.537 **LOSS**; proj 3–2/med 6 → 3–2/med 5 |
| 20 | 823491 BAL @ NYY | 2026-09-25 | 09-25 20:05:00Z | 09-25 20:08:32Z | snap:2026-09-25/snapshot-202609252004.json (09-25 20:04:50Z) | git:09ac551fce6d (09-25 18:31:22Z) | dpl_8WyG2jc6RcP363CGRuCBEqHiNoeQ · f51be27b62 · 09-25 19:27:49Z | Stage A (14) | b | moneyline NYY (home) 0.56 **LOSS** → NYY (home) 0.544 **LOSS**; total OVER 6.5 0.546 **WIN** → OVER 6.5 0.526 **WIN**; run_line BAL +1.5 0.637 **WIN** → BAL +1.5 0.654 **WIN** |
| 21 | 823653 TEX @ MIN | 2026-09-26 | 09-26 20:10:00Z | 09-26 22:11:21Z | snap:2026-09-26/snapshot-202609262001.json (09-26 20:01:47Z) | NOT SERVED (build showed game unavailable) | dpl_8MzAV5km8rKTDrmeQpKS8mXokLzC · ac06607173 · 09-26 22:06:10Z | no (new) | d | all graded rows: forecast never public |
| 22 | 823731 STL @ MIL | 2026-09-27 | 09-27 19:10:00Z | 09-27 19:10:37Z | snap:2026-09-27/snapshot-202609271908.json (09-27 19:08:06Z) | git:d1c86fc9f340 (09-27 10:38:25Z) | dpl_JDjp8UKiq8wjSr51yhfawNNvWsgz · 538c71c67b · 09-27 19:02:27Z | Stage A (14) | b | moneyline MIL (home) 0.629 **WIN** → MIL (home) 0.673 **WIN**; total UNDER 7 0.529 **LOSS** → UNDER 7 0.476 **LOSS**; run_line STL +1.5 0.587 **LOSS** → STL +1.5 0.529 **LOSS**; proj 2–3/med 6 → 2–4/med 7 |
| 23 | 823814 ATL @ MIA | 2026-09-27 | 09-27 19:10:00Z | 09-27 19:10:10Z | snap:2026-09-27/snapshot-202609271908.json (09-27 19:08:06Z) | git:d1c86fc9f340 (09-27 10:38:25Z) | dpl_JDjp8UKiq8wjSr51yhfawNNvWsgz · 538c71c67b · 09-27 19:02:27Z | Stage A (14) | b | moneyline MIA (home) 0.558 **WIN** → MIA (home) 0.521 **WIN**; total UNDER 8.5 0.736 **WIN** → UNDER 8.5 0.546 **WIN**; proj 3–3/med 6 → 4–4/med 8 |
| 24 | 824055 CLE @ KC | 2026-09-27 | 09-27 19:10:00Z | 09-27 19:10:01Z | snap:2026-09-27/snapshot-202609271908.json (09-27 19:08:06Z) | git:d1c86fc9f340 (09-27 10:38:25Z) | dpl_JDjp8UKiq8wjSr51yhfawNNvWsgz · 538c71c67b · 09-27 19:02:27Z | Stage A (14) | b | moneyline KC (home) 0.646 **WIN** → KC (home) 0.601 **WIN**; total UNDER 8.5 0.69 **WIN** → UNDER 8.5 0.531 **WIN**; run_line CLE +1.5 0.561 **WIN** → CLE +1.5 0.585 **WIN**; proj 3–4/med 7 → 3–4/med 8 |
| 25 | 824217 PIT @ DET | 2026-09-27 | 09-27 19:10:00Z | 09-27 19:10:52Z | snap:2026-09-27/snapshot-202609271908.json (09-27 19:08:06Z) | git:4df53e062086 (09-27 15:41:46Z) | dpl_JDjp8UKiq8wjSr51yhfawNNvWsgz · 538c71c67b · 09-27 19:02:27Z | Stage A (14) | c | moneyline DET (home) 0.555 **LOSS** → PIT (away) 0.567 **WIN**; total UNDER 8 0.488 **WIN** → OVER 8 0.556 **LOSS**; run_line PIT +1.5 0.628 **WIN** → DET +1.5 0.55 **LOSS**; proj 4–4/med 8 → 5–4/med 9 |
| 26 | 849822 LAD @ ATL | 2026-10-07 | 10-07 22:00:00Z | 10-07 22:09:04Z | snap:2026-10-07/snapshot-202610072126.json (10-07 21:26:30Z) | git:02c0b62301e3 (10-07 09:27:56Z) | dpl_EK2yXanfgJzwpYxjhkyugCTivDeQ · c0fca0588a · 10-07 20:27:04Z | yes | b | moneyline LAD (away) 0.632 **WIN** → LAD (away) 0.639 **WIN**; total OVER 7.5 0.576 **LOSS** → OVER 7.5 0.583 **LOSS**; run_line LAD -1.5 0.507 **WIN** → LAD -1.5 0.514 **WIN** |

### Ambiguous or evidence-limited (class e) — original-29 members and every game graded since 2026-10-08

| Game | Date | Evidence | Status | Cutoff (actual start) | Deciding deployment READY (Δ vs cutoff) | Possible serving builds → grade effect | In 29? |
|---|---|---|---|---|---|---|---|
| 822771 KC @ TOR | 2026-08-27 | GITHUB_CONSERVATIVE | AMBIGUOUS_NEAR_CUTOFF | 08-27 23:07:15Z | gh-6132615197 08-27 23:11:40Z (+265 s) | outcome differs: moneyline WIN→LOSS, total LOSS→WIN, run_line LOSS→WIN; = graded | yes |
| 823581 MIL @ NYM | 2026-08-27 | GITHUB_CONSERVATIVE | AMBIGUOUS_NEAR_CUTOFF | 08-27 23:10:13Z | gh-6132615197 08-27 23:11:40Z (+87 s) | differs, same outcomes; = graded | yes |
| 824879 LAD @ ATL | 2026-08-27 | GITHUB_CONSERVATIVE | AMBIGUOUS_NEAR_CUTOFF | 08-27 23:16:50Z | gh-6132665382 08-27 23:16:26Z (-24 s) | differs, same outcomes; = graded | yes |
| 823744 TEX @ MIL | 2026-08-28 | GITHUB_CONSERVATIVE | AMBIGUOUS_NEAR_CUTOFF | 08-28 23:40:15Z | gh-6150322254 08-28 23:46:09Z (+353 s) | differs, same outcomes; = graded | yes |
| 823662 CWS @ MIN | 2026-08-30 | GITHUB_CONSERVATIVE | AMBIGUOUS_NEAR_CUTOFF | 08-30 18:10:58Z | gh-6169696490 08-30 18:13:26Z (+148 s) | differs, same outcomes; = graded | yes |
| 823740 TEX @ MIL | 2026-08-30 | GITHUB_CONSERVATIVE | AMBIGUOUS_NEAR_CUTOFF | 08-30 18:12:16Z | gh-6169696490 08-30 18:13:26Z (+70 s) | differs, same outcomes; = graded | yes |
| 823084 LAA @ SEA | 2026-09-27 | EXACT_RECORD | AMBIGUOUS_NEAR_CUTOFF | 09-27 19:11:34Z | dpl_A47W246ZCLGpw5YiWoDfybXvBcyM 09-27 19:11:39Z (+4 s) | differs, same outcomes; = graded | yes |
| 823650 TEX @ MIN | 2026-09-27 | EXACT_RECORD | AMBIGUOUS_NEAR_CUTOFF | 09-27 19:11:30Z | dpl_A47W246ZCLGpw5YiWoDfybXvBcyM 09-27 19:11:39Z (+9 s) | differs, same outcomes; = graded | yes |
| 824542 COL @ CWS | 2026-09-27 | EXACT_RECORD | AMBIGUOUS_NEAR_CUTOFF | 09-27 19:11:36Z | dpl_A47W246ZCLGpw5YiWoDfybXvBcyM 09-27 19:11:39Z (+2 s) | outcome differs: run_line WIN→LOSS; = graded | yes |
| 849832 CLE @ CWS | 2026-10-08 | GITHUB_CONSERVATIVE | AMBIGUOUS_NEAR_CUTOFF | 10-09 00:08:41Z | gh-6949655826 10-09 00:08:30Z (-12 s) | = graded | no |
| 849831 CWS @ CLE | 2026-10-10 | GITHUB_CONSERVATIVE | AMBIGUOUS_NEAR_CUTOFF | 10-11 00:08:49Z | gh-6988685784 10-11 00:08:54Z (+5 s) | = graded | no |
| 849809 LAD @ MIL | 2026-10-11 | GITHUB_CONSERVATIVE | AMBIGUOUS_NEAR_CUTOFF | 10-12 00:16:34Z | gh-7003833388 10-12 00:17:34Z (+59 s) | = graded | no |
| 849813 CLE @ TB | 2026-10-13 | GITHUB_CONSERVATIVE | AMBIGUOUS_NEAR_CUTOFF | 10-14 00:08:16Z | gh-7053203839 10-14 00:08:01Z (-16 s) | = graded | no |
| 849811 MIL @ LAD | 2026-10-14 | GITHUB_CONSERVATIVE | AMBIGUOUS_DEPLOYMENT_STATE | 10-15 00:09:04Z | gh-7080285531 10-15 00:04:55Z (-250 s) | = graded | no |
| 849810 MIL @ LAD | 2026-10-15 | GITHUB_CONSERVATIVE | AMBIGUOUS_NEAR_CUTOFF | 10-16 00:08:22Z | gh-7107513359 10-16 00:12:04Z (+221 s) | = graded | no |

### Former findings now resolved

- 824387 DET @ CLE (2026-09-04): reported never public on 10-10 (scheduled-start basis). With the actual first pitch 09-04 23:45:25Z, deployment dpl_8bFjDTrCKJSGXyj7au8WRxnQjuZX READY 09-04 23:17:53Z served the graded revision → VERIFIED_AGREES.
- 823246 AZ @ SD (2026-09-27): reported never public on 10-10 (scheduled-start basis). With the actual first pitch 09-27 19:11:47Z, deployment dpl_A47W246ZCLGpw5YiWoDfybXvBcyM READY 09-27 19:11:39Z served the graded revision → VERIFIED_AGREES.

### 3.1 Outcome changes (class c), graded row by row

| Game | Rows that flip (graded → served) |
|---|---|
| 822763 DET@TOR 09-16 | total UNDER 8.5 WIN → OVER 8.5 LOSS |
| 823578 SF@NYM 09-06 | moneyline NYM WIN → SF LOSS; run line SF +1.5 LOSS → NYM +1.5 WIN |
| 823579 SF@NYM 09-04 | moneyline NYM WIN → SF LOSS; run line SF +1.5 LOSS → NYM +1.5 WIN |
| 823824 CHC@MIA 09-04 | total OVER 8 LOSS → UNDER 8 WIN |
| 824217 PIT@DET 09-27 | moneyline DET LOSS → PIT WIN; total UNDER 8 WIN → OVER 8 LOSS; run line PIT +1.5 WIN → DET +1.5 LOSS |
| 824628 PIT@CHC 09-13 | moneyline CHC LOSS → PIT WIN; run line pick changes (PIT +1.5 → CHC +1.5) but both WIN |

**Net effect on W–L, computed and reconciled with §4:**

| Market | Restating the 21 revisions | Removing the 4 never-public games | Result |
|---|---|---|---|
| Moneyline | 0 net (2 WIN→LOSS, 2 LOSS→WIN) | −1 W, −3 L | 418–400 → 417–397 |
| Run line | +1 W / −1 L (2 LOSS→WIN, 1 WIN→LOSS) | −3 W, −1 L | 510–300 → 508–298 |
| Total | −1 W / +1 L (1 LOSS→WIN, 2 WIN→LOSS) | −1 W, −2 L, −1 P | 380–395–38 → 378–394–37 |

824424 changes probabilities only. Holding it or restating it leaves every count unchanged.

The projected-score family (`mlb_projected_runs` / `mlb_projected_total`, graded by absolute error) also changes in most class (b)/(c) games. These are listed in the table's last column as "proj a–h/med m".

## 4. Public metrics that include these games: published vs Option B

### 4.1 Which public surfaces aggregate MLB game grades (mapped from the code on main)

| Surface | Reads | What it shows | Affected? |
|---|---|---|---|
| `/results`, "MLB game calls" card | graded log (`results/v2/overview.ts` → `populations.mjs`), **all four markets pooled**, no gamePk dedup | W/L/P and hit rate for today, 7 d, 30 d, season and all | Yes: season/all; the 30-day window contains 14 of the 26 changed games (09-16 → 10-07); 7 d and today contain none |
| `/results/date/[date]` | graded log (`results/v2/day.ts`) | **per-game** pick, line and WIN/LOSS/PUSH | Yes, the 26 games' rows are visible per game |
| `/results/picks`, `/results/picks/mlb` | `public/data/mlb/results/game-predictions-record.json` (written by the grader) | n, W–L–P and hit rate per market | Yes |
| `/results/forecasts`, `/results/forecasts/mlb/<family>`, CSV `forecast-record/v1/mlb-<family>.csv` | forecast ledger `data/internal/forecast-ledger/v1/mlb.jsonl` | published/measured counts, Brier, log loss, ECE, a 10-bin calibration table, MAE, directional W–L–P, and the latest 60 rows | Yes, once the ledger is restated |
| `/models`, `/mlb` status panel | `public/data/admin/model-health.json` (`build-model-health.mjs`; a public static file) | state (HOLDING/WATCH/BREACHED), n, log loss vs coin interval, hit rate "for context" | Yes; the states do not change |
| Pause gate (markets, game pages, top reads) | model-health states | show or hide calls | No (no state change) |
| `/saved`, My GameTime | graded log, fetched at runtime | HIT/MISS/VOID per saved game | Yes, per game |
| Ask | graded log and ledger projections | prose of the same numbers | Yes |
| Home `/` | graded log only to mark a game SETTLED | **no MLB game-forecast aggregate or claim** | No |
| `/mlb/results`, `/results/model-audit`, `/methodology`, `lifetime_summary.json` | player-prop records | — | No (not game forecasts) |

### 4.2 Published now vs Option B (current data; both denominators shown)

**Scenarios:**
- **CURRENT** = what is published today.
- **B-1045** = the #1045 restatement as proposed (21 restated, 4 removed as NOT_SERVED, 824424 held, unverified kept). Extended to today, it needs no new rows: no game since 10-07 verified different.
- **B-1045+824424** = also restating the held game. It changes no count; probabilities only.

| Family (surface) | CURRENT | B-1045 | Direction and size |
|---|---|---|---|
| Moneyline W–L (picks page, record JSON) | **418–400** (n 818), 51.10% | **417–397** (n 814), 51.23% | −4 games. The hit rate moves +0.13 pp only because of what is excluded |
| Moneyline log loss (lower is better; coin 0.6931) | 0.7000 | 0.6986 | Both **worse than the coin**. model-health meanDiff +0.0069 [−0.0055, +0.0201] → +0.0054 [−0.0067, +0.0181]. The interval includes 0: **WATCH → WATCH**, not established either way |
| Moneyline Brier (lower is better) | 0.2533 | 0.2526 | −0.0007 |
| Run line (v1 ±1.5) W–L | **510–300** (n 810), 62.96% | **508–298** (n 806), 63.03% | HOLDING → HOLDING. Log loss 0.6612 → 0.6601; meanDiff −0.0319 [−0.0465, −0.0164] → −0.0331 [−0.0479, −0.0184]. **Caveat:** 92% of picks are +1.5, whose base cover rate is close to this hit rate. That is not an edge claim |
| Run line (posted, v2) | 5–3 (n 8) | 5–3 (n 8) | unchanged; INSUFFICIENT_SAMPLE |
| Total W–L–P | **380–395–38** (n 813), 49.03% | **378–394–37** (n 809), 48.96% | BREACHED → BREACHED. Log loss 0.7279 → 0.7282, **worse than the coin** and slightly worse after the restatement; meanDiff +0.0348 [+0.0160, +0.0536] → +0.0351 [+0.0175, +0.0534] |
| `/results` pooled "MLB game calls" | 1313–1098–38 | 1308–1092–37 | −5 W, −6 L, −1 P |
| Projected team runs MAE (lower is better) | 2.4352 (n 1,636) | 2.4312 (n 1,628) | −0.0040 |
| Projected median-total MAE (lower is better) | 3.5990 (n 818) | 3.6044 (n 814) | +0.0054 (worse) |
| Forecast Record: MLB rows counted as public | **5,183** | **5,159** (+24 NOT_SERVED, disclosed and not counted) | the 4 games × 6 game families |
| Forecast Record: MLB measured | 5,104 | 5,081 | −23 (823653's total was a PUSH, so VOID; mlb_total void 38 → 37) |
| model-health states | total BREACHED, moneyline WATCH, run_line HOLDING, run_line_posted INSUFFICIENT | **identical** | nothing paused or unpaused |

Calibration: #1045's 10-10 report recomputed calibration slope and ECE for its scope. I did not recompute the 10-bin tables for today's data; the reconciliation regenerator in #1045 would, see §5. Because the rows that change are the same as in #1045 and only the population grew, the direction should be the same, but this is **not verified**.

### 4.3 The stricter reading: what "demonstrably served" means for the 216 unverified games

#1045 restates only *verified* discrepancies and leaves the 216 unverified games graded and flagged:
- 79 before GitHub's record (EVIDENCE_GAP);
- 134 ambiguous near the cutoff, plus 1 with an untrusted state;
- 2 with unreadable builds.

Read literally, Option B ("demonstrably served") would exclude them as well. That is a founder decision, so here are the numbers, informational only:

| Scenario | Games | Moneyline | Run line | Total | Pooled | States |
|---|---|---|---|---|---|---|
| Strict, verified only | 598 | 308–290; log loss 0.6982 (worse than coin; [−0.0089, +0.0195]) | 378–217 | 274–289–30; log loss 0.7302 | 962–797–30 | unchanged |
| Strict + content invariance (an unverified game counts when **every** build that could have been serving carried the graded bytes: 121 of the 216) | 719 | 370–349; log loss 0.6983 | 447–264 | 332–347–35; log loss 0.7304 | 1154–963–35 | unchanged |

**Content invariance is my extension, not part of #1046's resolver.**
- It enumerates the last deployment READY *surely* before the start, every READY deployment inside the clock band, and untrusted FAILURE records up to 1 h after the start.
- It then checks what each build carried.
- It would let the resolver verify 121 of the 135 ambiguous games without new credentials.
- **It needs its own review before any use.**

Breakdown of the 135 ambiguous (AMBIGUOUS_NEAR_CUTOFF plus AMBIGUOUS_DEPLOYMENT_STATE):

| What every possible serving build carried | Games |
|---|---|
| The graded bytes | 121 |
| A different revision, with the same W/L/P | 9 |
| A different revision, and **an outcome would differ** | 2 (822771, 824542) |
| Some candidate build unreadable | 3 |

## 5. Status of #1045 and #1049 (checked 2026-10-17)

| | #1045 TRUTH-001 Stage B (draft) | #1049 forecast-ledger@1 amendment 2 (draft, stacked on #1045) |
|---|---|---|
| Head | `e6dcf3240f`, last merge of main on 10-11 | `f0329be63a`, 10-11 |
| Behind / ahead of main | 597 / 9 | 597 / 13 |
| `git merge-tree` with main | **clean** (tree 6dcfc0e8ac) | **clean** (tree a2a5139bae) |
| CI (`quality`) | **red**. 2 failures (below) | **red**. The same 2 |
| Scope | 21 restated + 4 NOT_SERVED + 824424 held. Reader consolidation, fail-closed NOT_SERVED readers, ledger `--restate`, amendment 1 (NOT_SERVED) | versioned `timing` (actual start, servedAt, publicationEvidence) and the `ofRecordBeforeStart` rule. 824424 stays held |

**Its two CI failures:**
1. `run-line-posted.test.mjs`: "EVERY committed graded row stays v1 run_line". This is main-side. The test asserted zero `run_line_posted` rows until the first v2 call was graded on 10-11, and main has since rewritten it (`V1_RUN_LINE_FLOOR = 810`). A merge of current main fixes it. Locally on main this test passes, inside the 452/452 runnable tests I ran.
2. `restatements.test.mjs`: "the log builder's --check reproduces the committed log exactly". Cause: `build-forecast-of-record-restatements.mjs` stamps `source.classificationCommit` from `git log -1 -- classification.json`.
   - The log says `de9755ca00`, a #1046 branch commit.
   - Main's last commit on that file is `9cdc9ed92f`, the #1046 reconcile commit.
   - The two versions differ **only in JSON unicode escaping** of "−", across 131 lines.

   This is provenance-only, but the log is write-once, so the fix is a new log id (or pinning the commit by content hash), not an edit.

**Still current:**
- All **100** `before` rows (75 game-grade and 25 projected-score) match today's graded logs **exactly**.
- Today's re-run gives the identical classification for every game in the 10-10 set. **No game graded since 10-07 has verified as a different revision or never public**, so the 21/4/1 scope is still complete for *verified* cases.
- The selector check (§6) agrees with the classification on every exact-window game (0 mismatches).

**What is missing:**
1. **The grader switch.** Neither PR changes `grade-game-predictions.mjs`. Every new game is still graded "newest generated before first pitch", so applying #1045 fixes the past and leaves the cause in place. *Proposal prepared, see §6.*
2. **Evidence capture wiring.** No deployment-record, live-probe or first-pitch capture runs on a schedule. The newest committed records are from 10-10; I captured today's only into the scratchpad. Without them, a served-mode grader would refuse new games as EVIDENCE_GAP.
3. **A refresh of the log and the report.** A superseding restatement log, e.g. `2026-10-1x-truth-001b`, regenerated from a classification committed on main, plus a reconciliation regenerated on the current population of 818 games. Today's numbers are in §4.
4. **Decisions the PRs leave open:**
   - 824424 (#1049's timing amendment);
   - the 216 unverified games (§4.3), including whether content invariance may verify;
   - whether the stored graded log stays a public URL (`/saved` fetches it at runtime).
5. **A visible correction note per affected game/day.** #1045's README lists it under Option A, but I found no UI for it in the diff.
6. **Ask projections and the per-family CSVs** pick up NOT_SERVED through the ledger, which #1045 handles. The `/results` pooled card reads the graded log; #1045 moves it onto the single loader (`results/v2/overview.ts`), so it needs no extra change.

## 6. What an appropriate correction requires

**Principles (already the design of #1045):**
- append-only;
- originals preserved verbatim;
- lineage carried on every row;
- fail closed;
- approval-gated (a log applies only at `status: APPROVED`).

| Step | Files | Gate |
|---|---|---|
| 1. Commit the evidence used, staged in an existing workflow commit (OPS-002: no standalone pushes): the deployment record and first-pitch capture as of the restatement | `data/internal/ops/production-deployments/`, `data/internal/mlb/actual-first-pitch/` | Results/OPS owner |
| 2. Regenerate the classification on main and commit it | `classify-forecast-of-record.mjs` → `data/internal/ops/forecast-of-record-shadow/` | — |
| 3. New write-once restatement log superseding `2026-10-10-truth-001`, which stays as history. Same 21 + 4 (+ 824424 if #1049 is approved). The builder must pin classification provenance by content hash, not by `git log -1` | `build-forecast-of-record-restatements.mjs`, `data/internal/mlb/forecast-of-record-restatements/<new-id>.json` | **Founder: approve the log** |
| 4. Merge main into #1045/#1049, fix the two CI failures, regenerate `reconciliation-v2` on 818 games, including calibration tables and ECE | `docs/truth-001/mlb-results-corrections/` | CI green |
| 5. Apply: set the status to APPROVED; run `build-forecast-ledger.mjs --restate <id>`; commit the ledger and the write-once receipt `data/internal/forecast-ledger/v1/migrations/<id>.json`. The graded log files are **never rewritten**; readers apply the log through `grades-of-record-io.mjs` | ledger + receipt | **Founder: apply**; ledger owner (conditions 1–7 already accepted) |
| 6. Grader switch: `--forecast-of-record served` in the nightly settle, with evidence captured before the start (probes never backfilled), full git history (the nightly checkout must not be shallow), and refusals reported as a monitored daily count by status | `grade-game-predictions.mjs`, the settle workflow (protected), `mlb-pregame-capture.yml` for probes | **Founder + Results/OPS owner** (it changes what Results grades). Protected-workflow review |
| 7. Correction disclosure: a per-game/day note and a NOT_SERVED disclosure on the Forecast Record (#1045 has the latter) | Results day page, family pages | UX/Results owner |
| 8. Verify in Production after deploy: picks page W–L, `/results` pooled card, Forecast Record KPIs and `notServed`, family pages, model-health states unchanged | — | — |

**Tests needed (beyond #1045's 8 and #1049's 6):**
- the selector tests in §6.1 (10, written);
- a guard that a served-mode run on an already-graded date writes nothing;
- a workflow guard that served mode refuses on a shallow clone (the code already exits 3);
- a reader test that the `/results` pooled population excludes NOT_SERVED;
- a regression test pinning the new log's `--check` against content-hash provenance.

### 6.1 The proposal prepared here (code and tests only; no data)

**Branch** `claude/mlb-served-revision-proposal`, worktree `/Users/yashwantbalaji/Downloads/gametimepicks-wt/mlb29`.
- **Commit:** `bcac58a407e2454c063f307ba975cc722f380713`.
- **Base:** `8433d82bd9`.
- **Not pushed, no PR.** A push would trigger a Vercel preview build, so pushing is left to the lead.

| File | Change |
|---|---|
| `app/src/lib/mlb/prediction/served-forecast-selector.mjs` (new, pure) | `makeServedRevisionSelector()` wraps #1046's `servedForecastOfRecord`. It returns the served revision or `{refused: {status, reason}}`. Served revisions generated after the **scheduled** start are HELD (`HELD_GENERATED_AFTER_SCHEDULED_START`) unless `allowGeneratedAfterScheduledStart`, which awaits the #1049 approval. `candidatesForGame()` keeps the earliest revision per content hash |
| `app/src/lib/mlb/prediction/grade-games.mjs` | `gradeDate({ selectRevision })` is optional. Refusals go to `skipped.notOfRecord`: never graded, never a loss, never relabelled as a missing artifact. **Without it, behaviour is unchanged** |
| `app/scripts/mlb/grade-game-predictions.mjs` | `--forecast-of-record served --deployments <file> [--first-pitch <file>]`, with the GitHub clock −600/+60 s and FAILURE/ABANDONED distrusted for 1 h by default. Served mode loads committed revisions **and** snapshots. Default `newest-generated`, so the default output is byte-identical |
| `app/src/lib/mlb/prediction/served-forecast-selector.test.mjs` (new, 10 tests) | Default rule unchanged; the 823579 shape (outcome flips); NOT_SERVED; AMBIGUOUS_NEAR_CUTOFF; untrusted FAILURE; EVIDENCE_GAP refuses and then grades once covered; the 824424 HELD shape; frozen copy → earliest; candidates exclude unavailable or hashless rows; append-only |

**Validation:**
- `npx tsx --test` over `src/lib/mlb/prediction/*`, `publication-evidence/*` and `ops/*`: **452 pass**. The 2 failures are environmental: `js-yaml` is absent because the worktree has no `node_modules`.
- **Real-history check** (scratchpad `verify-selector.mjs`): every game in the exact Vercel window was re-graded through `gradeDate` + the selector, as if ungraded.
  - 353 graded: 332 identical to the stored grades, plus 21 from the served revision (2 of those identical in content).
  - Refused: 4 NOT_SERVED, 13 AMBIGUOUS_NEAR_CUTOFF, 2 BUILD_UNREADABLE, 1 HELD (824424).
  - **0 mismatches against the classification.**
- No build was run.

**Not included (needs decisions or other owners):**
- workflow wiring;
- probes;
- adding evidence fields to graded rows: that is a schema change, and #1049's `timing`/`publicationEvidence` is the place for it;
- content invariance in the resolver;
- any restated output.

No restated data was generated beyond the read-only scenario metrics in the scratchpad.

## 7. Caveats

- **GitHub is blind to CLI deploys and redeploys** (#1046 found 3 + 6 in Sep–Oct). Rollbacks and alias changes are invisible without live probes. Any served determination from GitHub-only evidence carries that limit.
- **The August games (79 EVIDENCE_GAP and most ambiguous ones) can never be verified** from deployment records alone. Short of new evidence, the only decisions are to keep them as graded and flagged (#1045) or to exclude them (strict).
- **The scenario metrics are computed from the committed logs** with Production's grading and health functions. The Forecast Record ECE and calibration tables were not recomputed.
- **The "content invariance" analysis** depends on my enumeration of possible serving builds under the stated clock model. It is an analysis result, not a verification under the current resolver.

## 8. Artifacts (scratchpad `mlb29/`)

`evidence/` (fresh captures) · `shadow/` (3 shadow runs + `classification-2026-10-17.json`) · `per-game-compare*.json` · `metrics-2026-10-17.json` · `verify-selector.json` · scripts `compare.mjs`, `metrics.mjs`, `verify-selector.mjs`, `summarise.py` · `src/` (copies of the 10-10 classification, the #1045 log and the reconciliation, for diffing).
