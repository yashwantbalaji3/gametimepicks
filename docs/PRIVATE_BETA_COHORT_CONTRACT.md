# Private beta — cohort contract and access model

**Status: PROPOSED, NOT APPROVED. Nobody has been invited and no invitation may be sent without
explicit founder authorization.** Program 138 · prepared 2026-08-05 · gate `user-validation` = FAIL.

---

## 1. The access model — read this before anything else

GameTimePicks is a **static export**. There is no server, no session, no login, and no way to
authenticate a visitor in application code. That produces exactly two honest options, and one very
tempting dishonest one:

| Option | Genuinely restricted? | Reality |
|---|---|---|
| **A. Observational cohort on the public site** | **No** | Pages stay public; the "cohort" is a set of people the founder invites to look and give feedback. Honest and zero-cost. |
| **B. Vercel Deployment Protection (password)** | **Yes** | Vercel authenticates at the edge before any content is served. Real access control, no application code. Site-wide — the public loses access too. |
| ~~C. Unlisted URL / client-side flag / build-time env~~ | **No** | Would be security theatre. `NEXT_PUBLIC_*` values are baked into the shipped JavaScript; an unlisted route is one `sitemap`/`view-source` away. **Do not use, and do not describe as private.** |

**Recommended: Option A**, stated plainly. The pages a beta tester needs to evaluate — the record,
the methodology, the daily slate — are the same pages the product's credibility rests on being
public. Password-walling them to run a beta contradicts the product's entire transparency claim.

Choose **B** only if the founder wants nothing public at all until launch — that is a different
strategy, not a beta configuration, and it would take the live site down for everyone.

## 2. Proposed cohort

| Field | Proposal | Why |
|---|---|---|
| **Size** | 5–10 people | Below 5, one loud opinion dominates. Above ~10, feedback outruns a solo operator's capacity to act on it, and support has no channel yet. |
| **Window** | 14 days, starting the day support is live | Two weekends: needed because the product's core loop is *daily*, and weekday-only usage would not test return behaviour. |
| **Eligibility** | People who follow sport and have used a sportsbook or fantasy product; **no** requirement to bet | The product is research about betting markets, not a betting product. Testers who never look at odds cannot judge whether the numbers are useful. |
| **Invitation** | Direct, personal, from the founder | No mailing list exists, and building one would require the consent/privacy work that is not done. |
| **Consent** | Explicit at invitation: what feedback is collected, that analytics is day-bucketed and PII-free, that it is paper-only and educational | Must be given *before* they visit if analytics is live. |
| **Feedback destination** | The support channel, once configured | Deliberately the same channel — a beta that routes feedback somewhere else leaves the real support path untested. |
| **Support coverage** | Founder, best-effort, wording per `SUPPORT_READINESS.md` | Do not promise a response time the founder will not meet. |

## 3. Success metrics — defined before the beta, not after

Measured only if analytics is activated; otherwise these are **NOT_MEASURED** and the beta is
qualitative only. That is an acceptable outcome, but it must be stated rather than backfilled.

| Metric | Signal | Honest bar |
|---|---|---|
| **Next-day return rate** | `return_visit.cohortBucket === "next_day"` | The north-star from `ANALYTICS_ACTIVATION_DECISION.md` §2. With ~8 testers this is directional, **not** statistically meaningful — say so. |
| **Core loop completion** | `daily_hub_view` → `game_report_open` | Do people reach the actual value surface, or stop at the hub? |
| **Trust-surface reach** | `results_recap_open`, `learn_surface_view` | Does anyone check the record and the method, or only the picks? |
| **Qualitative** | Feedback messages received | The primary output at this size. |

**Explicit non-goal:** proving the model is profitable. It is not — the measured record is 19–14
paper and Sprint 056/057 established no measurable edge over the market. A beta that concluded
otherwise from 14 days of data would be measuring noise.

## 4. Stop conditions

Halt the beta and notify testers if any occurs:

- a SEV1 from `internal-alpha-day.mjs` (wrong money, wrong settlement, or a stale slate served as current)
- the published record is found to be wrong in a way that changes a settled outcome
- a privacy defect: any event carrying data outside the closed enum reaches the collector
- the daily automation fails to self-recover for two consecutive days
- support volume exceeds what the founder can answer within the stated wording

## 5. Go / no-go checkpoint

Before the first invitation, **all** must hold:

1. Support channel configured **and** a real message delivered and received (config ≠ delivery).
2. Terms and privacy published, or every tester told in writing that neither exists yet.
3. Internal alpha completed its window with no unresolved SEV1.
4. Analytics either activated and staging-proven, **or** consciously left off with metrics recorded
   as NOT_MEASURED.
5. Founder has capacity to answer messages for the full 14 days.

Items 1 and 2 are the real gate. Inviting people before either exists means a tester who finds a
problem has nowhere to report it and no statement of what the site does with their data.

## 6. Acceptance evidence

Cohort size and window recorded · invitation text approved by the founder · consent captured per
tester · feedback destination live and receipt-tested · metrics recorded as measured or explicitly
NOT_MEASURED · stop conditions acknowledged · go/no-go signed with a date.

## 7. FOUNDER ACTION

|  |  |
|---|---|
| **Owner** | Founder |
| **Blocks** | `user-validation` gate; `READY_FOR_PRIVATE_BETA` |
| **Founder time** | ~20 min to approve; then ongoing for the window |
| **Depends on** | support channel (hard), legal (hard, or explicit written disclosure to testers) |

**Recommended:** approve Option A with 8 testers and a 14-day window, starting the day support goes
live. Do not start it before support exists.
