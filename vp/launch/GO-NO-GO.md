# July 10 Soft Launch — Go / No-Go

**Maintained by:** Claude (VP) · **v1 — 2026-07-06** · decision owner: Yash
This is the *strategic* gate on top of the repo's operational checklist (`docs/JULY_10_LAUNCH_CHECKLIST.md`). Green everything below = **GO**. Any red in "Blockers" = **NO-GO** until fixed.

## Decision record
- **Date of call:** ______ (day-of, 2026-07-10)
- **Caller:** Yash · **Recommendation from VP:** GO if all blockers green
- **Outcome:** ⬜ GO ⬜ NO-GO ⬜ GO (limited) — notes: __________

## A. Hard blockers — ALL must be TRUE
- [ ] All 13 user routes return 200; **0** undefined / NaN / broken-img / Homer / stale-active-cards.
- [ ] Canonical money on `/mr-dub` and `/results` matches `portfolio.json` **exactly**; forensic audit PERFECT.
- [ ] All gates green: money-integrity · forensic · idempotence · health · tsc · full test suite · `npm run build` · production smoke **9/9**.
- [ ] Bank Builder shows a **current-slate approved card** (a live climb, not a stale/empty state).
- [ ] Top 10 board populated; freshness badges honest across the site.
- [ ] Odds API credits **> 5,000** (currently ~19,400).
- [ ] **No real-money / guarantee / "lock" language** anywhere; disclaimer + Responsible-Use visible on all pages (ADR-0010).
- [ ] Losing records (Moonshot, WC Specials) are shown plainly, not hidden.

## B. Should-be-done (high value, not strictly blocking) — ADR-0007
- [ ] Three GitHub secrets set (`VERCEL_DEPLOY_HOOK_URL`, `ODDS_API_KEY`, `API_FOOTBALL_KEY`) → hands-free daily rebuild/settle so the slate can't go stale unattended.
- [ ] Odds-API credit-floor guard live in `refresh_daily_products.sh` (with test).
- [ ] Public README reconciled to real positioning (no "NBA-only demo" framing) — ADR-0010.
- [ ] Nightly loop run cleanly for ≥2–3 consecutive days pre-launch (freshness proof).

## C. Positioning check (soft launch) — ADR-0004
- [ ] One-liner + first-audience channel decided (`POSITIONING.md`).
- [ ] Volume kept intentionally low; no mass marketing push.
- [ ] A place for early feedback exists (how do first users tell us what's confusing?).

## D. Explicitly deferred (documented, NOT blockers)
LADDER_V2 money activation (preview-only, ADR-0006) · MLB suggested parlays · optimizer grading revival · team/player drilldowns · /results pagination · design-token unification.

## E. Day-after
- [ ] Capture first metrics snapshot (`ops/METRICS_SNAPSHOT_TEMPLATE.md`).
- [ ] VP writes a short launch review in `launch/` (what shipped, what surprised us, next 3 things).

**Rule:** if forced to choose, a *fresh, honest, smaller* product beats a *stale or over-promised* bigger one. Freshness and honesty are the launch, not feature count.
