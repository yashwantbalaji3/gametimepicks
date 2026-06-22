# E2E Polish — Premium Leg Detail, Same-Game Ideas, Specials Hit/Miss

**Time:** Sunday June 21 2026, ~9:00 PM ET. **Branch:** `e2e-bank-builder-world-cup-specials-polish` (off `cf9caba` / #552).
**Game status at build:** Spain 4-0 FT, Belgium 0-0 FT, Uruguay 2-2 FT, Tunisia 0-4 Japan FT; **NZ/Egypt kicked off 9 PM (live by build)**; June 22 all pre-event.

## What shipped

### Active leg verification + enrichment (every active BB/Moonshot leg)
Each active leg now carries: `matchup`, `homeTeam`/`awayTeam`, `flagHome`/`flagAway`, `marketLabel`, `kickoffEt`, `eventDate`, `odds`, `provider` (The Odds API), `settlementSource` (API-Football official 90-min result), `rationale`, `riskNote`, `currentGameStatus`, and a composed `displaySelection` so a leg never shows a bare selection without its matchup.

| card | leg | displayed as | kickoff ET | verified |
|---|---|---|---|---|
| Lane A Step 3 | Egypt ML | New Zealand vs Egypt — Moneyline (90′): Egypt (−175) | 9:00 PM ET Jun 21 | ✅ real market |
| Lane A Step 3 | **Algeria ML** | **Jordan vs Algeria** — Moneyline (90′): Algeria (−182) | 11:00 PM ET Jun 22 | ✅ real ML, settlement-supported (cross-slate, higher-volatility) |
| Lane B | Argentina ML | Argentina vs Austria — Moneyline (90′): Argentina (−210) | 1:00 PM ET Jun 22 | ✅ |
| Lane B | **Under 3.5** | **France vs Iraq — Total Goals: Under 3.5** (−114) | 5:00 PM ET Jun 22 | ✅ confirmed France vs Iraq total goals Under 3.5 |
| Moonshot | NZ/Egypt BTTS No, Norway ML, Argentina Over 2.5, Jordan/Algeria Under 2.5 | each w/ matchup + kickoff ET + odds | — | ✅ |

### Premium UI (rendered the enriched data)
- **Bank Builder** (`dual-ladder-board.tsx`): betting-slip-style active leg rows — flag · matchup · market+selection · kickoff ET · odds · settlement-supported note; tasteful CROSS-SLATE / Jun-date / "Approved broader criteria" badges. Reads the active artifact directly (server-only, fail-closed, joined by `legId`) since the enriched fields don't survive the shared loader transform.
- **Moonshot** (`moonshot-lane-card.tsx`): leg rows show matchup + selection + kickoff ET; distinct purple/lava identity + high-volatility + cross-slate label.
- **Mr. Dub**: bankroll $10,176.17 · core exposure $200 · moonshot $25 · total $225 · record 8-2-0-2 (pending) — unchanged; active cards carry the same detailed legs.

### World Cup Specials — hit/miss/pending (official settlement)
Settled all 5 cards leg-by-leg from official results (4 settled fixtures via API-Football: 152 player-stat rows + final scores; NZ/Egypt legs PENDING). Every leg shows **HIT ✓ / MISS ✗ / PENDING ◷** + reason (e.g. "Belgium 0-0 Iran", "Fabian Ruiz: 0", "not started"); each card shows a **WON/LOST/PENDING** pill + a hit/miss/pending tally. **All 5 cards = LOST** (Belgium 0-0 + Uruguay 2-2 draws killed the MLs; most player props missed). Header reads "World Cup Specials — Jun 21 (settled)"; settled cards are framed "shown for review, not a pre-event pick."

### Egypt vs New Zealand — Same-Game Ideas
New section on `/world-cup` + `/today`. Built 5 ideas from the real matchId-40 markets (Egypt ML −175, Under 2.5 −139, Egypt or Draw −770, BTTS No −148, Egypt DNB −500), **individual leg odds only — no fabricated combined/SGP price**, with the note "Same-game idea only — combined pricing requires sportsbook SGP pricing." Kickoff-gated: NZ/Egypt started by build time, so it renders the honest **archived** state ("This match has started — same-game ideas are archived for review, not new pre-event cards").

### Slate freshness
`slate-status-bar.tsx` now derives a 3-way label from the current slate's WC kickoffs vs build time: graded → "Slate settled"; most games kicked off → **"Slate in progress"**; none started → "Pregame slate". At build (late Jun 21, all 4 games done) it correctly shows **"Slate in progress"**, fixing the stale "Pregame slate."

## Verification
1208/1208 tests pass (+7 new: leg-detail completeness, Algeria→Jordan/Algeria, France/Iraq Under 3.5 label, Specials hit/miss/pending, card status, same-game no-fabricated-odds, slate label). `tsc` clean · `next build` clean. Audits: no banned public copy in changes; `.env` gitignored + not staged; leg-completeness PASS; crown + results dirs untouched; no fabricated odds/SGP pricing. Browser QA desktop + mobile (375px): leg detail + Specials markers + same-game section render; no console errors; no horizontal overflow.

## Bankroll integrity
Bankroll $10,176.17 unchanged · core $200 + moonshot $25 = $225 exposure · 8-2-0-2 · crown $10,376.17 untouched. No active Bank Builder/Moonshot card settled (every card still has a June 22 pending leg), so no settlement/bankroll change — correct.

## Honest limitations
- "Premium" here = richer, self-explanatory betting-slip leg rows + status/hit-miss badges + clearer headers, not a full ground-up visual redesign (a larger follow-up).
- The coverage matrix is still the 8 AM June 21 snapshot (the Specials themselves are now settled with hit/miss).
- Egypt/NZ same-game shows individual leg odds only (no SGP combined pricing — the platform has no SGP correlation pricer; fabricating it is forbidden).
- Lane A/B/Moonshot remain PENDING (June 22 legs unsettled).

## Next settlement task
After June 22 games: settle Lane A (Egypt + Algeria), Lane B (Argentina + France/Iraq Under 3.5), Moonshot (4 legs) from official results → update Mr. Dub; refresh the coverage matrix; roll forward to the next slate.
