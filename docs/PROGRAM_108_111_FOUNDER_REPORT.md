# Program 108-111 Founder Report — Locked the Day, Caught a Silent Data-Loss Bug

**2026-08-03, ~11:15 ET · Verdict: AUG_3_PARTIAL_BUT_CURRENT.** 7 of 8 games covered, 211
predictions frozen and provably pregame, the base board locked against any further rewrite, and
deployment monitoring that no longer cries wolf. One game's books never posted, and that stays
honestly uncovered.

## The most important thing that happened

Declaring the base-board cutover required computing a row-identity digest — and it came back
**211 rows but only 206 identities**. They weren't duplicates. They were *different players*
(Tena vs Nunez; Herrera vs Caballero vs Fermin; Pena vs Gimenez vs Sanchez) whose `playerId` and
`player` are both null in production, so my identity scheme collapsed them onto the literal
`"team"`.

Had that shipped into the patch path, an official addition for a different player at the same
market and line would have been **refused as a duplicate and silently dropped** — a legitimate
prediction disappearing with no error. Fixed, and pinned with the real colliding rows as the
regression. No synthetic fixture had caught it; the cutover ritual did.

## What shipped

- **Base immutability cutover.** Aug 3's board is frozen at sha256 `d2e81ca3…`, 211 rows,
  identity digest pinned. The guard catches a same-count row *swap*, not just a count change —
  mutation-proven, with the fixture restored byte-identically.
- **Event-level coverage classification.** The old rule was all-or-nothing: one started game
  froze the whole slate. Now each event is judged independently, so a started 6:40 game can't
  block an 8:05 game from legitimate coverage. It emits the *minimal* paid-request set — today
  exactly 1 of 8 events, so seven covered games are never re-queried.
- **Bot-challenge aware verification.** Yesterday's "403" scare was Vercel's bot mitigation
  tripped by my own polling. Verification now classifies six distinct states with a trust order
  (metadata > build-info > browser > curl). Critically, a challenge can never *mask* staleness:
  old SHA + challenge is still `STALE`, mutation-proven. Nothing bypasses Vercel's protection.
- **Per-event population freeze** with the exact 211-row manifest settlement must grade.

## What I chose not to ship, and why

**The official-addition writer.** `generate_mlb_board.py` has no single-event scoping — no code
path anywhere produces rows for one event, and producing one runs the projection framework, not
just an odds fetch. Building it today meant new code in the *paid* path, reaching into the
projection pipeline this program forbids altering, deployed to an *unattended* workflow hours
before it fires. That is precisely how the last two incidents happened. The classification layer
captures most of the safety value at none of the risk, and the writer now has an exact
four-step specification.

## Two honest gaps

1. **The 09:30 refresh never ran.** GitHub's cron didn't fire. The watchdog correctly stayed
   silent — its job is recovering a *missing* board, and a current board existed. Net effect: no
   coverage refresh today, so LAD @ CHC stayed uncovered. **Nothing currently recovers a missed
   refresh when the board merely exists.** That's the top item for next cycle, and it's the same
   underlying need as the writer.
2. **LAD @ CHC has zero rows.** Books never posted to the provider. That is a no-market
   decision — not a loss, not a gap to paper over, and it must never enter a settled denominator.

## Tonight and tomorrow

Settlement stays owned by `nightly-settle` (01:30/03:30 ET). Its acceptance assertions are
written down, including the **second independent proof** of the contract-persistence fix — after
which that defect downgrades to a monitored invariant. Aug 4 preflight is green: credits 19,455
with ~5× headroom, no stuck locks, schedule source healthy.

## Verification

Suite **3,639 tests / 0 failures** (+19 today). Protected money byte-exact (19-14 ·
$19,065.40). Duplicate Vercel project still frozen at 07-31T17:16Z. `vp/` untouched.
**Credits spent this program: 0.**

Your queue is unchanged and still non-blocking: analytics store + env vars, Vercel email
toggles, the Aug 7 duplicate review, and the billing screenshot.

**Single most important next autonomous checkpoint:** the Aug 4 overnight settlement — it grades
exactly the 211 frozen rows and delivers the second contract-persistence proof.
