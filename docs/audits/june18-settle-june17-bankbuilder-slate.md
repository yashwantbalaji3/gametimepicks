# Audit — Settle June 17 Active Dual Bank Builder + slate

_Branch `june18-settle-june17-bankbuilder-slate` off main `ec25d94`. Settled 2026-06-18 ~04:21Z._

## 1. Settlement time & sources
- Settled at real time **2026-06-18T04:21Z** (all June 17 games Final).
- Official sources: **MLB Stats API** box scores (pitcher strikeouts); **ESPN FIFA World Cup**
  scoreboard FT scores (90-minute results). No screenshots, no user claims, no fabrication.
- Reproducible script: `pipeline/settle_active_dual_bank_builder.py` re-fetches official data and
  grades — it writes only the NON-protected engine artifact
  `app/public/data/methodology/launch/dual-bank-builder-active.json`.

## 2–10. Active Dual Bank Builder result — `dual-bank-builder-2026-06-17`
| Lane | Leg | Official | Result |
|---|---|---|---|
| **A · survival** | Colombia or Draw (double_chance) | Uzbekistan **1–3** Colombia FT | **WON** |
| **A** | JR Ritchie Strikeouts **Over** 3.5 | **4 K** (5.0 IP) | **WON** (4 > 3.5) |
| **B · diversified** | Ghana or Draw (double_chance) | Ghana **1–0** Panama FT | **WON** |
| **B** | Javier Assad Strikeouts **Under** 4.5 | **1 K** (5.2 IP) | **WON** (1 < 4.5) |

- **Lane A: WON → advanced** (combined −119, $100 → $184.03). Step 1 cleared; Step 2 coming soon.
- **Lane B: WON → advanced** (combined +117, $100 → $217.00). Step 1 cleared; Step 2 coming soon.
- **Both lanes won** — each advances to Step 2 (not auto-created; shown "coming soon").

## 11. World Cup final scores used (official, ESPN FIFA World Cup, FT)
Uzbekistan 1–3 Colombia · Ghana 1–0 Panama · England 4–2 Croatia · Portugal 1–1 DR Congo ·
Austria 3–1 Jordan.

## 12. MLB official stats used
JR Ritchie 4 K / 5.0 IP (game 824913, Braves doubleheader G2 — a no-pitching-line roster appearance
in G1 was correctly skipped); Javier Assad 1 K / 5.2 IP (game 824668, Cubs).

## 13–16. Broad slate settlement
- **MLB**: `settle_mlb_results --date 2026-06-17` → 626 leans, **574 decisive (295 W / 256 L)**,
  hit rate 51.4%, 3 unavailable. `grade_parlays --date 2026-06-17` → **1 W · 17 L** graded slips.
  (The cumulative `mlb/results` re-export was reverted to avoid 23k-line log churn; the focused
  06-17 comparison report + graded parlays are kept.)
- **World Cup team markets/props**: the repo's API-Football settle returned **0 finals** for the 2026
  WC (provider has no 2026 fixture finals) → broad WC team-market/prop grading is **needs_review**
  via that pipeline. The Bank Builder's WC legs ARE officially settled (ESPN FT scores above).

## 17. Pending / void / needs_review
- No DNP/void in the active run (both pitchers appeared; Ritchie's G1 roster line was not the start).
- 3 MLB leans "unavailable" (no official line); broad WC team markets needs_review (API-Football
  provider gap).

## 18–19. Protected data + history
- **Protected `public/data/bank-builder/*` untouched.** Completed-ladder proof ($100→$10,376.17, 5–0)
  and the archived closed test ladder preserved. The active run lives in the engine namespace.

## 20–24. Verification
tsc clean · app tests pass · settlement grading pytest (over/under/double-chance/lane-result) pass ·
build OK · copy/secret/protected-data audits clean · browser QA mobile (SETTLED header, 2/2 lanes
won/advanced, official result lines per leg, Step 1 cleared ✓, no overflow, no console errors).

## No June 18 generation
No June 18 slate was generated (explicitly out of scope).

## 26. Next recommended task
Surface the MLB 06-17 results on `/results` via a focused (non-cumulative) export; connect an official
World Cup finals source the repo pipeline can read (ESPN, or `--scores`) to settle the broad WC team
markets/props/cards; then generate the June 18 slate.
