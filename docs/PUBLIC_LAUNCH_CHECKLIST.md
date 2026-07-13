# Public Launch Checklist — GameTime Picks (as of 2026-07-13)

Go / no-go for public traffic. ✅ done · ⏳ pending founder/data · ⬜ to verify at launch. Money lock:
**19-14 · $19,065.40 · $0 exposure · md5 `affe6b21071f2b3be96bb2774eb347c3`**.

## 1. Routes / navigation
- ✅ 6 hub routes + `/sports` honest on the real ET clock (no "Live today" on a stale slate).
- ✅ `/mlb/board`, `/mlb/power`, `/projections` carry the liveness banner (latest-view only).
- ✅ Internal surfaces `/ops` + `/preview/june20` **excluded from the public export** (guard + build prune; 404 in `out/`).
- ✅ Alias routes `/games`→`/simulate`, `/parlays`·`/parlay-lab`·`/nba/parlays`→`/picks` are **client redirects** (no Next error shells).
- ⬜ Click every primary-nav + footer link once on prod (no 404s, no error shells).
- ⏳ Decide UFC launch scope (currently surfaced on Home/`/picks`/`/sports`/rail as experimental).

## 2. Data freshness
- ✅ Liveness layer keeps every current route honest even on a 0-game day (All-Star break + WC between rounds).
- ✅ Newest slate 07-11 shown as "most recent / latest available", never "today".
- ⬜ On launch day, confirm the freshness badge shows the true age (client re-derives on the real clock).
- ⏳ Turn on daily automation (see §4) so the slate refreshes itself instead of manually.

## 3. Money / record
- ✅ `portfolio.json` md5 `affe6b21` unchanged; forensic **MATHEMATICALLY PERFECT**; 19-14 / $19,065.40 / $0.
- ✅ Do **NOT** re-stamp `portfolio.json` (its stale `generatedAt` is cosmetic; re-stamping breaks the md5 lock).
- ✅ Every public surface reads the same canonical figures; refresh + settle scripts md5-guard money.

## 4. Automation / secrets (founder action)
- ⏳ Add GitHub Actions secrets: `ODDS_API_KEY`, `API_FOOTBALL_KEY`, `BALLDONTLIE_API_KEY`, `VERCEL_DEPLOY_HOOK_URL`.
- ✅ nightly-settle active + money-clean (fast-forwarded this session). Refresh fails closed on missing keys; 0-game safe.
- ⏳ Decide `ENABLE_AUTONOMOUS_DEPLOY` repo var for hands-off daily deploys.

## 5. Settlement (founder / data — never fabricate)
- ⏳ **WC:** official scores stop at 07-07; settle 07-08→07-11 (incl. QFs) once official box scores are committed.
- ⏳ **UFC:** settle the 07-11 card OR relabel `/ufc` as an experimental archive (results frozen; won't self-heal).
- ✅ **MLB:** settled through 07-11 (no debt). `/results` shows pending honestly; no pending-as-loss.
- ⬜ Retire the vestigial legacy `results/` export (frozen 06-13, unsurfaced). See `RESULTS_AND_SETTLEMENT_AUDIT.md`.

## 6. Mobile smoke (375px)
- ⬜ Home / Today / MLB / World Cup / Picks / Moonshot / Results render without horizontal scroll.
- ⬜ Liveness banner + freshness badge legible; nav + bottom-nav reachable; redirects land correctly.
- ⬜ Simulate lobby + a game report open and run on mobile.

## 7. Gates (must all pass before deploy)
- ✅ `npx tsc --noEmit` clean.
- ✅ full suite green (`npx tsx --test $(find src -name '*.test.mjs')`).
- ✅ `npm run build` exit 0 (prunes internal routes).
- ✅ `forensic-money-audit.mjs` → MATHEMATICALLY PERFECT.
- ✅ `health-check.mjs --today <ET>` → HEALTHY.
- ✅ internal-artifact leak check: no `data/internal` + no UFC `-internal-` in `out/`.

## 8. Vercel deploy
- ✅ Auto-deploys on push to `main` (Git integration); no `vercel.json` (framework preset).
- ⬜ After deploy, prod smoke: `curl -sL https://gametime-picks.vercel.app/` shows the correct ET-date banner + money chip.
- ⬜ Confirm `/ops` + `/preview/june20` return 404 on prod (if Vercel bypasses `npm run build`, the guard still yields a data-free 404 shell — verify).
- ⬜ Founder final sign-off on money lock, No-Play products, UFC exclusion, and public copy.

## Go / no-go verdict
**Soft-launch READY** (honest, safe, money-locked). **Broad-launch** gated on: (a) confirm `/ops`+`/preview`
404 on prod, (b) automation secrets, (c) WC/UFC settlement debt, (d) mobile smoke + founder sign-off. None is a
correctness risk — (a) is a 1-check verification, the rest are completeness.
