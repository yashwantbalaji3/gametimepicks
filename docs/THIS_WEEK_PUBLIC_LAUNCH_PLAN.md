# This-Week Public Launch Plan — week of 2026-07-13

Day-by-day from the verified current date (Mon Jul 13) to a public launch by the weekend. Every task lists
priority · files/scripts · definition of done · guardrails.

## Day 1 — Mon Jul 13 (today) — "honest & safe to serve"
- **[P0] Ship the honest no-games state** — DONE this pass (liveness banner + "latest slate" header labels;
  built-HTML verified; suite 2142/0). *DoD:* zero "Live today" on current routes; money md5 `affe6b21`. ✅
- **[P0] Fast-forward the nightly-settle drift** — DONE (money-clean; `fda66764`). ✅
- **[P1] Do NOT run a paid refresh today** (0 games; would burn credits). *Guardrail:* credit floor.
- **[P0] Deploy** — push both refs green → Vercel auto-deploys. *DoD:* prod shows Jul 13 no-games banner.

## Day 2 — Tue Jul 14 — WC semifinal #1 + turn on automation
- **[P0] Refresh the July-14 slate** once SF odds post: `bash scripts/refresh_daily_products.sh --date 2026-07-14`.
  *DoD:* WC SF board live, MLB skips (break), money md5 unchanged. *Guardrail:* refresh md5-guards money, credit floor.
- **[P1] Add GitHub Actions secrets** (`ODDS_API_KEY`, `API_FOOTBALL_KEY`, `VERCEL_DEPLOY_HOOK_URL`) → activates
  `daily-refresh.yml` + `nightly-settle.yml` + `daily-rebuild.yml`. *DoD:* one green scheduled run; secrets never printed.
- **[P1] Settle the July-11 QFs** once official box scores exist (soccer settle script, official-gated). *DoD:*
  QFs move from pending → settled honestly; official 19-14 untouched unless a founder-approved official card.

## Day 3 — Wed Jul 15 — WC semifinal #2 + product surfaces
- **[P1] Bank Builder approval flow** — if the founder approves a card, author `bank-builder-approved.json` +
  `promote-bank-builder-proposal.mjs --apply` (md5-guarded). Else keep **No-Play**. *Guardrail:* never auto-promote.
- **[P1] Moonshot** stays paper-only; confirm the daily-portfolio candidate logic on the SF slate. *DoD:* No-Play
  or a paper card with settlement path; $0 official exposure.
- **[P2] Picks Lab / Build** — resolve any duplicate-route confusion surfaced in `CURRENT_ROUTE_INVENTORY.md`.

## Day 4 — Thu Jul 16 — settlement + results center
- **[P1] Settle WC semifinals** from official scores; verify `/results` shows pending vs settled honestly (no
  pending-as-loss). *DoD:* results center matches official artifacts; UFC stays post-event/experimental.
- **[P2] UFC** — keep archived pre-event predictions labelled experimental; not in product cards.

## Day 5 — Fri Jul 17 — MLB resumes
- **[P0] Refresh the July-17 MLB slate** (second half resumes): full refresh restores a live MLB board + sims.
  *DoD:* `/mlb` shows a real Jul-17 board (banner auto-hides — live day); the liveness layer validates itself.
- **[P1] MLB model-perf / paper track record** — confirm `mlb:grade-results` ran; `/mlb/results` honesty banner intact.

## Weekend — launch polish + go/no-go
- **[P1] Mobile QA** across all routes (the banner + headers are responsive; verify on 375px).
- **[P2] Copy cleanup** from `STALE_COPY_AND_FORBIDDEN_CLAIMS_SCAN.md` (soften residual "today" CTAs).
- **[P0] Final gate battery + prod smoke** (tsc/suite/build/forensic/health + curl the deployed routes).
- **[P0] Founder final approval** — confirm the money lock, the No-Play products, UFC exclusion, and the
  public copy before broad launch. *DoD:* founder sign-off recorded.

## Standing guardrails (every day)
Money md5 `affe6b21071f2b3be96bb2774eb347c3` · official 19-14 / $19,065.40 / $0 · no fake games/odds/cards ·
no pending-as-loss · UFC excluded from products · refresh md5-guards money + credit floor + never auto-deploys ·
push both `main` + `june30-reset` only when green.
