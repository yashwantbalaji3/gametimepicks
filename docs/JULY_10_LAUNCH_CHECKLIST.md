# July 10 Soft-Launch Checklist

## State at final implementation pass (2026-07-05)
- Canonical: **17–12 · $19,265.40 · crown $20,465.40** · md5 `e8b1416b` · forensic PERFECT.
- **Bank Builder ACTIVE for July-5** (operator-approved, cycle 7): Lane A survival — Brazil or Draw
  (−500) + England or Draw (−295), $100→$160.68; Lane B value — Under 2.5 Mex/Eng (−186) + BTTS Yes
  Bra/Nor (−150), $100→$256.27. Moonshot B active ($25, +1599). Total paper exposure $225; canonical
  money untouched (exposure realizes only on official settlement).
- Top 10 board live on Home/Today/Picks; Moonshot 3-day ladder panel live; BB v1/v2 explainer live.
- LADDER_V2 settlement: NOT active (spec + tests + activation checklist in METHODOLOGY_V2_LADDER.md).

## Daily loop (every evening — ~15 min, docs/DAILY_OPS.md has full detail)
- [ ] `bash scripts/settle_soccer_day.sh --date <finished>` → hand-check 90' scores → `--apply`
- [ ] If lanes changed state: delegate pinned-test migration (authoritative table, flag-don't-mask)
- [ ] `bash scripts/refresh_daily_products.sh --date <next>` (add `--horizon` board rebuild if the
      auto-horizon derives short — known quirk)
- [ ] Approve/promote the fresh BB card: author `bank-builder-approved.json` (proposal verbatim) →
      `npx tsx app/scripts/promote-bank-builder-proposal.mjs --date <next> --apply`
      (restart stopped lanes FIRST via the restart script if both stopped)
- [ ] Gates: money-integrity · forensic · full tests · build — all green or DO NOT deploy
- [ ] Commit data → push main (rebase over nightly bot; `june30-reset` needs `--force-with-lease`)
- [ ] `npx tsx scripts/smoke-test-production.mjs` → 9/9

## Owner actions (one-time, unblock hands-free ops)
- [ ] GitHub secret `VERCEL_DEPLOY_HOOK_URL` → activates daily-rebuild.yml
- [ ] GitHub secrets `ODDS_API_KEY` + `API_FOOTBALL_KEY` → activates scheduled fetch/settle workflows

## Pre-launch verify (day of)
- [ ] All 13 routes 200, 0 undefined/NaN, 0 Homer, no stale active cards
- [ ] Canonical money on /mr-dub + /results matches portfolio.json exactly
- [ ] BB lanes current-slate; Top 10 populated; freshness badges honest
- [ ] Odds credits > 5,000 (currently ~19,400)

## Deliberately deferred (documented, not blockers)
- LADDER_V2 settlement activation (behind the documented checklist) · team/player drilldowns ·
  MLB suggested parlays · optimizer grading revival · design-token unification · /results pagination.
