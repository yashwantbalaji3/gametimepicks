# June 18 — Replace Lane B soccer leg + Bank Builder leg detail drawers + visual sweep

_Branch `june18-replace-lane-b-soccer-leg-detail-drawers` off main `76fac33e` (#516)._

## Phase 1 — replacement window
- **Current time at check: 2026-06-18 12:10 ET (16:10 UTC).**
- Lane B soccer leg (BTTS No, Switzerland–Bosnia) kicks off **19:00 UTC (3 PM ET)** → **NOT started** → replacement window OPEN.
- Note: Lane A's Czech ML kicked off 16:00 UTC (already started) — Lane A is locked and was preserved untouched (owner said don't touch it).

## Phases 2–4 — Lane B soccer leg replaced
Candidates (not-started WC team markets, exclude BTTS + ultra-short, paired with the existing Pete Alonso +102):
| candidate | match | market | odds | survival | +Alonso → | kickoff |
|---|---|---|---|---|---|---|
| **Switzerland ML** (chosen) | Switzerland–Bosnia | moneyline_90 | −205 | 75 | **$652.16** | 19:00 UTC |
| Mexico DNB | Mexico–South Korea | draw_no_bet | −240 | 75 | $620.98 | 01:00 UTC (rejected: later, lower payout) |
| Mexico ML | Mexico–South Korea | moneyline_90 | +104 | 69 | $894.21 | 01:00 UTC (rejected: 47% model = coin-flip, overshoots band) |

- **Old Lane B soccer leg:** "Both teams to score: No" (−157). **New:** **Switzerland moneyline (−205)** — a clean team-side favorite (owner wanted a team leg, −200/−300 range, not ultra-short).
- **Lane B combined +231 → +201 · $217.00 → $718.27 → $652.16** (in the $600–700 band; owner accepted a slightly lower payout for a stronger qualitative leg). Survival 80 → 78 (Switzerland 75 + Alonso).
- Pete Alonso H+R+RBI Over 1.5 kept (still pre-event, 20:11 UTC). Lane A + Step 1 + protected history untouched.
- Surgical script `app/scripts/replace-lane-b-soccer.mjs` — refuses if the Lane B soccer leg has kicked off; writes only the engine artifact.

## Phase 5 — Bank Builder leg detail drawers + real last-5
- New `pipeline/attach_bank_builder_last5.py` pulls **official MLB Stats API game logs** and attaches real last-5 prop history per MLB leg (games before the slate date — pre-event, no leakage; "data unavailable" when logs are missing — never fabricated):
  - JR Ritchie K Over 3.5: [5, 4, 4, 2, 4] → **4/5 (80%)**
  - Matt Olson H+R+RBI Over 1.5: [4, 1, 1, 2, 3] → **3/5 (60%)**
  - Javier Assad K Under 4.5: [5, 5, 1, 1, 1] → **3/5 (60%)**
  - Pete Alonso H+R+RBI Over 1.5: [2, 0, 1, 6, 4] → **3/5 (60%)**
- `last5` surfaced through `ui-loader` (`Last5`/`Last5Game` types; carried on committed-artifact legs). Each Bank Builder leg drawer (`bank-builder-preview-panel`) now shows: model %, implied %, edge, survival, risk, quality, data-quality, top +/- factors, missing/stale flags, a **last-5 game-by-game grid** (green=hit / red=miss vs the exact line + hit-rate %), and the settlement rule (MLB DNP→void; WC 90-minute regulation / limited-data note).

## Phase 6–7 — visual identity
- `legAvatar` resolves player portraits (playerId headshot), country flags (FlagBadge), team logos (TeamLogo), clean monogram fallback — applied across Bank Builder legs, `/parlays` cards, `/build` rows, `/world-cup` rows. The new Switzerland leg renders the 🇨🇭 flag; MLB legs render player headshots.

## Bank Builder page cleanup (owner's de-dup request)
- "🏆 Road to $10K completed" was rendered in **two boxes** (the hero + a second SECTION-3 crown box). Removed the duplicate SECTION-3 completed-crown box — the crown is now stated **once** (the hero). Also removed the standalone `BankBuilderMeter` (it duplicated the completed crown + the active ladder's own per-lane meters).

## Guards
- No fabrication — odds from The Odds API; last-5 from official MLB Stats API; never invented when logs are missing.
- Protected `public/data/bank-builder/*` untouched; Step 1 settlement preserved.
- tsc clean · **1017 app tests** (replacement + last-5 cases added) · build OK · 4 settlement pytest pass · copy/secret/protected audits clean.

## Pipeline ordering note
The last-5 attach runs AFTER leg selection — re-running `build-step2`/`replace-lane-b-soccer` requires re-running `attach_bank_builder_last5` to restore `last5`.
