# Claude Prompt Library — GameTime Picks

*Copy-paste prompts for driving each role via Claude Code (or a Cowork agent). Each is self-contained and
ends by naming the gate it must pass. Paste one, let Claude work, read the report. The hard rules
(canonical money only via official settlement · no fabrication · fail closed · never deploy red) apply to
every prompt without repeating them.*

---

### 1. Daily morning status check (Ops Manager)
```
Morning ops check for GameTime Picks. From app/, regenerate admin/status.json (build-admin-status.mjs) and
read it. Report: canonical money (record/bankroll/crown/md5), moneyGate pass/fail, today's slate + game
counts, active Bank Builder + Moonshot lanes, and the derived nextAction. Then: run verify-money-integrity
and health-check --today <today>, and `gh run list --limit 8` for overnight failures. If any workflow failed,
root-cause it before doing anything else. Do NOT change money. End with a one-paragraph status + the single
highest-priority next action.
```

### 2. Official settlement pass (Ops Manager + Quant)
```
Settle yesterday's GameTime Picks slate. Determine PREV (yesterday in ET). Fetch OFFICIAL results only
(settle_soccer_day.sh uses API-Football). DRY-RUN first and hand-verify EVERY active Bank Builder + Moonshot
leg against the official FT score — state each leg's grade and why. Only then apply
(settle_soccer_day.sh --date PREV --apply). Confirm the money gate passes and report the new canonical
record/bankroll (money moves only through this official settlement). If a game is still in progress, leave it
pending — never estimate. Then write docs/MODEL_REVIEW_<PREV>.md per MODEL_LEARNING_LOOP.md.
```

### 3. Product refresh pass (Data Engineer)
```
Refresh GameTime Picks products for today (ET). Run scripts/refresh_daily_products.sh --date <today> (real
odds only). Confirm it prints "canonical money untouched (md5 verified)" and "HEALTHY". Verify: current games
current, forward games present through the odds window, completed games not bettable, props pending where
unavailable, Homer stays retired, no stale prior-day active cards. Report game counts and anything that
skipped. Do not force any card.
```

### 4. Bank Builder card approval (Product Manager)
```
Decide today's Bank Builder card for GameTime Picks. Show me buildBankBuilderProposal for today. Lane A =
the safest disciplined survival card (team/game markets only, ≤3 legs, no props, no coin-flips); Lane B =
value ONLY if it has real model edge — otherwise a documented NO-PLAY. If a lane is stopped, restart it
(money-safe restart script) FIRST. Then author public/data/mr-dub/bank-builder-approved.json as the proposal
VERBATIM and promote (promote-bank-builder-proposal.mjs --apply). Prove canonical portfolio md5 is unchanged.
Output each lane's legs/odds/model-prob/why-selected/why-it-fails, or the exact no-play reason.
```

### 5. Moonshot card approval (Product Manager)
```
Review today's Moonshot for GameTime Picks. Confirm the active longshot lane(s) are team/game markets grouped
by game (no player props unless explicitly allowed + labeled high-variance), and that the 3-step ladder
($25→$100→$375→$1,500, profit-locking) is shown prominently. If no qualified card, show the premium no-play
with the exact reason. Report why it can hit / why it can fail. Canonical money must not change.
```

### 6. QA sweep (QA Engineer)
```
QA sweep of GameTime Picks. Run npm run build, then render-audit every route (/, /today, /games, /picks,
/build, /bank-builder, /moonshot, /world-cup, /world-cup/round-of-32, game detail, /world-cup-specials, /mlb,
/results, /mr-dub, /methodology, /about, /homer-nukes). For each: undefined=0, NaN=0, broken images=0, no
stale active cards, no Pass leans surfaced, Homer retired, flagship products reachable ≤3 clicks. Report a
pass table and fix any failure now (or flag it if it needs a decision).
```

### 7. UI/UX audit (UI/UX Designer)
```
UI/UX audit of GameTime Picks toward an ESPN/FanDuel-grade paper-sportsbook. Review nav clarity, card quality,
the 7-step Bank Builder + 3-step Moonshot ladders' prominence, team flags/logos + player avatars (deterministic
fallbacks only, never fake assets), animations (reduced-motion safe), empty states, and mobile spacing. Give a
prioritized list (fix-now vs defer) with exact files/components, then implement the safe high-impact items.
Add/keep tests. Do not add heavy dependencies or fabricate assets.
```

### 8. Production deploy verification (Launch Manager)
```
Verify the latest GameTime Picks deploy. Confirm HEAD == origin/main, run smoke-test-production.mjs (expect
9/9), and curl-spot-check the pages that changed (trailing-slash aware). Confirm no stale old deployment and
that the flagship ladders + Top 10 + active cards render live. Report the deployed commit + verification.
```

### 9. Model review pass (Quant)
```
Model review for GameTime Picks' last settled slate. Using SETTLED results only, for each pick: predicted vs
official, market type, odds band, confidence, game script, knockout risk, and whether the reason was correct.
Summarize market-type performance. Recommend reliability-weight changes ONLY where a settled sample justifies
it — label every finding proven / directional / insufficient sample; do not overfit. Write
docs/MODEL_REVIEW_<date>.md. Change no money.
```

### 10. Incident response (Ops Manager)
```
Incident on GameTime Picks: <describe>. Diagnose the ROOT CAUSE (config / API / code / data / env / credential
/ race). Reproduce it. Classify it. Implement the proper fix (not a workaround), re-run locally to prove it,
add regression protection, and document root-cause + fix + prevention (like docs/NIGHTLY_SETTLE_FIX_2026-07-06.md).
If canonical money is involved, do not mutate it outside official settlement. Then run all gates and, if safe, deploy.
```

### 11. Roadmap planning (Product Manager)
```
Plan the next GameTime Picks work. Read admin/status.json + the JULY_10_LAUNCH_CHECKLIST + recent MODEL_REVIEWs.
Propose a prioritized roadmap toward public launch (impact × effort × risk), separating "safe to implement now"
from "needs a decision". Do not implement yet — just the plan and the single highest-value next prompt.
```

### 12. Custom change request (any role — see CUSTOM_CHANGE_WORKFLOW.md)
```
Admin change request for GameTime Picks: "<your request>". Classify it (copy / UI / product-logic /
settlement-money / data-refresh), assign a risk level, propose a plan, and implement ONLY if safe under the
hard rules. Run all gates, deploy if code/public docs changed, verify production, and write a changelog line.
If it touches canonical money outside official settlement, refuse and explain.
```
