# Emergency Cleanup — June 20 Same-Day-Only Public State

**Date/time:** Saturday June 20 2026, ~7:57 PM ET (23:57 UTC)
**Branch:** `emergency-june20-same-day-only-cleanup` (off `main` @ `715ce3a2`)
**Trigger:** Live production (PR #548) surfaced **future-slate (June 21+) games** on public
Bank Builder / Moonshot active+candidate surfaces. The site must show **June 20 only**.

## Root cause

In PR #548 the only "clean" multi-game Bank Builder cards available were built from the **next
slate (June 21)** — Japan ML (06-21), Egypt ML (06-22), Belgium/Uruguay ML (06-21), plus June 21
player scorers in the Moonshot. Those were placed as Lane A Step 3 (active) and surfaced as Lane B /
Moonshot candidates, which (a) violated the same-day-only rule and (b) drove $100 of phantom open
exposure in Mr. Dub from an invalid future card. Placing a future-slate card was the mistake; this
branch reverses it.

## Slate reality at cleanup time (verified, API-Football schedule)

| game | kickoff (UTC) | ET | June 20 slate? | status @ 7:57pm ET |
|---|---|---|---|---|
| Netherlands v Sweden | 17:00Z | 1:00pm ET 6/20 | ✅ June 20 | FINAL (5-1) |
| Germany v Ivory Coast | 20:00Z | 4:00pm ET 6/20 | ✅ June 20 | FINAL (0-1) |
| Ecuador v Curaçao | 00:00Z 6/21 | 8:00pm ET 6/20 | ✅ June 20 | pre-event (kickoff imminent) |
| Tunisia v Japan | 04:00Z 6/21 | 12:00am ET 6/21 | ❌ June 21 | future slate |
| Spain v Saudi Arabia | 16:00Z 6/21 | 12:00pm ET 6/21 | ❌ June 21 | future slate |
| Belgium v Iran | 19:00Z 6/21 | 3:00pm ET 6/21 | ❌ June 21 | future slate |
| Uruguay v Cape Verde | 22:00Z 6/21 | 6:00pm ET 6/21 | ❌ June 21 | future slate |
| New Zealand v Egypt | 01:00Z 6/22 | 9:00pm ET 6/21 | ❌ June 21 | future slate |

**Only Ecuador/Curaçao remains pre-event on the June 20 slate** — a single game, so no qualified
multi-game (Bank Builder / Moonshot / multi-game Special) card can be built. Honest empty/awaiting
states are the correct June-20-only result, not a forced card.

## Future-date legs removed

| future leg | surface | artifact | date | action |
|---|---|---|---|---|
| Japan ML | Lane A Step 3 (was active) | dual-bank-builder-active.json | 06-21 | removed → Step 3 awaiting |
| Egypt ML | Lane A Step 3 (was active) | dual-bank-builder-active.json | 06-22 | removed → Step 3 awaiting |
| Belgium ML | Lane B restart candidate | dual-bank-builder-active.json | 06-21 | removed → awaiting reason |
| Uruguay ML | Lane B restart candidate | dual-bank-builder-active.json | 06-21 | removed → awaiting reason |
| Belgium/Japan/Egypt ML + V. Muñoz (Spain) scorer + De Ketelaere (Belgium) scorer | Moonshot restart candidate | moonshot-lane/active.json | 06-21/22 | removed → awaiting reason |

## Surface contamination table

| surface | before | future-date? | June-20-only expected | fix |
|---|---|---|---|---|
| `/bank-builder` Lane A Step 3 | active: Japan+Egypt ML | **yes** | awaiting a clean June 20 card | reverted to `awaiting` + reason |
| `/bank-builder` Lane B candidate | Belgium+Uruguay ML | **yes** | awaiting clean June 20 restart | removed → honest reason |
| `/bank-builder#moonshot` candidate | June 21 5-leg longshot | **yes** | awaiting June 20 candidate | removed → honest reason |
| Mr. Dub exposure | $100 (invalid card) | n/a | $0 | recomputed → $0 |
| `/today` WC Specials | empty | no | empty (one game pre-event) | honest empty (no June 21 roll) |
| World Cup Specials snapshot | 0 cards, date 06-20 | no | 0 cards | unchanged (already honest) |
| coverage matrix | BB row "1 active card", grandTotal 43 | no June 21 | BB 0 active, grandTotal 42 | patched → reconciled |
| `/picks` WC matrix | 12 single-game / 0 multi-game | no | same (single-game on /world-cup) | reconciled; see limitation |
| protected crown ($10,376.17, 5-0) | immutable | no | unchanged | untouched (verified) |

## Mr. Dub correction (placement removal is NOT a settlement)

| field | before | after | reason |
|---|---|---|---|
| currentBankroll | $9,876.17 | $9,876.17 | placement was unrealized — removal has no bankroll impact |
| openExposure | $100 | **$0** | the only open card was the invalid future-slate Step 3 |
| record | 8-5-0-**1** (pending) | 8-5-0-**0** | no open card → no pending |
| Lane A | active (Step 3 placed) | advanced (Step 3 awaiting) | future-slate card removed; $601.56 rides as awaiting |
| Lane B | candidate (June 21) | stopped, awaiting clean June 20 restart | future candidate removed |
| Moonshot | candidate (June 21) | stopped, awaiting June 20 candidate | future candidate removed |
| activeCards / awaitingCards | 1 / 0 | 0 / 1 | candidate-only counts no exposure |
| bankrollHealth | Balanced / 80 | No open exposure / 100 | nothing at risk |

Ledger correction `future_slate_card_removed_pre_event`: not a win/loss; no bankroll impact; exposure
$100 → $0 only. The 8-5 record / $9,876.17 bankroll (from the prior, user-approved priorLane removal
in #548) is retained — this branch only reverses the future-date placement.

## Clock-rollover coherence fix (display slate date)

This session ran past midnight ET, so the real wall clock advanced to June 21 while the latest (and
only) generated slate is June 20 — no June 21 slate was generated (June-20-only by design). The
global status-bar chip and the `/today`, `/picks`, `/world-cup` pages derived their displayed "today"
from `currentEtDate()` (the wall clock), so they showed "Today · Jun 21" and date labels like
"Suggested parlays · Sunday, June 21" while all content was June 20 — incoherent.

Fix (no faked clock, consistent with freshness.ts's documented "latest available slate" rule):
- Added `currentSlateDate()` to `ui-loader.ts` — the date of the slate the product is presenting
  (latest MLB board / WC projections = June 20). Distinct from `currentEtDate()` (real clock), which
  is left untouched for freshness/settlement.
- `slate-status-bar.tsx` chip now shows **"Latest slate · Jun 20"** when the slate is behind the wall
  clock (and "Today · <date>" when an overnight slate matches the real date).
- `/today`, `/picks`, `/world-cup` frame their display date on `currentSlateDate() ?? currentEtDate()`,
  so labels, the WC freshness gates, and "Today's World Cup fixtures" all resolve to June 20
  (NED/SWE, GER/CIV, ECU/CW). `/parlays` already used `loadTodaySlate()` (slate date).

Result: no literal "June 21" date appears in rendered text on any public surface; "Every federation
in the field" still lists all 48 tournament teams (reference grid, not picks).

## Known limitation

The coverage matrix's `World Cup Games = 12` is a **generation-time diagnostic** (cards that passed
the gates when the slate was pre-event earlier today). The live `/world-cup` and `/picks` views apply
started/final gating at render time, so with the June 20 slate now complete they show 0 active
pre-event WC cards with the honest "Why are some buckets empty?" explainer — matrix-vs-visible
reconcile. No future-date (June 21) card appears in either the matrix or the live views. The
June-20-evening *live* demo (with Ecuador/Curaçao pre-event) is no longer reproducible without faking
the system clock, as real time has moved to June 21; the site honestly presents the completed June 20
slate as the latest available.
