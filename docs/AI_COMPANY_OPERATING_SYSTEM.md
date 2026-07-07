# GameTime Picks — AI Company Operating System v1

*The master index for running GameTime Picks as an AI-operated company: two line departments (Sports
Operations, Social/Growth), one shared-service function pool, one execution engine (Claude Code), and four
founder-only gates. Schedule-driven, honesty-gated, founder-controlled. Derived from
`vp/ops/AI_COMPANY_OPERATING_MODEL.md`.*

## Org chart
```
FOUNDER — Yash
  │  (the only one who: approves cards · approves weight changes · approves deploys · approves public brand)
  │
VP of Product & Operations — Claude (Cowork)
  │  (product org, planning, cross-department coordination, knowledge base, founder briefs)
  │
  ├── SPORTS OPERATIONS DEPARTMENT → docs/SPORTS_OPERATIONS.md
  │     Sports Operations Lead (SOL)
  │       ├── Soccer Analyst        · ACTIVE  (World Cup — flagship)
  │       ├── Baseball Analyst      · ACTIVE  (MLB — post-WC flagship)
  │       ├── Basketball Analyst    · STANDBY (NBA off-season)
  │       ├── Hockey Analyst        · STANDBY (NHL — provider onboarding)
  │       └── Football Analyst      · STANDBY (NFL — preps for fall)
  │
  ├── SOCIAL MEDIA / GROWTH DEPARTMENT → docs/SOCIAL_OPERATIONS.md
  │     Social Media Head
  │       ├── Discord Manager       · ACTIVE
  │       ├── Instagram Manager     · ACTIVE
  │       ├── TikTok Manager        · ACTIVE
  │       ├── X / Twitter Manager   · ACTIVE
  │       ├── Content Repurposing / Clips · STANDBY
  │       └── Community Engagement  · STANDBY
  │
  └── SHARED SERVICES (function pool — requisitioned by both departments)
        Product Manager · QA Engineer · Data Engineer · Launch Manager ·
        UI/UX Designer · Content Analyst · Quant / Model Analyst

EXECUTION & ADVISORY LAYER (cross-cutting, not a department)
  • Claude Code — engineering execution (runs scripts, gates, deploy). Every department hands mutations here.
  • Claude Chat / GPT — strategy & prompt-crafting support (advisory).
```
Sports Ops and Social/Growth are the two **line departments**; Shared Services are **functions** either can
requisition (see [agents/README.md](../agents/README.md)); Claude Code is the shared **execution engine**.

## The four founder-only gates
Everything else, employees own end-to-end up to the gate. Nothing bypasses these:
1. **Approve cards** — analysts recommend a Bank Builder / Moonshot / Top-10 card; **only Yash approves** (or confirms the no-play).
2. **Approve model-weight changes** — a sport analyst proposes (labeled proven/directional/insufficient); **only Yash approves**.
3. **Approve deploy / public ship** — the team prepares + gates green; **only Yash ships**.
4. **Approve public brand direction / posts** — Social drafts → Head reviews; **only Yash approves** the brand and any post.

No money moves outside official settlement · no auto social posting · never deploy red.

## Cowork coordinates vs Claude Code executes vs GPT/Chat advises
| Layer | Role | Examples |
|---|---|---|
| **Founder (Yash)** | Decides | approve card · weight change · deploy · brand direction |
| **Cowork / VP + agents** | Coordinate & decide *what / when / order* | analysts' hand-verification + reviews + readiness; the SOL's settlement/generation sequencing + briefs; the Social Head's calendar + approval packets; VP plans |
| **Claude Code** | Execute repo mutations | `settle_soccer_day.sh --apply`, `refresh_daily_products.sh`, `promote-bank-builder-proposal.mjs`, `npm run build`, smoke, `git push` |
| **Claude Chat / GPT** | Advise | pressure-test strategy · draft/critique prompts |

Cowork never moves money or posts publicly; Code never invents a sequence, a result, or a public post; the
founder holds the four gates.

## Department & schedule links
- [docs/SPORTS_OPERATIONS.md](SPORTS_OPERATIONS.md) — the sports line department (SOL + analysts).
- [docs/SOCIAL_OPERATIONS.md](SOCIAL_OPERATIONS.md) — the social/growth department (draft → Head → Yash).
- [docs/COMPANY_SCHEDULE.md](COMPANY_SCHEDULE.md) — the ET cadence (who does what, when, behind which gate).
- [docs/SPORT_STANDUP_TEMPLATE.md](SPORT_STANDUP_TEMPLATE.md) · [docs/SOCIAL_DRAFT_TEMPLATE.md](SOCIAL_DRAFT_TEMPLATE.md) — the reporting/draft templates.
- Foundations: [docs/CLAUDE_TEAM_OPERATING_SYSTEM.md](CLAUDE_TEAM_OPERATING_SYSTEM.md) · [docs/CLAUDE_TOOL_USAGE_GUIDE.md](CLAUDE_TOOL_USAGE_GUIDE.md) · [docs/CEO_DAILY_WORKFLOW.md](CEO_DAILY_WORKFLOW.md).

## Design principles
Two line departments, one function pool, one execution engine · schedule-driven (every action has a time,
owner, and gate) · **serial money is sacred** (the SOL exists to sequence it) · honesty scales by delegation
(every analyst inherits settled-only discipline; every social manager inherits responsible-copy discipline) ·
founder controls stay put (cards, weights, deploys, brand) · standby ≠ idle (readiness prep so activation is a switch).
