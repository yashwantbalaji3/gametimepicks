# CEO Daily Workflow — Yash

*Your daily loop as founder/admin. You don't run commands — you read `/ops`, make the judgment calls, and
paste the right prompt into the right Claude surface. Claude Code does the work; you approve and verify.
Everything Claude does obeys the hard rules (money only via official settlement · no fabrication · never
deploy red). Prompts below reference [CLAUDE_PROMPT_LIBRARY.md](CLAUDE_PROMPT_LIBRARY.md) by number.*

---

## ☀️ Morning (5–10 min)
1. **Open [`/ops`](https://gametime-picks.vercel.app/ops).** Read: money-gate badge (must be PASS), company
   health, product readiness, warnings, and the **Next action** line.
2. If anything is unclear → **Claude Chat:** *"Here's today's /ops status: <paste>. What matters and what should I prioritize?"*
3. **Claude Code:** paste **prompt #1 (morning status)** → it refreshes the slate, checks overnight
   workflows, and reports. If a workflow failed overnight → **prompt #10 (incident)**, don't let it slide.
4. **Decide today's Bank Builder card.** Ask Code for the proposal, then **prompt #4 (card approval)**.
   Your call: Lane A = safest disciplined card; Lane B = value only if it has real edge, else a no-play.

## 🌤️ Afternoon (2 min, optional)
- Re-open `/ops` (or **prompt #1**). Games in progress should show as in-play, not pregame.
- **Do not settle mid-game.** If a card looks stale after a rebuild, that's the only thing to flag.
- Approve a card here only if you deferred it in the morning.

## 🌙 Night (after the games are final)
1. **Claude Code:** **prompt #2 (settlement)** → dry-run, hand-verify every leg vs the official score, then
   apply. Read the new record (money moves only here). Both lanes losing is normal — it's real settlement.
2. **Read the model review** it writes (`MODEL_REVIEW_<date>.md`). If it proposes a weight change →
   **Claude Chat:** *"Is this justified or overfitting?"* before you let Code implement it.
3. **Claude Code:** roll forward + generate tomorrow's products (**prompt #3**), run all gates, **deploy**,
   and **smoke-test** (**prompt #8**). Confirm `/ops` and production look right.
4. **Optional wrap-up — Claude Chat:** paste Code's final report → *"Anything risky? Tomorrow's priority?"*

---

## What to paste where
| You want to… | Surface | Paste |
|---|---|---|
| Understand today / decide priority | **Chat** | the `/ops` status + "what matters?" |
| Run morning ops | **Code** | prompt #1 |
| Approve the daily card | **Code** | prompt #4 (Bank Builder) / #5 (Moonshot) |
| Settle last night's games | **Code** | prompt #2 |
| Generate tomorrow's slate | **Code** | prompt #3 |
| Fix a failed workflow / bug | **Code** | prompt #10 |
| Decide a model-weight change | **Chat** first, then **Code** | the model review → "justified?" → prompt #9 |
| Redesign a product / big UI | **Chat** to scope, **Code/Cowork** to build | direction + guardrails |
| Verify a deploy | **Code** | prompt #8 |
| Request any custom change | **Code** | prompt #12 (it self-classifies + gates) |

## When to bring in Cowork / agents
Use them when the day is **wide** (see [CLAUDE_TOOL_USAGE_GUIDE.md](CLAUDE_TOOL_USAGE_GUIDE.md)):
- a full route-by-route QA sweep across every page,
- a big test migration after a state change,
- a redesign where a UI/UX agent + a QA agent + a Data agent work in parallel,
- a research-style model analysis.
Each maps to an [agent mission](../agents). Until you're on Cowork, ask Claude Code to "fan out sub-agents."

---

## The 3 things only you decide
Claude executes; these judgment calls are yours:
1. **Which card to approve** (or to no-play a lane) — Claude proposes, you approve.
2. **Whether a model-weight change is justified** — Claude flags, you decide (don't overfit).
3. **When to deploy a product change to the public** — Claude gates it green, you say ship.

## If something's wrong
- Money-gate FAIL on `/ops` → **Code: prompt #10**, and do not deploy anything until it's green.
- A page looks broken/stale → **Code: prompt #6 (QA sweep)**.
- You're not sure → **Chat** to think it through, then **Code** to act.
