# Served forecast of record: evidence, shadow results, and the workflow proposal (TRUTH-001, founder decision 4)

**The rule (Option B):** the official public forecast is the revision **demonstrably served before the real start**. Generation time is not publication. A commit is not publication. This package builds the evidence layer, measures it against history, and proposes the workflow.

**It changes nothing:** no grade, no ledger row, no Results surface. The grader is not switched. Production integration needs founder approval and coordination with the shared Results/OPS owner.

## What is here

| Piece | Path |
|---|---|
| Pure resolver | `app/src/lib/publication-evidence/served-revision.mjs` (+ tests) |
| Deployment record from GitHub, no new credentials | `app/scripts/ops/capture-github-production-deployments.mjs`, output in `data/internal/ops/production-deployments/` |
| Shadow over graded MLB games | `app/scripts/mlb/shadow-served-forecast-of-record.mjs`, output in `github/` and `vercel/` here |

**The resolver, per game:**

- **Cutoff:** the actual start if known. Otherwise the **earliest** scheduled start ever seen, so a schedule moved earlier cannot let a later revision count. With no start time at all the result is `NO_START_TIME`; no timestamp is ever invented.
- **What served:** the build of the **last** Production deployment that became READY before the cutoff. Failed, canceled and never-READY deployments serve nothing, and overlapping builds are ordered by READY time, not start time.
- **Forecast of record:** the revision whose content hash equals what that build served, provided it was generated before the cutoff.
- **Fields recorded:**
  - `generatedAt`;
  - `frozenAt`;
  - `publishedAt`: the READY time of the first deployment in the unbroken run that served those bytes;
  - `deploymentReadyAt`;
  - the cutoff and its basis;
  - `modelVersion`, `forecastVersion` and content hash.

**It fails closed with a status, never a guess:**
- `EVIDENCE_GAP` and `BUILD_UNREADABLE`;
- `NOT_SERVED` and `SERVED_UNMATCHED`;
- `SERVED_AFTER_GENERATION_CUTOFF`;
- `AMBIGUOUS_NEAR_CUTOFF`: a READY time within the record's clock uncertainty of the start;
- `PROBE_CONFLICT`: a live probe saw a different build, e.g. after a rollback or alias change, or because a deployment is missing from the record.

## Is the GitHub deployment record good enough?

Vercel's GitHub integration writes a GitHub Deployment for each Production deploy. The repository token can read it, so no Vercel token is needed. It was checked against the Vercel API capture from #1042 over their common window (2026-09-01 00:24Z to 2026-10-08 23:50Z):

- **Coverage matches.** Every Vercel READY git deployment has a GitHub READY with the same commit, except one (below), and vice versa. The 68 GitHub-only deployments all fall outside the Vercel capture's window. Vercel redeploys reuse the original GitHub record.
- **Timing is usually exact, but not always.**
  - 2,483 of 2,544 matched deployments are within 1 second; GitHub stores whole seconds.
  - 60 are recorded **late**: by more than 10 seconds and up to 7 minutes, mostly on the evening of 2026-09-18.
  - One is recorded **19 seconds early**.
  - One deployment Vercel reports READY (2026-09-18 20:14Z) is a **FAILURE** on GitHub.
- **Verdict:** GitHub alone is good evidence away from the start, but not near it, and it can mislabel a state. The resolver therefore treats READY times within ±60 s of the start as `AMBIGUOUS_NEAR_CUTOFF`. The production workflow should add the two checks below.
- **Where both resolve, they agree.** The shadow on both records names the **identical served forecast for all 332 games** that both resolve.

**History of the record:** GitHub holds no Production deployments before 2026-07-31 22:07Z. The 79 graded games from 2026-07-24 to 07-31 are therefore `EVIDENCE_GAP`, refused rather than guessed.

## Shadow results: what the rule finds in the graded MLB record

| | GitHub record, ±60 s (all 810 graded games) | Vercel record, ±5 s (373 games, Sep 1 – Oct 8) |
|---|---|---|
| Served forecast resolved | 671 | 368 |
| … and it **is** the graded revision | 643 | 345 |
| … and it is **not** the graded revision | **28** | **23** |
| Graded, but the serving build showed the game **unavailable** | **2** | **2** |
| Ambiguous near the start | 53 | 1 |
| Build content unreadable (no dated file in that commit) | 5 | 2 |
| No evidence (before GitHub's record begins) | 79 | — |

**29 distinct graded games** were graded from a revision that was not what the site served. That is the union of both records: 28 from GitHub plus 822763, which only the Vercel record resolves.

- **14** are #1042's Stage A proposals. All 14 are reproduced independently by the Vercel record and 13 by GitHub; 822763 is ambiguous under GitHub's clock.
- **15 are new.** #1042 searched only the 243 games whose public forecast had been erased, so it did not cover these:
  - 2026-08-27: 822771, 823581, 824879
  - 2026-08-28: 823744
  - 2026-08-30: 823662, 823740
  - 2026-09-04: 823579, 823824
  - 2026-09-06: 823417, 823578, 823822, 824385
  - 2026-09-15: 825030
  - 2026-09-23: 823168
  - **2026-10-07: 849822.** This one is recent: the grader's "newest revision generated before first pitch" rule is still choosing forecasts the public never saw.
- **2 graded forecasts were never public:** the site showed the game unavailable at first pitch (824387 on 2026-09-04, 823246 on 2026-09-27). Each was graded from a snapshot generated 1–2 minutes before first pitch.

Consequences:
- Stage B (#1045) currently covers the 14. It must be **extended to the full verified set before anything is applied.** That means re-generating its reconciliation from this resolver with the authoritative record. The 2 never-public forecasts need a decision of their own: removal from the public record, not substitution.
- The 53 ambiguous games and the 79 July games stay as graded and flagged until better evidence exists. They are not silently counted either way.

## Proposed workflow (needs approval; nothing is wired)

1. **Capture the deployment record continuously.** A small step in an existing scheduled workflow runs `capture-github-production-deployments.mjs` (GitHub token, no new secret) and appends to `data/internal/ops/production-deployments/`. That path is internal and not a Vercel build input. *Optional, needs founder approval for a credential:* a read-only Vercel token adds the exact READY times and states, which closes the ±60 s ambiguity and the FAILURE/READY mismatch.
2. **Live probes.** Each refresh run fetches `https://gametime-picks.vercel.app/data/build-info.json` and the dated predictions file. It records the probe time, the served commit and each game's served `artifactHash`. That is direct evidence of what the public saw, and it catches rollbacks and alias changes (`PROBE_CONFLICT`).
3. **Actual start times.** After each final, record StatsAPI's `gameInfo.firstPitch` (free, no key) so the cutoff is the real start, not the scheduled one.
4. **Grader switch.** The MLB grader asks this resolver for the forecast of record and refuses (does not grade) on any non-SERVED status, so pending is not a loss and missing is not zero. This changes what Results grades. It is a Results/OPS-owner change and a founder decision, and it is not made here.
