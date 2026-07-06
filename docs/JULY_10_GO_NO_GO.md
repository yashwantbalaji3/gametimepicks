# July 10 Soft Launch — Go / No-Go

*Classification of everything between now and launch. **Hard blocker** = must be green to launch.
**Should-fix** = fix before launch if time allows, not a blocker. **Post-launch** = deliberately deferred.
**Owner action** = only Yash can do it. Updated 2026-07-06 (pre-launch hardening pass).*

## A. Hard blockers (must be GREEN to launch)
| Item | Status | Evidence |
|---|---|---|
| Money gates green (integrity · forensic · health · idempotence) | ✅ | 17-14 · $19,065.40 · forensic PERFECT · health 19/0 · md5 `7a15360b` |
| tsc · full tests · build | ✅ | tsc clean · tests green · build 228 pages |
| Production smoke 9/9 | ✅ | verified each deploy |
| No fabricated odds/scores/props/assets/hit-rates | ✅ | enforced by no-fabrication rules + tests |
| Canonical money only via official settlement | ✅ | every non-settlement script md5-guarded |
| No stale active cards / completed-as-pregame | ✅ | client FreshnessBadge re-derives; started games excluded |
| No active Homer Nukes | ✅ | retired route + registry |
| Responsible copy (no guarantee / real-money language) | ✅ | copy sweep clean; /methodology banned-tout guard green |
| No undefined / NaN / broken images across routes | ✅ | render-audit clean on all routes |

## B. Should-fix before launch (not blockers)
| Item | Status | Note |
|---|---|---|
| Owner secrets set (activates scheduled automation) | ⏳ **owner** | see below — until set, daily ops are run manually (safe) |
| 2–3 consecutive fresh, gate-green days | ⏳ | run the nightly loop daily through launch |
| Credit-floor guard live in refresh | ✅ | fail-closed default 5,000, `ODDS_CREDIT_FLOOR` override |
| MLB positioned as the post-WC focus | ✅ | /mlb live; README + methodology reflect it |
| Every route carries the disclaimer / responsible-use note | ✅ | verify in the day-of sweep |

## C. Owner actions (only Yash — see docs/OWNER_ACTIONS.md)
| Secret | Unlocks | Status |
|---|---|---|
| `VERCEL_DEPLOY_HOOK_URL` | `daily-rebuild.yml` auto-redeploy | ⏳ set in GitHub Secrets |
| `ODDS_API_KEY` | all real-odds refresh + the credit-floor check | ⏳ (present locally; add to GitHub Secrets for CI) |
| `API_FOOTBALL_KEY` | official WC settlement + lineups | ⏳ (present locally; add to GitHub Secrets for CI) |

## D. Post-launch (deliberately deferred)
- **LADDER_V2 money settlement** — stays preview-only until partial-cash-out settlement is built + gate-proven (ADR-0006).
- **Model weight tuning** — sample too small; no changes until justified by settled evidence.
- **Admin write-actions** (approve/refresh/deploy from `/ops`) — need auth or CI-only execution.
- **/results pagination · token unification · team/player drilldowns** — nice-to-haves.
- **MLB team logos + player avatars on Top 10** — WC flags shipped first.

## E. The daily loop that keeps it launch-ready
Run through launch (see `docs/DAILY_CLAUDE_RUNBOOK.md`): settle the finished slate (official, dry-run →
hand-verify → apply) → refresh the next slate → **operator approves** a fresh Bank Builder card → all gates
→ deploy → smoke 9/9 → confirm `/ops` "Next action" is clean. Money movement + card approval stay manual by
design.

## Go / No-Go call
**GO** for a soft launch once section A is green (it is) and the owner secrets in section C are set so the
daily automation runs hands-free. Until the secrets are set, launch is still **GO** with the daily loop run
manually — nothing in section A depends on the secrets. Sections B/D are non-blocking.
