# What Claude Code Should Do Next (pre-July-10)

**Maintained by:** Claude (VP) · **Updated:** 2026-07-06
Sequenced, low-risk, launch-focused. Each item has acceptance criteria = which gates must pass. None of this is model tuning (sample too small). I don't implement — this is the plan; Code executes and reports back, and nothing is "done" until gates prove it.

## 0. Owner one-time action (unblocks everything, ~5 min, no code) — YASH
Set three GitHub secrets: `VERCEL_DEPLOY_HOOK_URL`, `ODDS_API_KEY`, `API_FOOTBALL_KEY`. This activates hands-free daily rebuild + scheduled fetch/settle. Without it, the nightly loop stays manual and the slate can go stale — the one thing that would actually undermine a launch.

## 1. Add the Odds-API credit-floor guard (highest ROI code task)
- **Why:** ~19,400 credits, ~60–100/day burn, **no alarm**. A silent exhaustion kills fresh data.
- **Scope:** add a credit-floor check to `refresh_daily_products.sh` (fail-closed below a threshold, e.g. 5,000) + a test. ~20 lines.
- **Acceptance:** unit test for the guard; refresh fails loudly under floor; money-md5 unchanged; all gates green.

## 2. Run the nightly loop daily through launch
- **Why:** freshness IS the product; a live climb at launch needs a fresh approved BB card.
- **Scope:** the DAILY_OPS evening chain — settle finished slate (dry → hand-grade → apply) → refresh next day → approve BB card → gates → push (rebase over nightly bot) → smoke 9/9.
- **Acceptance:** `/ops` "Next action" clean; smoke 9/9; canonical money matches on `/mr-dub` + `/results`.

## 3. Pre-launch verification sweep (day-of)
- **Scope:** all 13 routes 200 with 0 undefined/NaN/Homer/stale-active-cards; canonical money exact on `/mr-dub` + `/results`; BB lanes on current slate; Top 10 populated; freshness badges honest; credits > 5,000.
- **Acceptance:** a page-by-page QA pass table (a good Cowork fan-out job — I can coordinate it).

## 4. Refresh-orchestrator idempotence test (cheap safety)
- **Scope:** run `refresh_daily_products.sh` twice for the same date → assert identical artifacts (except cosmetic `generatedAt`). Add as a gate-adjacent test.
- **Acceptance:** test passes; documents the known cosmetic md5 re-stamp.

## Explicitly NOT now (deferred, documented)
LADDER_V2 money activation (pending decision 0001-#4), MLB suggested parlays, optimizer grading revival, /results pagination, design-token unification, any model re-weighting. These are post-launch.

## Recommended single Claude Code prompt (from the July-4 review, still current)
> "Nightly loop for <date>: settle the finished WC slate from official results (dry-run → hand-grade → apply), roll to <next> with refresh_daily_products.sh, propose a fresh Bank Builder card for approval under the current reliability weighting, add the Odds-API credit-floor guard to the refresh script with a test, run all gates, deploy, smoke 9/9."

---
*Pending your answers on `decisions/0001`, items 2/4/5/6/9 there each become their own plan file here.*
