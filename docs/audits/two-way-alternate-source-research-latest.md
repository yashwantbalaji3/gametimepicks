# Two-Way Alternate-Line Source — Research / Requirements

> Planning doc (no fetch, no network beyond what the spike already did). Written
> after the 2026-06-04 MLB shadow spike found the current provider returns
> **one-sided Over-only** alternate ladders (two-way 0/428 → de-vig blocked).
> Goal: define what a *usable* alternate-line source must provide and compare the
> realistic options.

## 1. Why this matters
The hardened v2 launch gate is built on beating the **de-vigged** market with a
multiplicity-corrected CI. De-vig requires **both** sides of a line
(`devigSide = impliedSide / (impliedOver + impliedUnder)`). The current provider
feed for MLB alternate batter props is Over-only ("N+ hits / N+ total bases"),
so the alternate rungs **cannot be de-vigged** and cannot clear the gate. A
usable source must close that gap.

## 2. Requirements for a usable alternate-line source
A source is "usable for validated alternate-line work" only if each rung has:

| Field | Why |
|-------|-----|
| paired **overOdds + underOdds** | required to de-vig two-way (the missing piece today) |
| `playerId` (or resolvable `playerName`) | join to settlement + board (today: 84% name-resolvable) |
| `gameId` / `team` / `opponent` | join + context (today: 88%) |
| `market` + `sourceMarketKey` | grading + market segmentation |
| `line` (ladder of values) | the alternate rungs |
| `sportsbook` / `provider` | provenance + de-vig consistency |
| `asOf` timestamp | freshness / line-move auditing |
| grading stat mapping | settle vs the existing `actual` final stat |

The ONLY field the current spike lacks is the **paired Under** (the rest resolve
adequately). Everything else (grading off `actual`, playerId/gameId resolution,
de-vig math) is already built and tested in `app/src/lib/alternate-lines.ts`.

## 3. Option comparison

| Option | Two-way? | De-viggable? | Gradable? | Launch-gate eligible? | Cost/risk |
|--------|:--------:|:------------:|:---------:|:---------------------:|-----------|
| **Current one-sided Over ladders** (today) | ❌ | ❌ | ✅ | ❌ | already fetched (10 cr) |
| **Two-way alternate source** (paired O/U) | ✅ | ✅ | ✅ | ✅ (if it exists) | unknown — needs research + paid probe |
| **Display-only ladder** (no edge claim) | ❌ | n/a | ✅ | n/a (not a validated edge) | low; UX-only decision |
| **Raw-implied calibration** (one-sided) | ❌ | ❌ (raw only) | ✅ | ❌ (biased baseline) | low; explicitly weaker |

## 4. Where a two-way source might come from (to investigate — NOT fetched)
- **Other books in the same provider:** some sportsbooks publish paired
  alternate Over/Under at matching points for select markets. Worth a *targeted*
  probe (different `bookmakers=` set) — but a paid call, so **approval-gated**.
- **Different market keys:** a few props expose `_under_alternate` or symmetric
  ladders; MLB batter hits/TB did not in this spike. Unverified for other books.
- **Main line two-way + alternate one-sided blend:** de-vig the *main* line
  two-way (already on the board) and treat alternate rungs as one-sided
  extensions — but the extension rungs still aren't independently de-vigged, so
  this does not make alternates launch-eligible; it only supports a display
  ladder anchored on the de-vigged main line.

## 5. Recommendation (honest)
- **Do not pursue launch validation of one-sided alternates** — they can't clear
  the de-vig gate.
- **Before spending more credits**, decide the goal: (a) a *validated edge*
  needs a genuine **two-way** alternate source (research first; a probe is
  approval-gated and may also return one-sided), or (b) a **display-only ladder**
  (no edge claim, neutral copy) which needs no de-vig and no further validation —
  just a product/UX decision.
- The existing helper + grading plan already support either path once a source
  decision is made. No code is blocked on modeling; it's blocked on **data
  shape** (paired odds) and **product intent**.

*Planning only. No fetch, no public change, no fabrication.*
