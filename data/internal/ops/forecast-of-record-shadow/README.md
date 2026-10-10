# Served forecast of record: evidence, verification tiers, and the workflow proposal (TRUTH-001, founder decisions 2 + 3)

**The rule (Option B):** the official public forecast is the revision **demonstrably served before the real start**. Generation time is not publication. A commit is not publication. A deployment timestamp alone is not publication either: a revision counts only when the **artifact identity** served by that deployment's build is established, i.e. the build's dated predictions file carries that game with the same content hash.

**This package changes nothing:** no grade, no ledger row, no Results surface, and the Production grader is not switched. It uses only read-only evidence: GitHub's existing deployment statuses, MLB StatsAPI (free), and #1042's committed Vercel capture. It adds no credential.

## What is here

| Piece | Path |
|---|---|
| Pure resolver (14 fixture tests) | `app/src/lib/publication-evidence/served-revision.mjs` |
| GitHub Production deployment record | `app/scripts/ops/capture-github-production-deployments.mjs`, output in `data/internal/ops/production-deployments/` |
| Actual first pitch | `app/scripts/mlb/capture-mlb-actual-first-pitch.mjs`, output in `data/internal/mlb/actual-first-pitch/` |
| Shadow over graded MLB games | `app/scripts/mlb/shadow-served-forecast-of-record.mjs`, output in `github-conservative/`, `github-typical/`, `vercel-exact/` |
| Per-game classification (best evidence) | `app/scripts/mlb/classify-forecast-of-record.mjs`, output in `classification.json` |

## How each required case is handled

| Case | Handling (resolver) | Fixture |
|---|---|---|
| **Actual game start** | Cutoff = start of the interval the true first pitch lies in. Source: StatsAPI play-by-play, first `isPitch` event, ms timestamp, taken as [t − 10 s, t] because it is the recorded time. It is checked against the feed's rounded minute, and the minute ±60 s is the fallback. With no start at all the result is `NO_START_TIME`; no time is invented | minute / interval start, rain delay |
| Revised / earlier start | With no actual start, the **earliest** scheduled start ever seen is used | revised start |
| **Delayed deployment** | A deployment READY after the start serves nothing before it | 2026-09-27 shape |
| **Canceled or failed deployments** | Only READY deployments serve. GitHub INACTIVE-only records (Vercel: canceled ignored builds) are trusted as not serving | failed / canceled |
| **Untrusted states** | GitHub FAILURE or status-less records within 60 min of the start → `AMBIGUOUS_DEPLOYMENT_STATE`. One FAILURE and both status-less records on the checked window were in fact READY on Vercel | untrusted state |
| **Overlapping deployments** | The last one **READY** before the start serves, not the last one started | overlapping |
| **Rollbacks / alias changes** | Not visible in any deployment record. A live probe that saw a different build gives `PROBE_CONFLICT` (fail closed). No historical probes exist; the workflow must add them | rollback |
| **Late forecast revisions** | Generated before the start but deployed after it: never of record | late revision |
| Served bytes generated at/after the start | `SERVED_AFTER_GENERATION_CUTOFF` | — |
| **Missing evidence** | `EVIDENCE_GAP` (record not covering the start), `BUILD_UNREADABLE` (no dated file in that build), `SERVED_UNMATCHED`. Never a loss and never a guess | fails closed |
| **Already frozen forecasts** | A carried frozen copy has the same bytes, so it maps to the **earliest** revision with those bytes, which is the original pregame forecast | frozen |
| Record clock uncertainty | A deployment whose true READY could fall on either side of the start interval → `AMBIGUOUS_NEAR_CUTOFF` | ambiguous, asymmetric clock |

## What GitHub can verify confidently, and what stays ambiguous

GitHub's record was checked against #1042's Vercel API capture over their common window (Sep 1 00:24Z to Oct 8 23:50Z, 2,544 git deployments):

| Finding | Effect |
|---|---|
| Coverage matches: every Vercel READY git deployment has a GitHub READY with the same commit | GitHub sees **git** deployments |
| GitHub does not see CLI deployments (3) or redeploys (6) as separate records | Blind spot. No graded game started while one of them was serving (Sep–Oct); before Sep 1 this is unknown |
| Recorded READY time: 2,483 within 1 s; 60 late by 10 s to 7 min (mostly 2026-09-18); 1 early by 19 s | The clock is reliable only with **−600 s / +60 s** margins |
| 1 deployment READY on Vercel is FAILURE on GitHub; 2 status-less GitHub records were READY | FAILURE / status-less records near a start are distrusted |
| No GitHub records before 2026-07-31 22:07Z | Games before then: `EVIDENCE_GAP` |

**Verdict:**
- GitHub can confidently verify a game only when **no deployment was recorded READY from 60 s before the start's interval to 10 minutes after it**, and no distrusted record falls within 60 minutes. That holds for **241 of 437 games** outside the exact record's window.
- The rest stay ambiguous, because deployments cluster at game times (lineup refreshes).
- Where both records resolve, GitHub and Vercel name **the same served forecast in every case**: 139 games under the conservative clock, 284 under the typical one.

## Classification of the 810 graded games (best evidence per game)

Rule: the exact (Vercel) record inside its window, GitHub's conservative clock elsewhere, and the play-by-play first-pitch interval as the start.

| Class | Exact record (373 games, Sep 1 – Oct 8) | GitHub conservative (437 games) | Total |
|---|---|---|---|
| VERIFIED: the graded revision **is** what the site served | 332 | 241 | **573** |
| **VERIFIED: a different revision was served** | **22** | 0 | **22** |
| **VERIFIED: never public** (the serving build showed the game unavailable) | **4** | 0 | **4** |
| UNVERIFIED: ambiguous near the start | 13 | 117 | 130 |
| UNVERIFIED: evidence gap (before GitHub's record) | — | 79 | 79 |
| UNVERIFIED: build unreadable | 2 | — | 2 |

**The 22 verified different-revision games:**
- **11 are from Stage A (#1042):** 822763, 823413, 823491, 823731, 823814, 824055, 824217, 824304, 824305, 824545, 824628.
- **11 are new:**
  - 2026-09-04: 823579, 823824, 824424, 824471
  - 2026-09-06: 823417, 823578, 823822, 824385
  - 2026-09-15: 825030
  - 2026-09-23: 823168
  - **2026-10-07: 849822.** The grader's current rule is still choosing forecasts the public never saw.

**The 4 verified never-public forecasts:** 824226 (2026-09-09), 824381 and 824546 (2026-09-20), 823653 (2026-09-26).

**Changes from the first shadow** (which used scheduled starts):
- **Using the actual first pitch changes cases.** 483 of the 810 games started later than scheduled and 8 earlier.
- **Three Stage A proposals are no longer verifiable:** 823084, 823650, 824542. On 2026-09-27, a deployment became READY at 19:11:39Z, inside the first-pitch interval of those games, so whether it served first cannot be decided. **They must not be applied.** Under fail-closed they stay as graded, flagged unverified.
- **The two "never public" games reported earlier** (824387, 823246) resolve differently once their real (later) first pitch is used. They are no longer in that class.
- **The six August discrepancies** found under scheduled starts and GitHub's typical clock **cannot be verified** under GitHub's conservative clock. Four of them still differ under the typical clock (822771, 823581, 823662, 823744); that is a hint only, never a verification.

The earlier "29 discrepancies / 2 never public" figures are **superseded** by this table.

## Proposed workflow (approval needed; nothing is wired)

1. **Deployment record:** run `capture-github-production-deployments.mjs` with the repository's GitHub token (`deployments: read`, no new secret), staged in the host's existing commit (see the OPS-002 constraints below).
2. **Live probes:** each refresh run fetches Production `build-info.json` and the dated predictions file, recording probe time, served commit and each game's served `artifactHash`. This is direct evidence of what the public saw. It is the only defence against rollbacks and alias changes, and it resolves near-start ambiguity: a probe just before the start that shows the serving build settles it.
3. **Actual start:** run `capture-mlb-actual-first-pitch.mjs` after each final (StatsAPI, free).
4. **Grader switch:** the MLB grader asks the resolver and **refuses to grade** on any non-SERVED status. The game is listed with its reason, never counted as a loss or a zero. This changes what Results grades: it is a Results/OPS-owner change plus a founder decision, and it is not made here.

## OPS-002 review (2026-10-10): constraints on wiring

The OPS-002 owner found no collisions and no objection in principle. These constraints bind any implementation:

1. **No standalone commits.** Every push to main creates a Production deployment. Even when the Ignored Build Step skips the build, the clone bills about 16 CPU-min (≈ $0.056); hourly standalone commits would cost about $40/month. Evidence files must be **staged in the host workflow's existing commit**. If nothing else is being pushed, keep them as an Actions artifact and commit at most once a day inside an existing commit. *(This corrects the earlier "causes no builds" wording: `data/internal/ops/` avoids the build, not the deployment cost.)*
2. **Identity and subject guards.** Workflow commits must use `github-actions[bot]` (`bot-commit-identity.test.mjs`), and subjects must match `^auto[:\- ]` (`ops-002-acceptance.test.mjs`). The OPS-002 seven-day acceptance runs through 2026-10-15.
3. **`deployments: read` must be granted explicitly** on the host job, which already declares `permissions:`. The capture now **exits 3 with `EVIDENCE_GAP` and writes nothing** on any read failure, rather than recording an empty list.
4. **Scheduler gaps.** Overnight there were no scheduled runs from 02:50Z to 05:56Z on 10-08, and crons slip 10–60+ min. Late postseason first pitches sit next to that window, so a pre-start probe can be missing. Missing probes are `EVIDENCE_GAP`, and **a probe is never backfilled after the start.**

**Recommended hosts:**
- **Live probes and the deployment capture:** `mlb-pregame-capture.yml` (11, 15, 17, 19, 21, 23Z, plus 22:30Z and 01:00Z, in its own concurrency group). Its commit step is path-asserted to `data/internal/mlb/pregame-archive/` (`mlb-pregame-commit-persistence-guards.test.mjs`). So either write probe records under that tree, or extend the assert and the guard deliberately in the same PR. Never loosen it to `data/internal/**`.
- **Actual first pitch:** the nightly window, riding the existing commit.
- **Not suitable as hosts:** `mlb-daily-production` (money-safe path scope) and `publication-watchdog` (read-only).

**Monitoring:** report the daily rate of each non-SERVED reason (`AMBIGUOUS_*`, `EVIDENCE_GAP`, …), so a silent capture failure shows up as a rising rate rather than quiet ungraded games.

## If a read-only Vercel credential is wanted (not requested yet)

It would turn most of the 130 ambiguous games into verified ones for the future, and make CLI deploys and redeploys visible.

| Question | Answer |
|---|---|
| API permission | `GET /v6/deployments?projectId=<id>&target=production` and `GET /v13/deployments/<id>` (read). **Vercel access tokens are not read-only:** a token carries its creator's permissions within its scope. Least privilege is a token scoped to the one team, with an expiry, created by a member with the narrowest available role |
| Storage | A GitHub Actions secret (`VERCEL_EVIDENCE_TOKEN`), bound to a protected GitHub Environment used by one job only. Never exposed to `pull_request` workflows or forks |
| Workflow | One scheduled capture job (the step in item 1, plus a Vercel read). Nothing else reads it |
| Cost | Vercel API reads carry no charge on the current plan within rate limits; a few Actions minutes a day; no Vercel builds |
| Restriction and rotation | Expiry ≤ 90 days, rotated on a calendar reminder, revoked immediately on any exposure; usage visible in Vercel's audit log |
| Failure effect | A failed capture is an `EVIDENCE_GAP` for the affected games. The resolver fails closed, so they stay ungraded with a stated reason, never losses. An ops alarm fires, and grading of other games is unaffected |

The live probes (item 2) need **no** credential and close part of the same gap. They are recommended first.
