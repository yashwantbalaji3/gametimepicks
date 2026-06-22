# Resume Bank Builder + Moonshot — Cross-Slate (June 21 + June 22)

**Time:** Sunday June 21 2026, ~7:30 PM ET. **Branch:** `resume-bank-builder-moonshot-cross-slate-june21` (off `360625a` / #551).
**Policy:** approved broader criteria — place active, higher-volatility paper cards; cross-slate (June 21 + June 22) allowed; real odds-backed pre-event legs only.

## Source-of-truth gate (verified before placing)
bankroll **$10,176.17** · open exposure **$0** · record **8-2** · crown **$10,376.17** untouched → **PASS**.

## Game status at placement (API-Football, ~7:30 PM ET)
Spain 4-0 FT · Belgium 0-0 FT · Tunisia 0-4 Japan FT · Uruguay 2-1 Cape Verde **HT (live)** → all unusable.
Only remaining June 21 pre-event game: **New Zealand vs Egypt (9 PM)**. June 22 (all pre-event): Argentina/Austria, France/Iraq, Norway/Senegal, Jordan/Algeria. June 22 odds + player props pulled live (Odds API ··2a97, API-Football ··c7fa).

## Placed cards (all real, pre-event, settlement-supported)

| lane | legs | dates | combined | stake | projected | label |
|---|---|---|---|---|---|---|
| **Lane A Step 3** | Egypt ML (−175) + Algeria ML (−182) | Jun 21 + Jun 22 | +143 | $601.56 | $1,464.71 | Cross-slate · June 21 + June 22 |
| **Lane B restart** | Argentina ML (−210) + France/Iraq Under 3.5 (−114) | Jun 22 | +177 | $100 | $277.11 | June 22 (next slate) |
| **Moonshot** | NZ/Egypt BTTS No (−148) + Norway ML (+123) + Argentina Over 2.5 (−124) + Jordan/Algeria Under 2.5 (−117) | Jun 21 + Jun 22 | +1152 | $25 | $312.99 | Cross-slate · June 21 + June 22 |

All carry the public note **"Approved broader criteria · higher-volatility paper card · settlement-supported."** Loss history preserved: Lane B's June 19 lost run moved into `priorLane` (keeps 1W/2L); Moonshot's old June 19 808 card moved to `priorRun`.

## Mr. Dub (rebuilt)

| field | before | after | reason |
|---|---|---|---|
| bankroll | $10,176.17 | **$10,176.17** | pending cards don't realize until settlement |
| open exposure (core) | $0 | **$200** | Lane A + Lane B $100 seeds at risk |
| total exposure | $0 | **$225** | core $200 + Moonshot $25 |
| record | 8-2-0-0 | **8-2-0-2** | 2 pending (Lane A Step 3 + Lane B Step 1) |
| Moonshot | stopped | **active**, $25 exposure | restart placed |
| crown | $10,376.17 | **$10,376.17** | untouched |

## Build fixes (placement-schema)
Two placement fields were required by the renderers and added: each placed step needs `payout` (= projected return; the ladder view reads it as `actualReturn`), and the Moonshot ladder steps need per-step `stake`/`targetReturn`/`requiredMultiple` economics (the card renders `usd(step.stake)→usd(step.targetReturn)` for every step). Without them `next build` threw `toLocaleString` on undefined.

## Verification
1201/1201 tests pass (13 specs reconciled to the active cross-slate state by a focused pass; protected-crown, bankroll, no-phantom-stop, gap-day assertions kept). `tsc` clean · `next build` clean. Audits: no banned public copy in changes; `.env` gitignored + not staged; crown + results dirs untouched. Browser QA desktop + mobile: Bank Builder shows active Lane A/B + Moonshot with cross-slate / June-22 labels, $1,464 projected; Mr.Dub $10,176.17 / $200 / 8-2-0-2; no finished game appears as an active leg; no console errors; no mobile overflow.

## Honest limitation (carried from the status audit, not fixed here)
The public **World Cup Specials / coverage matrix / "Pregame slate" badge** are still the ~8 AM June 21 snapshot and remain stale (they show today's finished games as pre-event). That is blocker B1 from `june21-current-status-blocker-audit.md` and is a separate settle+refresh task. This PR only resumes the Bank Builder / Moonshot lanes.

## Next settlement task
After the games settle: settle Lane A (Egypt + Algeria), Lane B (Argentina + France/Iraq Under 3.5), and the Moonshot (4 legs) from official results; refresh the June 21 Specials/coverage to current; then roll forward to the June 22 slate.
