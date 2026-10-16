# Live Hub acceptance report — SEA @ DEN · ESPN 401872995 · Thu 2026-10-15 8:15 PM ET

**Result:** DEN 17, SEA 14 (overtime). The ESPN final was observed at 03:38Z.
**Report stage:** game phase complete. **Settlement (check 9) is pending.** The capture keeps watching (every 30 min, until settled and served, at the latest 10-17 02:00Z).
**Method:** read-only capture (`~/gtp-evidence/live-v2-401872995/captures/`, a pass every 5 min from 23:15Z). Analysis used the V2 replay (#1108), `acceptance-eval.py` and screenshot review. The capture process and its evidence were never modified.
**Live Hub V2 stays unpublished.** This game is one of the windows the promotion rule requires; the others are NFL Sunday 10/18 and one MLB postseason game.

## Totals
- 52 passes, 312 requests: **0 non-200, 0 bot-challenged**.
- 72 screenshots at 390 and 1440 px: **0 horizontal overflow, 0 broken images**.

**V2 replay of every recorded gateway envelope against ESPN's summary:**
- **0 disagreements, 0 lags**;
- 0 gateway refusals; 0 passes without usable ESPN truth;
- 3 clock-drift passes, informational: the gateway caches and ESPN is fetched at a different moment;
- 1 pass where ESPN's summary omitted period and clock mid-OT, so the period was unverified.

## Checks
| # | Check | Evidence | Verdict |
|---|---|---|---|
| 1 | Forecast frozen before kickoff | Frozen forecast hash, board hash and receipt set identical across all **40 post-kickoff passes**. 14 receipt revisions, **none stamped ≥ 00:15Z**. The game page reads "Forecast frozen at Oct 15, 8:09 PM ET" (6 min before kickoff) | **PASS** |
| 2 | Kickoff transition | Pass 00:12:07Z: PRE / scheduled. Pass 00:17:11Z: gateway LIVE Q1 14:56, ESPN IN_PROGRESS Q1 14:56. No "Live" before ESPN. The 5-min pass interval bounds the transition to ≤ 5 min, so ≤ 120 s cannot be shown at this resolution | **PASS** (5-min resolution) |
| 3 | Score | Every in-play pass matched ESPN (0 score disagreements); no score shown pregame | **PASS** |
| 4 | Quarter / clock | Quarter matched on every verified pass; "Halftime", "End of 4th", "7:58 - OT" passed through; final shows "Final/OT" with no clock | **PASS** |
| 5 | Live player stats | ⚠ **Capture-kit bug:** the kit requested `players=true`, but the gateway enables stats only for `players=1` (what the client sends), so the recorded envelopes hold no `playerStats`. Fixed for Sunday (#1082 `96ccf62ebb`). Screenshot values matched ESPN's box at 01:34Z (Smith-Njigba 11, Harvey 31, Waddle 15) and at the final (134 / 31 / 24). "—" before a first measurement; a recorded 0 shown as 0 (Wilson: 0 rec on 1 target) | **PASS on screenshots**; envelope-level comparison not available tonight |
| 6 | Frozen vs observed | GTP pregame value beside the live/final value on every row; frozen values unchanged (check 1) | **PASS** |
| 7 | Feed delay / recovery | No delay occurred ("Updated 4s ago" mid-game) | NOT OBSERVED LIVE (V2 delayed/stale line added in #1111; production bands in `freshness.mjs`) |
| 8 | Provisional final | /live at 03:38Z: "FINAL — GRADING PENDING", chip "Final · grading pending", 14–17, no period line, no WIN/LOSS; TD row "Final status not measured · grading pending" | **PASS** |
| 9 | Canonical settlement | Settlement file not yet on main (pending at every pass) | **PENDING** |
| 10 | Pregame immutability | No receipt revision at or after kickoff; frozen at 8:09 PM ET | **PASS** (forecast-of-record resolution re-checked after settlement) |
| 11 | Mobile | 36 shots at 390 px: overflow 0, chip and score visible on the card | **PASS** (44 px links pinned in code, not measured from the capture) |
| 12 | Unsupported sports | /live: "Live tracking: NFL and MLB. NBA, Premier League and UFC are not tracked live yet" | **PASS** |
| 13–15 | Poll cadence / freshness bands / aria-live | Client-side behaviour, not observable from server-side captures. V2 board has no `aria-live` (reviewed) | NOT OBSERVED LIVE |
| 16–18 | Rails / over-under / touchdowns | Rails show line, GTP value and live marker. Anytime TD "Not tracked live · settled from the official box score" while ESPN already had a Dobbins TD | 16, 18 **PASS**; 17 not exercised (no under rows featured) |
| 19–21 | Provider failure | 0 refusals all game, so no outage occurred | NOT OBSERVED LIVE (fixture tests only) |
| 22–23 | Desktop/mobile parity, layout | Same pass, same data; 0 overflow at both widths | **PASS** (visual spot-check) |

## Findings
1. **Capture kit `players=true`** (check 5): fixed on #1082 for Sunday.
2. **Replay tool:** an ESPN summary can omit period and clock mid-play. This is now classed as unverified, not a disagreement (#1108).
3. **Cosmetic:** the game page's live panel eyebrow reads "LIVE NOW" above a "Final/OT" score. It belongs with the deferred L5 item (badge vocabulary after final) and is a post-capture fix candidate.

## Next
- **Check 9:** when the settlement lands on main and Production serves it, record the time and confirm Results, the game page and /live agree.
- **Sunday 10/18 NFL window:** second capture, with the fixed kit.
