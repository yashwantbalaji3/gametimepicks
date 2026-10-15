# Build-trigger churn: measurement and proposal (2026-10-15)

**Question:** after #1091 (and with #1088 pending), how many Production builds are caused by nothing but clock-driven values (stamps, derived ages)?

## Method (read-only; GitHub statuses plus local git)
- **Window:** 7 days (2026-10-08 05:56Z → 10-15 05:58Z). That gives 425 commits that Vercel actually built ("Deployment has completed"), and 424 consecutive built ranges.
- **Ranges, not commits:** each build covers every change since the previous build, so each range `prev..this` is compared as a whole.
- **Build inputs:** the ignore step's set (`app/` minus `ops/`, the #1091 globs, data projections, read internal paths).
- **Normalisation:**
  - drop exact stamp keys (`generatedAt`, `gradedAt`, `settledAt`, `checkedAt`, `builtAt`, `lastRunAt`, `updatedAt`, `capturedAt`, `asOf`, `etTime`) and `priceAgeDays`;
  - rewrite `<n.n> days old` prose;
  - an added projection revision `<date>.rN.json` is churn when it equals the previous revision after normalisation.
- **Script:** `churn.py` in this folder.

## Result
| Scenario | Avoidable builds (7 d) | Per day |
|---|---|---|
| Only stamps / derived ages changed in the range | 37 of 424 (9%) | ≈ 5.3 |
| … plus `admin/status.json` as non-input (#1088) | 37 (9%) | ≈ 5.3 |
| … plus every `admin/*` file (upper bound, no reader trace) | 42 (10%) | ≈ 6.0 |

- **Value:** about 5 builds a day × ≈ 45 CPU-min × $0.0035/CPU-min ≈ **$0.8/day, ≈ $24/month**. This is an estimate at the COST-001 rate.
- **The admin files are not the lever.** Real changes accompany them in almost every range.
- **What justifies most builds:** the first real change in a range is most often an admin file, MLB prediction snapshots, NFL forecasts, lane files, NBA finals, weather or MLB simulations. Those are real data.

## Related fixes already drafted
- **#1101** stops settled history being restamped: 380–386 files per settle run. That reduces changed files, not build count.
- **#1109** stops the clock-only Results projection restatements ("3.9 → 4.0 days old").
- **#1088** gates MLB stamp-only runs: about 9.5 builds a day by its own replay. These estimates overlap partly with the 9% above.

## Proposal (not built)
Generalise the #1088 pattern from two MLB workflows to the deploy trigger:
1. In the ignore step, a build-input JSON whose diff against the deployed SHA is stamp-only after normalisation does not count as a change.
2. Each normalised key needs a **reader trace**, as #1088 did. A stamp that a public page shows as freshness must still build.
3. A **staleness bound** (for example 6 h) forces a build, so displayed "as of" times can't drift unboundedly.
4. **Fail-safe:** any parse error or unknown file builds.

**Cost:** the ignore step parses JSON for changed files only; that's seconds. **Risk:** hiding a real freshness change. It's mitigated by the reader trace and the bound.

**Recommendation:** after #1088 has run for a few days, measure the remaining churn again before building this. The overlap with #1088 could cut the 5.3/day considerably.
