# Which Claude Tool To Use — GameTime Picks

*You (Yash) run GameTime Picks as a one-person company with three Claude surfaces. This is the map of which
one to reach for. Rule of thumb: **Chat thinks, Code does, Cowork/agents parallelize.***

## TL;DR
| Surface | Use it for | Output | Touches the repo? |
|---|---|---|---|
| **Claude Chat** | Thinking: strategy, roadmap, product decisions, reviewing Code's reports, turning your intent into a precise Code prompt | A decision, a plan, or a ready-to-paste prompt | No |
| **Claude Code** | Doing: repo audits, settlement, refresh, implementation, tests, deploys, bug fixes, page/script changes, the admin dashboard | Committed code/data + green gates + a deploy | Yes (this repo) |
| **Cowork / agents** | Parallelizing: fan-out audits, test migration, route-by-route QA, model review, department-style roles | Several results merged back | Via Code, in parallel |

---

## Use Claude Chat for
- **Strategy & roadmap** — what to build next, prioritization, launch planning.
- **Product decisions** — should Lane B be a no-play today? is this design direction right?
- **Reviewing Code's reports** — paste a Claude Code final report and ask "did this actually do what I wanted, what's the risk, what's next?"
- **Turning intent into a prompt** — describe what you want in plain English; Chat returns the precise Claude Code prompt to paste (use [CLAUDE_PROMPT_LIBRARY.md](CLAUDE_PROMPT_LIBRARY.md) as the starting templates).
- **Model philosophy & UI/UX direction** — the "why", before the "how".
- **Business planning** — pricing, positioning, messaging (no repo access needed).

Chat has no repo access — it can't settle, refresh, or deploy. It's your strategist and translator.

## Use Claude Code for (this is your main workhorse)
- **Repo audits** — "audit /ops and the settlement flow."
- **Settlement** — official-results-only via `settle_soccer_day.sh` (dry-run → hand-verify → apply).
- **Refresh** — `refresh_daily_products.sh` for today's/forward slate.
- **Implementation** — pages, components, scripts, policy functions, the admin dashboard.
- **Tests / data artifacts / deployments / bug fixes** — the whole build-gate-deploy loop.
- Every Claude Code run must end green (tsc · tests · build · money-integrity · forensic · health) and, if it deployed, smoke 9/9. It never moves canonical money outside official settlement.

## Use Claude Cowork / agents for (as volume grows)
Same engine as Code, but **parallel** — one orchestrator fans work out to sub-agents and merges the results.
Reach for it when the work is wide, not deep:
- **Parallel audits** — route-by-route QA across all 17 pages at once.
- **Test migration** — after a money/state change breaks 30+ pinned tests (this repo already delegates that to a sub-agent).
- **Daily QA / data checks** — a QA agent + a data agent running the same morning, independently.
- **Model review / UI review** — a Quant agent and a UI/UX agent each producing their own report.
- **Department-style roles** — spin up the [agent missions](../agents) as concurrent "employees".
Today you can already get this inside Claude Code by asking it to "use a workflow / fan out sub-agents." Cowork is the same idea with a friendlier multi-agent surface.

---

## Example workflows

### A normal day
1. **Chat:** "What should I focus on today?" (reads your notes / the roadmap).
2. **Code:** paste prompt #1 (morning status) → read `/ops`, refresh, decide the card.
3. **Code:** approve the Bank Builder card (prompt #4).
4. Night — **Code:** settle (prompt #2) → model review → roll forward → deploy → smoke.
5. **Chat:** paste Code's final report → "anything risky? what's tomorrow's priority?"

### A bug
1. **Chat:** describe the symptom → Chat sharpens it into an incident prompt.
2. **Code:** paste prompt #10 (incident response) → root-cause, fix, regression test, gates, deploy.
3. **Chat:** review the fix report; decide if prevention needs a roadmap item.

### A product redesign
1. **Chat:** explore directions, pick one, define success + guardrails.
2. **Code (or Cowork):** implement behind the hard rules; a UI/UX agent + a QA agent in parallel for big redesigns.
3. **Code:** gates + deploy + production verify.
4. **Chat:** review live result, iterate.

### Settlement
- Always **Code** (needs the repo + official API). Dry-run → hand-verify every leg → apply → gate. Never Chat (it can't fetch official results), never estimate.

### Model improvement
1. **Code:** produce `MODEL_REVIEW_<date>.md` from settled results (prompt #9).
2. **Chat:** review the findings; decide if a weight change is justified (don't overfit).
3. **Code:** implement the justified change + tests; deploy.

---

## The one rule that never changes
Whatever surface you use: **canonical money changes only through official settlement, nothing is fabricated, and nothing red ships.** Chat can propose anything; only Code can change the repo; both obey the hard rules. See [CLAUDE_TEAM_OPERATING_SYSTEM.md](CLAUDE_TEAM_OPERATING_SYSTEM.md).
