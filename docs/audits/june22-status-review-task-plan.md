# June 22 — Status Review + Task Plan (audit, no deploy)

**Time:** Monday June 22 2026, ~12:55 PM ET. **Production commit:** `4e64a7b2` (two nightly auto-settle crons past #553/`606136f`; they graded historical MLB/optimizer data only — did not touch the WC active cards or Mr.Dub). **Scope:** read-only audit + task plan. No P0 found → no production changes.

## Verified state

| area | finding | status |
|---|---|---|
| Routes (both domains, 12) | all 200 | ✅ |
| Mr. Dub (live) | bankroll **$10,176.17** · core exp **$200** · moonshot **$25** · total **$225** · record **8-2-0-2** · crown **$10,376.17** | ✅ correct |
| Lane A | active, Step 3 pending — Egypt ML (NZ/Egypt, Jun 21) + Algeria ML (Jordan/Algeria, Jun 22) | ✅ card pending |
| Lane B | active, Step 1 pending — Argentina ML + France/Iraq Under 3.5 (both Jun 22) | ✅ card pending |
| Moonshot | active — NZ/Egypt BTTS No + Norway ML + Argentina Over 2.5 + Jordan/Algeria Under 2.5 | ⚠️ one leg now lost (see below) |
| WC Specials | all 5 cards **LOST** (settled-review) | ✅ card-level correct |
| Egypt/NZ same-game | **archived** (game started) | ✅ |
| Crown / contamination | untouched / none | ✅ |

## Official game status (API-Football)
- **New Zealand 1-3 Egypt — FT** (Jun 21). June 22: Argentina/Austria, France/Iraq, Norway/Senegal, Jordan/Algeria all **NS** (Argentina kicks 1:00 PM ET — at/just past kickoff now).

## NZ/Egypt official leg outcomes (1-3 Egypt; player stats pulled)
- Egypt ML → **HIT** (Egypt won) · NZ/Egypt BTTS No → **MISS** (both scored) · NZ/Egypt Under 2.5 → **MISS** (4 goals)
- Omar Marmoush Anytime Scorer → **MISS** (0 goals) · Sarpreet Singh SOT → **MISS** (0) · Haissem Hassan Assists → **MISS** (0)

## Blockers (no P0)
| id | sev | surface | evidence | fix |
|---|---|---|---|---|
| B1 | **P1** | public board day-stale | projections/Specials/coverage/MLB board + slate badge are all the **June 21** slate; it's now June 22 with 4 new WC games | roll the public board to June 22 (settle June 21 + generate June 22 pre-event slate) |
| B2 | **P1** | NZ/Egypt legs show pending/scheduled though game is FINAL | Specials: 6 NZ/Egypt legs all "pending"; Lane A Egypt + Moonshot NZ/Egypt BTTS No `currentGameStatus: scheduled`, no settlementStatus | mark NZ/Egypt legs final (Egypt HIT, others MISS) — leg-level only, no card settlement |
| B3 | **P1** | Moonshot has a definitively-lost leg | NZ/Egypt BTTS No MISS → 4-leg parlay can't win; still shown active/pending | per the "don't settle until all legs final" rule, mark leg MISS now; settle the card as LOST after the June 22 legs play (or when you approve early dead-parlay settlement) |
| B4 | **P2** | MLB/Mixed stale | latest MLB board `2026-06-21` (generated 8 AM Jun 21); no June 22 board | refresh June 22 MLB if a slate exists, else mark data-pending |
| B5 | **P2** | intraday automation dormant | nightly settle cron runs; lineup-aware intraday refresh needs repo secrets | operator adds `ODDS_API_KEY`+`API_FOOTBALL_KEY` as GitHub repo secrets |
| B6 | **P3** | UFC | own track, not featured | verify/mark data-pending later |

**Money is correct everywhere** (bankroll/exposure/record/crown). The P1s are freshness, not trust-critical errors.

## Lane / Moonshot tasks
- **Lane A** — Egypt ML is now a leg HIT (Egypt won 3-1); **Algeria ML pending** (Jordan/Algeria 11 PM ET Jun 22). Card stays **pending**; settle only after Algeria is final. Bankroll unchanged until then.
- **Lane B** — both legs Jun 22 pending (Argentina ML 1 PM — at kickoff; France/Iraq Under 3.5 5 PM). Do **not** alter post-kickoff. Settle after both final.
- **Moonshot** — NZ/Egypt BTTS No **missed** → the 4-leg parlay can no longer win. Mark the leg MISS now; full settlement (−$25, moonshot record 0-1, total exposure → $200) after the June 22 legs play (or on approval to settle the dead parlay early). Core bankroll unaffected.

## Prioritized June 22 task list
| pri | task | why | should do today |
|---|---|---|---|
| P1 | **Roll public board to June 22** — settle June 21 (NZ/Egypt + active-card legs), generate June 22 pre-event projections/Specials/coverage/suggested-parlays for the games still pre-event (France 5 PM, Norway 8 PM, Jordan/Algeria 11 PM — Argentina already starting) | the public board is a day stale | **yes** — first task |
| P1 | **Mark NZ/Egypt legs final** (Specials + Lane A Egypt HIT + Moonshot NZ/Egypt MISS) | finished game shown as pending | yes (can batch with the board roll) |
| P1 | **Monitor + settle June 22 cards** after each game finals — Argentina/Austria, France/Iraq (Lane B), Jordan/Algeria (Lane A Algeria), Norway/Senegal (Moonshot). Settle a card only when ALL its legs are final | active-card settlement | yes, through the evening |
| P2 | Refresh June 22 MLB/Mixed (or mark data-pending) | stale board | yes if MLB slate exists |
| P2 | Add `ODDS_API_KEY`+`API_FOOTBALL_KEY` as GitHub repo secrets + enable intraday refresh | stops daily staleness recurring | operator |
| P3 | Deeper premium UI polish; UFC freshness | backlog | no |

## Production decision
**Sound to show now** — bankroll/exposure/record/crown all correct, no contamination, all routes 200, Specials correctly settled-review, same-game archived. Caveat: the public slate is **June 21 (a day old)** and the NZ/Egypt legs read pending though the game is final — freshness items to fix with the June 22 board roll, not money errors.
