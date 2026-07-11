# GameTime Picks — Sports Operations Operating Model

**Maintained by:** Claude (VP of Product & Operations) · **v1 — 2026-07-06** · design (not yet implemented)
**Purpose:** evolve the flat agent roster into a structured **Sports Operations hierarchy** — a senior lead over per-sport specialists — without losing the honesty gates and operator controls that make the product trustworthy.

---

## 0. The two axes (how this fits the existing roster)
The current agents (`ops-manager`, `quant-analyst`, `qa-engineer`, `launch-manager`, `data-engineer`, `product-manager`, `ui-ux-designer`, `content-analyst`) are **functions** — cross-cutting services. The new hierarchy adds a **domain** axis — one specialist per sport. They compose:

```
Founder (Yash) ─ the 3 judgment calls: card approval · weight change · deploy-to-public
   │
VP of Product & Operations (Cowork / me) ─ product org, planning, cross-functional strategy
   │
Sports Operations Lead (senior AI employee) ─ owns daily end-to-end sports ops
   │
   ├── Soccer Analyst      (ACTIVE — World Cup, flagship driver)
   ├── Baseball Analyst    (ACTIVE — MLB, post-WC flagship)
   ├── Basketball Analyst  (STANDBY — NBA off-season, reactivate in-season)
   ├── Hockey Analyst      (STANDBY — NHL, provider onboarding)
   └── Football Analyst    (STANDBY — NFL, preps for fall)
        │
        └── draw on shared FUNCTION services: QA · Launch · Data Eng · Quant discipline · Content · UI/UX
```

The Sports Operations Lead **elevates and absorbs the old Ops Manager mission** and adds cross-sport orchestration + delegation to sport specialists. Each sport analyst **inherits the Quant Analyst's settled-only, no-overfit discipline**, scoped to its sport, and additionally owns that sport's settlement, generation, and readiness.

**Prime directives every role obeys (unchanged):** canonical money only via official settlement · no fabrication · fail closed · pending ≠ loss · no forced cards.

---

## 1. Senior AI employee — recommended title
**Recommended: "Sports Operations Lead"** (folder `agents/sports-operations-lead/`).
- Rationale: "Lead" signals seniority + accountability without colliding with the human-facing "VP" (me/Cowork) or "Director"/"Chief" titles that imply a larger org than exists. It matches your proposed folder and reads naturally in prompts ("Sports Operations Lead: run the nightly loop…").
- Alternatives considered: *Director of Sports Operations* (fine, slightly heavier), *Head of Sports Ops* (fine), *Chief Sports Officer* (over-titled for a one-company AI team). Keep "Lead."
- Shorthand for prompts/reports: **SOL**.

---

## 2. Sports Operations Lead — responsibilities
Owns the **daily end-to-end sports operation** and is the single throat-to-choke for "is the product fresh, honest, and green today?"

- **Daily orchestration:** run the full loop across all active sports — orient from `/ops` + `admin/status.json`, sequence the night's work, and land it green.
- **Settlement sequencing:** because there is **one canonical bankroll**, settlement writes must be **serialized**. The Lead orders each sport's `--apply` (by finality time), re-runs the money gate between applies, and never lets two sports write money concurrently.
- **Generation sequencing:** after settlement is money-gated clean, sequence next-slate generation per active sport → then the cross-sport **Top 10** unification → then the **Bank Builder pool** (Top 10 team-market family) so products can never disagree.
- **Cross-sport consistency:** enforce one shared `MARKET_RELIABILITY` table and shared reliability weights across sports; reconcile conflicting recommendations before they reach the founder.
- **Money-integrity gates:** own the definition-of-done gate suite (integrity · forensic · idempotence · health · tsc · tests · build · smoke). Never green a day that isn't.
- **Product readiness:** aggregate each sport's readiness into one status; decide what's launch-worthy vs stale.
- **Go/No-Go readiness:** maintain the launch checklist state; recommend GO / CONDITIONAL GO / NO-GO.
- **Handoff to Claude Code:** convert the night's plan into a single, sequenced, gated Code prompt; verify Code's report against gate output.
- **Reporting to founder:** produce one cross-sport daily brief + the highest-priority next action and any founder decisions required.
- **Escalation target:** receives risk escalations from sport analysts; escalates the 3 founder-only decisions upward.

**Never:** move money outside official settlement · run parallel money writes · deploy red · overrule a sport analyst's honest no-play to force a card · make a founder-only decision.

---

## 3. Sport-specific analysts — responsibilities
Each sport analyst owns its vertical end-to-end and reports upward to the Sports Operations Lead. Common charter (all sports):

- **Settle official results** for the sport (official source only; hand-verify each leg vs the official final; respect sport-specific settlement policy). Prepare the settlement; the **Lead sequences the money `--apply`**.
- **Review model performance** (settled-only) and **write a sport-specific model review** (`docs/MODEL_REVIEW_<sport>_<date>.md`), labeling every finding **proven / directional / insufficient**.
- **Generate future-slate model picks** for the sport (ranked by reliability × probability + edge, never payout).
- **Identify missing data** (absent lines, unavailable boxscores, provider gaps) and say so — never fabricate.
- **Flag stale products** for the sport (boards/cards not current to the slate).
- **Report product readiness** for the sport (ready / degraded / off-season / blocked).
- **Recommend product cards** (Bank Builder / Moonshot candidates or an honest no-play) — recommend, never self-approve.
- **Escalate risks** to the Lead (money-gate concerns, model drift, data outages, honesty risks).

**Never:** apply money writes directly · overfit a small sample · invent a result or a line · approve its own card.

### Per-sport charters & current status
| Analyst | Folder | Status | Official source | Markets / anchor | Sport-specific rules & known gaps |
|---|---|---|---|---|---|
| **Soccer** | `agents/soccer-analyst/` | **ACTIVE** (WC flagship) | API-Football | DC/DNB anchor; totals weak; BTTS weakest; **player props banned in BB** | 90'-regulation settlement (ET goals never flip 90' markets); knockout ET variance; the crown-jewel settlement path |
| **Baseball** | `agents/baseball-analyst/` | **ACTIVE** (post-WC flagship) | MLB Stats API | Hits / Total Bases / Strikeouts | Gaps: no auto MLB prop settlement into /results; no MLB suggested parlays yet — both roadmap items this analyst owns |
| **Basketball** | `agents/basketball-analyst/` | **STANDBY** (off-season) | nba_api (+ ESPN fallback) | PTS/REB/AST (+3PM/PRA/BLK/STL) | nba_api blocked on CI IPs → needs ESPN game-log fallback before reactivation; boards honestly off-season-gated now |
| **Hockey** | `agents/hockey-analyst/` | **STANDBY** (onboarding) | TBD (provider pending) | TBD | Provider not yet integrated; charter = scope data source + settlement policy before activation |
| **Football** | `agents/football-analyst/` | **STANDBY** (preps for fall) | TBD (NFL, fall) | TBD | Reuse the WC pipeline pattern; scope provider + markets ahead of the NFL season |

A STANDBY analyst's job today is **readiness prep** (source selection, settlement policy, market list), not daily generation. Activation is a founder/Lead call when the season/provider is live.

---

## 4. The daily pipeline (sequenced, with owners)
One canonical bankroll ⇒ settlement is **serial**; generation can fan out per sport but converges at Top 10 → BB. `[SOL]`=Lead, `[Sx]`=sport analyst, `[Code]`=Claude Code executes, `[Founder]`=Yash decides.

**Phase 1 — Settlement (serial, money-gated)**
1. `[SOL]` order sports by finality time; only settle sports whose games are **official-final** (pending stays pending).
2. For each finished sport, in order: `[Sx]` prepare settlement (dry-run) + **hand-verify each leg vs the official final** → `[SOL]` approve the sequence → `[Code]` `--apply` → `[Code]` re-run money-integrity + forensic. Repeat per sport; never concurrent money writes.
3. `[SOL]` confirm canonical record + md5; abort the night if any money gate fails (fail closed).

**Phase 2 — Model review (per sport)**
4. `[Sx]` write `docs/MODEL_REVIEW_<sport>_<date>.md` (settled-only; proven/directional/insufficient). No weight change without a labeled, gated justification. `[Founder]` approves any proposed weight change ("justified or overfitting?").

**Phase 3 — Refresh / generation (fan-out → converge)**
5. `[Sx]` generate the next slate for each active sport (`refresh_daily_products.sh` per sport). `[Code]` executes; money-md5 must stay unchanged.
6. `[SOL]` unify cross-sport **Top 10** (reliability × probability + edge, never payout) → derive the **Bank Builder pool** from the Top 10 team-market family.

**Phase 4 — Product proposal (recommend, don't approve)**
7. `[Sx]` recommend the sport's card candidates or an honest no-play → `[SOL]` assemble the daily Bank Builder / Moonshot proposal → `[Founder]` **approves the card (or no-plays a lane)**. `[Code]` promotes the approved card only.

**Phase 5 — QA**
8. `[SOL]` commission a QA pass (function role) → render-audit all routes (undefined/NaN/Homer/stale/Pass = 0), freshness honest, money reconciles on /results + /mr-dub. Fail → fix before deploy.

**Phase 6 — Deploy**
9. `[SOL]` confirm all gates green → `[Code]` build → deploy → production smoke 9/9. **Never deploy red.** `[Founder]` says ship for any product-visible change.

**Phase 7 — Founder approval & report**
10. `[SOL]` send the founder the cross-sport daily brief + next action + any decisions required. Money movement + card approval + deploy remain founder-gated (ADR-0007).

---

## 5. Claude Code executes vs Cowork coordinates
| Layer | Does | Examples |
|---|---|---|
| **Claude Code** (execution) | Runs scripts, mutates artifacts, runs gates, builds, deploys, commits | `settle_soccer_day.sh --apply`, `refresh_daily_products.sh`, `promote-bank-builder-proposal.mjs`, `npm run build`, `smoke-test-production.mjs`, `git push` |
| **Cowork / agents** (coordination) | Analysis, sequencing decisions, reviews, readiness judgments, drafting reports + the Code prompt | Sport analysts' hand-verification + model reviews + readiness; SOL's settlement/generation sequencing, cross-sport consistency, Go/No-Go, founder brief |
| **Founder** (decision) | The 3 calls | approve card · approve weight change · approve deploy |

Rule of thumb: **Cowork decides *what* and *in what order*; Code performs the mutation; the Founder authorizes money, cards, and shipping.** Agents never move money or approve their own cards; Code never invents a sequence or a result.

---

## 6. Upward reporting format (each sport → Lead)
Every active sport analyst sends the Lead a structured daily standup (kept short; proof over prose):

```
SPORT STANDUP — <Sport> — <date>
Status:        ACTIVE | DEGRADED | OFF-SEASON | BLOCKED
Settlement:    <games settled> · record delta <W-L> · each leg hand-verified vs official? Y/N
Model review:  <one line> · findings: proven/directional/insufficient · weight change? none|<proposal>
Generation:    next slate <date> · <n picks> · Top-10 contributions <n>
Missing data:  <none | list: what's absent and why it's not fabricated>
Stale products:<none | list>
Readiness:     <ready | degraded+reason | off-season | blocked+reason>
Card rec:      <Bank Builder/Moonshot candidate | honest NO-PLAY + reason>
Risks/escalations: <none | list, severity-tagged>
Gate impact:   money-md5 unchanged? Y/N · any gate risk?
```

The **Lead aggregates** these into one founder brief:
```
SPORTS OPS DAILY BRIEF — <date>
Canonical: <record · bankroll · crown · md5> · money gate: PASS/FAIL
Per sport: <one line each: status · settlement · readiness · card rec>
Cross-sport: Top 10 unified? BB pool consistent? conflicts resolved?
Gates: <integrity/forensic/idempotence/health/tsc/tests/build/smoke>
Go/No-Go: GO | CONDITIONAL GO | NO-GO (+ conditions)
Founder decisions needed: <cards to approve · weight changes · deploy>
Next action (single highest priority): <...>
Handoff to Claude Code: <the sequenced prompt>
```

---

## 7. Folder / docs structure
```
agents/
├── README.md                        ← org chart + how the two axes compose (NEW/updated)
├── sports-operations-lead/
│   └── mission.md                   ← SOL charter (NEW)
├── soccer-analyst/
│   └── mission.md                   ← ACTIVE (NEW)
├── baseball-analyst/
│   └── mission.md                   ← ACTIVE (NEW)
├── basketball-analyst/
│   └── mission.md                   ← STANDBY (NEW)
├── hockey-analyst/
│   └── mission.md                   ← STANDBY (NEW)
├── football-analyst/
│   └── mission.md                   ← STANDBY (NEW)
└── (existing function roles unchanged: ops-manager, quant-analyst, qa-engineer,
     launch-manager, data-engineer, product-manager, ui-ux-designer, content-analyst)

docs/
├── SPORTS_OPERATIONS.md             ← index: hierarchy, daily pipeline, reporting format (NEW)
└── SPORT_STANDUP_TEMPLATE.md        ← the upward report template (NEW)
```
`docs/CLAUDE_TEAM_OPERATING_SYSTEM.md` gets a pointer to `SPORTS_OPERATIONS.md` so the two systems are linked, not duplicated. The existing `ops-manager` mission gets a one-line note that its daily-loop remit is now led by the Sports Operations Lead (keep the file; it's the function-role reference).

---

## 8. Design principles (why it's shaped this way)
- **One ledger ⇒ serial money.** The single biggest constraint; the Lead exists largely to sequence settlement safely.
- **Fan-out analysis, converge on consistency.** Sports think independently but must agree at Top 10 / BB via shared reliability weights.
- **Honesty scales by delegation, not dilution.** Every sport inherits the same settled-only, no-overfit, no-fabrication discipline.
- **Founder controls stay put.** More automation, but money / cards / deploy remain the 3 human calls.
- **Standby ≠ idle.** Off-season/onboarding analysts do readiness prep so activation is a switch, not a scramble.
