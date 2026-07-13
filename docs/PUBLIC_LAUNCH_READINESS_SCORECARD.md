# Public Launch Readiness Scorecard — 2026-07-13

GREEN = launch-ready · YELLOW = usable, needs work · RED = blocker · GRAY = intentionally unavailable.
Verified ET **2026-07-13**; money locked (19-14 / $19,065.40 / md5 `affe6b21`); build + suite green.

| Area | Score | Blocker / note | Owner decision? | Fix scope | Definition of done |
|---|---|---|---|---|---|
| Homepage `/` | 🟢 | liveness banner live; UFC preview surfaced (experimental) | UFC prominence | — | keep; decide UFC card |
| Today `/today` | 🟢 | banner + "Latest slate" header (fixed this pass) + no-play notes | no | — | done |
| Games/WC `/world-cup` | 🟢 | banner names SF next-up; QF board honest | no | — | done |
| MLB `/mlb` | 🟢 | banner + All-Star note + "latest slate" eyebrow (fixed) | no | small | soften hero "Games today N" copy nit (P2) |
| Simulate `/simulate` | 🟡 | dup of `/games`; confirm stale-MLB not shown as "today" | no | small | dedupe + verify sim lobby dates |
| Picks `/picks` | 🟢 | banner + stale-card date gating | no | — | done |
| Picks Lab / Build `/build` | 🟢 | honest "no eligible legs" | IA | small | resolve /picks vs /build overlap (P2) |
| Moonshot `/moonshot` | 🟢 | banner; lane "stopped" (0-1) honest | no | — | done |
| Results `/results` | 🟡 | two results systems out of sync (legacy `results/` frozen 06-13 vs `mlb/results/` 07-11) | pick canonical | med | one results source; retire/refresh the other |
| UFC `/ufc` | 🟡/⚪ | experimental; advertises finished 07-11 card "awaiting settlement" (never settles); `-internal-` files publicly served | launch scope | med | settle/relabel 07-11 card; rename internal files |
| Money / Mr Dub | 🟢 | 19-14 / $19,065.40 / $0 / md5 `affe6b21`; forensic PERFECT | no | — | done (do NOT re-stamp portfolio.json) |
| Automation | 🟡 | nightly-settle active; paid refresh + deploy-hook gated on GH secrets (2 of 4 local) | add secrets | small | add `ODDS_API_KEY`/`API_FOOTBALL_KEY`/`BALLDONTLIE_API_KEY`/`VERCEL_DEPLOY_HOOK_URL` |
| Settlement | 🟡 | WC official scores stop 07-07 (07-08→11 unsettled); UFC frozen 05-16 | needs official data | data | commit official box scores → settle; never fabricate |
| Mobile UX | 🟢 | banner + headers responsive (verified 375px prior pass) | no | small | weekend mobile QA sweep |
| Trust / methodology | 🟢 | `/methodology` `/about` `/responsible-use` `/market-guide` honest | no | — | done |
| **Internal exposure** | 🔴 | **`/ops` + `/preview/june20` statically exported + world-readable** | **YES** | small | exclude from public export (or accept) — noindex ≠ private |

## RED blockers (must resolve before broad public traffic)
1. **`/ops` publicly reachable** — leaks tooling commands, doc paths, agent playbooks. *Why it matters:* anyone
   with the URL sees internal ops. *Decision:* exclude from the export, or accept (it's unlinked + noindex).
   *DoD:* `/ops` returns 404 in `out/`, OR founder signs off on leaving it. **I did not remove it — founder call.**
2. **`/preview/june20` publicly reachable + stale** — internal review build serving June-20 "settlement pending"
   copy. *Decision:* delete/exclude. *DoD:* not in `out/`. **I did not remove it — founder call.**

## YELLOW summary (before broad launch)
- Settlement debt (WC 6d, UFC frozen) — needs committed official scores; do not fabricate.
- Automation secrets — add the 4 GH Actions secrets to make the site self-refresh/settle/deploy.
- Results-system duplication; `/simulate`≡`/games` + other dup URLs; UFC launch scope + `-internal-` file naming.
- `/mlb/board` · `/mlb/power` · `/projections` lack the liveness banner (land on 07-11).

## GREEN summary
The 6 hub routes + `/sports` (fixed) + all product/results/trust pages are honest for today. No stale-as-live on
any *current* route (verified: zero "Live today" in the built export). No forbidden claims rendered. No money
risk, no `data/internal` leak.

## Overall verdict (blunt)
**Servable today, not broad-launch-ready.** The site is honest and safe for a soft/limited audience right now.
Before broad public traffic: (1) resolve the two RED internal-surface exposures, (2) turn on automation secrets,
(3) work down the settlement debt honestly, (4) tidy the duplicate/UFC/results surfaces. None of (2)-(4) is a
correctness/safety risk — they're completeness/polish. Only (1) is a true "don't send traffic yet" blocker, and
it's a 2-line export-exclusion once the founder decides.
