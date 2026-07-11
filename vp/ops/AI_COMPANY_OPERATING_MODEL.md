# GameTime Picks — AI Company Operating Model v1

**Maintained by:** Claude (VP of Product & Operations) · **v1 — 2026-07-06** · design (not yet implemented in repo)
**Purpose:** give every AI employee clear **ownership, schedules, and reporting lines** across two operating departments (Sports Operations, Social/Growth) plus the shared-service function pool — schedule-driven, honesty-gated, founder-controlled.

**Non-negotiable rules baked in:** no betting hype · no real-money claims · one canonical bankroll ⇒ **settlement is serial, never parallel** · sport analysts recommend cards but **cannot approve cards or move money** · **no social employee posts automatically** — social drafts → Social Media Head → Yash until the system matures · Claude Code stays the execution layer · Cowork coordinates, Code executes, Founder decides.

---

## A. Org chart

```
FOUNDER — Yash
  │  (the only one who: approves cards · approves weight changes · approves deploys · approves public brand direction)
  │
VP of Product & Operations — Claude (Cowork)
  │  (product org, planning, cross-department coordination, knowledge base, founder briefs)
  │
  ├── SPORTS OPERATIONS DEPARTMENT
  │     Sports Operations Lead (SOL)
  │       ├── Soccer Analyst        · ACTIVE  (World Cup — flagship)
  │       ├── Baseball Analyst      · ACTIVE  (MLB — post-WC flagship)
  │       ├── Basketball Analyst    · STANDBY (NBA off-season)
  │       ├── Hockey Analyst        · STANDBY (NHL — provider onboarding)
  │       ├── Football Analyst      · STANDBY (NFL — preps for fall)
  │       └── future sport analysts · as sports are added
  │
  ├── SOCIAL MEDIA / GROWTH DEPARTMENT
  │     Social Media Head
  │       ├── Discord Manager       · ACTIVE
  │       ├── Instagram Manager     · ACTIVE
  │       ├── TikTok Manager        · ACTIVE
  │       ├── X / Twitter Manager   · ACTIVE
  │       ├── Content Repurposing / Clips · STANDBY (activate when volume warrants)
  │       └── Community Engagement  · STANDBY (activate at audience scale)
  │
  └── SHARED SERVICES (function pool — drawn on-demand by both departments)
        Product Manager · QA Engineer · Data Engineer · Launch Manager ·
        UI/UX Designer · Content Analyst · Quant / Model Analyst

EXECUTION & ADVISORY LAYER (cross-cutting, not a department)
  • Claude Code — engineering execution (runs scripts, gates, deploy). Every department hands mutations here.
  • Claude Chat / GPT — strategy & prompt-crafting support (advisory).
```

**How the axes compose:** Sports Ops and Social/Growth are the two **line departments** that produce the product and the audience. Shared Services are **functions** either department can requisition. Claude Code is the shared **execution engine**. The Founder holds the four approval gates.

---

## B. What each employee owns

**Line — Sports Operations**
| Employee | Owns |
|---|---|
| Sports Operations Lead | The daily end-to-end sports operation: settlement *sequencing* (serial money writes), generation sequencing, cross-sport consistency, the money-gate suite, product readiness, Go/No-Go, the Code handoff, and the founder brief. |
| Soccer Analyst | Soccer (WC) settlement, model review, generation, readiness, card recommendation. The crown-jewel settlement path. |
| Baseball Analyst | MLB settlement, model review, generation, readiness, card rec; owns the MLB-into-/results + MLB-parlays gaps. |
| Basketball / Hockey / Football Analysts | Their sport's full charter when ACTIVE; when STANDBY, own readiness prep (source, settlement policy, market list). |

**Line — Social / Growth**
| Employee | Owns |
|---|---|
| Social Media Head | The brand voice + weekly content calendar; reviews and merges every manager's drafts into an approval packet for Yash; nothing public without Yash's sign-off (until mature). Owns responsible-copy enforcement on all social. |
| Discord Manager | Discord content drafts (slate drop, results recap), moderation policy drafts, member Q&A prep. |
| Instagram Manager | IG post + story drafts (results graphics, slate highlights, milestone cards). |
| TikTok Manager | Short-form clip concepts/scripts drafts (notable results, "how the model called it"). |
| X/Twitter Manager | X post drafts (slate, results, honest track-record milestones, threads). |
| Content Repurposing / Clips (standby) | Turn one asset into many across channels once volume warrants. |
| Community Engagement (standby) | Reply/DM/comment drafts + community health at audience scale. |

**Shared Services** (unchanged charters): Product Manager (product status + daily card assembly), QA Engineer (render/route audits), Data Engineer (odds/props/schedules freshness), Launch Manager (deploy/verify/release notes), UI/UX Designer (nav/cards/mobile), Content Analyst (on-product copy honesty), Quant/Model Analyst (settled-only learning discipline the sport analysts inherit).

---

## C. What each employee does DAILY

**Sports Operations**
- **SOL:** collect sport standups; sequence settlement by finality time (money-gate between applies); unify Top 10; assemble the card proposal for Yash; commission QA; confirm gates; send the Sports Ops Daily Brief + single next action.
- **Soccer / Baseball Analyst (ACTIVE):** prepare official settlement (hand-verify each leg vs official final); write `MODEL_REVIEW_<sport>_<date>.md`; generate next slate; flag missing data + stale products; recommend a card or honest no-play; send standup to SOL.
- **Basketball/Hockey/Football (STANDBY):** none daily beyond confirming their sport stays honestly gated (off-season/onboarding); readiness prep is weekly.

**Social / Growth** (all drafts only — no auto-posting)
- **Social Media Head:** pull the day's honest facts from the Sports Ops Daily Brief (record, notable calls, milestones); assign angles; collect manager drafts; run responsible-copy check; send one approval packet to Yash.
- **Discord Manager:** draft the morning slate-drop post + evening results recap; draft moderation responses for anything flagged.
- **Instagram Manager:** draft one post (results graphic or slate highlight) + optional story.
- **TikTok Manager:** draft a clip concept only on days with a notable, honest story (not forced daily).
- **X/Twitter Manager:** draft 1–3 posts (slate AM, results PM, milestone when real).

**Shared Services (as requisitioned):** QA runs the render/route audit before any deploy; Data Engineer confirms freshness; Launch Manager verifies the deploy + smoke; others on-demand.

---

## D. What each employee does WEEKLY

- **SOL:** cross-sport performance roll-up; readiness review of standby sports; propose the week's sports priorities to the VP.
- **Sport Analysts:** a weekly settled-sample review (calibration by market for their sport); STANDBY analysts do readiness prep (source/policy/market list) and report a go-live gap list.
- **Social Media Head:** build next week's content calendar (themes, cadence, channel mix); a weekly growth report (reach, follows, engagement, what landed) to the VP; propose brand experiments for Yash.
- **Channel Managers:** review their channel's week (top/bottom posts), propose next week's angles, flag community sentiment.
- **Shared Services:** Quant writes the monthly calibration input weekly-incrementally; QA a full route sweep; UI/UX a prioritized fix list; Content Analyst a banned-copy sweep across product + social.
- **VP (me):** the Monday strategic review (state of product → parallel department reviews → prioritize → decisions → plans for Code), per `ops/OPERATING_CADENCE.md`.

---

## E. Exact schedules / cadence (ET)
Anchored to the existing automation (nightly-settle 1:30 & 3:30 AM, daily-lifecycle 4:30 AM, morning-projections 9:30 AM). Money steps stay operator-gated.

| Time (ET) | Cadence | Activity | Owner | Gate / approval |
|---|---|---|---|---|
| After last game final (≈10:00 PM–1:30 AM) | Nightly | **Settlement** — per finished sport: analyst hand-verifies → SOL sequences `--apply` (serial) → money gate between each | Sport Analyst prep → **SOL sequences** → Code applies | Money-integrity + forensic between applies; **serial only** |
| ~1:30 & 3:30 AM | Nightly (auto backstop) | `nightly-settle.yml` passes (completeness/repair) | Code (CI) | Fail-closed |
| Immediately post-settle | Nightly | **Model review** per sport (`MODEL_REVIEW_<sport>_<date>.md`) | Sport Analyst | Weight change → **Yash** ("justified or overfitting?") |
| ~4:30 AM | Nightly (auto) | Daily rebuild / lifecycle (once deploy-hook secret set) | Code (CI) | Money-gated; deploy opt-in |
| ~9:30 AM | Morning | **Generation / refresh** next slate (per active sport) → Top 10 unify → BB pool | Sport Analysts → **SOL** → Code | Money-md5 unchanged |
| ~10:00–10:30 AM | Morning | **Product proposal review** — SOL assembles card; **Yash approves** a card or confirms no-play | SOL proposes → **Yash approves** → Code promotes | **Card approval = Yash only** |
| Before any deploy | On change | **QA** render/route audit (undefined/NaN/Homer/stale/Pass = 0; money reconciles) | QA Engineer / SOL | Fail → fix before deploy |
| After any product change | On change | **Deploy verification** — build → deploy → smoke 9/9 | Launch Manager / Code | **Never deploy red**; ship = Yash |
| ~11:00 AM (after slate set) | Daily | **Social content planning/drafting** — Head assigns angles from the Daily Brief; managers draft | Social Head + managers | Draft only |
| Morning + evening | Daily | **Discord** slate-drop (AM) + results recap (PM), moderation drafts | Discord Manager → Head → **Yash** | No auto-post |
| ~12:00–1:00 PM | Daily | **Instagram** 1 post (+ optional story) drafted | IG Manager → Head → **Yash** | No auto-post |
| After notable results (PM) | 3–5×/week | **TikTok** clip concept drafted | TikTok Manager → Head → **Yash** | No auto-post |
| AM slate + PM results + milestones | 1–3×/day | **X/Twitter** posts drafted | X Manager → Head → **Yash** | No auto-post |
| Monday | Weekly | **Product/Ops performance review** (VP-led) | VP + departments | Decisions logged |
| Friday | Weekly | **Growth review** + next week's calendar | Social Head → VP → Yash | Brand direction = Yash |

*Rule of thumb: nightly = settle+learn (serial money); morning = generate+propose+approve+deploy; midday = social drafting; weekly = review + planning.*

---

## F. Reporting lines
- Sport Analysts → **Sports Operations Lead** (daily standup format).
- Channel Managers → **Social Media Head** (daily drafts + weekly channel review).
- Sports Operations Lead & Social Media Head → **VP of Product & Operations (Cowork)**.
- Shared Services → requisitioning department for the task; **VP** for functional direction.
- VP → **Founder (Yash)**.
- Escalation path: analyst/manager → department head → VP → Founder. The four founder gates never delegate downward.

---

## G. Approval gates — employee-can vs Yash-only
| Action | Employees can | **Yash only** |
|---|---|---|
| Prepare/hand-verify settlement | ✅ (analyst) | — |
| Apply money `--apply` | Sequenced by SOL, executed by Code | *(gated behind official settlement; no discretionary money moves)* |
| Approve a Bank Builder / Moonshot card | Recommend only | ✅ **approve / no-play** |
| Change model weights | Propose (labeled) | ✅ **approve** |
| Deploy to public | Prepare + gate green | ✅ **ship** |
| Publish any social post | Draft → Head reviews | ✅ **approve public brand + posts** (until mature) |
| Set public brand direction / positioning | Propose | ✅ **approve** |
| Add/activate a new sport or channel | Propose readiness | ✅ **activate** |

Everything not in the right column, employees own end-to-end up to the gate. Nothing bypasses: no money outside official settlement, no auto social posting, no deploy red.

---

## H. Cowork coordinates vs Claude Code executes
| Layer | Role | Examples |
|---|---|---|
| **Founder (Yash)** | Decides | approve card · weight change · deploy · brand direction |
| **Cowork / VP + agents** | Coordinate & decide *what/when/order* | analysts' hand-verification, reviews, readiness; SOL's settlement/generation sequencing + briefs; Social Head's calendar + approval packets; VP's plans and this model |
| **Claude Code** | Execute mutations | `settle_soccer_day.sh --apply`, `refresh_daily_products.sh`, `promote-bank-builder-proposal.mjs`, `npm run build`, smoke, `git push`, and (later) any social-scheduling tooling |
| **Claude Chat / GPT** | Advise | pressure-test strategy, draft/critique prompts |

Cowork never moves money or posts publicly; Code never invents a sequence, a result, or a public post.

---

## I. What to implement in repo docs/agent files
(Full spec in `vp/plans/0005-ai-company-operating-system.md` — docs-only.)
- `agents/sports-operations-lead/` + `agents/{soccer,baseball,basketball,hockey,football}-analyst/mission.md` (from Plan 0004).
- `agents/social-media-head/` + `agents/{discord,instagram,tiktok,x-twitter}-manager/mission.md` + standby `agents/{content-repurposing,community-engagement}/mission.md`.
- `docs/AI_COMPANY_OPERATING_SYSTEM.md` (org chart + schedules + gates index), `docs/SPORTS_OPERATIONS.md`, `docs/SOCIAL_OPERATIONS.md`, `docs/SPORT_STANDUP_TEMPLATE.md`, `docs/SOCIAL_DRAFT_TEMPLATE.md`, `docs/COMPANY_SCHEDULE.md` (the §E table).
- `agents/README.md` org chart; cross-links from `docs/CLAUDE_TEAM_OPERATING_SYSTEM.md`.
- Guardrail note in every social mission: **draft-only, Head-reviewed, Yash-approved; no auto-post; no hype/real-money claims.**

## J. Plan 0004 → fold into Plan 0005 — YES
Recommend **merging Plan 0004 into Plan 0005**. Rationale: 0004 (sports hierarchy) and the new social/growth + company index are the *same kind of change* (docs-only agent scaffolding), share the `agents/` + `docs/` surface, and are cleaner shipped as one coherent "Company OS v1" commit than two overlapping ones. Plan 0004 is marked **superseded by 0005**; its sports-mission content is carried into 0005 verbatim so nothing is lost. (If you'd rather ship sports first and social later, 0005 is written in two phases so Code can stop after Phase 1 = the 0004 content.)

## K. Implementation plan
See `vp/plans/0005-ai-company-operating-system.md`.

---

## Design principles
- **Two line departments, one function pool, one execution engine.** Clear ownership without duplicating people.
- **Schedule-driven.** Every recurring action has a time, an owner, and a gate.
- **Serial money is sacred.** The SOL exists largely to sequence it.
- **Honesty scales by delegation.** Every analyst inherits settled-only discipline; every social manager inherits responsible-copy discipline.
- **Founder controls stay put.** Cards, weights, deploys, and brand direction remain the four human calls.
- **Standby ≠ idle.** Off-season sports and unactivated channels do readiness prep so activation is a switch.
