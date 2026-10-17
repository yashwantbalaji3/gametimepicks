# Run sheet: Sat 10-17 → Mon 10-19 (to the Tuesday launch review)

**Rule: nothing merges without explicit founder approval.** Each merge waits until the previous one is deployed (≈ 5–10 min). Before every merge, re-check its exact head and CI.

## Sat 10-17 (now → night)
| When (ET) | Action | Owner | Evidence / pass condition |
|---|---|---|---|
| ASAP | **#1122** (`a7fbba5ce1`) | Founder approves; engineering merges and verifies | `main` CI green; Production serves the merge; **next settle run HEALTHY and publishes** (10-16 voids, 0 losses); forecast-ledger commit succeeds; heartbeat not "fail" |
| After #1122 serves | **#1118** (`46b23a4035`) | same | Home and `/today` NFL line reads EVENT_UPCOMING today |
| Any time | **#1124** (`7d86c48951`) | same | The next receipts-only or Model Lab-only commit **builds** (Vercel status "completed", not "Ignored") |
| Gap between settle runs | **#1101** (`22b0ac73bd`) | same | `verify_1101.py <merge> --runs`: about 380 restored, no stamp-only past-dated file committed |
| Outside :25–:45 past the hour (lineup refresh) | **#1088** (`e2dd976085`) | same | `verify_1088.py <merge> --runs`: suppressed runs carry only run records; lineup changes publish |
| Evening (optional) | HTML/UX trio #1117 → #1119 → #1120 | same | Package checklist (§ Post-merge acceptance); no internal codes on `/`, `/today`, `/nfl`, `/results/*` |
| UFC card tonight | UAT D-07 (UFC) | read-only | No P0: correct bout states, no fabricated results, VOID/withdrawn handled |

## Sun 10-18: NFL acceptance (no merges 12:30Z Sun → 01:00Z Mon)
| UTC | ET | Action |
|---|---|---|
| ~13:45Z | 9:45 AM | `node docs/live/capture/check-live.mjs ~/gtp-evidence/live-v2-sun-1018/captures` (HOU vs JAX live: expect LIVE with player-stat rows > 0) |
| ~17:15Z | 1:15 PM | Same check (NO @ NYG) |
| ~20:40Z | 4:40 PM | Same check (BUF @ LV) |
| After the last final | evening | `report.mjs` on the captures: lifecycle, ESPN agreement, envelope player stats, missing ≠ 0, frozen hash stable |
| Mon morning (ET) | — | `git-watch.mjs`: first CANONICAL prop settlement, and the time Production first served it |

Also on Sunday, the PRODUCTION-READ-ONLY UAT items (search, mobile nav, error states, Ask state).

## Mon 10-19
| ET | Action |
|---|---|
| 07:00–08:30 | **Rollback dry run** (founder runs the Vercel steps up to Confirm and presses Cancel; `docs/launch/decisions/ROLLBACK_REHEARSAL.md`). Avoid the ~08:00 data chain |
| Morning | Finish the UAT; confirm 10-18 NFL settlement is served; confirm `main` CI is green |
| By 17:00 | **Go/no-go review** against `LAUNCH_READINESS_MATRIX_2026-10-20.md` |

**Mandatory for CONDITIONAL GO:**
- Privacy/Terms (F-1);
- Supabase tiers A–C (F-2);
- the Ask cap or Ask off (F-3), plus #1121;
- the rollback dry run (F-4);
- #1122 and #1118 deployed and verified;
- no P0 in the UFC or NFL windows.

## Tue 10-20 morning
- After MNF: the NFL line on Home and `/today` names the next window and **never** says forecasts are unpublished (#1118's acceptance).
