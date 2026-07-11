# Founder Operating Cadence — Yash

**Maintained by:** Claude (VP) · **Updated:** 2026-07-06
A rhythm that keeps GameTime Picks honest, fresh, and moving without burning you out. It layers a *strategic* cadence (mine, with you) on top of the *operational* daily loop that already exists in `CEO_DAILY_WORKFLOW.md`. You make judgment calls; Claude executes.

## Daily (~15–20 min total) — operational, already defined
- **Morning (5–10 min):** open `/ops`. Confirm money-gate = PASS, read health + "Next action." If unclear → ask Claude Chat "what matters today?" Approve today's Bank Builder card (Lane A safest; Lane B value or no-play).
- **Afternoon (2 min, optional):** re-open `/ops`; games in progress should read in-play, not pregame. Never settle mid-game.
- **Night (after finals):** Claude Code settles (dry-run → hand-verify → apply), writes the model review, rolls tomorrow, runs gates, deploys, smokes 9/9. You skim the model review; if it proposes a weight change, ask Chat "justified or overfitting?" before approving.
- **The 3 calls only you make:** which card to approve · whether a weight change is justified · when to ship to the public.

## Weekly (~45–60 min) — strategic, with me (VP)
Pick a fixed day (suggest **Monday**). Format:
1. **State of the product (10 min):** I bring the week's metrics snapshot (record, bankroll, per-market reliability, credits, any incidents) and a red/yellow/green on each product.
2. **Department reviews as needed (20 min):** I fan out parallel reviews (UX / Quant / QA / Data / Launch) on whatever's hot and bring you *merged* findings, not raw dumps.
3. **Prioritize (10 min):** we score the top candidates on impact × effort × risk and pick the week's 1–3 things for Claude Code.
4. **Decisions (10 min):** clear any open items from `decisions/`. Anything you decide, I log.
- **Output:** a `reviews/YYYY-MM-DD-weekly.md` + updated plans in `plans/` ready for Code.

## Monthly (~90 min) — direction
- Auto-generated **calibration report** (modeled vs settled by market × competition) — the honest scoreboard for model trust.
- **Roadmap review:** re-rank the 30/60/90 plan against reality. Kill what's not working (we retired Homer and Cricket cleanly — keep that muscle).
- **One strategic bet:** name the single most important thing for next month (e.g. post-WC transition, monetization test, second odds source).

## Standing principles
- **Freshness is the product** — a stale slate is worse than no launch. Automate the loop (the three GitHub secrets) so daily ops survive a busy week.
- **Ship green, never red** — the gates are non-negotiable.
- **Don't overfit** — no model change on <10 settled samples per cell.
- **Honesty compounds** — every 0–17 record shown plainly is a deposit in the trust bank; that's the moat.

## When to pull in Cowork/agents (me + sub-agents)
Use for *wide* days: full route-by-route QA sweeps, big test migrations, multi-department redesigns, or research-style model analysis. I coordinate; Code implements.
