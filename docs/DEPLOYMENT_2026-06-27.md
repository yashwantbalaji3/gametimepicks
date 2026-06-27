# Production Deployment — June 27, 2026

**Status: DEPLOYED + VERIFIED LIVE.** Production (`gametime-picks.vercel.app`, deployed from `main` @ `15310c6c`) is showing the June 27 products.

## What shipped
- Merged `automation-health-gate` (June-26 settled + June-27 products + 20 hardening commits) with `origin/main` (which had 2 overnight nightly-settle commits — **legacy NBA parlay-grading data only, disjoint from the money path**). Clean merge, no conflicts, money preserved.
- Pushed to `main` → Vercel deployed. `main` and `automation-health-gate` are in sync at `15310c6c`.

## Production verification (independently confirmed against the live site)
| Check | Result |
|---|---|
| 5 pages return 200 (/ /bank-builder /picks /mr-dub /methodology) | ✅ |
| Bank Builder = **June-27 Lane B** (Croatia/Ghana, Colombia/Portugal); no June-26 legs active | ✅ |
| Moonshot / WC Specials / Homer Nukes sections present | ✅ |
| Homer Nukes shows **June-27 players** (Contreras); June-26 players (Alvarez/Schwarber) gone | ✅ |
| Mr Dub bankroll **$19,965.40** · crown **$20,465.40** | ✅ |
| `/today` + `/picks` reference June 27 | ✅ |
| No `$8,228` regression; no stale current money | ✅ |
| Production smoke test | ✅ 9/9 |

## Money integrity (all gates green, pre-deploy on the merged state)
- bankroll **$19,965.40** · crown **$20,465.40** · record **15-5** · profit **$19,865.40** · drawdown **$500**.
- verify-money-integrity ✓ · forensic "MATHEMATICALLY PERFECT" ✓ · health-check HEALTHY (19 checks) ✓.
- 1486/1486 tests · tsc clean · production build clean.
- June 26 fully settled (official); June 27 generated from live odds; freshness sweep clean (only the June-25 historical calendar cell legitimately shows $20,065.40).

## Rollback (if ever needed)
`docs/RECOVERY_RUNBOOK.md` + tag `known-good-2026-06-27`. Vercel keeps every deployment — promote the prior good one in the dashboard, then `git revert` the bad commit on `main`.

## Remaining issues (documented — need owner decisions / out of safe-autonomous scope)
- **P0-1 (settlement of non-FT games — AET/PEN/cancelled):** unsafe to automate. `fetch_official_soccer` emits the extra-time-inclusive `goals` score, not the 90′ `score.fulltime` that match-result/totals/BTTS settle on. Needs owner-confirmed per-market rules + test data. Silent-freeze risk is mitigated (a failed settlement emits a heartbeat). **This is the last true week-long-autonomy blocker.**
- **Player props:** 288 live WC player-prop projections are available but the product intentionally gates them (team-model only) — enable-or-keep-gated is an owner call.
- **Homer Nukes settlement:** grading logic exists (`mlb-settlement.ts`) but no wired runner; June-26 Homer ($20 paper) is unsettled (does not affect canonical bankroll).
- **P0-5 UI banner:** gate-level stale detection is done; a user-visible "stale slate" banner is deferred (UI frozen).
- **P1-9 / lock TTL / OFFICIAL-bundle validation:** lower-priority hardening; in progress.
- **Autonomous cron:** the daily lifecycle is hardened + dormant; activation needs the GitHub secrets per `docs/AUTONOMOUS_OPS_ACTIVATION.md`.

## Tonight
June 27 games kick off ~21:00Z (5 PM ET). Settle after they're final:
`OFFICIAL= bash scripts/settle_soccer_day.sh --date 2026-06-27 --apply` (official-gated, idempotent, money-gated).
